/**
 * Agent Task Executor
 *
 * Executes benchmark tasks using the Claude Agent SDK V1 query() API.
 * Agents run autonomously until success or resource limits are reached.
 */

import { basename, join } from "@std/path";
import { ensureDir, exists } from "@std/fs";
import * as colors from "@std/fmt/colors";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { TaskManifest } from "../tasks/interfaces.ts";
import type {
  AgentExecutionOptions,
  AgentExecutionResult,
  ResolvedAgentConfig,
  SystemPromptConfig,
  TerminationReason,
  ToolCallRecord,
} from "./types.ts";
import { CostTracker } from "./cost-tracker.ts";
import { BcContainerProvider } from "../container/bc-container-provider.ts";
import type { ALProject, TestResult } from "../container/types.ts";

// =============================================================================
// Prereq App Types and Helpers
// =============================================================================

/** Prereq app info with path and app.json content */
interface PrereqApp {
  path: string;
  appJson: Record<string, unknown>;
  compiledAppPath?: string | undefined;
}

/**
 * Extract task ID from test file path.
 * @example "tests/al/easy/CG-AL-E002.Test.al" -> "CG-AL-E002"
 */
function extractTaskIdFromTestPath(testFilePath: string): string | null {
  const fileName = basename(testFilePath);
  const match = fileName.match(/^(CG-AL-[A-Z]\d+)/);
  return match?.[1] ?? null;
}

/**
 * Extract project root from test file path.
 * Looks for "tests/al/" in the path and returns everything before it.
 */
function extractProjectRoot(testFilePath: string): string {
  // Normalize path separators
  const normalized = testFilePath.replace(/\\/g, "/");
  const testsAlIndex = normalized.indexOf("tests/al/");
  if (testsAlIndex > 0) {
    return normalized.substring(0, testsAlIndex);
  }
  // If path starts with "tests/al/" or not found, use cwd
  return Deno.cwd();
}

/**
 * Find prereq app directory for a given task ID.
 * Checks for tests/al/dependencies/{task-id}/ directory.
 */
async function findPrereqApp(
  taskId: string,
  projectRoot: string,
): Promise<PrereqApp | null> {
  const prereqDir = join(projectRoot, "tests", "al", "dependencies", taskId);

  try {
    const dirExists = await exists(prereqDir, { isDirectory: true });
    if (!dirExists) return null;

    const appJsonPath = join(prereqDir, "app.json");
    const appJsonContent = await Deno.readTextFile(appJsonPath);
    const appJson = JSON.parse(appJsonContent);

    return { path: prereqDir, appJson };
  } catch {
    return null;
  }
}

/**
 * Find prereq app by its app ID (for resolving dependency chains).
 */
