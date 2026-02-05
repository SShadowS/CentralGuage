/**
 * Shared types for benchmark command modules
 * @module cli/commands/bench/types
 */

/**
 * Agent benchmark options
 */
export interface AgentBenchmarkOptions {
  agents: string[];
  tasks: string[];
  outputDir: string;
  debug?: boolean;
  stream?: boolean;
  tui?: boolean;
  containerName: string;
  /** Run agents in isolated Windows containers */
  sandbox?: boolean;
  /** Show detailed failure output */
  verbose?: boolean;
  /** Disable Pushbullet notification even if token is configured */
  noNotify?: boolean;
}

/**
 * Model pass rate tracking
 */
export interface ModelPassRateStats {
  total: number;
  attempt1: number;
  attempt2: number;
}

/**
 * Map of variant ID to pass rate stats
 */
export type ModelPassRates = Map<string, ModelPassRateStats>;

// Re-export ExtendedBenchmarkOptions for convenience
export type { ExtendedBenchmarkOptions } from "../../types/cli-types.ts";
