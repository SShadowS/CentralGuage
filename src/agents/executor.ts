/**
 * Agent Task Executor
 *
 * Executes benchmark tasks using the Claude Agent SDK V1 query() API.
 * Agents run autonomously until success or resource limits are reached.
 */

import { join } from "@std/path";
import { ensureDir } from "@std/fs";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { ContainerError } from "../errors.ts";
import { Logger } from "../logger/mod.ts";

const log = Logger.create("agent");
import type { TaskManifest } from "../tasks/interfaces.ts";
import type {
  AgentExecutionOptions,
  AgentExecutionResult,
  DetailedFailureReason,
  ParsedTaskResult,
  ResolvedAgentConfig,
  SystemPromptConfig,
  TerminationReason,
  ToolCallRecord,
} from "./types.ts";
import {
  analyzeSandboxOutput,
  buildFailureReason,
  buildFailureReasonFromAnalysis,
} from "./failure-parser.ts";
import { CostTracker } from "./cost-tracker.ts";
import { BcContainerProvider } from "../container/bc-container-provider.ts";
import type { TestResult } from "../container/types.ts";
import { WindowsSandboxProvider } from "../sandbox/windows-provider.ts";
import type { Sandbox } from "../sandbox/types.ts";
import { buildUniversalPromptSync, preloadTemplate } from "./prompt-builder.ts";
import { McpServerManager } from "./mcp-manager.ts";

// =============================================================================
// SDK Types - Extended for our usage
// =============================================================================

/**
 * SDK Assistant message with content blocks
 */
interface SDKAssistantMessage {
  type: "assistant";
  uuid: string;
  session_id: string;
  message: {
    role: "assistant";
    content: ContentBlock[];
  };
  parent_tool_use_id: string | null;
}

/**
 * SDK User message with tool results
 */
interface SDKUserMessage {
  type: "user";
  uuid: string;
  session_id: string;
  message: {
    role: "user";
    content: ContentBlock[];
  };
}

/**
 * SDK Result message at end of session
 */
interface SDKResultMessage {
  type: "result";
  subtype:
    | "success"
    | "error_max_turns"
    | "error_during_execution"
    | "error_max_budget_usd";
  uuid: string;
  session_id: string;
  duration_ms: number;
  is_error: boolean;
  num_turns: number;
  result?: string;
  total_cost_usd: number;
}

/**
 * API message with optional usage field
 */
interface ApiMessageWithUsage {
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

/**
 * Content block types from assistant messages
 */
type ContentBlock =
  | { type: "text"; text: string }
  | ToolUseBlock
  | ToolResultBlock;

/**
 * Tool use block in assistant message
 */
interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

/**
 * Tool result block
 */
interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string | unknown[];
}

// =============================================================================
// Executor Implementation
// =============================================================================

/**
 * Query options for the SDK
 */
interface QueryOptions {
  model: string;
  cwd: string;
  allowedTools?: string[];
  maxTurns: number;
  mcpServers?: Record<
    string,
    { command: string; args?: string[]; env?: Record<string, string> }
  >;
  systemPrompt: string | {
    type: "preset";
    preset: "claude_code";
    append?: string;
  };
  permissionMode: "bypassPermissions";
  allowDangerouslySkipPermissions: boolean;
}

// =============================================================================
// Result Parsing Helpers
// =============================================================================

/**
 * Extracted compile/test results from tool response
 */
interface PartialParsedResult {
  compileSuccess?: boolean;
  testsPassed?: number;
  testsTotal?: number;
}

/**
 * Extract structured data from a tool result JSON string.
 * Handles both al_compile and al_verify_task responses.
 */
function extractResultFromToolResult(content: string): PartialParsedResult {
  try {
    const json = JSON.parse(content);
    if (json.passed !== undefined && json.totalTests !== undefined) {
      // al_verify_task response format
      return {
        testsPassed: json.passed,
        testsTotal: json.totalTests,
      };
    }
    if (json.message?.toLowerCase().includes("compilation")) {
      // al_compile response format
      return {
        compileSuccess: json.success,
      };
    }
  } catch {
    // Not JSON, check for patterns in text
    const lower = content.toLowerCase();
    if (lower.includes("compilation successful")) {
      return { compileSuccess: true };
    }
    // Check for "all N tests passed" pattern first (extracts count)
    const allTestsMatch = content.match(/all\s+(\d+)\s+tests?\s+passed/i);
    if (allTestsMatch && allTestsMatch[1]) {
      const count = parseInt(allTestsMatch[1], 10);
      return { testsPassed: count, testsTotal: count };
    }
    // Check for "N/N passed" pattern
    const passedMatch = content.match(/(\d+)\/(\d+)\s+passed/i);
    if (passedMatch && passedMatch[1] && passedMatch[2]) {
      return {
        testsPassed: parseInt(passedMatch[1], 10),
        testsTotal: parseInt(passedMatch[2], 10),
      };
    }
  }
  return {};
}

/**
 * Format a parsed result into the standardized plain-text format.
 */