async function findPrereqAppById(
  appId: string,
  projectRoot: string,
): Promise<PrereqApp | null> {
  const depsDir = join(projectRoot, "tests", "al", "dependencies");

  try {
    for await (const entry of Deno.readDir(depsDir)) {
      if (!entry.isDirectory) continue;

      const appJsonPath = join(depsDir, entry.name, "app.json");
      try {
        const content = await Deno.readTextFile(appJsonPath);
        const appJson = JSON.parse(content);
        if (appJson["id"] === appId) {
          return { path: join(depsDir, entry.name), appJson };
        }
      } catch {
        continue;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Find all prereq apps needed for a task, in dependency order.
 * Returns array with dependencies first, then the main prereq.
 */
async function findAllPrereqApps(
  taskId: string,
  projectRoot: string,
): Promise<PrereqApp[]> {
  const result: PrereqApp[] = [];
  const visited = new Set<string>();

  async function collectDeps(prereq: PrereqApp): Promise<void> {
    const appId = prereq.appJson["id"] as string;
    if (visited.has(appId)) return;
    visited.add(appId);

    // First, process dependencies
    const deps = (prereq.appJson["dependencies"] as Array<{ id: string }>) ||
      [];
    for (const dep of deps) {
      const depPrereq = await findPrereqAppById(dep.id, projectRoot);
      if (depPrereq) {
        await collectDeps(depPrereq);
      }
    }

    // Then add this prereq
    result.push(prereq);
  }

  const mainPrereq = await findPrereqApp(taskId, projectRoot);
  if (mainPrereq) {
    await collectDeps(mainPrereq);
  }

  return result;
}

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
   * Format current time as HH:MM:SS.mmm for debug logging
   */
  private formatTimestamp(): string {
    return new Date().toISOString().substring(11, 23);
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

    console.log("\n[Agent] Tool Timing Summary:");
    const entries = Array.from(this.toolTimings.entries())
      .sort((a, b) => b[1].totalMs - a[1].totalMs);

    for (const [name, data] of entries) {
      const avgMs = Math.round(data.totalMs / data.calls);
      const totalSec = (data.totalMs / 1000).toFixed(1);
      if (data.calls === 1) {
        console.log(`  ${name}: ${totalSec}s`);
      } else {
        console.log(
          `  ${name}: ${data.calls} calls, avg ${avgMs}ms, total ${totalSec}s`,
        );
      }
    }
  }

  /**
   * Process user message to capture tool result timings and detect success
   * Returns success status based on tool result content
   */
  private processUserMessage(
    userMsg: SDKUserMessage,
    requiresTests: boolean,
    debug?: boolean,
  ): { success: boolean } {
    let success = false;

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
            console.log(
              `[${this.formatTimestamp()}] [Agent] Tool result: ${pending.name} (${durationSec}s)`,
            );
          }
        }

        // Check for success in tool result content
        const resultText = typeof resultBlock.content === "string"
          ? resultBlock.content
          : JSON.stringify(resultBlock.content);
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

    return { success };
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
    const mcpServers = this.buildMcpServers(agentConfig);

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
    console.log("[Agent] Query config:");
    console.log(`  Model: ${queryOptions.model}`);
    console.log(`  CWD: ${queryOptions.cwd}`);
    console.log(`  Max turns: ${queryOptions.maxTurns}`);
    console.log(`  Allowed tools: ${queryOptions.allowedTools?.join(", ")}`);
    console.log(
      `  MCP servers: ${Object.keys(queryOptions.mcpServers ?? {}).join(", ")}`,
    );
    if (queryOptions.mcpServers) {
      for (const [name, cfg] of Object.entries(queryOptions.mcpServers)) {
        console.log(`    ${name}: ${cfg.command} ${cfg.args?.join(" ") ?? ""}`);
      }
    }
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
    const startTime = Date.now();
    this.resetToolTimings();

    // Phase 1: Setup execution environment
    const { taskWorkingDir, queryOptions, tracker, executionId } = await this
      .prepareExecution(agentConfig, task, options);

    if (options.debug) {
      this.logQueryConfig(queryOptions);
    }

    try {
      const prompt = this.buildTaskPrompt(task, taskWorkingDir);
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
      );
    } catch (error) {
      tracker.endTurn();
      if (options.debug) {
        console.error("[Agent Executor] Error:", error);
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
      );
    }
  }

  /**
   * Log debug message information
   */
  private logMessage(msg: { type: string; subtype?: string }): void {
    const subtype = (msg as { subtype?: string }).subtype;
    console.log(
      `[Agent] Message: ${msg.type}${subtype ? ` (${subtype})` : ""}`,
    );

    if (msg.type === "system" && subtype === "init") {
      const sysMsg = msg as {
        tools?: string[];
        mcp_servers?: Array<{ name: string; status: string }>;
      };
      if (sysMsg.tools) {
        console.log(`[Agent] Available tools: ${sysMsg.tools.length}`);
        const mcpTools = sysMsg.tools.filter((t: string) =>
          t.startsWith("mcp__")
        );
        if (mcpTools.length > 0) {
          console.log(`[Agent] MCP tools: ${mcpTools.join(", ")}`);
        }
      }
      if (sysMsg.mcp_servers) {
        console.log("[Agent] MCP server status:");
        for (const srv of sysMsg.mcp_servers) {
          console.log(`  ${srv.name}: ${srv.status}`);
        }
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
          console.log(
            `[${this.formatTimestamp()}] [Agent] Tool call: ${toolBlock.name}`,
          );
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
   * Run test verification and log results
   * @deprecated No longer used - agents now run tests via al_verify_task MCP tool
   */
  // @ts-ignore: Kept for potential future use or debugging
  private async _runTestVerification(
    taskWorkingDir: string,
    testFilePath: string,
    debug?: boolean,
  ): Promise<{ success: boolean; testResult?: TestResult }> {
    if (debug) {
      console.log("[Agent] Verifying with tests...");
    }

    const verifyResult = await this.verifyWithTests(
      taskWorkingDir,
      testFilePath,
      debug,
    );

    if (!verifyResult.success) {
      if (debug) {
        console.log(
          `[Agent] Test verification failed: ${verifyResult.message}`,
        );
        if (verifyResult.failures) {
          for (const f of verifyResult.failures) {
            console.log(`  - ${f}`);
          }
        }
      }
      const result: { success: boolean; testResult?: TestResult } = {
        success: false,
      };
      if (verifyResult.testResult) {
        result.testResult = verifyResult.testResult;
      }
      return result;
    }

    if (debug) {
      console.log(`[Agent] Test verification passed: ${verifyResult.message}`);
    }
    const result: { success: boolean; testResult?: TestResult } = {
      success: true,
    };
    if (verifyResult.testResult) {
      result.testResult = verifyResult.testResult;
    }
    return result;
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

  /**
   * Build MCP server configuration from agent config
   * Returns only agent-defined MCP servers (no built-in servers)
   */
  private buildMcpServers(
    agentConfig: ResolvedAgentConfig,
  ):
    | Record<
      string,
      { command: string; args?: string[]; env?: Record<string, string> }
    >
    | undefined {
    if (!agentConfig.mcpServers) {
      return undefined;
    }

    const servers: Record<
      string,
      { command: string; args?: string[]; env?: Record<string, string> }
    > = {};

    for (const [name, mcpConfig] of Object.entries(agentConfig.mcpServers)) {
      const serverEntry: {
        command: string;
        args?: string[];
        env?: Record<string, string>;
      } = {
        command: mcpConfig.command,
      };
      if (mcpConfig.args) {
        serverEntry.args = mcpConfig.args;
      }
      if (mcpConfig.env) {
        serverEntry.env = mcpConfig.env;
      }
      servers[name] = serverEntry;
    }

    return Object.keys(servers).length > 0 ? servers : undefined;
  }

  /**
   * Build the initial task prompt for the agent
   */
  private buildTaskPrompt(task: TaskManifest, workingDir: string): string {
    // Ensure absolute path
    const absWorkingDir = workingDir.startsWith("/") ||
        workingDir.match(/^[A-Z]:/i)
      ? workingDir
      : join(Deno.cwd(), workingDir);

    const parts: string[] = [
      `# Task: ${task.id}`,
      "",
      "## Description",
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
    parts.push("Create all required files here using absolute paths.");
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
        `3. First, use mcp__al-tools__al_compile with projectDir: "${absWorkingDir}" to check compilation`,
      );
      parts.push(
        "4. If compilation fails, fix the errors and recompile until it succeeds",
      );
      parts.push(
        "5. Once compilation succeeds, use mcp__al-tools__al_verify_task to run tests:",
      );
      parts.push(`   - projectDir: "${absWorkingDir}"`);
      parts.push(`   - taskId: "${task.id}"`);
      parts.push(
        "6. If tests fail, read the error messages carefully, fix your code, use al_compile to verify it compiles, then run al_verify_task again",
      );
      parts.push("7. Once all tests pass, your task is complete");
      parts.push("");
      parts.push(
        "IMPORTANT: al_verify_task takes ~60-90 seconds because it runs tests in a BC container.",
      );
      parts.push(
        "Use al_compile (~5s) for fast iteration. Only call al_verify_task when you believe tests should pass.",
      );
      parts.push(
        "SUCCESS: When you see 'All tests passed' in the tool response, the task is done.",
      );
    } else {
      // Compile-only - use al_compile
      parts.push(
        `3. Use the mcp__al-tools__al_compile tool with projectDir: "${absWorkingDir}"`,
      );
      parts.push(
        "4. If compilation fails, read the errors, fix the code, and recompile",
      );
      parts.push("5. Once compilation succeeds, your task is complete");
      parts.push("");
      parts.push(
        "IMPORTANT: Use the MCP tool mcp__al-tools__al_compile for compilation, NOT Bash.",
      );
      parts.push(
        "SUCCESS: When you see 'Compilation successful' in the tool response, the task is done.",
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

  /**
   * Test Toolkit dependencies for BC 27
   */
  private static readonly TEST_TOOLKIT_DEPS = [
    {
      id: "dd0be2ea-f733-4d65-bb34-a28f4624fb14",
      name: "Library Assert",
      publisher: "Microsoft",
      version: "27.0.0.0",
    },
    {
      id: "e7320ebb-08b3-4406-b1ec-b4927d3e280b",
      name: "Any",
      publisher: "Microsoft",
      version: "27.0.0.0",
    },
    {
      id: "5d86850b-0d76-4eca-bd7b-951ad998e997",
      name: "Tests-TestLibraries",
      publisher: "Microsoft",
      version: "27.0.0.0",
    },
  ];

  /**
   * Create an isolated verification directory with absolute path
   */
  private async createVerificationDir(projectDir: string): Promise<string> {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    const relativeVerifyDir = join(
      projectDir,
      "..",
      `verify-${timestamp}-${random}`,
    );

    // Ensure absolute path for PowerShell compilation
    const verifyDir =
      relativeVerifyDir.match(/^[A-Z]:/i) || relativeVerifyDir.startsWith("/")
        ? relativeVerifyDir
        : join(Deno.cwd(), relativeVerifyDir);

    await ensureDir(verifyDir);
    return verifyDir;
  }

  /**
   * Prepare app.json with Test Toolkit dependencies for verification.
   * Optionally adds prereq app as a dependency.
   */
  private async prepareAppJsonForTests(
    projectDir: string,
    verifyDir: string,
    prereqAppJson?: Record<string, unknown>,
  ): Promise<{ success: boolean; error?: string }> {
    const appJsonPath = join(projectDir, "app.json");

    try {
      const appJsonContent = await Deno.readTextFile(appJsonPath);
      const appJson = JSON.parse(appJsonContent);

      // Add Test Toolkit dependencies if not present
      if (!appJson.dependencies) {
        appJson.dependencies = [];
      }
      for (const dep of AgentTaskExecutor.TEST_TOOLKIT_DEPS) {
        const depExists = appJson.dependencies.some(
          (d: { id: string }) => d.id === dep.id,
        );
        if (!depExists) {
          appJson.dependencies.push(dep);
        }
      }

      // Add prereq app as dependency if provided
      if (prereqAppJson) {
        const prereqId = prereqAppJson["id"] as string;
        const prereqExists = appJson.dependencies.some(
          (d: { id: string }) => d.id === prereqId,
        );
        if (!prereqExists) {
          appJson.dependencies.push({
            id: prereqId,
            name: prereqAppJson["name"] as string,
            publisher: prereqAppJson["publisher"] as string,
            version: prereqAppJson["version"] as string,
          });
        }
      }

      // Extend idRanges to include test codeunit range (80000-89999)
      if (!appJson.idRanges) {
        appJson.idRanges = [];
      }
      const hasTestRange = appJson.idRanges.some(
        (r: { from: number; to: number }) => r.from <= 80001 && r.to >= 80001,
      );
      if (!hasTestRange) {
        appJson.idRanges.push({ from: 80000, to: 89999 });
      }

      await Deno.writeTextFile(
        join(verifyDir, "app.json"),
        JSON.stringify(appJson, null, 2),
      );
      return { success: true };
    } catch {
      return { success: false, error: `No app.json found in ${projectDir}` };
    }
  }

  /**
   * Copy AL source files from project to verification directory
   */
  private async copyAlFiles(
    projectDir: string,
    verifyDir: string,
  ): Promise<void> {
    for await (const entry of Deno.readDir(projectDir)) {
      if (entry.isFile && entry.name.endsWith(".al")) {
        const content = await Deno.readTextFile(join(projectDir, entry.name));
        await Deno.writeTextFile(join(verifyDir, entry.name), content);
      }
    }
  }

  /**
   * Copy test file to verification directory
   */
  private async copyTestFile(
    testFilePath: string,
    verifyDir: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const testContent = await Deno.readTextFile(testFilePath);
      const testFileName = basename(testFilePath);
      await Deno.writeTextFile(join(verifyDir, testFileName), testContent);
      return { success: true };
    } catch {
      return { success: false, error: `Test file not found: ${testFilePath}` };
    }
  }

  /**
   * Compile and run tests, returning verification result.
   * Optionally publishes prereq apps before the main app.
   */
  private async compileAndRunTests(
    containerName: string,
    project: ALProject,
    prereqAppPaths?: string[],
    debug?: boolean,
    testCodeunitId?: number,
  ): Promise<{
    success: boolean;
    message: string;
    failures?: string[];
    testResult?: TestResult;
  }> {
    const compileResult = await this.containerProvider.compileProject(
      containerName,
      project,
    );

    if (!compileResult.success) {
      return {
        success: false,
        message: "Verification compilation failed",
        failures: compileResult.errors.map(
          (e) => `${e.file}(${e.line},${e.column}): ${e.code} - ${e.message}`,
        ),
      };
    }

    // Publish prereq apps before running tests
    if (prereqAppPaths && prereqAppPaths.length > 0) {
      for (const prereqPath of prereqAppPaths) {
        if (debug) {
          console.log(`[Agent] Publishing prereq: ${prereqPath}`);
        }
        await this.containerProvider.publishApp(containerName, prereqPath);
      }
    }

    const testResult = await this.containerProvider.runTests(
      containerName,
      project,
      undefined, // appFilePath
      testCodeunitId,
    );

    // Debug: show full test output if enabled
    if (debug && testResult.output) {
      console.log(colors.gray("[Agent] --- Test Output ---"));
      console.log(testResult.output);
      console.log(colors.gray("[Agent] --- End Test Output ---"));
    }

    if (testResult.success) {
      return {
        success: true,
        message:
          `All tests passed! (${testResult.passedTests}/${testResult.totalTests})`,
        testResult,
      };
    }

    const failures = testResult.results
      .filter((r) => !r.passed)
      .map((r) => `${r.name}: ${r.error || "Failed"}`);

    return {
      success: false,
      message:
        `Tests failed: ${testResult.failedTests} of ${testResult.totalTests} tests failed`,
      failures,
      testResult,
    };
  }

  /**
   * Verify agent code by running tests in an isolated directory.
   * This prevents the agent from seeing or modifying test files.
   * Handles prereq apps: compiles them first and adds them as dependencies.
   */
  private async verifyWithTests(
    projectDir: string,
    testFilePath: string,
    debug?: boolean,
  ): Promise<{
    success: boolean;
    message: string;
    failures?: string[];
    testResult?: TestResult;
  }> {
    const containerName = "Cronus27";

    try {
      // Check for prereq apps based on task ID
      const taskId = extractTaskIdFromTestPath(testFilePath);
      const projectRoot = extractProjectRoot(testFilePath);
      const compiledPrereqs: PrereqApp[] = [];

      if (debug) {
        console.log(`[Agent] Test file: ${testFilePath}`);
        console.log(`[Agent] Task ID: ${taskId}`);
        console.log(`[Agent] Project root: ${projectRoot}`);
      }

      if (taskId) {
        const allPrereqs = await findAllPrereqApps(taskId, projectRoot);
        if (debug) {
          console.log(`[Agent] Found ${allPrereqs.length} prereq(s)`);
        }

        for (const prereq of allPrereqs) {
          if (debug) {
            console.log(`[Agent] Compiling prereq: ${prereq.appJson["name"]}`);
          }

          // Build prereq project
          const prereqProject = await this.buildALProject(prereq.path);
          const prereqCompileResult = await this.containerProvider
            .compileProject(containerName, prereqProject);

          if (!prereqCompileResult.success) {
            return {
              success: false,
              message: `Prereq app compilation failed for ${
                prereq.appJson["name"]
              }`,
              failures: prereqCompileResult.errors.map(
                (e) =>
                  `${e.file}(${e.line},${e.column}): ${e.code} - ${e.message}`,
              ),
            };
          }

          compiledPrereqs.push({
            ...prereq,
            compiledAppPath: prereqCompileResult.artifactPath,
          });
        }
      }

      // Create isolated verification directory
      const verifyDir = await this.createVerificationDir(projectDir);
      if (debug) {
        console.log(`[Agent] Verification directory: ${verifyDir}`);
      }

      // Prepare app.json with test dependencies (and prereq dependency if exists)
      // Only add the last prereq as direct dependency - it will chain to others
      const lastPrereq = compiledPrereqs[compiledPrereqs.length - 1];
      const appResult = await this.prepareAppJsonForTests(
        projectDir,
        verifyDir,
        lastPrereq?.appJson,
      );
      if (!appResult.success) {
        return { success: false, message: appResult.error! };
      }

      // Copy source files
      await this.copyAlFiles(projectDir, verifyDir);

      // Copy test file
      const testResult = await this.copyTestFile(testFilePath, verifyDir);
      if (!testResult.success) {
        return { success: false, message: testResult.error! };
      }
      if (debug) {
        console.log(`[Agent] Copied test file: ${basename(testFilePath)}`);
      }

      // Build and verify project
      const project = await this.buildALProject(verifyDir);
      if (debug) {
        console.log(`[Agent] Source files: ${project.sourceFiles.length}`);
        console.log(`[Agent] Test files: ${project.testFiles.length}`);
      }

      // Get prereq app paths for runTests
      const prereqAppPaths = compiledPrereqs
        .map((p) => p.compiledAppPath)
        .filter((p): p is string => p !== undefined);

      return await this.compileAndRunTests(
        containerName,
        project,
        prereqAppPaths.length > 0 ? prereqAppPaths : undefined,
        debug,
      );
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      return { success: false, message: `Verification error: ${errorMessage}` };
    }
  }

  /**
   * Build ALProject from a directory path
   */
  private async buildALProject(projectDir: string): Promise<ALProject> {
    const appJsonPath = join(projectDir, "app.json");
    const appJsonContent = await Deno.readTextFile(appJsonPath);
    const appJson = JSON.parse(appJsonContent);

    // Find all .al files in the directory
    const sourceFiles: string[] = [];
    const testFiles: string[] = [];

    for await (const entry of Deno.readDir(projectDir)) {
      if (entry.isFile && entry.name.endsWith(".al")) {
        const filePath = join(projectDir, entry.name);
        // Test files typically have "Test" in the name
        const isTestFile = entry.name.toLowerCase().includes("test") ||
          entry.name.toLowerCase().includes(".test.");

        if (isTestFile) {
          testFiles.push(filePath);
        } else {
          sourceFiles.push(filePath);
        }
      }
    }

    return {
      path: projectDir,
      appJson,
      sourceFiles,
      testFiles,
    };
  }
}
