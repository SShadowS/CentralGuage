/**
 * Main orchestration for parallel benchmark execution
 * Coordinates LLM work pool, compile queue, and result aggregation
 */

import type {
  BenchmarkProgress,
  CompileWorkItem,
  ExecutionAttempt,
  LLMWorkResult,
  ParallelExecutionConfig,
  ParallelExecutionEvent,
  ParallelTaskResult,
  TaskExecutionContext,
  TaskExecutionResult,
  TaskManifest,
} from "./types.ts";
import { createDefaultConfig } from "./types.ts";
import { createWorkItems, LLMWorkPool } from "./llm-work-pool.ts";
import { CompileQueue } from "./compile-queue.ts";
import { buildTaskComparison, ResultAggregator } from "./result-aggregator.ts";
import { ProviderRateLimiter } from "./rate-limiter.ts";
import { ContainerProviderRegistry } from "../container/registry.ts";
import { TaskTransformer } from "../tasks/transformer.ts";
import type { ContainerProvider } from "../container/interface.ts";
import type { ModelVariant } from "../llm/variant-types.ts";

/**
 * Event listener type
 */
type EventListener = (event: ParallelExecutionEvent) => void;

/**
 * Options for running a parallel benchmark
 */
export interface ParallelBenchmarkOptions {
  /** Container name to use */
  containerName: string;

  /** Container provider type */
  containerProvider: string;

  /** Maximum attempts per task per model */
  attemptLimit: number;

  /** Temperature for LLM calls */
  temperature: number;

  /** Max tokens for LLM responses */
  maxTokens: number;

  /** Output directory for results */
  outputDir: string;

  /** Enable debug mode */
  debugMode: boolean;

  /** Prompt injection overrides from CLI */
  promptOverrides?: import("../prompts/mod.ts").CLIPromptOverrides;
}

/**
 * Main orchestrator for parallel benchmark execution
 */
export class ParallelBenchmarkOrchestrator {
  private config: ParallelExecutionConfig;
  private llmPool: LLMWorkPool;
  private compileQueue: CompileQueue | null = null;
  private aggregator: ResultAggregator;
  private rateLimiter: ProviderRateLimiter;
  private listeners: EventListener[] = [];
  private containerProvider: ContainerProvider | null = null;

  // Progress tracking
  private startTime: Date | null = null;
  private completedTasks = 0;
  private totalTasks = 0;
  private errors: string[] = [];

  constructor(config?: Partial<ParallelExecutionConfig>) {
    this.config = { ...createDefaultConfig(), ...config };
    this.rateLimiter = new ProviderRateLimiter(this.config.providerConcurrency);
    this.llmPool = new LLMWorkPool(this.config, this.rateLimiter);
    this.aggregator = new ResultAggregator();
  }

