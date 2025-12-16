/**
 * Unit tests for formatters
 */

import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertExists } from "@std/assert";
import {
  formatBarChart,
  formatBenchmarkStats,
  formatCompact,
  formatJSON,
  formatLeaderboard,
  formatModelSummaryTable,
  formatScorecard,
  formatTaskMatrix,
  type FormatterInput,
  getFormatter,
  shouldCopyToClipboard,
  type TaskMatrixInput,
} from "../../../src/utils/formatters.ts";
import type {
  AggregateStats,
  ModelStats,
  TaskComparison,
  TaskStats,
} from "../../../src/parallel/types.ts";

/**
 * Create mock ModelStats for testing
 */
function createMockModelStats(
  overrides?: Partial<ModelStats>,
): ModelStats {
  return {
    model: "mock-gpt-4",
    provider: "mock",
    variantId: "mock/mock-gpt-4",
    tasksPassed: 8,
    tasksFailed: 2,
    avgScore: 85,
    tokens: 10000,
    cost: 0.05,
    avgAttempts: 1.2,
    passedOnAttempt1: 7,
    passedOnAttempt2: 8,
    compileFailures: 1,
    testFailures: 1,
    malformedResponses: 0,
    ...overrides,
  };
}

/**
 * Create mock TaskStats for testing
 */
function createMockTaskStats(overrides?: Partial<TaskStats>): TaskStats {
  return {
    taskId: "test-task-001",
    modelsPassed: 2,
    modelsFailed: 1,
    avgScore: 80,
    bestScore: 100,
    bestModel: "mock/mock-gpt-4",
    ...overrides,
  };
}

/**
 * Create mock FormatterInput for testing
 */
function createMockFormatterInput(
  overrides?: Partial<FormatterInput>,
): FormatterInput {
  const perModel = new Map<string, ModelStats>();
  perModel.set("mock/mock-gpt-4", createMockModelStats());
  perModel.set(
    "mock/mock-claude",
    createMockModelStats({
      model: "mock-claude",
      variantId: "mock/mock-claude",
      tasksPassed: 9,
      tasksFailed: 1,
      avgScore: 92,
    }),
  );

  const perTask = new Map<string, TaskStats>();
  perTask.set("task-1", createMockTaskStats({ taskId: "task-1" }));
  perTask.set("task-2", createMockTaskStats({ taskId: "task-2" }));

  const stats: AggregateStats = {
    totalTokens: 20000,
    totalCost: 0.10,
    totalDuration: 60000,
    perModel,
    perTask,
    overallPassRate: 0.85,
    averageScore: 88.5,
    passRate1: 0.70,
    passRate2: 0.85,
    passNum1: 14,
    passNum2: 17,
    totalCompileErrors: 2,
    totalTestFailures: 1,
    totalMalformed: 0,
    secondsPerTask: 30,
    promptTokens: 15000,
    completionTokens: 5000,
  };

  const comparisons: TaskComparison[] = [
    {
      winner: "mock/mock-claude",
      bestScore: 100,
      avgScore: 90,
      passingModels: ["mock/mock-gpt-4", "mock/mock-claude"],
      failingModels: [],
      ranking: [
        { model: "mock/mock-claude", score: 100, rank: 1 },
        { model: "mock/mock-gpt-4", score: 80, rank: 2 },
      ],
    },
  ];

  return {
    stats,
    comparisons,
    taskCount: 10,
    ...overrides,
  };
}

describe("formatLeaderboard", () => {
  it("should format results as Twitter-friendly leaderboard", () => {
    const input = createMockFormatterInput();
    const output = formatLeaderboard(input);

    assert(output.includes("CentralGauge"));
    assert(output.includes("#BusinessCentral"));
    assert(output.includes("#LLMBenchmark"));
  });

  it("should sort models by pass rate", () => {
    const input = createMockFormatterInput();
    const output = formatLeaderboard(input);

    // mock-claude has higher pass rate, should appear first
    const claudeIndex = output.indexOf("mock-claude");
    const gptIndex = output.indexOf("mock-gpt-4");
    assert(claudeIndex < gptIndex || claudeIndex === -1);
  });

  it("should show winner summary", () => {
    const input = createMockFormatterInput();
    const output = formatLeaderboard(input);

    assert(output.includes("Winner:"));
    assert(output.includes("Cost:"));
  });
});

