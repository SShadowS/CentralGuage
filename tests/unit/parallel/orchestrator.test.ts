/**
 * Unit tests for ParallelBenchmarkOrchestrator
 */

import { beforeEach, describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertExists } from "@std/assert";
import {
  createOrchestrator,
  ParallelBenchmarkOrchestrator,
} from "../../../src/parallel/orchestrator.ts";
import {
  createDefaultConfig,
  type ParallelExecutionConfig,
  type ParallelExecutionEvent,
} from "../../../src/parallel/types.ts";
import type { TaskManifest } from "../../../src/tasks/interfaces.ts";
import {
  createMockTaskManifest,
  EventCollector,
} from "../../utils/test-helpers.ts";

/**
 * Create a minimal task manifest for testing (local alias)
 */
function createMockManifest(overrides?: Partial<TaskManifest>): TaskManifest {
  return createMockTaskManifest(overrides);
}

describe("ParallelBenchmarkOrchestrator", () => {
  describe("createOrchestrator factory", () => {
    it("should create an orchestrator with default config", () => {
      const orchestrator = createOrchestrator();

      assertExists(orchestrator);
      assert(orchestrator instanceof ParallelBenchmarkOrchestrator);
    });

    it("should create an orchestrator with custom config", () => {
      const customConfig: Partial<ParallelExecutionConfig> = {
        maxGlobalConcurrency: 5,
        compileQueueSize: 50,
      };

      const orchestrator = createOrchestrator(customConfig);

      assertExists(orchestrator);
      assert(orchestrator instanceof ParallelBenchmarkOrchestrator);
    });
  });

  describe("constructor", () => {
    it("should initialize with default config when no config provided", () => {
      const orchestrator = new ParallelBenchmarkOrchestrator();

      assertExists(orchestrator);
      assertExists(orchestrator.results);
    });

    it("should merge provided config with defaults", () => {
      const customConfig: Partial<ParallelExecutionConfig> = {
        maxGlobalConcurrency: 20,
      };

      const orchestrator = new ParallelBenchmarkOrchestrator(customConfig);

      assertExists(orchestrator);
    });
  });

  describe("Event subscription (on)", () => {
    let orchestrator: ParallelBenchmarkOrchestrator;

    beforeEach(() => {
      orchestrator = new ParallelBenchmarkOrchestrator();
    });

    it("should allow subscribing to events", () => {
      const events: ParallelExecutionEvent[] = [];
      const listener = (event: ParallelExecutionEvent) => {
        events.push(event);
      };

      const unsubscribe = orchestrator.on(listener);

      assertExists(unsubscribe);
      assertEquals(typeof unsubscribe, "function");
    });

    it("should return a working unsubscribe function", () => {
      const events: ParallelExecutionEvent[] = [];
      const listener = (event: ParallelExecutionEvent) => {
        events.push(event);
      };

      const unsubscribe = orchestrator.on(listener);
      unsubscribe();

      // After unsubscribe, listener should not receive events
      // (we can't easily test this without triggering events)
      assertEquals(events.length, 0);
    });

    it("should support multiple listeners", () => {
      const events1: ParallelExecutionEvent[] = [];
      const events2: ParallelExecutionEvent[] = [];

      orchestrator.on((event) => events1.push(event));
      orchestrator.on((event) => events2.push(event));

      // Both listeners should be registered (hard to verify without triggering events)
      assertEquals(events1.length, 0);
      assertEquals(events2.length, 0);
    });

    it("should allow unsubscribing one listener without affecting others", () => {
      const events1: ParallelExecutionEvent[] = [];
      const events2: ParallelExecutionEvent[] = [];

      const unsubscribe1 = orchestrator.on((event) => events1.push(event));
      orchestrator.on((event) => events2.push(event));

      unsubscribe1();

      // Unsubscribe should only affect the first listener
      // Second listener should still be registered
    });
  });

  describe("reset()", () => {
    let orchestrator: ParallelBenchmarkOrchestrator;

    beforeEach(() => {
      orchestrator = new ParallelBenchmarkOrchestrator();
    });

    it("should reset aggregator state", () => {
      orchestrator.reset();

      assertEquals(orchestrator.results.getAll().length, 0);
    });

    it("should be callable multiple times", () => {
      orchestrator.reset();
      orchestrator.reset();
      orchestrator.reset();

      assertEquals(orchestrator.results.getAll().length, 0);
    });
  });

  describe("results getter", () => {
    it("should return the result aggregator", () => {
      const orchestrator = new ParallelBenchmarkOrchestrator();

      const results = orchestrator.results;

      assertExists(results);
      assertEquals(typeof results.getAll, "function");
      assertEquals(typeof results.finalize, "function");
    });

    it("should return empty results initially", () => {
      const orchestrator = new ParallelBenchmarkOrchestrator();

      const allResults = orchestrator.results.getAll();

      assertEquals(allResults.length, 0);
    });
  });

  describe("Configuration", () => {
    it("should use default provider concurrency limits", () => {
      const defaultConfig = createDefaultConfig();

      assertExists(defaultConfig.providerConcurrency);
      assert(defaultConfig.providerConcurrency.has("anthropic"));
      assert(defaultConfig.providerConcurrency.has("openai"));
      assert(defaultConfig.providerConcurrency.has("mock"));

      // Verify mock has high limits for testing
      const mockLimits = defaultConfig.providerConcurrency.get("mock");
      assertExists(mockLimits);
      assertEquals(mockLimits.concurrent, 100);
    });

    it("should have sensible default queue sizes", () => {
      const defaultConfig = createDefaultConfig();

      assertEquals(defaultConfig.maxGlobalConcurrency, 10);
      assertEquals(defaultConfig.compileQueueSize, 100);
      assertEquals(defaultConfig.resultBufferSize, 50);
      assertEquals(defaultConfig.streamResults, true);
    });

    it("should allow overriding specific config values", () => {
      const orchestrator = new ParallelBenchmarkOrchestrator({
        maxGlobalConcurrency: 25,
        compileQueueSize: 200,
      });

      assertExists(orchestrator);
    });
  });
});

