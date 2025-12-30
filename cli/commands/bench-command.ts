/**
 * Benchmark execution commands
 * @module cli/commands/bench
 */

import { Command } from "@cliffy/command";
import { expandGlob } from "@std/fs";
import * as colors from "@std/fmt/colors";
import type {
  CLIPromptOverrides,
  InjectionStage,
} from "../../src/prompts/mod.ts";
import { ModelPresetRegistry } from "../../src/llm/model-presets.ts";
import type { ModelVariant } from "../../src/llm/variant-types.ts";
import { getVariantDisplayName } from "../../src/llm/variant-parser.ts";
import { ConfigManager } from "../../src/config/config.ts";
import { EnvLoader } from "../../src/utils/env-loader.ts";
import { SplashScreen } from "../../src/utils/splash-screen.ts";
import { DebugLogger } from "../../src/utils/debug-logger.ts";
import { ContainerProviderRegistry } from "../../src/container/registry.ts";
import { loadTaskManifest } from "../../src/tasks/loader.ts";
import { TaskExecutorV2 } from "../../src/tasks/executor-v2.ts";
import {
  createDefaultConfig,
  CriticalError,
  ParallelBenchmarkOrchestrator,
} from "../../src/parallel/mod.ts";
import type { ParallelExecutionEvent } from "../../src/parallel/mod.ts";
import {
  formatBenchmarkStats,
  formatModelSummaryTable,
  formatTaskMatrix,
  type FormatterInput,
  getFormatter,
  type OutputFormat,
  shouldCopyToClipboard,
  type TaskMatrixInput,
} from "../../src/utils/formatters.ts";
import { copyToClipboard } from "../../src/utils/clipboard.ts";
import {
  formatDurationMs,
  getModelColor,
  log,
  parseProviderAndModel,
  statusText,
} from "../helpers/mod.ts";
import { BenchTui, isTuiSupported } from "../tui/bench-tui.ts";
import { loadTaskManifestsWithHashes } from "../helpers/task-loader.ts";
import type { ExtendedBenchmarkOptions } from "../types/cli-types.ts";
import { AgentRegistry } from "../../src/agents/registry.ts";
import { AgentTaskExecutor } from "../../src/agents/executor.ts";
import type { AgentExecutionResult } from "../../src/agents/types.ts";
import type { TaskExecutionResult } from "../../src/tasks/interfaces.ts";
import { join } from "@std/path";

/**
 * Output a benchmark event as a JSON line (for TUI/machine parsing)
 */
function outputJsonEvent(
  event: ParallelExecutionEvent,
  modelPassRates: Map<
    string,
    { total: number; attempt1: number; attempt2: number }
  >,
): void {
  // Build a simplified JSON event for TUI consumption
  let jsonEvent: Record<string, unknown>;

  switch (event.type) {
    case "task_started":
      jsonEvent = {
        type: "task_started",
        taskId: event.taskId,
        modelCount: event.models.length,
      };
      break;
    case "llm_started":
      jsonEvent = {
        type: "llm_started",
        taskId: event.taskId,
        model: event.model,
        attempt: event.attempt,
      };
      break;
    case "llm_completed":
      jsonEvent = {
        type: "llm_completed",
        taskId: event.taskId,
        model: event.model,
        attempt: event.attempt,
        success: event.success,
      };
      break;
    case "compile_completed":
      jsonEvent = {
        type: "compile_completed",
        taskId: event.taskId,
        model: event.model,
        success: event.success,
      };
      break;
    case "result": {
      const variantId = event.result.context.variantId ||
        event.result.context.llmModel;
      // Update pass rates
      if (!modelPassRates.has(variantId)) {
        modelPassRates.set(variantId, { total: 0, attempt1: 0, attempt2: 0 });
      }
      const stats = modelPassRates.get(variantId)!;
      stats.total++;
      if (event.result.passedAttemptNumber === 1) stats.attempt1++;
      else if (event.result.passedAttemptNumber === 2) stats.attempt2++;

      jsonEvent = {
        type: "result",
        taskId: event.result.taskId,
        model: variantId,
        success: event.result.success,
        score: event.result.finalScore,
        passedAttempt: event.result.passedAttemptNumber,
      };
      break;
    }
    case "task_completed":
      jsonEvent = {
        type: "task_completed",
        taskId: event.taskId,
        winner: event.result.comparison.winner,
        bestScore: event.result.comparison.bestScore,
      };
      break;
    case "progress":
      jsonEvent = {
        type: "progress",
        completed: event.progress.completedTasks,
        total: event.progress.totalTasks,
        errors: event.progress.errors.length,
        estimatedRemaining: event.progress.estimatedTimeRemaining,
      };
      break;
    case "error":
      jsonEvent = {
        type: "error",
        taskId: event.taskId,
        model: event.model,
        message: event.error.message,
      };
      break;
    default:
      // Skip llm_chunk and compile_queued for TUI (too noisy)
      return;
  }

  // Output as a single JSON line
  console.log(JSON.stringify(jsonEvent));
}

/**
 * Check if a failure is transient (worth retrying) vs model output quality issue
 * Transient failures: API errors, timeouts, rate limits, network issues
 * Model failures: Compilation failed, tests failed, missing patterns
 */
function isTransientFailure(result: TaskExecutionResult): boolean {
  const lastAttempt = result.attempts[result.attempts.length - 1];
  if (!lastAttempt) return false;

  const reasons = lastAttempt.failureReasons.join(" ").toLowerCase();

  // Model output failures - NOT worth retrying
  const modelFailurePatterns = [
    "compilation failed",
    "tests failed",
    "code did not compile",
    "missing required patterns",
    "contains forbidden patterns",
    "custom check",
  ];

  // If it's clearly a model output failure, don't retry
  if (modelFailurePatterns.some((pattern) => reasons.includes(pattern))) {
    return false;
  }

  // Transient failures - worth retrying
  const transientPatterns = [
    "llm call failed",
    "timeout",
    "rate limit",
    "429",
    "503",
    "502",
    "500",
    "connection",
    "network",
    "econnreset",
    "enotfound",
    "container error",
    "failed to",
  ];

  return transientPatterns.some((pattern) => reasons.includes(pattern));
}

/**
 * Prompt user to retry failed tasks interactively
 */