function formatTaskResult(
  compileSuccess: boolean,
  testsPassed?: number,
  testsTotal?: number,
): string {
  const lines: string[] = [];
  lines.push(`Compile: ${compileSuccess ? "Success" : "Failed"}`);
  if (testsTotal !== undefined) {
    lines.push(`Tests: ${testsPassed ?? 0}/${testsTotal}`);
  }
  const pass = testsTotal !== undefined
    ? testsPassed === testsTotal
    : compileSuccess;
  lines.push(`Result: ${pass ? "Pass" : "Fail"}`);
  return lines.join("\n");
}

/**
 * Result of execution preparation
 */
interface ExecutionPrepResult {
  taskWorkingDir: string;
  queryOptions: QueryOptions;
  tracker: CostTracker;
  executionId: string;
}

export class AgentTaskExecutor {
  private containerProvider: BcContainerProvider;
  private mcpManager: McpServerManager;

  /** Track pending tool calls with start times for duration calculation */
  private pendingToolCalls = new Map<
    string,
    { name: string; startTime: number }
  >();

  /** Aggregate tool timing data for summary */
  private toolTimings = new Map<string, { calls: number; totalMs: number }>();

  constructor() {
    // No configuration needed - MCP servers come from agent config
    this.containerProvider = new BcContainerProvider();
    this.mcpManager = new McpServerManager();

    // Configure container credentials from environment
    const containerName = Deno.env.get("CENTRALGAUGE_CONTAINER_NAME") ||
      "Cronus27";
    const username = Deno.env.get("CENTRALGAUGE_CONTAINER_USERNAME") || "admin";
    const password = Deno.env.get("CENTRALGAUGE_CONTAINER_PASSWORD") || "admin";
    this.containerProvider.setCredentials(containerName, {
      username,
      password,
    });
  }

  /**
   * Reset tool timing data for a new execution
   */
  private resetToolTimings(): void {
    this.pendingToolCalls.clear();
    this.toolTimings.clear();
  }

  /**
   * Log tool timing summary (called at end of execution)
   */
  private logToolTimingSummary(): void {
    if (this.toolTimings.size === 0) return;

    const entries = Array.from(this.toolTimings.entries())
      .sort((a, b) => b[1].totalMs - a[1].totalMs);

    const timings: Record<string, string> = {};
    for (const [name, data] of entries) {
      const avgMs = Math.round(data.totalMs / data.calls);
      const totalSec = (data.totalMs / 1000).toFixed(1);
      if (data.calls === 1) {
        timings[name] = `${totalSec}s`;
      } else {
        timings[name] =
          `${data.calls} calls, avg ${avgMs}ms, total ${totalSec}s`;
      }
    }
    log.debug("Tool timing summary", timings);
  }

  /**
   * Process user message to capture tool result timings and detect success.
   * Returns success status and structured result data from tool responses.
   */
  private processUserMessage(
    userMsg: SDKUserMessage,
    requiresTests: boolean,
    debug?: boolean,
  ): { success: boolean; parsedResult?: ParsedTaskResult } {
    let success = false;
    let compileSuccess = false;
    let testsPassed: number | undefined;
    let testsTotal: number | undefined;

    for (const block of userMsg.message.content) {
      if (block.type === "tool_result") {
        const resultBlock = block as ToolResultBlock;

        // Calculate and log tool duration
        const pending = this.pendingToolCalls.get(resultBlock.tool_use_id);
        if (pending) {
          const durationMs = Date.now() - pending.startTime;
          this.pendingToolCalls.delete(resultBlock.tool_use_id);

          // Aggregate timing data
          const existing = this.toolTimings.get(pending.name) || {
            calls: 0,
            totalMs: 0,
          };
          existing.calls++;
          existing.totalMs += durationMs;
          this.toolTimings.set(pending.name, existing);

          if (debug) {
            const durationSec = (durationMs / 1000).toFixed(1);
            log.debug(`Tool result: ${pending.name}`, {
              duration: `${durationSec}s`,
            });
          }
        }

        // Extract structured data from tool result
        const resultText = typeof resultBlock.content === "string"
          ? resultBlock.content
          : JSON.stringify(resultBlock.content);

        const parsed = extractResultFromToolResult(resultText);
        if (parsed.compileSuccess !== undefined) {
          compileSuccess = parsed.compileSuccess;
        }
        if (parsed.testsPassed !== undefined) {
          testsPassed = parsed.testsPassed;
        }
        if (parsed.testsTotal !== undefined) {
          testsTotal = parsed.testsTotal;
        }

        // Determine success based on task type
        const resultLower = resultText.toLowerCase();
        if (requiresTests) {
          if (resultLower.includes("all tests passed")) {
            success = true;
          }
        } else {
          if (resultLower.includes("compilation successful")) {
            success = true;
          }
        }
      }
    }

    // Build parsed result if we have compile data
    const parsedResult: ParsedTaskResult = {
      compileSuccess,
      result: success ? "pass" : "fail",
      formatted: formatTaskResult(compileSuccess, testsPassed, testsTotal),
    };
    if (testsPassed !== undefined) {
      parsedResult.testsPassed = testsPassed;
    }
    if (testsTotal !== undefined) {
      parsedResult.testsTotal = testsTotal;
    }

    return { success, parsedResult };
  }

