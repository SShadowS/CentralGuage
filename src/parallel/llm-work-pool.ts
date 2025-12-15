/**
 * Work pool for parallel LLM calls
 * Manages concurrent requests while respecting rate limits
 */

import type {
  LLMWorkItem,
  LLMWorkResult,
  ParallelExecutionConfig,
} from "./types.ts";
import type {
  GenerationContext,
  LLMAdapter,
  LLMRequest,
  LLMResponse,
} from "../llm/types.ts";
import { getGlobalRateLimiter, ProviderRateLimiter } from "./rate-limiter.ts";
import { LLMAdapterRegistry } from "../llm/registry.ts";
import { CodeExtractor } from "../llm/code-extractor.ts";

/**
 * Work pool for managing parallel LLM requests
 */
export class LLMWorkPool {
  private rateLimiter: ProviderRateLimiter;
  private config: ParallelExecutionConfig;
  private activeRequests = 0;
  private shuttingDown = false;

  constructor(
    config: ParallelExecutionConfig,
    rateLimiter?: ProviderRateLimiter,
  ) {
    this.config = config;
    this.rateLimiter = rateLimiter ?? getGlobalRateLimiter();
  }

  /**
   * Submit a single work item
   */
  async submit(item: LLMWorkItem): Promise<LLMWorkResult> {
    if (this.shuttingDown) {
      throw new Error("Work pool is shutting down");
    }

    // Wait for global concurrency slot
    while (this.activeRequests >= this.config.maxGlobalConcurrency) {
      await this.delay(50);
    }

    this.activeRequests++;

    try {
      return await this.executeWork(item);
    } finally {
      this.activeRequests--;
    }
  }

  /**
   * Submit a batch of work items (all models for one task)
   * Returns a map of model -> result
   */
  async submitBatch(items: LLMWorkItem[]): Promise<Map<string, LLMWorkResult>> {
    if (this.shuttingDown) {
      throw new Error("Work pool is shutting down");
    }

    const results = new Map<string, LLMWorkResult>();

    // Execute all items in parallel
    const promises = items.map(async (item) => {
      try {
        const result = await this.submit(item);
        results.set(item.llmModel, result);
      } catch (error) {
        // Record failure but don't throw
        results.set(item.llmModel, {
          workItemId: item.id,
          success: false,
          error: error instanceof Error ? error.message : String(error),
          duration: 0,
          readyForCompile: false,
        });
      }
    });

    await Promise.allSettled(promises);
    return results;
  }

  /**
   * Execute a single work item with rate limiting
   */
  private async executeWork(item: LLMWorkItem): Promise<LLMWorkResult> {
    const startTime = Date.now();

    // Acquire rate limit lease
    const lease = await this.rateLimiter.acquire(
      item.llmProvider,
      item.context.metadata.estimatedTokens,
    );

    try {
      // Get or create LLM adapter
      const adapter = this.getAdapter(item);

      // Generate code
      const llmResponse = await this.generateCode(item, adapter);

      // Extract code from response
      const extracted = CodeExtractor.extract(llmResponse.content);

      // Release lease with actual token count
      this.rateLimiter.release(lease, llmResponse.usage.totalTokens);

      return {
        workItemId: item.id,
        success: true,
        code: extracted.code,
        llmResponse,
        duration: Date.now() - startTime,
        readyForCompile: extracted.confidence > 0.5,
      };
    } catch (error) {
      // Update rate limiter on error
      if (this.isRateLimitError(error)) {
        const retryAfter = this.extractRetryAfter(error);
        this.rateLimiter.updateFromError(item.llmProvider, retryAfter, true);
      }

      this.rateLimiter.release(lease);

      // Retry once if it's a transient error
      if (this.isTransientError(error) && item.attemptNumber <= 2) {
        await this.delay(1000 * item.attemptNumber);
        return this.executeWork(item);
      }

      return {
        workItemId: item.id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        readyForCompile: false,
      };
    }
  }

  /**
   * Get or create LLM adapter for work item
   */
  private getAdapter(item: LLMWorkItem): LLMAdapter {
    return LLMAdapterRegistry.create(item.llmProvider, {
      provider: item.llmProvider,
      model: item.llmModel,
      temperature: item.context.temperature,
      maxTokens: item.context.maxTokens,
    });
  }

