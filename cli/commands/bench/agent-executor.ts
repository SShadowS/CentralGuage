/**
 * Agent benchmark executor
 * @module cli/commands/bench/agent-executor
 */

import { expandGlob } from "@std/fs";
import * as colors from "@std/fmt/colors";
import { join } from "@std/path";
import { EnvLoader } from "../../../src/utils/env-loader.ts";
import { SplashScreen } from "../../../src/utils/splash-screen.ts";
import { loadTaskManifest } from "../../../src/tasks/loader.ts";
import { AgentRegistry } from "../../../src/agents/registry.ts";
import { AgentTaskExecutor } from "../../../src/agents/executor.ts";
import type { AgentExecutionResult } from "../../../src/agents/types.ts";
import { formatFailureReason } from "../../../src/agents/failure-parser.ts";
import { formatDurationMs, log } from "../../helpers/mod.ts";
import { BenchTui } from "../../tui/bench-tui.ts";
import type { AgentBenchmarkOptions } from "./types.ts";
import { sendBenchmarkNotificationIfConfigured } from "../../../src/notifications/mod.ts";

/**
 * Run benchmark using agent configurations
 */
export async function executeAgentBenchmark(
  options: AgentBenchmarkOptions,
  quiet = false,
): Promise<void> {
  if (!quiet) {
    await EnvLoader.loadEnvironment();
    await SplashScreen.display({
      showEnvironment: true,
      showConfiguration: true,
      showProviders: false,
      compact: false,
    });
  }

  log.summary("Starting CentralGauge benchmark (agent mode)...");
  log.info(`Agents: ${options.agents.join(", ")}`);
  log.info(`Tasks: ${options.tasks.join(", ")}`);
  log.info(`Container: ${options.containerName}`);
  log.info(`Output: ${options.outputDir}`);
  if (options.sandbox) {
    log.info("Sandbox: enabled (isolated Windows containers)");
  }

  // Load agent configurations
  await AgentRegistry.load("agents");

  // Validate all agents exist
  const agentConfigs = [];
  for (const agentId of options.agents) {
    const config = AgentRegistry.get(agentId);
    if (!config) {
      log.fail(`Agent not found: ${agentId}`);
      log.info(`Available agents: ${AgentRegistry.list().join(", ")}`);
      return;
    }
    agentConfigs.push(config);
  }

  log.task(`Loaded ${agentConfigs.length} agent(s)`);

  // Load task manifests
  const taskManifests = [];
  for (const taskPattern of options.tasks) {
    for await (const entry of expandGlob(taskPattern)) {
      if (entry.isFile && entry.name.endsWith(".yml")) {
        log.task(`Loading: ${entry.path}`);
        const manifest = await loadTaskManifest(entry.path);
        taskManifests.push(manifest);
      }
    }
  }

  if (taskManifests.length === 0) {
    log.fail(
      `No task manifests found matching patterns: ${options.tasks.join(", ")}`,
    );
    return;
  }

  log.task(`Loaded ${taskManifests.length} task(s)`);

  // Create output directory
  await Deno.mkdir(options.outputDir, { recursive: true });

  const startTime = Date.now();
  const totalTasks = taskManifests.length * agentConfigs.length;
  let completedTasks = 0;

  // Initialize TUI if enabled and supported
  const tuiSetup = options.tui
    ? BenchTui.setup({
      totalTasks,
      startTime: new Date(startTime),
      headerLine: "[CentralGauge] Agent Benchmark Mode",
      statusLines: [
        `Agents: ${options.agents.join(", ")}`,
        `Tasks: ${taskManifests.length} task(s)`,
        `Container: ${options.containerName}`,
      ],
    })
    : null;

  if (options.tui && !tuiSetup) {
    log.warn("TUI mode requires a terminal. Falling back to console output.");
  }

  // Helper to output either to TUI or console
  const output = (line: string) => {
    if (tuiSetup) {
      tuiSetup.tui.addLine(line);
    } else {
      console.log(line);
    }
  };

  // Execute each agent on each task
  const executor = new AgentTaskExecutor();
  const allResults: Array<{
    agentId: string;
    taskId: string;
    result: AgentExecutionResult;
  }> = [];

  // Track agent stats for TUI
  const agentPassRates = new Map<string, { total: number; passed: number }>();

  try {
    for (const task of taskManifests) {
      output(`[Task] ${task.id}: Running with ${agentConfigs.length} agent(s)`);

      for (const agentConfig of agentConfigs) {
        // Create a unique workspace for this agent+task (outside results/ to avoid polluting reports)
        const projectDir = join(
          Deno.cwd(),
          "workspaces",
          `${agentConfig.id}_${task.id}_${Date.now()}`,
        );

        output(`[${agentConfig.id}] Starting...`);

        try {
          const result = await executor.execute(agentConfig, task, {
            projectDir,
            containerName: options.containerName,
            containerProvider: "bccontainer",
            debug: options.debug ?? false,
            sandbox: options.sandbox ?? false,
          });

          allResults.push({
            agentId: agentConfig.id,
            taskId: task.id,
            result,
          });

          const status = result.success ? "pass" : "fail";
          const testResult = result.testResult;
          const testInfo = testResult
            ? ` (tests: ${testResult.passedTests}/${testResult.totalTests})`
            : "";

          output(
            `[${agentConfig.id}] ${status}${testInfo}, turns: ${result.metrics.turns}, cost: $${
              result.metrics.estimatedCost.toFixed(4)
            }`,
          );

          // Show failure details when verbose is enabled
          if (!result.success && result.failureDetails && options.verbose) {
            output(formatFailureReason(result.failureDetails, true));
          }

          // Update TUI model stats
          if (tuiSetup) {
            tuiSetup.tui.updateModelStats(agentConfig.id, result.success);
          }

          // Track for summary
          if (!agentPassRates.has(agentConfig.id)) {
            agentPassRates.set(agentConfig.id, { total: 0, passed: 0 });
          }
          const stats = agentPassRates.get(agentConfig.id)!;
          stats.total++;
          if (result.success) stats.passed++;
        } catch (error) {
          output(
            `[FAIL] ${agentConfig.id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }

        // Update TUI progress
        completedTasks++;
        if (tuiSetup) {
          const elapsed = Date.now() - startTime;
          const avgTimePerTask = elapsed / completedTasks;
          const remaining = totalTasks - completedTasks;
          tuiSetup.tui.updateProgress({
            completedTasks,
            totalTasks,
            activeLLMCalls: remaining > 0 ? 1 : 0,
            compileQueueLength: 0,
            estimatedTimeRemaining: remaining * avgTimePerTask,
            errors: [],
            startTime: new Date(startTime),
            elapsedTime: elapsed,
          });
        }
      }
    }
  } finally {
    // Destroy TUI before printing summary
    if (tuiSetup) {
      tuiSetup.restore();
      tuiSetup.tui.destroy();
    }
  }

  const totalDuration = Date.now() - startTime;

  // Calculate summary statistics
  const agentStats = new Map<
    string,
    {
      passed: number;
      failed: number;
      totalCost: number;
      totalTurns: number;
      totalTokens: number;
    }
  >();

  for (const { agentId, result } of allResults) {
    if (!agentStats.has(agentId)) {
      agentStats.set(agentId, {
        passed: 0,
        failed: 0,
        totalCost: 0,
        totalTurns: 0,
        totalTokens: 0,
      });
    }
    const stats = agentStats.get(agentId)!;
    if (result.success) {
      stats.passed++;
    } else {
      stats.failed++;
    }
    stats.totalCost += result.metrics.estimatedCost;
    stats.totalTurns += result.metrics.turns;
    stats.totalTokens += result.metrics.totalTokens;
  }

  // Print summary
  console.log("");
  console.log(colors.bold("=".repeat(60)));
  console.log(colors.bold("AGENT BENCHMARK RESULTS"));
  console.log("=".repeat(60));

  console.log("\n" + colors.bold("Summary:"));
  console.log("-".repeat(60));
  console.log(
    `${"Agent".padEnd(20)} | ${"Pass".padEnd(6)} | ${"Fail".padEnd(6)} | ${
      "Cost".padEnd(10)
    } | Turns`,
  );
  console.log("-".repeat(60));

  for (const [agentId, stats] of agentStats) {
    const passColor = stats.passed > stats.failed ? colors.green : colors.red;

    console.log(
      `${agentId.padEnd(20)} | ${passColor(String(stats.passed).padEnd(6))} | ${
        String(stats.failed).padEnd(6)
      } | $${stats.totalCost.toFixed(4).padEnd(9)} | ${stats.totalTurns}`,
    );
  }
  console.log("-".repeat(60));

  // Comparison
  if (agentStats.size === 2) {
    const entries = Array.from(agentStats.entries());
    const [aId, aStats] = entries[0]!;
    const [bId, bStats] = entries[1]!;

    const aPassRate = aStats.passed / (aStats.passed + aStats.failed) || 0;
    const bPassRate = bStats.passed / (bStats.passed + bStats.failed) || 0;

    console.log("\n" + colors.bold("Comparison:"));

    if (aPassRate > bPassRate) {
      console.log(
        `  Winner: ${colors.green(aId)} (${(aPassRate * 100).toFixed(0)}% vs ${
          (bPassRate * 100).toFixed(0)
        }%)`,
      );
    } else if (bPassRate > aPassRate) {
      console.log(
        `  Winner: ${colors.green(bId)} (${(bPassRate * 100).toFixed(0)}% vs ${
          (aPassRate * 100).toFixed(0)
        }%)`,
      );
    } else {
      console.log(
        `  Result: ${colors.yellow("TIE")} (${(aPassRate * 100).toFixed(0)}%)`,
      );
    }

    const costDiff = bStats.totalCost - aStats.totalCost;
    console.log(
      `  Cost difference: ${costDiff >= 0 ? "+" : ""}$${
        costDiff.toFixed(4)
      } (${bId} vs ${aId})`,
    );
  }

  console.log(`\n  Total duration: ${formatDurationMs(totalDuration)}`);
  console.log(`  Results: ${allResults.length}`);

  // Save results
  const timestamp = Date.now();
  const resultsFile = `${options.outputDir}/agent-benchmark-${timestamp}.json`;
  await Deno.writeTextFile(
    resultsFile,
    JSON.stringify(
      {
        agents: options.agents,
        tasks: options.tasks,
        results: allResults,
        stats: Object.fromEntries(agentStats),
        duration: totalDuration,
        timestamp: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(`  Saved: ${colors.gray(resultsFile)}`);

  // Send notification if configured (auto-notify when token present)
  if (!options.noNotify) {
    // Calculate overall pass rate
    let totalPassed = 0;
    let totalFailed = 0;
    for (const stats of agentStats.values()) {
      totalPassed += stats.passed;
      totalFailed += stats.failed;
    }
    const passRate = totalPassed / (totalPassed + totalFailed) || 0;

    // Calculate total cost
    let totalCost = 0;
    for (const stats of agentStats.values()) {
      totalCost += stats.totalCost;
    }

    await sendBenchmarkNotificationIfConfigured({
      mode: "agent",
      passRate,
      totalTasks: taskManifests.length,
      duration: totalDuration,
      totalCost,
      agents: options.agents,
    });
  }
}