describe("formatScorecard", () => {
  it("should format results with box drawing characters", () => {
    const input = createMockFormatterInput();
    const output = formatScorecard(input);

    assert(output.includes("┌"));
    assert(output.includes("└"));
    assert(output.includes("│"));
    assert(output.includes("CentralGauge"));
  });

  it("should show medals for top performers", () => {
    const input = createMockFormatterInput();
    const output = formatScorecard(input);

    assert(output.includes("🥇") || output.includes("🥈"));
  });

  it("should show task count and pass rate", () => {
    const input = createMockFormatterInput();
    const output = formatScorecard(input);

    assert(output.includes("Tasks:"));
    assert(output.includes("Pass Rate:"));
  });
});

describe("formatBarChart", () => {
  it("should format results as emoji bar chart", () => {
    const input = createMockFormatterInput();
    const output = formatBarChart(input);

    assert(output.includes("📊"));
    assert(output.includes("█") || output.includes("░"));
    assert(output.includes("%"));
  });

  it("should show winner and cost", () => {
    const input = createMockFormatterInput();
    const output = formatBarChart(input);

    assert(output.includes("Winner:") || output.includes("✅"));
    assert(output.includes("$"));
  });
});

describe("formatCompact", () => {
  it("should format results as one-liner", () => {
    const input = createMockFormatterInput();
    const output = formatCompact(input);

    assert(output.includes("CentralGauge:"));
    assert(output.includes("%"));
    // Should be relatively short
    assert(output.length < 500);
  });

  it("should include vs comparison", () => {
    const input = createMockFormatterInput();
    const output = formatCompact(input);

    assert(output.includes("vs") || output.includes("|"));
  });
});

describe("formatJSON", () => {
  it("should format results as valid JSON", () => {
    const input = createMockFormatterInput();
    const output = formatJSON(input);

    // Should parse as valid JSON
    const parsed = JSON.parse(output);
    assertExists(parsed.summary);
    assertExists(parsed.models);
    assertExists(parsed.comparisons);
  });

  it("should include summary stats", () => {
    const input = createMockFormatterInput();
    const output = formatJSON(input);
    const parsed = JSON.parse(output);

    assertEquals(parsed.summary.taskCount, 10);
    assertEquals(parsed.summary.passRate, 0.85);
    assertExists(parsed.summary.totalTokens);
    assertExists(parsed.summary.totalCost);
  });

  it("should include model performance data", () => {
    const input = createMockFormatterInput();
    const output = formatJSON(input);
    const parsed = JSON.parse(output);

    assert(Object.keys(parsed.models).length > 0);
    const firstModel = Object.values(parsed.models)[0] as Record<
      string,
      unknown
    >;
    assertExists(firstModel["passRate"]);
    assertExists(firstModel["avgScore"]);
    assertExists(firstModel["cost"]);
  });
});

describe("formatBenchmarkStats", () => {
  it("should format benchmark stats as table", () => {
    const input = createMockFormatterInput();
    const output = formatBenchmarkStats(input);

    assert(output.includes("BENCHMARK STATS"));
    assert(output.includes("pass_rate_1"));
    assert(output.includes("pass_rate_2"));
    assert(output.includes("tokens"));
    assert(output.includes("cost"));
  });

  it("should show totals column for multiple models", () => {
    const input = createMockFormatterInput();
    const output = formatBenchmarkStats(input);

    assert(output.includes("TOTAL"));
  });
});

