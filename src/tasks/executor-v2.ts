/**
 * Task Executor v2 - Uses transformation layer for clean architecture
 */

import { basename, dirname, join } from "@std/path";
import { ensureDir, exists } from "@std/fs";
import type {
  ExecutionAttempt,
  TaskExecutionContext,
  TaskExecutionRequest,
  TaskExecutionResult,
} from "./interfaces.ts";
import { TaskTransformer } from "./transformer.ts";
import { LLMAdapterRegistry } from "../llm/registry.ts";
import { ContainerProviderRegistry } from "../container/registry.ts";
import { TemplateRenderer } from "../templates/renderer.ts";
import { ConfigManager } from "../config/config.ts";
import { ALProjectManager } from "../compiler/al-project.ts";
import { CodeExtractor } from "../llm/code-extractor.ts";
import { DebugLogger } from "../utils/debug-logger.ts";
import type { GenerationContext, LLMAdapter } from "../llm/types.ts";
import type { CompilationResult, TestResult } from "../container/types.ts";
import {
  getRetryDelay,
  isRetryableError,
  LLMProviderError,
  TaskExecutionError,
} from "../errors.ts";
import { PromptInjectionResolver } from "../prompts/mod.ts";
import type { InjectionStage } from "../prompts/mod.ts";

export class TaskExecutorV2 {
  private templateRenderer: TemplateRenderer | null = null;

  private async getTemplateRenderer(
    _context: TaskExecutionContext,
  ): Promise<TemplateRenderer> {
    if (!this.templateRenderer) {
      const config = await ConfigManager.loadConfig();
      const templateDir = config.benchmark?.templateDir || "templates";
      this.templateRenderer = new TemplateRenderer(templateDir);
    }
    return this.templateRenderer;
  }

  /**
   * Execute a task using the provided request
   */
  async executeTask(
    request: TaskExecutionRequest,
  ): Promise<TaskExecutionResult> {
    const startTime = Date.now();

    // Transform request into execution context
    const context = await TaskTransformer.createExecutionContext(request);
    console.log(
      `🚀 Executing task: ${context.manifest.id} with ${context.llmModel}`,
    );

    // Validate the manifest
    const validation = await TaskTransformer.validateManifest(context.manifest);
    if (!validation.valid) {
      throw new Error(
        `Task validation failed: ${validation.errors.join(", ")}`,
      );
    }

    // Show warnings if any
    if (validation.warnings.length > 0) {
      console.warn(`⚠️  Warnings: ${validation.warnings.join(", ")}`);
    }

    // Initialize providers
    const llmAdapter = LLMAdapterRegistry.create(context.llmProvider, {
      provider: context.llmProvider,
      model: context.llmModel,
      temperature: context.temperature,
      maxTokens: context.maxTokens,
    });

    const containerProvider = ContainerProviderRegistry.create(
      context.containerProvider,
    );

    // Ensure container is ready
    if (!await containerProvider.isHealthy(context.containerName)) {
      const config = await ConfigManager.loadConfig();
      await containerProvider.setup({
        name: context.containerName,
        bcVersion: config.container?.bcVersion || "24.0",
        memoryLimit: config.container?.memoryLimit || "8G",
        acceptEula: true,
        includeAL: true,
        includeTestToolkit: context.manifest.expected.testApp ? true : false,
      });
    }

    // Execute attempts
    const attempts: ExecutionAttempt[] = [];
    let success = false;
    let finalCode: string | undefined;

    for (
      let attemptNum = 1;
      attemptNum <= context.attemptLimit && !success;
      attemptNum++
    ) {
      const attempt = await this.executeAttempt(
        context,
        attemptNum,
        attempts,
        llmAdapter,
      );
      attempts.push(attempt);

      if (attempt.success) {
        success = true;
        finalCode = attempt.extractedCode;
      }
    }

    // Calculate aggregate metrics
    const totalTokensUsed = attempts.reduce((sum, a) => sum + a.tokensUsed, 0);
    const totalCost = attempts.reduce((sum, a) => sum + a.cost, 0);
    const totalDuration = Date.now() - startTime;

    // Determine success details
    const passedAttemptNumber = attempts.findIndex((a) => a.success) + 1;
    const successRate = attempts.filter((a) => a.success).length /
      attempts.length;

    // Build result
    const result: TaskExecutionResult = {
      taskId: context.manifest.id,
      executionId: `exec-${Date.now()}-${
        Math.random().toString(36).substr(2, 9)
      }`,
      context,
      attempts,
      success,
      ...(finalCode !== undefined && { finalCode }),
      finalScore: this.calculateFinalScore(attempts),
      totalTokensUsed,
      totalCost,
      totalDuration,
      passedAttemptNumber,
      successRate,
      executedAt: new Date(),
      executedBy: Deno.env.get("USER") || "unknown",
      environment: {
        denoVersion: Deno.version.deno,
        os: Deno.build.os,
        arch: Deno.build.arch,
      },
    };

    // Save results if output directory is specified
    if (context.outputDir) {
      await this.saveResults(result, context);
    }

    return result;
  }

