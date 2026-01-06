/**
 * Statistics calculation for benchmark results
 * @module cli/commands/report/stats-calculator
 */

import type {
  BenchmarkResult,
  BenchmarkStats,
  PerModelStats,
} from "../../types/cli-types.ts";

/**
 * Calculate per-model statistics from benchmark results
 */
export function calculatePerModelStats(
  results: BenchmarkResult[],
): Map<string, PerModelStats> {
  const perModelMap = new Map<string, PerModelStats>();

  for (const result of results) {
    const variantId = result.context?.variantId ||
      result.context?.llmModel || "unknown";

    if (!perModelMap.has(variantId)) {
      perModelMap.set(variantId, {
        model: variantId.split("/").pop()?.split("@")[0] || variantId,
        provider: result.context?.llmProvider || "unknown",
        variantId,
        tasksPassed: 0,
        tasksFailed: 0,
        avgScore: 0,
        tokens: 0,
        cost: 0,
        avgAttempts: 0,
        passedOnAttempt1: 0,
        passedOnAttempt2: 0,
        compileFailures: 0,
        testFailures: 0,
        malformedResponses: 0,
        variantConfig: result.context?.variantConfig ?? null,
      });
    }

    const m = perModelMap.get(variantId)!;

    if (result.success) {
      m.tasksPassed++;
      if (result.attempts?.[0]?.success) {
        m.passedOnAttempt1++;
      }
      m.passedOnAttempt2++;
    } else {
      m.tasksFailed++;
    }

    m.tokens += result.totalTokensUsed || 0;
    m.cost += result.totalCost || 0;
    m.avgScore += result.finalScore || 0;
  }

  // Calculate averages
  for (const m of perModelMap.values()) {
    const total = m.tasksPassed + m.tasksFailed;
    if (total > 0) {
      m.avgScore = m.avgScore / total;
    }
  }

  return perModelMap;
}

/**
 * Calculate overall benchmark statistics
 */
export function calculateBenchmarkStats(
  results: BenchmarkResult[],
  perModelMap: Map<string, PerModelStats>,
): BenchmarkStats {
  return {
    overallPassRate: 0,
    averageScore: 0,
    totalTokens: results.reduce((sum, r) => sum + (r.totalTokensUsed || 0), 0),
    totalCost: results.reduce((sum, r) => sum + (r.totalCost || 0), 0),
    totalDuration: 0,
    perModel: Object.fromEntries(perModelMap),
  };
}

/**
 * Sort models by pass rate descending
 */
export function sortModelsByPassRate(
  perModelMap: Map<string, PerModelStats>,
): [string, PerModelStats][] {
  return [...perModelMap.entries()].sort(([, a], [, b]) => {
    const aRate = a.tasksPassed / (a.tasksPassed + a.tasksFailed);
    const bRate = b.tasksPassed / (b.tasksPassed + b.tasksFailed);
    return bRate - aRate;
  });
}

/**
 * Build a temperature lookup map from results
 */
export function buildTemperatureLookup(
  results: BenchmarkResult[],
): Map<string, number | undefined> {
  const tempLookup = new Map<string, number | undefined>();

  for (const result of results) {
    const vid = result.context?.variantId || result.context?.llmModel;
    if (vid && !tempLookup.has(vid)) {
      tempLookup.set(vid, result.context?.temperature);
    }
  }

  return tempLookup;
}