  /**
   * Subscribe to execution events
   */
  on(listener: EventListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx !== -1) {
        this.listeners.splice(idx, 1);
      }
    };
  }

  /**
   * Emit an event to all listeners
   */
  private emit(event: ParallelExecutionEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("Error in event listener:", error);
      }
    }
  }

  /**
   * Run benchmark in parallel
   * @param taskManifests Tasks to execute
   * @param variants Model variants to test (can include same model with different configs)
   * @param options Execution options
   */
  async runParallel(
    taskManifests: TaskManifest[],
    variants: ModelVariant[],
    options: ParallelBenchmarkOptions,
  ): Promise<{
    results: TaskExecutionResult[];
    taskResults: ParallelTaskResult[];
    summary: ReturnType<ResultAggregator["finalize"]>;
  }> {
    this.startTime = new Date();
    this.totalTasks = taskManifests.length;
    this.completedTasks = 0;
    this.errors = [];

    // Initialize container
    this.containerProvider = ContainerProviderRegistry.create(
      options.containerProvider,
    );
    this.compileQueue = new CompileQueue(
      this.containerProvider,
      options.containerName,
      {
        maxQueueSize: this.config.compileQueueSize,
        timeout: this.config.compileQueueTimeout,
      },
    );

    const taskResults: ParallelTaskResult[] = [];

    try {
      // Process each task
      for (const manifest of taskManifests) {
        const taskResult = await this.processTask(
          manifest,
          variants,
          options,
        );
        taskResults.push(taskResult);
        this.aggregator.addParallelTaskResult(taskResult);

        this.completedTasks++;
        this.emitProgress();
      }
    } finally {
      // Clean up
      await this.llmPool.drain();
      await this.compileQueue?.drain();
    }

    return {
      results: this.aggregator.getAll(),
      taskResults,
      summary: this.aggregator.finalize(),
    };
  }

  /**
   * Process a single task across all model variants in parallel
   */
  private async processTask(
    manifest: TaskManifest,
    variants: ModelVariant[],
    options: ParallelBenchmarkOptions,
  ): Promise<ParallelTaskResult> {
    const startTime = Date.now();
    const modelResults = new Map<string, TaskExecutionResult>();
    const failures = new Map<string, Error>();

    this.emit({
      type: "task_started",
      taskId: manifest.id,
      models: variants.map((v) => v.variantId),
    });

    // Process each variant (in parallel)
    const promises = variants.map(async (variant) => {
      try {
        const result = await this.processTaskForVariant(
          manifest,
          variant,
          options,
        );
        // Key by variantId to distinguish same model with different configs
        modelResults.set(variant.variantId, result);

        this.emit({ type: "result", result });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        failures.set(variant.variantId, err);
        this.errors.push(`${manifest.id}/${variant.variantId}: ${err.message}`);

        this.emit({
          type: "error",
          taskId: manifest.id,
          model: variant.variantId,
          error: err,
        });
      }
    });

    await Promise.allSettled(promises);

    const comparison = buildTaskComparison(manifest.id, modelResults);

    const taskResult: ParallelTaskResult = {
      taskId: manifest.id,
      modelResults,
      failures,
      partialSuccess: modelResults.size > 0,
      comparison,
      duration: Date.now() - startTime,
    };

    this.emit({
      type: "task_completed",
      taskId: manifest.id,
      result: taskResult,
    });

    return taskResult;
  }

  /**
   * Process a single task for a single model variant (with retry attempts)
   */
  private async processTaskForVariant(
    manifest: TaskManifest,
    variant: ModelVariant,
    options: ParallelBenchmarkOptions,
  ): Promise<TaskExecutionResult> {
    const executionId = `${manifest.id}_${variant.variantId}_${Date.now()}`;
    const startTime = Date.now();
    const attempts: ExecutionAttempt[] = [];

    // Build execution context with variant config applied
    const context = await this.buildContext(manifest, variant, options);

    let success = false;
    let finalScore = 0;
    let finalCode: string | undefined;
    let passedAttemptNumber = 0;

    // Attempt loop
    for (
      let attemptNumber = 1;
      attemptNumber <= options.attemptLimit;
      attemptNumber++
    ) {
      this.emit({
        type: "llm_started",
        taskId: manifest.id,
        model: variant.variantId,
        attempt: attemptNumber,
      });

      // Create work items - pass variant as model for compatibility
      const modelCompat = { provider: variant.provider, model: variant.model };
      const workItems = createWorkItems(
        manifest,
        context,
        [modelCompat],
        attemptNumber,
        attempts,
      );

      // Execute LLM call
      const llmResults = await this.llmPool.submitBatch(workItems);
      const llmResult = llmResults.get(variant.model);

      this.emit({
        type: "llm_completed",
        taskId: manifest.id,
        model: variant.variantId,
        attempt: attemptNumber,
        success: llmResult?.success ?? false,
      });

      if (!llmResult?.success || !llmResult.code) {
        // LLM call failed
        attempts.push(this.createFailedAttempt(attemptNumber, llmResult));
        continue;
      }

      // Queue compilation
      const workItem = workItems[0];
      if (!workItem) {
        throw new Error("No work item created");
      }
      const compileItem: CompileWorkItem = {
        id: `compile_${executionId}_${attemptNumber}`,
        llmWorkItemId: workItem.id,
        code: llmResult.code,
        context,
        attemptNumber,
        llmResponse: llmResult.llmResponse!,
        createdAt: new Date(),
      };

      this.emit({
        type: "compile_queued",
        taskId: manifest.id,
        model: variant.variantId,
        queuePosition: this.compileQueue?.length ?? 0,
      });

      this.emit({
        type: "compile_started",
        taskId: manifest.id,
        model: variant.variantId,
      });

      const compileResult = await this.compileQueue!.enqueue(compileItem);

      this.emit({
        type: "compile_completed",
        taskId: manifest.id,
        model: variant.variantId,
        success: compileResult.compilationResult.success,
      });

      // Evaluate result
      const attempt = this.createAttempt(
        attemptNumber,
        llmResult,
        compileResult,
        context,
      );
      attempts.push(attempt);

      if (attempt.success) {
        success = true;
        finalCode = llmResult.code;
        passedAttemptNumber = attemptNumber;
        finalScore = this.calculateFinalScore(attempt.score, attemptNumber);
        break; // Stop on success
      }
    }

    // If never succeeded, calculate final score from best attempt
    if (!success && attempts.length > 0) {
      const bestScore = Math.max(...attempts.map((a) => a.score));
      finalScore = bestScore * 0.5; // 50% penalty for never passing
    }

    // Calculate totals
    const totalTokensUsed = attempts.reduce((sum, a) => sum + a.tokensUsed, 0);
    const totalCost = attempts.reduce((sum, a) => sum + a.cost, 0);
    const totalDuration = Date.now() - startTime;

    const result: TaskExecutionResult = {
      taskId: manifest.id,
      executionId,
      context,
      attempts,
      success,
      finalScore,
      totalTokensUsed,
      totalCost,
      totalDuration,
      passedAttemptNumber,
      successRate: success ? 1 / passedAttemptNumber : 0,
      executedAt: new Date(),
      executedBy: "parallel-orchestrator",
      environment: {
        denoVersion: Deno.version.deno,
        os: Deno.build.os,
        arch: Deno.build.arch,
      },
    };
    if (finalCode) {
      result.finalCode = finalCode;
    }
    return result;
  }

  /**
   * Build execution context for a task with variant config applied
   */
  private buildContext(
    manifest: TaskManifest,
    variant: ModelVariant,
    options: ParallelBenchmarkOptions,
  ): TaskExecutionContext {
    // Apply variant config overrides to temperature and maxTokens
    const temperature = variant.config.temperature ?? options.temperature;
    const maxTokens = variant.config.maxTokens ?? options.maxTokens;

    return TaskTransformer.createExecutionContext({
      taskManifest: manifest,
      llmProvider: variant.provider,
      llmModel: variant.model,
      variantId: variant.variantId,
      variantConfig: variant.hasVariant ? variant.config : undefined,
      containerProvider: options.containerProvider,
      containerName: options.containerName,
      attemptLimit: options.attemptLimit,
      temperature,
      maxTokens,
      outputDir: options.outputDir,
      debugMode: options.debugMode,
      ...(options.promptOverrides &&
        { promptOverrides: options.promptOverrides }),
    });
  }

  /**
   * Create an attempt record from execution results
   */
  private createAttempt(
    attemptNumber: number,
    llmResult: LLMWorkResult,
    compileResult: {
      compilationResult: import("./types.ts").CompilationResult;
      testResult?: import("./types.ts").TestResult;
      duration: number;
    },
    context: TaskExecutionContext,
  ): ExecutionAttempt {
    const startTime = new Date(
      Date.now() - llmResult.duration - compileResult.duration,
    );
    const endTime = new Date();

    // Evaluate success
    const compilationSuccess = compileResult.compilationResult.success;
    const testSuccess = compileResult.testResult?.success ?? true;
    const success = compilationSuccess && testSuccess;

    // Calculate score
    const score = this.calculateScore(
      compileResult.compilationResult,
      compileResult.testResult,
      llmResult.code || "",
      context,
    );

    // Collect failure reasons
    const failureReasons: string[] = [];
    if (!compilationSuccess) {
      failureReasons.push("Compilation failed");
      for (const error of compileResult.compilationResult.errors) {
        failureReasons.push(`  ${error.file}:${error.line}: ${error.message}`);
      }
    }
    if (compileResult.testResult && !compileResult.testResult.success) {
      failureReasons.push("Tests failed");
      for (
        const test of compileResult.testResult.results.filter((t) => !t.passed)
      ) {
        failureReasons.push(`  ${test.name}: ${test.error}`);
      }
    }

    const attempt: ExecutionAttempt = {
      attemptNumber,
      startTime,
      endTime,
      prompt: context.instructions,
      llmResponse: llmResult.llmResponse!,
      extractedCode: llmResult.code || "",
      codeLanguage: "al",
      compilationResult: compileResult.compilationResult,
      success,
      score,
      failureReasons,
      tokensUsed: llmResult.llmResponse?.usage.totalTokens ?? 0,
      cost: llmResult.llmResponse?.usage.estimatedCost ?? 0,
      duration: llmResult.duration + compileResult.duration,
    };
    if (compileResult.testResult) {
      attempt.testResult = compileResult.testResult;
    }
    return attempt;
  }

  /**
   * Create a failed attempt record (LLM call failed)
   */
  private createFailedAttempt(
    attemptNumber: number,
    llmResult: LLMWorkResult | undefined,
  ): ExecutionAttempt {
    const now = new Date();
    return {
      attemptNumber,
      startTime: new Date(now.getTime() - (llmResult?.duration ?? 0)),
      endTime: now,
      prompt: "",
      llmResponse: llmResult?.llmResponse ?? {
        content: "",
        model: "unknown",
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        duration: 0,
        finishReason: "error",
      },
      extractedCode: "",
      codeLanguage: "al",
      success: false,
      score: 0,
      failureReasons: [llmResult?.error ?? "LLM call failed"],
      tokensUsed: llmResult?.llmResponse?.usage.totalTokens ?? 0,
      cost: llmResult?.llmResponse?.usage.estimatedCost ?? 0,
      duration: llmResult?.duration ?? 0,
    };
  }

  /**
   * Calculate score for an attempt
   */
  private calculateScore(
    compilationResult: import("./types.ts").CompilationResult,
    testResult: import("./types.ts").TestResult | undefined,
    code: string,
    context: TaskExecutionContext,
  ): number {
    let score = 0;
    let maxScore = 0;

    // Compilation (50 points)
    maxScore += 50;
    if (compilationResult.success) {
      score += 50;
    }

    // Tests (30 points if configured)
    if (context.manifest.expected.testApp) {
      maxScore += 30;
      if (testResult?.success) {
        score += 30;
      }
    }

    // Required patterns (10 points)
    const requiredPatterns = context.manifest.expected.mustContain ?? [];
    if (requiredPatterns.length > 0) {
      maxScore += 10;
      const allFound = requiredPatterns.every((pattern) =>
        code.includes(pattern)
      );
      if (allFound) {
        score += 10;
      }
    }

    // Forbidden patterns (10 points)
    const forbiddenPatterns = context.manifest.expected.mustNotContain ?? [];
    if (forbiddenPatterns.length > 0) {
      maxScore += 10;
      const noneFound = !forbiddenPatterns.some((pattern) =>
        code.includes(pattern)
      );
      if (noneFound) {
        score += 10;
      }
    }

    return maxScore > 0 ? (score / maxScore) * 100 : 0;
  }

  /**
   * Calculate final score with attempt penalty
   */
  private calculateFinalScore(
    attemptScore: number,
    attemptNumber: number,
  ): number {
    // Penalty of 10 points per additional attempt
    const penalty = (attemptNumber - 1) * 10;
    return Math.max(0, attemptScore - penalty);
  }

  /**
   * Emit progress event
   */
  private emitProgress(): void {
    if (!this.startTime) return;

    const elapsed = Date.now() - this.startTime.getTime();
    const avgTimePerTask = this.completedTasks > 0
      ? elapsed / this.completedTasks
      : 0;
    const remaining = this.totalTasks - this.completedTasks;
    const estimatedRemaining = avgTimePerTask * remaining;

    const progress: BenchmarkProgress = {
      totalTasks: this.totalTasks,
      completedTasks: this.completedTasks,
      activeLLMCalls: this.llmPool.activeCount,
      compileQueueLength: this.compileQueue?.length ?? 0,
      errors: this.errors,
      estimatedTimeRemaining: estimatedRemaining,
      startTime: this.startTime,
      elapsedTime: elapsed,
    };

    this.emit({ type: "progress", progress });
  }

  /**
   * Get current aggregator for partial results
   */
  get results(): ResultAggregator {
    return this.aggregator;
  }

  /**
   * Reset orchestrator state
   */
  reset(): void {
    this.aggregator.clear();
    this.llmPool.reset();
    this.completedTasks = 0;
    this.totalTasks = 0;
    this.errors = [];
    this.startTime = null;
  }
}

/**
 * Create a parallel benchmark orchestrator with default config
 */
export function createOrchestrator(
  config?: Partial<ParallelExecutionConfig>,
): ParallelBenchmarkOrchestrator {
  return new ParallelBenchmarkOrchestrator(config);
}
