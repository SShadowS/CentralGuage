/**
 * Output formatters for benchmark results
 * Provides multiple formats for different use cases:
 * - verbose: Full detailed output (default)
 * - leaderboard: Twitter-friendly with emojis
 * - scorecard: LinkedIn-friendly with box drawing
 * - barchart: Visual emoji progress bars
 * - json: Machine-readable JSON
 */

import type {
  AggregateStats,
  ModelStats,
  TaskComparison,
} from "../parallel/types.ts";
import type { TaskExecutionResult } from "../tasks/interfaces.ts";
import type { VariantConfig } from "../llm/variant-types.ts";
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
      `${shortModelName(model.model, model.variantConfig)}: ${
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
    const winnerStat = stats.perModel.get(topWinner[0]);
    lines.push(
      `Winner: ${
        shortModelName(
          winnerStat?.model || topWinner[0],
          winnerStat?.variantConfig,
        )
      } | Cost: $${stats.totalCost.toFixed(2)}`,
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
    const name = shortModelName(model.model, model.variantConfig).padEnd(18);
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
    ...modelStats.map((m) => shortModelName(m.model, m.variantConfig).length),
  );
  const barLength = 12;

  for (const model of modelStats) {
    const passRate = model.tasksPassed /
      (model.tasksPassed + model.tasksFailed);
    const filledBars = Math.round(passRate * barLength);
    const emptyBars = barLength - filledBars;

    const bar = "█".repeat(filledBars) + "░".repeat(emptyBars);
    const name = shortModelName(model.model, model.variantConfig).padEnd(
      maxNameLength,
    );
    const percent = `${(passRate * 100).toFixed(0)}%`.padStart(4);

    lines.push(`${name}  ${bar} ${percent}`);
  }

  lines.push("");

  // Winner and cost
  const winners = comparisons.filter((c) => c.winner).map((c) => c.winner);
  const winnerCounts = countOccurrences(winners as string[]);
  const topWinner = Object.entries(winnerCounts).sort((a, b) => b[1] - a[1])[0];

  if (topWinner) {
    const winnerStat = stats.perModel.get(topWinner[0]);
    lines.push(
      `✅ Winner: ${
        shortModelName(
          winnerStat?.model || topWinner[0],
          winnerStat?.variantConfig,
        )
      } | 💰 $${stats.totalCost.toFixed(2)} total`,
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
    return `${shortModelName(m.model, m.variantConfig)} ${
      passRate.toFixed(0)
    }%`;
  });

  // Winner
  const winners = comparisons.filter((c) => c.winner).map((c) => c.winner);
  const winnerCounts = countOccurrences(winners as string[]);
  const topWinner = Object.entries(winnerCounts).sort((a, b) => b[1] - a[1])[0];

  const winnerStr = topWinner
    ? (() => {
      const winnerStat = stats.perModel.get(topWinner[0]);
      return ` | Winner: ${
        shortModelName(
          winnerStat?.model || topWinner[0],
          winnerStat?.variantConfig,
        )
      } 🏆`;
    })()
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
  const modelStats = getSortedModelStats(stats);
  const header = buildBenchmarkHeader(modelStats);
  const rows = buildBenchmarkRows(modelStats, stats);

  const table = new Table()
    .header(header)
    .body(rows)
    .border(true);

  return "\n=== BENCHMARK STATS ===\n" + table.toString();
}

function getSortedModelStats(stats: AggregateStats): ModelStats[] {
  return Array.from(stats.perModel.values())
    .sort((a, b) => {
      const passRateA = a.tasksPassed / (a.tasksPassed + a.tasksFailed);
      const passRateB = b.tasksPassed / (b.tasksPassed + b.tasksFailed);
      return passRateB - passRateA;
    });
}

function buildBenchmarkHeader(modelStats: ModelStats[]): string[] {
  const header = ["Stat"];
  for (const model of modelStats) {
    header.push(shortModelName(model.model, model.variantConfig));
  }
  if (modelStats.length > 1) {
    header.push("TOTAL");
  }
  return header;
}

function buildBenchmarkRows(
  modelStats: ModelStats[],
  stats: AggregateStats,
): string[][] {
  const rows: string[][] = [];
  const totalResults = modelStats.reduce(
    (sum, m) => sum + m.tasksPassed + m.tasksFailed,
    0,
  );
  const avgAttempts = modelStats.length > 0
    ? modelStats.reduce((sum, m) => sum + m.avgAttempts, 0) / modelStats.length
    : 0;

  const addRow = (
    label: string,
    perModel: (m: ModelStats) => string,
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

  const formatPassRate = (m: ModelStats, attempt: 1 | 2) => {
    const t = m.tasksPassed + m.tasksFailed;
    const passed = attempt === 1 ? m.passedOnAttempt1 : m.passedOnAttempt2;
    return t > 0 ? `${(passed / t * 100).toFixed(1)}%` : "0.0%";
  };

  addRow(
    "pass_rate_1",
    (m) => formatPassRate(m, 1),
    `${(stats.passRate1 * 100).toFixed(1)}%`,
  );
  addRow(
    "pass_rate_2",
    (m) => formatPassRate(m, 2),
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

  // Add timing rows
  if (modelStats.length > 1) {
    rows.push([
      "seconds_per_task",
      ...modelStats.map(() => "-"),
      stats.secondsPerTask.toFixed(1),
    ]);
    rows.push([
      "llm_time",
      ...modelStats.map(() => "-"),
      formatDuration(stats.totalLLMDuration),
    ]);
    rows.push([
      "compile_time",
      ...modelStats.map(() => "-"),
      formatDuration(stats.totalCompileDuration),
    ]);
    rows.push([
      "test_time",
      ...modelStats.map(() => "-"),
      formatDuration(stats.totalTestDuration),
    ]);
    rows.push([
      "total_time",
      ...modelStats.map(() => "-"),
      formatDuration(stats.totalDuration),
    ]);
  } else {
    rows.push(["seconds_per_task", stats.secondsPerTask.toFixed(1)]);
    rows.push(["llm_time", formatDuration(stats.totalLLMDuration)]);
    rows.push(["compile_time", formatDuration(stats.totalCompileDuration)]);
    rows.push(["test_time", formatDuration(stats.totalTestDuration)]);
    rows.push(["total_time", formatDuration(stats.totalDuration)]);
  }

  return rows;
}

/**
 * Format duration in ms to human-readable string (e.g., "1m 23s" or "45.2s")
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return `${minutes}m ${seconds.toFixed(0)}s`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
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
      shortModelName(model.model, model.variantConfig),
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

  const models = Array.from(stats.perModel.keys());
  const tasks = Array.from(stats.perTask.keys());

  if (models.length === 0 || tasks.length === 0) {
    return "";
  }

  const header = buildMatrixHeader(models, stats);
  const table = new Table().header(header).border(true);

  const comparisonMap = buildComparisonMap(comparisons, tasks);
  const resultMap = buildResultMap(results);
  const totals = initializeModelTotals(models);

  for (const taskId of tasks) {
    const row = buildTaskRow(
      taskId,
      models,
      resultMap,
      comparisonMap,
      totals,
      stats,
    );
    table.push(row);
  }

  table.push(buildTotalsRow(models, totals));

  return "\n=== TASK RESULTS MATRIX ===\n" + table.toString();
}

// =============================================================================
// Task Matrix Helper Functions
// =============================================================================

/** Build the header row for the task matrix */
function buildMatrixHeader(
  models: string[],
  stats: AggregateStats,
): string[] {
  return [
    "Task",
    ...models.map((variantId) => {
      const modelStat = stats.perModel.get(variantId);
      return shortModelName(
        modelStat?.model || variantId,
        modelStat?.variantConfig,
      );
    }),
    "Winner",
  ];
}

/** Build a map of task ID to comparison data */
function buildComparisonMap(
  comparisons: TaskComparison[],
  tasks: string[],
): Map<string, TaskComparison> {
  const comparisonMap = new Map<string, TaskComparison>();

  // Check if comparisons have taskId (new format)
  const hasTaskId = comparisons.length > 0 && comparisons[0]?.taskId;

  if (hasTaskId) {
    // Use taskId from comparison (correct mapping)
    for (const comparison of comparisons) {
      if (comparison.taskId) {
        comparisonMap.set(comparison.taskId, comparison);
      }
    }
  } else {
    // Legacy fallback: map by array index (may be incorrect if order differs)
    for (let i = 0; i < comparisons.length && i < tasks.length; i++) {
      const taskId = tasks[i];
      const comparison = comparisons[i];
      if (taskId !== undefined && comparison !== undefined) {
        comparisonMap.set(taskId, comparison);
      }
    }
  }

  return comparisonMap;
}

/** Group results by task ID and variant ID */
function buildResultMap(
  results: TaskExecutionResult[],
): Map<string, Map<string, TaskExecutionResult>> {
  const resultMap = new Map<string, Map<string, TaskExecutionResult>>();
  for (const result of results) {
    if (!resultMap.has(result.taskId)) {
      resultMap.set(result.taskId, new Map());
    }
    const variantId = result.context.variantId ||
      `${result.context.llmProvider}/${result.context.llmModel}`;
    resultMap.get(result.taskId)!.set(variantId, result);
  }
  return resultMap;
}

/** Initialize totals tracking for each model */
function initializeModelTotals(
  models: string[],
): Record<string, { passed: number; total: number }> {
  const totals: Record<string, { passed: number; total: number }> = {};
  for (const model of models) {
    totals[model] = { passed: 0, total: 0 };
  }
  return totals;
}

/** Build a single task row for the matrix */
function buildTaskRow(
  taskId: string,
  models: string[],
  resultMap: Map<string, Map<string, TaskExecutionResult>>,
  comparisonMap: Map<string, TaskComparison>,
  totals: Record<string, { passed: number; total: number }>,
  stats: AggregateStats,
): string[] {
  const taskResults = resultMap.get(taskId) || new Map();
  const comparison = comparisonMap.get(taskId);

  const row: string[] = [truncateTaskId(taskId)];

  for (const model of models) {
    const result = taskResults.get(model);
    const modelTotals = totals[model];
    if (!modelTotals) continue;
    modelTotals.total++;

    row.push(formatResultCell(result, modelTotals));
  }

  row.push(formatWinnerCell(comparison, stats));
  return row;
}

/** Truncate task ID for display */
function truncateTaskId(taskId: string): string {
  return taskId.length > 20 ? taskId.substring(0, 17) + "..." : taskId;
}

/** Extract test counts from the last attempt's test result */
function formatTestInfo(result: TaskExecutionResult): string {
  const lastAttempt = result.attempts[result.attempts.length - 1];
  if (!lastAttempt?.testResult) {
    return ""; // No tests ran (compile failure)
  }
  const { passedTests, totalTests } = lastAttempt.testResult;
  if (totalTests === 0) return "";
  return `, tests: ${passedTests}/${totalTests}`;
}

/** Format a single result cell (success/failure) */
function formatResultCell(
  result: TaskExecutionResult | undefined,
  modelTotals: { passed: number; total: number },
): string {
  if (!result) {
    return "-";
  }

  if (result.success) {
    modelTotals.passed++;
    const attemptInfo = formatAttemptInfo(result.passedAttemptNumber);
    const testInfo = formatTestInfo(result);
    return `✅ ${result.finalScore.toFixed(0)} (${attemptInfo}${testInfo})`;
  }

  const failType = determineFailureType(result);
  const testInfo = formatTestInfo(result);
  return `❌ 0 (${failType}${testInfo})`;
}

/** Format attempt number for display */
function formatAttemptInfo(attemptNumber: number): string {
  return attemptNumber === 1 ? "1st" : `${attemptNumber}nd`;
}

/** Determine the type of failure from the result */
function determineFailureType(result: TaskExecutionResult): string {
  const lastAttempt = result.attempts[result.attempts.length - 1];
  if (!lastAttempt) {
    return "fail";
  }

  const reasons = lastAttempt.failureReasons.join(" ");
  if (reasons.includes("Compilation")) return "compile";
  if (reasons.includes("Tests")) return "test";
  return "fail";
}

/** Format the winner cell */
function formatWinnerCell(
  comparison: TaskComparison | undefined,
  stats: AggregateStats,
): string {
  if (comparison?.winner) {
    const winnerStat = stats.perModel.get(comparison.winner);
    return shortModelName(
      winnerStat?.model || comparison.winner,
      winnerStat?.variantConfig,
    );
  }

  if (comparison && comparison.passingModels.length > 1) {
    // Find models that tied for first place (rank 1 or same as best score)
    const tiedModels = comparison.ranking.filter(
      (r) => r.score === comparison.bestScore && r.score > 0,
    );

    if (tiedModels.length > 1) {
      // Show abbreviated names of tied models
      const tiedNames = tiedModels.map((r) => {
        const stat = stats.perModel.get(r.model);
        return tinyModelName(stat?.model || r.model, stat?.variantConfig);
      });

      // If too many tied, show first 2 + count
      if (tiedNames.length > 3) {
        return `TIE: ${tiedNames.slice(0, 2).join(", ")} +${
          tiedNames.length - 2
        }`;
      }
      return `TIE: ${tiedNames.join(", ")}`;
    }
    return "TIE";
  }

  if (comparison && comparison.passingModels.length === 0) {
    return "NONE";
  }

  return "-";
}

/** Very short model name for tie display */
function tinyModelName(model: string, variantConfig?: VariantConfig): string {
  // Ultra-short mappings for table display
  const tinyNames: Record<string, string> = {
    "claude-opus-4-5-20251101": "Opus",
    "claude-sonnet-4-5-20250929": "Son",
    "claude-haiku-4-5-20251001": "Haiku",
    "gpt-5.1": "5.1",
    "gpt-5.2": "5.2",
    "gpt-5.2-2025": "5.2",
    "gpt-4o": "4o",
    "gpt-4o-mini": "4oM",
    "gpt-4-turbo": "4T",
    "gemini-3-pro-preview": "Gem3",
    "gemini-2.5-pro": "Gem",
    "gemini-2.5-flash": "GemF",
  };

  const baseName = tinyNames[model] || model.slice(0, 6);

  // Add thinking indicator if present
  if (variantConfig?.thinkingBudget !== undefined) {
    return `${baseName}@T`;
  }
  return baseName;
}

/** Build the totals row */
function buildTotalsRow(
  models: string[],
  totals: Record<string, { passed: number; total: number }>,
): string[] {
  const totalsRow: string[] = ["TOTALS"];
  for (const model of models) {
    const modelTotals = totals[model];
    if (!modelTotals) continue;
    const { passed, total } = modelTotals;
    const pct = total > 0 ? ((passed / total) * 100).toFixed(0) : "0";
    totalsRow.push(`${passed}/${total} (${pct}%)`);
  }
  totalsRow.push("");
  return totalsRow;
}

// =============================================================================
// General Helper Functions
// =============================================================================

/**
 * Shorten model name for display, including variant config suffix when present
 */
export function shortModelName(
  model: string,
  variantConfig?: VariantConfig,
): string {
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
    "gemini-3-pro-preview": "Gemini 3 Pro",
    "gemini-2.5-pro": "Gemini 2.5 Pro",
    "gemini-2.5-flash": "Gemini 2.5 Flash",
  };

  const baseName = shortenings[model] || model.split("-").slice(0, 3).join("-");

  if (!variantConfig) return baseName;

  // Build variant suffix from config
  const parts: string[] = [];
  if (variantConfig.thinkingBudget !== undefined) {
    parts.push(`thinking=${variantConfig.thinkingBudget}`);
  }
  if (variantConfig.temperature !== undefined) {
    parts.push(`temp=${variantConfig.temperature}`);
  }
  if (variantConfig.maxTokens !== undefined) {
    parts.push(`tokens=${variantConfig.maxTokens}`);
  }
  if (variantConfig.systemPromptName) {
    parts.push(`prompt=${variantConfig.systemPromptName}`);
  }

  return parts.length > 0 ? `${baseName}@${parts.join(",")}` : baseName;
}

/**
 * Parse a variantId string and return a shortened display name.
 * Handles formats like "anthropic/claude-opus-4-5-20251101@thinking=50000"
 */
export function shortVariantName(variantId: string): string {
  // Extract provider and model parts
  const [providerModel = "", ...configParts] = variantId.split("@");
  const parts = providerModel.split("/");
  const model = parts[parts.length - 1] || providerModel;

  // Common shortenings for compact display
  const shortenings: Record<string, string> = {
    "claude-opus-4-5-20251101": "Opus 4.5",
    "claude-sonnet-4-5-20250929": "Sonnet 4.5",
    "claude-haiku-4-5-20251001": "Haiku 4.5",
    "gpt-5.1": "GPT-5.1",
    "gpt-5.2": "GPT-5.2",
    "gpt-5.2-2025-12-11": "GPT-5.2",
    "gpt-4o": "GPT-4o",
    "gpt-4o-mini": "GPT-4o Mini",
    "gpt-4-turbo": "GPT-4 Turbo",
    "gemini-3-pro-preview": "Gemini 3 Pro",
    "gemini-2.5-pro": "Gemini 2.5 Pro",
    "gemini-2.5-flash": "Gemini 2.5 Flash",
  };

  const baseName = shortenings[model] ?? model.split("-").slice(0, 3).join("-");

  // Parse config suffix if present
  const configStr = configParts.join("@");
  if (!configStr) return baseName;

  // Add thinking indicator if present
  if (configStr.includes("thinking=") || configStr.includes("reasoning=")) {
    return `${baseName} (think)`;
  }

  return baseName;
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
