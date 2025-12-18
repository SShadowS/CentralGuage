/**
 * Unit tests for model variant parsing and provider/model resolution.
 */

import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertExists } from "@std/assert";
import { resolveWithVariants } from "../../src/llm/variant-parser.ts";

describe("Variant Parser", () => {
  describe("resolveProviderAndModel", () => {
    it("should resolve preset aliases", () => {
      const result = resolveWithVariants(["sonnet"]);
      assertEquals(result.length, 1);
      assertExists(result[0]);
      assertEquals(result[0].provider, "anthropic");
      assertEquals(result[0].model, "claude-sonnet-4-5-20250929");
    });

    it("should resolve simple provider/model format", () => {
      const result = resolveWithVariants(["openai/gpt-5.1"]);
      assertEquals(result.length, 1);
      assertExists(result[0]);
      assertEquals(result[0].provider, "openai");
      assertEquals(result[0].model, "gpt-5.1");
    });

    it("should resolve OpenRouter models with nested slashes", () => {
      const result = resolveWithVariants(["openrouter/deepseek/deepseek-v3.2"]);
      assertEquals(result.length, 1);
      assertExists(result[0]);
      assertEquals(result[0].provider, "openrouter");
      assertEquals(result[0].model, "deepseek/deepseek-v3.2");
    });

    it("should resolve OpenRouter models with multiple slashes", () => {
      const result = resolveWithVariants([
        "openrouter/anthropic/claude-3.5-sonnet",
      ]);
      assertEquals(result.length, 1);
      assertExists(result[0]);
      assertEquals(result[0].provider, "openrouter");
      assertEquals(result[0].model, "anthropic/claude-3.5-sonnet");
    });

    it("should resolve azure-openai provider", () => {
      const result = resolveWithVariants(["azure-openai/gpt-4o"]);
      assertEquals(result.length, 1);
      assertExists(result[0]);
      assertEquals(result[0].provider, "azure-openai");
      assertEquals(result[0].model, "gpt-4o");
    });

    it("should resolve local provider with colon in model name", () => {
      const result = resolveWithVariants(["local/llama3:latest"]);
      assertEquals(result.length, 1);
      assertExists(result[0]);
      assertEquals(result[0].provider, "local");
      assertEquals(result[0].model, "llama3:latest");
    });

    it("should resolve gemini provider", () => {
      const result = resolveWithVariants(["gemini/gemini-3-pro-preview"]);
      assertEquals(result.length, 1);
      assertExists(result[0]);
      assertEquals(result[0].provider, "gemini");
      assertEquals(result[0].model, "gemini-3-pro-preview");
    });

    it("should handle unknown specs as provider and model", () => {
      const result = resolveWithVariants(["unknown-model"]);
      assertEquals(result.length, 1);
      assertExists(result[0]);
      assertEquals(result[0].provider, "unknown-model");
      assertEquals(result[0].model, "unknown-model");
    });

    it("should resolve multiple specs", () => {
      const result = resolveWithVariants([
        "sonnet",
        "openrouter/deepseek/deepseek-v3.2",
        "openai/gpt-5.1",
      ]);
      assertEquals(result.length, 3);
      assertExists(result[0]);
      assertExists(result[1]);
      assertExists(result[2]);
      assertEquals(result[0].provider, "anthropic");
      assertEquals(result[1].provider, "openrouter");
      assertEquals(result[1].model, "deepseek/deepseek-v3.2");
      assertEquals(result[2].provider, "openai");
    });
  });

  describe("variant config parsing", () => {
    it("should parse temperature variant", () => {
      const result = resolveWithVariants(["sonnet@temp=0.5"]);
      assertEquals(result.length, 1);
      assertExists(result[0]);
      assertEquals(result[0].provider, "anthropic");
      assertEquals(result[0].config.temperature, 0.5);
      assertEquals(result[0].hasVariant, true);
    });

    it("should parse maxTokens variant", () => {
      const result = resolveWithVariants(["sonnet@tokens=8000"]);
      assertEquals(result.length, 1);
      assertExists(result[0]);
      assertEquals(result[0].config.maxTokens, 8000);
    });

    it("should parse multiple variant params", () => {
      const result = resolveWithVariants(["sonnet@temp=0.7;tokens=4000"]);
      assertEquals(result.length, 1);
      assertExists(result[0]);
      assertEquals(result[0].config.temperature, 0.7);
      assertEquals(result[0].config.maxTokens, 4000);
    });

    it("should parse variants with OpenRouter nested model", () => {
      const result = resolveWithVariants([
        "openrouter/deepseek/deepseek-v3.2@temp=0.3",
      ]);
      assertEquals(result.length, 1);
      assertExists(result[0]);
      assertEquals(result[0].provider, "openrouter");
      assertEquals(result[0].model, "deepseek/deepseek-v3.2");
      assertEquals(result[0].config.temperature, 0.3);
    });

    it("should mark hasVariant=false when no variant specified", () => {
      const result = resolveWithVariants(["sonnet"]);
      assertExists(result[0]);
      assertEquals(result[0].hasVariant, false);
    });

    it("should parse thinkingBudget as number", () => {
      const result = resolveWithVariants(["sonnet@thinking=10000"]);
      assertExists(result[0]);
      assertEquals(result[0].config.thinkingBudget, 10000);
    });

    it("should parse thinkingBudget as string for OpenAI", () => {
      const result = resolveWithVariants(["openai/gpt-5.1@thinking=high"]);
      assertExists(result[0]);
      assertEquals(result[0].config.thinkingBudget, "high");
    });
  });
});
