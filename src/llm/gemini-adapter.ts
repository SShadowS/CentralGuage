import { GoogleGenAI } from "@google/genai";
import type {
  CodeGenerationResult,
  GenerationContext,
  LLMConfig,
  LLMRequest,
  LLMResponse,
  StreamChunk,
  StreamingLLMAdapter,
  StreamOptions,
  StreamResult,
  TokenUsage,
} from "./types.ts";
import { CodeExtractor } from "./code-extractor.ts";
import { DebugLogger } from "../utils/debug-logger.ts";
import {
  createChunk,
  createStreamState,
  estimateTokens,
  finalizeStream,
  handleStreamError,
} from "./stream-handler.ts";

export class GeminiAdapter implements StreamingLLMAdapter {
  readonly name = "gemini";
  readonly supportsStreaming = true;
  readonly supportedModels = [
    // 2025 Gemini models
    "gemini-3",
    "gemini-3-flash-preview",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    // Gemini 2.0 models
    "gemini-2.0-flash-exp",
    "gemini-2.0-pro-exp",
    // Gemini 1.5 models
    "gemini-1.5-pro",
    "gemini-1.5-pro-002",
    "gemini-1.5-flash",
    "gemini-1.5-flash-002",
    // Legacy
    "gemini-1.0-pro",
  ];

  private config: LLMConfig = {
    provider: "gemini",
    model: "gemini-2.5-pro",
    temperature: 0.1,
    maxTokens: 8192,
    timeout: 30000,
  };

  private ai: GoogleGenAI | null = null;

  configure(config: LLMConfig): void {
    this.config = { ...this.config, ...config };
    if (config.apiKey) {
      this.ai = new GoogleGenAI({ apiKey: config.apiKey });
    }
  }

