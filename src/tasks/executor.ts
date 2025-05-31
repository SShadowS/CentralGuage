import { exists } from "@std/fs";
import { join } from "@std/path";
import { parse } from "@std/yaml";

import type { TaskManifest } from "../../types/index.ts";
import type { 
  AttemptResult, 
  TaskExecutionConfig, 
  TaskExecutionResult, 
  TaskExecutor 
} from "./types.ts";

import { LLMAdapterRegistry } from "../llm/registry.ts";
import { ContainerProviderRegistry } from "../container/registry.ts";
import { TemplateRenderer } from "../templates/renderer.ts";
import { ALProjectManager } from "../compiler/al-project.ts";
import { CodeExtractor } from "../llm/code-extractor.ts";

export class DefaultTaskExecutor implements TaskExecutor {
  private templateRenderer: TemplateRenderer;

  constructor(templateDir: string = "templates") {
    this.templateRenderer = new TemplateRenderer(templateDir);
  }

  async executeTask(config: TaskExecutionConfig): Promise<TaskExecutionResult> {
    const startTime = Date.now();
    console.log(`🚀 Executing task: ${config.taskManifest.id} with ${config.llmModel}`);

    // Validate configuration
    const validationErrors = await this.validateTask(config.taskManifest);
    if (validationErrors.length > 0) {
      throw new Error(`Task validation failed: ${validationErrors.join(", ")}`);
    }

    // Initialize adapters with environment-based configuration
    const llmConfig = this.buildLLMConfig(config);
    const llmAdapter = LLMAdapterRegistry.create(config.llmProvider, llmConfig);
    
    // Validate LLM configuration
    const llmValidationErrors = llmAdapter.validateConfig(llmConfig);
    if (llmValidationErrors.length > 0) {
      throw new Error(`LLM configuration invalid: ${llmValidationErrors.join(", ")}`);
    }

    const containerProvider = ContainerProviderRegistry.create(config.containerProvider);
    
    // Ensure container is healthy
    if (!await containerProvider.isHealthy(config.containerName)) {
      throw new Error(`Container ${config.containerName} is not healthy`);
    }

    const attempts: AttemptResult[] = [];
    let finalResult: "pass" | "fail" = "fail";
    let passAttempt = 0;
    let totalTokens = 0;
    let totalCost = 0;
    
    // Execute up to maxAttempts
    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      console.log(`📝 Attempt ${attempt}/${config.maxAttempts} for task ${config.taskManifest.id}`);
      
      try {
        const attemptResult = await this.executeAttempt(
          config,
          attempt,
          llmAdapter,
          containerProvider,
          attempts[attempt - 2], // Previous attempt (if exists)
        );
        
        attempts.push(attemptResult);
        totalTokens += attemptResult.llmResponse.usage.totalTokens;
        totalCost += attemptResult.llmResponse.usage.estimatedCost || 0;
        
        if (attemptResult.passed && passAttempt === 0) {
          finalResult = "pass";
          passAttempt = attempt;
          console.log(`✅ Task ${config.taskManifest.id} passed on attempt ${attempt}`);
          break; // Success! No need to continue
        }
      } catch (error) {
        console.error(`❌ Attempt ${attempt} failed: ${error instanceof Error ? error.message : String(error)}`);
        
        // Create a failed attempt result
        attempts.push({
          attempt,
          llmResponse: {
            content: "",
            model: config.llmModel,
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            duration: 0,
            finishReason: "error",
          },
          generatedCode: "",
          compilationResult: {
            success: false,
            errors: [{ code: "EXEC_ERROR", message: error instanceof Error ? error.message : String(error), file: "", line: 0, column: 0, severity: "error" }],
            warnings: [],
            output: `Execution error: ${error instanceof Error ? error.message : String(error)}`,
            duration: 0,
          },
          passed: false,
          score: 0,
        });
      }
    }

    const totalDuration = Date.now() - startTime;
    const aggregateScore = this.calculateAggregateScore(attempts, passAttempt);

    console.log(`🏁 Task ${config.taskManifest.id} completed: ${finalResult} (attempt ${passAttempt || "none"})`);