  /**
   * Prepare execution environment and build query options
   */
  private async prepareExecution(
    agentConfig: ResolvedAgentConfig,
    task: TaskManifest,
    options: AgentExecutionOptions,
  ): Promise<ExecutionPrepResult> {
    const executionId = this.generateExecutionId();
    const tracker = new CostTracker(agentConfig.model);

    // Prepare isolated working directory for this task
    const baseWorkingDir = agentConfig.workingDir || options.projectDir;
    const taskWorkingDir = join(
      baseWorkingDir,
      ".tasks",
      `${task.id}-${executionId}`,
    );
    await ensureDir(taskWorkingDir);

    // Copy CLAUDE.md and .claude directory if they exist in base dir
    await this.copyAgentContext(baseWorkingDir, taskWorkingDir);

    // Resolve system prompt
    const systemPrompt = this.resolveSystemPrompt(agentConfig.systemPrompt);

    // Build MCP server configuration
    const mcpServers = McpServerManager.buildServersConfig(agentConfig);

    // Create SDK query options
    const queryOptions: QueryOptions = {
      model: agentConfig.model,
      cwd: taskWorkingDir,
      allowedTools: agentConfig.allowedTools,
      maxTurns: agentConfig.maxTurns,
      ...(mcpServers && { mcpServers }),
      systemPrompt,
      permissionMode: "bypassPermissions" as const,
      allowDangerouslySkipPermissions: true,
    };

    return { taskWorkingDir, queryOptions, tracker, executionId };
  }

  /**
   * Log query configuration for debugging
   */
  private logQueryConfig(queryOptions: QueryOptions): void {
    const mcpServers: Record<string, string> = {};
    if (queryOptions.mcpServers) {
      for (const [name, cfg] of Object.entries(queryOptions.mcpServers)) {
        mcpServers[name] = `${cfg.command} ${cfg.args?.join(" ") ?? ""}`;
      }
    }
    log.debug("Query config", {
      model: queryOptions.model,
      cwd: queryOptions.cwd,
      maxTurns: queryOptions.maxTurns,
      allowedTools: queryOptions.allowedTools?.join(", ") ?? "all",
      mcpServers: Object.keys(mcpServers).join(", ") || "none",
    });
  }

  /**
   * Check if termination conditions are met
   */
  private checkTerminationConditions(
    tracker: CostTracker,
    agentConfig: ResolvedAgentConfig,
  ): TerminationReason | null {
    if (tracker.turns >= agentConfig.maxTurns) {
      return "max_turns";
    }
    if (agentConfig.maxTokens && tracker.totalTokens >= agentConfig.maxTokens) {
      return "max_tokens";
    }
    if (
      agentConfig.limits?.maxCompileAttempts &&
      tracker.isCompileLimitReached(agentConfig.limits.maxCompileAttempts)
    ) {
      return "max_compile_attempts";
    }
    return null;
  }

  /**
   * Build the execution result object
   */
  private buildExecutionResult(
    task: TaskManifest,
    agentConfig: ResolvedAgentConfig,
    executionId: string,
    success: boolean,
    tracker: CostTracker,
    terminationReason: TerminationReason,
    startTime: number,
    finalCode?: string,
    testResult?: TestResult,
    resultSummary?: ParsedTaskResult,
    failureDetails?: DetailedFailureReason,
  ): AgentExecutionResult {
    const result: AgentExecutionResult = {
      taskId: task.id,
      agentId: agentConfig.id,
      executionId,
      success,
      turns: tracker.getTurns(),
      metrics: tracker.getMetrics(),
      terminationReason,
      duration: Date.now() - startTime,
      executedAt: new Date(),
    };
    if (finalCode !== undefined) {
      result.finalCode = finalCode;
    }
    if (testResult !== undefined) {
      result.testResult = testResult;
    }
    if (resultSummary !== undefined) {
      result.resultSummary = resultSummary;
    }
    if (failureDetails !== undefined) {
      result.failureDetails = failureDetails;
    }
    return result;
  }

