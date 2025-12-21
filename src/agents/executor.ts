/**
 * Agent Task Executor
 *
 * Executes benchmark tasks using the Claude Agent SDK V1 query() API.
 * Agents run autonomously until success or resource limits are reached.
 */

import { basename, join } from "@std/path";
import { ensureDir } from "@std/fs";
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
import type { ALProject } from "../container/types.ts";

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

export class AgentTaskExecutor {
  private containerProvider: BcContainerProvider;

  constructor() {
    // No configuration needed - MCP servers come from agent config
    this.containerProvider = new BcContainerProvider();
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
    const executionId = this.generateExecutionId();
    const tracker = new CostTracker(agentConfig.model);

    // Prepare isolated working directory for this task
    // Each task gets its own subdirectory to prevent file conflicts
    const baseWorkingDir = agentConfig.workingDir || options.projectDir;
    const taskWorkingDir = join(
      baseWorkingDir,
      ".tasks",
      `${task.id}-${executionId}`,
    );
    await ensureDir(taskWorkingDir);

    // Copy CLAUDE.md and .claude directory if they exist in base dir
    await this.copyAgentContext(baseWorkingDir, taskWorkingDir);

    // Note: Test files are NOT copied to the task directory
    // The BC compiler compiles all .al files in a directory, and test files
    // require Test Toolkit dependencies that break compilation.
    // For agent benchmarks, we verify compilation success as the primary metric.

    // Resolve system prompt
    const systemPrompt = this.resolveSystemPrompt(agentConfig.systemPrompt);

    // Build MCP server configuration
    const mcpServers = this.buildMcpServers(agentConfig);

    // Create SDK query options
    const queryOptions = {
      model: agentConfig.model,
      cwd: taskWorkingDir,
      allowedTools: agentConfig.allowedTools,
      maxTurns: agentConfig.maxTurns,
      ...(mcpServers && { mcpServers }),
      systemPrompt,
      permissionMode: "bypassPermissions" as const,
      allowDangerouslySkipPermissions: true,
    };

    try {
      // Debug log the query configuration
      if (options.debug) {
        console.log("[Agent] Query config:");
        console.log(`  Model: ${queryOptions.model}`);
        console.log(`  CWD: ${queryOptions.cwd}`);
        console.log(`  Max turns: ${queryOptions.maxTurns}`);
        console.log(
          `  Allowed tools: ${queryOptions.allowedTools?.join(", ")}`,
        );
        console.log(
          `  MCP servers: ${
            Object.keys(queryOptions.mcpServers ?? {}).join(", ")
          }`,
        );
        if (queryOptions.mcpServers) {
          for (const [name, cfg] of Object.entries(queryOptions.mcpServers)) {
            console.log(
              `    ${name}: ${cfg.command} ${cfg.args?.join(" ") ?? ""}`,
            );
          }
        }
      }

      // Build the task prompt
      const prompt = this.buildTaskPrompt(task, taskWorkingDir);
      tracker.startTurn();

      // Execute using V1 query() API
      const q = query({
        prompt,
        options: queryOptions,
      });

      // Process agent responses
      let success = false;
      let finalCode: string | undefined;
      let terminationReason: TerminationReason = "error";

      for await (const msg of q) {
        // Debug logging
        if (options.debug) {
          const subtype = (msg as { subtype?: string }).subtype;
          console.log(
            `[Agent] Message: ${msg.type}${subtype ? ` (${subtype})` : ""}`,
          );

          // Log system init details (shows available tools and MCP status)
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

        // Process based on message type
        const msgType = msg.type;

        // Track token usage from assistant messages
        if (msgType === "assistant") {
          const assistantMsg = msg as SDKAssistantMessage;
          if (assistantMsg.message) {
            // Extract usage from API message if available
            const usage = (assistantMsg.message as ApiMessageWithUsage).usage;
            if (usage) {
              const tokenUsage: {
                promptTokens?: number;
                completionTokens?: number;
              } = {};
              if (
                usage.input_tokens !== undefined && usage.input_tokens !== null
              ) {
                tokenUsage.promptTokens = usage.input_tokens;
              }
              if (
                usage.output_tokens !== undefined &&
                usage.output_tokens !== null
              ) {
                tokenUsage.completionTokens = usage.output_tokens;
              }
              tracker.recordTokenUsage(tokenUsage);
            }

            // Check for tool use blocks in content
            for (const block of assistantMsg.message.content) {
              if (block.type === "tool_use") {
                const toolBlock = block as ToolUseBlock;
                if (options.debug) {
                  console.log(`[Agent] Tool call: ${toolBlock.name}`);
                }
                const toolRecord: ToolCallRecord = {
                  name: toolBlock.name,
                  input: toolBlock.input as Record<string, unknown>,
                  duration: 0,
                  success: true,
                };
                tracker.recordToolCall(toolRecord);
              }

              // Check for tool results indicating success
              if (block.type === "tool_result") {
                const resultBlock = block as ToolResultBlock;
                const resultText = typeof resultBlock.content === "string"
                  ? resultBlock.content
                  : JSON.stringify(resultBlock.content);
                const resultLower = resultText.toLowerCase();

                // For agent benchmarks, compilation success is the primary metric
                // (test files require Test Toolkit which complicates the flow)
                if (
                  resultLower.includes("compilation successful") ||
                  resultLower.includes("all tests passed")
                ) {
                  finalCode = await this.extractFinalCode(taskWorkingDir);
                  success = true;
                  terminationReason = "success";
                }
              }
            }
          }

          // End current turn and start a new one
          tracker.endTurn();
          tracker.startTurn();
        }

        // Handle result message (session complete)
        if (msgType === "result") {
          const resultMsg = msg as SDKResultMessage;
          if (resultMsg.subtype === "success") {
            // SDK reports success - trust it and verify with tests
            // The agent believes it completed the task successfully
            success = true;
            terminationReason = "success";
            finalCode = await this.extractFinalCode(taskWorkingDir);
          } else if (resultMsg.subtype === "error_max_turns") {
            terminationReason = "max_turns";
          }
          break;
        }

        // Check termination conditions
        if (tracker.turns >= agentConfig.maxTurns) {
          terminationReason = "max_turns";
          break;
        }
        if (
          agentConfig.maxTokens &&
          tracker.totalTokens >= agentConfig.maxTokens
        ) {
          terminationReason = "max_tokens";
          break;
        }
        if (
          agentConfig.limits?.maxCompileAttempts &&
          tracker.isCompileLimitReached(agentConfig.limits.maxCompileAttempts)
        ) {
          terminationReason = "max_compile_attempts";
          break;
        }

        // Stop if successful
        if (success) {
          break;
        }
      }

      tracker.endTurn();

      // Phase 2: Verify with tests if agent compilation succeeded
      if (success && task.expected?.testApp) {
        if (options.debug) {
          console.log("[Agent] Verifying with tests...");
        }
        const verifyResult = await this.verifyWithTests(
          taskWorkingDir,
          task.expected.testApp,
          options.debug,
        );
        if (!verifyResult.success) {
          success = false;
          terminationReason = "test_failure";
          if (options.debug) {
            console.log(
              `[Agent] Test verification failed: ${verifyResult.message}`,
            );
            if (verifyResult.failures) {
              for (const f of verifyResult.failures) {
                console.log(`  - ${f}`);
              }
            }
          }
        } else if (options.debug) {
          console.log(
            `[Agent] Test verification passed: ${verifyResult.message}`,
          );
        }
      }

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
      return result;
    } catch (error) {
      tracker.endTurn();

      if (options.debug) {
        console.error("[Agent Executor] Error:", error);
      }

      return {
        taskId: task.id,
        agentId: agentConfig.id,
        executionId,
        success: false,
        turns: tracker.getTurns(),
        metrics: tracker.getMetrics(),
        terminationReason: "error",
        duration: Date.now() - startTime,
        executedAt: new Date(),
      };
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
   * Verify agent code by running tests in an isolated directory.
   * This prevents the agent from seeing or modifying test files.
   */
  private async verifyWithTests(
    projectDir: string,
    testFilePath: string,
    debug?: boolean,
  ): Promise<{
    success: boolean;
    message: string;
    failures?: string[];
  }> {
    const containerName = "Cronus27"; // Default BC container

    try {
      // Create isolated verification directory (use absolute path)
      const timestamp = Date.now().toString(36);
      const random = Math.random().toString(36).substring(2, 8);
      const relativeVerifyDir = join(projectDir, "..", `verify-${timestamp}-${random}`);
      // Ensure absolute path for PowerShell compilation
      const verifyDir = relativeVerifyDir.match(/^[A-Z]:/i) || relativeVerifyDir.startsWith("/")
        ? relativeVerifyDir
        : join(Deno.cwd(), relativeVerifyDir);
      await ensureDir(verifyDir);

      if (debug) {
        console.log(`[Agent] Verification directory: ${verifyDir}`);
      }

      // Copy app.json and add Test Toolkit dependencies
      const appJsonPath = join(projectDir, "app.json");
      try {
        const appJsonContent = await Deno.readTextFile(appJsonPath);
        const appJson = JSON.parse(appJsonContent);

        // Add Test Toolkit dependencies if not present
        // App IDs extracted from actual BC 27 symbol files
        const testDeps = [
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

        if (!appJson.dependencies) {
          appJson.dependencies = [];
        }

        for (const dep of testDeps) {
          const exists = appJson.dependencies.some(
            (d: { id: string }) => d.id === dep.id,
          );
          if (!exists) {
            appJson.dependencies.push(dep);
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
      } catch {
        return {
          success: false,
          message: `No app.json found in ${projectDir}`,
        };
      }

      // Copy all .al files from agent project
      for await (const entry of Deno.readDir(projectDir)) {
        if (entry.isFile && entry.name.endsWith(".al")) {
          const content = await Deno.readTextFile(join(projectDir, entry.name));
          await Deno.writeTextFile(join(verifyDir, entry.name), content);
        }
      }

      // Copy the test file
      try {
        const testContent = await Deno.readTextFile(testFilePath);
        const testFileName = basename(testFilePath);
        await Deno.writeTextFile(join(verifyDir, testFileName), testContent);
        if (debug) {
          console.log(`[Agent] Copied test file: ${testFileName}`);
        }
      } catch {
        return {
          success: false,
          message: `Test file not found: ${testFilePath}`,
        };
      }

      // Build ALProject for verification (include test files)
      const project = await this.buildALProject(verifyDir);

      if (debug) {
        console.log(`[Agent] Source files: ${project.sourceFiles.length}`);
        console.log(`[Agent] Test files: ${project.testFiles.length}`);
      }

      // Compile with test files
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

      // Run tests
      const testResult = await this.containerProvider.runTests(
        containerName,
        project,
      );

      if (testResult.success) {
        return {
          success: true,
          message:
            `All tests passed! (${testResult.passedTests}/${testResult.totalTests})`,
        };
      } else {
        const failures = testResult.results
          .filter((r) => !r.passed)
          .map((r) => `${r.name}: ${r.error || "Failed"}`);

        return {
          success: false,
          message:
            `Tests failed: ${testResult.failedTests} of ${testResult.totalTests} tests failed`,
          failures,
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      return {
        success: false,
        message: `Verification error: ${errorMessage}`,
      };
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
