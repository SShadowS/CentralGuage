/**
 * Type definitions for the stats persistence system
 */

import type { VariantConfig } from "../llm/variant-types.ts";

/**
 * Represents a single benchmark run
 */
export interface RunRecord {
  /** Unique run identifier (typically timestamp) */
  runId: string;
  /** When the benchmark was executed */
  executedAt: Date;
  /** SHA256 hash of full config (tasks + models + execution params) */
  configHash: string;
  /** SHA256 hash of task set only (for grouping comparable runs) */
  taskSetHash: string;
  /** Number of tasks in the run */
  totalTasks: number;
  /** Number of model variants tested */
  totalModels: number;
  /** Total cost in USD */
  totalCost: number;
  /** Total tokens used */
  totalTokens: number;
  /** Total duration in milliseconds */
  totalDurationMs: number;
  /** Pass rate on first attempt (0-1) */
  passRate1: number;
  /** Pass rate on second attempt (0-1) */
  passRate2: number;
  /** Overall pass rate (0-1) */
  overallPassRate: number;
  /** Average score (0-100) */
  averageScore: number;
  /** Additional metadata as JSON */
  metadata?: Record<string, unknown>;
}

/**
 * Represents a single task execution result
 */
export interface ResultRecord {
  /** Task identifier (e.g., "CG-AL-E001") */
  taskId: string;
  /** Full variant ID (e.g., "anthropic/claude-opus-4-5@thinking=50000") */
  variantId: string;
  /** Base model name */
  model: string;
  /** Provider name (anthropic, openai, etc.) */
  provider: string;
  /** Whether the task passed */
  success: boolean;
  /** Final score (0-100) */
  finalScore: number;
  /** Attempt number that passed (0 if never passed) */
  passedAttempt: number;
  /** Total tokens used */
  totalTokens: number;
  /** Prompt tokens used */
  promptTokens: number;
  /** Completion tokens used */
  completionTokens: number;
  /** Total cost in USD */
  totalCost: number;
  /** Total duration in milliseconds */
  totalDurationMs: number;
  /** Variant configuration */
  variantConfig?: VariantConfig | undefined;
  /** Full result as JSON for detailed queries */
  resultJson?: string | undefined;
}

/**
 * Represents a per-attempt detail
 */
export interface AttemptRecord {
  /** Attempt number (1 or 2) */
  attemptNumber: number;
  /** Whether this attempt succeeded */
  success: boolean;
  /** Score for this attempt */
  score: number;
  /** Tokens used */
  tokensUsed: number;
  /** Cost for this attempt */
  cost: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Whether compilation succeeded */
  compileSuccess: boolean | null;
  /** Whether tests passed */
  testSuccess: boolean | null;
  /** Failure reasons */
  failureReasons?: string[];
}

/**
 * Point on a model performance trend line
 */
export interface TrendPoint {
  /** Run identifier */
  runId: string;
  /** When the run was executed */
  executedAt: Date;
  /** Number of tasks passed */
  passed: number;
  /** Total number of tasks */
  total: number;
  /** Average score */
  avgScore: number;
  /** Total cost */
  cost: number;
}

/**
 * Detected regression for a task/model combination
 */
export interface Regression {
  /** Task that regressed */
  taskId: string;
  /** Model variant that regressed */
  variantId: string;
  /** Baseline average score */
  baselineScore: number;
  /** Current average score */
  currentScore: number;
  /** Percentage change (negative = regression) */
  changePct: number;
}

/**
 * Model comparison result
 */
export interface ModelComparison {
  /** First model variant */
  variant1: string;
  /** Second model variant */
  variant2: string;
  /** Tasks where variant1 won */
  variant1Wins: number;
  /** Tasks where variant2 won */
  variant2Wins: number;
  /** Tasks where they tied */
  ties: number;
  /** Average score for variant1 */
  variant1AvgScore: number;
  /** Average score for variant2 */
  variant2AvgScore: number;
  /** Total cost for variant1 */
  variant1Cost: number;
  /** Total cost for variant2 */
  variant2Cost: number;
  /** Per-task comparison details */
  perTask: TaskComparisonDetail[];
}

/**
 * Per-task detail in model comparison
 */
export interface TaskComparisonDetail {
  taskId: string;
  variant1Score: number;
  variant2Score: number;
  winner: "variant1" | "variant2" | "tie";
}

/**
 * Cost breakdown entry
 */
export interface CostBreakdown {
  /** Grouping key (model, task, day, etc.) */
  groupKey: string;
  /** Total cost */
  totalCost: number;
  /** Total tokens */
  totalTokens: number;
  /** Number of executions */
  executionCount: number;
  /** Average cost per execution */
  avgCostPerExecution: number;
  /** Cost per successful execution */
  costPerSuccess: number | null;
}

/**
 * Options for listing runs
 */
export interface ListRunsOptions {
  /** Maximum number of runs to return */
  limit?: number;
  /** Number of runs to skip */
  offset?: number;
  /** Filter by config hash */
  configHash?: string;
  /** Filter by task set hash */
  taskSetHash?: string;
  /** Filter runs after this date */
  since?: Date;
  /** Filter runs before this date */
  until?: Date;
}

/**
 * Options for getting results
 */
export interface GetResultsOptions {
  /** Filter by run ID */
  runId?: string;
  /** Filter by task ID */
  taskId?: string;
  /** Filter by variant ID */
  variantId?: string;
  /** Filter by provider */
  provider?: string;
  /** Filter by success/failure */
  success?: boolean;
  /** Maximum number of results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Options for trend queries
 */
export interface TrendOptions {
  /** Filter by task ID */
  taskId?: string | undefined;
  /** Filter runs after this date */
  since?: Date | undefined;
  /** Maximum number of points */
  limit?: number | undefined;
}

/**
 * Options for regression detection
 */
export interface RegressionOptions {
  /** Score change threshold (e.g., 0.05 for 5%) */
  threshold: number;
  /** Number of recent runs for "current" average */
  recentWindow?: number | undefined;
  /** Number of runs for "baseline" average */
  baselineWindow?: number | undefined;
  /** Filter by specific variant */
  variantId?: string | undefined;
}

/**
 * Options for cost breakdown
 */
export interface CostOptions {
  /** Filter runs after this date */
  since?: Date | undefined;
  /** Group by: model, task, day, week */
  groupBy: "model" | "task" | "day" | "week";
  /** Filter by variant ID */
  variantId?: string | undefined;
}

/**
 * Input for config hash generation
 */
export interface ConfigHashInput {
  /** Task manifests with their content hashes */
  taskManifests: Array<{
    id: string;
    contentHash: string;
  }>;
  /** Model variants with their configs */
  variants: Array<{
    variantId: string;
    config: VariantConfig;
  }>;
  /** Execution parameters */
  execution: {
    attemptLimit: number;
    defaultTemperature?: number;
    defaultMaxTokens?: number;
  };
}

/**
 * Result of importing JSON files
 */
export interface ImportResult {
  /** Number of runs successfully imported */
  imported: number;
  /** Number of runs skipped (already exist) */
  skipped: number;
  /** Errors encountered during import */
  errors: Array<{
    file: string;
    error: string;
  }>;
}
