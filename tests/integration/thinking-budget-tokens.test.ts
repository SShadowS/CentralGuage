/**
 * Integration tests for thinking budget + max_tokens configuration
 *
 * CRITICAL FINDING:
 * Anthropic API requires: max_tokens > thinking.budget_tokens
 *
 * This means if you want thinking=56000, you need max_tokens >= 57000
 * The common assumption that these are independent pools is INCORRECT.
 *
 * Reference: https://docs.claude.com/en/docs/build-with-claude/extended-thinking
 */

import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { assert, assertExists, assertRejects } from "@std/assert";
import { AnthropicAdapter } from "../../src/llm/anthropic-adapter.ts";
import type { GenerationContext, LLMRequest } from "../../src/llm/types.ts";
import { EnvLoader } from "../../src/utils/env-loader.ts";

// Load environment from .env file (if present) before checking for keys
await EnvLoader.loadEnvironment();

const hasAnthropicKey = EnvLoader.hasApiKey("anthropic");

const testContext: GenerationContext = {
  taskId: "thinking-budget-test",
  attempt: 1,
  description: "Test thinking budget + max_tokens configuration",
};

// Simple request that doesn't require complex output
// Note: maxTokens is intentionally omitted - it should come from adapter config
const simpleRequest: LLMRequest = {
  prompt: "Write a simple AL codeunit that adds two integers. Keep it minimal.",
  temperature: 0.1, // Will be overridden to 1 when thinking is enabled
  // maxTokens intentionally NOT set - uses adapter config
};

describe("Thinking Budget + Max Tokens Integration", () => {
  let adapter: AnthropicAdapter;

  beforeEach(() => {
    adapter = new AnthropicAdapter();
  });

  afterEach(() => {
    // No cleanup needed - adapter doesn't hold persistent state
  });

  describe("API Constraint: max_tokens > thinking_budget", () => {
    it("should reject when max_tokens < thinking_budget", {
      ignore: !hasAnthropicKey,
    }, async () => {
      adapter.configure({
        provider: "anthropic",
        model: "claude-sonnet-4-5-20250929",
        apiKey: String(EnvLoader.get("ANTHROPIC_API_KEY")),
        maxTokens: 16000, // Less than thinking budget
        thinkingBudget: 56000, // This is INVALID - max_tokens must be greater
      });

      // This should fail with API error
      await assertRejects(
        async () => {
          const generator = adapter.generateCodeStream(simpleRequest, testContext);
          let iterResult = await generator.next();
          while (!iterResult.done) {
            iterResult = await generator.next();
          }
        },
        Error,
        "max_tokens",
      );

      console.log(`[OK] API correctly rejects max_tokens (16000) < thinking_budget (56000)`);
    });

    it("should accept when max_tokens > thinking_budget (streaming)", {
      ignore: !hasAnthropicKey,
    }, async () => {
      adapter.configure({
        provider: "anthropic",
        model: "claude-sonnet-4-5-20250929",
        apiKey: String(EnvLoader.get("ANTHROPIC_API_KEY")),
        maxTokens: 12000, // Greater than thinking budget
        thinkingBudget: 10000, // Valid: max_tokens > thinking_budget
      });

      const chunks: string[] = [];
      let result;

      const generator = adapter.generateCodeStream(simpleRequest, testContext);

      let iterResult = await generator.next();
      while (!iterResult.done) {
        chunks.push(iterResult.value.text);
        iterResult = await generator.next();
      }
      result = iterResult.value;

      assertExists(result, "Stream should return a result");
      assertExists(result.content, "Result should have content");
      assert(result.content.length > 0, "Content should not be empty");
      assertExists(result.response.usage, "Result should have usage info");

      console.log(`[OK] Streaming works with max_tokens (12000) > thinking_budget (10000)`);
      console.log(
        `     Chunks: ${result.chunkCount}, Usage: ${result.response.usage.totalTokens} tokens`,
      );
    });
  });

  describe("Valid Configurations for High Thinking Budgets", () => {
    it("should work with thinking=56000 when max_tokens=60000", {
      ignore: !hasAnthropicKey,
    }, async () => {
      adapter.configure({
        provider: "anthropic",
        model: "claude-sonnet-4-5-20250929",
        apiKey: String(EnvLoader.get("ANTHROPIC_API_KEY")),
        maxTokens: 60000, // Must be > 56000
        thinkingBudget: 56000,
      });

      const chunks: string[] = [];
      let result;

      const generator = adapter.generateCodeStream(simpleRequest, testContext);

      let iterResult = await generator.next();
      while (!iterResult.done) {
        chunks.push(iterResult.value.text);
        iterResult = await generator.next();
      }
      result = iterResult.value;

      assertExists(result, "Stream should return a result");
      assertExists(result.content, "Result should have content");

      console.log(`[OK] High thinking budget works: thinking=56000, max_tokens=60000`);
      console.log(
        `     Chunks: ${result.chunkCount}, Usage: ${result.response.usage.totalTokens} tokens`,
      );
    });
  });

  describe("Temperature Override Verification", () => {
    it("should accept temperature config when thinking is enabled (API overrides to 1)", {
      ignore: !hasAnthropicKey,
    }, async () => {
      // Configure with explicit temperature - should be overridden to 1
      adapter.configure({
        provider: "anthropic",
        model: "claude-sonnet-4-5-20250929",
        apiKey: String(EnvLoader.get("ANTHROPIC_API_KEY")),
        maxTokens: 12000, // Valid: > thinking_budget
        thinkingBudget: 10000,
        temperature: 0.5, // This will be ignored when thinking is enabled
      });

      const generator = adapter.generateCodeStream(
        { ...simpleRequest, temperature: 0.3 }, // Request temp also ignored
        testContext,
      );

      let iterResult = await generator.next();
      while (!iterResult.done) {
        iterResult = await generator.next();
      }
      const result = iterResult.value;

      assertExists(result, "Should complete without temperature error");
      console.log(`[OK] Temperature override works with thinking enabled`);
    });
  });

  describe("Non-streaming with Thinking", () => {
    it("should work with non-streaming when max_tokens > thinking_budget", {
      ignore: !hasAnthropicKey,
    }, async () => {
      adapter.configure({
        provider: "anthropic",
        model: "claude-sonnet-4-5-20250929",
        apiKey: String(EnvLoader.get("ANTHROPIC_API_KEY")),
        maxTokens: 12000, // Greater than thinking budget
        thinkingBudget: 10000,
      });

      // Non-streaming call
      const result = await adapter.generateCode(simpleRequest, testContext);

      assertExists(result, "Should return result");
      assertExists(result.code, "Should have code");

      console.log(`[OK] Non-streaming works with max_tokens (12000) > thinking_budget (10000)`);
      console.log(`     Response length: ${result.code.length} chars`);
    });
  });
});
