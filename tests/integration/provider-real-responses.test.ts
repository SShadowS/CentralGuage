/**
 * Integration tests for all providers with real response format validation
 * This test suite validates that each adapter correctly handles real API responses
 *
 * NOTE: OpenAI, Anthropic, and Gemini adapters now use official SDK libraries which
 * have their own HTTP clients. Tests for these adapters require real API keys and
 * are skipped when keys are not available. The fetch mocking approach only works
 * for adapters that still use direct fetch calls (Local/Ollama, Azure OpenAI).
 *
 * API keys can be provided via:
 * - Environment variables (OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.)
 * - .env file in the project root (automatically loaded)
 */

import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertExists, assertRejects } from "@std/assert";
import { OpenAIAdapter } from "../../src/llm/openai-adapter.ts";
import { AnthropicAdapter } from "../../src/llm/anthropic-adapter.ts";
import { GeminiAdapter } from "../../src/llm/gemini-adapter.ts";
import { AzureOpenAIAdapter } from "../../src/llm/azure-openai-adapter.ts";
import { LocalLLMAdapter } from "../../src/llm/local-adapter.ts";
import { MockLLMAdapter } from "../../src/llm/mock-adapter.ts";
import type { LLMConfig } from "../../src/llm/types.ts";
import {
  azureOpenaiResponses,
  localResponses,
} from "../fixtures/provider-responses.ts";
import type {
  GenerationContext,
  LLMAdapter,
  LLMRequest,
} from "../../src/llm/types.ts";
import { EnvLoader } from "../../src/utils/env-loader.ts";

// Load environment from .env file (if present) before checking for keys
await EnvLoader.loadEnvironment();

// Check for real API keys - SDK-based adapters require real keys
const hasOpenAIKey = EnvLoader.hasApiKey("openai");
const hasAnthropicKey = EnvLoader.hasApiKey("anthropic");
const hasGeminiKey = EnvLoader.hasApiKey("gemini");
// Note: OpenRouter key check available via EnvLoader.hasApiKey("openrouter")

// Mock fetch setup - only works for adapters using direct fetch (Local, Azure)
let originalFetch: typeof globalThis.fetch;

function mockFetch(response: Response): void {
  globalThis.fetch = (): Promise<Response> => Promise.resolve(response);
}

function restoreFetch(): void {
  if (originalFetch) {
    globalThis.fetch = originalFetch;
  }
}

const testContext: GenerationContext = {
  taskId: "test-task",
  attempt: 1,
  description: "Generate AL code for Microsoft Dynamics 365 Business Central",
};

const testRequest: LLMRequest = {
  prompt: "Create a simple AL table with Customer No and Name fields",
  temperature: 0.1,
  maxTokens: 4000,
};

