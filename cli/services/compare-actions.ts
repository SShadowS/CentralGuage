/**
 * Model Comparison Actions - Service layer for TUI model comparison
 */
import { openStorage } from "../../src/stats/mod.ts";
import type { ModelComparison } from "../../src/stats/types.ts";

export interface CompareResult {
  success: boolean;
  message: string;
  comparison?: ModelComparison | undefined;
  availableModels?: string[] | undefined;
}

const DEFAULT_DB_PATH = "results/centralgauge.db";

/**
 * Get list of available model variants from the stats database
 */
export async function getAvailableModels(
  dbPath: string = DEFAULT_DB_PATH,
): Promise<CompareResult> {
  try {
    // Check if database exists
    try {
      await Deno.stat(dbPath);
    } catch {
      return {
        success: false,
        message:
          `Stats database not found at ${dbPath}. Run 'centralgauge stats-import' first.`,
      };
    }

    const storage = await openStorage({
      type: "sqlite",
      sqlitePath: dbPath,
    });

    try {
      const variants = await storage.getVariantIds();

      if (variants.length === 0) {
        return {
          success: false,
          message:
            "No model data found. Run 'centralgauge stats-import' first.",
        };
      }

      return {
        success: true,
        message: `Found ${variants.length} models`,
        availableModels: variants,
      };
    } finally {
      await storage.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Failed to get models: ${message}`,
    };
  }
}

/**
 * Compare two models
 */
export async function compareModels(
  model1: string,
  model2: string,
  dbPath: string = DEFAULT_DB_PATH,
): Promise<CompareResult> {
  try {
    const storage = await openStorage({
      type: "sqlite",
      sqlitePath: dbPath,
    });

    try {
      const comparison = await storage.compareModels(model1, model2);
      return {
        success: true,
        message: "Comparison complete",
        comparison,
      };
    } finally {
      await storage.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Comparison failed: ${message}`,
    };
  }
}

/**
 * Format a model name for display (truncate long names)
 */
export function formatModelName(variantId: string, maxLength = 25): string {
  if (variantId.length <= maxLength) return variantId;
  // Take start and end
  const start = variantId.slice(0, maxLength - 3);
  return start + "...";
}

/**
 * Format comparison results as lines for display
 */
export function formatComparisonLines(comparison: ModelComparison): string[] {
  const lines: string[] = [];
  const m1 = formatModelName(comparison.variant1, 20);
  const m2 = formatModelName(comparison.variant2, 20);

  lines.push(`${m1} vs ${m2}`);
  lines.push("");
  lines.push("=== Summary ===");
  lines.push("");
  lines.push(
    `Wins:      ${comparison.variant1Wins} - ${comparison.variant2Wins} (${comparison.ties} ties)`,
  );
  lines.push(
    `Avg Score: ${comparison.variant1AvgScore.toFixed(1)} vs ${
      comparison.variant2AvgScore.toFixed(1)
    }`,
  );
  lines.push(
    `Cost:      $${comparison.variant1Cost.toFixed(4)} vs $${
      comparison.variant2Cost.toFixed(4)
    }`,
  );

  if (comparison.perTask.length > 0) {
    lines.push("");
    lines.push("=== Per-Task Results ===");
    lines.push("");

    // Header
    lines.push(
      padRight("Task", 20) +
        padRight(m1.slice(0, 10), 12) +
        padRight(m2.slice(0, 10), 12) +
        "Winner",
    );
    lines.push("-".repeat(54));

    for (const task of comparison.perTask) {
      const winnerLabel = task.winner === "variant1"
        ? m1.slice(0, 10)
        : task.winner === "variant2"
        ? m2.slice(0, 10)
        : "tie";

      lines.push(
        padRight(task.taskId, 20) +
          padRight(task.variant1Score.toFixed(1), 12) +
          padRight(task.variant2Score.toFixed(1), 12) +
          winnerLabel,
      );
    }
  }

  return lines;
}

function padRight(str: string, length: number): string {
  return str.padEnd(length, " ");
}