  /**
   * Execute a single attempt (public for parallel execution)
   */
  async executeAttempt(
    context: TaskExecutionContext,
    attemptNumber: number,
    previousAttempts: ExecutionAttempt[],
    llmAdapter: LLMAdapter,
  ): Promise<ExecutionAttempt> {
    const attemptStart = Date.now();
    console.log(`\n📝 Attempt ${attemptNumber}/${context.attemptLimit}`);

    // Generate prompt with injection support
    const { prompt, systemPrompt } = await this.generatePrompt(
      context,
      attemptNumber,
      previousAttempts,
    );

    const lastAttempt = previousAttempts[previousAttempts.length - 1];
    const previousCode = lastAttempt?.extractedCode;
    const previousErrors = lastAttempt?.compilationResult?.errors.map(
      (e) => `${e.file}:${e.line} - ${e.message}`,
    );

    const generationContext: GenerationContext = {
      taskId: context.manifest.id,
      attempt: attemptNumber,
      description: context.instructions,
      ...(previousCode !== undefined && { previousCode }),
      ...(previousErrors !== undefined && { errors: previousErrors }),
    };

    // Build LLM request with optional system prompt
    const llmRequest: { prompt: string; systemPrompt?: string } = { prompt };
    if (systemPrompt) {
      llmRequest.systemPrompt = systemPrompt;
    }

    // Call LLM with retry for transient errors
    const codeResult = await this.callLLMWithRetry(
      async () => {
        return attemptNumber === 1
          ? await llmAdapter.generateCode(llmRequest, generationContext)
          : await llmAdapter.generateFix(
            previousAttempts[previousAttempts.length - 1]!.extractedCode,
            generationContext.errors || [],
            llmRequest,
            generationContext,
          );
      },
      context.llmProvider,
      context.manifest.id,
      attemptNumber,
    );

    // Extract code
    const extraction = CodeExtractor.extract(
      codeResult.response.content,
      context.expectedOutput.type === "diff" ? "diff" : "al",
    );
    const codeLanguage: "al" | "diff" = extraction.language === "diff"
      ? "diff"
      : "al";
    const extractedCode = CodeExtractor.cleanCode(
      extraction.code,
      codeLanguage,
    );

    // Create temporary project and compile
    const projectDir = await this.createTempProject(
      context,
      extractedCode,
      attemptNumber,
    );
    const project = await ALProjectManager.loadProject(projectDir);

    const containerProvider = ContainerProviderRegistry.create(
      context.containerProvider,
    );
    const compilationResult = await containerProvider.compileProject(
      context.containerName,
      project,
    );

    // Log compilation result if debug is enabled
    const debugLogger = DebugLogger.getInstance();
    if (debugLogger) {
      await debugLogger.logCompilation(
        context.manifest.id,
        context.llmModel,
        attemptNumber,
        context.containerName,
        compilationResult,
      );
    }

    // Run tests if required and compilation succeeded
    let testResult;
    if (compilationResult.success && context.manifest.expected.testApp) {
      testResult = await containerProvider.runTests(
        context.containerName,
        project,
      );

      // Log test result if debug is enabled
      if (debugLogger && testResult) {
        await debugLogger.logTestResult(
          context.manifest.id,
          context.llmModel,
          attemptNumber,
          context.containerName,
          testResult,
        );
      }
    }

    // Save verbose artifacts (AL files and .app) if debug is enabled
    if (debugLogger) {
      await debugLogger.saveVerboseArtifacts(
        context.manifest.id,
        context.variantId || context.llmModel,
        attemptNumber,
        projectDir,
        compilationResult.artifactPath,
      );
    }

    // Evaluate success
    const { success, score, reasons } = this.evaluateAttempt(
      context,
      extractedCode,
      compilationResult,
      testResult,
    );

    // Build attempt result
    const attempt: ExecutionAttempt = {
      attemptNumber,
      startTime: new Date(attemptStart),
      endTime: new Date(),
      prompt,
      llmResponse: codeResult.response,
      extractedCode,
      codeLanguage,
      compilationResult,
      ...(testResult !== undefined && { testResult }),
      success,
      score,
      failureReasons: reasons,
      tokensUsed: codeResult.response.usage.totalTokens,
      cost: llmAdapter.estimateCost(
        codeResult.response.usage.promptTokens,
        codeResult.response.usage.completionTokens,
      ),
      duration: Date.now() - attemptStart,
    };

    return attempt;
  }

