/**
 * Test utilities and helpers for CentralGauge testing
 */

import { assertEquals, assertExists, assertRejects } from "@std/assert";
import type { LLMConfig, LLMResponse } from "../../src/llm/types.ts";
import type { ALProject } from "../../src/container/types.ts";

/**
 * Create a mock LLM config for testing
 */
export function createMockLLMConfig(overrides?: Partial<LLMConfig>): LLMConfig {
  return {
    provider: "mock",
    model: "mock-gpt-4",
    apiKey: "test-key",
    temperature: 0.1,
    maxTokens: 1000,
    timeout: 5000,
    ...overrides,
  };
}

/**
 * Create a mock LLM response for testing
 */
export function createMockLLMResponse(
  overrides?: Partial<LLMResponse>,
): LLMResponse {
  return {
    content: "Mock response content",
    usage: {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    },
    finishReason: "stop",
    model: "mock-gpt-4",
    duration: 1000,
    ...overrides,
  };
}

/**
 * Create a mock AL project for testing
 */
export function createMockALProject(overrides?: Partial<ALProject>): ALProject {
  return {
    path: "/tmp/test-project",
    appJson: {
      id: "test-app-id",
      name: "Test App",
      publisher: "Test Publisher",
      version: "1.0.0.0",
      platform: "1.0.0.0",
      runtime: "11.0",
    },
    sourceFiles: [],
    testFiles: [],
    ...overrides,
  };
}

/**
 * Assert that an LLM response has valid structure
 */
export function assertValidLLMResponse(response: LLMResponse): void {
  assertExists(response.content, "Response should have content");
  assertExists(response.usage, "Response should have usage information");
  assertExists(response.usage.promptTokens, "Usage should have prompt tokens");
  assertExists(
    response.usage.completionTokens,
    "Usage should have completion tokens",
  );
  assertExists(response.usage.totalTokens, "Usage should have total tokens");
  assertEquals(
    response.usage.totalTokens,
    response.usage.promptTokens + response.usage.completionTokens,
    "Total tokens should equal prompt + completion tokens",
  );
}

/**
 * Assert that a cost estimate is reasonable (non-negative number)
 */
export function assertValidCostEstimate(cost: number): void {
  assertEquals(typeof cost, "number", "Cost should be a number");
  assertEquals(cost >= 0, true, "Cost should be non-negative");
  assertEquals(Number.isFinite(cost), true, "Cost should be finite");
}

/**
 * Create a temporary directory for testing
 */
export async function createTempDir(
  prefix = "centralgauge-test",
): Promise<string> {
  return await Deno.makeTempDir({ prefix });
}

/**
 * Clean up a temporary directory
 */
export async function cleanupTempDir(path: string): Promise<void> {
  try {
    await Deno.remove(path, { recursive: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Wait for a specified amount of time (for testing timing)
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Assert that a function throws an error with a specific message
 */
export async function assertThrowsWithMessage(
  fn: () => Promise<unknown> | unknown,
  expectedMessage: string,
  msg?: string,
): Promise<void> {
  await assertRejects(
    async () => {
      await fn();
    },
    Error,
    expectedMessage,
    msg,
  );
}

/**
 * Mock environment variable for testing
 */
export class MockEnv {
  private originalValues = new Map<string, string | undefined>();

  set(key: string, value: string): void {
    if (!this.originalValues.has(key)) {
      this.originalValues.set(key, Deno.env.get(key));
    }
    Deno.env.set(key, value);
  }

  delete(key: string): void {
    if (!this.originalValues.has(key)) {
      this.originalValues.set(key, Deno.env.get(key));
    }
    Deno.env.delete(key);
  }

  restore(): void {
    for (const [key, value] of this.originalValues) {
      if (value === undefined) {
        Deno.env.delete(key);
      } else {
        Deno.env.set(key, value);
      }
    }
    this.originalValues.clear();
  }
}

/**
 * Generate realistic AL code for testing
 */
export const MockALCode = {
  table: `table 50100 "Test Table"
{
    DataClassification = ToBeClassified;
    
    fields
    {
        field(1; "No."; Code[20])
        {
            DataClassification = ToBeClassified;
        }
        field(2; "Name"; Text[100])
        {
            DataClassification = ToBeClassified;
        }
    }
    
    keys
    {
        key(PK; "No.")
        {
            Clustered = true;
        }
    }
}`,

  page: `page 50100 "Test Page"
{
    PageType = Card;
    ApplicationArea = All;
    UsageCategory = Administration;
    SourceTable = "Test Table";
    
    layout
    {
        area(Content)
        {
            group(GroupName)
            {
                field("No."; Rec."No.")
                {
                    ApplicationArea = All;
                }
                field("Name"; Rec."Name")
                {
                    ApplicationArea = All;
                }
            }
        }
    }
}`,

  codeunit: `codeunit 50100 "Test Codeunit"
{
    trigger OnRun()
    begin
        Message('Hello World');
    end;
    
    procedure CalculateTotal(Amount: Decimal; VAT: Decimal): Decimal
    begin
        exit(Amount + (Amount * VAT / 100));
    end;
}`,
};
