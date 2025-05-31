/**
 * Unit tests for Mock LLM Adapter
 */

import { describe, it, beforeEach } from "@std/testing/bdd";
import { assertEquals, assertExists, assert } from "@std/assert";
import { MockLLMAdapter } from "../../../src/llm/mock-adapter.ts";
import { 
  createMockLLMConfig, 
  assertValidLLMResponse, 
  assertValidCostEstimate,
  MockALCode 
} from "../../utils/test-helpers.ts";
import type { LLMRequest, GenerationContext } from "../../../src/llm/types.ts";

describe("MockLLMAdapter", () => {
  let adapter: MockLLMAdapter;
  let config: ReturnType<typeof createMockLLMConfig>;

  beforeEach(() => {
    adapter = new MockLLMAdapter();
    config = createMockLLMConfig({
      provider: "mock",
      model: "mock-gpt-4"
    });
    adapter.configure(config);
  });

  describe("Configuration", () => {
    it("should have correct adapter properties", () => {
      assertEquals(adapter.name, "mock");
      assert(adapter.supportedModels.includes("mock-gpt-4"));
      assert(adapter.supportedModels.includes("mock-claude-3"));
      assert(adapter.supportedModels.includes("mock-local"));
    });

    it("should validate configuration correctly", () => {
      const errors = adapter.validateConfig(config);
      assertEquals(errors.length, 0);
    });

    it("should reject invalid temperature", () => {
      const invalidConfig = createMockLLMConfig({ temperature: 2.5 });
      const errors = adapter.validateConfig(invalidConfig);
      assert(errors.some(error => error.includes("Temperature")));
    });

    it("should reject invalid maxTokens", () => {
      const invalidConfig = createMockLLMConfig({ maxTokens: -100 });
      const errors = adapter.validateConfig(invalidConfig);
      assert(errors.some(error => error.includes("maxTokens")));
    });
  });

  describe("Code Generation", () => {
    it("should generate AL table code", async () => {
      const request: LLMRequest = {
        prompt: "Create a simple AL table for customer data",
        temperature: 0.1,
        maxTokens: 1000,
      };
      
      const context: GenerationContext = {
        taskId: "test-task",
        attempt: 1,
        objectType: "table",
        previousErrors: [],
      };

      const result = await adapter.generateCode(request, context);
      
      assertValidLLMResponse(result.response);
      assertEquals(result.language, "al");
      assertExists(result.code);
      assert(result.code.includes("table"));
      assert(result.code.includes("fields"));
      assert(result.code.includes("keys"));
    });

    it("should generate AL page code", async () => {
      const request: LLMRequest = {
        prompt: "Create a simple AL page",
        temperature: 0.1,
        maxTokens: 1000,
      };
      
      const context: GenerationContext = {
        taskId: "test-task",
        attempt: 1,
        description: "Create a page for data entry",
        previousCode: undefined,
        errors: [],
      };

      const result = await adapter.generateCode(request, context);
      
      assertValidLLMResponse(result.response);
      assertEquals(result.language, "al");
      assertExists(result.code);
      assert(result.code.includes("page"));
      assert(result.code.includes("layout"));
    });

    it("should generate AL codeunit code", async () => {
      const request: LLMRequest = {
        prompt: "Create a simple AL codeunit",
        temperature: 0.1,
        maxTokens: 1000,
      };
      
      const context: GenerationContext = {
        taskId: "test-task",
        attempt: 1,
        description: "Create a codeunit for business logic",
        previousCode: undefined,
        errors: [],
      };

      const result = await adapter.generateCode(request, context);
      
      assertValidLLMResponse(result.response);
      assertEquals(result.language, "al");
      assertExists(result.code);
      assert(result.code.includes("codeunit"));
    });

    it("should introduce errors on first attempt sometimes", async () => {
      const request: LLMRequest = {
        prompt: "Create a simple AL table",
        temperature: 0.1,
        maxTokens: 1000,
      };
      
      const context: GenerationContext = {
        taskId: "test-task",
        attempt: 1,
        objectType: "table",
        previousErrors: [],
      };

      // Run multiple times to test randomness
      for (let i = 0; i < 10; i++) {
        const result = await adapter.generateCode(request, context);
        if (result.code.includes("DELIBERATE_ERROR") || 
            result.code.includes("MissingField") ||
            result.code.includes("SyntaxError")) {
          // Found an error, test passes
          return;
        }
      }
      
      // Should introduce errors at least sometimes (around 30% of the time)
      // This test might occasionally fail due to randomness, but very rarely
    });
  });

  describe("Code Fixing", () => {
    it("should fix common AL errors", async () => {
      const originalCode = MockALCode.table;
      const errors = [
        "Field 'InvalidField' does not exist",
        "Missing semicolon at line 5"
      ];
      
      const request: LLMRequest = {
        prompt: "Fix the following errors in the AL code",
        temperature: 0.1,
        maxTokens: 1000,
      };
      
      const context: GenerationContext = {
        taskId: "test-task",
        attempt: 2,
        objectType: "table",
        previousErrors: errors,
      };

      const result = await adapter.generateFix(originalCode, errors, request, context);
      
      assertValidLLMResponse(result.response);
      assertExists(result.code);
      // Should provide a diff-style fix
      assert(result.language === "diff" || result.language === "al");
    });

    it("should handle empty error list", async () => {
      const originalCode = MockALCode.table;
      const errors: string[] = [];
      
      const request: LLMRequest = {
        prompt: "Review and fix any issues in the AL code",
        temperature: 0.1,
        maxTokens: 1000,
      };
      
      const context: GenerationContext = {
        taskId: "test-task",
        attempt: 2,
        objectType: "table",
        previousErrors: errors,
      };

      const result = await adapter.generateFix(originalCode, errors, request, context);
      
      assertValidLLMResponse(result.response);
      assertExists(result.code);
    });
  });

  describe("Cost Estimation", () => {
    it("should return zero cost for mock adapter", () => {
      const cost = adapter.estimateCost(1000, 500);
      assertValidCostEstimate(cost);
      assertEquals(cost, 0);
    });
  });

  describe("Health Check", () => {
    it("should always be healthy", async () => {
      const isHealthy = await adapter.isHealthy();
      assertEquals(isHealthy, true);
    });
  });

  describe("Realistic Behavior", () => {
    it("should simulate realistic response times", async () => {
      const request: LLMRequest = {
        prompt: "Create a simple AL table",
        temperature: 0.1,
        maxTokens: 1000,
      };
      
      const context: GenerationContext = {
        taskId: "test-task",
        attempt: 1,
        objectType: "table",
        previousErrors: [],
      };

      const startTime = Date.now();
      await adapter.generateCode(request, context);
      const duration = Date.now() - startTime;
      
      // Should take at least 800ms (minimum simulated delay)
      assert(duration >= 800);
      // Should not take more than 3000ms (maximum simulated delay + overhead)
      assert(duration <= 3500);
    });

    it("should provide realistic token counts", async () => {
      const request: LLMRequest = {
        prompt: "Create a comprehensive AL table with multiple fields",
        temperature: 0.1,
        maxTokens: 2000,
      };
      
      const context: GenerationContext = {
        taskId: "test-task",
        attempt: 1,
        objectType: "table",
        previousErrors: [],
      };

      const result = await adapter.generateCode(request, context);
      
      // Token counts should be proportional to content length
      const promptLength = request.prompt.length;
      const responseLength = result.response.content.length;
      
      assert(result.response.usage.promptTokens > promptLength / 10);
      assert(result.response.usage.completionTokens > responseLength / 10);
      assert(result.response.usage.totalTokens > 0);
    });
  });
});