  /**
   * Generate prompt for an attempt with prompt injection support
   * Returns both the assembled prompt and optional system prompt
   */
  private async generatePrompt(
    context: TaskExecutionContext,
    attemptNumber: number,
    previousAttempts: ExecutionAttempt[],
  ): Promise<{ prompt: string; systemPrompt?: string }> {
    // Determine the injection stage
    const stage: InjectionStage = attemptNumber === 1 ? "generation" : "fix";

    // Get global config for prompts
    const globalConfig = await ConfigManager.loadConfig();

    // Generate base prompt from templates
    let basePrompt: string;
    if (attemptNumber === 1) {
      // First attempt - use prompt template
      const renderer = await this.getTemplateRenderer(context);
      basePrompt = await renderer.render(context.manifest.prompt_template, {
        task_id: context.manifest.id,
        description: context.manifest.description,
        instructions: context.instructions,
        expected_compile: context.manifest.expected.compile,
        expected_test: context.manifest.expected.testApp || "",
      });
    } else {
      // Subsequent attempts - use fix template
      const previousAttempt = previousAttempts[previousAttempts.length - 1]!;
      const errors = previousAttempt.compilationResult?.errors.map(
        (e) => `${e.file}:${e.line} - ${e.message}`,
      ).join("\n") || "";

      const renderer = await this.getTemplateRenderer(context);
      basePrompt = await renderer.render(context.manifest.fix_template, {
        task_id: context.manifest.id,
        description: context.manifest.description,
        attempt: attemptNumber,
        previous_code: previousAttempt.extractedCode,
        errors: errors,
        error_snippet: this.truncateErrors(errors, 2048),
      });
    }

    // Apply prompt injection resolver
    const applied = PromptInjectionResolver.resolveAndApply(
      basePrompt,
      globalConfig.prompts,
      context.manifest.prompts,
      context.promptOverrides,
      context.llmProvider,
      stage,
    );

    const result: { prompt: string; systemPrompt?: string } = {
      prompt: applied.prompt,
    };

    if (applied.systemPrompt) {
      result.systemPrompt = applied.systemPrompt;
    }

    return result;
  }

  /**
   * Create temporary project for compilation
   */
  private async createTempProject(
    context: TaskExecutionContext,
    code: string,
    attemptNumber: number,
  ): Promise<string> {
    const tempDir = join(
      context.outputDir,
      "temp",
      `${context.manifest.id}_attempt_${attemptNumber}_${Date.now()}`,
    );

    await ensureDir(tempDir);

    // Check if we need test toolkit dependencies
    const hasTestApp = context.manifest.expected.testApp &&
      context.manifest.expected.testApp.length > 0;

    // Create app.json with test toolkit dependencies if needed
    const appJson: Record<string, unknown> = {
      id: `${context.manifest.id}-${attemptNumber}`,
      name: `CentralGauge_${context.manifest.id}_${attemptNumber}`,
      publisher: "CentralGauge",
      version: "1.0.0.0",
      platform: "24.0.0.0",
      runtime: "11.0",
      idRanges: [{ from: 70000, to: 80099 }],
    };

    // Add test toolkit dependencies if testApp is specified
    if (hasTestApp) {
      appJson["dependencies"] = [
        {
          id: "dd0be2ea-f733-4d65-bb34-a28f4624fb14",
          name: "Library Assert",
          publisher: "Microsoft",
          version: "24.0.0.0",
        },
        {
          id: "5d86850b-0d76-4eca-bd7b-951ad998e997",
          name: "Tests-TestLibraries",
          publisher: "Microsoft",
          version: "24.0.0.0",
        },
      ];
    }

    await Deno.writeTextFile(
      join(tempDir, "app.json"),
      JSON.stringify(appJson, null, 2),
    );

    // Write code file
    const codeFile = join(
      tempDir,
      basename(context.targetFile) || "Generated.al",
    );
    await Deno.writeTextFile(codeFile, code);

    // Copy test file(s) if testApp is specified
    // Also copies any helper files (enums, mocks) with the same task ID prefix
    if (hasTestApp) {
      const testAppPath = context.manifest.expected.testApp!;
      // Resolve testApp path relative to project root
      const fullTestPath = join(Deno.cwd(), testAppPath);
      const testDir = dirname(fullTestPath);
      const taskId = context.manifest.id;

      if (await exists(testDir)) {
        // Copy all .al files with the task ID prefix (test file + helpers)
        for await (const entry of Deno.readDir(testDir)) {
          if (
            entry.isFile && entry.name.endsWith(".al") &&
            entry.name.startsWith(taskId)
          ) {
            const srcPath = join(testDir, entry.name);
            await Deno.copyFile(srcPath, join(tempDir, entry.name));
          }
        }
      } else {
        console.warn(
          `[Executor] Test directory not found: ${testDir}`,
        );
      }
    }

    return tempDir;
  }

