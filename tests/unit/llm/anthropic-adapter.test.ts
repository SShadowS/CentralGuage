/**
 * Unit tests for AnthropicAdapter
 *
 * These tests verify the adapter's behavior without making actual API calls:
 * 1. Public properties (name, supportedModels)
 * 2. Configuration validation (validateConfig)
 * 3. Cost estimation (estimateCost)
 * 4. Interface compliance (LLMAdapter)
 */

import { assertEquals, assertArrayIncludes } from "@std/assert";
import { AnthropicAdapter } from "../../../src/llm/anthropic-adapter.ts";

// =============================================================================
// Provider Properties Tests
// =============================================================================

Deno.test("AnthropicAdapter - Provider Properties", async (t) => {
  await t.step('name property returns "anthropic"', () => {
    const adapter = new AnthropicAdapter();
    assertEquals(adapter.name, "anthropic");
  });

  await t.step("supportedModels contains Claude models", () => {
    const adapter = new AnthropicAdapter();
    assertArrayIncludes(adapter.supportedModels, [
      "claude-opus-4-5-20251101",
      "claude-sonnet-4-5-20250929",
      "claude-haiku-4-5-20251001",
    ]);
  });

  await t.step("supportedModels includes aliases", () => {
    const adapter = new AnthropicAdapter();
    assertArrayIncludes(adapter.supportedModels, [
      "claude-opus-4-5",
      "claude-sonnet-4-5",
      "claude-haiku-4-5",
    ]);
  });
});

// =============================================================================
// Interface Compliance Tests
// =============================================================================

Deno.test("AnthropicAdapter - implements LLMAdapter interface", async (t) => {
  await t.step("has all required methods", () => {
    const adapter = new AnthropicAdapter();

    assertEquals(typeof adapter.configure, "function");
    assertEquals(typeof adapter.generateCode, "function");
    assertEquals(typeof adapter.generateFix, "function");
    assertEquals(typeof adapter.validateConfig, "function");
    assertEquals(typeof adapter.estimateCost, "function");
    assertEquals(typeof adapter.isHealthy, "function");
  });

  await t.step("has required readonly properties", () => {
    const adapter = new AnthropicAdapter();

    assertEquals(typeof adapter.name, "string");
    assertEquals(Array.isArray(adapter.supportedModels), true);
    assertEquals(adapter.supportedModels.length > 0, true);
  });
});

// =============================================================================
// Configuration Validation Tests
// =============================================================================

Deno.test("AnthropicAdapter - validateConfig", async (t) => {
  await t.step("returns error when API key is missing", () => {
    const adapter = new AnthropicAdapter();
    const errors = adapter.validateConfig({
      provider: "anthropic",
      model: "claude-sonnet-4-5",
    });

    assertEquals(errors.length > 0, true);
    assertEquals(
      errors.some((e) => e.includes("API key")),
      true,
    );
  });

  await t.step("returns error when model is missing", () => {
    const adapter = new AnthropicAdapter();
    const errors = adapter.validateConfig({
      provider: "anthropic",
      apiKey: "test-key",
      model: "",
    });

    assertEquals(errors.length > 0, true);
    assertEquals(
      errors.some((e) => e.includes("Model")),
      true,
    );
  });

  await t.step("returns no errors for valid config", () => {
    const adapter = new AnthropicAdapter();
    const errors = adapter.validateConfig({
      provider: "anthropic",
      apiKey: "test-key",
      model: "claude-sonnet-4-5",
    });

    assertEquals(errors.length, 0);
  });

  await t.step("validates temperature range", () => {
    const adapter = new AnthropicAdapter();

    // Temperature too low
    let errors = adapter.validateConfig({
      provider: "anthropic",
      apiKey: "test-key",
      model: "claude-sonnet-4-5",
      temperature: -0.1,
    });
    assertEquals(
      errors.some((e) => e.includes("Temperature")),
      true,
    );

    // Temperature too high
    errors = adapter.validateConfig({
      provider: "anthropic",
      apiKey: "test-key",
      model: "claude-sonnet-4-5",
      temperature: 1.5,
    });
    assertEquals(
      errors.some((e) => e.includes("Temperature")),
      true,
    );

    // Valid temperature
    errors = adapter.validateConfig({
      provider: "anthropic",
      apiKey: "test-key",
      model: "claude-sonnet-4-5",
      temperature: 0.5,
    });
    assertEquals(
      errors.some((e) => e.includes("Temperature")),
      false,
    );
  });

  await t.step("validates maxTokens range", () => {
    const adapter = new AnthropicAdapter();

    // Max tokens too low
    let errors = adapter.validateConfig({
      provider: "anthropic",
      apiKey: "test-key",
      model: "claude-sonnet-4-5",
      maxTokens: 0,
    });
    assertEquals(
      errors.some((e) => e.includes("Max tokens")),
      true,
    );

    // Max tokens too high
    errors = adapter.validateConfig({
      provider: "anthropic",
      apiKey: "test-key",
      model: "claude-sonnet-4-5",
      maxTokens: 300000,
    });
    assertEquals(
      errors.some((e) => e.includes("Max tokens")),
      true,
    );

    // Valid maxTokens
    errors = adapter.validateConfig({
      provider: "anthropic",
      apiKey: "test-key",
      model: "claude-sonnet-4-5",
      maxTokens: 4000,
    });
    assertEquals(
      errors.some((e) => e.includes("Max tokens")),
      false,
    );
  });

  await t.step("accepts custom claude models without error", () => {
    const adapter = new AnthropicAdapter();
    const errors = adapter.validateConfig({
      provider: "anthropic",
      apiKey: "test-key",
      model: "custom-claude-model",
    });

    assertEquals(errors.length, 0);
  });
});

