/**
 * Report from database command - generate reports from persisted benchmark runs
 * @module cli/commands/report-db
 */

import { Command } from "@cliffy/command";
import { Checkbox, Confirm, Select } from "@cliffy/prompt";
import { Table } from "@cliffy/table";
import * as colors from "@std/fmt/colors";
import { openStorage } from "../../src/stats/mod.ts";
import type {
  ResultRecord,
  RunRecord,
  TaskSetSummary,
} from "../../src/stats/types.ts";
import { log } from "../helpers/mod.ts";
import {
  generateCompleteReport,
  resultRecordToBenchmarkResult,
} from "../helpers/report-generator.ts";
import type { BenchmarkResult } from "../types/cli-types.ts";

/**
 * Format a date for display
 */
function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Format a date range
 */
function formatDateRange(first: Date, last: Date): string {
  const f = formatDate(first);
  const l = formatDate(last);
  return f === l ? f : `${f.slice(5)} - ${l.slice(5)}`;
}

/**
 * Format a task set summary for selection
 */
function formatTaskSetOption(summary: TaskSetSummary): string {
  const dateRange = formatDateRange(summary.firstRun, summary.lastRun);
  const stats = `${summary.runCount} runs, ${summary.modelCount} models`;
  const passRate = `${(summary.avgPassRate * 100).toFixed(1)}%`;
  return `${
    summary.taskSetHash.slice(0, 8)
  } | ${dateRange} | ${stats} | ${passRate}`;
}

/**
 * Format a run for selection
 */
function formatRunOption(run: RunRecord, isLatest: boolean): string {
  const date = formatDate(run.executedAt);
  const passRate = `${(run.overallPassRate * 100).toFixed(1)}%`;
  const cost = `$${run.totalCost.toFixed(4)}`;
  const latestTag = isLatest ? colors.green(" (latest)") : "";
  return `${date} | ${passRate} | ${cost}${latestTag}`;
}

/**
 * List available task sets
 */
async function listTaskSets(dbPath: string): Promise<void> {
  const storage = await openStorage({
    type: "sqlite",
    sqlitePath: dbPath,
  });

  try {
    const summaries = await storage.getTaskSetSummaries();

    if (summaries.length === 0) {
      console.log(colors.yellow("No task sets found in database."));
      console.log(
        colors.gray("Run 'centralgauge stats-import' to import results first."),
      );
      return;
    }

    console.log(colors.bold("\nAvailable Test Sets:\n"));
    const table = new Table()
      .header([
        "Hash",
        "Date Range",
        "Runs",
        "Models",
        "Pass Rate",
        "Avg Score",
      ])
      .body(
        summaries.map((s) => [
          s.taskSetHash.slice(0, 8),
          formatDateRange(s.firstRun, s.lastRun),
          String(s.runCount),
          String(s.modelCount),
          `${(s.avgPassRate * 100).toFixed(1)}%`,
          s.avgScore.toFixed(1),
        ]),
      );
    console.log(table.toString());
    console.log(colors.gray(`\nTotal: ${summaries.length} test set(s)`));
  } finally {
    await storage.close();
  }
}

/**
 * Interactive test set selection
 */
async function interactiveSelection(dbPath: string): Promise<
  {
    taskSetHash: string;
    selectedRuns: Map<string, RunRecord>;
  } | null