async function promptRetryFailed(
  transientCount: number,
  modelFailureCount: number,
): Promise<boolean> {
  // Show model failures info (not retryable)
  if (modelFailureCount > 0) {
    console.log(
      colors.dim(
        `[Info] ${modelFailureCount} model output failures (compilation/test) - not retryable`,
      ),
    );
  }

  const prompt = `${
    colors.yellow("[Retry]")
  } ${transientCount} transient failures (timeout, API errors). Retry now? [y/N] `;
  await Deno.stdout.write(new TextEncoder().encode(prompt));

  const buf = new Uint8Array(10);
  const n = await Deno.stdin.read(buf);
  if (n === null) return false;

  const input = new TextDecoder().decode(buf.subarray(0, n)).trim()
    .toLowerCase();
  return input === "y" || input === "yes";
}

/**
 * Run benchmark in parallel mode (default)
 */
async function runParallelBenchmark(
  options: ExtendedBenchmarkOptions,
  quiet = false,
  containerProviderName?: string,
  outputFormat: OutputFormat = "verbose",
  jsonEvents = false,
  tuiMode = false,
): Promise<void> {
  if (!quiet) {
    await EnvLoader.loadEnvironment();
    await SplashScreen.display({
      showEnvironment: true,
      showConfiguration: true,
      showProviders: true,
      compact: false,
    });
  }

  // Initialize debug logging if enabled
  let debugLogger: DebugLogger | null = null;
  if (options.debug || options.debugLogLevel) {
    const sessionId = `session-${Date.now()}`;
    const logLevel = options.debugLogLevel || "basic";
    const debugConfig = {
      enabled: true,
      outputDir: options.debugOutputDir || "debug",
      sessionId,
      logLevel,
      includeRawResponse: logLevel === "verbose",
      includeRequestHeaders: logLevel !== "basic",
      maxFileSize: 100,
    };

    debugLogger = DebugLogger.initialize(debugConfig);
    console.log(
      `Debug logging enabled: ${debugConfig.outputDir} (level: ${logLevel})`,
    );
  }

  log.summary("Starting CentralGauge benchmark (parallel mode)...");
  log.info(`Models: ${options.llms.join(", ")}`);
  log.info(`Tasks: ${options.tasks.join(", ")}`);
  log.info(`Attempts: ${options.attempts}`);
  log.info(`Max Concurrency: ${options.maxConcurrency ?? 10}`);
  log.info(`Output: ${options.outputDir}`);

  try {
    await Deno.mkdir(options.outputDir, { recursive: true });

    // Load task manifests with comprehensive hashing
    let { manifests: taskManifests, hashResult } =
      await loadTaskManifestsWithHashes(
        options.tasks,
        options.outputDir,
        !quiet,
      );

    if (taskManifests.length === 0) {
      return;
    }

    // Load config
    const appConfig = await ConfigManager.loadConfig();
    const containerConfig = appConfig.container || {};

    // Resolve all models with variant support
    let variants: ModelVariant[] = ModelPresetRegistry.resolveWithVariants(
      options.llms,
      appConfig,
    );

    log.info(
      `Running with ${variants.length} model variant(s): ${
        variants.map((v) => getVariantDisplayName(v)).join(", ")
      }`,
    );

    // Handle retry mode: load previous results and filter to missing combinations
    // deno-lint-ignore no-explicit-any
    let previousResults: any[] = [];
    if (options.retry) {
      try {
        const retryContent = await Deno.readTextFile(options.retry);
        const retryData = JSON.parse(retryContent);
        const existingResults = Array.isArray(retryData)
          ? retryData
          : retryData.results;

        previousResults = existingResults;

        // Build set of completed task|variantId pairs
        const completedPairs = new Set(
          existingResults.map((
            r: {
              taskId: string;
              context?: { variantId?: string; llmModel?: string };
            },
          ) => `${r.taskId}|${r.context?.variantId || r.context?.llmModel}`),
        );

        log.info(
          `[Retry] Loaded ${existingResults.length} existing results from ${options.retry}`,
        );

        // Build all expected pairs and find missing ones
        const allPairs = taskManifests.flatMap((t) =>
          variants.map((v) => `${t.id}|${v.variantId}`)
        );
        const missingPairs = allPairs.filter((p) => !completedPairs.has(p));

        if (missingPairs.length === 0) {
          log.summary("[Retry] No missing combinations - all tasks completed!");
          return;
        }

        // Extract unique task and variant IDs from missing pairs
        const missingTaskIds = new Set(
          missingPairs.map((p) => p.split("|")[0]),
        );
        const missingVariantIds = new Set(
          missingPairs.map((p) => p.split("|")[1]),
        );

        // Filter to only needed items
        taskManifests = taskManifests.filter((t) => missingTaskIds.has(t.id));
        variants = variants.filter((v) => missingVariantIds.has(v.variantId));

        log.info(
          `[Retry] Running ${missingPairs.length} missing combinations ` +
            `(${taskManifests.length} tasks × ${variants.length} models)`,
        );
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        log.fail(`Failed to load retry file: ${errorMessage}`);
        throw e;
      }
    }

    // Setup container
    const containerName = containerConfig.name || "centralgauge-benchmark";
    const containerProvider =
      !containerProviderName || containerProviderName === "auto"
        ? (containerConfig.provider
          ? ContainerProviderRegistry.create(containerConfig.provider)
          : await ContainerProviderRegistry.getDefault())
        : ContainerProviderRegistry.create(containerProviderName);

    // Pass credentials to provider if available
    if (containerConfig.credentials && "setCredentials" in containerProvider) {
      (containerProvider as import("../../src/container/bc-container-provider.ts").BcContainerProvider)
        .setCredentials(containerName, {
          username: containerConfig.credentials.username || "admin",
          password: containerConfig.credentials.password || "admin",
        });
    }

    // Check if container already exists and is healthy
    let containerReady = false;
    try {
      containerReady = await containerProvider.isHealthy(containerName);
      if (!containerReady) {
        // Container exists but might be stopped - try to start it
        try {
          const status = await containerProvider.status(containerName);
          if (!status.isRunning) {
            log.container(
              `Container ${containerName} exists but is stopped, starting...`,
            );
            await containerProvider.start(containerName);
            // Wait a moment for container to be ready
            await new Promise((resolve) => setTimeout(resolve, 5000));
            containerReady = await containerProvider.isHealthy(containerName);
          }
        } catch {
          // Status check failed, container might not exist
        }
      }
    } catch {
      // Container doesn't exist yet
    }

    if (containerReady) {
      log.container(`Using existing: ${containerName}`);
    } else {
      log.container("Setting up...");
      const setupConfig:
        import("../../src/container/types.ts").ContainerConfig = {
          name: containerName,
          bcVersion: containerConfig.bcVersion || "24.0",
          memoryLimit: containerConfig.memoryLimit || "8G",
          acceptEula: true,
          includeAL: true,
          includeTestToolkit: true,
        };
      if (
        containerConfig.credentials?.username &&
        containerConfig.credentials?.password
      ) {
        setupConfig.credentials = {
          username: containerConfig.credentials.username,
          password: containerConfig.credentials.password,
        };
      }
      await containerProvider.setup(setupConfig);
    }

    // Create parallel orchestrator
    const config = createDefaultConfig();
    config.maxGlobalConcurrency = options.maxConcurrency ?? 10;

    const orchestrator = new ParallelBenchmarkOrchestrator(config);

    if (options.noContinuation) {
      orchestrator.setContinuationEnabled(false);
    }

    // Track pass rates per model
    const modelPassRates = new Map<
      string,
      { total: number; attempt1: number; attempt2: number }
    >();

    const getPassRateColor = (passed: number, total: number): string => {
      if (total === 0) return "dim";
      const rate = passed / total;
      if (rate >= 0.7) return "green";
      if (rate >= 0.4) return "yellow";
      return "red";
    };

    // Initialize TUI if enabled and supported
    let tui: BenchTui | null = null;
    if (tuiMode) {
      if (!isTuiSupported()) {
        console.warn(
          colors.yellow(
            "[WARN] TUI mode requires a terminal. Falling back to console output.",
          ),
        );
      } else {
        tui = new BenchTui();
        tui.start();

        // Set initial progress
        const totalTasks = taskManifests.length * options.llms.length;
        tui.updateProgress({
          completedTasks: 0,
          totalTasks,
          activeLLMCalls: 0,
          compileQueueLength: 0,
          errors: [],
          startTime: new Date(),
          elapsedTime: 0,
        });

        // Add initial status lines
        tui.addLine("[CentralGauge] LLM Benchmark Mode");
        tui.addLine(`Models: ${options.llms.join(", ")}`);
        tui.addLine(`Tasks: ${taskManifests.length} task(s)`);
        tui.addLine(`Container: ${containerName}`);
        tui.addLine("");

        // Intercept console.log to route through TUI
        const originalConsoleLog = console.log;
        console.log = (...args: unknown[]) => {
          const line = args.map((a) =>
            typeof a === "string" ? a : JSON.stringify(a)
          ).join(" ");
          tui!.addLine(line);
        };

        // Restore on destroy
        const originalDestroy = tui.destroy.bind(tui);
        tui.destroy = () => {
          console.log = originalConsoleLog;
          originalDestroy();
        };
      }
    }

    // Subscribe to events
    orchestrator.on((event: ParallelExecutionEvent) => {
      // JSON events mode: output machine-readable JSON lines
      if (jsonEvents) {
        outputJsonEvent(event, modelPassRates);
        return;
      }

      // TUI mode: delegate to TUI handler
      if (tui) {
        tui.handleEvent(event);
        // Still track pass rates for summary display after TUI closes
        if (event.type === "result") {
          const variantId = event.result.context.variantId ||
            event.result.context.llmModel;
          if (!modelPassRates.has(variantId)) {
            modelPassRates.set(variantId, {
              total: 0,
              attempt1: 0,
              attempt2: 0,
            });
          }
          const stats = modelPassRates.get(variantId)!;
          stats.total++;
          if (event.result.passedAttemptNumber === 1) {
            stats.attempt1++;
          } else if (event.result.passedAttemptNumber === 2) {
            stats.attempt2++;
          }
        }
        return;
      }

      // Human-readable output mode
      switch (event.type) {
        case "task_started":
          console.log("");
          log.task(
            `${event.taskId}: Starting with ${event.models.length} models`,
          );
          break;
        case "llm_chunk":
          if (options.stream) {
            Deno.stdout.writeSync(new TextEncoder().encode("."));
          }
          break;
        case "llm_completed":
          log.llm(
            event.model,
            `attempt ${event.attempt}: ${statusText(event.success)}`,
          );
          break;
        case "compile_completed":
          log.compile(event.model, statusText(event.success));
          break;
        case "result": {
          const variantId = event.result.context.variantId ||
            event.result.context.llmModel;
          const status = event.result.success
            ? colors.green("pass")
            : colors.red("fail");
          // Extract test counts from the last attempt's testResult
          const lastAttempt =
            event.result.attempts[event.result.attempts.length - 1];
          const testResult = lastAttempt?.testResult;
          const testInfo = testResult
            ? `, tests: ${testResult.passedTests}/${testResult.totalTests}`
            : "";
          log.llm(
            variantId,
            `${status} (score: ${
              event.result.finalScore.toFixed(1)
            }${testInfo})`,
          );
          // Debug: show full test output if enabled
          if (options.debug && testResult?.output) {
            console.log(
              colors.gray(
                `[Debug] --- Test Output (${variantId}/${event.result.taskId}) ---`,
              ),
            );
            console.log(testResult.output);
            console.log(colors.gray("[Debug] --- End Test Output ---"));
          }
          if (!modelPassRates.has(variantId)) {
            modelPassRates.set(variantId, {
              total: 0,
              attempt1: 0,
              attempt2: 0,
            });
          }
          const stats = modelPassRates.get(variantId)!;
          stats.total++;
          if (event.result.passedAttemptNumber === 1) {
            stats.attempt1++;
          } else if (event.result.passedAttemptNumber === 2) {
            stats.attempt2++;
          }
          break;
        }
        case "task_completed": {
          const { winner, passingModels, bestScore } = event.result.comparison;
          let winnerText: string;
          if (winner) {
            winnerText = colors.bold(winner);
          } else if (passingModels.length > 1) {
            winnerText = colors.yellow("TIE");
          } else if (passingModels.length === 1) {
            winnerText = colors.bold(passingModels[0] || "");
          } else {
            winnerText = colors.red("NONE");
          }
          log.task(
            `Complete - Winner: ${winnerText} (${bestScore.toFixed(1)})`,
          );
          const parts = Array.from(modelPassRates.entries()).map(
            ([m, s]) => {
              const passed = s.attempt1 + s.attempt2;
              const rateColor = getPassRateColor(passed, s.total);
              const colorFn = rateColor === "green"
                ? colors.green
                : rateColor === "yellow"
                ? colors.yellow
                : rateColor === "dim"
                ? colors.dim
                : colors.red;
              const modelColorFn = getModelColor(m);
              return `${modelColorFn(m)} ${
                colorFn(`${passed}/${s.total}`)
              } (1st:${s.attempt1} 2nd:${s.attempt2})`;
            },
          );
          console.log(`Pass rates: ${parts.join(" | ")}`);
          break;
        }
        case "progress":
          if (!quiet) {
            const pct =
              ((event.progress.completedTasks / event.progress.totalTasks) *
                100).toFixed(0);
            log.progress(
              `${pct}% (${event.progress.completedTasks}/${event.progress.totalTasks})`,
            );
          }
          break;
        case "error":
          log.fail(
            `${event.model ? `(${event.model}) ` : ""}${event.error.message}`,
          );
          break;
      }
    });

    // Build parallel options
    const parallelOptions:
      import("../../src/parallel/mod.ts").ParallelBenchmarkOptions = {
        containerName,
        containerProvider: containerProvider.name,
        attemptLimit: options.attempts,
        temperature: options.temperature || 0.1,
        maxTokens: options.maxTokens || 4000,
        outputDir: options.outputDir,
        debugMode: options.debug || false,
        stream: options.stream ?? false,
      };
    if (options.promptOverrides) {
      parallelOptions.promptOverrides = options.promptOverrides;
    }

    // Run parallel benchmark with interactive retry loop
    let allResults = [...previousResults];
    let tasksToRun = taskManifests;
    let variantsToRun = variants;
    let lastSummary: Awaited<
      ReturnType<typeof orchestrator.runParallel>
    >["summary"];
    let retryCount = 0;

    while (true) {
      const { results, summary } = await orchestrator.runParallel(
        tasksToRun,
        variantsToRun,
        parallelOptions,
      );
      lastSummary = summary;

      // Merge results: remove any old results for task+model pairs we just re-ran
      const newResultKeys = new Set(
        results.map((r) =>
          `${r.taskId}|${r.context.variantId || r.context.llmModel}`
        ),
      );
      allResults = [
        ...allResults.filter((r) =>
          !newResultKeys.has(
            `${r.taskId}|${r.context?.variantId || r.context?.llmModel}`,
          )
        ),
        ...results,
      ];

      // Check for failures - distinguish transient vs model output failures
      const failedResults = results.filter((r) => !r.success);
      const transientFailures = failedResults.filter(isTransientFailure);
      const modelFailureCount = failedResults.length - transientFailures.length;
      const isInteractive = !quiet && !jsonEvents && !tuiMode;

      // Only offer retry if there are transient failures worth retrying
      if (transientFailures.length === 0 || !isInteractive) {
        if (modelFailureCount > 0 && isInteractive) {
          console.log(
            colors.dim(
              `\n[Info] ${modelFailureCount} model output failures (compilation/test) - not retryable`,
            ),
          );
        }
        break;
      }

      const shouldRetry = await promptRetryFailed(
        transientFailures.length,
        modelFailureCount,
      );
      if (!shouldRetry) {
        break;
      }

      retryCount++;

      // Filter to only transient failed combinations for next iteration
      const failedTaskIds = new Set(transientFailures.map((r) => r.taskId));
      const failedVariantIds = new Set(
        transientFailures.map((r) => r.context.variantId || r.context.llmModel),
      );

      tasksToRun = taskManifests.filter((t) => failedTaskIds.has(t.id));
      variantsToRun = variants.filter((v) => failedVariantIds.has(v.variantId));

      log.info(
        `[Retry #${retryCount}] Re-running ${transientFailures.length} transient failures...`,
      );
    }

    // Clean up TUI before outputting results
    if (tui) {
      tui.destroy();
      tui = null;
    }

    // Use all accumulated results
    const finalResults = allResults;
    const summary = lastSummary!;

    // Save results
    const timestamp = Date.now();
    const resultsFile =
      `${options.outputDir}/benchmark-results-${timestamp}.json`;
    await Deno.writeTextFile(
      resultsFile,
      JSON.stringify(
        {
          results: finalResults,
          stats: {
            totalTokens: summary.stats.totalTokens,
            totalCost: summary.stats.totalCost,
            totalDuration: summary.stats.totalDuration,
            overallPassRate: summary.stats.overallPassRate,
            averageScore: summary.stats.averageScore,
            perModel: Object.fromEntries(summary.stats.perModel),
            perTask: Object.fromEntries(summary.stats.perTask),
          },
          comparisons: summary.comparisons,
          // Comprehensive hash info for run comparability
          hashInfo: {
            taskSetHash: hashResult.hash,
            testAppManifestHash: hashResult.testAppManifestHash,
            totalFilesHashed: hashResult.totalFilesHashed,
            computedAt: hashResult.computedAt.toISOString(),
            taskHashes: hashResult.tasks.map((t) => ({
              id: t.taskId,
              combined: t.combinedHash,
              fileCount: t.testFiles.length + 1,
            })),
          },
        },
        null,
        2,
      ),
    );

    // Save score file
    const scoreFile = `${options.outputDir}/scores-${timestamp}.txt`;
    const scoreLines: string[] = [
      `# CentralGauge Benchmark Scores`,
      `# ${new Date().toISOString()}`,
      ``,
      `tasks: ${taskManifests.length}`,
      `models: ${variants.map((v) => v.model).join(", ")}`,
      `attempts: ${options.attempts}`,
      ``,
      `# Aggregate Stats`,
      `pass_rate_1: ${(summary.stats.passRate1 * 100).toFixed(1)}%`,
      `pass_rate_2: ${(summary.stats.passRate2 * 100).toFixed(1)}%`,
      `pass_num_1: ${summary.stats.passNum1}/${finalResults.length}`,
      `pass_num_2: ${summary.stats.passNum2}/${finalResults.length}`,
      `compile_errors: ${summary.stats.totalCompileErrors}`,
      `test_failures: ${summary.stats.totalTestFailures}`,
      `malformed: ${summary.stats.totalMalformed}`,
      `avg_score: ${summary.stats.averageScore.toFixed(1)}`,
      `avg_attempts: ${
        (Array.from(summary.stats.perModel.values()).reduce((sum, m) =>
          sum + m.avgAttempts, 0) / summary.stats.perModel.size).toFixed(2)
      }`,
      `seconds_per_task: ${summary.stats.secondsPerTask.toFixed(1)}`,
      `prompt_tokens: ${summary.stats.promptTokens}`,
      `completion_tokens: ${summary.stats.completionTokens}`,
      `total_cost: $${summary.stats.totalCost.toFixed(4)}`,
      ``,
      `# Timing Breakdown`,
      `llm_time_ms: ${summary.stats.totalLLMDuration}`,
      `compile_time_ms: ${summary.stats.totalCompileDuration}`,
      `test_time_ms: ${summary.stats.totalTestDuration}`,
      `total_time_ms: ${summary.stats.totalDuration}`,
      ``,
      `# Per-Model Scores`,
    ];
    for (const [model, modelStats] of summary.stats.perModel) {
      const total = modelStats.tasksPassed + modelStats.tasksFailed;
      const pr1 = total > 0
        ? (modelStats.passedOnAttempt1 / total * 100).toFixed(1)
        : "0.0";
      const pr2 = total > 0
        ? (modelStats.passedOnAttempt2 / total * 100).toFixed(1)
        : "0.0";
      scoreLines.push(
        `${model}: pr1=${pr1}% pr2=${pr2}% score=${
          modelStats.avgScore.toFixed(1)
        } cost=$${modelStats.cost.toFixed(4)}`,
      );
    }
    await Deno.writeTextFile(scoreFile, scoreLines.join("\n"));

    // Print summary
    console.log("");
    log.summary("Benchmark Summary:");
    console.log(`   Total results: ${finalResults.length}`);
    console.log(
      `   Pass rate: ${(summary.stats.overallPassRate * 100).toFixed(1)}%`,
    );
    console.log(`   Average score: ${summary.stats.averageScore.toFixed(1)}`);
    console.log(
      `   Total tokens: ${summary.stats.totalTokens.toLocaleString("en-US")}`,
    );
    console.log(`   Total cost: $${summary.stats.totalCost.toFixed(4)}`);
    console.log(
      `   Runtime: ${formatDurationMs(summary.stats.totalDuration)} (LLM: ${
        formatDurationMs(summary.stats.totalLLMDuration)
      }, Compile: ${
        formatDurationMs(summary.stats.totalCompileDuration)
      }, Test: ${formatDurationMs(summary.stats.totalTestDuration)})`,
    );
    console.log(`   Results: ${colors.gray(resultsFile)}`);
    console.log(`   Scores: ${colors.gray(scoreFile)}`);

    // Create formatter input
    const formatterInput: FormatterInput = {
      stats: summary.stats,
      comparisons: summary.comparisons,
      taskCount: taskManifests.length,
    };

    // Output based on format
    if (outputFormat === "verbose") {
      console.log(formatBenchmarkStats(formatterInput));
      console.log(formatModelSummaryTable(formatterInput));

      if (taskManifests.length > 1) {
        const matrixInput: TaskMatrixInput = {
          ...formatterInput,
          results: summary.results,
        };
        console.log(formatTaskMatrix(matrixInput));
      }
    } else {
      const formatter = getFormatter(outputFormat);
      const formatted = formatter(formatterInput);

      console.log(`\n${"─".repeat(50)}`);
      console.log(colors.bold(`${outputFormat.toUpperCase()} Format:\n`));
      console.log(formatted);

      if (shouldCopyToClipboard(outputFormat)) {
        const copied = await copyToClipboard(formatted);
        if (copied) {
          log.success("Copied to clipboard!");
        }
      }
    }

    // Only cleanup container if we created it
    if (!containerReady) {
      log.container("Cleaning up...");
      await containerProvider.stop(containerName);
      await containerProvider.remove(containerName);
    }

    // Cleanup compiler folders to free disk space
    if (containerProvider.cleanupCompilerFolders) {
      await containerProvider.cleanupCompilerFolders();
    }

    // Finalize debug logging
    if (debugLogger) {
      await debugLogger.finalize();
    }
  } catch (error) {
    // Check if this is a critical infrastructure error
    if (CriticalError.isCriticalError(error)) {
      console.log("");
      log.fail(
        colors.bold("BENCHMARK ABORTED - Critical infrastructure error"),
      );
      log.fail(
        error instanceof Error ? error.message : String(error),
      );
      console.log("");
      console.log(
        colors.yellow(
          "This error invalidates the benchmark run. Please fix the issue and retry.",
        ),
      );
    } else {
      log.fail(
        `Benchmark failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (debugLogger) {
      await debugLogger.finalize();
    }

    throw error;
  }
}

/**
 * Run benchmark in sequential mode (legacy behavior)
 */
async function runBenchmark(
  options: ExtendedBenchmarkOptions,
  quiet = false,
  containerProviderName?: string,
): Promise<void> {
  if (!quiet) {
    await EnvLoader.loadEnvironment();
    await SplashScreen.display({
      showEnvironment: true,
      showConfiguration: true,
      showProviders: true,
      compact: false,
    });
  }

  let debugLogger: DebugLogger | null = null;
  if (options.debug || options.debugLogLevel) {
    const sessionId = `session-${Date.now()}`;
    const logLevel = options.debugLogLevel || "basic";
    const debugConfig = {
      enabled: true,
      outputDir: options.debugOutputDir || "debug",
      sessionId,
      logLevel,
      includeRawResponse: logLevel === "verbose",
      includeRequestHeaders: logLevel !== "basic",
      maxFileSize: 100,
    };

    debugLogger = DebugLogger.initialize(debugConfig);
    console.log(
      `Debug logging enabled: ${debugConfig.outputDir} (level: ${logLevel})`,
    );
  }

  console.log("Starting CentralGauge benchmark...");
  console.log(`Models: ${options.llms.join(", ")}`);
  console.log(`Tasks: ${options.tasks.join(", ")}`);
  console.log(`Attempts: ${options.attempts}`);
  console.log(`Output: ${options.outputDir}`);

  try {
    await Deno.mkdir(options.outputDir, { recursive: true });

    // Load task manifests
    const taskManifests = [];
    for (const taskPattern of options.tasks) {
      for await (const entry of expandGlob(taskPattern)) {
        if (entry.isFile && entry.name.endsWith(".yml")) {
          console.log(`Loading task: ${entry.path}`);
          const manifest = await loadTaskManifest(entry.path);
          taskManifests.push(manifest);
        }
      }
    }

    if (taskManifests.length === 0) {
      console.error(
        "[ERROR] No task manifests found matching patterns:",
        options.tasks,
      );
      return;
    }

    console.log(`Loaded ${taskManifests.length} task(s)`);

    // Setup container
    const containerName = "centralgauge-benchmark";
    const containerProvider =
      !containerProviderName || containerProviderName === "auto"
        ? await ContainerProviderRegistry.getDefault()
        : ContainerProviderRegistry.create(containerProviderName);

    console.log("Setting up container...");
    await containerProvider.setup({
      name: containerName,
      bcVersion: "24.0",
      memoryLimit: "8G",
      acceptEula: true,
      includeAL: true,
      includeTestToolkit: true,
    });

    // Initialize task executor
    const executor = new TaskExecutorV2();

    // Execute benchmark for each model
    const allResults = [];

    for (const llmModelSpec of options.llms) {
      console.log(`\nRunning benchmark with model spec: ${llmModelSpec}`);

      const resolvedSpecs = ModelPresetRegistry.resolve(llmModelSpec);

      for (const resolvedSpec of resolvedSpecs) {
        const { provider: llmProvider, model: llmModel } =
          parseProviderAndModel(resolvedSpec);
        console.log(`Using provider: ${llmProvider} for model: ${llmModel}`);

        for (const manifest of taskManifests) {
          console.log(`\nExecuting task: ${manifest.id}`);

          const request:
            import("../../src/tasks/interfaces.ts").TaskExecutionRequest = {
              taskManifest: manifest,
              llmModel,
              llmProvider,
              containerProvider: containerProvider.name,
              containerName,
              outputDir: options.outputDir,
              attemptLimit: options.attempts,
              temperature: options.temperature || 0.1,
              maxTokens: options.maxTokens || 4000,
              ...(options.promptOverrides &&
                { promptOverrides: options.promptOverrides }),
            };

          try {
            const result = await executor.executeTask(request);
            allResults.push(result);

            console.log(
              `Task ${manifest.id} completed: ${
                result.success ? "pass" : "fail"
              } (score: ${result.finalScore.toFixed(3)})`,
            );
          } catch (error) {
            console.error(
              `Task ${manifest.id} failed: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
        }
      }
    }

    // Save results
    const resultsFile =
      `${options.outputDir}/benchmark-results-${Date.now()}.json`;
    await Deno.writeTextFile(resultsFile, JSON.stringify(allResults, null, 2));

    // Print summary
    console.log(`\nBenchmark Summary:`);
    console.log(`   Total tasks: ${allResults.length}`);
    console.log(`   Passed: ${allResults.filter((r) => r.success).length}`);
    console.log(`   Failed: ${allResults.filter((r) => !r.success).length}`);
    console.log(
      `   Average score: ${
        (allResults.reduce((sum, r) => sum + r.finalScore, 0) /
          allResults.length).toFixed(3)
      }`,
    );
    console.log(`   Results saved to: ${resultsFile}`);

    // Cleanup container
    await containerProvider.stop(containerName);
    await containerProvider.remove(containerName);

    if (debugLogger) {
      await debugLogger.finalize();
    }
  } catch (error) {
    console.error(
      `Benchmark failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );

    if (debugLogger) {
      await debugLogger.finalize();
    }

    throw error;
  }
}

/**
 * Agent benchmark options
 */
interface AgentBenchmarkOptions {
  agents: string[];
  tasks: string[];
  outputDir: string;
  debug?: boolean;
  stream?: boolean;
  tui?: boolean;
  containerName: string;
}

/**
 * Run benchmark using agent configurations
 */
async function runAgentBenchmark(
  options: AgentBenchmarkOptions,
  quiet = false,
): Promise<void> {
  if (!quiet) {
    await EnvLoader.loadEnvironment();
    await SplashScreen.display({
      showEnvironment: true,
      showConfiguration: true,
      showProviders: false,
      compact: false,
    });
  }

  log.summary("Starting CentralGauge benchmark (agent mode)...");
  log.info(`Agents: ${options.agents.join(", ")}`);
  log.info(`Tasks: ${options.tasks.join(", ")}`);
  log.info(`Container: ${options.containerName}`);
  log.info(`Output: ${options.outputDir}`);

  // Load agent configurations
  await AgentRegistry.load("agents");

  // Validate all agents exist
  const agentConfigs = [];
  for (const agentId of options.agents) {
    const config = AgentRegistry.get(agentId);
    if (!config) {
      log.fail(`Agent not found: ${agentId}`);
      log.info(`Available agents: ${AgentRegistry.list().join(", ")}`);
      return;
    }
    agentConfigs.push(config);
  }

  log.task(`Loaded ${agentConfigs.length} agent(s)`);

  // Load task manifests
  const taskManifests = [];
  for (const taskPattern of options.tasks) {
    for await (const entry of expandGlob(taskPattern)) {
      if (entry.isFile && entry.name.endsWith(".yml")) {
        log.task(`Loading: ${entry.path}`);
        const manifest = await loadTaskManifest(entry.path);
        taskManifests.push(manifest);
      }
    }
  }

  if (taskManifests.length === 0) {
    log.fail(
      `No task manifests found matching patterns: ${options.tasks.join(", ")}`,
    );
    return;
  }

  log.task(`Loaded ${taskManifests.length} task(s)`);

  // Create output directory
  await Deno.mkdir(options.outputDir, { recursive: true });

  const startTime = Date.now();
  const totalTasks = taskManifests.length * agentConfigs.length;
  let completedTasks = 0;

  // Initialize TUI if enabled and supported
  let tui: BenchTui | null = null;
  if (options.tui) {
    if (!isTuiSupported()) {
      console.warn(
        colors.yellow(
          "[WARN] TUI mode requires a terminal. Falling back to console output.",
        ),
      );
    } else {
      tui = new BenchTui();
      tui.start();

      // Set initial progress
      tui.updateProgress({
        completedTasks: 0,
        totalTasks,
        activeLLMCalls: 0,
        compileQueueLength: 0,
        errors: [],
        startTime: new Date(startTime),
        elapsedTime: 0,
      });

      // Add initial status lines
      tui.addLine("[CentralGauge] Agent Benchmark Mode");
      tui.addLine(`Agents: ${options.agents.join(", ")}`);
      tui.addLine(`Tasks: ${taskManifests.length} task(s)`);
      tui.addLine(`Container: ${options.containerName}`);
      tui.addLine("");

      // Intercept console.log to route through TUI
      const originalConsoleLog = console.log;
      console.log = (...args: unknown[]) => {
        const line = args.map((a) =>
          typeof a === "string" ? a : JSON.stringify(a)
        ).join(" ");
        tui!.addLine(line);
      };

      // Restore on destroy (store for cleanup)
      const originalDestroy = tui.destroy.bind(tui);
      tui.destroy = () => {
        console.log = originalConsoleLog;
        originalDestroy();
      };
    }
  }

  // Helper to output either to TUI or console
  const output = (line: string) => {
    if (tui) {
      tui.addLine(line);
    } else {
      console.log(line);
    }
  };

  // Execute each agent on each task
  const executor = new AgentTaskExecutor();
  const allResults: Array<{
    agentId: string;
    taskId: string;
    result: AgentExecutionResult;
  }> = [];

  // Track agent stats for TUI
  const agentPassRates = new Map<string, { total: number; passed: number }>();

  for (const task of taskManifests) {
    output(`[Task] ${task.id}: Running with ${agentConfigs.length} agent(s)`);

    for (const agentConfig of agentConfigs) {
      // Create a unique workspace for this agent+task
      const projectDir = join(
        Deno.cwd(),
        options.outputDir,
        "agent-workspace",
        `${agentConfig.id}_${task.id}_${Date.now()}`,
      );

      output(`[${agentConfig.id}] Starting...`);

      try {
        const result = await executor.execute(agentConfig, task, {
          projectDir,
          containerName: options.containerName,
          containerProvider: "bccontainer",
          debug: options.debug ?? false,
        });

        allResults.push({
          agentId: agentConfig.id,
          taskId: task.id,
          result,
        });

        const status = result.success ? "pass" : "fail";
        const testResult = result.testResult;
        const testInfo = testResult
          ? ` (tests: ${testResult.passedTests}/${testResult.totalTests})`
          : "";

        output(
          `[${agentConfig.id}] ${status}${testInfo}, turns: ${result.metrics.turns}, cost: $${
            result.metrics.estimatedCost.toFixed(4)
          }`,
        );

        // Update TUI model stats
        if (tui) {
          tui.updateModelStats(agentConfig.id, result.success);
        }

        // Track for summary
        if (!agentPassRates.has(agentConfig.id)) {
          agentPassRates.set(agentConfig.id, { total: 0, passed: 0 });
        }
        const stats = agentPassRates.get(agentConfig.id)!;
        stats.total++;
        if (result.success) stats.passed++;
      } catch (error) {
        output(
          `[FAIL] ${agentConfig.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      // Update TUI progress
      completedTasks++;
      if (tui) {
        const elapsed = Date.now() - startTime;
        const avgTimePerTask = elapsed / completedTasks;
        const remaining = totalTasks - completedTasks;
        tui.updateProgress({
          completedTasks,
          totalTasks,
          activeLLMCalls: remaining > 0 ? 1 : 0,
          compileQueueLength: 0,
          estimatedTimeRemaining: remaining * avgTimePerTask,
          errors: [],
          startTime: new Date(startTime),
          elapsedTime: elapsed,
        });
      }
    }
  }

  // Destroy TUI before printing summary
  if (tui) {
    tui.destroy();
  }

  const totalDuration = Date.now() - startTime;

  // Calculate summary statistics
  const agentStats = new Map<string, {
    passed: number;
    failed: number;
    totalCost: number;
    totalTurns: number;
    totalTokens: number;
  }>();

  for (const { agentId, result } of allResults) {
    if (!agentStats.has(agentId)) {
      agentStats.set(agentId, {
        passed: 0,
        failed: 0,
        totalCost: 0,
        totalTurns: 0,
        totalTokens: 0,
      });
    }
    const stats = agentStats.get(agentId)!;
    if (result.success) {
      stats.passed++;
    } else {
      stats.failed++;
    }
    stats.totalCost += result.metrics.estimatedCost;
    stats.totalTurns += result.metrics.turns;
    stats.totalTokens += result.metrics.totalTokens;
  }

  // Print summary
  console.log("");
  console.log(colors.bold("=".repeat(60)));
  console.log(colors.bold("AGENT BENCHMARK RESULTS"));
  console.log("=".repeat(60));

  console.log("\n" + colors.bold("Summary:"));
  console.log("-".repeat(60));
  console.log(
    `${"Agent".padEnd(20)} | ${"Pass".padEnd(6)} | ${"Fail".padEnd(6)} | ${
      "Cost".padEnd(10)
    } | Turns`,
  );
  console.log("-".repeat(60));

  for (const [agentId, stats] of agentStats) {
    const passColor = stats.passed > stats.failed ? colors.green : colors.red;

    console.log(
      `${agentId.padEnd(20)} | ${passColor(String(stats.passed).padEnd(6))} | ${
        String(stats.failed).padEnd(6)
      } | $${stats.totalCost.toFixed(4).padEnd(9)} | ${stats.totalTurns}`,
    );
  }
  console.log("-".repeat(60));

  // Comparison
  if (agentStats.size === 2) {
    const entries = Array.from(agentStats.entries());
    const [aId, aStats] = entries[0]!;
    const [bId, bStats] = entries[1]!;

    const aPassRate = aStats.passed / (aStats.passed + aStats.failed) || 0;
    const bPassRate = bStats.passed / (bStats.passed + bStats.failed) || 0;

    console.log("\n" + colors.bold("Comparison:"));

    if (aPassRate > bPassRate) {
      console.log(
        `  Winner: ${colors.green(aId)} (${(aPassRate * 100).toFixed(0)}% vs ${
          (bPassRate * 100).toFixed(0)
        }%)`,
      );
    } else if (bPassRate > aPassRate) {
      console.log(
        `  Winner: ${colors.green(bId)} (${(bPassRate * 100).toFixed(0)}% vs ${
          (aPassRate * 100).toFixed(0)
        }%)`,
      );
    } else {
      console.log(
        `  Result: ${colors.yellow("TIE")} (${(aPassRate * 100).toFixed(0)}%)`,
      );
    }

    const costDiff = bStats.totalCost - aStats.totalCost;
    console.log(
      `  Cost difference: ${costDiff >= 0 ? "+" : ""}$${
        costDiff.toFixed(4)
      } (${bId} vs ${aId})`,
    );
  }

  console.log(`\n  Total duration: ${formatDurationMs(totalDuration)}`);
  console.log(`  Results: ${allResults.length}`);

  // Save results
  const timestamp = Date.now();
  const resultsFile = `${options.outputDir}/agent-benchmark-${timestamp}.json`;
  await Deno.writeTextFile(
    resultsFile,
    JSON.stringify(
      {
        agents: options.agents,
        tasks: options.tasks,
        results: allResults,
        stats: Object.fromEntries(agentStats),
        duration: totalDuration,
        timestamp: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(`  Saved: ${colors.gray(resultsFile)}`);
}

export function registerBenchCommand(cli: Command): void {
  cli.command("bench", "Run benchmark evaluation")
    .option(
      "-l, --llms <models:string[]>",
      "LLM models to test (provider/model format)",
    )
    .option(
      "--agents <agents:string[]>",
      "Agent configurations to use (from agents/ directory)",
    )
    .option("-t, --tasks <patterns:string[]>", "Task file patterns", {
      default: ["tasks/**/*.yml"],
    })
    .option("-a, --attempts <number>", "Number of attempts per task", {
      default: 2,
    })
    .option("-o, --output <dir>", "Output directory", { default: "results/" })
    .option("--temperature <number>", "LLM temperature", { default: 0.1 })
    .option("--max-tokens <number>", "Maximum tokens per request", {
      default: 4000,
    })
    .option("-q, --quiet", "Disable splash screen and verbose output", {
      default: false,
    })
    .option("--debug", "Enable debug logging of LLM requests/responses", {
      default: false,
    })
    .option("--debug-output <dir>", "Debug output directory", {
      default: "debug/",
    })
    .option("--debug-level <level>", "Debug log level (basic|detailed|verbose)")
    .option(
      "--container-provider <provider>",
      "Container provider to use (docker|bccontainer|mock)",
      { default: "auto" },
    )
    .option(
      "--sequential",
      "Run in sequential mode (disable parallel execution)",
      { default: false },
    )
    .option(
      "--max-concurrency <number>",
      "Maximum concurrent LLM calls (parallel mode only)",
      { default: 10 },
    )
    .option(
      "-f, --format <format:string>",
      "Output format: verbose, leaderboard, scorecard, barchart, json",
      { default: "verbose" },
    )
    .option(
      "--system-prompt <prompt:string>",
      "Override system prompt for all LLM calls",
    )
    .option(
      "--prompt-prefix <text:string>",
      "Prefix to add before the user prompt",
    )
    .option(
      "--prompt-suffix <text:string>",
      "Suffix to add after the user prompt",
    )
    .option(
      "--prompt-stage <stage:string>",
      "Apply prompt overrides to: generation, fix, or both",
      { default: "both" },
    )
    .option(
      "--prompt-provider <provider:string>",
      "Only apply prompt overrides to this provider",
    )
    .option(
      "--no-continuation",
      "Disable automatic continuation for truncated responses",
      { default: false },
    )
    .option(
      "--stream",
      "Enable streaming mode (show real-time progress)",
      { default: false },
    )
    .option(
      "--json-events",
      "Output progress as JSON lines (for TUI/machine parsing)",
      { default: false },
    )
    .option(
      "--tui",
      "Enable TUI mode with split-pane progress display",
      { default: false },
    )
    .option(
      "--retry <file:string>",
      "Retry missing task+model combinations from a previous results file",
    )
    .action(async (options) => {
      // Validate that at least one of --llms or --agents is provided
      if (
        (!options.llms || options.llms.length === 0) &&
        (!options.agents || options.agents.length === 0)
      ) {
        console.error(
          colors.red(
            "[ERROR] Either --llms or --agents must be specified",
          ),
        );
        Deno.exit(1);
      }

      // Handle agent-based execution
      if (options.agents && options.agents.length > 0) {
        const agentBenchOptions = {
          agents: options.agents,
          tasks: [...options.tasks],
          outputDir: options.output,
          debug: options.debug,
          stream: options.stream,
          tui: options.tui,
          containerName: "Cronus27", // Default container
        };
        await runAgentBenchmark(agentBenchOptions, options.quiet);
        Deno.exit(0);
      }

      // Build prompt overrides from CLI options
      let promptOverrides: CLIPromptOverrides | undefined;
      if (
        options.systemPrompt || options.promptPrefix || options.promptSuffix
      ) {
        promptOverrides = {};
        if (options.systemPrompt) {
          promptOverrides.systemPrompt = options.systemPrompt;
        }
        if (options.promptPrefix) {
          promptOverrides.prefix = options.promptPrefix;
        }
        if (options.promptSuffix) {
          promptOverrides.suffix = options.promptSuffix;
        }
        if (options.promptStage && options.promptStage !== "both") {
          promptOverrides.stage = options.promptStage as InjectionStage;
        } else {
          promptOverrides.stage = "both";
        }
        if (options.promptProvider) {
          promptOverrides.provider = options.promptProvider;
        }
      }

      const benchOptions: ExtendedBenchmarkOptions = {
        llms: options.llms || [],
        tasks: [...options.tasks],
        attempts: typeof options.attempts === "number"
          ? options.attempts
          : parseInt(String(options.attempts), 10),
        outputDir: options.output,
        temperature: typeof options.temperature === "number"
          ? options.temperature
          : parseFloat(String(options.temperature)),
        maxTokens: typeof options.maxTokens === "number"
          ? options.maxTokens
          : parseInt(String(options.maxTokens), 10),
        debug: options.debug,
        debugOutputDir: options.debugOutput,
        debugLogLevel: options.debugLevel as "basic" | "detailed" | "verbose",
        sequential: options.sequential,
        maxConcurrency: typeof options.maxConcurrency === "number"
          ? options.maxConcurrency
          : parseInt(String(options.maxConcurrency), 10),
        stream: options.stream,
      };
      if (options.retry) {
        benchOptions.retry = options.retry;
      }
      if (promptOverrides) {
        benchOptions.promptOverrides = promptOverrides;
      }

      // Log prompt overrides if provided
      if (promptOverrides) {
        console.log("Prompt overrides enabled:");
        if (promptOverrides.systemPrompt) {
          console.log(
            `   System: ${promptOverrides.systemPrompt.slice(0, 50)}...`,
          );
        }
        if (promptOverrides.prefix) {
          console.log(`   Prefix: ${promptOverrides.prefix.slice(0, 50)}...`);
        }
        if (promptOverrides.suffix) {
          console.log(`   Suffix: ${promptOverrides.suffix.slice(0, 50)}...`);
        }
        if (promptOverrides.stage) {
          console.log(`   Stage: ${promptOverrides.stage}`);
        }
        if (promptOverrides.provider) {
          console.log(`   Provider: ${promptOverrides.provider}`);
        }
      }

      // Use parallel mode by default
      if (options.sequential) {
        console.log("Running in sequential mode (legacy)");
        await runBenchmark(
          benchOptions,
          options.quiet,
          options.containerProvider,
        );
      } else {
        const outputFormat = (options.format || "verbose") as OutputFormat;
        await runParallelBenchmark(
          benchOptions,
          options.quiet || options.jsonEvents || options.tui, // Quiet mode for JSON/TUI output
          options.containerProvider,
          outputFormat,
          options.jsonEvents ?? false,
          options.tui ?? false,
        );
      }
      // Explicitly exit to close any lingering connections
      Deno.exit(0);
    });
}
