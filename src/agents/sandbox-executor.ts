/**
 * Sandbox Executor
 *
 * Handles execution of agent tasks in isolated Docker containers.
 * Extracted from executor.ts for better separation of concerns.
 */

import { ensureDir } from "@std/fs";
import { join } from "@std/path";
import { ContainerError } from "../errors.ts";
import { Logger } from "../logger/mod.ts";
import type { TaskManifest } from "../tasks/interfaces.ts";
import type { TestResult } from "../container/types.ts";
import type { Sandbox } from "../sandbox/types.ts";
import { WindowsSandboxProvider } from "../sandbox/windows-provider.ts";
import { McpServerManager } from "./mcp-manager.ts";
import { CostTracker } from "./cost-tracker.ts";
import {
  analyzeSandboxOutput,
  buildFailureReason,
  buildFailureReasonFromAnalysis,
} from "./failure-parser.ts";
import { detectSuccess } from "./success-detector.ts";
import {
  extractResultFromToolResult,
  formatTaskResult,
} from "./result-parser.ts";
import type {
  AgentExecutionOptions,
  AgentExecutionResult,
  DetailedFailureReason,
  ParsedTaskResult,
  ResolvedAgentConfig,
  TerminationReason,
} from "./types.ts";

const log = Logger.create("sandbox");

/**
 * Context required for sandbox execution.
 * Provided by AgentTaskExecutor to avoid circular dependencies.
 */
export interface SandboxExecutionContext {
  /** Generate unique execution ID */
  generateExecutionId: () => string;
  /** Copy agent context files (CLAUDE.md, .claude/) */
  copyAgentContext: (baseDir: string, taskDir: string) => Promise<void>;
  /** Build prompt for the task */
  buildTaskPrompt: (
    task: TaskManifest,
    workingDir: string,
    config: ResolvedAgentConfig,
  ) => string;
  /** Extract final code from working directory */
  extractFinalCode: (workingDir: string) => Promise<string | undefined>;
  /** Build execution result object */
  buildExecutionResult: (
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
  ) => AgentExecutionResult;
}

/**
 * Check if sandbox mode should be used for this execution.
 */
export function shouldUseSandbox(
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
 * Executor for running agent tasks in isolated Docker containers.
 */
export class SandboxExecutor {
  private sandboxProvider?: WindowsSandboxProvider;
  private mcpManager: McpServerManager;

  constructor() {
    this.mcpManager = new McpServerManager();
  }

  /**
   * Execute a task in a sandbox container.
   * This provides full isolation from the host environment for reproducibility.
   */
  async execute(
    agentConfig: ResolvedAgentConfig,
    task: TaskManifest,
    options: AgentExecutionOptions,
    context: SandboxExecutionContext,
  ): Promise<AgentExecutionResult> {
    const startTime = Date.now();
    const executionId = context.generateExecutionId();
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

      // Copy agent context
      await context.copyAgentContext(baseWorkingDir, taskWorkingDir);

      // Build the task prompt
      const prompt = context.buildTaskPrompt(
        task,
        "C:\\workspace",
        agentConfig,
      );

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
      const requiresTests = !!task.expected?.testApp;
      let terminationReason: TerminationReason = "error";

      // Use consolidated success detection
      const detection = detectSuccess(combinedOutput, requiresTests);
      const success = detection.success;
      if (success) {
        terminationReason = "success";
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
        finalCode = await context.extractFinalCode(taskWorkingDir);
      }

      return context.buildExecutionResult(
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

      return context.buildExecutionResult(
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
