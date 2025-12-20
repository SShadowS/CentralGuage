import { assertEquals } from "@std/assert";
import {
  type AgentResultEntry,
  isAgentResultFile,
  isLLMResultFile,
  normalizeAgentResult,
} from "../../../../cli/helpers/result-normalizer.ts";

Deno.test("normalizeAgentResult", async (t) => {
  await t.step("converts successful agent result to BenchmarkResult", () => {
    const agentResult: AgentResultEntry = {
      agentId: "config-b",
      taskId: "CG-AL-E001",
      result: {
        success: true,
        duration: 5000,
        metrics: {
          totalTokens: 1234,
          estimatedCost: 0.05,
          turns: 5,
        },
      },
    };

    const normalized = normalizeAgentResult(agentResult);

    assertEquals(normalized.taskId, "CG-AL-E001");
    assertEquals(normalized.success, true);
    assertEquals(normalized.finalScore, 100);
    assertEquals(normalized.totalDuration, 5000);
    assertEquals(normalized.totalTokensUsed, 1234);
    assertEquals(normalized.totalCost, 0.05);
    assertEquals(normalized.context?.variantId, "agent:config-b");
    assertEquals(normalized.context?.llmModel, "config-b");
    assertEquals(normalized.context?.llmProvider, "agent");
  });

  await t.step("converts failed agent result to BenchmarkResult", () => {
    const agentResult: AgentResultEntry = {
      agentId: "config-a",
      taskId: "CG-AL-E002",
      result: {
        success: false,
        duration: 10000,
        metrics: {
          totalTokens: 5678,
          estimatedCost: 0.12,
          turns: 10,
        },
      },
    };

    const normalized = normalizeAgentResult(agentResult);

    assertEquals(normalized.taskId, "CG-AL-E002");
    assertEquals(normalized.success, false);
    assertEquals(normalized.finalScore, 0);
    assertEquals(normalized.totalDuration, 10000);
    assertEquals(normalized.totalTokensUsed, 5678);
    assertEquals(normalized.totalCost, 0.12);
    assertEquals(normalized.context?.variantId, "agent:config-a");
    assertEquals(normalized.context?.llmProvider, "agent");
  });

  await t.step("creates attempts array with single entry", () => {
    const agentResult: AgentResultEntry = {
      agentId: "test-agent",
      taskId: "CG-AL-E003",
      result: {
        success: true,
        duration: 3000,
        metrics: {
          totalTokens: 500,
          estimatedCost: 0.01,
          turns: 2,
        },
      },
    };

    const normalized = normalizeAgentResult(agentResult);

    assertEquals(normalized.attempts?.length, 1);
    assertEquals(normalized.attempts?.[0]?.success, true);
  });
});

Deno.test("isAgentResultFile", async (t) => {
  await t.step("returns true for agent benchmark files", () => {
    assertEquals(isAgentResultFile("agent-benchmark-1234567890.json"), true);
    assertEquals(isAgentResultFile("agent-benchmark-results.json"), true);
  });

  await t.step("returns false for LLM benchmark files", () => {
    assertEquals(isAgentResultFile("benchmark-results-1234567890.json"), false);
    assertEquals(isAgentResultFile("results.json"), false);
  });

  await t.step("returns false for non-JSON files", () => {
    assertEquals(isAgentResultFile("agent-benchmark-1234567890.txt"), false);
    assertEquals(isAgentResultFile("agent-benchmark.yml"), false);
  });
});

Deno.test("isLLMResultFile", async (t) => {
  await t.step("returns true for LLM benchmark files", () => {
    assertEquals(isLLMResultFile("benchmark-results-1234567890.json"), true);
    assertEquals(isLLMResultFile("results.json"), true);
  });

  await t.step("returns false for agent benchmark files", () => {
    assertEquals(isLLMResultFile("agent-benchmark-1234567890.json"), false);
  });

  await t.step("returns false for summary files", () => {
    assertEquals(isLLMResultFile("summary.json"), false);
  });

  await t.step("returns false for non-JSON files", () => {
    assertEquals(isLLMResultFile("benchmark-results.txt"), false);
  });
});