  /**
   * Evaluate if an attempt was successful (public for parallel execution)
   */
  evaluateAttempt(
    context: TaskExecutionContext,
    code: string,
    compilationResult: CompilationResult,
    testResult?: TestResult,
  ): { success: boolean; score: number; reasons: string[] } {
    const reasons: string[] = [];
    let score = 0;
    let maxScore = 0;

    // Check compilation
    maxScore += 50;
    if (context.expectedOutput.validation.mustCompile) {
      if (compilationResult.success) {
        score += 50;
      } else {
        reasons.push("Code did not compile");
      }
    } else if (compilationResult.success) {
      score += 25; // Bonus for compiling even if not required
    }

    // Check tests
    if (context.expectedOutput.validation.mustPass && testResult) {
      maxScore += 30;
      if (testResult.success) {
        score += 30;
      } else {
        reasons.push(
          `Tests failed: ${testResult.failedTests}/${testResult.totalTests}`,
        );
      }
    }

    // Check required patterns
    if (context.expectedOutput.validation.mustContain) {
      maxScore += 10;
      const missingPatterns = context.expectedOutput.validation.mustContain
        .filter(
          (pattern) => !code.includes(pattern),
        );

      if (missingPatterns.length === 0) {
        score += 10;
      } else {
        reasons.push(
          `Missing required patterns: ${missingPatterns.join(", ")}`,
        );
      }
    }

    // Check forbidden patterns
    if (context.expectedOutput.validation.mustNotContain) {
      maxScore += 10;
      const foundForbidden = context.expectedOutput.validation.mustNotContain
        .filter(
          (pattern) => code.includes(pattern),
        );

      if (foundForbidden.length === 0) {
        score += 10;
      } else {
        reasons.push(
          `Contains forbidden patterns: ${foundForbidden.join(", ")}`,
        );
        score -= 10; // Penalty
      }
    }

    // Custom checks
    context.evaluation.customChecks.forEach((check, index) => {
      maxScore += 5;
      if (check(code)) {
        score += 5;
      } else {
        reasons.push(`Custom check ${index + 1} failed`);
      }
    });

    // Normalize score
    const normalizedScore = maxScore > 0 ? (score / maxScore) * 100 : 0;
    const success = normalizedScore >= 70 && reasons.length === 0;

    return { success, score: normalizedScore, reasons };
  }

  /**
   * Calculate final score across all attempts
   */
  private calculateFinalScore(attempts: ExecutionAttempt[]): number {
    if (attempts.length === 0) return 0;

    const successfulAttempt = attempts.find((a) => a.success);
    if (!successfulAttempt) {
      // No successful attempt - use best score with penalty
      const bestScore = Math.max(...attempts.map((a) => a.score));
      return bestScore * 0.5; // 50% penalty for not succeeding
    }

    // Success - score based on attempt number
    const attemptPenalty = (successfulAttempt.attemptNumber - 1) * 10;
    return Math.max(0, successfulAttempt.score - attemptPenalty);
  }

  /**
   * Truncate error messages for prompt
   */
  private truncateErrors(errors: string, maxLength: number): string {
    if (errors.length <= maxLength) return errors;

    const lines = errors.split("\n");
    const truncated: string[] = [];
    let currentLength = 0;

    for (const line of lines) {
      if (currentLength + line.length > maxLength) {
        truncated.push("... (truncated)");
        break;
      }
      truncated.push(line);
      currentLength += line.length + 1;
    }

    return truncated.join("\n");
  }

