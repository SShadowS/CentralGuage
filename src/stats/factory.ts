/**
 * Factory for creating storage instances
 */

import type { StatsStorage, StorageConfig } from "./interfaces.ts";
import { DEFAULT_STORAGE_CONFIG } from "./interfaces.ts";
import { SqliteStorage } from "./sqlite-storage.ts";

/**
 * In-memory storage for testing
 */
export class InMemoryStorage implements StatsStorage {
  private runs = new Map<
    string,
    import("./types.ts").RunRecord
  >();
  private results: Array<
    { runId: string } & import("./types.ts").ResultRecord
  > = [];
  private _isOpen = false;

  async open(): Promise<void> {
    this._isOpen = true;
    await Promise.resolve();
  }

  async close(): Promise<void> {
    this._isOpen = false;
    await Promise.resolve();
  }

  isOpen(): boolean {
    return this._isOpen;
  }

  async persistRun(run: import("./types.ts").RunRecord): Promise<void> {
    if (this.runs.has(run.runId)) {
      throw new Error(`Run ${run.runId} already exists`);
    }
    this.runs.set(run.runId, run);
    await Promise.resolve();
  }

  async getRun(
    runId: string,
  ): Promise<import("./types.ts").RunRecord | null> {
    return this.runs.get(runId) ?? null;
  }

  async listRuns(
    options: import("./types.ts").ListRunsOptions = {},
  ): Promise<import("./types.ts").RunRecord[]> {
    let runs = Array.from(this.runs.values());

    if (options.configHash) {
      runs = runs.filter((r) => r.configHash === options.configHash);
    }
    if (options.taskSetHash) {
      runs = runs.filter((r) => r.taskSetHash === options.taskSetHash);
    }
    if (options.since) {
      runs = runs.filter((r) => r.executedAt >= options.since!);
    }
    if (options.until) {
      runs = runs.filter((r) => r.executedAt <= options.until!);
    }

    runs.sort((a, b) => b.executedAt.getTime() - a.executedAt.getTime());

    if (options.offset) {
      runs = runs.slice(options.offset);
    }
    if (options.limit) {
      runs = runs.slice(0, options.limit);
    }

    return runs;
  }

  async hasRun(runId: string): Promise<boolean> {
    return this.runs.has(runId);
  }

  async deleteRun(runId: string): Promise<boolean> {
    const existed = this.runs.has(runId);
    this.runs.delete(runId);
    this.results = this.results.filter((r) => r.runId !== runId);
    return existed;
  }

  async persistResults(
    runId: string,
    results: import("./types.ts").ResultRecord[],
  ): Promise<void> {
    for (const r of results) {
      this.results.push({ runId, ...r });
    }
    await Promise.resolve();
  }

