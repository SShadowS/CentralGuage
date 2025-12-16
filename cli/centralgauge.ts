#!/usr/bin/env -S deno run --allow-all

import { Command } from "@cliffy/command";
import { exists } from "@std/fs";
import { expandGlob } from "@std/fs";
import * as colors from "@std/fmt/colors";
import type { BenchmarkOptions } from "../types/index.ts";
import { ContainerProviderRegistry } from "../src/container/registry.ts";
import { ALProjectManager } from "../src/compiler/al-project.ts";
import { LLMAdapterRegistry } from "../src/llm/registry.ts";
import { loadTaskManifest } from "../src/tasks/loader.ts";
import { TaskExecutorV2 } from "../src/tasks/executor-v2.ts";
import type { ContainerConfig } from "../src/container/types.ts";
import type { TaskExecutionRequest } from "../src/tasks/interfaces.ts";
import type { CLIPromptOverrides, InjectionStage } from "../src/prompts/mod.ts";
import {
  MODEL_PRESETS,
  ModelPresetRegistry,
} from "../src/llm/model-presets.ts";
import type { ModelVariant } from "../src/llm/variant-types.ts";
import { getVariantDisplayName } from "../src/llm/variant-parser.ts";
import { ConfigManager } from "../src/config/config.ts";
import { EnvLoader } from "../src/utils/env-loader.ts";
import { SplashScreen } from "../src/utils/splash-screen.ts";
import { DebugLogger } from "../src/utils/debug-logger.ts";
import {
  createDefaultConfig,
  ParallelBenchmarkOrchestrator,
} from "../src/parallel/mod.ts";
import type { ParallelExecutionEvent } from "../src/parallel/mod.ts";
import {
  formatBenchmarkStats,
  formatModelSummaryTable,
  formatTaskMatrix,
  type FormatterInput,
  getFormatter,
  type OutputFormat,
  shouldCopyToClipboard,
  type TaskMatrixInput,
} from "../src/utils/formatters.ts";
import { copyToClipboard } from "../src/utils/clipboard.ts";

const VERSION = "0.1.0";

// =============================================================================
// Color-coded output helpers
// =============================================================================

/** Color palette for different models (cycles through these) */
const MODEL_COLORS = [
  colors.magenta,
  colors.yellow,
  colors.cyan,
  colors.blue,
  colors.green,
  colors.red,
];

/** Track model-to-color assignments */
const modelColorMap = new Map<string, (str: string) => string>();
let colorIndex = 0;

/** Get consistent color for a model */
function getModelColor(model: string): (str: string) => string {
  if (!modelColorMap.has(model)) {
    const colorFn = MODEL_COLORS[colorIndex % MODEL_COLORS.length];
    if (colorFn) {
      modelColorMap.set(model, colorFn);
    }
    colorIndex++;
  }
  return modelColorMap.get(model) || colors.white;
}

/** Output prefixes with colors */
const log = {
  // Channels
  container: (msg: string) => console.log(colors.cyan(`[Container] ${msg}`)),
  task: (msg: string) => console.log(colors.blue(`[Task] ${msg}`)),
  llm: (model: string, msg: string) => {
    const colorFn = getModelColor(model);
    console.log(colorFn(`[${model}] ${msg}`));
  },
  compile: (model: string, msg: string) => {
    const colorFn = getModelColor(model);
    console.log(colorFn(`  [Compile] ${msg}`));
  },
  test: (model: string, msg: string) => {
    const colorFn = getModelColor(model);
    console.log(colorFn(`  [Test] ${msg}`));
  },

  // Status
  success: (msg: string) => console.log(colors.green(`[OK] ${msg}`)),
  fail: (msg: string) => console.log(colors.red(`[FAIL] ${msg}`)),
  warn: (msg: string) => console.log(colors.yellow(`[WARN] ${msg}`)),
  info: (msg: string) => console.log(colors.gray(msg)),

  // Progress
  progress: (msg: string) => console.log(colors.gray(`[Progress] ${msg}`)),
  summary: (msg: string) => console.log(colors.bold(msg)),

  // Generic with prefix
  prefix: (
    prefix: string,
    msg: string,
    color: (s: string) => string = colors.white,
  ) => console.log(color(`[${prefix}] ${msg}`)),
};

/** Format result status */
function statusText(success: boolean): string {
  return success ? colors.green("OK") : colors.red("FAIL");
}

/**
 * Parse provider and model from various formats:
 * - Aliases: "sonnet", "gpt-4o", "haiku"
 * - Groups: "flagship", "budget", "coding"
 * - Provider/model: "openai/gpt-4o", "anthropic/claude-3-5-sonnet-20241022"
 * - Legacy patterns: "gpt-4", "claude-3-sonnet" (with warnings)
 */
