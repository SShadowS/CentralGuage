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
import {
  createChunk,
  createFallbackUsage,
  createStreamState,
  finalizeStream,
  handleStreamError,
  type StreamState,
} from "./stream-handler.ts";

export class OpenAIAdapter implements StreamingLLMAdapter {
  readonly name = "openai";
  readonly supportsStreaming = true;
  readonly supportedModels = [
    // 2025 GPT-5 models
    "gpt-5.1",
    "gpt-5.2",
    "gpt-5-pro",
    "gpt-5.1-codex-mini",
    // GPT-4 models
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4-turbo",
    "gpt-4",
    // Reasoning models
    "o1-preview",
    "o1-mini",
    "o3-high",
    "o3-mini",
    // Legacy
    "gpt-3.5-turbo",
  ];

  private config: LLMConfig = {
    provider: "openai",
    model: "gpt-4o",
    temperature: 0.1,
    maxTokens: 4000,
    timeout: 30000,
  };

  private client: OpenAI | null = null;

  configure(config: LLMConfig): void {
    this.config = { ...this.config, ...config };
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      timeout: config.timeout,
    });
  }

  async generateCode(
    request: LLMRequest,
    context: GenerationContext,
  ): Promise<CodeGenerationResult> {
    console.log(
      `[OpenAI] Generating AL code for task: ${context.taskId} (attempt ${context.attempt})`,
    );

    let rawResponse: unknown;
    let response: LLMResponse;

    try {
      const result = await this.callOpenAI(request, true);
      response = result.response;
      rawResponse = result.rawResponse;
    } catch (error) {
      const debugLogger = DebugLogger.getInstance();
      if (debugLogger) {
        await debugLogger.logError(
          "openai",
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
        "openai",
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
      `[OpenAI] Generating fix for ${errors.length} error(s) in task: ${context.taskId}`,
    );

    let rawResponse: unknown;
    let response: LLMResponse;

    try {
      const result = await this.callOpenAI(request, true);
      response = result.response;
      rawResponse = result.rawResponse;
    } catch (error) {
      const debugLogger = DebugLogger.getInstance();
      if (debugLogger) {
        await debugLogger.logError(
          "openai",
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
        "openai",
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
      errors.push("API key is required for OpenAI");
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
      errors.push("Temperature must be between 0 and 2");
    }

    if (config.maxTokens !== undefined && config.maxTokens < 1) {
      errors.push("Max tokens must be greater than 0");
    }

    return errors;
  }

  private isCustomModel(model: string): boolean {
    return (
      model.startsWith("gpt-") ||
      model.startsWith("o1-") ||
      model.startsWith("o3-") ||
      model.includes("turbo") ||
      model.includes("high") ||
      model.includes("low") ||
      model.includes("medium") ||
      model.includes("codex")
    );
  }

  /**
   * Check if the model uses max_completion_tokens instead of max_tokens
   * GPT-5 series and reasoning models (o1, o3) use the new parameter
   */
  private usesMaxCompletionTokens(model: string): boolean {
    return (
      model.startsWith("gpt-5") ||
      model.startsWith("o1") ||
      model.startsWith("o3")
    );
  }

  /**
   * Check if the model is a reasoning-only model that doesn't support temperature
   * o1 and o3 models don't support temperature parameter
   */
  private isReasoningOnlyModel(model: string): boolean {
    return model.startsWith("o1") || model.startsWith("o3");
  }

  /**
   * Get reasoning effort for supported models (o1, o3, GPT-5)
   * Returns "low", "medium", or "high" if configured, undefined otherwise
   */
  private getReasoningEffort(): "low" | "medium" | "high" | undefined {
    const budget = this.config.thinkingBudget;
    if (typeof budget === "string") {
      const lower = budget.toLowerCase();
      if (lower === "low" || lower === "medium" || lower === "high") {
        return lower as "low" | "medium" | "high";
      }
    }
    return undefined;
  }

  estimateCost(promptTokens: number, completionTokens: number): number {
    const modelCosts: Record<string, { input: number; output: number }> = {
      // 2025 GPT-5 pricing (estimated)
      "gpt-5.1": { input: 0.01, output: 0.03 },
      "gpt-5.2": { input: 0.015, output: 0.045 },
      "gpt-5-pro": { input: 0.03, output: 0.09 },
      "gpt-5.1-codex-mini": { input: 0.003, output: 0.012 },
      // GPT-4 pricing
      "gpt-4o": { input: 0.0025, output: 0.01 },
      "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
      "gpt-4-turbo": { input: 0.01, output: 0.03 },
      "gpt-4": { input: 0.03, output: 0.06 },
      // Reasoning models
      "o1-preview": { input: 0.015, output: 0.06 },
      "o1-mini": { input: 0.003, output: 0.012 },
      "o3-high": { input: 0.02, output: 0.08 },
      "o3-mini": { input: 0.005, output: 0.02 },
      // Legacy
      "gpt-3.5-turbo": { input: 0.0005, output: 0.0015 },
    };

    const costs = modelCosts[this.config.model] ?? modelCosts["gpt-4o"];
    const inputCost = (promptTokens / 1000) * costs!.input;
    const outputCost = (completionTokens / 1000) * costs!.output;

    return inputCost + outputCost;
  }

  async isHealthy(): Promise<boolean> {
    try {
      const testRequest: LLMRequest = {
        prompt: "Say 'OK' if you can respond.",
        temperature: 0,
        maxTokens: 5,
      };

      await this.callOpenAI(testRequest);
      return true;
    } catch {
      return false;
    }
  }

  private async callOpenAI(
    request: LLMRequest,
    includeRaw = false,
  ): Promise<{ response: LLMResponse; rawResponse?: unknown }> {
    const startTime = Date.now();
    const client = this.ensureClient();
    const params = this.buildRequestParams(request);

    const completion = await client.chat.completions.create(
      params as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
    );

    const duration = Date.now() - startTime;
    const choice = completion.choices[0];
    const usage = this.buildUsageFromCompletion(completion.usage);

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

  /**
   * Ensures the OpenAI client is initialized.
   * @throws Error if API key is not configured.
   */
  private ensureClient(): OpenAI {
    if (this.client) {
      return this.client;
    }

    if (!this.config.apiKey) {
      throw new Error(
        "OpenAI API key not configured. Set OPENAI_API_KEY environment variable.",
      );
    }

    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
    });

    return this.client;
  }

  /**
   * Builds the messages array for the API request.
   */
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

  /**
   * Builds request parameters for OpenAI API calls.
   * Handles model-specific parameters (reasoning models, GPT-5, etc.)
   */
  private buildRequestParams(
    request: LLMRequest,
    stream = false,
  ): OpenAI.Chat.ChatCompletionCreateParams {
    const messages = this.buildMessages(request);
    const maxTokensValue = request.maxTokens ?? this.config.maxTokens ?? 4000;
    const usesNewTokenParam = this.usesMaxCompletionTokens(this.config.model);
    const isReasoningOnly = this.isReasoningOnlyModel(this.config.model);
    const reasoningEffort = this.getReasoningEffort();

    const params = {
      model: this.config.model,
      messages,
      // Reasoning models (o1, o3) don't support temperature
      ...(isReasoningOnly ? {} : {
        temperature: request.temperature ?? this.config.temperature ?? 0.1,
      }),
      ...(usesNewTokenParam
        ? { max_completion_tokens: maxTokensValue }
        : { max_tokens: maxTokensValue }),
      ...(request.stop ? { stop: request.stop } : {}),
      ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
    };

    if (stream) {
      return {
        ...params,
        stream: true,
        stream_options: { include_usage: true },
      } as OpenAI.Chat.ChatCompletionCreateParamsStreaming;
    }

    return params as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming;
  }

  /**
   * Builds token usage from completion response.
   */
  private buildUsageFromCompletion(
    usage: OpenAI.Completions.CompletionUsage | undefined,
  ): TokenUsage {
    return {
      promptTokens: usage?.prompt_tokens ?? 0,
      completionTokens: usage?.completion_tokens ?? 0,
      totalTokens: usage?.total_tokens ?? 0,
      estimatedCost: this.estimateCost(
        usage?.prompt_tokens ?? 0,
        usage?.completion_tokens ?? 0,
      ),
    };
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
      `[OpenAI] Streaming AL code for task: ${context.taskId} (attempt ${context.attempt})`,
    );

    const result = yield* this.streamOpenAI(request, options);

    // Extract code from accumulated response
    const extraction = CodeExtractor.extract(result.content, "al");

    // Log interaction
    const debugLogger = DebugLogger.getInstance();
    if (debugLogger) {
      await debugLogger.logInteraction(
        "openai",
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
      `[OpenAI] Streaming fix for ${errors.length} error(s) in task: ${context.taskId}`,
    );

    const result = yield* this.streamOpenAI(request, options);

    // Extract code from accumulated response
    const extraction = CodeExtractor.extract(result.content, "diff");

    // Log interaction
    const debugLogger = DebugLogger.getInstance();
    if (debugLogger) {
      await debugLogger.logInteraction(
        "openai",
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

  private async *streamOpenAI(
    request: LLMRequest,
    options?: StreamOptions,
  ): AsyncGenerator<StreamChunk, StreamResult, undefined> {
    const state = createStreamState();
    const client = this.ensureClient();
    const params = this.buildRequestParams(request, true);

    try {
      const stream = await client.chat.completions.create(
        params as OpenAI.Chat.ChatCompletionCreateParamsStreaming,
      );

      this.setupStreamAbortHandler(stream, options);

      const finalUsage = yield* this.processStreamChunks(
        stream,
        state,
        options,
      );

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

  /**
   * Sets up abort signal handling for a stream.
   */
  private setupStreamAbortHandler(
    stream: ReturnType<OpenAI["chat"]["completions"]["create"]> extends Promise<
      infer T
    > ? T
      : never,
    options?: StreamOptions,
  ): void {
    if (options?.abortSignal && "controller" in stream) {
      options.abortSignal.addEventListener("abort", () => {
        (stream as { controller: AbortController }).controller.abort();
      });
    }
  }

  /**
   * Processes stream chunks and yields text content.
   * Returns the final usage if provided by the API.
   */
  private async *processStreamChunks(
    stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
    state: StreamState,
    options?: StreamOptions,
  ): AsyncGenerator<StreamChunk, TokenUsage | undefined, undefined> {
    let finalUsage: TokenUsage | undefined;

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || "";

      if (content) {
        yield createChunk(content, state, options);
      }

      // Capture usage from final chunk (when stream_options.include_usage is true)
      if (chunk.usage) {
        finalUsage = this.buildUsageFromCompletion(chunk.usage);
      }
    }

    return finalUsage;
  }
}
