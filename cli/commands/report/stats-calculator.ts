/**
 * Statistics calculation for benchmark results
 * @module cli/commands/report/stats-calculator
 */

import type {
  BenchmarkResult,
  BenchmarkStats,
  MultiRunModelStats,
  PerModelStats,
  TaskRunData,
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
        passedByAttempt: [],
        compileFailures: 0,
        testFailures: 0,
        malformedResponses: 0,
        variantConfig: result.context?.variantConfig ?? null,
      });
    }

    const m = perModelMap.get(variantId)!;

    if (result.success) {
      m.tasksPassed++;
      // Find which attempt first succeeded
      const successIndex = result.attempts?.findIndex((a) => a.success) ?? 0;
      // Grow array if needed
      while (m.passedByAttempt.length <= successIndex) {
        m.passedByAttempt.push(0);
      }
      m.passedByAttempt[successIndex] = (m.passedByAttempt[successIndex] ?? 0) +
        1;
      // Backward compat
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

/**
 * Binomial coefficient C(n, k) = n! / (k! * (n-k)!)
 * Returns 0 if k > n or k < 0.
 */
export function binomialCoefficient(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  // Use the smaller k to minimize iterations
  const useK = Math.min(k, n - k);
  let result = 1;
  for (let i = 0; i < useK; i++) {
    result = result * (n - i) / (i + 1);
  }
  return result;
}

/**
 * Compute pass@k for a single task:
 * pass@k = 1 - C(n-c, k) / C(n, k)
 *
 * Where n = total runs, c = successful runs.
 * Returns 1 if k > n (trivially true when we sample more than available).
 */
export function passAtKForTask(
  n: number,
  c: number,
  k: number,
): number {
  if (k > n) return c > 0 ? 1 : 0;
  if (c === 0) return 0;
  if (c >= n) return 1;
  return 1 - binomialCoefficient(n - c, k) / binomialCoefficient(n, k);
}

/**
 * Calculate multi-run model statistics with pass@k from grouped results.
 *
 * @param grouped Map<variantId, Map<taskId, BenchmarkResult[]>> from groupResultsByModelAndTask
 * @param runCount Maximum number of runs detected
 */
export function calculateMultiRunStats(
  grouped: Map<string, Map<string, BenchmarkResult[]>>,
  runCount: number,
): Map<string, MultiRunModelStats> {
  const result = new Map<string, MultiRunModelStats>();

  for (const [variantId, taskMap] of grouped) {
    // Collect per-task run data
    const perTaskRuns = new Map<string, TaskRunData>();
    let totalTokens = 0;
    let totalCost = 0;
    let totalScore = 0;
    let totalTasks = 0;
    let tasksPassedAny = 0;
    let passedOnAttempt1 = 0;
    let passedOnAttempt2 = 0;
    const passedByAttemptAgg: number[] = [];
    const compileFailures = 0;
    const testFailures = 0;
    const malformedResponses = 0;
    let provider = "unknown";
    let model = variantId;
    let variantConfig: PerModelStats["variantConfig"] = null;

    for (const [taskId, runs] of taskMap) {
      const outcomes = runs.map((r) => r.success);
      const successfulRuns = outcomes.filter(Boolean).length;
      const allSame = outcomes.every((o) => o === outcomes[0]);

      perTaskRuns.set(taskId, {
        taskId,
        totalRuns: runs.length,
        successfulRuns,
        outcomes,
        consistent: allSame,
      });

      totalTasks++;
      // "any" semantics: task counts as passed if it passed in ANY run
      if (successfulRuns > 0) {
        tasksPassedAny++;
      }

      // Aggregate tokens/cost across all runs
      for (const run of runs) {
        totalTokens += run.totalTokensUsed || 0;
        totalCost += run.totalCost || 0;
        totalScore += run.finalScore || 0;

        // Use first run's metadata for provider/model info
        if (provider === "unknown" && run.context?.llmProvider) {
          provider = run.context.llmProvider;
        }
        if (model === variantId && run.context?.llmModel) {
          model = variantId.split("/").pop()?.split("@")[0] || variantId;
        }
        if (!variantConfig && run.context?.variantConfig) {
          variantConfig = run.context.variantConfig;
        }

        // Track attempt-level stats from each run
        if (run.success) {
          const successIndex = run.attempts?.findIndex((a) => a.success) ?? 0;
          while (passedByAttemptAgg.length <= successIndex) {
            passedByAttemptAgg.push(0);
          }
          passedByAttemptAgg[successIndex] =
            (passedByAttemptAgg[successIndex] ?? 0) + 1;
          if (run.attempts?.[0]?.success) {
            passedOnAttempt1++;
          }
          passedOnAttempt2++;
        }
      }
    }

    // Compute pass@k for each k from 1..runCount, averaged across tasks
    const passAtK: Record<number, number> = {};
    for (let k = 1; k <= runCount; k++) {
      let sumPassAtK = 0;
      for (const taskRun of perTaskRuns.values()) {
        sumPassAtK += passAtKForTask(
          taskRun.totalRuns,
          taskRun.successfulRuns,
          k,
        );
      }
      passAtK[k] = totalTasks > 0 ? sumPassAtK / totalTasks : 0;
    }

    // Consistency: fraction of tasks where all runs have the same outcome
    let consistentCount = 0;
    for (const taskRun of perTaskRuns.values()) {
      if (taskRun.consistent) consistentCount++;
    }
    const consistency = totalTasks > 0 ? consistentCount / totalTasks : 0;

    const tasksFailed = totalTasks - tasksPassedAny;
    const totalResults = tasksPassedAny + tasksFailed; // = totalTasks

    result.set(variantId, {
      // PerModelStats base fields
      model,
      provider,
      variantId,
      tasksPassed: tasksPassedAny,
      tasksFailed,
      avgScore: totalResults > 0
        ? totalScore / (totalTasks * runCount || 1)
        : 0,
      tokens: totalTokens,
      cost: totalCost,
      avgAttempts: 0,
      passedOnAttempt1,
      passedOnAttempt2,
      passedByAttempt: passedByAttemptAgg,
      compileFailures,
      testFailures,
      malformedResponses,
      variantConfig,
      // MultiRun extension fields
      runCount,
      passAtK,
      consistency,
      perTaskRuns,
    });
  }

  return result;
}