function parseProviderAndModel(
  modelSpec: string,
): { provider: string; model: string } {
  // First try to resolve through preset system (handles aliases, groups, and provider/model)
  const resolved = ModelPresetRegistry.resolve(modelSpec);

  const resolvedSpec = resolved[0];
  if (resolved.length === 1 && resolvedSpec && resolvedSpec !== modelSpec) {
    // Successfully resolved to a different spec, parse the resolved spec
    if (resolvedSpec.includes("/")) {
      const parts = resolvedSpec.split("/");
      const provider = parts[0] || "";
      const model = parts.slice(1).join("/");

      // Validate provider
      const validProviders = [
        "openai",
        "anthropic",
        "gemini",
        "azure-openai",
        "local",
        "mock",
      ];
      if (validProviders.includes(provider)) {
        return { provider, model };
      }
    }
  }

  // If not resolved or is already provider/model format, handle directly
  if (modelSpec.includes("/")) {
    const parts = modelSpec.split("/");
    const provider = parts[0] || "";
    const model = parts.slice(1).join("/"); // Handle models with slashes like "models/gemini-pro"

    // Validate provider
    const validProviders = [
      "openai",
      "anthropic",
      "gemini",
      "azure-openai",
      "local",
      "mock",
    ];
    if (validProviders.includes(provider)) {
      return { provider, model };
    } else {
      console.warn(`⚠️  Unknown provider: ${provider}, using mock adapter`);
      return { provider: "mock", model: modelSpec };
    }
  }

  // Backwards compatibility: detect provider from model name patterns
  console.warn(
    `⚠️  Using pattern detection for model: ${modelSpec}. Consider using aliases or provider/model format.`,
  );

  let provider: string;

  // OpenAI models
  if (
    modelSpec.startsWith("gpt-") || modelSpec.startsWith("o1-") ||
    modelSpec.startsWith("o3-")
  ) {
    provider = "openai";
  } // Anthropic Claude models
  else if (modelSpec.startsWith("claude-")) {
    provider = "anthropic";
  } // Google Gemini models
  else if (
    modelSpec.startsWith("gemini-") || modelSpec.startsWith("models/gemini-")
  ) {
    provider = "gemini";
  } // Azure OpenAI (usually with deployment name)
  else if (
    modelSpec.includes("azure") || Deno.env.get("AZURE_OPENAI_ENDPOINT")
  ) {
    provider = "azure-openai";
  } // Local models (Ollama, etc.)
  else if (
    modelSpec.startsWith("llama") || modelSpec.startsWith("codellama") ||
    modelSpec.startsWith("mistral") || modelSpec.startsWith("qwen") ||
    Deno.env.get("OLLAMA_HOST") || Deno.env.get("LOCAL_LLM_ENDPOINT")
  ) {
    provider = "local";
  } // Default to mock for unknown models
  else {
    console.warn(`⚠️  Unknown model format: ${modelSpec}, using mock adapter`);
    provider = "mock";
  }

  return { provider, model: modelSpec };
}

/**
 * Extended benchmark options with parallel execution settings
 */