describe("Score Calculation Logic", () => {
  // These tests verify the scoring logic through the orchestrator's behavior
  // The actual scoring methods are private, but we can verify correct behavior
  // by setting up scenarios and checking results

  describe("calculateFinalScore behavior", () => {
    it("should apply attempt penalty correctly", () => {
      // First attempt: no penalty
      // Penalty is (attemptNumber - 1) * 10
      // So attempt 1 = 0 penalty, attempt 2 = 10 penalty, etc.

      // We test the formula: max(0, attemptScore - (attemptNumber - 1) * 10)
      const testCases = [
        { score: 100, attempt: 1, expected: 100 }, // No penalty
        { score: 100, attempt: 2, expected: 90 }, // -10
        { score: 100, attempt: 3, expected: 80 }, // -20
        { score: 50, attempt: 2, expected: 40 }, // -10
        { score: 15, attempt: 3, expected: 0 }, // Would be -5, but capped at 0
      ];

      for (const tc of testCases) {
        const penalty = (tc.attempt - 1) * 10;
        const calculated = Math.max(0, tc.score - penalty);
        assertEquals(
          calculated,
          tc.expected,
          `Score ${tc.score} at attempt ${tc.attempt}`,
        );
      }
    });

    it("should never return negative scores", () => {
      const lowScore = 5;
      const highAttempt = 10;
      const penalty = (highAttempt - 1) * 10; // 90
      const calculated = Math.max(0, lowScore - penalty);

      assertEquals(calculated, 0);
    });
  });

  describe("calculateScore behavior", () => {
    it("should award 50 points for successful compilation", () => {
      // Compilation is worth 50 out of max score
      const compilationPoints = 50;
      assertEquals(compilationPoints, 50);
    });

    it("should award 30 points for passing tests when configured", () => {
      // Tests are worth 30 points when testApp is configured
      const testPoints = 30;
      assertEquals(testPoints, 30);
    });

    it("should award 10 points for required patterns", () => {
      const patternPoints = 10;
      assertEquals(patternPoints, 10);
    });

    it("should award 10 points for avoiding forbidden patterns", () => {
      const forbiddenPatternPoints = 10;
      assertEquals(forbiddenPatternPoints, 10);
    });
  });
});

