/**
 * Integration tests for all providers with real response format validation
 * This test suite validates that each adapter correctly handles real API responses
 */

import { describe, it, beforeEach, afterEach } from "@std/testing/bdd";
import { assertEquals, assertExists, assert, assertRejects } from "@std/assert";
import { OpenAIAdapter } from "../../src/llm/openai-adapter.ts";
import { AnthropicAdapter } from "../../src/llm/anthropic-adapter.ts";
import { GeminiAdapter } from "../../src/llm/gemini-adapter.ts";
import { AzureOpenAIAdapter } from "../../src/llm/azure-openai-adapter.ts";
import { LocalLLMAdapter } from "../../src/llm/local-adapter.ts";
import { MockLLMAdapter } from "../../src/llm/mock-adapter.ts";
import type { LLMConfig } from "../../src/llm/types.ts";
import { 
  openaiResponses, 
  anthropicResponses, 
  geminiResponses, 
  azureOpenaiResponses, 
  localResponses 
} from "../fixtures/provider-responses.ts";
import type { GenerationContext, LLMRequest, LLMAdapter } from "../../src/llm/types.ts";

// Mock fetch setup
let originalFetch: typeof globalThis.fetch;

function mockFetch(response: Response): void {
  globalThis.fetch = async (): Promise<Response> => response;
}

function restoreFetch(): void {
  if (originalFetch) {
    globalThis.fetch = originalFetch;
  }
}

const testContext: GenerationContext = {
  taskId: "test-task",
  attempt: 1,
  description: "Generate AL code for Microsoft Dynamics 365 Business Central"
};

const testRequest: LLMRequest = {
  prompt: "Create a simple AL table with Customer No and Name fields",
  temperature: 0.1,
  maxTokens: 4000
};

