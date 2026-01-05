import { GoogleGenAI } from "@google/genai";
import type {
  LLMConfig,
  LLMRequest,
  StreamChunk,
  StreamOptions,
  StreamResult,
  TokenUsage,
} from "./types.ts";
import { BaseLLMAdapter, type ProviderCallResult } from "./base-adapter.ts";
import { Logger } from "../logger/mod.ts";

const log = Logger.create("llm:gemini");
import {
  DEFAULT_API_TIMEOUT_MS,
  DEFAULT_TEMPERATURE,
  GEMINI_DEFAULT_MAX_TOKENS,
} from "../constants.ts";
import { LLMProviderError } from "../errors.ts";
import {
  createChunk,
  createStreamState,
  estimateTokens,
  finalizeStream,
  handleStreamError,
} from "./stream-handler.ts";

/** Token usage metadata from Gemini API responses */
interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

export class GeminiAdapter extends BaseLLMAdapter {
  readonly name = "gemini";
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

  protected override config: LLMConfig = {
    provider: "gemini",
    model: "gemini-2.5-pro",
    temperature: DEFAULT_TEMPERATURE,
    maxTokens: GEMINI_DEFAULT_MAX_TOKENS,
    timeout: DEFAULT_API_TIMEOUT_MS,
  };

  private ai: GoogleGenAI | null = null;

  configure(config: LLMConfig): void {
    this.config = { ...this.config, ...config };
    if (config.apiKey) {
      this.ai = new GoogleGenAI({ apiKey: config.apiKey });
    }
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
      log.warn("Custom/unknown model", {
        model: config.model,
        knownModels: this.supportedModels,
      });
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

  // ============================================================================
  // Provider-specific implementations (abstract method overrides)
  // ============================================================================

  protected async callProvider(
    request: LLMRequest,
    includeRaw = false,
  ): Promise<ProviderCallResult> {
    const startTime = Date.now();
    const ai = this.ensureClient();

    const apiResponse = await ai.models.generateContent({
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

    return {
      response: {
        content: contentText,
        model: this.config.model,
        usage,
        duration,
        finishReason: this.mapFinishReason(
          apiResponse.candidates?.[0]?.finishReason,
        ),
      },
      rawResponse: includeRaw ? apiResponse : undefined,
    };
  }

  protected async *streamProvider(
    request: LLMRequest,
    options?: StreamOptions,
  ): AsyncGenerator<StreamChunk, StreamResult, undefined> {
    const state = createStreamState();
    const ai = this.ensureClient();

    let lastFinishReason: string | undefined;
    let usageMetadata: GeminiUsageMetadata | undefined;

    try {
      const stream = await ai.models.generateContentStream({
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

  // ============================================================================
  // Private Gemini-specific helpers
  // ============================================================================

  private ensureClient(): GoogleGenAI {
    if (this.ai) {
      return this.ai;
    }

    if (!this.config.apiKey) {
      throw new LLMProviderError(
        "Google API key not configured. Set GOOGLE_API_KEY environment variable.",
        "gemini",
        false,
      );
    }

    this.ai = new GoogleGenAI({ apiKey: this.config.apiKey });
    return this.ai;
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
}
