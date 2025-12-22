#!/usr/bin/env -S deno run --allow-read
/**
 * Compare LLM and Agent benchmark results
 *
 * Usage:
 *   deno run --allow-read cli/compare-results.ts results/llm-run/benchmark-*.json results/agent-run/agent-benchmark-*.json
 */

import { parseArgs } from "@std/cli/parse-args";
import * as colors from "@std/fmt/colors";
import { expandGlob } from "@std/fs";

interface LLMResult {
  taskId: string;
  success: boolean;
  finalScore: number;
  totalDuration: number;
  totalTokensUsed?: number;
  totalCost?: number;
  context?: {
    variantId?: string;
    llmModel?: string;
  };
}

interface AgentResult {
  taskId: string;
  agentId: string;
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

interface NormalizedResult {
  source: string; // "llm:sonnet" or "agent:config-b"
  taskId: string;
  success: boolean;
  duration: number;
  tokens: number;
  cost: number;
}

async function loadLLMResults(pattern: string): Promise<NormalizedResult[]> {
  const results: NormalizedResult[] = [];

  for await (const entry of expandGlob(pattern)) {
    if (!entry.isFile) continue;

    const content = await Deno.readTextFile(entry.path);
    const data = JSON.parse(content);

    // Handle both array format and {results: [...]} format
    const items: LLMResult[] = Array.isArray(data) ? data : data.results || [];

    for (const item of items) {
      const source = item.context?.variantId ||
        item.context?.llmModel ||
        "llm:unknown";

      results.push({
        source: source.startsWith("llm:") ? source : `llm:${source}`,
        taskId: item.taskId,
        success: item.success,
        duration: item.totalDuration,
        tokens: item.totalTokensUsed || 0,
        cost: item.totalCost || 0,
      });
    }
  }

  return results;
}

async function loadAgentResults(pattern: string): Promise<NormalizedResult[]> {
  const results: NormalizedResult[] = [];

  for await (const entry of expandGlob(pattern)) {
    if (!entry.isFile) continue;

    const content = await Deno.readTextFile(entry.path);
    const data = JSON.parse(content);

    const items: AgentResult[] = data.results || [];

    for (const item of items) {
      results.push({
        source: `agent:${item.agentId}`,
        taskId: item.taskId,
        success: item.result.success,
        duration: item.result.duration,
        tokens: item.result.metrics.totalTokens,
        cost: item.result.metrics.estimatedCost,
      });
    }
  }

  return results;
}

// =============================================================================
// Comparison Helpers
// =============================================================================

interface SourceStats {
  passed: number;
  failed: number;
  totalCost: number;
  totalTokens: number;
  totalDuration: number;
}

function calculateStats(results: NormalizedResult[]): {
  bySource: Map<string, NormalizedResult[]>;
  stats: Map<string, SourceStats>;
} {
  const bySource = new Map<string, NormalizedResult[]>();
  for (const r of results) {
    if (!bySource.has(r.source)) bySource.set(r.source, []);
    bySource.get(r.source)!.push(r);
  }

  const stats = new Map<string, SourceStats>();
  for (const [source, items] of bySource) {
    stats.set(source, {
      passed: items.filter((r) => r.success).length,
      failed: items.filter((r) => !r.success).length,
      totalCost: items.reduce((sum, r) => sum + r.cost, 0),
      totalTokens: items.reduce((sum, r) => sum + r.tokens, 0),
      totalDuration: items.reduce((sum, r) => sum + r.duration, 0),
    });
  }

  return { bySource, stats };
}

function printSummaryTable(stats: Map<string, SourceStats>): void {
  console.log("\n" + colors.bold("Summary:"));
  console.log("-".repeat(70));
  console.log(
    `${"Source".padEnd(25)} | ${"Pass".padEnd(6)} | ${"Fail".padEnd(6)} | ${
      "Rate".padEnd(6)
    } | ${"Cost".padEnd(10)} | Tokens`,
  );
  console.log("-".repeat(70));

  for (const [source, s] of stats) {
    const total = s.passed + s.failed;
    const rate = total > 0
      ? ((s.passed / total) * 100).toFixed(0) + "%"
      : "N/A";
    const rateColor = s.passed > s.failed ? colors.green : colors.red;
    const sourceColor = source.startsWith("agent:")
      ? colors.cyan
      : colors.yellow;

    console.log(
      `${sourceColor(source.padEnd(25))} | ${
        colors.green(String(s.passed).padEnd(6))
      } | ${colors.red(String(s.failed).padEnd(6))} | ${
        rateColor(rate.padEnd(6))
      } | $${
        s.totalCost.toFixed(4).padEnd(9)
      } | ${s.totalTokens.toLocaleString()}`,
    );
  }
  console.log("-".repeat(70));
}

function printPerTaskComparison(
  bySource: Map<string, NormalizedResult[]>,
  tasks: Set<string>,
  src1: string,
  src2: string,
): void {
  console.log("\n" + colors.bold("Per-Task Comparison:"));
  console.log("-".repeat(70));
  console.log(`${"Task".padEnd(25)} | ${src1.padEnd(20)} | ${src2}`);
  console.log("-".repeat(70));

  for (const taskId of tasks) {
    const r1 = bySource.get(src1)?.find((r) => r.taskId === taskId);
    const r2 = bySource.get(src2)?.find((r) => r.taskId === taskId);

    const s1 = r1
      ? (r1.success ? colors.green("pass") : colors.red("fail"))
      : colors.dim("n/a");
    const s2 = r2
      ? (r2.success ? colors.green("pass") : colors.red("fail"))
      : colors.dim("n/a");

    console.log(`${taskId.padEnd(25)} | ${s1.padEnd(29)} | ${s2}`);
  }
  console.log("-".repeat(70));
}

function printWinnerAnalysis(
  src1: string,
  src2: string,
  stats1: SourceStats,
  stats2: SourceStats,
): void {
  const rate1 = stats1.passed / (stats1.passed + stats1.failed) || 0;
  const rate2 = stats2.passed / (stats2.passed + stats2.failed) || 0;

  console.log("\n" + colors.bold("Winner:"));
  if (rate1 > rate2) {
    console.log(
      `  ${colors.green(src1)} wins (${(rate1 * 100).toFixed(0)}% vs ${
        (rate2 * 100).toFixed(0)
      }%)`,
    );
  } else if (rate2 > rate1) {
    console.log(
      `  ${colors.green(src2)} wins (${(rate2 * 100).toFixed(0)}% vs ${
        (rate1 * 100).toFixed(0)
      }%)`,
    );
  } else {
    console.log(`  ${colors.yellow("TIE")} (${(rate1 * 100).toFixed(0)}%)`);
  }

  const costDiff = stats2.totalCost - stats1.totalCost;
  console.log(
    `  Cost: ${src2} is ${costDiff >= 0 ? "+" : ""}$${
      costDiff.toFixed(4)
    } vs ${src1}`,
  );
}

// =============================================================================
// Main Comparison Function
// =============================================================================

function printComparison(results: NormalizedResult[]): void {
  const { bySource, stats } = calculateStats(results);

  // Header
  console.log(colors.bold("\n" + "=".repeat(70)));
  console.log(colors.bold("LLM vs AGENT COMPARISON"));
  console.log("=".repeat(70));

  // Summary table
  printSummaryTable(stats);

  // Per-task comparison (only for 2-source comparison)
  const sources = Array.from(bySource.keys());
  const allTasks = new Set(results.map((r) => r.taskId));

  if (sources.length === 2 && allTasks.size > 0) {
    const [src1, src2] = sources;
    printPerTaskComparison(bySource, allTasks, src1!, src2!);
    printWinnerAnalysis(src1!, src2!, stats.get(src1!)!, stats.get(src2!)!);
  }
}

async function main() {
  const args = parseArgs(Deno.args, {
    boolean: ["help"],
  });

  if (args.help || args._.length === 0) {
    console.log(`
${colors.bold("Compare LLM and Agent Benchmark Results")}

Usage:
  deno run --allow-read cli/compare-results.ts <result-files...>

Arguments:
  result-files    Glob patterns for result JSON files

Examples:
  # Compare LLM run with agent run
  deno run --allow-read cli/compare-results.ts \\
    "results/llm-run/benchmark-*.json" \\
    "results/agent-run/agent-benchmark-*.json"

  # Compare multiple runs
  deno run --allow-read cli/compare-results.ts results/**/benchmark*.json

Notes:
  - LLM results: benchmark-results-*.json
  - Agent results: agent-benchmark-*.json
  - Both formats are auto-detected
`);
    Deno.exit(0);
  }

  const allResults: NormalizedResult[] = [];

  for (const pattern of args._ as string[]) {
    // Try to detect type from filename
    if (pattern.includes("agent-benchmark")) {
      const results = await loadAgentResults(pattern);
      allResults.push(...results);
      console.log(`Loaded ${results.length} agent results from ${pattern}`);
    } else {
      const results = await loadLLMResults(pattern);
      allResults.push(...results);
      console.log(`Loaded ${results.length} LLM results from ${pattern}`);
    }
  }

  if (allResults.length === 0) {
    console.log(colors.red("No results found in specified files."));
    Deno.exit(1);
  }

  printComparison(allResults);
}

main();
