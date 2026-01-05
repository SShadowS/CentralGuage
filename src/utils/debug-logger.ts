/**
 * Debug logger for capturing LLM requests and responses
 * Exports detailed interaction data for analysis and debugging
 */

import { exists } from "@std/fs";
import type {
  GenerationContext,
  LLMRequest,
  LLMResponse,
} from "../llm/types.ts";
import { Logger } from "../logger/mod.ts";

const log = Logger.create("debug-logger");

export interface DebugLogEntry {
  timestamp: string;
  provider: string;
  model: string;
  taskId: string;
  attempt: number;
  operation: "generateCode" | "generateFix";
  request: {
    prompt: string;
    temperature: number;
    maxTokens: number;
    stop?: string[] | undefined;
  };
  response: {
    content: string;
    model: string;
    usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      estimatedCost?: number | undefined;
    };
    duration: number;
    finishReason: string;
  };
  extractedCode: string;
  metadata: {
    extractedFromDelimiters: boolean;
    language: string;
    requestId: string;
    sessionId: string;
  };
}

export interface CompilationLogEntry {
  timestamp: string;
  taskId: string;
  model: string;
  attempt: number;
  containerName: string;
  success: boolean;
  errors: Array<{
    file: string;
    line: number;
    column: number;
    code: string;
    message: string;
    severity: string;
  }>;
  warnings: Array<{
    file: string;
    line: number;
    column: number;
    code: string;
    message: string;
    severity: string;
  }>;
  duration: number;
  output: string;
  artifactPath?: string | undefined;
  metadata: {
    requestId: string;
    sessionId: string;
  };
}

export interface TestLogEntry {
  timestamp: string;
  taskId: string;
  model: string;
  attempt: number;
  containerName: string;
  success: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  results: Array<{
    name: string;
    passed: boolean;
    duration: number;
    error?: string;
  }>;
  duration: number;
  output: string;
  metadata: {
    requestId: string;
    sessionId: string;
  };
}

export interface DebugConfig {
  enabled: boolean;
  outputDir: string;
  sessionId: string;
  logLevel: "basic" | "detailed" | "verbose";
  includeRawResponse: boolean;
  includeRequestHeaders: boolean;
  maxFileSize: number; // in MB
}

export class DebugLogger {
  private static instance: DebugLogger | null = null;
  private config: DebugConfig;
  private requestCounter = 0;
  private logFiles = new Map<string, string>(); // provider -> file path

  private constructor(config: DebugConfig) {
    this.config = config;
  }

  static initialize(config: DebugConfig): DebugLogger {
    DebugLogger.instance = new DebugLogger(config);
    return DebugLogger.instance;
  }

  static getInstance(): DebugLogger | null {
    return DebugLogger.instance;
  }

  static isEnabled(): boolean {
    return DebugLogger.instance?.config.enabled || false;
  }

  /**
   * Log an LLM request and response for debugging
   */
  async logInteraction(
    provider: string,
    operation: "generateCode" | "generateFix",
    request: LLMRequest,
    context: GenerationContext,
    response: LLMResponse,
    extractedCode: string,
    extractedFromDelimiters: boolean,
    language: string,
    rawResponse?: unknown,
  ): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      const requestId = `${provider}-${Date.now()}-${++this.requestCounter}`;

      const logEntry: DebugLogEntry = {
        timestamp: new Date().toISOString(),
        provider,
        model: response.model,
        taskId: context.taskId,
        attempt: context.attempt,
        operation,
        request: {
          prompt: request.prompt,
          temperature: request.temperature || 0.1,
          maxTokens: request.maxTokens || 4000,
          stop: request.stop,
        },
        response: {
          content: response.content,
          model: response.model,
          usage: response.usage,
          duration: response.duration,
          finishReason: response.finishReason,
        },
        extractedCode,
        metadata: {
          extractedFromDelimiters,
          language,
          requestId,
          sessionId: this.config.sessionId,
        },
      };

      // Create provider-specific log file
      const logFile = await this.getLogFile(provider);

      // Write basic log entry
      await this.writeLogEntry(logFile, logEntry);

      // Write detailed/verbose logs if requested
      if (
        this.config.logLevel === "detailed" ||
        this.config.logLevel === "verbose"
      ) {
        await this.writeDetailedLog(provider, requestId, {
          context,
          rawResponse: this.config.includeRawResponse ? rawResponse : undefined,
          logLevel: this.config.logLevel,
        });
      }