> {
  const storage = await openStorage({
    type: "sqlite",
    sqlitePath: dbPath,
  });

  try {
    // Step 1: Select test set
    const summaries = await storage.getTaskSetSummaries();

    if (summaries.length === 0) {
      console.log(colors.yellow("No task sets found in database."));
      return null;
    }

    const selectedHash: string = await Select.prompt({
      message: "Select test set to report on",
      options: summaries.map((s) => ({
        name: formatTaskSetOption(s),
        value: s.taskSetHash,
      })),
    });

    // Step 2: Get variants for this test set
    const variantGroups = await storage.getRunsByVariantForTaskSet(
      selectedHash,
    );

    if (variantGroups.length === 0) {
      console.log(colors.yellow("No runs found for this test set."));
      return null;
    }

    // Step 3: Select run types (LLM vs Agent)
    const hasLLM = variantGroups.some((g) => g.provider !== "agent");
    const hasAgent = variantGroups.some((g) => g.provider === "agent");

    let selectedTypes: string[] = ["llm", "agent"];
    if (hasLLM && hasAgent) {
      selectedTypes = await Checkbox.prompt({
        message: "Include which run types?",
        options: [
          {
            name: `LLM benchmark results (${
              variantGroups.filter((g) => g.provider !== "agent").length
            } variants)`,
            value: "llm",
            checked: true,
          },
          {
            name: `Agent benchmark results (${
              variantGroups.filter((g) => g.provider === "agent").length
            } variants)`,
            value: "agent",
            checked: true,
          },
        ],
      });
    }

    // Filter variants by selected types
    const filteredGroups = variantGroups.filter((g) => {
      if (g.provider === "agent") return selectedTypes.includes("agent");
      return selectedTypes.includes("llm");
    });

    // Step 4: Select specific runs for each variant (if multiple exist)
    const selectedRuns = new Map<string, RunRecord>();

    for (const group of filteredGroups) {
      if (group.runs.length === 1) {
        // Only one run, use it
        selectedRuns.set(group.variantId, group.runs[0]!);
      } else {
        // Multiple runs, let user select
        const selectedRunId: string = await Select.prompt({
          message:
            `${group.variantId} has ${group.runs.length} runs. Select which to include:`,
          options: group.runs.map((run, idx) => ({
            name: formatRunOption(run, idx === 0),
            value: run.runId,
          })),
        });

        const selectedRun = group.runs.find((r) => r.runId === selectedRunId);
        if (selectedRun) {
          selectedRuns.set(group.variantId, selectedRun);
        }
      }
    }

    // Step 5: Confirm
    console.log(colors.bold("\nSelection Summary:"));
    console.log(`  Test Set: ${selectedHash.slice(0, 8)}`);
    console.log(`  Variants: ${selectedRuns.size}`);

    const confirmed = await Confirm.prompt({
      message: "Generate report with these settings?",
      default: true,
    });

    if (!confirmed) {
      console.log(colors.yellow("Cancelled."));
      return null;
    }

    return { taskSetHash: selectedHash, selectedRuns };
  } finally {
    await storage.close();
  }
}

/**
 * Generate report from database
 */
async function generateReportFromDb(
  taskSetHash: string,
  runId: string | undefined,
  dbPath: string,
  outputDir: string,
): Promise<void> {
  const storage = await openStorage({
    type: "sqlite",
    sqlitePath: dbPath,
  });

  try {
    // Find matching task sets
    const summaries = await storage.getTaskSetSummaries();
    const matchingSummary = summaries.find(
      (s) =>
        s.taskSetHash.startsWith(taskSetHash) || s.taskSetHash === taskSetHash,
    );

    if (!matchingSummary) {
      log.fail(`No task set found matching: ${taskSetHash}`);
      log.info("Use --list-sets to see available test sets.");
      return;
    }

    const fullHash = matchingSummary.taskSetHash;
    console.log(
      colors.bold(`\nGenerating report for test set: ${fullHash.slice(0, 8)}`),
    );

    // Get variant runs
    const variantGroups = await storage.getRunsByVariantForTaskSet(fullHash);

    // Select runs
    const selectedRuns = new Map<string, RunRecord>();
    for (const group of variantGroups) {
      if (runId) {
        // Use specific run ID if provided
        const matchingRun = group.runs.find((r) =>
          r.runId === runId || r.runId.includes(runId)
        );
        if (matchingRun) {
          selectedRuns.set(group.variantId, matchingRun);
        }
      } else {
        // Use latest run (first in sorted list)
        if (group.runs.length > 0) {
          selectedRuns.set(group.variantId, group.runs[0]!);
        }
      }
    }

    if (selectedRuns.size === 0) {
      log.fail("No matching runs found.");
      return;
    }

    console.log(`Selected ${selectedRuns.size} variant(s):`);
    for (const [variantId, run] of selectedRuns) {
      console.log(
        `  - ${variantId}: ${formatDate(run.executedAt)} (${
          (run.overallPassRate * 100).toFixed(1)
        }%)`,
      );
    }

    // Fetch results for all selected runs
    console.log(colors.gray("\nFetching results from database..."));
    const allResults: BenchmarkResult[] = [];

    for (const [_variantId, run] of selectedRuns) {
      const results: ResultRecord[] = await storage.getResults({
        runId: run.runId,
      });
      for (const result of results) {
        allResults.push(resultRecordToBenchmarkResult(result));
      }
    }

    console.log(`Loaded ${allResults.length} task results.`);

    if (allResults.length === 0) {
      log.fail("No results found for selected runs.");
      return;
    }

    // Generate the HTML report
    console.log(colors.gray("Generating HTML report..."));
    await generateCompleteReport({
      results: allResults,
      outputDir,
      shortcomingsDir: "./model-shortcomings",
    });

    console.log(colors.green(`\n[OK] Report generated successfully!`));
    console.log(
      `Open in browser: file://${Deno.cwd()}/${outputDir}/index.html`,
    );
  } finally {
    await storage.close();
  }
}

