/**
 * Output formatters for benchmark results
 * Provides multiple formats for different use cases:
 * - verbose: Full detailed output (default)
 * - leaderboard: Twitter-friendly with emojis
 * - scorecard: LinkedIn-friendly with box drawing
 * - barchart: Visual emoji progress bars
 * - json: Machine-readable JSON
 */

import type { AggregateStats, TaskComparison } from "../parallel/types.ts";
import type { TaskExecutionResult } from "../tasks/interfaces.ts";
import { Table } from "@cliffy/table";

export type OutputFormat =
  | "verbose"
  | "leaderboard"
  | "scorecard"
  | "barchart"
  | "json";

export interface FormatterInput {
  stats: AggregateStats;
  comparisons: TaskComparison[];
  taskCount: number;
}

/**
 * Format results as a Twitter-friendly leaderboard (~280 chars)
 */
export function formatLeaderboard(input: FormatterInput): string {
  const { stats, comparisons } = input;
  const lines: string[] = [];

  lines.push("🏆 CentralGauge AL Benchmark Results");
  lines.push("");

  // Sort models by pass rate
  const modelStats = Array.from(stats.perModel.values())
    .sort((a, b) => {
      const passRateA = a.tasksPassed / (a.tasksPassed + a.tasksFailed);
      const passRateB = b.tasksPassed / (b.tasksPassed + b.tasksFailed);
      return passRateB - passRateA;
    });

  for (const model of modelStats) {
    const passRate = model.tasksPassed /
      (model.tasksPassed + model.tasksFailed) * 100;
    const emoji = passRate === 100 ? "✅" : passRate > 0 ? "⚠️" : "❌";
    const attemptInfo = model.avgAttempts <= 1
      ? "(1st attempt)"
      : `(${model.avgAttempts.toFixed(1)} attempts)`;
    lines.push(
      `${shortModelName(model.model)}: ${
        passRate.toFixed(0)
      }% ${emoji} ${attemptInfo}`,
    );
  }

  lines.push("");

  // Winner summary
  const winners = comparisons.filter((c) => c.winner).map((c) => c.winner);
  const winnerCounts = countOccurrences(winners as string[]);
  const topWinner = Object.entries(winnerCounts).sort((a, b) => b[1] - a[1])[0];

  if (topWinner) {
    lines.push(
      `Winner: ${shortModelName(topWinner[0])} | Cost: $${
        stats.totalCost.toFixed(2)
      }`,
    );
  }

  lines.push("#BusinessCentral #AI #LLMBenchmark");

  return lines.join("\n");
}

/**
 * Format results as a LinkedIn-friendly scorecard with box drawing
 */
export function formatScorecard(input: FormatterInput): string {
  const { stats } = input;
  const lines: string[] = [];

  const width = 41;
  const hr = "─".repeat(width - 2);

  lines.push(`┌${hr}┐`);
  lines.push(`│${centerText("CentralGauge AL Code Benchmark", width - 2)}│`);
  lines.push(`├${hr}┤`);

  // Sort models by score
  const modelStats = Array.from(stats.perModel.values())
    .sort((a, b) => b.avgScore - a.avgScore);

  const medals = ["🥇", "🥈", "🥉"];

  modelStats.forEach((model, idx) => {
    const medal = medals[idx] || "  ";
    const passRate = model.tasksPassed /
      (model.tasksPassed + model.tasksFailed) * 100;
    const name = shortModelName(model.model).padEnd(18);
    const rate = `${passRate.toFixed(0)}%`.padStart(4);
    const cost = `$${model.cost.toFixed(2)}`.padStart(6);
    lines.push(`│  ${medal} ${name} ${rate}  ${cost}  │`);
  });

  lines.push(`├${hr}┤`);

  // Summary row
  const taskCount = Array.from(stats.perTask.values()).length;
  const passRateStr = `${(stats.overallPassRate * 100).toFixed(0)}%`;
  const summary = `Tasks: ${taskCount} | Pass Rate: ${passRateStr}`;
  lines.push(`│${centerText(summary, width - 2)}│`);
  lines.push(`└${hr}┘`);

  return lines.join("\n");
}

/**
 * Format results as emoji bar chart
 */
