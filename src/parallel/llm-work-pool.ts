/**
 * Work pool for parallel LLM calls
 * Manages concurrent requests while respecting rate limits
 */

import type {
  LLMWorkItem,
  LLMWorkResult,
  ParallelExecutionConfig,
} from "./types.ts";
import {
  type ContinuationConfig,
  DEFAULT_CONTINUATION_CONFIG,
  type GenerationContext,
  type LLMAdapter,
  type LLMRequest,
} from "../llm/types.ts";
import { getGlobalRateLimiter, ProviderRateLimiter } from "./rate-limiter.ts";
import { LLMAdapterRegistry } from "../llm/registry.ts";
import { CodeExtractor } from "../llm/code-extractor.ts";
import { TemplateRenderer } from "../templates/renderer.ts";
import {
  type ContinuationResult,
  createTruncationWarning,
  generateWithContinuation,
} from "../llm/continuation.ts";

/**
 * Work pool for managing parallel LLM requests
 */
export class LLMWorkPool {
  private rateLimiter: ProviderRateLimiter;
  private config: ParallelExecutionConfig;
  private activeRequests = 0;
  private shuttingDown = false;
  private templateRenderer: TemplateRenderer;
  private continuationConfig: ContinuationConfig;

  constructor(
    config: ParallelExecutionConfig,
    rateLimiter?: ProviderRateLimiter,
    continuationConfig?: ContinuationConfig,
  ) {
    this.config = config;
    this.rateLimiter = rateLimiter ?? getGlobalRateLimiter();
    this.templateRenderer = new TemplateRenderer(
      config.templateDir || "templates",
    );
    this.continuationConfig = continuationConfig ?? DEFAULT_CONTINUATION_CONFIG;
  }

  /**
   * Set continuation configuration
   */
  setContinuationConfig(config: ContinuationConfig): void {
    this.continuationConfig = config;
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

      // Generate code with continuation support
      const continuationResult = await this.generateCodeWithContinuation(
        item,
        adapter,
      );

      // Extract code from response and clean it
      const extracted = CodeExtractor.extract(
        continuationResult.response.content,
      );
      const cleanedCode = CodeExtractor.cleanCode(
        extracted.code,
        extracted.language === "diff" ? "diff" : "al",
      );

      // Release lease with actual token count
      this.rateLimiter.release(
        lease,
        continuationResult.response.usage.totalTokens,
      );

      // Generate truncation warning if applicable
      const truncationWarning = createTruncationWarning(
        continuationResult.continuationCount,
        continuationResult.wasTruncated,
      );

      const result: LLMWorkResult = {
        workItemId: item.id,
        success: true,
        code: cleanedCode,
        llmResponse: continuationResult.response,
        duration: Date.now() - startTime,
        readyForCompile: extracted.confidence > 0.5,
        continuationCount: continuationResult.continuationCount,
      };
      if (truncationWarning) {
        result.truncationWarning = truncationWarning;
      }
      return result;
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
   * Generate code with continuation support
   */
  private async generateCodeWithContinuation(
    item: LLMWorkItem,
    adapter: LLMAdapter,
  ): Promise<ContinuationResult> {
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

    // Create the generation function for the continuation helper
    const generateFn = async (
      request: LLMRequest,
      ctx: GenerationContext,
    ) => {
      const previousAttempt =
        item.previousAttempts[item.previousAttempts.length - 1];

      if (item.attemptNumber === 1 || !previousAttempt) {
        return await adapter.generateCode(request, ctx);
      } else {
        const errors = this.extractErrors(previousAttempt);
        return await adapter.generateFix(
          previousAttempt.extractedCode,
          errors,
          request,
          ctx,
        );
      }
    };

    // Build the request
    const request = await this.buildRequest(item, context);

    // Use continuation helper for automatic handling of truncated responses
    return generateWithContinuation(
      generateFn,
      request,
      context,
      this.continuationConfig,
    );
  }

  /**
   * Build LLM request for the work item
   */
  private async buildRequest(
    item: LLMWorkItem,
    _context: GenerationContext,
  ): Promise<LLMRequest> {
    const previousAttempt =
      item.previousAttempts[item.previousAttempts.length - 1];

    if (item.attemptNumber === 1 || !previousAttempt) {
      // First attempt - render template with task description
      const promptTemplate = item.taskManifest.prompt_template || "code-gen.md";
      const renderedPrompt = await this.templateRenderer.render(
        promptTemplate,
        {
          description: item.context.instructions,
          task_id: item.taskManifest.id,
          max_attempts: item.taskManifest.max_attempts,
        },
      );
      return {
        prompt: renderedPrompt,
        temperature: item.context.temperature,
        maxTokens: item.context.maxTokens,
      };
    } else {
      // Retry attempt - build fix prompt with errors
      const errors = this.extractErrors(previousAttempt);
      const fixPrompt = this.buildFixPrompt(
        item.context.instructions,
        previousAttempt.extractedCode,
        errors,
        item.attemptNumber,
      );
      return {
        prompt: fixPrompt,
        temperature: item.context.temperature,
        maxTokens: item.context.maxTokens,
      };
    }
  }

  /**
   * Build a fix prompt that includes the errors and previous code
   */
  private buildFixPrompt(
    originalInstructions: string,
    previousCode: string,
    errors: string[],
    attemptNumber: number,
  ): string {
    const errorSnippet = errors.slice(0, 20).join("\n"); // Limit errors
    const truncatedCode = previousCode.length > 4000
      ? previousCode.substring(0, 4000) + "\n... (truncated)"
      : previousCode;

    return `Your previous submission (attempt ${
      attemptNumber - 1
    }) failed to compile or pass tests.

## Original Task
${originalInstructions}

## Your Previous Code
\`\`\`al
${truncatedCode}
\`\`\`

## Compilation/Test Errors
${errorSnippet}

## Instructions
1. Analyze the compilation errors or test failures above
2. Fix the issues in your code
3. Provide the COMPLETE corrected AL code (not a diff)
4. Ensure the fix addresses the root cause
5. Do NOT add references to objects that don't exist (pages, codeunits, etc.) unless they are part of the task

Provide the corrected code:`;
  }

  /**
   * Extract error messages from a previous attempt
   * Note: compilationResult.errors are already included in failureReasons,
   * so we only use failureReasons to avoid duplicates
   */
  private extractErrors(
    attempt: {
      compilationResult?: { errors: Array<{ message: string }> } | undefined;
      failureReasons: string[];
    },
  ): string[] {
    // failureReasons already contains formatted compilation errors
    // (e.g., "file:line: message"), so don't add compilationResult.errors again
    return [...attempt.failureReasons];
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
