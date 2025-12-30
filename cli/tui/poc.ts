/**
 * Proof of concept for TUI log display - simulating benchmark flow
 * Run with: deno run --allow-all cli/tui/poc.ts
 */

import { Signal, Tui } from "tui";
import { Box, Label, Text } from "tui/components";
import { crayon } from "crayon";

const { columns, rows } = Deno.consoleSize();
const statusBarHeight = 1;
const logAreaHeight = rows - statusBarHeight;

// Create TUI
const tui = new Tui({
  style: crayon.bgBlack,
  refreshRate: 1000 / 15,
});

// Signals for reactive updates
const logSignal = new Signal("");
const statusSignal = new Signal("0% (0/5) | 0s | LLM: 0 | Q: 0");

// Log area using Label
new Label({
  parent: tui,
  text: logSignal,
  rectangle: {
    column: 0,
    row: 0,
    width: columns,
    height: logAreaHeight,
  },
  theme: {
    base: crayon.white.bgBlack,
  },
  align: {
    horizontal: "left",
    vertical: "top", // Changed to top to see initial lines
  },
  zIndex: 0,
  overwriteRectangle: true,
});

// Status bar background
new Box({
  parent: tui,
  rectangle: {
    column: 0,
    row: logAreaHeight,
    width: columns,
    height: statusBarHeight,
  },
  theme: {
    base: crayon.bgBlue,
  },
  zIndex: 1,
});

// Status text
new Text({
  parent: tui,
  text: statusSignal,
  rectangle: {
    column: 1,
    row: logAreaHeight,
    width: columns - 2,
  },
  theme: {
    base: crayon.white.bgBlue,
  },
  zIndex: 2,
});

// Start TUI
tui.run();

// Log lines array
const lines: string[] = [];

function addLine(line: string) {
  lines.push(line);
  if (lines.length > 100) lines.shift();
  logSignal.value = lines.join("\n");
}

function updateStatus(completed: number, total: number, elapsed: number) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  statusSignal.value = `${pct}% (${completed}/${total}) | ${elapsed}s | LLM: 1 | Q: 0`;
}

// Simulate async benchmark flow (like the real agent benchmark)
async function simulateBenchmark() {
  const totalTasks = 5;
  const startTime = Date.now();

  // Initial lines (like in runAgentBenchmark)
  addLine("[CentralGauge] Agent Benchmark Mode");
  addLine("Agents: default");
  addLine("Tasks: 5 task(s)");
  addLine("Container: Cronus27");
  addLine("");

  updateStatus(0, totalTasks, 0);

  for (let i = 1; i <= totalTasks; i++) {
    addLine(`[Task] CG-AL-E00${i}: Running with 1 agent(s)`);
    addLine(`[default] Starting...`);

    // Simulate async work (like await executor.execute())
    await new Promise((resolve) => setTimeout(resolve, 1000));

    addLine(`[default] pass (tests: 3/3), turns: 5, cost: $0.0100`);
    addLine("");

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    updateStatus(i, totalTasks, elapsed);
  }

  addLine("Benchmark complete!");

  // Wait then exit
  await new Promise((resolve) => setTimeout(resolve, 2000));
  tui.destroy();
  console.log("\nPoC complete!");
  Deno.exit(0);
}

// Handle Ctrl+C
Deno.addSignalListener("SIGINT", () => {
  tui.destroy();
  console.log("\nExited.");
  Deno.exit(0);
});

// Run the simulation
simulateBenchmark();