  /**
   * Execute a task with an agent configuration
   */
  async execute(
    agentConfig: ResolvedAgentConfig,
    task: TaskManifest,
    options: AgentExecutionOptions,
  ): Promise<AgentExecutionResult> {
    // Check if sandbox mode should be used
    if (this.shouldUseSandbox(agentConfig, options)) {
      log.info("Running in sandbox mode");
      return this.executeSandboxed(agentConfig, task, options);
    }

    const startTime = Date.now();
    this.resetToolTimings();

    // Preload universal template if configured
    if (agentConfig.promptTemplate === "universal") {
      try {
        this.universalTemplate = await preloadTemplate();
      } catch (e) {
        log.warn(`Failed to load universal template, using legacy: ${e}`);
      }
    }

    // Phase 1: Setup execution environment
    const { taskWorkingDir, queryOptions, tracker, executionId } = await this
      .prepareExecution(agentConfig, task, options);

    if (options.debug) {
      this.logQueryConfig(queryOptions);
    }

    // Track parsed result across try/catch
    let latestParsedResult: ParsedTaskResult | undefined;

    try {
      const prompt = this.buildTaskPrompt(task, taskWorkingDir, agentConfig);
      tracker.startTurn();

      const q = query({ prompt, options: queryOptions });

      let success = false;
      let finalCode: string | undefined;
      let terminationReason: TerminationReason = "error";
      const requiresTests = !!task.expected?.testApp;

      // Phase 2: Process agent messages
      for await (const msg of q) {
        if (options.debug) {
          this.logMessage(msg);
        }

        if (msg.type === "assistant") {
          this.processAssistantMessage(
            msg as SDKAssistantMessage,
            tracker,
            options.debug,
          );
          tracker.endTurn();
          tracker.startTurn();
        }

        // Process user messages to capture tool result timings and detect success
        if (msg.type === "user") {
          const userMsg = msg as SDKUserMessage;
          const userResult = this.processUserMessage(
            userMsg,
            requiresTests,
            options.debug,
          );
          // Track the latest parsed result
          if (userResult.parsedResult) {
            latestParsedResult = userResult.parsedResult;
          }
          if (userResult.success) {
            success = true;
            terminationReason = "success";
            finalCode = await this.extractFinalCode(taskWorkingDir);
          }
        }

        if (msg.type === "result") {
          const resultMsg = msg as SDKResultMessage;
          // Don't trust SDK success - we determine success based on tool results
          // (compilation successful or all tests passed, depending on requiresTests)
          if (resultMsg.subtype === "error_max_turns") {
            terminationReason = "max_turns";
          } else if (!success) {
            // Agent finished but we didn't detect success from tool results
            terminationReason = "error";
          }
          break;
        }

        const termination = this.checkTerminationConditions(
          tracker,
          agentConfig,
        );
        if (termination) {
          terminationReason = termination;
          break;
        }
        if (success) break;
      }

      tracker.endTurn();

      // Note: When requiresTests=true, the agent runs tests via al_verify_task
      // and success is only set when "All tests passed" is returned.
      // No post-loop verification needed as tests run during agent execution.

      if (options.debug) {
        this.logToolTimingSummary();
      }

      return this.buildExecutionResult(
        task,
        agentConfig,
        executionId,
        success,
        tracker,
        terminationReason,
        startTime,
        finalCode,
        undefined, // testResult - captured during agent execution
        latestParsedResult,
      );
    } catch (error) {
      tracker.endTurn();
      if (options.debug) {
        log.error("Executor error", { error: String(error) });
        this.logToolTimingSummary();
      }
      return this.buildExecutionResult(
        task,
        agentConfig,
        executionId,
        false,
        tracker,
        "error",
        startTime,
        undefined, // finalCode
        undefined, // testResult
        latestParsedResult,
      );
    }
  }

  /**
   * Log debug message information
   */
  private logMessage(msg: { type: string; subtype?: string }): void {
    const subtype = (msg as { subtype?: string }).subtype;
    log.debug(`Message: ${msg.type}${subtype ? ` (${subtype})` : ""}`);

    if (msg.type === "system" && subtype === "init") {
      const sysMsg = msg as {
        tools?: string[];
        mcp_servers?: Array<{ name: string; status: string }>;
      };
      if (sysMsg.tools) {
        const mcpTools = sysMsg.tools.filter((t: string) =>
          t.startsWith("mcp__")
        );
        log.debug("Tools available", {
          total: sysMsg.tools.length,
          mcpTools: mcpTools.length > 0 ? mcpTools.join(", ") : "none",
        });
      }
      if (sysMsg.mcp_servers) {
        const serverStatus: Record<string, string> = {};
        for (const srv of sysMsg.mcp_servers) {
          serverStatus[srv.name] = srv.status;
        }
        log.debug("MCP server status", serverStatus);
      }
    }
  }

  /**
   * Process an assistant message and track tokens/tools
   * Note: Success detection is handled in processUserMessage()
   */
  private processAssistantMessage(
    assistantMsg: SDKAssistantMessage,
    tracker: CostTracker,
    debug?: boolean,
  ): void {
    if (!assistantMsg.message) {
      return;
    }

    // Extract usage from API message if available
    const usage = (assistantMsg.message as ApiMessageWithUsage).usage;
    if (usage) {
      const tokenUsage: { promptTokens?: number; completionTokens?: number } =
        {};
      if (usage.input_tokens !== undefined && usage.input_tokens !== null) {
        tokenUsage.promptTokens = usage.input_tokens;
      }
      if (usage.output_tokens !== undefined && usage.output_tokens !== null) {
        tokenUsage.completionTokens = usage.output_tokens;
      }
      tracker.recordTokenUsage(tokenUsage);
    }

    // Process content blocks
    for (const block of assistantMsg.message.content) {
      if (block.type === "tool_use") {
        const toolBlock = block as ToolUseBlock;

        // Track tool start time for duration calculation
        this.pendingToolCalls.set(toolBlock.id, {
          name: toolBlock.name,
          startTime: Date.now(),
        });

        if (debug) {
          log.debug(`Tool call: ${toolBlock.name}`);
        }
        const toolRecord: ToolCallRecord = {
          name: toolBlock.name,
          input: toolBlock.input as Record<string, unknown>,
          duration: 0,
          success: true,
        };
        tracker.recordToolCall(toolRecord);
      }
      // Note: tool_result blocks are handled in processUserMessage()
    }
  }