export function formatBarChart(input: FormatterInput): string {
  const { stats, comparisons } = input;
  const lines: string[] = [];

  lines.push("📊 AL Code Generation Benchmark");
  lines.push("");

  // Sort models by score
  const modelStats = Array.from(stats.perModel.values())
    .sort((a, b) => b.avgScore - a.avgScore);

  const maxNameLength = Math.max(
    ...modelStats.map((m) => shortModelName(m.model).length),
  );
  const barLength = 12;

  for (const model of modelStats) {
    const passRate = model.tasksPassed /
      (model.tasksPassed + model.tasksFailed);
    const filledBars = Math.round(passRate * barLength);
    const emptyBars = barLength - filledBars;

    const bar = "█".repeat(filledBars) + "░".repeat(emptyBars);
    const name = shortModelName(model.model).padEnd(maxNameLength);
    const percent = `${(passRate * 100).toFixed(0)}%`.padStart(4);

    lines.push(`${name}  ${bar} ${percent}`);
  }

  lines.push("");

  // Winner and cost
  const winners = comparisons.filter((c) => c.winner).map((c) => c.winner);
  const winnerCounts = countOccurrences(winners as string[]);
  const topWinner = Object.entries(winnerCounts).sort((a, b) => b[1] - a[1])[0];

  if (topWinner) {
    lines.push(
      `✅ Winner: ${shortModelName(topWinner[0])} | 💰 $${
        stats.totalCost.toFixed(2)
      } total`,
    );
  }

  return lines.join("\n");
}

/**
 * Format results as one-liner (ultra-compact)
 */
export function formatCompact(input: FormatterInput): string {
  const { stats, comparisons } = input;

  // Sort models by score
  const modelStats = Array.from(stats.perModel.values())
    .sort((a, b) => b.avgScore - a.avgScore);

  const modelResults = modelStats.map((m) => {
    const passRate = m.tasksPassed / (m.tasksPassed + m.tasksFailed) * 100;
    return `${shortModelName(m.model)} ${passRate.toFixed(0)}%`;
  });

  // Winner
  const winners = comparisons.filter((c) => c.winner).map((c) => c.winner);
  const winnerCounts = countOccurrences(winners as string[]);
  const topWinner = Object.entries(winnerCounts).sort((a, b) => b[1] - a[1])[0];

  const winnerStr = topWinner
    ? ` | Winner: ${shortModelName(topWinner[0])} 🏆`
    : "";

  return `CentralGauge: ${
    modelResults.join(" vs ")
  } on AL code gen${winnerStr}`;
}

/**
 * Format results as JSON (for piping/scripting)
 */
export function formatJSON(input: FormatterInput): string {
  const { stats, comparisons, taskCount } = input;

  return JSON.stringify(
    {
      summary: {
        taskCount,
        passRate: stats.overallPassRate,
        averageScore: stats.averageScore,
        totalTokens: stats.totalTokens,
        totalCost: stats.totalCost,
      },
      models: Object.fromEntries(
        Array.from(stats.perModel.entries()).map(([model, stat]) => [
          model,
          {
            passRate: stat.tasksPassed / (stat.tasksPassed + stat.tasksFailed),
            avgScore: stat.avgScore,
            cost: stat.cost,
            avgAttempts: stat.avgAttempts,
          },
        ]),
      ),
      comparisons: comparisons.map((c) => ({
        winner: c.winner,
        bestScore: c.bestScore,
        ranking: c.ranking,
      })),
    },
    null,
    2,
  );
}

/**
 * Get formatter function by name
 */
export function getFormatter(
  format: OutputFormat,
): (input: FormatterInput) => string {
  switch (format) {
    case "leaderboard":
      return formatLeaderboard;
    case "scorecard":
      return formatScorecard;
    case "barchart":
      return formatBarChart;
    case "json":
      return formatJSON;
    case "verbose":
    default:
      // Verbose is handled by the CLI directly (existing behavior)
      return formatCompact;
  }
}

/**
 * Check if format should auto-copy to clipboard
 */
export function shouldCopyToClipboard(format: OutputFormat): boolean {
  return ["leaderboard", "scorecard", "barchart", "compact"].includes(format);
}

// =============================================================================
// Verbose Output Formatters (Aider-style)
// =============================================================================

/**
 * Format detailed benchmark stats (Aider-style) - horizontal table with models as columns
 */
