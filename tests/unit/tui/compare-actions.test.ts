/**
 * Tests for compare-actions pure functions
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  formatComparisonLines,
  formatModelName,
} from "../../../cli/services/compare-actions.ts";
import type { ModelComparison } from "../../../src/stats/types.ts";

// ============================================================================
// formatModelName tests
// ============================================================================

Deno.test("formatModelName - returns full name when under max length", () => {
  const result = formatModelName("short-model", 25);
  assertEquals(result, "short-model");
});

Deno.test("formatModelName - returns full name when exactly max length", () => {
  const name = "a".repeat(25);
  const result = formatModelName(name, 25);
  assertEquals(result, name);
});

Deno.test("formatModelName - truncates long names with ellipsis", () => {
  const longName = "anthropic/claude-sonnet-4-5-20250929";
  const result = formatModelName(longName, 25);
  assertEquals(result.length, 25);
  assertEquals(result.endsWith("..."), true);
});

Deno.test("formatModelName - uses default max length of 25", () => {
  const longName = "a".repeat(30);
  const result = formatModelName(longName);
  assertEquals(result.length, 25);
});

Deno.test("formatModelName - preserves start of long names", () => {
  const name = "anthropic/claude-sonnet-4-5-20250929";
  const result = formatModelName(name, 20);
  assertEquals(result.startsWith("anthropic/claude-"), true);
});

Deno.test("formatModelName - handles empty string", () => {
  const result = formatModelName("", 25);
  assertEquals(result, "");
});

Deno.test("formatModelName - handles very short max length", () => {
  const result = formatModelName("test-model", 5);
  assertEquals(result.length, 5);
  assertEquals(result, "te...");
});

// ============================================================================
// formatComparisonLines tests
// ============================================================================

Deno.test("formatComparisonLines - formats basic comparison", () => {
  const comparison: ModelComparison = {
    variant1: "model-a",
    variant2: "model-b",
    variant1Wins: 5,
    variant2Wins: 3,
    ties: 2,
    variant1AvgScore: 85.5,
    variant2AvgScore: 72.3,
    variant1Cost: 0.0125,
    variant2Cost: 0.0089,
    perTask: [],
  };

  const lines = formatComparisonLines(comparison);

  // Check header
  assertStringIncludes(lines[0]!, "model-a");
  assertStringIncludes(lines[0]!, "vs");
  assertStringIncludes(lines[0]!, "model-b");

  // Find and check wins line
  const winsLine = lines.find((l) => l.includes("Wins:"));
  assertEquals(winsLine !== undefined, true);
  assertStringIncludes(winsLine!, "5 - 3");
  assertStringIncludes(winsLine!, "2 ties");

  // Find and check avg score line
  const scoreLine = lines.find((l) => l.includes("Avg Score:"));
  assertEquals(scoreLine !== undefined, true);
  assertStringIncludes(scoreLine!, "85.5");
  assertStringIncludes(scoreLine!, "72.3");

  // Find and check cost line
  const costLine = lines.find((l) => l.includes("Cost:"));
  assertEquals(costLine !== undefined, true);
  assertStringIncludes(costLine!, "$0.0125");
  assertStringIncludes(costLine!, "$0.0089");
});

Deno.test("formatComparisonLines - includes per-task results", () => {
  const comparison: ModelComparison = {
    variant1: "model-a",
    variant2: "model-b",
    variant1Wins: 2,
    variant2Wins: 1,
    ties: 0,
    variant1AvgScore: 80.0,
    variant2AvgScore: 70.0,
    variant1Cost: 0.01,
    variant2Cost: 0.01,
    perTask: [
      {
        taskId: "task-001",
        variant1Score: 100,
        variant2Score: 80,
        winner: "variant1",
      },
      {
        taskId: "task-002",
        variant1Score: 90,
        variant2Score: 90,
        winner: "tie",
      },
      {
        taskId: "task-003",
        variant1Score: 50,
        variant2Score: 70,
        winner: "variant2",
      },
    ],
  };

  const lines = formatComparisonLines(comparison);

  // Check per-task section exists
  const perTaskHeader = lines.find((l) => l.includes("Per-Task Results"));
  assertEquals(perTaskHeader !== undefined, true);

  // Check task rows exist
  const task1Line = lines.find((l) => l.includes("task-001"));
  assertEquals(task1Line !== undefined, true);
  assertStringIncludes(task1Line!, "100.0");

  const task2Line = lines.find((l) => l.includes("task-002"));
  assertEquals(task2Line !== undefined, true);
  assertStringIncludes(task2Line!, "tie");

  const task3Line = lines.find((l) => l.includes("task-003"));
  assertEquals(task3Line !== undefined, true);
});

Deno.test("formatComparisonLines - truncates long model names", () => {
  const comparison: ModelComparison = {
    variant1: "anthropic/claude-sonnet-4-5-20250929@thinking=high",
    variant2: "openai/gpt-5.2-2025-12-11@thinking=medium",
    variant1Wins: 1,
    variant2Wins: 1,
    ties: 0,
    variant1AvgScore: 75.0,
    variant2AvgScore: 75.0,
    variant1Cost: 0.01,
    variant2Cost: 0.01,
    perTask: [],
  };

  const lines = formatComparisonLines(comparison);

  // First line should have truncated names
  assertStringIncludes(lines[0]!, "...");
});

Deno.test("formatComparisonLines - handles zero values", () => {
  const comparison: ModelComparison = {
    variant1: "model-a",
    variant2: "model-b",
    variant1Wins: 0,
    variant2Wins: 0,
    ties: 0,
    variant1AvgScore: 0,
    variant2AvgScore: 0,
    variant1Cost: 0,
    variant2Cost: 0,
    perTask: [],
  };

  const lines = formatComparisonLines(comparison);

  const winsLine = lines.find((l) => l.includes("Wins:"));
  assertEquals(winsLine !== undefined, true);
  assertStringIncludes(winsLine!, "0 - 0");
  assertStringIncludes(winsLine!, "0 ties");
});

Deno.test("formatComparisonLines - handles empty perTask array", () => {
  const comparison: ModelComparison = {
    variant1: "model-a",
    variant2: "model-b",
    variant1Wins: 1,
    variant2Wins: 0,
    ties: 0,
    variant1AvgScore: 100,
    variant2AvgScore: 0,
    variant1Cost: 0.01,
    variant2Cost: 0.01,
    perTask: [],
  };

  const lines = formatComparisonLines(comparison);

  // Should NOT have per-task section
  const perTaskHeader = lines.find((l) => l.includes("Per-Task Results"));
  assertEquals(perTaskHeader, undefined);
});