  /**
   * Save execution results
   */
  private async saveResults(
    result: TaskExecutionResult,
    context: TaskExecutionContext,
  ): Promise<void> {
    const outputDir = join(
      context.outputDir,
      context.manifest.id,
      result.executionId,
    );
    await ensureDir(outputDir);

    // Save execution result
    await Deno.writeTextFile(
      join(outputDir, "result.json"),
      JSON.stringify(result, null, 2),
    );

    // Save final code if successful
    if (result.success && result.finalCode) {
      await Deno.writeTextFile(
        join(outputDir, "final_code.al"),
        result.finalCode,
      );
    }

    // Save attempt details
    for (const attempt of result.attempts) {
      const attemptDir = join(outputDir, `attempt_${attempt.attemptNumber}`);
      await ensureDir(attemptDir);

      await Deno.writeTextFile(
        join(attemptDir, "prompt.md"),
        attempt.prompt,
      );

      await Deno.writeTextFile(
        join(attemptDir, "response.md"),
        attempt.llmResponse.content,
      );

      await Deno.writeTextFile(
        join(attemptDir, "extracted_code.al"),
        attempt.extractedCode,
      );

      if (attempt.compilationResult) {
        await Deno.writeTextFile(
          join(attemptDir, "compilation.json"),
          JSON.stringify(attempt.compilationResult, null, 2),
        );
      }
    }

    console.log(`💾 Results saved to: ${outputDir}`);
  }

  /**
   * Call LLM with retry logic for transient errors
   */
  private async callLLMWithRetry<T>(
    fn: () => Promise<T>,
    provider: string,
    taskId: string,
    attemptNumber: number,
    maxRetries: number = 2,
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let retry = 0; retry <= maxRetries; retry++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (retry < maxRetries && isRetryableError(error)) {
          const delayMs = getRetryDelay(error, 1000 * (retry + 1));
          console.warn(
            `⚠️  LLM call failed (retry ${
              retry + 1
            }/${maxRetries}): ${lastError.message}. ` +
              `Retrying in ${delayMs}ms...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }

        // Non-retryable or max retries exceeded
        throw new LLMProviderError(
          `LLM call failed after ${retry + 1} attempt(s): ${lastError.message}`,
          provider,
          false,
          undefined,
          { taskId, attemptNumber, originalError: lastError.message },
        );
      }
    }

    // Should never reach here, but TypeScript needs this
    throw new TaskExecutionError(
      `LLM call failed: ${lastError?.message || "Unknown error"}`,
      taskId,
      attemptNumber,
    );
  }

  /**
   * Compile and test code - convenience method for parallel execution
   * Returns compilation result and optional test result
   */
  async compileAndTest(
    context: TaskExecutionContext,
    code: string,
    attemptNumber: number,
  ): Promise<{
    compilationResult: CompilationResult;
    testResult?: TestResult;
    projectDir: string;
  }> {
    // Create temporary project
    const projectDir = await this.createTempProject(
      context,
      code,
      attemptNumber,
    );
    const project = await ALProjectManager.loadProject(projectDir);

    // Compile
    const containerProvider = ContainerProviderRegistry.create(
      context.containerProvider,
    );
    const compilationResult = await containerProvider.compileProject(
      context.containerName,
      project,
    );

    // Log compilation result if debug is enabled
    const debugLogger = DebugLogger.getInstance();
    if (debugLogger) {
      await debugLogger.logCompilation(
        context.manifest.id,
        context.llmModel,
        attemptNumber,
        context.containerName,
        compilationResult,
      );
    }

    // Run tests if required and compilation succeeded
    let testResult: TestResult | undefined;
    if (compilationResult.success && context.manifest.expected.testApp) {
      testResult = await containerProvider.runTests(
        context.containerName,
        project,
      );

      // Log test result if debug is enabled
      if (debugLogger && testResult) {
        await debugLogger.logTestResult(
          context.manifest.id,
          context.llmModel,
          attemptNumber,
          context.containerName,
          testResult,
        );
      }
    }

    // Save verbose artifacts (AL files and .app) if debug is enabled
    if (debugLogger) {
      await debugLogger.saveVerboseArtifacts(
        context.manifest.id,
        context.variantId || context.llmModel,
        attemptNumber,
        projectDir,
        compilationResult.artifactPath,
      );
    }

    const result: {
      compilationResult: CompilationResult;
      testResult?: TestResult;
      projectDir: string;
    } = {
      compilationResult,
      projectDir,
    };

    if (testResult !== undefined) {
      result.testResult = testResult;
    }

    return result;
  }

  /**
   * Clean up temporary project directory
   */
  async cleanupProject(projectDir: string): Promise<void> {
    try {
      await Deno.remove(projectDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}