  async generateCode(
    request: LLMRequest,
    context: GenerationContext,
  ): Promise<CodeGenerationResult> {
    console.log(
      `[Gemini] Generating AL code for task: ${context.taskId} (attempt ${context.attempt})`,
    );

    let rawResponse: unknown;
    let response: LLMResponse;

    try {
      const result = await this.callGemini(request, true);
      response = result.response;
      rawResponse = result.rawResponse;
    } catch (error) {
      const debugLogger = DebugLogger.getInstance();
      if (debugLogger) {
        await debugLogger.logError(
          "gemini",
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
        "gemini",
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
      `[Gemini] Generating fix for ${errors.length} error(s) in task: ${context.taskId}`,
    );

    let rawResponse: unknown;
    let response: LLMResponse;

    try {
      const result = await this.callGemini(request, true);
      response = result.response;
      rawResponse = result.rawResponse;
    } catch (error) {
      const debugLogger = DebugLogger.getInstance();
      if (debugLogger) {
        await debugLogger.logError(
          "gemini",
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
        "gemini",
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
      errors.push("API key is required for Google Gemini");
    }

    if (!config.model) {
      errors.push("Model is required");
    } else if (
      !this.supportedModels.includes(config.model) &&
      !this.isCustomModel(config.model)
    ) {
      console.warn(
        `Custom/unknown model: ${config.model}. Known models: ${
          this.supportedModels.join(", ")
        }`,
      );
    }

    if (
      config.temperature !== undefined &&
      (config.temperature < 0 || config.temperature > 2)
    ) {
      errors.push("Temperature must be between 0 and 2 for Gemini");
    }

    if (config.maxTokens !== undefined && config.maxTokens < 1) {
      errors.push("Max tokens must be greater than 0");
    }

    return errors;
  }

  private isCustomModel(model: string): boolean {
    return (
      model.includes("gemini") ||
      model.includes("pro") ||
      model.includes("flash") ||
      model.includes("experimental") ||
      model.includes("thinking")
    );
  }

  estimateCost(promptTokens: number, completionTokens: number): number {
    const defaultCost = { input: 0.00125, output: 0.005 };
    const modelCosts: Record<string, { input: number; output: number }> = {
      // 2025 Gemini pricing (estimated)
      "gemini-3": { input: 0.005, output: 0.015 },
      "gemini-3-flash-preview": { input: 0.0001, output: 0.0004 },
      "gemini-2.5-pro": { input: 0.00125, output: 0.005 },
      "gemini-2.5-flash": { input: 0.000075, output: 0.0003 },
      // Gemini 2.0 pricing
      "gemini-2.0-flash-exp": { input: 0.0001, output: 0.0004 },
      "gemini-2.0-pro-exp": { input: 0.00125, output: 0.005 },
      // Gemini 1.5 pricing
      "gemini-1.5-pro": { input: 0.00125, output: 0.005 },
      "gemini-1.5-pro-002": { input: 0.00125, output: 0.005 },
      "gemini-1.5-flash": { input: 0.000075, output: 0.0003 },
      "gemini-1.5-flash-002": { input: 0.000075, output: 0.0003 },
      "gemini-1.0-pro": { input: 0.0005, output: 0.0015 },
    };

    const costs = modelCosts[this.config.model] ?? defaultCost;
    const inputCost = (promptTokens / 1000) * costs.input;
    const outputCost = (completionTokens / 1000) * costs.output;

    return inputCost + outputCost;
  }

  async isHealthy(): Promise<boolean> {
    try {
      const testRequest: LLMRequest = {
        prompt: "Say 'OK' if you can respond.",
        temperature: 0,
        maxTokens: 5,
      };

      await this.callGemini(testRequest);
      return true;
    } catch {
      return false;
    }
  }

  private async callGemini(
    request: LLMRequest,
    includeRaw = false,
  ): Promise<{ response: LLMResponse; rawResponse?: unknown }> {
    const startTime = Date.now();

    if (!this.ai) {
      if (!this.config.apiKey) {
        throw new Error(
          "Google API key not configured. Set GOOGLE_API_KEY environment variable.",
        );
      }
      this.ai = new GoogleGenAI({ apiKey: this.config.apiKey });
    }

    const apiResponse = await this.ai.models.generateContent({
      model: this.config.model,
      contents: request.prompt,
      config: {
        temperature: request.temperature ?? this.config.temperature ?? 0.1,
        maxOutputTokens: request.maxTokens ?? this.config.maxTokens ?? 8192,
        ...(request.stop ? { stopSequences: request.stop } : {}),
        ...(request.systemPrompt
          ? { systemInstruction: request.systemPrompt }
          : {}),
      },
    });

    const duration = Date.now() - startTime;
    const contentText = apiResponse.text ?? "";

    // Estimate tokens if not provided by the API
    const estimatedPromptTokens = Math.ceil(request.prompt.length / 4);
    const estimatedCompletionTokens = Math.ceil(contentText.length / 4);

    const usage: TokenUsage = {
      promptTokens: apiResponse.usageMetadata?.promptTokenCount ??
        estimatedPromptTokens,
      completionTokens: apiResponse.usageMetadata?.candidatesTokenCount ??
        estimatedCompletionTokens,
      totalTokens: apiResponse.usageMetadata?.totalTokenCount ??
        (estimatedPromptTokens + estimatedCompletionTokens),
      estimatedCost: this.estimateCost(
        apiResponse.usageMetadata?.promptTokenCount ?? estimatedPromptTokens,
        apiResponse.usageMetadata?.candidatesTokenCount ??
          estimatedCompletionTokens,
      ),
    };

    const llmResponse: LLMResponse = {
      content: contentText,
      model: this.config.model,
      usage,
      duration,
      finishReason: this.mapFinishReason(
        apiResponse.candidates?.[0]?.finishReason,
      ),
    };

    return {
      response: llmResponse,
      rawResponse: includeRaw ? apiResponse : undefined,
    };
  }

  private mapFinishReason(
    reason: string | undefined,
  ): "stop" | "length" | "content_filter" | "error" {
    switch (reason) {
      case "STOP":
        return "stop";
      case "MAX_TOKENS":
        return "length";
      case "SAFETY":
      case "RECITATION":
        return "content_filter";
      default:
        return "error";
    }
  }

  // ============================================================================
  // Streaming Methods
  // ============================================================================

  async *generateCodeStream(
    request: LLMRequest,
    context: GenerationContext,
    options?: StreamOptions,
  ): AsyncGenerator<StreamChunk, StreamResult, undefined> {
    console.log(
      `[Gemini] Streaming AL code for task: ${context.taskId} (attempt ${context.attempt})`,
    );

    const result = yield* this.streamGemini(request, options);

    // Extract code from accumulated response
    const extraction = CodeExtractor.extract(result.content, "al");

    // Log interaction
    const debugLogger = DebugLogger.getInstance();
    if (debugLogger) {
      await debugLogger.logInteraction(
        "gemini",
        "generateCode",
        request,
        context,
        result.response,
        extraction.code,
        extraction.extractedFromDelimiters,
        "al",
        undefined, // No raw response for streaming
      );
    }

    return result;
  }

  async *generateFixStream(
    _originalCode: string,
    errors: string[],
    request: LLMRequest,
    context: GenerationContext,
    options?: StreamOptions,
  ): AsyncGenerator<StreamChunk, StreamResult, undefined> {
    console.log(
      `[Gemini] Streaming fix for ${errors.length} error(s) in task: ${context.taskId}`,
    );

    const result = yield* this.streamGemini(request, options);

    // Extract code from accumulated response
    const extraction = CodeExtractor.extract(result.content, "diff");

    // Log interaction
    const debugLogger = DebugLogger.getInstance();
    if (debugLogger) {
      await debugLogger.logInteraction(
        "gemini",
        "generateFix",
        request,
        context,
        result.response,
        extraction.code,
        extraction.extractedFromDelimiters,
        extraction.language === "unknown" ? "diff" : extraction.language,
        undefined, // No raw response for streaming
      );
    }

    return result;
  }

  private async *streamGemini(
    request: LLMRequest,
    options?: StreamOptions,
  ): AsyncGenerator<StreamChunk, StreamResult, undefined> {
    const state = createStreamState();

    if (!this.ai) {
      if (!this.config.apiKey) {
        throw new Error(
          "Google API key not configured. Set GOOGLE_API_KEY environment variable.",
        );
      }
      this.ai = new GoogleGenAI({ apiKey: this.config.apiKey });
    }

    let lastFinishReason: string | undefined;
    // deno-lint-ignore no-explicit-any
    let usageMetadata: any;

    try {
      const stream = await this.ai.models.generateContentStream({
        model: this.config.model,
        contents: request.prompt,
        config: {
          temperature: request.temperature ?? this.config.temperature ?? 0.1,
          maxOutputTokens: request.maxTokens ?? this.config.maxTokens ?? 8192,
          ...(request.stop ? { stopSequences: request.stop } : {}),
          ...(request.systemPrompt
            ? { systemInstruction: request.systemPrompt }
            : {}),
        },
      });

      for await (const chunk of stream) {
        const text = chunk.text || "";

        if (text) {
          yield createChunk(text, state, options);
        }

        // Capture finish reason and usage metadata
        if (chunk.candidates?.[0]?.finishReason) {
          lastFinishReason = chunk.candidates[0].finishReason;
        }
        if (chunk.usageMetadata) {
          usageMetadata = chunk.usageMetadata;
        }
      }

      // Build usage from API metadata or estimate tokens
      const promptTokens = usageMetadata?.promptTokenCount ??
        estimateTokens(request.prompt);
      const completionTokens = usageMetadata?.candidatesTokenCount ??
        estimateTokens(state.accumulatedText);

      const usage: TokenUsage = {
        promptTokens,
        completionTokens,
        totalTokens: usageMetadata?.totalTokenCount ??
          (promptTokens + completionTokens),
        estimatedCost: this.estimateCost(promptTokens, completionTokens),
      };

      const { finalChunk, result } = finalizeStream({
        state,
        model: this.config.model,
        usage,
        finishReason: this.mapFinishReason(lastFinishReason),
        options,
      });

      yield finalChunk;
      return result;
    } catch (error) {
      handleStreamError(error, options);
    }
  }
}