export function formatBenchmarkStats(input: FormatterInput): string {
  const { stats } = input;

  // Get models sorted by pass rate
  const modelStats = Array.from(stats.perModel.values())
    .sort((a, b) => {
      const passRateA = a.tasksPassed / (a.tasksPassed + a.tasksFailed);
      const passRateB = b.tasksPassed / (b.tasksPassed + b.tasksFailed);
      return passRateB - passRateA;
    });

  const totalResults = modelStats.reduce(
    (sum, m) => sum + m.tasksPassed + m.tasksFailed,
    0,
  );
  const avgAttempts = modelStats.length > 0
    ? modelStats.reduce((sum, m) => sum + m.avgAttempts, 0) / modelStats.length
    : 0;

  // Build header row: Stat | Model1 | Model2 | ... | TOTAL
  const header = ["Stat"];
  for (const model of modelStats) {
    header.push(shortModelName(model.model));
  }
  if (modelStats.length > 1) {
    header.push("TOTAL");
  }

  // Build data rows
  const rows: string[][] = [];

  // Helper to add a row
  const addRow = (
    label: string,
    perModel: (m: typeof modelStats[0]) => string,
    total: string,
  ) => {
    const row = [label];
    for (const model of modelStats) {
      row.push(perModel(model));
    }
    if (modelStats.length > 1) {
      row.push(total);
    }
    rows.push(row);
  };

  // Pass rates
  addRow(
    "pass_rate_1",
    (m) => {
      const t = m.tasksPassed + m.tasksFailed;
      return t > 0 ? `${(m.passedOnAttempt1 / t * 100).toFixed(1)}%` : "0.0%";
    },
    `${(stats.passRate1 * 100).toFixed(1)}%`,
  );
  addRow(
    "pass_rate_2",
    (m) => {
      const t = m.tasksPassed + m.tasksFailed;
      return t > 0 ? `${(m.passedOnAttempt2 / t * 100).toFixed(1)}%` : "0.0%";
    },
    `${(stats.passRate2 * 100).toFixed(1)}%`,
  );
  addRow(
    "pass_num_1",
    (m) => `${m.passedOnAttempt1}/${m.tasksPassed + m.tasksFailed}`,
    `${stats.passNum1}/${totalResults}`,
  );
  addRow(
    "pass_num_2",
    (m) => `${m.passedOnAttempt2}/${m.tasksPassed + m.tasksFailed}`,
    `${stats.passNum2}/${totalResults}`,
  );
  addRow(
    "compile_errors",
    (m) => String(m.compileFailures),
    String(stats.totalCompileErrors),
  );
  addRow(
    "test_failures",
    (m) => String(m.testFailures),
    String(stats.totalTestFailures),
  );
  addRow(
    "malformed",
    (m) => String(m.malformedResponses),
    String(stats.totalMalformed),
  );
  addRow(
    "avg_attempts",
    (m) => m.avgAttempts.toFixed(1),
    avgAttempts.toFixed(1),
  );
  addRow(
    "tokens",
    (m) => m.tokens.toLocaleString("en-US"),
    stats.totalTokens.toLocaleString("en-US"),
  );
  addRow(
    "cost",
    (m) => `$${m.cost.toFixed(4)}`,
    `$${stats.totalCost.toFixed(4)}`,
  );

  // Add timing row (only in total)
  if (modelStats.length > 1) {
    const timingRow = ["seconds_per_task"];
    for (let i = 0; i < modelStats.length; i++) {
      timingRow.push("-");
    }
    timingRow.push(stats.secondsPerTask.toFixed(1));
    rows.push(timingRow);
  } else {
    rows.push(["seconds_per_task", stats.secondsPerTask.toFixed(1)]);
  }

  // Build table using cliffy
  const table = new Table()
    .header(header)
    .body(rows)
    .border(true);

  return "\n=== BENCHMARK STATS ===\n" + table.toString();
}

/**
 * Format model summary table with PR1/PR2 columns
 */
export function formatModelSummaryTable(input: FormatterInput): string {
  const { stats } = input;

  // Sort models by pass rate
  const modelStats = Array.from(stats.perModel.values())
    .sort((a, b) => {
      const passRateA = a.tasksPassed / (a.tasksPassed + a.tasksFailed);
      const passRateB = b.tasksPassed / (b.tasksPassed + b.tasksFailed);
      return passRateB - passRateA;
    });

  if (modelStats.length === 0) {
    return "";
  }

  const table = new Table()
    .header(["Model", "PR1", "PR2", "Score", "Attempts", "Tokens", "Cost"])
    .border(true);

  for (const model of modelStats) {
    const total = model.tasksPassed + model.tasksFailed;
    const pr1 = total > 0
      ? (model.passedOnAttempt1 / total * 100).toFixed(0) + "%"
      : "0%";
    const pr2 = total > 0
      ? (model.passedOnAttempt2 / total * 100).toFixed(0) + "%"
      : "0%";

    table.push([
      shortModelName(model.model),
      pr1,
      pr2,
      model.avgScore.toFixed(1),
      model.avgAttempts.toFixed(1),
      model.tokens.toLocaleString("en-US"),
      "$" + model.cost.toFixed(2),
    ]);
  }

  return "\n=== MODEL PERFORMANCE ===\n" +
    table.toString() +
    "\nLegend: PR1 = Pass Rate 1st attempt, PR2 = Pass Rate by 2nd attempt";
}

/**
 * Extended formatter input for task matrix (needs results)
 */
export interface TaskMatrixInput extends FormatterInput {
  results: TaskExecutionResult[];
}

/**
 * Format task × model matrix
 */
