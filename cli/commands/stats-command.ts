/**
 * Stats commands for historical tracking and analytics
 * @module cli/commands/stats
 */

import { Command } from "@cliffy/command";
import { Table } from "@cliffy/table";
import * as colors from "@std/fmt/colors";
import {
  type CostOptions,
  createImporter,
  openStorage,
  type RegressionOptions,
} from "../../src/stats/mod.ts";

async function handleStatsImport(
  options: { db: string },
  path?: string,
): Promise<void> {
  const resultsPath = path ?? "results/";
  console.log(`Importing results from ${resultsPath}...`);

  const storage = await openStorage({
    type: "sqlite",
    sqlitePath: options.db,
  });

  try {
    const importer = createImporter();
    const result = await importer.importDirectory(resultsPath, storage);

    console.log(colors.green(`[OK] Imported ${result.imported} runs`));
    if (result.skipped > 0) {
      console.log(
        colors.gray(`Skipped ${result.skipped} (already imported)`),
      );
    }
    if (result.errors.length > 0) {
      console.log(colors.yellow(`[WARN] ${result.errors.length} errors:`));
      for (const err of result.errors) {
        console.log(colors.red(`  ${err.file}: ${err.error}`));
      }
    }
  } finally {
    await storage.close();
  }
}

async function handleStatsRuns(
  options: {
    model?: string;
    task?: string;
    taskSet?: string;
    limit: number;
    db: string;
  },
): Promise<void> {
  const storage = await openStorage({
    type: "sqlite",
    sqlitePath: options.db,
  });

  try {
    if (options.model) {
      // Show trend for specific model
      const trend = await storage.getModelTrend(options.model, {
        taskId: options.task,
        limit: options.limit,
      });

      if (trend.length === 0) {
        console.log(colors.yellow(`No data found for ${options.model}`));
        return;
      }

      console.log(colors.bold(`\nPerformance trend for ${options.model}:\n`));
      const table = new Table()
        .header(["Run ID", "Date", "Passed", "Total", "Score", "Cost"])
        .body(
          trend.map((t) => [
            t.runId.slice(-8),
            t.executedAt.toISOString().slice(0, 10),
            String(t.passed),
            String(t.total),
            t.avgScore.toFixed(1),
            `$${t.cost.toFixed(4)}`,
          ]),
        );
      console.log(table.toString());
    } else {
      // Show recent runs (optionally filtered by task set hash)
      let runs = await storage.listRuns({ limit: options.limit * 3 });

      // Filter by task set hash if provided (supports partial match)
      if (options.taskSet) {
        const taskSetFilter = options.taskSet;
        runs = runs.filter((r) =>
          r.taskSetHash.startsWith(taskSetFilter) ||
          r.taskSetHash.includes(taskSetFilter)
        );
      }

      runs = runs.slice(0, options.limit);

      if (runs.length === 0) {
        console.log(
          colors.yellow("No runs found. Run 'stats-import' first."),
        );
        return;
      }

      const title = options.taskSet
        ? `\nRuns with task set ${options.taskSet}:\n`
        : "\nRecent benchmark runs:\n";
      console.log(colors.bold(title));

      const table = new Table()
        .header([
          "Run ID",
          "TaskSet",
          "Date",
          "Tasks",
          "Models",
          "Pass%",
          "Score",
          "Cost",
        ])
        .body(
          runs.map((r) => [
            r.runId.slice(-8),
            r.taskSetHash.slice(0, 8),
            r.executedAt.toISOString().slice(0, 10),
            String(r.totalTasks),
            String(r.totalModels),
            `${(r.overallPassRate * 100).toFixed(1)}%`,
            r.averageScore.toFixed(1),
            `$${r.totalCost.toFixed(4)}`,
          ]),
        );
      console.log(table.toString());
    }
  } finally {
    await storage.close();
  }
}

async function handleStatsCompare(
  options: { db: string },
  model1: string,
  model2: string,
): Promise<void> {
  const storage = await openStorage({
    type: "sqlite",
    sqlitePath: options.db,
  });

  try {
    const comparison = await storage.compareModels(model1, model2);

    console.log(colors.bold("\nModel Comparison:\n"));
    console.log(`${colors.cyan(model1)} vs ${colors.magenta(model2)}\n`);
    console.log(
      `Wins: ${colors.cyan(String(comparison.variant1Wins))} - ${
        colors.magenta(String(comparison.variant2Wins))
      } (${comparison.ties} ties)`,
    );
    console.log(
      `Avg Score: ${colors.cyan(comparison.variant1AvgScore.toFixed(1))} vs ${
        colors.magenta(comparison.variant2AvgScore.toFixed(1))
      }`,
    );
    console.log(
      `Total Cost: ${
        colors.cyan(`$${comparison.variant1Cost.toFixed(4)}`)
      } vs ${colors.magenta(`$${comparison.variant2Cost.toFixed(4)}`)}`,
    );

    if (comparison.perTask.length > 0) {
      console.log(colors.bold("\nPer-task breakdown:\n"));
      const table = new Table()
        .header(["Task", model1.slice(-20), model2.slice(-20), "Winner"])
        .body(
          comparison.perTask.map((t) => [
            t.taskId,
            t.variant1Score.toFixed(1),
            t.variant2Score.toFixed(1),
            t.winner === "variant1"
              ? colors.cyan(model1.slice(-15))
              : t.winner === "variant2"
              ? colors.magenta(model2.slice(-15))
              : "tie",
          ]),
        );
      console.log(table.toString());
    }
  } finally {
    await storage.close();
  }
}