  /**
   * Resolve system prompt configuration to SDK format
   */
  private resolveSystemPrompt(
    config?: SystemPromptConfig,
  ): string | { type: "preset"; preset: "claude_code"; append?: string } {
    if (!config) {
      return { type: "preset", preset: "claude_code" as const };
    }

    if (typeof config === "string") {
      return config;
    }

    // config.preset is always "claude_code" per our type definition
    const result: { type: "preset"; preset: "claude_code"; append?: string } = {
      type: "preset",
      preset: "claude_code" as const,
    };
    if (config.append) {
      result.append = config.append;
    }
    return result;
  }

  /** Cached universal template for reuse */
  private universalTemplate: string | null = null;

  /**
   * Build task prompt using either universal or legacy template.
   * @param task - Task manifest
   * @param workingDir - Working directory path
   * @param config - Agent configuration
   * @returns Rendered prompt string
   */
  private buildTaskPrompt(
    task: TaskManifest,
    workingDir: string,
    config: ResolvedAgentConfig,
  ): string {
    // Ensure absolute path
    const absWorkingDir = workingDir.startsWith("/") ||
        workingDir.match(/^[A-Z]:/i)
      ? workingDir
      : join(Deno.cwd(), workingDir);

    // Use universal template if configured
    if (config.promptTemplate === "universal" && this.universalTemplate) {
      return buildUniversalPromptSync(this.universalTemplate, {
        taskId: task.id,
        taskDescription: task.description,
        workspacePath: absWorkingDir,
        requiresTests: !!task.expected?.testApp,
      });
    }

    // Legacy prompt (default for backwards compatibility)
    return this.buildLegacyTaskPrompt(task, absWorkingDir, config);
  }

  /**
   * Build legacy task prompt (original implementation).
   * Uses MCP-prefixed tool names for Claude Code compatibility.
   */
  private buildLegacyTaskPrompt(
    task: TaskManifest,
    absWorkingDir: string,
    config: ResolvedAgentConfig,
  ): string {
    // Get tool name based on naming style
    const compileTool = config.toolNaming === "generic"
      ? "al_compile"
      : "mcp__al-tools__al_compile";
    const verifyTool = config.toolNaming === "generic"
      ? "al_verify_task"
      : "mcp__al-tools__al_verify_task";

    const parts: string[] = [
      `# Task: ${task.id}`,
      "",
      "## GOAL: Compile AL code successfully",
      `Your PRIMARY goal is to get 'Compilation successful' from ${compileTool}.`,
      "Creating files is just preparation - the task is NOT complete until compilation succeeds.",
      "",
      "## What to build",
      task.description,
      "",
    ];

    // Add expected output information
    if (task.expected) {
      parts.push("## Requirements");
      if (task.expected.compile) {
        parts.push("- Code must compile without errors");
      }
      if (task.expected.testApp) {
        parts.push("- All tests must pass");
      }
      parts.push("");
    }

    parts.push("## Workspace");
    parts.push(`Your workspace directory is: ${absWorkingDir}`);
    parts.push(
      "Create all files DIRECTLY in this directory, NOT in subdirectories.",
    );
    parts.push(`Example: ${absWorkingDir}\\app.json (correct)`);
    parts.push(`Example: ${absWorkingDir}\\Product.Table.al (correct)`);
    parts.push(
      `WRONG: ${absWorkingDir}\\SomeFolder\\app.json (will fail compilation)`,
    );
    parts.push("");

    parts.push("## Instructions");
    parts.push(
      "1. Write the required AL code to .al files using the Write tool",
    );
    parts.push(`   Example: Write to ${absWorkingDir}/ProductCategory.al`);
    parts.push(
      "2. Create an app.json manifest file with your app details (id, name, publisher, version, idRanges, runtime, etc.)",
    );

    // Different instructions depending on whether tests are required
    if (task.expected?.testApp) {
      // Tests required - two-phase approach for efficiency
      parts.push(
        `3. IMMEDIATELY after creating files, call the ${compileTool} tool with projectDir: "${absWorkingDir}"`,
      );
      parts.push(
        "4. If compilation fails, fix the errors and recompile until it succeeds",
      );
      parts.push(
        `5. Once compilation succeeds, call ${verifyTool} to run tests:`,
      );
      parts.push(`   - projectDir: "${absWorkingDir}"`);
      parts.push(`   - taskId: "${task.id}"`);
      parts.push(
        "6. If tests fail, read the error messages carefully, fix your code, use al_compile to verify it compiles, then run al_verify_task again",
      );
      parts.push("7. Once all tests pass, your task is complete");
      parts.push("");
      parts.push("CRITICAL: This task is NOT complete until you:");
      parts.push(`1. Call ${compileTool} and see 'Compilation successful'`);
      parts.push(`2. Call ${verifyTool} and see 'All tests passed'`);
      parts.push("");
      parts.push(
        "WARNING: Creating files is only step 1-2. You MUST call the compile and test tools.",
      );
      parts.push(
        "The task FAILS if you only create files without compiling.",
      );
    } else {
      // Compile-only - use al_compile
      parts.push(
        `3. IMMEDIATELY after creating files, call the ${compileTool} tool with projectDir: "${absWorkingDir}"`,
      );
      parts.push(
        "4. If compilation fails, read the errors, fix the code, and recompile",
      );
      parts.push("5. Once compilation succeeds, your task is complete");
      parts.push("");
      parts.push(
        `CRITICAL: This task is NOT complete until you call ${compileTool}`,
      );
      parts.push("and see 'Compilation successful' in the tool response.");
      parts.push("");
      parts.push(
        "WARNING: Creating files is only step 1-2. You MUST call the compile tool.",
      );
      parts.push(
        "The task FAILS if you only create files without compiling.",
      );
    }

    return parts.join("\n");
  }