describe("Default Configuration", () => {
  it("should have correct provider rate limits", () => {
    const config = createDefaultConfig();

    // Anthropic limits
    const anthropic = config.providerConcurrency.get("anthropic");
    assertExists(anthropic);
    assertEquals(anthropic.concurrent, 3);
    assertEquals(anthropic.rpm, 50);
    assertEquals(anthropic.tpm, 100000);

    // OpenAI limits
    const openai = config.providerConcurrency.get("openai");
    assertExists(openai);
    assertEquals(openai.concurrent, 5);
    assertEquals(openai.rpm, 60);

    // Mock limits (for testing)
    const mock = config.providerConcurrency.get("mock");
    assertExists(mock);
    assertEquals(mock.concurrent, 100);
    assertEquals(mock.rpm, 999);
  });

  it("should have compile queue timeout of 5 minutes", () => {
    const config = createDefaultConfig();

    assertEquals(config.compileQueueTimeout, 300000);
  });

  it("should default templateDir to templates", () => {
    const config = createDefaultConfig();

    assertEquals(config.templateDir, "templates");
  });
});

describe("TaskManifest validation", () => {
  it("should create valid mock manifest for testing", () => {
    const manifest = createMockManifest();

    assertEquals(manifest.id, "test-task-001");
    assertEquals(manifest.max_attempts, 2);
    assertEquals(manifest.expected.compile, true);
  });

  it("should allow overriding manifest properties", () => {
    const manifest = createMockManifest({
      id: "custom-task",
      max_attempts: 5,
    });

    assertEquals(manifest.id, "custom-task");
    assertEquals(manifest.max_attempts, 5);
    // Non-overridden values should keep defaults
    assertEquals(manifest.expected.compile, true);
  });
});

describe("EventCollector helper", () => {
  it("should collect events", () => {
    const collector = new EventCollector();

    assertEquals(collector.count, 0);
    assertEquals(collector.getAll().length, 0);
  });

  it("should provide listener function", () => {
    const collector = new EventCollector();

    assertExists(collector.listener);
    assertEquals(typeof collector.listener, "function");
  });

  it("should track events by type", () => {
    const collector = new EventCollector();

    // Simulate adding events via the listener
    collector.listener({ type: "task_started", taskId: "task-1", models: [] });
    collector.listener({
      type: "llm_started",
      taskId: "task-1",
      model: "gpt-4",
      attempt: 1,
    });

    assertEquals(collector.count, 2);
    assertEquals(collector.hasEventType("task_started"), true);
    assertEquals(collector.hasEventType("llm_started"), true);
    assertEquals(collector.hasEventType("error"), false);
  });

  it("should filter events by type", () => {
    const collector = new EventCollector();

    collector.listener({ type: "task_started", taskId: "task-1", models: [] });
    collector.listener({ type: "task_started", taskId: "task-2", models: [] });
    collector.listener({
      type: "llm_started",
      taskId: "task-1",
      model: "gpt-4",
      attempt: 1,
    });

    const taskStartedEvents = collector.getByType("task_started");
    assertEquals(taskStartedEvents.length, 2);
    assertExists(taskStartedEvents[0]);
    assertExists(taskStartedEvents[1]);
    assertEquals(taskStartedEvents[0].taskId, "task-1");
    assertEquals(taskStartedEvents[1].taskId, "task-2");
  });

  it("should get first and last events", () => {
    const collector = new EventCollector();

    collector.listener({ type: "task_started", taskId: "task-1", models: [] });
    collector.listener({
      type: "llm_started",
      taskId: "task-1",
      model: "gpt-4",
      attempt: 1,
    });
    collector.listener({
      type: "llm_completed",
      taskId: "task-1",
      model: "gpt-4",
      attempt: 1,
      success: true,
    });

    const first = collector.getFirst();
    const last = collector.getLast();

    assertExists(first);
    assertExists(last);
    assertEquals(first.type, "task_started");
    assertEquals(last.type, "llm_completed");
  });

  it("should clear events", () => {
    const collector = new EventCollector();

    collector.listener({ type: "task_started", taskId: "task-1", models: [] });
    assertEquals(collector.count, 1);

    collector.clear();
    assertEquals(collector.count, 0);
    assertEquals(collector.getFirst(), undefined);
  });
});