async function handleStatsRegression(
  options: { threshold: number; model?: string; db: string },
): Promise<void> {
  const storage = await openStorage({
    type: "sqlite",
    sqlitePath: options.db,
  });

  try {
    const regOptions: RegressionOptions = {
      threshold: options.threshold / 100,
      variantId: options.model,
    };
    const regressions = await storage.detectRegressions(regOptions);

    if (regressions.length === 0) {
      console.log(colors.green("[OK] No regressions detected"));
      return;
    }

    console.log(
      colors.yellow(
        `[WARN] Found ${regressions.length} regression(s):\n`,
      ),
    );
    const table = new Table()
      .header(["Task", "Model", "Baseline", "Current", "Change"])
      .body(
        regressions.map((r) => [
          r.taskId,
          r.variantId.slice(-25),
          r.baselineScore.toFixed(1),
          r.currentScore.toFixed(1),
          colors.red(`${r.changePct.toFixed(1)}%`),
        ]),
      );
    console.log(table.toString());
  } finally {
    await storage.close();
  }
}

async function handleStatsCost(
  options: { model?: string; group: string; db: string },
): Promise<void> {
  const storage = await openStorage({
    type: "sqlite",
    sqlitePath: options.db,
  });

  try {
    const costOptions: CostOptions = {
      groupBy: options.group as "model" | "task" | "day" | "week",
      variantId: options.model,
    };
    const breakdown = await storage.getCostBreakdown(costOptions);

    if (breakdown.length === 0) {
      console.log(colors.yellow("No cost data found"));
      return;
    }

    console.log(colors.bold(`\nCost breakdown by ${options.group}:\n`));
    const table = new Table()
      .header(["Group", "Cost", "Tokens", "Runs", "$/Run", "$/Success"])
      .body(
        breakdown.map((b) => [
          b.groupKey.slice(-30),
          `$${b.totalCost.toFixed(4)}`,
          b.totalTokens.toLocaleString(),
          String(b.executionCount),
          `$${b.avgCostPerExecution.toFixed(4)}`,
          b.costPerSuccess ? `$${b.costPerSuccess.toFixed(4)}` : "N/A",
        ]),
      );
    console.log(table.toString());

    // Total
    const total = breakdown.reduce((sum, b) => sum + b.totalCost, 0);
    console.log(colors.bold(`\nTotal: $${total.toFixed(4)}`));
  } finally {
    await storage.close();
  }
}

export function registerStatsCommands(cli: Command): void {
  cli.command(
    "stats-import [path]",
    "Import benchmark results into stats database",
  )
    .option(
      "--db <path:string>",
      "Path to stats database",
      { default: "results/centralgauge.db" },
    )
    .action(handleStatsImport);

  cli.command("stats-runs", "Show historical benchmark runs")
    .option("--model <model:string>", "Filter by model/variant")
    .option("--task <task:string>", "Filter by task ID")
    .option(
      "--task-set <hash:string>",
      "Filter by task set hash (first 8 chars)",
    )
    .option("--limit <limit:number>", "Number of runs to show", { default: 10 })
    .option(
      "--db <path:string>",
      "Path to stats database",
      { default: "results/centralgauge.db" },
    )
    .action(handleStatsRuns);

  cli.command("stats-compare <model1> <model2>", "Compare two models")
    .option(
      "--db <path:string>",
      "Path to stats database",
      { default: "results/centralgauge.db" },
    )
    .action(handleStatsCompare);

  cli.command("stats-regression", "Detect performance regressions")
    .option("--threshold <threshold:number>", "Regression threshold %", {
      default: 5,
    })
    .option("--model <model:string>", "Filter by model/variant")
    .option(
      "--db <path:string>",
      "Path to stats database",
      { default: "results/centralgauge.db" },
    )
    .action(handleStatsRegression);

  cli.command("stats-cost", "Show cost breakdown")
    .option("--model <model:string>", "Filter by model/variant")
    .option("--group <group:string>", "Group by: model, task, day, week", {
      default: "model",
    })
    .option(
      "--db <path:string>",
      "Path to stats database",
      { default: "results/centralgauge.db" },
    )
    .action(handleStatsCost);
}
