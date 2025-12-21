/**
 * Storage interface for benchmark stats persistence
 *
 * This interface allows swapping storage backends:
 * - SqliteStorage: Local file-based storage (default)
 * - PostgresStorage: Team sharing (future)
 * - InMemoryStorage: Unit tests
 */

import type {
  CostBreakdown,
  CostOptions,
  GetResultsOptions,
  ImportResult,
  ListRunsOptions,
  ModelComparison,
  Regression,
  RegressionOptions,
  ResultRecord,
  RunRecord,
  TaskSetSummary,
  TrendOptions,
  TrendPoint,
  VariantRunGroup,
} from "./types.ts";

/**
 * Storage interface for benchmark statistics
 *
 * All implementations must be async-safe and handle concurrent access.
 */
export interface StatsStorage {
  // ============ Lifecycle ============

  /**
   * Open connection to storage backend
   * Creates tables/schema if they don't exist
   */
  open(): Promise<void>;

  /**
   * Close connection and release resources
   */
  close(): Promise<void>;

  /**
   * Check if storage is currently open
   */
  isOpen(): boolean;

  // ============ Runs ============

  /**
   * Persist a new benchmark run
   * @param run The run record to persist
   * @throws If run with same runId already exists
   */
  persistRun(run: RunRecord): Promise<void>;

  /**
   * Get a run by ID
   * @param runId The run identifier
   * @returns The run record or null if not found
   */
  getRun(runId: string): Promise<RunRecord | null>;

  /**
   * List runs with optional filtering
   * @param options Filter and pagination options
   * @returns Array of matching runs
   */
  listRuns(options?: ListRunsOptions): Promise<RunRecord[]>;

  /**
   * Check if a run exists
   * @param runId The run identifier
   */
  hasRun(runId: string): Promise<boolean>;

  /**
   * Delete a run and all associated data
   * @param runId The run identifier
   * @returns true if deleted, false if not found
   */
  deleteRun(runId: string): Promise<boolean>;

  // ============ Results ============

  /**
   * Persist results for a run
   * @param runId The run these results belong to
   * @param results The result records to persist
   */
  persistResults(runId: string, results: ResultRecord[]): Promise<void>;

  /**
   * Get results with filtering
   * @param options Filter and pagination options
   * @returns Array of matching results
   */
  getResults(options: GetResultsOptions): Promise<ResultRecord[]>;

  /**
   * Get distinct variant IDs in the database
   */
  getVariantIds(): Promise<string[]>;

  /**
   * Get distinct task IDs in the database
   */
  getTaskIds(): Promise<string[]>;

  // ============ Analytics Queries ============

  /**
   * Get model performance trend over time
   * @param variantId The model variant to track
   * @param options Filter options
   * @returns Trend points ordered by date
   */
  getModelTrend(
    variantId: string,
    options?: TrendOptions,
  ): Promise<TrendPoint[]>;

  /**
   * Compare two models head-to-head
   * @param variant1 First model variant
   * @param variant2 Second model variant
   * @returns Comparison results
   */
  compareModels(variant1: string, variant2: string): Promise<ModelComparison>;

  /**
   * Detect performance regressions
   * @param options Regression detection parameters
   * @returns Array of detected regressions
   */
  detectRegressions(options: RegressionOptions): Promise<Regression[]>;

  /**
   * Get cost breakdown
   * @param options Grouping and filter options
   * @returns Cost breakdown entries
   */
  getCostBreakdown(options: CostOptions): Promise<CostBreakdown[]>;

  // ============ Task Set Queries ============

  /**
   * Get summaries of all distinct task set hashes
   * @returns Array of task set summaries ordered by last run date
   */
  getTaskSetSummaries(): Promise<TaskSetSummary[]>;

  /**
   * Get runs grouped by variant for a specific task set
   * @param taskSetHash The task set hash to filter by
   * @returns Array of variant run groups ordered by variant ID
   */
  getRunsByVariantForTaskSet(taskSetHash: string): Promise<VariantRunGroup[]>;
}

/**
 * Interface for importing JSON result files
 */
export interface StatsImporter {
  /**
   * Import a single JSON result file
   * @param filePath Path to the JSON file
   * @param storage Storage to import into
   * @returns true if imported, false if skipped
   */
  importFile(filePath: string, storage: StatsStorage): Promise<boolean>;

  /**
   * Import all JSON files from a directory
   * @param dirPath Path to the directory
   * @param storage Storage to import into
   * @returns Import statistics
   */
  importDirectory(
    dirPath: string,
    storage: StatsStorage,
  ): Promise<ImportResult>;
}

/**
 * Configuration for storage backends
 */
export interface StorageConfig {
  /** Storage backend type */
  type: "sqlite" | "postgres" | "memory";

  /** Path to SQLite database file (for sqlite type) */
  sqlitePath?: string;

  /** PostgreSQL connection string (for postgres type) */
  postgresUrl?: string;
}

/**
 * Default storage configuration
 */
export const DEFAULT_STORAGE_CONFIG: StorageConfig = {
  type: "sqlite",
  sqlitePath: "results/centralgauge.db",
};
