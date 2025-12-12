/**
 * Debug logger for capturing LLM requests and responses
 * Exports detailed interaction data for analysis and debugging
 */

import { exists } from "@std/fs";
import type { LLMRequest, LLMResponse, GenerationContext } from "../llm/types.ts";

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
      estimatedCost?: number;
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
    rawResponse?: any
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
      if (this.config.logLevel === "detailed" || this.config.logLevel === "verbose") {
        await this.writeDetailedLog(provider, requestId, {
          context,
          rawResponse: this.config.includeRawResponse ? rawResponse : undefined,
          logLevel: this.config.logLevel,
        });
      }

      console.log(`🔍 [Debug] Logged ${provider} ${operation} interaction: ${requestId}`);
      
    } catch (error) {
      console.warn(`⚠️  [Debug] Failed to log interaction: ${error instanceof Error ? error.message : String(error)}`);
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
    console.log(`📝 [Debug] Created log file for ${provider}: ${filePath}`);

    return filePath;
  }

  /**
   * Write a log entry to the provider's log file
   */
  private async writeLogEntry(filePath: string, entry: DebugLogEntry): Promise<void> {
    try {
      const logLine = JSON.stringify({
        type: "llm_interaction",
        ...entry,
      }) + "\n";

      await Deno.writeTextFile(filePath, logLine, { append: true });
      
      // Check file size and rotate if necessary
      await this.checkFileSize(filePath);
      
    } catch (error) {
      console.warn(`⚠️  [Debug] Failed to write log entry: ${error instanceof Error ? error.message : String(error)}`);
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
      rawResponse?: any;
      logLevel: string;
    }
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
        environment: details.logLevel === "verbose" ? {
          denoVersion: Deno.version.deno,
          v8Version: Deno.version.v8,
          typescriptVersion: Deno.version.typescript,
          workingDirectory: Deno.cwd(),
          args: Deno.args,
        } : undefined,
      };

      await Deno.writeTextFile(detailsFile, JSON.stringify(detailsData, null, 2));
      
    } catch (error) {
      console.warn(`⚠️  [Debug] Failed to write detailed log: ${error instanceof Error ? error.message : String(error)}`);
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
        const rotatedPath = filePath.replace(/\.jsonl$/, `-rotated-${timestamp}.jsonl`);
        await Deno.rename(filePath, rotatedPath);
        
        console.log(`🔄 [Debug] Rotated log file: ${rotatedPath}`);
        
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
    rawError?: any
  ): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      const requestId = `${provider}-error-${Date.now()}-${++this.requestCounter}`;
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

      await Deno.writeTextFile(logFile, JSON.stringify(errorEntry) + "\n", { append: true });
      console.log(`🔍 [Debug] Logged ${provider} error: ${requestId}`);
      
    } catch (logError) {
      console.warn(`⚠️  [Debug] Failed to log error: ${logError instanceof Error ? logError.message : String(logError)}`);
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
      const summaryFile = `${this.config.outputDir}/debug-summary-${this.config.sessionId}.json`;
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
          const lines = content.split('\n').filter(line => line.trim());
          
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
        totalRequests: Array.from(stats.values()).reduce((sum, stat) => sum + stat.requests, 0),
        totalErrors: Array.from(stats.values()).reduce((sum, stat) => sum + stat.errors, 0),
        totalTokens: Array.from(stats.values()).reduce((sum, stat) => sum + stat.totalTokens, 0),
        totalCost: Array.from(stats.values()).reduce((sum, stat) => sum + stat.totalCost, 0),
      };

      await Deno.writeTextFile(summaryFile, JSON.stringify(summary, null, 2));
      console.log(`📊 [Debug] Generated summary report: ${summaryFile}`);
      
    } catch (error) {
      console.warn(`⚠️  [Debug] Failed to generate summary: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Clean up and finalize debug session
   */
  async finalize(): Promise<void> {
    if (this.config.enabled) {
      await this.generateSummaryReport();
      console.log(`🔍 [Debug] Session finalized. Logs saved in: ${this.config.outputDir}`);
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
}