  async getResults(
    options: import("./types.ts").GetResultsOptions,
  ): Promise<import("./types.ts").ResultRecord[]> {
    let results = [...this.results];

    if (options.runId) {
      results = results.filter((r) => r.runId === options.runId);
    }
    if (options.taskId) {
      results = results.filter((r) => r.taskId === options.taskId);
    }
    if (options.variantId) {
      results = results.filter((r) => r.variantId === options.variantId);
    }
    if (options.provider) {
      results = results.filter((r) => r.provider === options.provider);
    }
    if (options.success !== undefined) {
      results = results.filter((r) => r.success === options.success);
    }

    if (options.offset) {
      results = results.slice(options.offset);
    }
    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  async getVariantIds(): Promise<string[]> {
    const ids = new Set(this.results.map((r) => r.variantId));
    return Array.from(ids).sort();
  }

  async getTaskIds(): Promise<string[]> {
    const ids = new Set(this.results.map((r) => r.taskId));
    return Array.from(ids).sort();
  }

  async getModelTrend(
    variantId: string,
    options: import("./types.ts").TrendOptions = {},
  ): Promise<import("./types.ts").TrendPoint[]> {
    const runResults = new Map<
      string,
      { passed: number; total: number; scoreSum: number; cost: number }
    >();

    for (const r of this.results) {
      if (r.variantId !== variantId) continue;
      if (options.taskId && r.taskId !== options.taskId) continue;

      const run = this.runs.get(r.runId);
      if (!run) continue;
      if (options.since && run.executedAt < options.since) continue;

      const agg = runResults.get(r.runId) ?? {
        passed: 0,
        total: 0,
        scoreSum: 0,
        cost: 0,
      };
      agg.total++;
      if (r.success) agg.passed++;
      agg.scoreSum += r.finalScore;
      agg.cost += r.totalCost;
      runResults.set(r.runId, agg);
    }

    const points: import("./types.ts").TrendPoint[] = [];
    for (const [runId, agg] of runResults) {
      const run = this.runs.get(runId)!;
      points.push({
        runId,
        executedAt: run.executedAt,
        passed: agg.passed,
        total: agg.total,
        avgScore: agg.scoreSum / agg.total,
        cost: agg.cost,
      });
    }

    points.sort((a, b) => b.executedAt.getTime() - a.executedAt.getTime());

    if (options.limit) {
      return points.slice(0, options.limit);
    }
    return points;
  }

  async compareModels(
    variant1: string,
    variant2: string,
  ): Promise<import("./types.ts").ModelComparison> {
    const latestByTask = new Map<
      string,
      Map<string, import("./types.ts").ResultRecord>
    >();

    for (const r of this.results) {
      if (r.variantId !== variant1 && r.variantId !== variant2) continue;

      const taskMap = latestByTask.get(r.taskId) ??
        new Map<string, import("./types.ts").ResultRecord>();
      taskMap.set(r.variantId, r);
      latestByTask.set(r.taskId, taskMap);
    }

    let v1Wins = 0,
      v2Wins = 0,
      ties = 0;
    let v1Total = 0,
      v2Total = 0,
      v1Cost = 0,
      v2Cost = 0;
    const perTask: import("./types.ts").TaskComparisonDetail[] = [];

    for (const [taskId, taskMap] of latestByTask) {
      const r1 = taskMap.get(variant1);
      const r2 = taskMap.get(variant2);
      if (!r1 || !r2) continue;

      v1Total += r1.finalScore;
      v2Total += r2.finalScore;
      v1Cost += r1.totalCost;
      v2Cost += r2.totalCost;

      let winner: "variant1" | "variant2" | "tie";
      if (r1.finalScore > r2.finalScore) {
        winner = "variant1";
        v1Wins++;
      } else if (r2.finalScore > r1.finalScore) {
        winner = "variant2";
        v2Wins++;
      } else {
        winner = "tie";
        ties++;
      }

      perTask.push({
        taskId,
        variant1Score: r1.finalScore,
        variant2Score: r2.finalScore,
        winner,
      });
    }

    const count = perTask.length || 1;
    return {
      variant1,
      variant2,
      variant1Wins: v1Wins,
      variant2Wins: v2Wins,
      ties,
      variant1AvgScore: v1Total / count,
      variant2AvgScore: v2Total / count,
      variant1Cost: v1Cost,
      variant2Cost: v2Cost,
      perTask,
    };
  }

  async detectRegressions(
    _options: import("./types.ts").RegressionOptions,
  ): Promise<import("./types.ts").Regression[]> {
    // Simplified implementation - full logic in SQLite version
    return [];
  }

  async getCostBreakdown(
    options: import("./types.ts").CostOptions,
  ): Promise<import("./types.ts").CostBreakdown[]> {
    const groups = new Map<
      string,
      { cost: number; tokens: number; count: number; success: number }
    >();

    for (const r of this.results) {
      if (options.variantId && r.variantId !== options.variantId) continue;

      const run = this.runs.get(r.runId);
      if (options.since && run && run.executedAt < options.since) continue;

      let key: string;
      switch (options.groupBy) {
        case "model":
          key = r.variantId;
          break;
        case "task":
          key = r.taskId;
          break;
        case "day":
          key = run?.executedAt.toISOString().slice(0, 10) ?? "unknown";
          break;
        case "week":
          key = run
            ? `${run.executedAt.getFullYear()}-W${
              Math.ceil(
                (run.executedAt.getTime() -
                  new Date(run.executedAt.getFullYear(), 0, 1).getTime()) /
                  604800000,
              )
            }`
            : "unknown";
          break;
      }

      const agg = groups.get(key) ??
        { cost: 0, tokens: 0, count: 0, success: 0 };
      agg.cost += r.totalCost;
      agg.tokens += r.totalTokens;
      agg.count++;
      if (r.success) agg.success++;
      groups.set(key, agg);
    }

    return Array.from(groups.entries())
      .map(([key, agg]) => ({
        groupKey: key,
        totalCost: agg.cost,
        totalTokens: agg.tokens,
        executionCount: agg.count,
        avgCostPerExecution: agg.cost / agg.count,
        costPerSuccess: agg.success > 0 ? agg.cost / agg.success : null,
      }))
      .sort((a, b) => b.totalCost - a.totalCost);
  }

  /** Clear all data (for testing) */
  clear(): void {
    this.runs.clear();
    this.results = [];
  }
}

/**
 * Create a storage instance based on configuration
 *
 * @param config Storage configuration (defaults to SQLite)
 * @returns Storage instance (not yet opened)
 */
export function createStorage(
  config: StorageConfig = DEFAULT_STORAGE_CONFIG,
): StatsStorage {
  switch (config.type) {
    case "sqlite":
      return new SqliteStorage(
        config.sqlitePath ?? DEFAULT_STORAGE_CONFIG.sqlitePath!,
      );

    case "memory":
      return new InMemoryStorage();

    case "postgres":
      throw new Error("PostgreSQL storage not yet implemented");

    default:
      throw new Error(
        `Unknown storage type: ${(config as StorageConfig).type}`,
      );
  }
}

/**
 * Create and open a storage instance
 *
 * @param config Storage configuration
 * @returns Opened storage instance
 */
export async function openStorage(
  config: StorageConfig = DEFAULT_STORAGE_CONFIG,
): Promise<StatsStorage> {
  const storage = createStorage(config);
  await storage.open();
  return storage;
}
