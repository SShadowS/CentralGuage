/**
 * Shared CLI type definitions
 * @module cli/types
 */

import type { BenchmarkOptions } from "../../types/index.ts";
import type { CLIPromptOverrides } from "../../src/prompts/mod.ts";
import type { OutputFormat } from "../../src/utils/formatters.ts";

/**
 * Extended benchmark options with parallel execution settings
 */
export interface ExtendedBenchmarkOptions extends BenchmarkOptions {
  sequential?: boolean;
  maxConcurrency?: number;
  // Prompt injection overrides
  promptOverrides?: CLIPromptOverrides;
  // Output format
  format?: OutputFormat;
  // Continuation settings
  noContinuation?: boolean;
  // Streaming mode
  stream?: boolean;
  // JSON events mode (for TUI/machine parsing)
  jsonEvents?: boolean;
}

/**
 * Report generation types
 */
export interface FileOption {
  path: string;
  name: string;
  date: Date;
  size: number;
}

export interface BenchmarkResult {
  taskId: string;
  success: boolean;
  finalScore: number;
  totalDuration: number;
  totalTokensUsed?: number;
  totalCost?: number;
  attempts: Array<{ success: boolean; tokensUsed?: number; cost?: number }>;
  /** Test counts from the final attempt (if tests ran) */
  testSummary?: {
    passedTests: number;
    totalTests: number;
  };
  context?: {
    variantId?: string;
    llmModel?: string;
    llmProvider?: string;
    temperature?: number;
    variantConfig?: PerModelStats["variantConfig"];
    manifest?: {
      description?: string;
    };
  };
}

export interface PerModelStats {
  model: string;
  provider: string;
  variantId: string;
  tasksPassed: number;
  tasksFailed: number;
  avgScore: number;
  tokens: number;
  cost: number;
  avgAttempts: number;
  passedOnAttempt1: number;
  passedOnAttempt2: number;
  compileFailures: number;
  testFailures: number;
  malformedResponses: number;
  variantConfig?: {
    thinkingBudget?: number | string;
    reasoningEffort?: string;
    maxTokens?: number;
  } | null;
}

export interface BenchmarkStats {
  overallPassRate: number;
  averageScore: number;
  totalTokens: number;
  totalCost: number;
  totalDuration: number;
  perModel: Record<string, PerModelStats>;
  perTask?: Record<string, unknown>;
}