  /**
   * Generate code using the LLM adapter
   */
  private async generateCode(
    item: LLMWorkItem,
    adapter: LLMAdapter,
  ): Promise<LLMResponse> {
    const context: GenerationContext = {
      taskId: item.taskManifest.id,
      attempt: item.attemptNumber,
      description: item.taskManifest.description,
    };

    // Add previous attempt data if available
    if (item.previousAttempts.length > 0) {
      const lastAttempt =
        item.previousAttempts[item.previousAttempts.length - 1];
      if (lastAttempt) {
        context.previousCode = lastAttempt.extractedCode;
        context.errors = lastAttempt.failureReasons;
      }
    }

    const request: LLMRequest = {
      prompt: item.context.instructions,
      temperature: item.context.temperature,
      maxTokens: item.context.maxTokens,
    };

    // First attempt uses generateCode, retries use generateFix
    const previousAttempt =
      item.previousAttempts[item.previousAttempts.length - 1];
    if (item.attemptNumber === 1 || !previousAttempt) {
      const result = await adapter.generateCode(request, context);
      return result.response;
    } else {
      const errors = this.extractErrors(previousAttempt);
      const result = await adapter.generateFix(
        previousAttempt.extractedCode,
        errors,
        request,
        context,
      );
      return result.response;
    }
  }

  /**
   * Extract error messages from a previous attempt
   */
  private extractErrors(
    attempt: {
      compilationResult?: { errors: Array<{ message: string }> };
      failureReasons: string[];
    },
  ): string[] {
    const errors: string[] = [...attempt.failureReasons];

    if (attempt.compilationResult?.errors) {
      for (const error of attempt.compilationResult.errors) {
        errors.push(error.message);
      }
    }

    return errors;
  }

  /**
   * Check if error is a rate limit error
   */
  private isRateLimitError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes("rate limit") ||
        message.includes("429") ||
        message.includes("too many requests") ||
        message.includes("quota exceeded")
      );
    }
    return false;
  }

  /**
   * Check if error is transient (retryable)
   */
  private isTransientError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes("timeout") ||
        message.includes("connection") ||
        message.includes("econnreset") ||
        message.includes("enotfound") ||
        message.includes("rate limit") ||
        message.includes("429") ||
        message.includes("503") ||
        message.includes("502")
      );
    }
    return false;
  }

  /**
   * Extract retry-after value from error
   */
  private extractRetryAfter(error: unknown): number | undefined {
    if (error instanceof Error) {
      // Try to extract from error message
      const match = error.message.match(/retry[- ]?after[:\s]+(\d+)/i);
      if (match && match[1]) {
        return parseInt(match[1], 10) * 1000; // Convert to ms
      }
    }
    return undefined;
  }

  /**
   * Get current active request count
   */
  get activeCount(): number {
    return this.activeRequests;
  }

  /**
   * Check if pool is idle
   */
  get isIdle(): boolean {
    return this.activeRequests === 0;
  }

  /**
   * Graceful shutdown - wait for active requests to complete
   */
  async drain(): Promise<void> {
    this.shuttingDown = true;

    while (this.activeRequests > 0) {
      await this.delay(100);
    }
  }

  /**
   * Reset pool state
   */
  reset(): void {
    this.shuttingDown = false;
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create work items for a task across all models
 */
export function createWorkItems(
  taskManifest: import("./types.ts").TaskManifest,
  context: import("./types.ts").TaskExecutionContext,
  models: Array<{ provider: string; model: string }>,
  attemptNumber = 1,
  previousAttempts: import("./types.ts").ExecutionAttempt[] = [],
): LLMWorkItem[] {
  return models.map((m, index) => ({
    id: `${taskManifest.id}_${m.model}_${attemptNumber}_${Date.now()}`,
    taskManifest,
    llmProvider: m.provider,
    llmModel: m.model,
    attemptNumber,
    previousAttempts,
    priority: index,
    createdAt: new Date(),
    context: {
      ...context,
      llmProvider: m.provider,
      llmModel: m.model,
    },
  }));
}
