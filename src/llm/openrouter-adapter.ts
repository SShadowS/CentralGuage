import OpenAI from "@openai/openai";
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

const log = Logger.create("llm:openrouter");
import {
  DEFAULT_API_TIMEOUT_MS,
  DEFAULT_MAX_TOKENS,
  DEFAULT_TEMPERATURE,
} from "../constants.ts";
import { LLMProviderError } from "../errors.ts";
import {
  createChunk,
  createFallbackUsage,
  createStreamState,
  finalizeStream,
  handleStreamError,
} from "./stream-handler.ts";

/**
 * OpenRouter adapter using the OpenAI SDK with custom base URL.
 * OpenRouter provides an OpenAI-compatible API for accessing 400+ models.
 */
export class OpenRouterAdapter extends BaseLLMAdapter {
  readonly name = "openrouter";
  readonly supportedModels = [
    // OpenAI models via OpenRouter
    "openai/gpt-4o",
    "openai/gpt-4o-mini",
    "openai/gpt-5.1",
    "openai/o1-preview",
    "openai/o3-mini",
    // Anthropic models via OpenRouter
    "anthropic/claude-sonnet-4",
    "anthropic/claude-haiku-4",
    "anthropic/claude-opus-4",
    // Google models via OpenRouter
    "google/gemini-2.5-pro",
    "google/gemini-2.5-flash",
    // Meta models via OpenRouter
    "meta-llama/llama-3.3-70b-instruct",
    "meta-llama/llama-3.1-405b-instruct",
    // DeepSeek models
    "deepseek/deepseek-chat",
    "deepseek/deepseek-coder",
    // Qwen models
    "qwen/qwen-2.5-72b-instruct",
    // Mistral models
    "mistralai/mistral-large",
    "mistralai/codestral-latest",
  ];

  protected override config: LLMConfig = {
    provider: "openrouter",
    model: "openai/gpt-4o",
    temperature: DEFAULT_TEMPERATURE,
    maxTokens: DEFAULT_MAX_TOKENS,
    timeout: DEFAULT_API_TIMEOUT_MS,
  };

  private client: OpenAI | null = null;

