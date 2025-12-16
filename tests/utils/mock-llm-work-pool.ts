/**
 * Mock LLM Work Pool for testing orchestration without real LLM calls
 *
 * This mock implements the LLMWorkPool interface with configurable
 * responses, allowing unit tests to verify orchestrator behavior
 * without making actual API calls.
 */

import type { LLMWorkItem, LLMWorkResult } from "../../src/parallel/types.ts";
import { createMockLLMResponse, MockALCode } from "./test-helpers.ts";

/**
 * Configuration for mock LLM work result
 */
export interface MockLLMWorkResultConfig {
  success?: boolean;
  code?: string;
  error?: string;
  duration?: number;
  readyForCompile?: boolean;
}

/**
 * Records a method call for verification
 */
export interface LLMPoolMethodCall {
  method: string;
  args: unknown[];
  timestamp: number;
}

/**
 * Configurable mock implementation of LLMWorkPool
 */
export class MockLLMWorkPool {
  private calls: LLMPoolMethodCall[] = [];
  private shuttingDown = false;
  private _activeCount = 0;

  // Default result configuration
  private defaultResultConfig: MockLLMWorkResultConfig = { success: true };

  // Per-model result overrides (model name -> config)
  private modelOverrides = new Map<string, MockLLMWorkResultConfig>();

  // Per-task result overrides (task ID -> config)
  private taskOverrides = new Map<string, MockLLMWorkResultConfig>();

  /**
   * Configure default result behavior
   */
  setDefaultResult(config: MockLLMWorkResultConfig): this {
    this.defaultResultConfig = config;
    return this;
  }

  /**
   * Configure result for a specific model
   */
  setResultForModel(model: string, config: MockLLMWorkResultConfig): this {
    this.modelOverrides.set(model, config);
    return this;
  }

  /**
   * Configure result for a specific task
   */
  setResultForTask(taskId: string, config: MockLLMWorkResultConfig): this {
    this.taskOverrides.set(taskId, config);
    return this;
  }

  /**
   * Get all recorded method calls
   */
  getCalls(): LLMPoolMethodCall[] {
    return [...this.calls];
  }

  /**
   * Get calls for a specific method
   */
  getCallsFor(method: string): LLMPoolMethodCall[] {
    return this.calls.filter((c) => c.method === method);
  }

  /**
   * Check if a method was called
   */
  wasCalled(method: string): boolean {
    return this.calls.some((c) => c.method === method);
  }

  /**
   * Get count of calls for a method
   */
  getCallCount(method?: string): number {
    if (!method) return this.calls.length;
    return this.calls.filter((c) => c.method === method).length;
  }

  /**
   * Assert a method was called
   */
  assertCalled(method: string): void {
    if (!this.wasCalled(method)) {
      throw new Error(
        `Expected method "${method}" to be called, but it was not.\n` +
          `Actual calls: ${this.calls.map((c) => c.method).join(", ")}`,
      );
    }
  }

  /**
   * Clear all recorded calls
   */
  clearCalls(): this {
    this.calls = [];
    return this;
  }

  /**
   * Reset all configuration and calls
   */
  reset(): void {
    this.calls = [];
    this.modelOverrides.clear();
    this.taskOverrides.clear();
    this.defaultResultConfig = { success: true };
    this.shuttingDown = false;
    this._activeCount = 0;
  }

  // ==================== LLMWorkPool Implementation ====================

  private recordCall(method: string, ...args: unknown[]): void {
    this.calls.push({
      method,
      args,
      timestamp: Date.now(),
    });
  }

  /**
   * Get result config for a work item (with priority: task > model > default)
   */
  private getConfigForItem(item: LLMWorkItem): MockLLMWorkResultConfig {
    const taskConfig = this.taskOverrides.get(item.taskManifest.id);
    if (taskConfig) return taskConfig;

    const modelConfig = this.modelOverrides.get(item.llmModel);
    if (modelConfig) return modelConfig;

    return this.defaultResultConfig;
  }

  /**
   * Create a mock result from configuration
   */
  private createResult(
    item: LLMWorkItem,
    config: MockLLMWorkResultConfig,
  ): LLMWorkResult {
    const success = config.success ?? true;
    const result: LLMWorkResult = {
      workItemId: item.id,
      success,
      duration: config.duration ?? 1000,
      readyForCompile: config.readyForCompile ?? success,
    };
    if (success) {
      result.code = config.code ?? MockALCode.codeunit;
      result.llmResponse = createMockLLMResponse({
        content: `\`\`\`al\n${result.code}\n\`\`\``,
        model: item.llmModel,
      });
    } else {
      result.error = config.error ?? "Mock LLM error";
    }
    return result;
  }

  /**
   * Submit a single work item
   */
  async submit(item: LLMWorkItem): Promise<LLMWorkResult> {
    this.recordCall("submit", item);

    if (this.shuttingDown) {
      throw new Error("Work pool is shutting down");
    }

    this._activeCount++;

    try {
      const config = this.getConfigForItem(item);
      // Simulate async behavior for proper interface compliance
      await Promise.resolve();
      return this.createResult(item, config);
    } finally {
      this._activeCount--;
    }
  }

  /**
   * Submit a batch of work items (all models for one task)
   * Returns a map of model -> result
   */
  async submitBatch(items: LLMWorkItem[]): Promise<Map<string, LLMWorkResult>> {
    this.recordCall("submitBatch", items);

    if (this.shuttingDown) {
      throw new Error("Work pool is shutting down");
    }

    const results = new Map<string, LLMWorkResult>();

    for (const item of items) {
      try {
        const result = await this.submit(item);
        results.set(item.llmModel, result);
      } catch (error) {
        results.set(item.llmModel, {
          workItemId: item.id,
          success: false,
          error: error instanceof Error ? error.message : String(error),
          duration: 0,
          readyForCompile: false,
        });
      }
    }

    return results;
  }

  /**
   * Get current active request count
   */
  get activeCount(): number {
    return this._activeCount;
  }

  /**
   * Check if pool is idle
   */
  get isIdle(): boolean {
    return this._activeCount === 0;
  }

  /**
   * Graceful shutdown - wait for active requests to complete
   */
  async drain(): Promise<void> {
    this.recordCall("drain");
    this.shuttingDown = true;

    // For mock, we just return immediately since there are no real requests
    await Promise.resolve();
  }
}

/**
 * Create a new MockLLMWorkPool instance
 */
export function createMockLLMWorkPool(): MockLLMWorkPool {
  return new MockLLMWorkPool();
}

/**
 * Create a mock LLM work result
 */
export function createMockLLMWorkResult(
  overrides?: Partial<LLMWorkResult>,
): LLMWorkResult {
  const success = overrides?.success ?? true;
  const result: LLMWorkResult = {
    workItemId: overrides?.workItemId ?? `mock-work-${Date.now()}`,
    success,
    duration: overrides?.duration ?? 1000,
    readyForCompile: overrides?.readyForCompile ?? success,
  };
  if (success) {
    result.code = overrides?.code ?? MockALCode.codeunit;
    result.llmResponse = overrides?.llmResponse ?? createMockLLMResponse();
  } else {
    result.error = overrides?.error ?? "Mock error";
  }
  return result;
}