      log.debug("Logged interaction", { provider, operation, requestId });
    } catch (error) {
      log.warn("Failed to log interaction", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Log a compilation result for debugging
   */
  async logCompilation(
    taskId: string,
    model: string,
    attempt: number,
    containerName: string,
    result: {
      success: boolean;
      errors: Array<{
        file: string;
        line: number;
        column: number;
        code: string;
        message: string;
        severity: string;
      }>;
      warnings: Array<{
        file: string;
        line: number;
        column: number;
        code: string;
        message: string;
        severity: string;
      }>;
      output: string;
      duration: number;
      artifactPath?: string;
    },
  ): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      const requestId = `compile-${Date.now()}-${++this.requestCounter}`;

      const logEntry: CompilationLogEntry = {
        timestamp: new Date().toISOString(),
        taskId,
        model,
        attempt,
        containerName,
        success: result.success,
        errors: result.errors,
        warnings: result.warnings,
        duration: result.duration,
        output: result.output,
        artifactPath: result.artifactPath,
        metadata: {
          requestId,
          sessionId: this.config.sessionId,
        },
      };

      const logFile = await this.getLogFile("compilation");
      await this.writeCompilationEntry(logFile, logEntry);

      // Write full output to separate file for verbose logging
      if (this.config.logLevel === "verbose") {
        await this.writeCompilationOutput(requestId, result.output);
      }

      log.debug("Logged compilation result", {
        requestId,
        success: result.success,
      });
    } catch (error) {
      log.warn("Failed to log compilation", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Log a test result for debugging
   */
  async logTestResult(
    taskId: string,
    model: string,
    attempt: number,
    containerName: string,
    result: {
      success: boolean;
      totalTests: number;
      passedTests: number;
      failedTests: number;
      results: Array<{
        name: string;
        passed: boolean;
        duration: number;
        error?: string;
      }>;
      duration: number;
      output: string;
    },
  ): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      const requestId = `test-${Date.now()}-${++this.requestCounter}`;

      const logEntry: TestLogEntry = {
        timestamp: new Date().toISOString(),
        taskId,
        model,
        attempt,
        containerName,
        success: result.success,
        totalTests: result.totalTests,
        passedTests: result.passedTests,
        failedTests: result.failedTests,
        results: result.results,
        duration: result.duration,
        output: result.output,
        metadata: {
          requestId,
          sessionId: this.config.sessionId,
        },
      };

      const logFile = await this.getLogFile("tests");
      await this.writeTestEntry(logFile, logEntry);

      // Write full output to separate file for verbose logging
      if (this.config.logLevel === "verbose") {
        await this.writeTestOutput(requestId, result.output);
      }

      log.debug("Logged test result", {
        requestId,
        passed: result.passedTests,
        total: result.totalTests,
      });
    } catch (error) {
      log.warn("Failed to log test result", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Write a compilation log entry
   */
  private async writeCompilationEntry(
    filePath: string,
    entry: CompilationLogEntry,
  ): Promise<void> {
    try {
      const logLine = JSON.stringify({
        type: "compilation_result",
        ...entry,
      }) + "\n";

      await Deno.writeTextFile(filePath, logLine, { append: true });
      await this.checkFileSize(filePath);
    } catch (error) {
      log.warn("Failed to write compilation entry", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Write a test log entry
   */
  private async writeTestEntry(
    filePath: string,
    entry: TestLogEntry,
  ): Promise<void> {
    try {
      const logLine = JSON.stringify({
        type: "test_result",
        ...entry,
      }) + "\n";

      await Deno.writeTextFile(filePath, logLine, { append: true });
      await this.checkFileSize(filePath);
    } catch (error) {
      log.warn("Failed to write test entry", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Write full compilation output to a separate file
   */
  private async writeCompilationOutput(
    requestId: string,
    output: string,
  ): Promise<void> {
    try {
      const outputDir = `${this.config.outputDir}/compilation-output`;
      await Deno.mkdir(outputDir, { recursive: true });

      const outputFile = `${outputDir}/${requestId}.txt`;
      await Deno.writeTextFile(outputFile, output);
    } catch (error) {
      log.warn("Failed to write compilation output", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Write full test output to a separate file
   */
  private async writeTestOutput(
    requestId: string,
    output: string,
  ): Promise<void> {
    try {
      const outputDir = `${this.config.outputDir}/test-output`;
      await Deno.mkdir(outputDir, { recursive: true });

      const outputFile = `${outputDir}/${requestId}.txt`;
      await Deno.writeTextFile(outputFile, output);
    } catch (error) {
      log.warn("Failed to write test output", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get or create the log file for a provider
   */
  private async getLogFile(provider: string): Promise<string> {
    if (this.logFiles.has(provider)) {
      return this.logFiles.get(provider)!;
    }

    // Ensure debug output directory exists
    await Deno.mkdir(this.config.outputDir, { recursive: true });

    // Create provider-specific log file
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `${provider}-${timestamp}-${this.config.sessionId}.jsonl`;
    const filePath = `${this.config.outputDir}/${fileName}`;

    this.logFiles.set(provider, filePath);

    // Write header information
    const header = {
      type: "debug_session_start",
      timestamp: new Date().toISOString(),
      provider,
      sessionId: this.config.sessionId,
      config: {
        logLevel: this.config.logLevel,
        includeRawResponse: this.config.includeRawResponse,
        includeRequestHeaders: this.config.includeRequestHeaders,
      },
      centralgauge: {
        version: "0.1.0",
        platform: Deno.build.os,
        arch: Deno.build.arch,
      },
    };

    await Deno.writeTextFile(filePath, JSON.stringify(header) + "\n");
    log.debug("Created log file", { provider, filePath });

    return filePath;
  }

  /**
   * Write a log entry to the provider's log file
   */
  private async writeLogEntry(
    filePath: string,
    entry: DebugLogEntry,
  ): Promise<void> {
    try {
      const logLine = JSON.stringify({
        type: "llm_interaction",
        ...entry,
      }) + "\n";

      await Deno.writeTextFile(filePath, logLine, { append: true });

      // Check file size and rotate if necessary
      await this.checkFileSize(filePath);
    } catch (error) {
      log.warn("Failed to write log entry", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Write detailed debug information
   */
  private async writeDetailedLog(
    provider: string,
    requestId: string,
    details: {
      context: GenerationContext;
      rawResponse?: unknown;
      logLevel: string;
    },
  ): Promise<void> {
    try {
      const detailsDir = `${this.config.outputDir}/details`;
      await Deno.mkdir(detailsDir, { recursive: true });

      const detailsFile = `${detailsDir}/${requestId}.json`;
      const detailsData = {
        type: "detailed_debug",
        requestId,
        provider,
        timestamp: new Date().toISOString(),
        context: details.context,
        rawResponse: details.rawResponse,
        environment: details.logLevel === "verbose"
          ? {
            denoVersion: Deno.version.deno,
            v8Version: Deno.version.v8,
            typescriptVersion: Deno.version.typescript,
            workingDirectory: Deno.cwd(),
            args: Deno.args,
          }
          : undefined,
      };

      await Deno.writeTextFile(
        detailsFile,
        JSON.stringify(detailsData, null, 2),
      );
    } catch (error) {
      log.warn("Failed to write detailed log", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Check file size and rotate if necessary
   */
  private async checkFileSize(filePath: string): Promise<void> {
    try {
      const stat = await Deno.stat(filePath);
      const sizeMB = stat.size / (1024 * 1024);

      if (sizeMB > this.config.maxFileSize) {
        // Rotate log file
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const rotatedPath = filePath.replace(
          /\.jsonl$/,
          `-rotated-${timestamp}.jsonl`,
        );
        await Deno.rename(filePath, rotatedPath);

        log.debug("Rotated log file", { rotatedPath });

        // Remove the file from cache so a new one will be created
        for (const [provider, path] of this.logFiles.entries()) {
          if (path === filePath) {
            this.logFiles.delete(provider);
            break;
          }
        }
      }
    } catch {
      // Ignore errors in file size checking
    }
  }

  /**
   * Log an error that occurred during LLM interaction
   */
  async logError(
    provider: string,
    operation: "generateCode" | "generateFix",
    request: LLMRequest,
    context: GenerationContext,
    error: Error,
    rawError?: unknown,
  ): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      const requestId = `${provider}-error-${Date.now()}-${++this
        .requestCounter}`;
      const logFile = await this.getLogFile(provider);

      const errorEntry = {
        type: "llm_error",
        timestamp: new Date().toISOString(),
        provider,
        taskId: context.taskId,
        attempt: context.attempt,
        operation,
        request: {
          prompt: request.prompt.substring(0, 200) + "...", // Truncated for error logs
          temperature: request.temperature || 0.1,
          maxTokens: request.maxTokens || 4000,
        },
        error: {
          message: error.message,
          name: error.name,
          stack: error.stack,
        },
        rawError: this.config.includeRawResponse ? rawError : undefined,
        metadata: {
          requestId,
          sessionId: this.config.sessionId,
        },
      };

      await Deno.writeTextFile(logFile, JSON.stringify(errorEntry) + "\n", {
        append: true,
      });
      log.debug("Logged error", { provider, requestId });
    } catch (logError) {
      log.warn("Failed to log error", {
        error: logError instanceof Error ? logError.message : String(logError),
      });
    }
  }

  /**
   * Generate a summary report of the debug session
   */
  async generateSummaryReport(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      const summaryFile =
        `${this.config.outputDir}/debug-summary-${this.config.sessionId}.json`;
      const stats = new Map<string, {
        requests: number;
        errors: number;
        totalTokens: number;
        totalCost: number;
        avgDuration: number;
      }>();

      // Analyze all log files
      for (const [provider, logFile] of this.logFiles.entries()) {
        if (await exists(logFile)) {
          const content = await Deno.readTextFile(logFile);
          const lines = content.split("\n").filter((line) => line.trim());

          let requests = 0;
          let errors = 0;
          let totalTokens = 0;
          let totalCost = 0;
          let totalDuration = 0;

          for (const line of lines) {
            try {
              const entry = JSON.parse(line);
              if (entry.type === "llm_interaction") {
                requests++;
                totalTokens += entry.response.usage.totalTokens || 0;
                totalCost += entry.response.usage.estimatedCost || 0;
                totalDuration += entry.response.duration || 0;
              } else if (entry.type === "llm_error") {
                errors++;
              }
            } catch {
              // Skip malformed lines
            }
          }

          stats.set(provider, {
            requests,
            errors,
            totalTokens,
            totalCost,
            avgDuration: requests > 0 ? totalDuration / requests : 0,
          });
        }
      }

      const summary = {
        type: "debug_summary",
        timestamp: new Date().toISOString(),
        sessionId: this.config.sessionId,
        config: this.config,
        statistics: Object.fromEntries(stats),
        totalRequests: Array.from(stats.values()).reduce(
          (sum, stat) => sum + stat.requests,
          0,
        ),
        totalErrors: Array.from(stats.values()).reduce(
          (sum, stat) => sum + stat.errors,
          0,
        ),
        totalTokens: Array.from(stats.values()).reduce(
          (sum, stat) => sum + stat.totalTokens,
          0,
        ),
        totalCost: Array.from(stats.values()).reduce(
          (sum, stat) => sum + stat.totalCost,
          0,
        ),
      };

      await Deno.writeTextFile(summaryFile, JSON.stringify(summary, null, 2));
      log.debug("Generated summary report", { summaryFile });
    } catch (error) {
      log.warn("Failed to generate summary", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Clean up and finalize debug session
   */
  async finalize(): Promise<void> {
    if (this.config.enabled) {
      await this.generateSummaryReport();
      log.debug("Session finalized", { outputDir: this.config.outputDir });
    }
  }

  /**
   * Get debug statistics for the current session
   */
  getSessionStats(): { totalRequests: number; providersUsed: string[] } {
    return {
      totalRequests: this.requestCounter,
      providersUsed: Array.from(this.logFiles.keys()),
    };
  }

  /**
   * Save AL project and compiled artifacts when verbose logging is enabled
   * @param taskId - Task identifier
   * @param model - Model/variant identifier
   * @param attempt - Attempt number
   * @param projectDir - Path to temp project directory (contains .al files, app.json)
   * @param artifactPath - Path to compiled .app file (optional, may not exist if compile failed)
   */
  async saveVerboseArtifacts(
    taskId: string,
    model: string,
    attempt: number,
    projectDir: string,
    artifactPath?: string,
  ): Promise<void> {
    if (!this.config.enabled || this.config.logLevel !== "verbose") {
      return;
    }

    try {
      // Sanitize model name for filesystem safety
      const sanitizedModel = model.replace(/[\/\\:*?"<>|]/g, "_");
      const artifactDir =
        `${this.config.outputDir}/artifacts/${taskId}/${sanitizedModel}/attempt_${attempt}`;
      await Deno.mkdir(artifactDir, { recursive: true });

      // Copy entire project directory (preserves all .al files, app.json)
      const projectDestDir = `${artifactDir}/project`;
      await this.copyDirectory(projectDir, projectDestDir);

      // Copy .app file if it exists
      if (artifactPath) {
        try {
          const stat = await Deno.stat(artifactPath);
          if (stat.isFile) {
            const outputDir = `${artifactDir}/output`;
            await Deno.mkdir(outputDir, { recursive: true });
            const appFileName = artifactPath.split(/[/\\]/).pop() ||
              "compiled.app";
            await Deno.copyFile(artifactPath, `${outputDir}/${appFileName}`);
          }
        } catch {
          // .app file doesn't exist or can't be accessed, skip
        }
      }

      log.debug("Saved verbose artifacts", { artifactDir });
    } catch (error) {
      log.warn("Failed to save verbose artifacts", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Recursively copy a directory
   */
  private async copyDirectory(src: string, dest: string): Promise<void> {
    await Deno.mkdir(dest, { recursive: true });

    for await (const entry of Deno.readDir(src)) {
      const srcPath = `${src}/${entry.name}`;
      const destPath = `${dest}/${entry.name}`;

      if (entry.isDirectory) {
        // Skip output directory to avoid duplication (we handle .app separately)
        if (entry.name !== "output") {
          await this.copyDirectory(srcPath, destPath);
        }
      } else if (entry.isFile) {
        await Deno.copyFile(srcPath, destPath);
      }
    }
  }
}