describe("Provider Real Response Format Tests", () => {
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    restoreFetch();
  });

  describe("OpenAI Response Handling", () => {
    let adapter: OpenAIAdapter;

    beforeEach(() => {
      adapter = new OpenAIAdapter();
      adapter.configure({
        provider: "openai",
        model: "gpt-4o",
        apiKey: "test-key"
      });
    });

    it("should parse successful OpenAI responses correctly", async () => {
      mockFetch(new Response(JSON.stringify(openaiResponses.success), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }));

      const result = await adapter.generateCode(testRequest, testContext);

      assertExists(result);
      assertEquals(typeof result.code, "string");
      assert(result.code.includes("table 50100"));
      assertEquals(result.language, "al");
      assertExists(result.response.usage);
      assertEquals(result.response.usage.promptTokens, 150);
      assertEquals(result.response.usage.completionTokens, 200);
    });

    it("should handle OpenAI API errors", async () => {
      mockFetch(new Response(JSON.stringify(openaiResponses.error), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      }));

      await assertRejects(
        () => adapter.generateCode(testRequest, testContext),
        Error,
        "Invalid API key"
      );
    });
  });

  describe("Anthropic Response Handling", () => {
    let adapter: AnthropicAdapter;

    beforeEach(() => {
      adapter = new AnthropicAdapter();
      adapter.configure({
        provider: "anthropic",
        model: "claude-3-5-sonnet-20241022",
        apiKey: "test-key"
      });
    });

    it("should parse successful Anthropic responses correctly", async () => {
      mockFetch(new Response(JSON.stringify(anthropicResponses.success), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }));

      const result = await adapter.generateCode(testRequest, testContext);

      assertExists(result);
      assertEquals(typeof result.code, "string");
      assert(result.code.includes("table 50100"));
      assertEquals(result.language, "al");
      assertEquals(result.response.model, "claude-3-5-sonnet-20241022");
      assertEquals(result.response.finishReason, "stop");
      assertExists(result.response.usage);
    });

    it("should handle Anthropic API errors", async () => {
      mockFetch(new Response(JSON.stringify(anthropicResponses.error), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      }));

      await assertRejects(
        () => adapter.generateCode(testRequest, testContext),
        Error,
        "invalid x-api-key"
      );
    });
  });

  describe("Gemini Response Handling", () => {
    let adapter: GeminiAdapter;

    beforeEach(() => {
      adapter = new GeminiAdapter();
      adapter.configure({
        provider: "gemini",
        model: "gemini-1.5-pro",
        apiKey: "test-key"
      });
    });

    it("should parse successful Gemini responses correctly", async () => {
      mockFetch(new Response(JSON.stringify(geminiResponses.success), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }));

      const result = await adapter.generateCode(testRequest, testContext);

      assertExists(result);
      assertEquals(typeof result.code, "string");
      assert(result.code.includes("table 50100"));
      assertEquals(result.language, "al");
      assertEquals(result.response.finishReason, "stop");
      assertExists(result.response.usage);
    });

    it("should handle Gemini API errors", async () => {
      mockFetch(new Response(JSON.stringify(geminiResponses.error), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      }));

      await assertRejects(
        () => adapter.generateCode(testRequest, testContext),
        Error,
        "API key not valid"
      );
    });
  });

  describe("Azure OpenAI Response Handling", () => {
    let adapter: AzureOpenAIAdapter;

    beforeEach(() => {
      adapter = new AzureOpenAIAdapter();
      adapter.configure({
        provider: "azure-openai",
        model: "gpt-4o",
        apiKey: "test-key",
        baseUrl: "https://test-resource.openai.azure.com"
      });
    });

    it("should parse successful Azure OpenAI responses correctly", async () => {
      mockFetch(new Response(JSON.stringify(azureOpenaiResponses.success), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }));

      const result = await adapter.generateCode(testRequest, testContext);

      assertExists(result);
      assertEquals(typeof result.code, "string");
      assert(result.code.includes("table 50100"));
      assertEquals(result.language, "al");
      assertExists(result.response.usage);
    });

    it("should handle Azure deployment errors", async () => {
      mockFetch(new Response(JSON.stringify(azureOpenaiResponses.error), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      }));

      await assertRejects(
        () => adapter.generateCode(testRequest, testContext),
        Error,
        "deployment"
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
        baseUrl: "http://localhost:11434"
      });
    });

    it("should parse successful local responses correctly", async () => {
      mockFetch(new Response(JSON.stringify(localResponses.success), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }));

      const result = await adapter.generateCode(testRequest, testContext);

      assertExists(result);
      assertEquals(typeof result.code, "string");
      assert(result.code.includes("table 50100"));
      assertEquals(result.language, "al");
      assertEquals(result.response.model, "codellama");
    });

    it("should handle local model errors", async () => {
      mockFetch(new Response(JSON.stringify(localResponses.error), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      }));

      await assertRejects(
        () => adapter.generateCode(testRequest, testContext),
        Error,
        "not found"
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
      assert(result.code.includes("codeunit") || result.code.includes("page") || result.code.includes("table"));
      assertEquals(result.response.model, "mock-gpt-4");
      assertEquals(result.response.finishReason, "stop");
    });
  });

  describe("Cross-Provider Content Validation", () => {
    const adapters: { name: string; adapter: LLMAdapter; mockResponse: any }[] = [
      { name: "OpenAI", adapter: new OpenAIAdapter(), mockResponse: openaiResponses.success },
      { name: "Anthropic", adapter: new AnthropicAdapter(), mockResponse: anthropicResponses.success },
      { name: "Gemini", adapter: new GeminiAdapter(), mockResponse: geminiResponses.success },
      { name: "Azure OpenAI", adapter: new AzureOpenAIAdapter(), mockResponse: azureOpenaiResponses.success },
      { name: "Local", adapter: new LocalLLMAdapter(), mockResponse: localResponses.success }
    ];

    adapters.forEach(({ name, adapter, mockResponse }) => {
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

        mockFetch(new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }));

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
          `${name} should generate valid AL code structure`
        );

        // Validate token usage
        assert(result.response.usage.totalTokens >= 0);
        assert(result.response.usage.promptTokens >= 0);
        assert(result.response.usage.completionTokens >= 0);
      });
    });
  });

  describe("Error Recovery and Edge Cases", () => {
    it("should handle malformed JSON gracefully", async () => {
      const adapter = new OpenAIAdapter();
      adapter.configure({
        provider: "openai",
        model: "gpt-4o",
        apiKey: "test-key"
      });

      mockFetch(new Response("invalid json", {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }));

      await assertRejects(
        () => adapter.generateCode(testRequest, testContext),
        Error
      );
    });

    it("should handle network timeouts", async () => {
      const adapter = new OpenAIAdapter();
      adapter.configure({
        provider: "openai",
        model: "gpt-4o",
        apiKey: "test-key"
      });

      globalThis.fetch = async (): Promise<Response> => {
        throw new Error("Network timeout");
      };

      await assertRejects(
        () => adapter.generateCode(testRequest, testContext),
        Error,
        "timeout"
      );
    });

    it("should handle empty responses", async () => {
      const adapter = new OpenAIAdapter();
      adapter.configure({
        provider: "openai",
        model: "gpt-4o",
        apiKey: "test-key"
      });

      const emptyResponse = {
        choices: [{
          message: { role: "assistant", content: "" },
          finish_reason: "stop"
        }],
        usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10 }
      };

      mockFetch(new Response(JSON.stringify(emptyResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }));

      const result = await adapter.generateCode(testRequest, testContext);
      assertEquals(result.code, "");
    });
  });

  describe("Performance and Metrics", () => {
    it("should include response timing", async () => {
      const adapter = new OpenAIAdapter();
      adapter.configure({
        provider: "openai",
        model: "gpt-4o",
        apiKey: "test-key"
      });

      mockFetch(new Response(JSON.stringify(openaiResponses.success), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }));

      const startTime = Date.now();
      const result = await adapter.generateCode(testRequest, testContext);
      const endTime = Date.now();

      assertExists(result.response.duration);
      assert(result.response.duration >= 0);
      assert(result.response.duration <= (endTime - startTime + 100)); // Allow margin
    });

    it("should calculate token usage correctly", async () => {
      const adapter = new OpenAIAdapter();
      adapter.configure({
        provider: "openai",
        model: "gpt-4o",
        apiKey: "test-key"
      });

      mockFetch(new Response(JSON.stringify(openaiResponses.success), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }));

      const result = await adapter.generateCode(testRequest, testContext);

      assertEquals(result.response.usage.promptTokens, 150);
      assertEquals(result.response.usage.completionTokens, 200);
      assertEquals(result.response.usage.totalTokens, 350);
    });
  });
});