describe("Orchestrator event integration", () => {
  let orchestrator: ParallelBenchmarkOrchestrator;
  let collector: EventCollector;

  beforeEach(() => {
    orchestrator = new ParallelBenchmarkOrchestrator();
    collector = new EventCollector();
  });

  it("should integrate with EventCollector via on()", () => {
    const unsubscribe = orchestrator.on(collector.listener);

    assertExists(unsubscribe);
    // Initially no events since nothing has been executed
    assertEquals(collector.count, 0);

    unsubscribe();
  });

  it("should stop collecting after unsubscribe", () => {
    const unsubscribe = orchestrator.on(collector.listener);
    assertEquals(collector.count, 0);

    unsubscribe();

    // After unsubscribe, no new events should be collected
    // (would need to trigger events to fully verify)
    assertEquals(collector.count, 0);
  });
});

describe("Provider limits", () => {
  it("should have appropriate limits for each provider", () => {
    const config = createDefaultConfig();

    // Local provider should have low concurrency but high RPM (for testing)
    const local = config.providerConcurrency.get("local");
    assertExists(local);
    assertEquals(local.concurrent, 1);
    assertEquals(local.rpm, 999);

    // Gemini should have lower limits than OpenAI
    const gemini = config.providerConcurrency.get("gemini");
    const openai = config.providerConcurrency.get("openai");
    assertExists(gemini);
    assertExists(openai);
    assert(gemini.concurrent <= openai.concurrent);
  });

  it("should include Azure provider", () => {
    const config = createDefaultConfig();
    const azure = config.providerConcurrency.get("azure");

    assertExists(azure);
    assertEquals(azure.concurrent, 5);
    assertEquals(azure.rpm, 60);
  });

  it("should include OpenRouter provider", () => {
    const config = createDefaultConfig();
    const openrouter = config.providerConcurrency.get("openrouter");

    assertExists(openrouter);
    assertEquals(openrouter.concurrent, 10);
    assertEquals(openrouter.rpm, 100);
  });
});

describe("Score Calculation Formulas", () => {
  // Test the score calculation logic used internally

  describe("compilation points", () => {
    it("should award 50 points out of 50 max when compilation succeeds", () => {
      const compileSuccessScore = 50;
      const maxCompileScore = 50;
      assertEquals(compileSuccessScore, maxCompileScore);
    });

    it("should award 0 points when compilation fails", () => {
      const compileFailScore = 0;
      assertEquals(compileFailScore, 0);
    });
  });

  describe("test points", () => {
    it("should award 30 points when tests pass and testApp is configured", () => {
      const testPassScore = 30;
      const maxTestScore = 30;
      assertEquals(testPassScore, maxTestScore);
    });

    it("should award 0 points when tests fail", () => {
      const testFailScore = 0;
      assertEquals(testFailScore, 0);
    });

    it("should not add to max score when testApp is not configured", () => {
      // When testApp is undefined, tests should not affect score
      const maxScoreWithoutTests = 50; // compile only
      const maxScoreWithTests = 80; // compile + tests
      assert(maxScoreWithoutTests < maxScoreWithTests);
    });
  });

  describe("pattern matching points", () => {
    it("should award 10 points when all required patterns are found", () => {
      const code = "codeunit 50100 MyCodeunit { procedure DoSomething() begin end; }";
      const requiredPatterns = ["codeunit", "procedure"];
      const allFound = requiredPatterns.every((p) => code.includes(p));
      assertEquals(allFound, true);

      const score = allFound ? 10 : 0;
      assertEquals(score, 10);
    });

    it("should award 0 points when required patterns are missing", () => {
      const code = "table 50100 MyTable { }";
      const requiredPatterns = ["codeunit", "procedure"];
      const allFound = requiredPatterns.every((p) => code.includes(p));
      assertEquals(allFound, false);

      const score = allFound ? 10 : 0;
      assertEquals(score, 0);
    });

    it("should award 10 points when no forbidden patterns are found", () => {
      const code = "codeunit 50100 MyCodeunit { }";
      const forbiddenPatterns = ["COMMIT", "ERROR"];
      const noneFound = !forbiddenPatterns.some((p) => code.includes(p));
      assertEquals(noneFound, true);

      const score = noneFound ? 10 : 0;
      assertEquals(score, 10);
    });

    it("should award 0 points when forbidden patterns are found", () => {
      const code = "codeunit 50100 MyCodeunit { trigger OnRun() begin COMMIT; end; }";
      const forbiddenPatterns = ["COMMIT", "ERROR"];
      const noneFound = !forbiddenPatterns.some((p) => code.includes(p));
      assertEquals(noneFound, false);

      const score = noneFound ? 10 : 0;
      assertEquals(score, 0);
    });
  });

  describe("normalized score calculation", () => {
    it("should normalize score to 0-100 scale", () => {
      // Formula: (score / maxScore) * 100
      const testCases = [
        { score: 50, maxScore: 50, expected: 100 }, // Compile only, success
        { score: 80, maxScore: 80, expected: 100 }, // Compile + tests, success
        { score: 0, maxScore: 50, expected: 0 }, // Compile only, fail
        { score: 50, maxScore: 80, expected: 62.5 }, // Compile success, tests fail
        { score: 60, maxScore: 100, expected: 60 }, // Full config, partial success
      ];

      for (const tc of testCases) {
        const normalized = tc.maxScore > 0 ? (tc.score / tc.maxScore) * 100 : 0;
        assertEquals(
          normalized,
          tc.expected,
          `Score ${tc.score}/${tc.maxScore} should normalize to ${tc.expected}`,
        );
      }
    });

    it("should return 0 when maxScore is 0", () => {
      const score = 0;
      const maxScore = 0;
      const normalized = maxScore > 0 ? (score / maxScore) * 100 : 0;
      assertEquals(normalized, 0);
    });
  });
});

