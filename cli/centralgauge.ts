#!/usr/bin/env -S deno run --allow-all

import { parseArgs } from "@std/cli/parse-args";
import { exists } from "@std/fs";
import type { BenchmarkOptions } from "../types/index.ts";

const VERSION = "0.1.0";

function printHelp(): void {
  console.log(`
CentralGauge v${VERSION}
LLM benchmark for Microsoft Dynamics 365 Business Central AL code

USAGE:
    centralgauge <COMMAND> [OPTIONS]

COMMANDS:
    bench     Run benchmark evaluation
    report    Generate HTML report from results
    help      Show this help message

EXAMPLES:
    centralgauge bench --llms gpt-4o,gpt-3.5-turbo --tasks tasks/*.yml --attempts 2
    centralgauge report results/ --html --output reports/
    
For more help on a specific command, use:
    centralgauge <COMMAND> --help
`);
}

function printBenchHelp(): void {
  console.log(`
Run benchmark evaluation

USAGE:
    centralgauge bench [OPTIONS]

OPTIONS:
    --llms <MODELS>        Comma-separated list of LLM models
    --tasks <PATTERN>      Task files pattern (default: tasks/*.yml)
    --attempts <NUM>       Number of attempts per task (default: 2)
    --output <DIR>         Output directory (default: results/)
    --temperature <NUM>    LLM temperature (default: 0.1)
    --max-tokens <NUM>     Maximum tokens per request (default: 4000)
    --help                 Show this help message

EXAMPLES:
    centralgauge bench --llms gpt-4o --tasks tasks/easy/*.yml
    centralgauge bench --llms gpt-4o,claude-3-sonnet --attempts 1
`);
}

function printReportHelp(): void {
  console.log(`
Generate HTML report from benchmark results

USAGE:
    centralgauge report <RESULTS_DIR> [OPTIONS]

OPTIONS:
    --html                 Generate HTML report
    --output <DIR>         Output directory (default: reports/)
    --help                 Show this help message

EXAMPLES:
    centralgauge report results/ --html
    centralgauge report results/ --html --output public/
`);
}

function runBenchmark(options: BenchmarkOptions): void {
  console.log("🚀 Starting CentralGauge benchmark...");
  console.log(`Models: ${options.llms.join(", ")}`);
  console.log(`Tasks: ${options.tasks.join(", ")}`);
  console.log(`Attempts: ${options.attempts}`);
  console.log(`Output: ${options.outputDir}`);

  // TODO: Implement benchmark logic
  console.log("⚠️  Benchmark implementation coming in Phase 2!");
}

function generateReport(
  resultsDir: string,
  outputDir: string,
  html: boolean,
): void {
  console.log("📊 Generating report...");
  console.log(`Results: ${resultsDir}`);
  console.log(`Output: ${outputDir}`);
  console.log(`HTML: ${html}`);

  // TODO: Implement report generation
  console.log("⚠️  Report generation implementation coming in Phase 6!");
}

async function main(): Promise<void> {
  const args = parseArgs(Deno.args, {
    boolean: ["help", "html", "version"],
    string: ["llms", "tasks", "output", "temperature", "max-tokens", "attempts"],
    alias: {
      h: "help",
      v: "version",
      o: "output",
      t: "tasks",
    },
  });

  if (args.version) {
    console.log(`CentralGauge v${VERSION}`);
    return;
  }

  const command = args._[0] as string;

  if (!command || command === "help" || args.help) {
    if (command === "bench") {
      printBenchHelp();
    } else if (command === "report") {
      printReportHelp();
    } else {
      printHelp();
    }
    return;
  }

  try {
    switch (command) {
      case "bench": {
        if (args.help) {
          printBenchHelp();
          return;
        }

        if (!args.llms) {
          console.error("❌ Error: --llms is required");
          console.log("Use --help for usage information");
          Deno.exit(1);
        }

        const options: BenchmarkOptions = {
          llms: args.llms.split(",").map((s) => s.trim()),
          tasks: args.tasks
            ? args.tasks.split(",").map((s) => s.trim())
            : ["tasks/*.yml"],
          attempts: args.attempts ? parseInt(args.attempts) : 2,
          outputDir: args.output || "results/",
          temperature: args.temperature ? parseFloat(args.temperature) : 0.1,
          maxTokens: args["max-tokens"] ? parseInt(args["max-tokens"]) : 4000,
        };

        runBenchmark(options);
        break;
      }

      case "report": {
        if (args.help) {
          printReportHelp();
          return;
        }

        const resultsDir = args._[1] as string;
        if (!resultsDir) {
          console.error("❌ Error: Results directory is required");
          console.log("Use --help for usage information");
          Deno.exit(1);
        }

        if (!await exists(resultsDir)) {
          console.error(
            `❌ Error: Results directory '${resultsDir}' does not exist`,
          );
          Deno.exit(1);
        }

        const outputDir = args.output || "reports/";
        const html = args.html || false;

        generateReport(resultsDir, outputDir, html);
        break;
      }

      default:
        console.error(`❌ Error: Unknown command '${command}'`);
        console.log("Use --help for usage information");
        Deno.exit(1);
    }
  } catch (error) {
    console.error(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
