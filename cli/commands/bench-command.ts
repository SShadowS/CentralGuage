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
import type { ExtendedBenchmarkOptions } from "../types/cli-types.ts";

/**
 * Run benchmark in parallel mode (default)
 */
async function runParallelBenchmark(
  options: ExtendedBenchmarkOptions,
  quiet = false,
  containerProviderName?: string,
  outputFormat: OutputFormat = "verbose",
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
        `No task manifests found matching patterns: ${
          options.tasks.join(", ")
        }`,
      );
      return;
    }

    log.task(`Loaded ${taskManifests.length} task(s)`);

    // Load config
    const appConfig = await ConfigManager.loadConfig();
    const containerConfig = appConfig.container || {};

    // Resolve all models with variant support
    const variants: ModelVariant[] = ModelPresetRegistry.resolveWithVariants(
      options.llms,
      appConfig,
    );

    log.info(
      `Running with ${variants.length} model variant(s): ${
        variants.map((v) => getVariantDisplayName(v)).join(", ")
      }`,
    );

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

    // Subscribe to events
    orchestrator.on((event: ParallelExecutionEvent) => {
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
          log.llm(
            variantId,
            `${status} (score: ${event.result.finalScore.toFixed(1)})`,
          );
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

    // Run parallel benchmark
    const { results, summary } = await orchestrator.runParallel(
      taskManifests,
      variants,
      parallelOptions,
    );

    // Save results
    const timestamp = Date.now();
    const resultsFile =
      `${options.outputDir}/benchmark-results-${timestamp}.json`;
    await Deno.writeTextFile(
      resultsFile,
      JSON.stringify(
        {
          results,
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
      `pass_num_1: ${summary.stats.passNum1}/${results.length}`,
      `pass_num_2: ${summary.stats.passNum2}/${results.length}`,
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
    console.log(`   Total results: ${results.length}`);
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

    // Finalize debug logging
    if (debugLogger) {
      await debugLogger.finalize();
    }
  } catch (error) {
    log.fail(
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

export function registerBenchCommand(cli: Command): void {
  cli.command("bench", "Run benchmark evaluation")
    .option(
      "-l, --llms <models:string[]>",
      "LLM models to test (provider/model format)",
      { required: true },
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
    .action(async (options) => {
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
        llms: options.llms,
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
          options.quiet,
          options.containerProvider,
          outputFormat,
        );
      }
      // Explicitly exit to close any lingering connections
      Deno.exit(0);
    });
}