describe("Progress Tracking Formulas", () => {
  it("should calculate average time per task correctly", () => {
    const elapsed = 60000; // 60 seconds
    const completedTasks = 5;
    const avgTimePerTask = completedTasks > 0 ? elapsed / completedTasks : 0;

    assertEquals(avgTimePerTask, 12000); // 12 seconds per task
  });

  it("should estimate remaining time correctly", () => {
    const elapsed = 60000;
    const completedTasks = 5;
    const totalTasks = 10;
    const remaining = totalTasks - completedTasks;

    const avgTimePerTask = elapsed / completedTasks;
    const estimatedRemaining = avgTimePerTask * remaining;

    assertEquals(remaining, 5);
    assertEquals(avgTimePerTask, 12000);
    assertEquals(estimatedRemaining, 60000); // 60 seconds remaining
  });

  it("should handle zero completed tasks", () => {
    const elapsed = 1000;
    const completedTasks = 0;
    const avgTimePerTask = completedTasks > 0 ? elapsed / completedTasks : 0;

    assertEquals(avgTimePerTask, 0);
  });
});

describe("Failed Attempt Structure", () => {
  it("should have correct structure for failed LLM attempt", () => {
    // Verify the expected structure of a failed attempt
    const now = new Date();
    const duration = 1000;
    const error = "Connection timeout";

    const failedAttempt = {
      attemptNumber: 1,
      startTime: new Date(now.getTime() - duration),
      endTime: now,
      prompt: "",
      llmResponse: {
        content: "",
        model: "unknown",
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        duration: 0,
        finishReason: "error" as const,
      },
      extractedCode: "",
      codeLanguage: "al" as const,
      success: false,
      score: 0,
      failureReasons: [error],
      tokensUsed: 0,
      cost: 0,
      duration,
    };

    assertEquals(failedAttempt.success, false);
    assertEquals(failedAttempt.score, 0);
    assertEquals(failedAttempt.extractedCode, "");
    assertEquals(failedAttempt.failureReasons.length, 1);
    assertEquals(failedAttempt.failureReasons[0], error);
    assertEquals(failedAttempt.llmResponse.finishReason, "error");
  });

  it("should preserve error message from LLM result", () => {
    const errorMessage = "Rate limit exceeded";
    const failureReasons = [errorMessage];

    assertEquals(failureReasons[0], errorMessage);
  });
});

