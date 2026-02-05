/**
 * Benchmark execution commands (thin CLI layer)
 * @module cli/commands/bench
 */

import { Command } from "@cliffy/command";
import type {
  CLIPromptOverrides,
  InjectionStage,
} from "../../src/prompts/mod.ts";
import {
  hasKnowledgeOptions,
  loadKnowledgeFiles,
} from "../../src/prompts/mod.ts";
import type { OutputFormat } from "../../src/utils/formatters.ts";
import { log } from "../helpers/mod.ts";
import type {
  AgentBenchmarkOptions,
  ExtendedBenchmarkOptions,
} from "./bench/mod.ts";
import {
  executeAgentBenchmark,
  executeParallelBenchmark,
} from "./bench/mod.ts";

/**
 * Register the benchmark command with the CLI
 */
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
    .option(
      "--container <name:string>",
      "BC container name (for agent mode)",
      { default: "Cronus27" },
    )
    .option(
      "-s, --sandbox",
      "Run agents in isolated Windows containers (agent mode only)",
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
      "--knowledge <files:string[]>",
      "Markdown files to inject as knowledge bank into system prompt",
    )
    .option(
      "--knowledge-dir <path:string>",
      "Directory of .md files to inject as knowledge bank",
    )
    .option(
      "--run-label <label:string>",
      "Custom label for this run (default: auto-append '(guided)' if knowledge used)",
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
    .option(
      "--no-notify",
      "Disable Pushbullet notification (even if token configured)",
      { default: false },
    )
    .action(async (options) => {
      // Validate that at least one of --llms or --agents is provided
      if (
        (!options.llms || options.llms.length === 0) &&
        (!options.agents || options.agents.length === 0)
      ) {
        log.fail("Either --llms or --agents must be specified");
        Deno.exit(1);
      }

      // Handle agent-based execution
      if (options.agents && options.agents.length > 0) {
        const agentBenchOptions: AgentBenchmarkOptions = {
          agents: options.agents,
          tasks: [...options.tasks],
          outputDir: options.output,
          debug: options.debug,
          stream: options.stream,
          tui: options.tui,
          containerName: options.container,
          sandbox: options.sandbox ?? false,
          verbose: options.debug ?? false,
          noNotify: !options.notify,
        };
        await executeAgentBenchmark(agentBenchOptions, options.quiet);
        Deno.exit(0);
      }

      // Load knowledge files if specified
      let knowledgeContent: string | undefined;
      const knowledgeOpts = {
        files: options.knowledge,
        directory: options.knowledgeDir,
      };
      if (hasKnowledgeOptions(knowledgeOpts)) {
        try {
          knowledgeContent = await loadKnowledgeFiles(knowledgeOpts);
          if (knowledgeContent) {
            console.log(
              `Loaded knowledge bank (${knowledgeContent.length} chars)`,
            );
          }
        } catch (error) {
          log.fail(
            `Failed to load knowledge files: ${
              error instanceof Error ? error.message : error
            }`,
          );
          Deno.exit(1);
        }
      }

      // Build prompt overrides from CLI options
      let promptOverrides: CLIPromptOverrides | undefined;
      if (
        options.systemPrompt || options.promptPrefix || options.promptSuffix ||
        knowledgeContent
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
        // Add knowledge content
        if (knowledgeContent) {
          promptOverrides.knowledgeContent = knowledgeContent;
        }
        // Add run label
        if (options.runLabel) {
          promptOverrides.runLabel = options.runLabel;
        } else if (knowledgeContent) {
          // Auto-label with "(guided)" suffix when knowledge is used
          promptOverrides.runLabel = "(guided)";
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
        sequential: false, // Always parallel now
        maxConcurrency: typeof options.maxConcurrency === "number"
          ? options.maxConcurrency
          : parseInt(String(options.maxConcurrency), 10),
        stream: options.stream,
        noNotify: !options.notify,
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
        if (promptOverrides.knowledgeContent) {
          console.log(
            `   Knowledge: ${promptOverrides.knowledgeContent.length} chars injected`,
          );
        }
        if (promptOverrides.runLabel) {
          console.log(`   Run label: ${promptOverrides.runLabel}`);
        }
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

      // Execute parallel benchmark
      const outputFormat = (options.format || "verbose") as OutputFormat;
      await executeParallelBenchmark(
        benchOptions,
        options.quiet || options.jsonEvents || options.tui, // Quiet mode for JSON/TUI output
        options.containerProvider,
        outputFormat,
        options.jsonEvents ?? false,
        options.tui ?? false,
      );

      // Explicitly exit to close any lingering connections
      Deno.exit(0);
    });
}