// =============================================================================
// Cost Estimation Tests
// =============================================================================

Deno.test("AnthropicAdapter - estimateCost", async (t) => {
  await t.step("calculates cost based on token counts", () => {
    const adapter = new AnthropicAdapter();
    adapter.configure({
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      apiKey: "test-key",
    });

    const cost = adapter.estimateCost(1000, 500);

    // Should return a positive number
    assertEquals(cost > 0, true);
  });

  await t.step("calculates cost for sonnet model", () => {
    const adapter = new AnthropicAdapter();
    adapter.configure({
      provider: "anthropic",
      model: "claude-sonnet-4-5-20250929",
      apiKey: "test-key",
    });

    // Sonnet pricing: $0.003/1K input, $0.015/1K output
    const cost = adapter.estimateCost(1000, 1000);
    // 1000/1000 * 0.003 + 1000/1000 * 0.015 = 0.003 + 0.015 = 0.018
    assertEquals(Math.abs(cost - 0.018) < 0.001, true);
  });

  await t.step("calculates cost for opus model", () => {
    const adapter = new AnthropicAdapter();
    adapter.configure({
      provider: "anthropic",
      model: "claude-opus-4-5",
      apiKey: "test-key",
    });

    // Opus 4.5 pricing: $0.005/1K input, $0.025/1K output
    const cost = adapter.estimateCost(1000, 1000);
    // 1000/1000 * 0.005 + 1000/1000 * 0.025 = 0.005 + 0.025 = 0.030
    assertEquals(Math.abs(cost - 0.030) < 0.001, true);
  });

  await t.step("calculates cost for haiku model", () => {
    const adapter = new AnthropicAdapter();
    adapter.configure({
      provider: "anthropic",
      model: "claude-haiku-4-5",
      apiKey: "test-key",
    });

    // Haiku 4.5 pricing: $0.001/1K input, $0.005/1K output
    const cost = adapter.estimateCost(1000, 1000);
    // 1000/1000 * 0.001 + 1000/1000 * 0.005 = 0.001 + 0.005 = 0.006
    assertEquals(Math.abs(cost - 0.006) < 0.001, true);
  });

  await t.step("handles zero tokens", () => {
    const adapter = new AnthropicAdapter();
    adapter.configure({
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      apiKey: "test-key",
    });

    const cost = adapter.estimateCost(0, 0);
    assertEquals(cost, 0);
  });

  await t.step("uses default pricing for unknown models", () => {
    const adapter = new AnthropicAdapter();
    adapter.configure({
      provider: "anthropic",
      model: "unknown-model",
      apiKey: "test-key",
    });

    const cost = adapter.estimateCost(1000, 1000);
    // Default pricing: $0.003/1K input, $0.015/1K output
    assertEquals(Math.abs(cost - 0.018) < 0.001, true);
  });
});

// =============================================================================
// Configuration Tests
// =============================================================================

Deno.test("AnthropicAdapter - configure", async (t) => {
  await t.step("accepts configuration without throwing", () => {
    const adapter = new AnthropicAdapter();

    // Should not throw
    adapter.configure({
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      apiKey: "test-key",
      temperature: 0.5,
      maxTokens: 2000,
    });
  });

  await t.step("merges with default configuration", () => {
    const adapter = new AnthropicAdapter();

    adapter.configure({
      provider: "anthropic",
      model: "claude-opus-4-5",
      apiKey: "test-key",
    });

    // After configure, cost estimation should use the new model
    const cost = adapter.estimateCost(1000, 1000);
    // Opus 4.5 pricing
    assertEquals(Math.abs(cost - 0.030) < 0.001, true);
  });
});

// =============================================================================
// Constructor Tests
// =============================================================================

Deno.test("AnthropicAdapter - constructor", async (t) => {
  await t.step("creates instance without errors", () => {
    const adapter = new AnthropicAdapter();
    assertEquals(adapter instanceof AnthropicAdapter, true);
  });

  await t.step("multiple instances are independent", () => {
    const adapter1 = new AnthropicAdapter();
    const adapter2 = new AnthropicAdapter();

    adapter1.configure({
      provider: "anthropic",
      model: "claude-opus-4-5",
      apiKey: "key1",
    });

    adapter2.configure({
      provider: "anthropic",
      model: "claude-haiku-4-5",
      apiKey: "key2",
    });

    // Different cost calculations prove independence
    const cost1 = adapter1.estimateCost(1000, 1000);
    const cost2 = adapter2.estimateCost(1000, 1000);

    assertEquals(cost1 !== cost2, true);
  });
});