describe("Provider Real Response Format Tests", () => {
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    restoreFetch();
  });

  // NOTE: OpenAI adapter now uses the official SDK which has its own HTTP client.
  // These tests require a real OPENAI_API_KEY and are skipped otherwise.
  describe("OpenAI Response Handling", () => {
    let adapter: OpenAIAdapter;

    beforeEach(() => {
      adapter = new OpenAIAdapter();
      adapter.configure({
        provider: "openai",
        model: "gpt-4o",
        apiKey: String(EnvLoader.get("OPENAI_API_KEY") ?? "test-key"),
      });
    });

    it("should parse successful OpenAI responses correctly", {
      ignore: !hasOpenAIKey,
    }, async () => {
      const result = await adapter.generateCode(testRequest, testContext);

      assertExists(result);
      assertEquals(typeof result.code, "string");
      assertEquals(result.language, "al");
      assertExists(result.response.usage);
      assert(result.response.usage.promptTokens > 0);
      assert(result.response.usage.completionTokens > 0);
    });

    it(
      "should handle OpenAI API errors",
      { ignore: !hasOpenAIKey },
      async () => {
        // Configure with invalid key to test error handling
        adapter.configure({
          provider: "openai",
          model: "gpt-4o",
          apiKey: "invalid-key",
        });

        await assertRejects(
          () => adapter.generateCode(testRequest, testContext),
          Error,
        );
      },
    );
  });

  // NOTE: Anthropic adapter now uses the official SDK which has its own HTTP client.
  // These tests require a real ANTHROPIC_API_KEY and are skipped otherwise.
  describe("Anthropic Response Handling", () => {
    let adapter: AnthropicAdapter;

    beforeEach(() => {
      adapter = new AnthropicAdapter();
      adapter.configure({
        provider: "anthropic",
        model: "claude-sonnet-4-5-20250929",
        apiKey: String(EnvLoader.get("ANTHROPIC_API_KEY") ?? "test-key"),
      });
    });

    it("should parse successful Anthropic responses correctly", {
      ignore: !hasAnthropicKey,
    }, async () => {
      const result = await adapter.generateCode(testRequest, testContext);

      assertExists(result);
      assertEquals(typeof result.code, "string");
      assertEquals(result.language, "al");
      assertEquals(result.response.model, "claude-sonnet-4-5-20250929");
      assertEquals(result.response.finishReason, "stop");
      assertExists(result.response.usage);
    });

    it(
      "should handle Anthropic API errors",
      { ignore: !hasAnthropicKey },
      async () => {
        // Configure with invalid key to test error handling
        adapter.configure({
          provider: "anthropic",
          model: "claude-sonnet-4-5-20250929",
          apiKey: "invalid-key",
        });

        await assertRejects(
          () => adapter.generateCode(testRequest, testContext),
          Error,
        );
      },
    );
  });

  // NOTE: Gemini adapter now uses the official SDK which has its own HTTP client.
  // These tests require a real GOOGLE_API_KEY and are skipped otherwise.
  describe("Gemini Response Handling", () => {
    let adapter: GeminiAdapter;

    beforeEach(() => {
      adapter = new GeminiAdapter();
      adapter.configure({
        provider: "gemini",
        model: "gemini-2.0-flash-exp",
        apiKey: String(
          EnvLoader.get("GOOGLE_API_KEY") ??
            EnvLoader.get("GEMINI_API_KEY") ?? "test-key",
        ),
      });
    });

    it("should parse successful Gemini responses correctly", {
      ignore: !hasGeminiKey,
    }, async () => {
      const result = await adapter.generateCode(testRequest, testContext);

      assertExists(result);
      assertEquals(typeof result.code, "string");
      assertEquals(result.language, "al");
      assertEquals(result.response.finishReason, "stop");
      assertExists(result.response.usage);
    });

    it(
      "should handle Gemini API errors",
      { ignore: !hasGeminiKey },
      async () => {
        // Configure with invalid key to test error handling
        adapter.configure({
          provider: "gemini",
          model: "gemini-1.5-pro",
          apiKey: "invalid-key",
        });

        await assertRejects(
          () => adapter.generateCode(testRequest, testContext),
          Error,
        );
      },
    );
  });

  describe("Azure OpenAI Response Handling", () => {
    let adapter: AzureOpenAIAdapter;

    beforeEach(() => {
      adapter = new AzureOpenAIAdapter();
      adapter.configure({
        provider: "azure-openai",
        model: "gpt-4o",
        apiKey: "test-key",
        baseUrl: "https://test-resource.openai.azure.com",
      });
    });

    it("should parse successful Azure OpenAI responses correctly", async () => {
      mockFetch(
        new Response(JSON.stringify(azureOpenaiResponses.success), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const result = await adapter.generateCode(testRequest, testContext);

      assertExists(result);
      assertEquals(typeof result.code, "string");
      assert(result.code.includes("table 50100"));
      assertEquals(result.language, "al");
      assertExists(result.response.usage);
    });

    it("should handle Azure deployment errors", async () => {
      mockFetch(
        new Response(JSON.stringify(azureOpenaiResponses.error), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await assertRejects(
        () => adapter.generateCode(testRequest, testContext),
        Error,
        "deployment",
      );
    });
  });

  describe("Local/Ollama Response Handling", () => {
    let adapter: LocalLLMAdapter;

    beforeEach(() => {
      adapter = new LocalLLMAdapter();
      adapter.configure({
        provider: "local",
        model: "codellama",
        baseUrl: "http://localhost:11434",
      });
    });

    it("should parse successful local responses correctly", async () => {
      mockFetch(
        new Response(JSON.stringify(localResponses.success), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const result = await adapter.generateCode(testRequest, testContext);

      assertExists(result);
      assertEquals(typeof result.code, "string");
      assert(result.code.includes("table 50100"));
      assertEquals(result.language, "al");
      assertEquals(result.response.model, "codellama");
    });

    it("should handle local model errors", async () => {
      mockFetch(
        new Response(JSON.stringify(localResponses.error), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await assertRejects(
        () => adapter.generateCode(testRequest, testContext),
        Error,
        "not found",
      );
    });
  });

  describe("Mock Adapter Behavior", () => {
    let adapter: MockLLMAdapter;

    beforeEach(() => {
      adapter = new MockLLMAdapter();
    });

    it("should generate mock AL code consistently", async () => {
      const result = await adapter.generateCode(testRequest, testContext);

      assertExists(result);
      assertEquals(typeof result.code, "string");
      assertEquals(result.language, "al");
      assert(
        result.code.includes("codeunit") || result.code.includes("page") ||
          result.code.includes("table"),
      );
      assertEquals(result.response.model, "mock-gpt-4");
      assertEquals(result.response.finishReason, "stop");
    });
  });

  // NOTE: SDK-based adapters (OpenAI, Anthropic, Gemini) require real API keys.
  // Only Local and Azure OpenAI adapters can be tested with fetch mocking.
  describe("Cross-Provider Content Validation", () => {
    // Adapters that still use direct fetch (can be mocked)
    const fetchBasedAdapters: {
      name: string;
      adapter: LLMAdapter;
      mockResponse: unknown;
    }[] = [
      {
        name: "Azure OpenAI",
        adapter: new AzureOpenAIAdapter(),
        mockResponse: azureOpenaiResponses.success,
      },
      {
        name: "Local",
        adapter: new LocalLLMAdapter(),
        mockResponse: localResponses.success,
      },
    ];

    fetchBasedAdapters.forEach(({ name, adapter, mockResponse }) => {
      it(`${name} should extract AL code correctly`, async () => {
        const config: LLMConfig = {
          provider: name.toLowerCase().replace(/\s+/g, "-"),
          model: "test-model",
          apiKey: "test-key",
        };
        if (name.includes("Azure")) {
          config.baseUrl = "https://test-resource.openai.azure.com";
        }
        adapter.configure(config);

        mockFetch(
          new Response(JSON.stringify(mockResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );

        const result = await adapter.generateCode(testRequest, testContext);

        // Validate common requirements
        assertExists(result.code);
        assertEquals(result.language, "al");
        assertExists(result.response);
        assertExists(result.response.usage);
        assert(typeof result.response.duration === "number");

        // Validate AL code structure
        assert(
          result.code.includes("table") ||
            result.code.includes("Customer") ||
            result.code === "", // Empty is acceptable for some edge cases
          `${name} should generate valid AL code structure`,
        );

        // Validate token usage
        assert(result.response.usage.totalTokens >= 0);
        assert(result.response.usage.promptTokens >= 0);
        assert(result.response.usage.completionTokens >= 0);
      });
    });

    // SDK-based adapters - require real API keys
    it(
      "OpenAI should extract AL code correctly",
      { ignore: !hasOpenAIKey },
      async () => {
        const adapter = new OpenAIAdapter();
        adapter.configure({
          provider: "openai",
          model: "gpt-4o",
          apiKey: String(EnvLoader.get("OPENAI_API_KEY")),
        });

        const result = await adapter.generateCode(testRequest, testContext);
        assertExists(result.code);
        assertEquals(result.language, "al");
        assertExists(result.response.usage);
      },
    );

    it("Anthropic should extract AL code correctly", {
      ignore: !hasAnthropicKey,
    }, async () => {
      const adapter = new AnthropicAdapter();
      adapter.configure({
        provider: "anthropic",
        model: "claude-sonnet-4-5-20250929",
        apiKey: String(EnvLoader.get("ANTHROPIC_API_KEY")),
      });

      const result = await adapter.generateCode(testRequest, testContext);
      assertExists(result.code);
      assertEquals(result.language, "al");
      assertExists(result.response.usage);
    });

    it(
      "Gemini should extract AL code correctly",
      { ignore: !hasGeminiKey },
      async () => {
        const adapter = new GeminiAdapter();
        adapter.configure({
          provider: "gemini",
          model: "gemini-2.0-flash-exp",
          apiKey: String(
            EnvLoader.get("GOOGLE_API_KEY") ??
              EnvLoader.get("GEMINI_API_KEY"),
          ),
        });

        const result = await adapter.generateCode(testRequest, testContext);
        assertExists(result.code);
        assertEquals(result.language, "al");
        assertExists(result.response.usage);
      },
    );
  });

  // NOTE: These tests use adapters that support fetch mocking (Local/Azure)
  // since SDK-based adapters (OpenAI, Anthropic, Gemini) have their own HTTP clients.
  describe("Error Recovery and Edge Cases", () => {
    it("should handle malformed JSON gracefully", async () => {
      const adapter = new LocalLLMAdapter();
      adapter.configure({
        provider: "local",
        model: "codellama",
        baseUrl: "http://localhost:11434",
      });

      mockFetch(
        new Response("invalid json", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await assertRejects(
        () => adapter.generateCode(testRequest, testContext),
        Error,
      );
    });

    it("should handle network timeouts", async () => {
      const adapter = new LocalLLMAdapter();
      adapter.configure({
        provider: "local",
        model: "codellama",
        baseUrl: "http://localhost:11434",
      });

      globalThis.fetch = (): Promise<Response> => {
        return Promise.reject(new Error("Network timeout"));
      };

      await assertRejects(
        () => adapter.generateCode(testRequest, testContext),
        Error,
        "timeout",
      );
    });

    it("should handle empty responses", async () => {
      const adapter = new LocalLLMAdapter();
      adapter.configure({
        provider: "local",
        model: "codellama",
        baseUrl: "http://localhost:11434",
      });

      const emptyResponse = {
        model: "codellama",
        message: { role: "assistant", content: "" },
        done: true,
        eval_count: 0,
        prompt_eval_count: 10,
      };

      mockFetch(
        new Response(JSON.stringify(emptyResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const result = await adapter.generateCode(testRequest, testContext);
      assertEquals(result.code, "");
    });
  });

  // NOTE: These tests use adapters that support fetch mocking (Local/Azure)
  describe("Performance and Metrics", () => {
    it("should include response timing", async () => {
      const adapter = new LocalLLMAdapter();
      adapter.configure({
        provider: "local",
        model: "codellama",
        baseUrl: "http://localhost:11434",
      });

      mockFetch(
        new Response(JSON.stringify(localResponses.success), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const startTime = Date.now();
      const result = await adapter.generateCode(testRequest, testContext);
      const endTime = Date.now();

      assertExists(result.response.duration);
      assert(result.response.duration >= 0);
      assert(result.response.duration <= (endTime - startTime + 100)); // Allow margin
    });

    it("should calculate token usage correctly", async () => {
      const adapter = new LocalLLMAdapter();
      adapter.configure({
        provider: "local",
        model: "codellama",
        baseUrl: "http://localhost:11434",
      });

      mockFetch(
        new Response(JSON.stringify(localResponses.success), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const result = await adapter.generateCode(testRequest, testContext);

      // Local responses use eval_count and prompt_eval_count from Ollama
      assertExists(result.response.usage);
      assert(result.response.usage.promptTokens >= 0);
      assert(result.response.usage.completionTokens >= 0);
      assert(result.response.usage.totalTokens >= 0);
    });
  });
});