/**
 * Handle report-from-db command
 */
async function handleReportFromDb(
  options: {
    testSet?: string;
    runId?: string;
    interactive: boolean;
    listSets: boolean;
    output: string;
    db: string;
  },
): Promise<void> {
  // List sets mode
  if (options.listSets) {
    await listTaskSets(options.db);
    return;
  }

  // Interactive mode
  if (options.interactive) {
    const selection = await interactiveSelection(options.db);
    if (selection) {
      // Generate report with selection
      console.log(colors.bold("\nGenerating report..."));
      console.log(`Test Set: ${selection.taskSetHash.slice(0, 8)}`);
      console.log(`Variants: ${selection.selectedRuns.size}`);

      // Open storage to fetch results
      const storage = await openStorage({
        type: "sqlite",
        sqlitePath: options.db,
      });

      try {
        // Fetch results for all selected runs
        console.log(colors.gray("\nFetching results from database..."));
        const allResults: BenchmarkResult[] = [];

        for (const [_variantId, run] of selection.selectedRuns) {
          const results: ResultRecord[] = await storage.getResults({
            runId: run.runId,
          });
          for (const result of results) {
            allResults.push(resultRecordToBenchmarkResult(result));
          }
        }

        console.log(`Loaded ${allResults.length} task results.`);

        if (allResults.length === 0) {
          log.fail("No results found for selected runs.");
          return;
        }

        // Generate the HTML report
        console.log(colors.gray("Generating HTML report..."));
        await generateCompleteReport({
          results: allResults,
          outputDir: options.output,
          shortcomingsDir: "./model-shortcomings",
        });

        console.log(colors.green(`\n[OK] Report generated successfully!`));
        console.log(
          `Open in browser: file://${Deno.cwd()}/${options.output}/index.html`,
        );
      } finally {
        await storage.close();
      }
    }
    return;
  }

  // Direct mode - require test set
  if (!options.testSet) {
    log.fail("Either --test-set <hash> or --interactive is required.");
    log.info("Use --list-sets to see available test sets.");
    return;
  }

  await generateReportFromDb(
    options.testSet,
    options.runId,
    options.db,
    options.output,
  );
}

/**
 * Register the report-from-db command
 */
export function registerReportDbCommand(cli: Command): void {
  cli.command("report-from-db", "Generate report from stats database")
    .option(
      "--test-set <hash:string>",
      "Filter by test set hash (supports partial match)",
    )
    .option(
      "--run-id <id:string>",
      "Specific run ID (default: latest per model)",
    )
    .option("-i, --interactive", "Interactive TUI mode", { default: false })
    .option("--list-sets", "List available test sets", { default: false })
    .option("-o, --output <dir:string>", "Output directory", {
      default: "reports-output/",
    })
    .option("--db <path:string>", "Database path", {
      default: "results/centralgauge.db",
    })
    .action(handleReportFromDb);
}