interface ExtendedBenchmarkOptions extends BenchmarkOptions {
  sequential?: boolean;
  maxConcurrency?: number;
  // Prompt injection overrides
  promptOverrides?: CLIPromptOverrides;
  // Output format
  format?: OutputFormat;
}

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

  // Initialize debug logging if enabled (--debug or --debug-level implies debug mode)
  let debugLogger: DebugLogger | null = null;
  if (options.debug || options.debugLogLevel) {
    const sessionId = `session-${Date.now()}`;
    const debugConfig = {
      enabled: true,
      outputDir: options.debugOutputDir || "debug",
      sessionId,
      logLevel: options.debugLogLevel || "basic",
      includeRawResponse: options.debugLogLevel === "verbose",
      includeRequestHeaders: options.debugLogLevel !== "basic",
      maxFileSize: 100, // 100MB
    };

    debugLogger = DebugLogger.initialize(debugConfig);
    console.log(
      `🔍 Debug logging enabled: ${debugConfig.outputDir} (level: ${debugConfig.logLevel})`,
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

    // Load config for container settings and variant profiles
    const appConfig = await ConfigManager.loadConfig();
    const containerConfig = appConfig.container || {};

    // Resolve all models with variant support
    // This allows specs like "sonnet@temp=0.5" or "gpt-4o@profile=creative"
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
      (containerProvider as import("../src/container/bc-container-provider.ts").BcContainerProvider)
        .setCredentials(containerName, {
          username: containerConfig.credentials.username || "admin",
          password: containerConfig.credentials.password || "admin",
        });
    }

    // Check if container already exists and is healthy (for bccontainer provider)
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
      const setupConfig: import("../src/container/types.ts").ContainerConfig = {
        name: containerName,
        bcVersion: containerConfig.bcVersion || "24.0",
        memoryLimit: containerConfig.memoryLimit || "8G",
        acceptEula: true,
        includeAL: true,
        includeTestToolkit: true,
      };
      // Only add credentials if both username and password are defined
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

    // Track pass rates per model for live display
    const modelPassRates = new Map<
      string,
      { total: number; attempt1: number; attempt2: number }
    >();

    /** Get color based on pass rate */
    const getPassRateColor = (passed: number, total: number): string => {
      if (total === 0) return "dim";
      const rate = passed / total;
      if (rate >= 0.7) return "green";
      if (rate >= 0.4) return "yellow";
      return "red";
    };

    // Subscribe to events for progress reporting
    orchestrator.on((event: ParallelExecutionEvent) => {
      switch (event.type) {
        case "task_started":
          console.log(""); // blank line before task
          log.task(
            `${event.taskId}: Starting with ${event.models.length} models`,
          );
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
          // Use variantId for tracking (distinguishes same model with different configs)
          const variantId = event.result.context.variantId ||
            event.result.context.llmModel;
          const status = event.result.success
            ? colors.green("pass")
            : colors.red("fail");
          log.llm(
            variantId,
            `${status} (score: ${event.result.finalScore.toFixed(1)})`,
          );
          // Track pass rates by variant
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
            // Multiple models passed with same score - it's a tie
            winnerText = colors.yellow("TIE");
          } else if (passingModels.length === 1) {
            // Only one passed - they're the winner (shouldn't happen if winner is set correctly)
            winnerText = colors.bold(passingModels[0] || "");
          } else {
            // No models passed - no winner
            winnerText = colors.red("NONE");
          }
          log.task(
            `Complete - Winner: ${winnerText} (${bestScore.toFixed(1)})`,
          );
          // Display pass rates for all models
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
      import("../src/parallel/mod.ts").ParallelBenchmarkOptions = {
        containerName,
        containerProvider: containerProvider.name,
        attemptLimit: options.attempts,
        temperature: options.temperature || 0.1,
        maxTokens: options.maxTokens || 4000,
        outputDir: options.outputDir,
        debugMode: options.debug || false,
      };
    if (options.promptOverrides) {
      parallelOptions.promptOverrides = options.promptOverrides;
    }

    // Run parallel benchmark with variant support
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

    // Save score file (simple format for tracking over time)
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
      // Verbose mode: Show detailed stats and tables (Aider-style)
      console.log(formatBenchmarkStats(formatterInput));
      console.log(formatModelSummaryTable(formatterInput));

      // Show task matrix for multi-task runs
      if (taskManifests.length > 1) {
        const matrixInput: TaskMatrixInput = {
          ...formatterInput,
          results: summary.results,
        };
        console.log(formatTaskMatrix(matrixInput));
      }
    } else {
      // Social/compact formats
      const formatter = getFormatter(outputFormat);
      const formatted = formatter(formatterInput);

      console.log(`\n${"─".repeat(50)}`);
      console.log(colors.bold(`${outputFormat.toUpperCase()} Format:\n`));
      console.log(formatted);

      // Copy to clipboard for social formats
      if (shouldCopyToClipboard(outputFormat)) {
        const copied = await copyToClipboard(formatted);
        if (copied) {
          log.success("Copied to clipboard!");
        }
      }
    }

    // Only cleanup container if we created it (not pre-existing)
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

    // Finalize debug logging even on error
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
    // Load environment and display splash screen
    await EnvLoader.loadEnvironment();
    await SplashScreen.display({
      showEnvironment: true,
      showConfiguration: true,
      showProviders: true,
      compact: false,
    });
  }

  // Initialize debug logging if enabled (--debug or --debug-level implies debug mode)
  let debugLogger: DebugLogger | null = null;
  if (options.debug || options.debugLogLevel) {
    const sessionId = `session-${Date.now()}`;
    const debugConfig = {
      enabled: true,
      outputDir: options.debugOutputDir || "debug",
      sessionId,
      logLevel: options.debugLogLevel || "basic",
      includeRawResponse: options.debugLogLevel === "verbose",
      includeRequestHeaders: options.debugLogLevel !== "basic",
      maxFileSize: 100, // 100MB
    };

    debugLogger = DebugLogger.initialize(debugConfig);
    console.log(
      `🔍 Debug logging enabled: ${debugConfig.outputDir} (level: ${debugConfig.logLevel})`,
    );
  }

  console.log("🚀 Starting CentralGauge benchmark...");
  console.log(`Models: ${options.llms.join(", ")}`);
  console.log(`Tasks: ${options.tasks.join(", ")}`);
  console.log(`Attempts: ${options.attempts}`);
  console.log(`Output: ${options.outputDir}`);

  try {
    // Ensure output directory exists
    await Deno.mkdir(options.outputDir, { recursive: true });

    // Load task manifests
    const taskManifests = [];
    for (const taskPattern of options.tasks) {
      for await (const entry of expandGlob(taskPattern)) {
        if (entry.isFile && entry.name.endsWith(".yml")) {
          console.log(`📋 Loading task: ${entry.path}`);
          const manifest = await loadTaskManifest(entry.path);
          taskManifests.push(manifest);
        }
      }
    }

    if (taskManifests.length === 0) {
      console.error(
        "❌ No task manifests found matching patterns:",
        options.tasks,
      );
      return;
    }

    console.log(`📋 Loaded ${taskManifests.length} task(s)`);

    // Setup container (use specified provider or auto-detect)
    const containerName = "centralgauge-benchmark";
    const containerProvider =
      !containerProviderName || containerProviderName === "auto"
        ? await ContainerProviderRegistry.getDefault()
        : ContainerProviderRegistry.create(containerProviderName);

    console.log("🐳 Setting up container...");
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

    // Execute benchmark for each model (expanding groups if needed)
    const allResults = [];

    for (const llmModelSpec of options.llms) {
      console.log(`\n🤖 Running benchmark with model spec: ${llmModelSpec}`);

      // Resolve spec to actual models (handles groups, aliases, and provider/model)
      const resolvedSpecs = ModelPresetRegistry.resolve(llmModelSpec);

      for (const resolvedSpec of resolvedSpecs) {
        // Parse provider and model from resolved spec
        const { provider: llmProvider, model: llmModel } =
          parseProviderAndModel(resolvedSpec);
        console.log(`🔧 Using provider: ${llmProvider} for model: ${llmModel}`);

        for (const manifest of taskManifests) {
          console.log(`\n📝 Executing task: ${manifest.id}`);

          const request: TaskExecutionRequest = {
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
              `✨ Task ${manifest.id} completed: ${
                result.success ? "pass" : "fail"
              } (score: ${result.finalScore.toFixed(3)})`,
            );
          } catch (error) {
            console.error(
              `❌ Task ${manifest.id} failed: ${
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
    console.log(`\n📊 Benchmark Summary:`);
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

    // Finalize debug logging
    if (debugLogger) {
      await debugLogger.finalize();
    }
  } catch (error) {
    console.error(
      `❌ Benchmark failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );

    // Finalize debug logging even on error
    if (debugLogger) {
      await debugLogger.finalize();
    }

    throw error;
  }
}

async function generateReport(
  resultsDir: string,
  outputDir: string,
  html: boolean,
): Promise<void> {
  console.log("📊 Generating report...");
  console.log(`Results: ${resultsDir}`);
  console.log(`Output: ${outputDir}`);
  console.log(`HTML: ${html}`);

  try {
    // Ensure output directory exists
    await Deno.mkdir(outputDir, { recursive: true });

    if (html) {
      console.log("🏗️  Building HTML report...");

      // Find all JSON result files in the results directory
      const jsonFiles = [];
      for await (const entry of expandGlob(`${resultsDir}/**/*.json`)) {
        if (entry.isFile && entry.name.endsWith(".json")) {
          jsonFiles.push(entry.path);
        }
      }

      if (jsonFiles.length === 0) {
        console.error("❌ No JSON result files found in results directory");
        return;
      }

      console.log(`📄 Found ${jsonFiles.length} result file(s)`);

      // Read and merge all result files
      const allResults = [];
      for (const jsonFile of jsonFiles) {
        try {
          const content = await Deno.readTextFile(jsonFile);
          const results = JSON.parse(content);
          if (Array.isArray(results)) {
            allResults.push(...results);
          } else {
            allResults.push(results);
          }
          console.log(`📋 Loaded results from ${jsonFile}`);
        } catch (error) {
          console.warn(
            `⚠️  Failed to parse ${jsonFile}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      // Create a data file for the SvelteKit app
      const dataFile = `reports/src/lib/data.ts`;
      const dataContent = `// Auto-generated benchmark data
export const benchmarkData = ${JSON.stringify(allResults, null, 2)};`;

      await Deno.writeTextFile(dataFile, dataContent);
      console.log("💾 Generated data file for HTML report");

      // Update the main page to load the data
      const pageFile = `reports/src/routes/+page.svelte`;
      const pageContent = await Deno.readTextFile(pageFile);

      // Replace the mock data loading with real data loading
      const updatedPageContent = pageContent.replace(
        "// This would typically load from uploaded files or a directory\n      // For now, we'll use mock data structure\n      loading = false;",
        `import { benchmarkData } from '$lib/data.js';
      loadResults(JSON.stringify(benchmarkData));
      loading = false;`,
      );

      await Deno.writeTextFile(pageFile, updatedPageContent);
      console.log("🔄 Updated page to load benchmark data");

      // Build the static site
      console.log("🔨 Building static site...");
      const buildProcess = new Deno.Command("npm", {
        args: ["run", "build"],
        cwd: "reports",
        stdout: "piped",
        stderr: "piped",
      });

      const { code, stdout: _stdout, stderr } = await buildProcess.output();

      if (code !== 0) {
        const errorText = new TextDecoder().decode(stderr);
        console.error("❌ Failed to build HTML report:");
        console.error(errorText);
        return;
      }

      // Copy built files to output directory
      console.log("📁 Copying built files to output directory...");

      // Remove existing output directory if it exists
      try {
        await Deno.remove(outputDir, { recursive: true });
      } catch {
        // Directory might not exist, ignore error
      }

      // Copy build directory to output
      const copyProcess = new Deno.Command("cp", {
        args: ["-r", "reports/build", outputDir],
        stdout: "piped",
        stderr: "piped",
      });

      const copyResult = await copyProcess.output();

      if (copyResult.code !== 0) {
        console.error("❌ Failed to copy built files");
        return;
      }

      // Clean up data file
      await Deno.remove(dataFile);

      // Restore original page file
      const originalPageContent = pageContent;
      await Deno.writeTextFile(pageFile, originalPageContent);

      console.log("✅ HTML report generated successfully!");
      console.log(`📂 Report available at: ${outputDir}/index.html`);
      console.log(
        `🌐 Open in browser: file://${Deno.cwd()}/${outputDir}/index.html`,
      );
    } else {
      // Generate JSON summary report
      console.log("📄 Generating JSON summary...");

      // Find all JSON result files
      const jsonFiles = [];
      for await (const entry of expandGlob(`${resultsDir}/**/*.json`)) {
        if (entry.isFile && entry.name.endsWith(".json")) {
          jsonFiles.push(entry.path);
        }
      }

      const summary = {
        generatedAt: new Date().toISOString(),
        resultFiles: jsonFiles,
        totalFiles: jsonFiles.length,
      };

      await Deno.writeTextFile(
        `${outputDir}/summary.json`,
        JSON.stringify(summary, null, 2),
      );
      console.log(`✅ Summary saved to: ${outputDir}/summary.json`);
    }
  } catch (error) {
    console.error(
      `❌ Report generation failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    throw error;
  }
}

async function handleContainerSetup(
  name: string,
  provider: string,
  bcVersion?: string,
  memory?: string,
): Promise<void> {
  const containerProvider = ContainerProviderRegistry.create(provider);
  const config: ContainerConfig = {
    name,
    bcVersion: bcVersion || "24.0",
    memoryLimit: memory || "8G",
    acceptEula: true,
    includeAL: true,
    includeTestToolkit: true,
  };

  await containerProvider.setup(config);
}

async function handleContainerControl(
  action: string,
  name: string,
): Promise<void> {
  const provider = await ContainerProviderRegistry.getDefault();

  switch (action) {
    case "start":
      await provider.start(name);
      break;
    case "stop":
      await provider.stop(name);
      break;
    case "remove":
      await provider.remove(name);
      break;
    case "status": {
      const status = await provider.status(name);
      console.log(`📋 Container Status: ${status.name}`);
      console.log(`   Running: ${status.isRunning ? "✅" : "❌"}`);
      console.log(`   Health: ${status.health}`);
      if (status.bcVersion) console.log(`   BC Version: ${status.bcVersion}`);
      if (status.uptime) console.log(`   Uptime: ${status.uptime}s`);
      break;
    }
  }
}

function handleModelsList(testSpecs?: string[]): void {
  console.log("📋 CentralGauge Model Support\n");

  // Show model presets (aliases)
  console.log("🏷️  Model Aliases (Short Names):");
  const presetsByCategory = ModelPresetRegistry.getPresetsByCategory();

  // Show flagship models first
  if (presetsByCategory["flagship"]) {
    console.log("   Flagship Models:");
    presetsByCategory["flagship"].forEach((preset) => {
      console.log(
        `   ${
          preset.alias.padEnd(12)
        } → ${preset.displayName} (${preset.costTier})`,
      );
    });
  }

  // Show budget models
  if (presetsByCategory["budget"]) {
    console.log("\n   Budget Models:");
    presetsByCategory["budget"].forEach((preset) => {
      console.log(
        `   ${
          preset.alias.padEnd(12)
        } → ${preset.displayName} (${preset.costTier})`,
      );
    });
  }

  // Show coding-specific models
  if (presetsByCategory["coding"]) {
    console.log("\n   Coding Models:");
    presetsByCategory["coding"].forEach((preset) => {
      console.log(
        `   ${preset.alias.padEnd(12)} → ${preset.displayName} (${
          preset.category.join(", ")
        })`,
      );
    });
  }

  // Show model groups
  console.log("\n🎯 Model Groups:");
  // Model groups defined in MODEL_GROUPS constant
  console.log("   flagship     → Top-tier models for best quality");
  console.log("   budget       → Cost-effective models for development");
  console.log("   coding       → Optimized for code generation tasks");
  console.log("   reasoning    → Advanced reasoning capabilities");
  console.log("   fast         → Optimized for speed");
  console.log("   quality      → Optimized for output quality");
  console.log("   comparison   → Recommended set for model comparison");
  console.log("   all          → Every available model");

  // Show cost tiers
  console.log("\n💰 Cost Tiers:");
  const costTiers = ModelPresetRegistry.getPresetsByCostTier();
  Object.entries(costTiers).forEach(([tier, presets]) => {
    if (presets.length > 0) {
      const aliases = presets.map((p) => p.alias).join(", ");
      console.log(`   ${tier.padEnd(8)} → ${aliases}`);
    }
  });

  // Show providers for reference
  console.log("\n🔧 Available Providers:");
  const providers = LLMAdapterRegistry.list();
  providers.forEach((provider) => {
    const supportedModels = LLMAdapterRegistry.getSupportedModels(provider);
    console.log(
      `   ${provider}: ${supportedModels.slice(0, 3).join(", ")}${
        supportedModels.length > 3 ? "..." : ""
      }`,
    );
  });

  // Show usage examples
  console.log("\n📝 Usage Examples:");
  console.log("   # Use aliases (recommended)");
  console.log("   centralgauge bench --llms sonnet,gpt-4o");
  console.log("   \n   # Use groups for comparisons");
  console.log("   centralgauge bench --llms flagship");
  console.log("   \n   # Mix aliases and groups");
  console.log("   centralgauge bench --llms flagship,budget");
  console.log("   \n   # Traditional provider/model format still works");
  console.log(
    "   centralgauge bench --llms openai/gpt-4o,anthropic/claude-3-5-sonnet-20241022",
  );

  // Test parsing if specs provided
  if (testSpecs && testSpecs.length > 0) {
    console.log("\n🧪 Testing Model Spec Parsing:");
    testSpecs.forEach((spec) => {
      try {
        const resolved = ModelPresetRegistry.resolve(spec);
        console.log(`   "${spec}" → resolves to:`);

        resolved.forEach((resolvedSpec) => {
          const { provider, model } = parseProviderAndModel(resolvedSpec);
          console.log(`      ${provider}/${model}`);

          // Check if it's a known preset
          const preset = Object.values(MODEL_PRESETS).find((p) =>
            `${p.provider}/${p.model}` === resolvedSpec
          );
          if (preset) {
            console.log(
              `        (${preset.displayName} - ${preset.description})`,
            );
          }
        });
      } catch (error) {
        console.log(
          `   "${spec}" → ❌ ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    });
  }

  console.log("\n💡 Pro Tips:");
  console.log(
    "   • Use aliases like 'sonnet' instead of 'anthropic/claude-3-5-sonnet-20241022'",
  );
  console.log(
    "   • Use groups like 'flagship' to test multiple top-tier models",
  );
  console.log("   • Mix aliases, groups, and provider/model formats freely");
  console.log("   • Set ANTHROPIC_API_KEY, OPENAI_API_KEY etc. for API access");
}

async function handleCompile(
  projectPath: string,
  containerName: string,
  _outputDir?: string,
): Promise<void> {
  if (!await exists(projectPath)) {
    console.error(`❌ Error: Project path does not exist: ${projectPath}`);
    Deno.exit(1);
  }

  try {
    const project = await ALProjectManager.loadProject(projectPath);
    const provider = await ContainerProviderRegistry.getDefault();

    console.log(
      `🔨 Compiling AL project: ${ALProjectManager.getProjectInfo(project)}`,
    );

    const result = await provider.compileProject(containerName, project);

    // Log compilation result if debug is enabled
    const debugLogger = DebugLogger.getInstance();
    if (debugLogger) {
      await debugLogger.logCompilation(
        "manual",
        "n/a",
        0,
        containerName,
        result,
      );
    }

    if (result.success) {
      console.log("✅ Compilation succeeded!");
      if (result.warnings.length > 0) {
        console.log(`⚠️  ${result.warnings.length} warning(s):`);
        for (const warning of result.warnings) {
          console.log(
            `   ${warning.file}:${warning.line} - ${warning.message}`,
          );
        }
      }
    } else {
      console.log("❌ Compilation failed!");
      console.log(`   ${result.errors.length} error(s):`);
      for (const error of result.errors) {
        console.log(`   ${error.file}:${error.line} - ${error.message}`);
      }
    }

    console.log(`⏱️  Duration: ${result.duration}ms`);
  } catch (error) {
    console.error(
      `❌ Error: ${error instanceof Error ? error.message : String(error)}`,
    );
    Deno.exit(1);
  }
}

async function handleTest(
  projectPath: string,
  containerName: string,
  _outputDir?: string,
): Promise<void> {
  if (!await exists(projectPath)) {
    console.error(`❌ Error: Project path does not exist: ${projectPath}`);
    Deno.exit(1);
  }

  try {
    const project = await ALProjectManager.loadProject(projectPath);
    const provider = await ContainerProviderRegistry.getDefault();

    console.log(
      `🧪 Running tests for: ${ALProjectManager.getProjectInfo(project)}`,
    );

    const result = await provider.runTests(containerName, project);

    // Log test result if debug is enabled
    const debugLogger = DebugLogger.getInstance();
    if (debugLogger) {
      await debugLogger.logTestResult(
        "manual",
        "n/a",
        0,
        containerName,
        result,
      );
    }

    if (result.success) {
      console.log("✅ All tests passed!");
    } else {
      console.log("❌ Some tests failed!");
    }

    console.log(
      `   Total: ${result.totalTests}, Passed: ${result.passedTests}, Failed: ${result.failedTests}`,
    );
    console.log(`⏱️  Duration: ${result.duration}ms`);

    if (result.failedTests > 0) {
      console.log("\n📋 Failed tests:");
      for (const test of result.results.filter((t) => !t.passed)) {
        console.log(`   ❌ ${test.name}: ${test.error}`);
      }
    }
  } catch (error) {
    console.error(
      `❌ Error: ${error instanceof Error ? error.message : String(error)}`,
    );
    Deno.exit(1);
  }
}

// Create the main CLI application
const cli = new Command()
  .name("centralgauge")
  .version(VERSION)
  .description(
    "LLM benchmark for Microsoft Dynamics 365 Business Central AL code",
  )
  .globalOption("-v, --verbose", "Enable verbose output")
  .globalOption("-q, --quiet", "Disable splash screen and minimize output")
  .example(
    "Basic benchmark with aliases",
    "centralgauge bench --llms sonnet,gpt-4o --tasks tasks/*.yml",
  )
  .example(
    "Group-based comparison",
    "centralgauge bench --llms flagship --attempts 2",
  )
  .example(
    "Mixed aliases and groups",
    "centralgauge bench --llms coding,budget --tasks tasks/easy/*.yml",
  )
  .example(
    "Traditional provider/model format",
    "centralgauge bench --llms openai/gpt-4o,anthropic/claude-3-5-sonnet-20241022",
  )
  .example(
    "Generate HTML report",
    "centralgauge report results/ --html --output reports/",
  );

// Benchmark command
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
  .option("--debug-level <level>", "Debug log level (basic|detailed|verbose)", {
    default: "basic",
  })
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
  // Prompt injection options
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
  .action(async (options) => {
    // Build prompt overrides from CLI options if any are provided
    let promptOverrides: CLIPromptOverrides | undefined;
    if (options.systemPrompt || options.promptPrefix || options.promptSuffix) {
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
    };
    if (promptOverrides) {
      benchOptions.promptOverrides = promptOverrides;
    }

    // Log prompt overrides if provided
    if (promptOverrides) {
      console.log("📝 Prompt overrides enabled:");
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

    // Use parallel mode by default, sequential if --sequential flag is set
    if (options.sequential) {
      console.log("📋 Running in sequential mode (legacy)");
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
    // Explicitly exit to close any lingering connections (SDK keep-alive, etc.)
    Deno.exit(0);
  });

// Report command
cli.command(
  "report <results-dir>",
  "Generate HTML report from benchmark results",
)
  .option("--html", "Generate HTML report", { default: false })
  .option("-o, --output <dir>", "Output directory", { default: "reports/" })
  .action(async (options, resultsDir: string) => {
    if (!await exists(resultsDir)) {
      console.error(
        `❌ Error: Results directory '${resultsDir}' does not exist`,
      );
      Deno.exit(1);
    }
    await generateReport(resultsDir, options.output, options.html);
  });

// Container command with subcommands
const containerCmd = cli.command(
  "container",
  "Manage Business Central containers",
);

containerCmd.command("setup", "Create and setup a new container")
  .option("-n, --name <name>", "Container name", { required: true })
  .option("-p, --provider <provider>", "Container provider", { required: true })
  .option("--bc-version <version>", "Business Central version", {
    default: "24.0",
  })
  .option("--memory <size>", "Memory limit", { default: "8G" })
  .action(async (options) => {
    await handleContainerSetup(
      options.name,
      options.provider,
      options.bcVersion,
      options.memory,
    );
  });

containerCmd.command("start <name>", "Start an existing container")
  .action(async (_options, name: string) => {
    await handleContainerControl("start", name);
  });

containerCmd.command("stop <name>", "Stop a running container")
  .action(async (_options, name: string) => {
    await handleContainerControl("stop", name);
  });

containerCmd.command("remove <name>", "Remove a container")
  .action(async (_options, name: string) => {
    await handleContainerControl("remove", name);
  });

containerCmd.command("status <name>", "Show container status")
  .action(async (_options, name: string) => {
    await handleContainerControl("status", name);
  });

containerCmd.command("list", "List available providers")
  .action(() => {
    const providers = ContainerProviderRegistry.list();
    console.log("📋 Available Container Providers:");
    for (const provider of providers) {
      console.log(`   - ${provider}`);
    }
  });

// Compile command
cli.command("compile <project-path>", "Compile AL project in container")
  .option("-c, --container <name>", "Container name", { required: true })
  .option("-o, --output <dir>", "Output directory for compilation results")
  .action(async (options, projectPath: string) => {
    await handleCompile(projectPath, options.container, options.output);
  });

// Test command
cli.command("test <project-path>", "Run AL tests in container")
  .option("-c, --container <name>", "Container name", { required: true })
  .option("-o, --output <dir>", "Output directory for test results")
  .action(async (options, projectPath: string) => {
    await handleTest(projectPath, options.container, options.output);
  });

// Models command
cli.command("models [...specs]", "List supported models and test parsing")
  .action((_options, ...specs: string[]) => {
    handleModelsList(specs.length > 0 ? specs : undefined);
  });

// Config command with subcommands
const configCmd = cli.command("config", "Manage configuration");

configCmd.command("init", "Generate sample configuration file")
  .option("--global", "Create in home directory instead of current directory")
  .action(async (options) => {
    const configPath = options.global
      ? `${
        Deno.env.get("HOME") || Deno.env.get("USERPROFILE")
      }/.centralgauge.yml`
      : ".centralgauge.yml";

    if (await exists(configPath)) {
      console.log(`⚠️  Configuration file already exists: ${configPath}`);
      console.log("Remove it first if you want to regenerate.");
      return;
    }

    const sampleConfig = ConfigManager.generateSampleConfig();
    await Deno.writeTextFile(configPath, sampleConfig);
    console.log(`✅ Created configuration file: ${configPath}`);
    console.log("Edit this file to customize your default settings.");
  });

configCmd.command("view", "Show current configuration")
  .action(async () => {
    const config = await ConfigManager.loadConfig();
    console.log("📋 Current Configuration:\n");
    console.log(JSON.stringify(config, null, 2));
  });

// Initialize environment and startup
async function initializeApp(quiet = false): Promise<void> {
  // Load environment variables first
  await EnvLoader.loadEnvironment();

  // Show startup screen if not quiet
  if (!quiet && Deno.args.length === 0) {
    await SplashScreen.display({
      showEnvironment: true,
      showConfiguration: true,
      showProviders: true,
      compact: false,
    });
    SplashScreen.displayStartupTips();
    return;
  }
}

// Add environment command with subcommands
const envCmd = cli.command("env", "Environment and configuration management");

envCmd.command("show", "Show current environment status")
  .option("--detailed", "Show detailed environment information")
  .action(async (options) => {
    await EnvLoader.loadEnvironment();
    EnvLoader.displayEnvironmentStatus(options.detailed);
  });

envCmd.command("create", "Generate sample .env file")
  .option("--overwrite", "Overwrite existing .env file")
  .action(async (options) => {
    if (await exists(".env") && !options.overwrite) {
      console.log(
        "⚠️  .env file already exists. Use --overwrite to replace it.",
      );
      return;
    }

    const sampleEnv = EnvLoader.generateSampleEnvFile();
    await Deno.writeTextFile(".env", sampleEnv);
    console.log("✅ Created .env file with sample configuration");
    console.log("Edit this file and add your API keys to get started.");
  });

// Add health check command
cli.command("health", "Check system health and configuration")
  .action(async () => {
    await EnvLoader.loadEnvironment();
    const isHealthy = await SplashScreen.displayHealthCheck();
    if (!isHealthy) {
      Deno.exit(1);
    }
  });

// Parse and execute
if (import.meta.main) {
  // Check for global quiet flag
  const isQuiet = Deno.args.includes("--quiet") || Deno.args.includes("-q");

  // Initialize app
  await initializeApp(isQuiet);

  // Parse CLI commands
  await cli.parse(Deno.args);
}