describe("formatModelSummaryTable", () => {
  it("should format model summary as table", () => {
    const input = createMockFormatterInput();
    const output = formatModelSummaryTable(input);

    assert(output.includes("MODEL PERFORMANCE"));
    assert(output.includes("PR1"));
    assert(output.includes("PR2"));
    assert(output.includes("Score"));
    assert(output.includes("Attempts"));
  });

  it("should return empty string for no models", () => {
    const input = createMockFormatterInput();
    input.stats.perModel.clear();
    const output = formatModelSummaryTable(input);

    assertEquals(output, "");
  });
});

describe("formatTaskMatrix", () => {
  it("should format task matrix", () => {
    const now = new Date();
    const input = createMockFormatterInput() as TaskMatrixInput;
    input.results = [
      {
        taskId: "task-1",
        executionId: "exec-1",
        success: true,
        passedAttemptNumber: 1,
        successRate: 1.0,
        finalScore: 100,
        totalDuration: 5000,
        totalTokensUsed: 1000,
        totalCost: 0.01,
        executedAt: now,
        executedBy: "test-runner",
        environment: { NODE_ENV: "test" },
        attempts: [],
        context: {
          manifest: {
            id: "task-1",
            description: "Test",
            prompt_template: "prompt.md",
            fix_template: "fix.md",
            max_attempts: 2,
            expected: { compile: true },
            metrics: [],
          },
          taskType: "code_generation",
          llmProvider: "mock",
          llmModel: "mock-gpt-4",
          variantId: "mock/mock-gpt-4",
          attemptLimit: 2,
          instructions: "Test",
          alProjectPath: "/test",
          targetFile: "test.al",
          promptTemplatePath: "/templates/prompt.md",
          fixTemplatePath: "/templates/fix.md",
          temperature: 0.1,
          maxTokens: 4000,
          timeout: 300000,
          containerProvider: "mock",
          containerName: "test-container",
          outputDir: "results",
          debugMode: false,
          expectedOutput: {
            type: "al_code",
            validation: { mustCompile: true, mustPass: false },
          },
          evaluation: {
            requiredElements: [],
            forbiddenElements: [],
            customChecks: [],
          },
          metadata: {
            difficulty: "easy",
            category: "implementation",
            tags: [],
            estimatedTokens: 1000,
          },
        },
      },
    ];

    const output = formatTaskMatrix(input);

    assert(output.includes("TASK RESULTS MATRIX"));
    assert(output.includes("Winner"));
    assert(output.includes("TOTALS"));
  });

  it("should return empty string for single task", () => {
    const input = createMockFormatterInput() as TaskMatrixInput;
    input.stats.perTask.clear();
    input.stats.perTask.set("only-task", createMockTaskStats());
    input.results = [];

    const output = formatTaskMatrix(input);

    assertEquals(output, "");
  });
});

describe("getFormatter", () => {
  it("should return leaderboard formatter", () => {
    const formatter = getFormatter("leaderboard");
    assertEquals(formatter, formatLeaderboard);
  });

  it("should return scorecard formatter", () => {
    const formatter = getFormatter("scorecard");
    assertEquals(formatter, formatScorecard);
  });

  it("should return barchart formatter", () => {
    const formatter = getFormatter("barchart");
    assertEquals(formatter, formatBarChart);
  });

  it("should return json formatter", () => {
    const formatter = getFormatter("json");
    assertEquals(formatter, formatJSON);
  });

  it("should return compact formatter for verbose", () => {
    const formatter = getFormatter("verbose");
    assertEquals(formatter, formatCompact);
  });
});

describe("shouldCopyToClipboard", () => {
  it("should return true for social media formats", () => {
    assertEquals(shouldCopyToClipboard("leaderboard"), true);
    assertEquals(shouldCopyToClipboard("scorecard"), true);
    assertEquals(shouldCopyToClipboard("barchart"), true);
  });

  it("should return false for verbose and json", () => {
    assertEquals(shouldCopyToClipboard("verbose"), false);
    assertEquals(shouldCopyToClipboard("json"), false);
  });
});
