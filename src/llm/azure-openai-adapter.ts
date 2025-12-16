import type {
  CodeGenerationResult,
  GenerationContext,
  LLMAdapter,
  LLMConfig,
  LLMRequest,
  LLMResponse,
  TokenUsage,
} from "./types.ts";
import { CodeExtractor } from "./code-extractor.ts";
import { DebugLogger } from "../utils/debug-logger.ts";
import * as colors from "@std/fmt/colors";

export class AzureOpenAIAdapter implements LLMAdapter {
  readonly name = "azure-openai";
  readonly supportedModels = [
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4-turbo",
    "gpt-4",
    "gpt-35-turbo", // Azure uses 35 instead of 3.5
    "gpt-3.5-turbo",
  ];

  private config: LLMConfig = {
    provider: "azure-openai",
    model: "gpt-4o",
    temperature: 0.1,
    maxTokens: 4000,
    timeout: 30000,
  };

  configure(config: LLMConfig): void {
    this.config = { ...this.config, ...config };
  }

  async generateCode(
    request: LLMRequest,
    context: GenerationContext,
  ): Promise<CodeGenerationResult> {
    console.log(
      colors.green(
        `[Azure OpenAI] Generating AL code for task: ${context.taskId} (attempt ${context.attempt})`,
      ),
    );

    let rawResponse: unknown;
    let response: LLMResponse;

    try {
      const result = await this.callAzureOpenAI(request, true);
      response = result.response;
      rawResponse = result.rawResponse;
    } catch (error) {
      const debugLogger = DebugLogger.getInstance();
      if (debugLogger) {
        await debugLogger.logError(
          "azure-openai",
          "generateCode",
          request,
          context,
          error as Error,
          rawResponse,
        );
      }
      throw error;
    }

    const extraction = CodeExtractor.extract(response.content, "al");

    const debugLogger = DebugLogger.getInstance();
    if (debugLogger) {
      await debugLogger.logInteraction(
        "azure-openai",
        "generateCode",
        request,
        context,
        response,
        extraction.code,
        extraction.extractedFromDelimiters,
        "al",
        rawResponse,
      );
    }

    return {
      code: extraction.code,
      language: "al",
      response,
      extractedFromDelimiters: extraction.extractedFromDelimiters,
    };
  }

  async generateFix(
    _originalCode: string,
    errors: string[],
    request: LLMRequest,
    context: GenerationContext,
  ): Promise<CodeGenerationResult> {
    console.log(
      colors.green(
        `[Azure OpenAI] Generating fix for ${errors.length} error(s) in task: ${context.taskId}`,
      ),
    );

    let rawResponse: unknown;
    let response: LLMResponse;

    try {
      const result = await this.callAzureOpenAI(request, true);
      response = result.response;
      rawResponse = result.rawResponse;
    } catch (error) {
      const debugLogger = DebugLogger.getInstance();
      if (debugLogger) {
        await debugLogger.logError(
          "azure-openai",
          "generateFix",
          request,
          context,
          error as Error,
          rawResponse,
        );
      }
      throw error;
    }

    const extraction = CodeExtractor.extract(response.content, "diff");

    const debugLogger = DebugLogger.getInstance();
    if (debugLogger) {
      await debugLogger.logInteraction(
        "azure-openai",
        "generateFix",
        request,
        context,
        response,
        extraction.code,
        extraction.extractedFromDelimiters,
        extraction.language === "unknown" ? "diff" : extraction.language,
        rawResponse,
      );
    }

    return {
      code: extraction.code,
      language: extraction.language === "unknown"
        ? "diff"
        : extraction.language,
      response,
      extractedFromDelimiters: extraction.extractedFromDelimiters,
    };
  }

  validateConfig(config: LLMConfig): string[] {
    const errors: string[] = [];

    if (!config.apiKey) {
      errors.push("API key is required for Azure OpenAI");
    }

    if (!config.baseUrl && !Deno.env.get("AZURE_OPENAI_ENDPOINT")) {
      errors.push(
        "Azure OpenAI endpoint is required. Set AZURE_OPENAI_ENDPOINT or provide baseUrl in config.",
      );
    }

    if (!config.deploymentName && !config.model) {
      errors.push("Deployment name is required for Azure OpenAI");
    }

    if (
      config.temperature !== undefined &&
      (config.temperature < 0 || config.temperature > 2)
    ) {
      errors.push("Temperature must be between 0 and 2");
    }

    if (config.maxTokens !== undefined && config.maxTokens < 1) {
      errors.push("Max tokens must be greater than 0");
    }

    return errors;
  }

