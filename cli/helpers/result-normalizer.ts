/**
 * Result normalization utilities for combining LLM and Agent benchmark results
 * @module cli/helpers/result-normalizer
 */

import type { BenchmarkResult } from "../types/cli-types.ts";

/**
 * Agent result entry from agent-benchmark-*.json files
 */
export interface AgentResultEntry {
  agentId: string;
  taskId: string;
  result: {
    success: boolean;
    duration: number;
    metrics: {
      totalTokens: number;
      estimatedCost: number;
      turns: number;
    };
  };
}

/**
 * Normalize agent result to BenchmarkResult format
 * This allows agent results to be displayed alongside LLM results in reports.
 */
export function normalizeAgentResult(entry: AgentResultEntry): BenchmarkResult {
  return {
    taskId: entry.taskId,
    success: entry.result.success,
    finalScore: entry.result.success ? 100 : 0,
    totalDuration: entry.result.duration,
    totalTokensUsed: entry.result.metrics.totalTokens,
    totalCost: entry.result.metrics.estimatedCost,
    attempts: [{ success: entry.result.success }], // Agents don't have 2-attempt model
    context: {
      variantId: `agent:${entry.agentId}`,
      llmModel: entry.agentId,
      llmProvider: "agent",
    },
  };
}

/**
 * Check if a filename indicates an agent benchmark result file
 */
export function isAgentResultFile(fileName: string): boolean {
  return fileName.startsWith("agent-benchmark") && fileName.endsWith(".json");
}

/**
 * Check if a filename indicates an LLM benchmark result file
 */
export function isLLMResultFile(fileName: string): boolean {
  return (
    fileName.endsWith(".json") &&
    !fileName.startsWith("agent-benchmark") &&
    !fileName.startsWith("summary")
  );
}