  configure(config: LLMConfig): void {
    this.config = { ...this.config, ...config };
    if (config.apiKey) {
      this.client = new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl ?? "https://openrouter.ai/api/v1",
        timeout: config.timeout,
        defaultHeaders: {
          "HTTP-Referer": config.siteUrl ?? "https://github.com/centralgauge",
          "X-Title": config.siteName ?? "CentralGauge",
        },
      });
    }
  }

  validateConfig(config: LLMConfig): string[] {
    const errors: string[] = [];

    if (!config.apiKey) {
      errors.push("API key is required for OpenRouter");
    }

    if (!config.model) {
      errors.push("Model is required");
    } else if (
      !this.supportedModels.includes(config.model) &&
      !this.isCustomModel(config.model)
    ) {
      // OpenRouter supports 400+ models, so we allow most formats
      log.warn("Custom/unknown model (OpenRouter supports 400+ models)", {
        model: config.model,
      });
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

  private isCustomModel(model: string): boolean {
    // OpenRouter models typically follow provider/model format
    return model.includes("/");
  }

  estimateCost(promptTokens: number, completionTokens: number): number {
    // OpenRouter pricing varies by model - use conservative estimate based on model
    const modelCosts: Record<string, { input: number; output: number }> = {
      // OpenAI via OpenRouter
      "openai/gpt-4o": { input: 0.0025, output: 0.01 },
      "openai/gpt-4o-mini": { input: 0.00015, output: 0.0006 },
      "openai/gpt-5.1": { input: 0.01, output: 0.03 },
      "openai/o1-preview": { input: 0.015, output: 0.06 },
      "openai/o3-mini": { input: 0.005, output: 0.02 },
      // Anthropic via OpenRouter
      "anthropic/claude-sonnet-4": { input: 0.003, output: 0.015 },
      "anthropic/claude-haiku-4": { input: 0.001, output: 0.005 },
      "anthropic/claude-opus-4": { input: 0.015, output: 0.075 },
      // Google via OpenRouter
      "google/gemini-2.5-pro": { input: 0.00125, output: 0.005 },
      "google/gemini-2.5-flash": { input: 0.000075, output: 0.0003 },
      // Meta via OpenRouter
      "meta-llama/llama-3.3-70b-instruct": { input: 0.0008, output: 0.0008 },
      "meta-llama/llama-3.1-405b-instruct": { input: 0.003, output: 0.003 },
      // DeepSeek
      "deepseek/deepseek-chat": { input: 0.00014, output: 0.00028 },
      "deepseek/deepseek-coder": { input: 0.00014, output: 0.00028 },
      // Qwen
      "qwen/qwen-2.5-72b-instruct": { input: 0.0009, output: 0.0009 },
      // Mistral
      "mistralai/mistral-large": { input: 0.002, output: 0.006 },
      "mistralai/codestral-latest": { input: 0.001, output: 0.003 },
    };

    const defaultCost = { input: 0.005, output: 0.015 };
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
    const client = this.ensureClient();
    const messages = this.buildMessages(request);

    const completion = await client.chat.completions.create({
      model: this.config.model,
      messages,
      temperature: request.temperature ?? this.config.temperature ?? 0.1,
      max_tokens: request.maxTokens ?? this.config.maxTokens ?? 4000,
      ...(request.stop ? { stop: request.stop } : {}),
    });

    const duration = Date.now() - startTime;
    const choice = completion.choices[0];

    const usage: TokenUsage = {
      promptTokens: completion.usage?.prompt_tokens ?? 0,
      completionTokens: completion.usage?.completion_tokens ?? 0,
      totalTokens: completion.usage?.total_tokens ?? 0,
      estimatedCost: this.estimateCost(
        completion.usage?.prompt_tokens ?? 0,
        completion.usage?.completion_tokens ?? 0,
      ),
    };

    return {
      response: {
        content: choice?.message?.content ?? "",
        model: this.config.model,
        usage,
        duration,
        finishReason: this.mapFinishReason(choice?.finish_reason),
      },
      rawResponse: includeRaw ? completion : undefined,
    };
  }

  protected async *streamProvider(
    request: LLMRequest,
    options?: StreamOptions,
  ): AsyncGenerator<StreamChunk, StreamResult, undefined> {
    const state = createStreamState();
    const client = this.ensureClient();
    const messages = this.buildMessages(request);

    let finalUsage: TokenUsage | undefined;

    try {
      const stream = await client.chat.completions.create({
        model: this.config.model,
        messages,
        temperature: request.temperature ?? this.config.temperature ?? 0.1,
        max_tokens: request.maxTokens ?? this.config.maxTokens ?? 4000,
        ...(request.stop ? { stop: request.stop } : {}),
        stream: true,
        stream_options: { include_usage: true },
      });

      // Handle abort signal
      if (options?.abortSignal) {
        options.abortSignal.addEventListener("abort", () => {
          stream.controller.abort();
        });
      }

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";

        if (content) {
          yield createChunk(content, state, options);
        }

        // Capture usage from final chunk (when stream_options.include_usage is true)
        if (chunk.usage) {
          finalUsage = {
            promptTokens: chunk.usage.prompt_tokens,
            completionTokens: chunk.usage.completion_tokens,
            totalTokens: chunk.usage.total_tokens,
            estimatedCost: this.estimateCost(
              chunk.usage.prompt_tokens,
              chunk.usage.completion_tokens,
            ),
          };
        }
      }

      // Fallback usage estimation if not provided
      const usage: TokenUsage = finalUsage ??
        createFallbackUsage(request.prompt, state.accumulatedText);

      const { finalChunk, result } = finalizeStream({
        state,
        model: this.config.model,
        usage,
        finishReason: "stop",
        options,
      });

      yield finalChunk;
      return result;
    } catch (error) {
      handleStreamError(error, options);
    }
  }

  // ============================================================================
  // Private OpenRouter-specific helpers
  // ============================================================================

  private ensureClient(): OpenAI {
    if (this.client) {
      return this.client;
    }

    if (!this.config.apiKey) {
      throw new LLMProviderError(
        "OpenRouter API key not configured. Set OPENROUTER_API_KEY environment variable.",
        "openrouter",
        false,
      );
    }

    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseUrl ?? "https://openrouter.ai/api/v1",
      timeout: this.config.timeout,
      defaultHeaders: {
        "HTTP-Referer": this.config.siteUrl ??
          "https://github.com/centralgauge",
        "X-Title": this.config.siteName ?? "CentralGauge",
      },
    });

    return this.client;
  }

  private buildMessages(
    request: LLMRequest,
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
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
    return messages;
  }

  private mapFinishReason(
    reason: string | undefined | null,
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