  /**
   * Try to extract the final generated code from the working directory
   */
  private async extractFinalCode(
    workingDir: string,
  ): Promise<string | undefined> {
    try {
      // Look for the main AL file
      const possibleFiles = [
        "GeneratedCode.al",
        "Solution.al",
        "Main.al",
      ];

      for (const filename of possibleFiles) {
        const filePath = join(workingDir, filename);
        try {
          const content = await Deno.readTextFile(filePath);
          return content;
        } catch {
          // File doesn't exist, try next
        }
      }

      // If no standard file found, look for any .al file
      for await (const entry of Deno.readDir(workingDir)) {
        if (entry.isFile && entry.name.endsWith(".al")) {
          const content = await Deno.readTextFile(join(workingDir, entry.name));
          return content;
        }
      }

      return undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Generate a unique execution ID
   */
  private generateExecutionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `agent-${timestamp}-${random}`;
  }

  /**
   * Copy agent context files (CLAUDE.md, .claude/) from base to task directory
   * This preserves the agent's configuration while isolating task files
   */
  private async copyAgentContext(
    baseDir: string,
    taskDir: string,
  ): Promise<void> {
    // Copy CLAUDE.md if it exists
    const claudeMdPath = join(baseDir, "CLAUDE.md");
    try {
      const content = await Deno.readTextFile(claudeMdPath);
      await Deno.writeTextFile(join(taskDir, "CLAUDE.md"), content);
    } catch {
      // CLAUDE.md doesn't exist, skip
    }

    // Copy .claude directory if it exists
    const claudeDirPath = join(baseDir, ".claude");
    try {
      const stat = await Deno.stat(claudeDirPath);
      if (stat.isDirectory) {
        await this.copyDirectory(claudeDirPath, join(taskDir, ".claude"));
      }
    } catch {
      // .claude directory doesn't exist, skip
    }
  }

  /**
   * Recursively copy a directory
   */
  private async copyDirectory(src: string, dest: string): Promise<void> {
    await ensureDir(dest);

    for await (const entry of Deno.readDir(src)) {
      const srcPath = join(src, entry.name);
      const destPath = join(dest, entry.name);

      if (entry.isDirectory) {
        await this.copyDirectory(srcPath, destPath);
      } else if (entry.isFile) {
        const content = await Deno.readFile(srcPath);
        await Deno.writeFile(destPath, content);
      }
    }
  }

  // ===========================================================================
  // Sandbox Execution Methods
  // ===========================================================================

  private sandboxProvider?: WindowsSandboxProvider;

  /**
   * Check if sandbox mode should be used for this execution.
   */
  private shouldUseSandbox(
    agentConfig: ResolvedAgentConfig,
    options: AgentExecutionOptions,
  ): boolean {
    // CLI flag takes precedence
    if (options.sandbox !== undefined) {
      return options.sandbox;
    }
    // Otherwise check agent config
    return agentConfig.sandbox?.enabled ?? false;
  }

  /**
   * Execute a task in a sandbox container.
   * This provides full isolation from the host environment for reproducibility.
   */
  async executeSandboxed(
    agentConfig: ResolvedAgentConfig,
    task: TaskManifest,
    options: AgentExecutionOptions,
  ): Promise<AgentExecutionResult> {
    const startTime = Date.now();
    const executionId = this.generateExecutionId();
    const tracker = new CostTracker(agentConfig.model);

    const mcpPort = options.mcpHttpPort ?? 3100;
    const mcpServerUrl = `http://host.docker.internal:${mcpPort}`;
    const sandboxImage = agentConfig.sandbox?.image ??
      "centralgauge/agent-sandbox:windows-latest";

    let sandbox: Sandbox | undefined;

    // Prepare workspace directory first (needed for MCP server workspace mapping)
    const baseWorkingDir = agentConfig.workingDir || options.projectDir;
    const taskWorkingDir = join(
      baseWorkingDir,
      ".tasks",
      `${task.id}-${executionId}`,
    );

    try {
      await ensureDir(taskWorkingDir);

      // Start MCP HTTP server with workspace mapping for path translation
      // Maps container path C:\workspace to host path taskWorkingDir
      const workspaceMap = `C:\\workspace=${taskWorkingDir}`;
      await this.mcpManager.start(mcpPort, workspaceMap);

      // Initialize sandbox provider
      if (!this.sandboxProvider) {
        this.sandboxProvider = new WindowsSandboxProvider();
      }

      // Check if Windows containers are available
      const isAvailable = await this.sandboxProvider.isAvailable();
      if (!isAvailable) {
        throw new ContainerError(
          "Windows containers not available. Ensure Docker is running in Windows container mode.",
          "docker",
          "setup",
        );
      }

      // Prune stale containers from previous interrupted runs
      const pruned = await WindowsSandboxProvider.pruneStaleContainers();
      if (pruned > 0) {
        log.debug(`Cleaned up ${pruned} stale container(s)`);
      }

      // Preload universal template if configured
      if (agentConfig.promptTemplate === "universal") {
        try {
          this.universalTemplate = await preloadTemplate();
        } catch (e) {
          log.warn(`Failed to load universal template, using legacy: ${e}`);
        }
      }

      // Copy agent context
      await this.copyAgentContext(baseWorkingDir, taskWorkingDir);

      // Build the task prompt
      const prompt = this.buildTaskPrompt(task, "C:\\workspace", agentConfig);

      // Write prompt to file (avoids issues with special chars in env vars)
      const promptFile = join(taskWorkingDir, ".agent-prompt.txt");
      await Deno.writeTextFile(promptFile, prompt);

      log.info(`Creating container for task ${task.id}...`);

      // Debug: Check API key availability
      const apiKey = Deno.env.get("ANTHROPIC_API_KEY") || "";
      log.debug("API key available", {
        available: apiKey.length > 0 ? "yes" : "NO",
        length: apiKey.length,
      });

      // Create sandbox container
      // Note: Prompt is read from file instead of env var for reliability
      sandbox = await this.sandboxProvider.create({
        image: sandboxImage,
        workspaceDir: taskWorkingDir,
        mcpServerUrl,
        env: {
          ANTHROPIC_API_KEY: Deno.env.get("ANTHROPIC_API_KEY") || "",
          AGENT_PROMPT_FILE: "C:\\workspace\\.agent-prompt.txt",
          AGENT_MAX_TURNS: agentConfig.maxTurns.toString(),
          AGENT_TIMEOUT_MS: (agentConfig.limits?.timeoutMs ?? 300000)
            .toString(),
          // Claude Code requires backslashes for Windows paths at runtime
          // (Dockerfile ENV escapes backslashes incorrectly)
          CLAUDE_CODE_GIT_BASH_PATH: "C:\\Git\\bin\\bash.exe",
        },
        timeout: agentConfig.limits?.timeoutMs ?? 300000,
      });

      log.info(`Container ${sandbox.name} created`);

      // Execute Claude Code in the sandbox
      const result = await sandbox.execStream(
        ["powershell", "-File", "C:\\entrypoint.ps1"],
        (chunk, stream) => {
          // Stream output to console
          if (options.debug) {
            if (stream === "stdout") {
              Deno.stdout.writeSync(new TextEncoder().encode(chunk));
            } else {
              Deno.stderr.writeSync(new TextEncoder().encode(chunk));
            }
          }
        },
        { timeout: agentConfig.limits?.timeoutMs ?? 300000 },
      );

      // Determine success from output
      // Agent may report success in various formats:
      // - MCP tool result: "all tests passed", "compilation successful"
      // - Agent summary: "7/7 PASSED", "Compilation: **SUCCESS**", "Task Completed Successfully"
      // Note: Claude Code outputs to stderr, not stdout, so we check both streams
      const combinedOutput = result.stdout + result.stderr;

      // Debug: Log output for failed tasks to help diagnose issues
      if (result.exitCode !== 0 || result.timedOut) {
        log.warn("Container execution failed", {
          exitCode: result.exitCode,
          timedOut: result.timedOut,
        });
        log.debug("Container stdout", { output: result.stdout || "(empty)" });
        log.debug("Container stderr", { output: result.stderr || "(empty)" });
      }
      const outputLower = combinedOutput.toLowerCase();
      const requiresTests = !!task.expected?.testApp;
      let success = false;
      let terminationReason: TerminationReason = "error";

      // Common success patterns that apply to all task types
      const hasCompileSuccess =
        outputLower.includes("compilation successful") ||
        outputLower.includes("compilation: success") ||
        outputLower.includes("compilation: **success**") ||
        outputLower.includes("compilation status**: ✅") ||
        outputLower.includes("✅ compilation") ||
        outputLower.includes("✅ success") ||
        // JSON patterns from al_compile tool response
        outputLower.includes('"success":true') ||
        outputLower.includes('"success": true') ||
        // Agent summary patterns like "al_compile returning success: true"
        outputLower.includes("success: true") ||
        outputLower.includes("returning success: true");

      // Check for structured output format first (most reliable)
      // Format: "Compile: Success\nTests: X/Y\nResult: Pass" or "Compile: Success\nResult: Pass"
      const structuredResultMatch = combinedOutput.match(
        /Result:\s*(Pass|Fail)/i,
      );
      if (structuredResultMatch && structuredResultMatch[1]) {
        success = structuredResultMatch[1].toLowerCase() === "pass";
        terminationReason = success ? "success" : "error";
      } else if (requiresTests) {
        // Fallback: Check for various success patterns
        // Must verify ALL tests passed, not partial passes like "1/7 passed"
        const allPassedMatch = outputLower.match(/(\d+)\/\1 passed/); // "7/7 passed" (same number)
        const allTestsPassedPattern = /all \d+ (?:verification )?tests passed/; // "all 7 tests passed" or "all 6 verification tests passed"

        if (
          outputLower.includes("all tests passed") ||
          outputLower.includes("tests passed!") ||
          /\d+ tests passed/.test(outputLower) || // "6 tests passed", "7 verification tests passed"
          allPassedMatch !== null || // "7/7 passed" where both numbers match
          allTestsPassedPattern.test(outputLower) ||
          outputLower.includes("task completed successfully") ||
          outputLower.includes("task is now complete") ||
          // Test verification patterns
          outputLower.includes("ran successfully (0 failures)") ||
          outputLower.includes("verification: completed") ||
          // If compilation succeeded AND no test failures mentioned, consider it success
          (hasCompileSuccess && !outputLower.includes("failed"))
        ) {
          success = true;
          terminationReason = "success";
        }
      } else {
        // Compile-only task patterns
        if (
          hasCompileSuccess ||
          outputLower.includes("task completed successfully") ||
          outputLower.includes("task is now complete")
        ) {
          success = true;
          terminationReason = "success";
        }
      }

      if (result.timedOut) {
        terminationReason = "timeout";
      } else if (result.exitCode !== 0 && !success) {
        terminationReason = "error";
      }

      // Log output when no success pattern matched (helps debug why task failed)
      if (!success && result.exitCode === 0) {
        log.warn("No success pattern found in output (exit code 0)");
        const lastOutput = combinedOutput.slice(-2000);
        log.debug("Container output (last 2000 chars)", {
          output: lastOutput || "(empty)",
        });
      }

      // Extract structured result from output
      const parsedFromOutput = extractResultFromToolResult(combinedOutput);
      const compileSuccess = parsedFromOutput.compileSuccess ?? success;
      const resultSummary: ParsedTaskResult = {
        compileSuccess,
        result: success ? "pass" : "fail",
        formatted: formatTaskResult(
          compileSuccess,
          parsedFromOutput.testsPassed,
          parsedFromOutput.testsTotal,
        ),
      };
      if (parsedFromOutput.testsPassed !== undefined) {
        resultSummary.testsPassed = parsedFromOutput.testsPassed;
      }
      if (parsedFromOutput.testsTotal !== undefined) {
        resultSummary.testsTotal = parsedFromOutput.testsTotal;
      }

      // Log formatted result for easy parsing
      if (options.debug) {
        log.debug("Result summary", { formatted: resultSummary.formatted });
      }

      // Analyze sandbox output for detailed failure information
      let failureDetails: DetailedFailureReason | undefined;
      if (!success) {
        const analysis = analyzeSandboxOutput(
          result.stdout,
          result.stderr,
          result.exitCode,
          result.timedOut,
        );
        const analysisOptions: {
          exitCode?: number;
          containerName?: string;
          timeoutMs?: number;
          elapsedMs?: number;
        } = {
          exitCode: result.exitCode,
          elapsedMs: Date.now() - startTime,
        };
        if (sandbox?.name) {
          analysisOptions.containerName = sandbox.name;
        }
        if (agentConfig.limits?.timeoutMs) {
          analysisOptions.timeoutMs = agentConfig.limits.timeoutMs;
        }
        failureDetails = buildFailureReasonFromAnalysis(
          analysis,
          analysisOptions,
        );

        // Update termination reason from analysis if more specific
        if (analysis.terminationReason !== "error") {
          terminationReason = analysis.terminationReason;
        }
      }

      // Extract final code if successful
      let finalCode: string | undefined;
      if (success) {
        finalCode = await this.extractFinalCode(taskWorkingDir);
      }

      return this.buildExecutionResult(
        task,
        agentConfig,
        executionId,
        success,
        tracker,
        terminationReason,
        startTime,
        finalCode,
        undefined, // testResult
        resultSummary,
        failureDetails,
      );
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      log.error("Sandbox error", { error: errorMessage });

      // Create a failed result summary
      const errorResultSummary: ParsedTaskResult = {
        compileSuccess: false,
        result: "fail",
        formatted: formatTaskResult(false),
      };

      // Build failure details for the exception
      const failureOptions: {
        errorOutput?: string;
        containerName?: string;
      } = {
        errorOutput: errorMessage,
      };
      if (sandbox?.name) {
        failureOptions.containerName = sandbox.name;
      }
      const exceptionFailureDetails = buildFailureReason(
        "error",
        "agent_execution",
        `Sandbox execution error: ${errorMessage}`,
        failureOptions,
      );

      return this.buildExecutionResult(
        task,
        agentConfig,
        executionId,
        false,
        tracker,
        "error",
        startTime,
        undefined, // finalCode
        undefined, // testResult
        errorResultSummary,
        exceptionFailureDetails,
      );
    } finally {
      // Cleanup sandbox
      if (sandbox) {
        try {
          log.debug(`Cleaning up container ${sandbox.name}...`);
          await sandbox.destroy();
        } catch (error) {
          log.warn(`Failed to cleanup container: ${error}`);
        }
      }

      // Stop MCP server - must stop since workspace mapping is per-task
      this.mcpManager.stop();
    }
  }
}