export function formatTaskMatrix(input: TaskMatrixInput): string {
  const { stats, results, comparisons } = input;

  if (stats.perTask.size <= 1) {
    return ""; // Skip for single task
  }

  // Get unique models and tasks
  const models = Array.from(stats.perModel.keys());
  const tasks = Array.from(stats.perTask.keys());

  if (models.length === 0 || tasks.length === 0) {
    return "";
  }

  // Build header
  const header = ["Task", ...models.map((m) => shortModelName(m)), "Winner"];

  const table = new Table()
    .header(header)
    .border(true);

  // Build task comparison map
  const comparisonMap = new Map<string, TaskComparison>();
  // Get task IDs from comparisons by matching order with tasks array
  for (let i = 0; i < comparisons.length && i < tasks.length; i++) {
    comparisonMap.set(tasks[i], comparisons[i]);
  }

  // Group results by task and model
  const resultMap = new Map<string, Map<string, TaskExecutionResult>>();
  for (const result of results) {
    if (!resultMap.has(result.taskId)) {
      resultMap.set(result.taskId, new Map());
    }
    resultMap.get(result.taskId)!.set(result.context.llmModel, result);
  }

  // Track totals per model
  const totals: Record<string, { passed: number; total: number }> = {};
  for (const model of models) {
    totals[model] = { passed: 0, total: 0 };
  }

  // Build rows
  for (const taskId of tasks) {
    const taskResults = resultMap.get(taskId) || new Map();
    const comparison = comparisonMap.get(taskId);

    const row: string[] = [
      taskId.length > 20 ? taskId.substring(0, 17) + "..." : taskId,
    ];

    for (const model of models) {
      const result = taskResults.get(model);
      totals[model].total++;

      if (result) {
        if (result.success) {
          totals[model].passed++;
          const attemptInfo = result.passedAttemptNumber === 1
            ? "1st"
            : `${result.passedAttemptNumber}nd`;
          row.push(`✅ ${result.finalScore.toFixed(0)} (${attemptInfo})`);
        } else {
          // Determine failure type
          const lastAttempt = result.attempts[result.attempts.length - 1];
          let failType = "fail";
          if (lastAttempt) {
            const reasons = lastAttempt.failureReasons.join(" ");
            if (reasons.includes("Compilation")) failType = "compile";
            else if (reasons.includes("Tests")) failType = "test";
          }
          row.push(`❌ 0 (${failType})`);
        }
      } else {
        row.push("-");
      }
    }

    // Winner column
    let winnerCell: string;
    if (comparison?.winner) {
      winnerCell = shortModelName(comparison.winner);
    } else if (comparison && comparison.passingModels.length > 1) {
      // Multiple models passed with same score - it's a tie
      winnerCell = "TIE";
    } else if (comparison && comparison.passingModels.length === 0) {
      // No models passed - no winner
      winnerCell = "NONE";
    } else {
      winnerCell = "-";
    }
    row.push(winnerCell);

    table.push(row);
  }

  // Totals row
  const totalsRow: string[] = ["TOTALS"];
  for (const model of models) {
    const { passed, total } = totals[model];
    const pct = total > 0 ? (passed / total * 100).toFixed(0) : "0";
    totalsRow.push(`${passed}/${total} (${pct}%)`);
  }
  totalsRow.push("");
  table.push(totalsRow);

  return "\n=== TASK RESULTS MATRIX ===\n" + table.toString();
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Shorten model name for display
 */
function shortModelName(model: string): string {
  // Common shortenings
  const shortenings: Record<string, string> = {
    "claude-opus-4-5-20251101": "Claude Opus 4.5",
    "claude-sonnet-4-5-20250929": "Claude Sonnet 4.5",
    "claude-haiku-4-5-20251001": "Claude Haiku 4.5",
    "gpt-5.1": "GPT-5.1",
    "gpt-5.2": "GPT-5.2",
    "gpt-4o": "GPT-4o",
    "gpt-4o-mini": "GPT-4o Mini",
    "gpt-4-turbo": "GPT-4 Turbo",
    "gemini-2.5-pro": "Gemini 2.5 Pro",
    "gemini-2.5-flash": "Gemini 2.5 Flash",
  };

  return shortenings[model] || model.split("-").slice(0, 3).join("-");
}

/**
 * Center text within a given width
 */
function centerText(text: string, width: number): string {
  const padding = Math.max(0, width - text.length);
  const leftPad = Math.floor(padding / 2);
  const rightPad = padding - leftPad;
  return " ".repeat(leftPad) + text + " ".repeat(rightPad);
}

/**
 * Count occurrences in array
 */
function countOccurrences(arr: string[]): Record<string, number> {
  return arr.reduce((acc, item) => {
    acc[item] = (acc[item] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}
