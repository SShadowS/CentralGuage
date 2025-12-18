import OpenAI from "@openai/openai";
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

/**
 * OpenRouter adapter using the OpenAI SDK with custom base URL.
 * OpenRouter provides an OpenAI-compatible API for accessing 400+ models.
 */
export class OpenRouterAdapter implements StreamingLLMAdapter {
  readonly name = "openrouter";
  readonly supportsStreaming = true;
  readonly supportedModels = [
    // OpenAI models via OpenRouter
    "openai/gpt-4o",
    "openai/gpt-4o-mini",
    "openai/gpt-5.1",
    "openai/o1-preview",
    "openai/o3-mini",
    // Anthropic models via OpenRouter
    "anthropic/claude-3.5-sonnet",
    "anthropic/claude-3.5-haiku",
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

  private config: LLMConfig = {
    provider: "openrouter",
    model: "openai/gpt-4o",
    temperature: 0.1,
    maxTokens: 4000,
    timeout: 30000,
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

  async generateCode(
    request: LLMRequest,
    context: GenerationContext,
  ): Promise<CodeGenerationResult> {
    console.log(
      `[OpenRouter] Generating AL code for task: ${context.taskId} (attempt ${context.attempt})`,
    );

    let rawResponse: unknown;
    let response: LLMResponse;

    try {
      const result = await this.callOpenRouter(request, true);
      response = result.response;
      rawResponse = result.rawResponse;
    } catch (error) {
      const debugLogger = DebugLogger.getInstance();
      if (debugLogger) {
        await debugLogger.logError(
          "openrouter",
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
        "openrouter",
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
      `[OpenRouter] Generating fix for ${errors.length} error(s) in task: ${context.taskId}`,
    );

    let rawResponse: unknown;
    let response: LLMResponse;

    try {
      const result = await this.callOpenRouter(request, true);
      response = result.response;
      rawResponse = result.rawResponse;
    } catch (error) {
      const debugLogger = DebugLogger.getInstance();
      if (debugLogger) {
        await debugLogger.logError(
          "openrouter",
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
        "openrouter",
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
      errors.push("API key is required for OpenRouter");
    }

    if (!config.model) {
      errors.push("Model is required");
    } else if (
      !this.supportedModels.includes(config.model) &&
      !this.isCustomModel(config.model)
    ) {
      // OpenRouter supports 400+ models, so we allow most formats
      console.warn(
        `Custom/unknown model: ${config.model}. OpenRouter supports 400+ models.`,
      );
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
      "anthropic/claude-3.5-sonnet": { input: 0.003, output: 0.015 },
      "anthropic/claude-3.5-haiku": { input: 0.001, output: 0.005 },
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

  async isHealthy(): Promise<boolean> {
    try {
      const testRequest: LLMRequest = {
        prompt: "Say 'OK' if you can respond.",
        temperature: 0,
        maxTokens: 5,
      };

      await this.callOpenRouter(testRequest);
      return true;
    } catch {
      return false;
    }
  }

  private async callOpenRouter(
    request: LLMRequest,
    includeRaw = false,
  ): Promise<{ response: LLMResponse; rawResponse?: unknown }> {
    const startTime = Date.now();

    if (!this.client) {
      if (!this.config.apiKey) {
        throw new Error(
          "OpenRouter API key not configured. Set OPENROUTER_API_KEY environment variable.",
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
    }

    // Build messages array with optional system prompt
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

    const completion = await this.client.chat.completions.create({
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

    const llmResponse: LLMResponse = {
      content: choice?.message?.content ?? "",
      model: this.config.model,
      usage,
      duration,
      finishReason: this.mapFinishReason(choice?.finish_reason),
    };

    return {
      response: llmResponse,
      rawResponse: includeRaw ? completion : undefined,
    };
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

  // ============================================================================
  // Streaming Methods
  // ============================================================================

  async *generateCodeStream(
    request: LLMRequest,
    context: GenerationContext,
    options?: StreamOptions,
  ): AsyncGenerator<StreamChunk, StreamResult, undefined> {
    console.log(
      `[OpenRouter] Streaming AL code for task: ${context.taskId} (attempt ${context.attempt})`,
    );

    const result = yield* this.streamOpenRouter(request, options);

    // Extract code from accumulated response
    const extraction = CodeExtractor.extract(result.content, "al");

    // Log interaction
    const debugLogger = DebugLogger.getInstance();
    if (debugLogger) {
      await debugLogger.logInteraction(
        "openrouter",
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
      `[OpenRouter] Streaming fix for ${errors.length} error(s) in task: ${context.taskId}`,
    );

    const result = yield* this.streamOpenRouter(request, options);

    // Extract code from accumulated response
    const extraction = CodeExtractor.extract(result.content, "diff");

    // Log interaction
    const debugLogger = DebugLogger.getInstance();
    if (debugLogger) {
      await debugLogger.logInteraction(
        "openrouter",
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

  private async *streamOpenRouter(
    request: LLMRequest,
    options?: StreamOptions,
  ): AsyncGenerator<StreamChunk, StreamResult, undefined> {
    const startTime = Date.now();

    if (!this.client) {
      if (!this.config.apiKey) {
        throw new Error(
          "OpenRouter API key not configured. Set OPENROUTER_API_KEY environment variable.",
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
    }

    // Build messages array with optional system prompt
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

    let accumulatedText = "";
    let chunkIndex = 0;
    let finalUsage: TokenUsage | undefined;

    try {
      const stream = await this.client.chat.completions.create({
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
          accumulatedText += content;

          const streamChunk: StreamChunk = {
            text: content,
            accumulatedText,
            done: false,
            index: chunkIndex++,
          };

          options?.onChunk?.(streamChunk);
          yield streamChunk;
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

      const duration = Date.now() - startTime;

      // Fallback usage estimation if not provided
      const usage: TokenUsage = finalUsage ?? {
        promptTokens: Math.ceil(request.prompt.length / 4),
        completionTokens: Math.ceil(accumulatedText.length / 4),
        totalTokens: Math.ceil(
          (request.prompt.length + accumulatedText.length) / 4,
        ),
        estimatedCost: 0,
      };

      const response: LLMResponse = {
        content: accumulatedText,
        model: this.config.model,
        usage,
        duration,
        finishReason: "stop",
      };

      const result: StreamResult = {
        content: accumulatedText,
        response,
        chunkCount: chunkIndex,
      };

      // Final chunk to signal completion
      const finalChunk: StreamChunk = {
        text: "",
        accumulatedText,
        done: true,
        usage,
        index: chunkIndex,
      };

      options?.onChunk?.(finalChunk);
      yield finalChunk;

      options?.onComplete?.(result);

      return result;
    } catch (error) {
      options?.onError?.(error as Error);
      throw error;
    }
  }
}
