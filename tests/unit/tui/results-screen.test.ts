/**
 * Tests for results screen parsing logic
 */
import { assertEquals } from "@std/assert";
import {
  isResultFile,
  parseResultFileModelCount,
} from "../../../cli/tui/screens/results.ts";

Deno.test("isResultFile - benchmark-results files", () => {
  assertEquals(isResultFile("benchmark-results-1766016884881.json"), true);
  assertEquals(isResultFile("benchmark-results-123.json"), true);
});

Deno.test("isResultFile - agent-benchmark files", () => {
  assertEquals(isResultFile("agent-benchmark-1766280775711.json"), true);
  assertEquals(isResultFile("agent-benchmark-123.json"), true);
});

Deno.test("isResultFile - non-result files", () => {
  assertEquals(isResultFile("app.json"), false);
  assertEquals(isResultFile("config.json"), false);
  assertEquals(isResultFile("results.json"), false);
  assertEquals(isResultFile("benchmark.json"), false);
});

Deno.test("parseResultFileModelCount - benchmark-results with stats.perModel", () => {
  const data = {
    stats: {
      perModel: {
        "anthropic/claude-sonnet-4-5-20250929": { passRate: 0.8 },
        "openai/gpt-5.2-2025-12-11": { passRate: 0.7 },
        "gemini/gemini-3-pro-preview": { passRate: 0.6 },
      },
    },
    results: [],
  };

  const count = parseResultFileModelCount("benchmark-results-123.json", data);
  assertEquals(count, 3);
});

Deno.test("parseResultFileModelCount - benchmark-results with empty perModel", () => {
  const data = {
    stats: {
      perModel: {},
    },
    results: [],
  };

  const count = parseResultFileModelCount("benchmark-results-123.json", data);
  assertEquals(count, 0);
});

Deno.test("parseResultFileModelCount - benchmark-results without stats", () => {
  const data = {
    results: [],
  };

  const count = parseResultFileModelCount("benchmark-results-123.json", data);
  assertEquals(count, 0);
});

Deno.test("parseResultFileModelCount - agent-benchmark with agents array", () => {
  const data = {
    agents: ["config-a", "config-b"],
    results: [],
  };

  const count = parseResultFileModelCount("agent-benchmark-123.json", data);
  assertEquals(count, 2);
});

Deno.test("parseResultFileModelCount - agent-benchmark with single agent", () => {
  const data = {
    agents: ["config-a"],
    results: [],
  };

  const count = parseResultFileModelCount("agent-benchmark-123.json", data);
  assertEquals(count, 1);
});

Deno.test("parseResultFileModelCount - agent-benchmark without agents", () => {
  const data = {
    results: [],
  };

  const count = parseResultFileModelCount("agent-benchmark-123.json", data);
  assertEquals(count, 0);
});

Deno.test("parseResultFileModelCount - non-result file returns 0", () => {
  const data = {
    stats: {
      perModel: { "model-a": {} },
    },
    agents: ["agent-a"],
  };

  const count = parseResultFileModelCount("app.json", data);
  assertEquals(count, 0);
});

// Regression test: This is the bug we fixed - looking for result.model instead of stats.perModel
Deno.test("parseResultFileModelCount - does NOT look for result.model (regression)", () => {
  // Old buggy code would have looked for result.model in the results array
  // This data has result.model but should still use stats.perModel
  const data = {
    stats: {
      perModel: {
        "anthropic/claude-sonnet": {},
        "openai/gpt-4o": {},
      },
    },
    results: [
      { model: "wrong-model-1", taskId: "task-1" },
      { model: "wrong-model-2", taskId: "task-2" },
      { model: "wrong-model-3", taskId: "task-3" },
    ],
  };

  // Should return 2 (from stats.perModel), not 3 (from results[].model)
  const count = parseResultFileModelCount("benchmark-results-123.json", data);
  assertEquals(count, 2);
});