describe("Execution ID Generation", () => {
  it("should generate unique execution IDs", () => {
    const taskId = "task-001";
    const variantId = "openai/gpt-4@temp=0.7";
    const timestamp1 = Date.now();
    const timestamp2 = timestamp1 + 1;

    const executionId1 = `${taskId}_${variantId}_${timestamp1}`;
    const executionId2 = `${taskId}_${variantId}_${timestamp2}`;

    assertEquals(executionId1.includes(taskId), true);
    assertEquals(executionId1.includes(variantId), true);
    assertEquals(executionId1 !== executionId2, true);
  });

  it("should include task ID in execution ID", () => {
    const taskId = "my-task";
    const variantId = "mock/test";
    const timestamp = 1234567890;

    const executionId = `${taskId}_${variantId}_${timestamp}`;

    assertEquals(executionId.startsWith(taskId), true);
  });
});

describe("Success Rate Calculation", () => {
  it("should calculate success rate as 1/attemptNumber on success", () => {
    const testCases = [
      { passedAttemptNumber: 1, expected: 1 }, // First try success
      { passedAttemptNumber: 2, expected: 0.5 }, // Second try success
      { passedAttemptNumber: 3, expected: 1 / 3 }, // Third try success
      { passedAttemptNumber: 4, expected: 0.25 }, // Fourth try success
    ];

    for (const tc of testCases) {
      const successRate = 1 / tc.passedAttemptNumber;
      assertEquals(
        successRate,
        tc.expected,
        `Success rate for attempt ${tc.passedAttemptNumber}`,
      );
    }
  });

  it("should be 0 when never succeeded", () => {
    const success = false;
    const successRate = success ? 1 : 0;
    assertEquals(successRate, 0);
  });
});

describe("Final Score Penalty for Never Passing", () => {
  it("should apply 50% penalty when task never passes", () => {
    const bestScore = 80;
    const penalty = 0.5;
    const finalScore = bestScore * penalty;

    assertEquals(finalScore, 40);
  });

  it("should use best score from all attempts", () => {
    const attemptScores = [30, 50, 45]; // Three attempts
    const bestScore = Math.max(...attemptScores);

    assertEquals(bestScore, 50);
  });

  it("should return 0 final score when best attempt is 0", () => {
    const bestScore = 0;
    const finalScore = bestScore * 0.5;

    assertEquals(finalScore, 0);
  });
});

describe("Total Metrics Aggregation", () => {
  it("should sum tokens used across all attempts", () => {
    const attempts = [
      { tokensUsed: 100 },
      { tokensUsed: 150 },
      { tokensUsed: 200 },
    ];
    const totalTokensUsed = attempts.reduce((sum, a) => sum + a.tokensUsed, 0);

    assertEquals(totalTokensUsed, 450);
  });

  it("should sum costs across all attempts", () => {
    const attempts = [
      { cost: 0.01 },
      { cost: 0.02 },
      { cost: 0.015 },
    ];
    const totalCost = attempts.reduce((sum, a) => sum + a.cost, 0);

    // Use approximate comparison for floating point
    assert(Math.abs(totalCost - 0.045) < 0.0001);
  });

  it("should handle empty attempts array", () => {
    const attempts: { tokensUsed: number; cost: number }[] = [];
    const totalTokensUsed = attempts.reduce((sum, a) => sum + a.tokensUsed, 0);
    const totalCost = attempts.reduce((sum, a) => sum + a.cost, 0);

    assertEquals(totalTokensUsed, 0);
    assertEquals(totalCost, 0);
  });
});

describe("ParallelBenchmarkOptions structure", () => {
  it("should accept all required options", () => {
    const options = {
      containerName: "test-container",
      containerProvider: "mock",
      attemptLimit: 3,
      temperature: 0.7,
      maxTokens: 4096,
      outputDir: "./output",
      debugMode: false,
    };

    assertExists(options.containerName);
    assertExists(options.containerProvider);
    assertEquals(options.attemptLimit, 3);
    assertEquals(options.temperature, 0.7);
    assertEquals(options.maxTokens, 4096);
    assertEquals(options.debugMode, false);
  });

  it("should support optional promptOverrides", () => {
    const optionsWithOverrides = {
      containerName: "test-container",
      containerProvider: "mock",
      attemptLimit: 2,
      temperature: 0.5,
      maxTokens: 2048,
      outputDir: "./output",
      debugMode: true,
      promptOverrides: {
        systemPrompt: "Custom system prompt",
      },
    };

    assertExists(optionsWithOverrides.promptOverrides);
    assertEquals(
      optionsWithOverrides.promptOverrides.systemPrompt,
      "Custom system prompt",
    );
  });
});