    return {
      taskId: config.taskManifest.id,
      model: config.llmModel,
      attempts,
      finalResult,
      passAttempt,
      totalDuration,
      aggregateScore,
      metadata: {
        templateUsed: config.taskManifest.prompt_template,
        fixTemplateUsed: config.taskManifest.fix_template,
        totalTokens,
        totalCost,
        executionTime: new Date(),
      },
    };
  }

  private async executeAttempt(
    config: TaskExecutionConfig,
    attemptNumber: number,
    llmAdapter: any,
    containerProvider: any,
    previousAttempt?: AttemptResult,
  ): Promise<AttemptResult> {
    
    // Step 1: Generate prompt from template
    const prompt = await this.generatePrompt(config, attemptNumber, previousAttempt);
    
    // Step 2: Get code from LLM
    const generationResult = attemptNumber === 1
      ? await llmAdapter.generateCode(
          { prompt, temperature: config.temperature, maxTokens: config.maxTokens },
          { taskId: config.taskManifest.id, attempt: attemptNumber, description: config.taskManifest.description }
        )
      : await llmAdapter.generateFix(
          previousAttempt!.generatedCode,
          previousAttempt!.compilationResult.errors.map(e => e.message),
          { prompt, temperature: config.temperature, maxTokens: config.maxTokens },
          { taskId: config.taskManifest.id, attempt: attemptNumber, description: config.taskManifest.description }
        );

    console.log(`🎯 Generated ${generationResult.language} code (${generationResult.extractedFromDelimiters ? "from delimiters" : "whole response"})`);

    // Step 3: Create temporary AL project with generated code
    const tempProject = await this.createTempProject(config, generationResult.code, attemptNumber);
    
    // Step 4: Compile the code
    console.log(`🔨 Compiling generated code...`);
    const compilationResult = await containerProvider.compileProject(config.containerName, tempProject);
    
    // Step 5: Run tests if compilation succeeded
    let testResult;
    if (compilationResult.success && tempProject.testFiles.length > 0) {
      console.log(`🧪 Running tests...`);
      testResult = await containerProvider.runTests(config.containerName, tempProject);
    }

    // Step 6: Calculate if this attempt passed
    const passed = this.evaluateSuccess(config.taskManifest, compilationResult, testResult);
    const score = this.calculateAttemptScore(passed, attemptNumber, compilationResult, testResult);

    return {
      attempt: attemptNumber,
      llmResponse: generationResult.response,
      generatedCode: generationResult.code,
      compilationResult,
      testResult,
      passed,
      score,
    };
  }

  private async generatePrompt(
    config: TaskExecutionConfig,
    attemptNumber: number,
    previousAttempt?: AttemptResult,
  ): Promise<string> {
    
    if (attemptNumber === 1) {
      // First attempt: use main prompt template
      return await this.templateRenderer.render(config.taskManifest.prompt_template, {
        description: config.taskManifest.description,
        task_id: config.taskManifest.id,
        attempt: attemptNumber,
      });
    } else {
      // Second attempt: use fix template with error feedback
      const errors = previousAttempt?.compilationResult.errors.map(e => 
        `${e.file}:${e.line} - ${e.message}`
      ).join("\n") || "Unknown compilation errors";

      const errorSnippet = this.truncateErrors(errors, 2048);

      return await this.templateRenderer.render(config.taskManifest.fix_template, {
        description: config.taskManifest.description,
        task_id: config.taskManifest.id,
        attempt: attemptNumber,
        error_snippet: errorSnippet,
        previous_code: previousAttempt?.generatedCode || "",
        errors: errors,
      });
    }
  }

  private async createTempProject(
    config: TaskExecutionConfig,
    generatedCode: string,
    attemptNumber: number,
  ): Promise<any> {
    const tempDir = join(config.outputDir, "temp", `${config.taskManifest.id}_attempt_${attemptNumber}`);
    
    // Create temporary project
    const project = await ALProjectManager.createProject(tempDir, {
      id: "12345678-1234-1234-1234-123456789999",
      name: `${config.taskManifest.id} Attempt ${attemptNumber}`,
      publisher: "CentralGauge",
      version: "1.0.0.0",
      platform: "24.0.0.0",
      application: "24.0.0.0",
      idRanges: [{ from: 70000, to: 70099 }],
    });

    // Write generated code to AL file
    const codeFile = join(tempDir, "GeneratedCode.al");
    const cleanedCode = CodeExtractor.cleanCode(generatedCode, "al");
    await Deno.writeTextFile(codeFile, cleanedCode);
    
    // Reload project to include the generated file
    return await ALProjectManager.loadProject(tempDir);
  }

  private evaluateSuccess(
    manifest: TaskManifest,
    compilationResult: any,
    testResult?: any,
  ): boolean {
    // Task passes if compilation succeeds and expected conditions are met
    if (!compilationResult.success) {
      return false;
    }

    // If expected compilation is false, then success means it should NOT compile
    if (manifest.expected.compile === false) {
      return false; // Code compiled when it shouldn't have
    }

    // If tests are expected, they must pass
    if (testResult && !testResult.success) {
      return false;
    }

    return true;
  }

  private buildLLMConfig(config: TaskExecutionConfig): any {
    const baseConfig = {
      provider: config.llmProvider,
      model: config.llmModel,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    };

    // Add provider-specific configuration from environment variables
    switch (config.llmProvider) {
      case "openai":
        return {
          ...baseConfig,
          apiKey: Deno.env.get("OPENAI_API_KEY"),
          baseUrl: Deno.env.get("OPENAI_BASE_URL"),
        };
        
      case "anthropic":
        return {
          ...baseConfig,
          apiKey: Deno.env.get("ANTHROPIC_API_KEY"),
          baseUrl: Deno.env.get("ANTHROPIC_BASE_URL"),
        };
        
      case "gemini":
        return {
          ...baseConfig,
          apiKey: Deno.env.get("GOOGLE_API_KEY") || Deno.env.get("GEMINI_API_KEY"),
          baseUrl: Deno.env.get("GEMINI_BASE_URL"),
        };
        
      case "azure-openai":
        return {
          ...baseConfig,
          apiKey: Deno.env.get("AZURE_OPENAI_API_KEY"),
          baseUrl: Deno.env.get("AZURE_OPENAI_ENDPOINT"),
          deploymentName: Deno.env.get("AZURE_OPENAI_DEPLOYMENT_NAME") || config.llmModel,
          apiVersion: Deno.env.get("AZURE_OPENAI_API_VERSION"),
        };
        
      case "local":
        return {
          ...baseConfig,
          baseUrl: Deno.env.get("LOCAL_LLM_ENDPOINT") || Deno.env.get("OLLAMA_HOST"),
          apiKey: Deno.env.get("LOCAL_LLM_API_KEY"), // For secured local endpoints
        };
        
      default:
        return baseConfig;
    }
  }

  private calculateAttemptScore(
    passed: boolean,
    attemptNumber: number,
    compilationResult: any,
    testResult?: any,
  ): number {
    if (!passed) return 0;
    
    // Base score for passing
    let score = 1.0;
    
    // Penalty for requiring multiple attempts
    if (attemptNumber > 1) {
      score *= 0.75; // 25% penalty for second attempt
    }
    
    // Bonus for clean compilation (no warnings)
    if (compilationResult.warnings.length === 0) {
      score *= 1.1;
    }
    
    // Bonus for all tests passing with good performance
    if (testResult && testResult.success && testResult.failedTests === 0) {
      score *= 1.1;
    }
    
    return Math.min(score, 1.0); // Cap at 1.0
  }

  private calculateAggregateScore(attempts: AttemptResult[], passAttempt: number): number {
    if (passAttempt === 0) return 0; // Never passed
    
    const passingAttempt = attempts[passAttempt - 1];
    return passingAttempt.score;
  }

  private truncateErrors(errors: string, maxLength: number): string {
    if (errors.length <= maxLength) return errors;
    
    return errors.substring(0, maxLength - 3) + "...";
  }

  async validateTask(manifest: TaskManifest): Promise<string[]> {
    const errors: string[] = [];
    
    // Check required fields
    if (!manifest.id) errors.push("Task ID is required");
    if (!manifest.description) errors.push("Task description is required");
    if (!manifest.prompt_template) errors.push("Prompt template is required");
    if (!manifest.fix_template) errors.push("Fix template is required");
    
    // Check templates exist
    try {
      await this.templateRenderer.loadTemplate(manifest.prompt_template);
    } catch {
      errors.push(`Prompt template not found: ${manifest.prompt_template}`);
    }
    
    try {
      await this.templateRenderer.loadTemplate(manifest.fix_template);
    } catch {
      errors.push(`Fix template not found: ${manifest.fix_template}`);
    }
    
    // Validate max attempts
    if (manifest.max_attempts < 1 || manifest.max_attempts > 5) {
      errors.push("Max attempts must be between 1 and 5");
    }
    
    return errors;
  }
}

export async function loadTaskManifest(manifestPath: string): Promise<TaskManifest> {
  if (!await exists(manifestPath)) {
    throw new Error(`Task manifest not found: ${manifestPath}`);
  }
  
  const content = await Deno.readTextFile(manifestPath);
  const manifest = parse(content) as TaskManifest;
  
  return manifest;
}