  estimateCost(promptTokens: number, completionTokens: number): number {
    // Azure OpenAI pricing varies by region and contract
    // These are rough estimates based on standard pricing
    const defaultCost = { input: 0.005, output: 0.015 };
    const modelCosts: Record<string, { input: number; output: number }> = {
      "gpt-4o": { input: 0.005, output: 0.015 },
      "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
      "gpt-4-turbo": { input: 0.01, output: 0.03 },
      "gpt-4": { input: 0.03, output: 0.06 },
      "gpt-35-turbo": { input: 0.0005, output: 0.0015 },
      "gpt-3.5-turbo": { input: 0.0005, output: 0.0015 },
    };

    const costs = modelCosts[this.config.model] ?? defaultCost;
    const inputCost = (promptTokens / 1000) * costs.input;
    const outputCost = (completionTokens / 1000) * costs.output;

    return inputCost + outputCost;
  }

  async isHealthy(): Promise<boolean> {
    try {
      // Simple health check with minimal request
      const testRequest: LLMRequest = {
        prompt: "Say 'OK' if you can respond.",
        temperature: 0,
        maxTokens: 5,
      };

      await this.callAzureOpenAI(testRequest);
      return true;
    } catch {
      return false;
    }
  }

  private async callAzureOpenAI(
    request: LLMRequest,
    includeRaw = false,
  ): Promise<{ response: LLMResponse; rawResponse?: unknown }> {
    const startTime = Date.now();

    if (!this.config.apiKey) {
      throw new Error(
        "Azure OpenAI API key not configured. Set AZURE_OPENAI_API_KEY environment variable.",
      );
    }

    // Construct Azure OpenAI endpoint URL
    const endpoint = this.config.baseUrl ||
      Deno.env.get("AZURE_OPENAI_ENDPOINT");
    if (!endpoint) {
      throw new Error("Azure OpenAI endpoint not configured");
    }

    const deploymentName = this.config.deploymentName || this.config.model;
    const apiVersion = this.config.apiVersion || "2024-02-15-preview";

    const url =
      `${endpoint}/openai/deployments/${deploymentName}/chat/completions?api-version=${apiVersion}`;

    // Build messages array with optional system prompt
    const messages: Array<{ role: string; content: string }> = [];
    if (request.systemPrompt) {
      messages.push({
        role: "system",
        content: request.systemPrompt,
      });
    }
    messages.push({
      role: "user",
      content: request.prompt,
    });

    const payload = {
      messages,
      temperature: request.temperature ?? this.config.temperature ?? 0.1,
      max_tokens: request.maxTokens ?? this.config.maxTokens ?? 4000,
      stop: request.stop,
    };

    const apiResponse = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": this.config.apiKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.config.timeout || 30000),
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      throw new Error(
        `Azure OpenAI API error (${apiResponse.status}): ${errorText}`,
      );
    }

    const data = await apiResponse.json();
    const duration = Date.now() - startTime;

    if (!data.choices || data.choices.length === 0) {
      throw new Error("No response from Azure OpenAI API");
    }

    const choice = data.choices[0];
    const usage: TokenUsage = {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
      estimatedCost: this.estimateCost(
        data.usage?.prompt_tokens || 0,
        data.usage?.completion_tokens || 0,
      ),
    };

    const llmResponse: LLMResponse = {
      content: choice.message?.content || "",
      model: deploymentName,
      usage,
      duration,
      finishReason: this.mapFinishReason(choice.finish_reason),
    };

    return {
      response: llmResponse,
      rawResponse: includeRaw ? data : undefined,
    };
  }

  private mapFinishReason(
    reason: string | undefined,
  ): "stop" | "length" | "content_filter" | "error" {
    switch (reason) {
      case "stop":
        return "stop";
      case "length":
        return "length";
      case "content_filter":
        return "content_filter";
      default:
        return "error";
    }
  }
}
