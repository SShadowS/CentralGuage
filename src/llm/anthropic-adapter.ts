import Anthropic from "@anthropic-ai/sdk";
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
  finalizeStream,
  handleStreamError,
  type StreamState,
} from "./stream-handler.ts";

export class AnthropicAdapter implements StreamingLLMAdapter {
  readonly name = "anthropic";
  readonly supportsStreaming = true;
  readonly supportedModels = [
    // Claude 4.5 models (latest)
    "claude-opus-4-5-20251101",
    "claude-sonnet-4-5-20250929",
    "claude-haiku-4-5-20251001",
    // Claude 4.5 aliases
    "claude-opus-4-5",
    "claude-sonnet-4-5",
    "claude-haiku-4-5",
    // Claude 4 models (legacy)
    "claude-opus-4-1-20250805",
    "claude-opus-4-20250514",
    "claude-sonnet-4-20250514",
    "claude-3-7-sonnet-20250219",
    // Claude 4 aliases
    "claude-opus-4-1",
    "claude-opus-4-0",
    "claude-sonnet-4-0",
    "claude-3-7-sonnet-latest",
    // Claude 3.5 models (legacy)
    "claude-3-5-haiku-20241022",
    "claude-3-5-haiku-latest",
    // Claude 3 models (legacy)
    "claude-3-haiku-20240307",
  ];

  private config: LLMConfig = {
    provider: "anthropic",
    model: "claude-sonnet-4-5-20250929",
    temperature: 0.1,
    maxTokens: 4000,
    timeout: 30000,
  };

  private client: Anthropic | null = null;

  configure(config: LLMConfig): void {
    this.config = { ...this.config, ...config };
    this.client = new Anthropic({
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
      `[Anthropic] Generating AL code for task: ${context.taskId} (attempt ${context.attempt})`,
    );

    let rawResponse: unknown;
    let response: LLMResponse;

    try {
      const result = await this.callAnthropic(request, true);
      response = result.response;
      rawResponse = result.rawResponse;
    } catch (error) {
      const debugLogger = DebugLogger.getInstance();
      if (debugLogger) {
        await debugLogger.logError(
          "anthropic",
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
        "anthropic",
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
      `[Anthropic] Generating fix for ${errors.length} error(s) in task: ${context.taskId}`,
    );

    let rawResponse: unknown;
    let response: LLMResponse;

    try {
      const result = await this.callAnthropic(request, true);
      response = result.response;
      rawResponse = result.rawResponse;
    } catch (error) {
      const debugLogger = DebugLogger.getInstance();
      if (debugLogger) {
        await debugLogger.logError(
          "anthropic",
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
        "anthropic",
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
      errors.push("API key is required for Anthropic");
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
      (config.temperature < 0 || config.temperature > 1)
    ) {
      errors.push("Temperature must be between 0 and 1 for Anthropic");
    }

    if (
      config.maxTokens !== undefined &&
      (config.maxTokens < 1 || config.maxTokens > 200000)
    ) {
      errors.push("Max tokens must be between 1 and 200000 for Anthropic");
    }

    // Validate thinking budget constraint: max_tokens must be > thinking_budget
    if (
      typeof config.thinkingBudget === "number" &&
      typeof config.maxTokens === "number" &&
      config.maxTokens <= config.thinkingBudget
    ) {
      errors.push(
        `maxTokens (${config.maxTokens}) must be greater than thinkingBudget (${config.thinkingBudget}). ` +
          `Use tokens=${config.thinkingBudget + 1000} or higher.`,
      );
    }

    return errors;
  }

  private isCustomModel(model: string): boolean {
    return (
      model.includes("claude") ||
      model.includes("sonnet") ||
      model.includes("haiku") ||
      model.includes("opus") ||
      model.includes("think")
    );
  }

  estimateCost(promptTokens: number, completionTokens: number): number {
    const defaultCost = { input: 0.003, output: 0.015 };
    const modelCosts: Record<string, { input: number; output: number }> = {
      // Claude 4.5 pricing (latest)
      "claude-opus-4-5-20251101": { input: 0.005, output: 0.025 },
      "claude-opus-4-5": { input: 0.005, output: 0.025 },
      "claude-sonnet-4-5-20250929": { input: 0.003, output: 0.015 },
      "claude-sonnet-4-5": { input: 0.003, output: 0.015 },
      "claude-haiku-4-5-20251001": { input: 0.001, output: 0.005 },
      "claude-haiku-4-5": { input: 0.001, output: 0.005 },
      // Claude 4 pricing (legacy)
      "claude-opus-4-1-20250805": { input: 0.015, output: 0.075 },
      "claude-opus-4-1": { input: 0.015, output: 0.075 },
      "claude-opus-4-20250514": { input: 0.015, output: 0.075 },
      "claude-opus-4-0": { input: 0.015, output: 0.075 },
      "claude-sonnet-4-20250514": { input: 0.003, output: 0.015 },
      "claude-sonnet-4-0": { input: 0.003, output: 0.015 },
      "claude-3-7-sonnet-20250219": { input: 0.003, output: 0.015 },
      "claude-3-7-sonnet-latest": { input: 0.003, output: 0.015 },
      // Claude 3.5 pricing (legacy)
      "claude-3-5-haiku-20241022": { input: 0.0008, output: 0.004 },
      "claude-3-5-haiku-latest": { input: 0.0008, output: 0.004 },
      // Claude 3 pricing (legacy)
      "claude-3-haiku-20240307": { input: 0.00025, output: 0.00125 },
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

      await this.callAnthropic(testRequest);
      return true;
    } catch {
      return false;
    }
  }

  private async callAnthropic(
    request: LLMRequest,
    includeRaw = false,
  ): Promise<{ response: LLMResponse; rawResponse?: unknown }> {
    const startTime = Date.now();
    const client = this.ensureClient();
    const params = this.buildRequestParams(request);

    const message = await client.messages.create(params);

    const duration = Date.now() - startTime;

    // Extract text content (exclude thinking blocks from output)
    const contentText = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    const usage: TokenUsage = {
      promptTokens: message.usage.input_tokens,
      completionTokens: message.usage.output_tokens,
      totalTokens: message.usage.input_tokens + message.usage.output_tokens,
      estimatedCost: this.estimateCost(
        message.usage.input_tokens,
        message.usage.output_tokens,
      ),
    };

    const llmResponse: LLMResponse = {
      content: contentText,
      model: this.config.model,
      usage,
      duration,
      finishReason: this.mapFinishReason(message.stop_reason),
    };

    return {
      response: llmResponse,
      rawResponse: includeRaw ? message : undefined,
    };
  }

  private mapFinishReason(
    reason: string | null,
  ): "stop" | "length" | "content_filter" | "error" {
    switch (reason) {
      case "end_turn":
      case "stop_sequence":
        return "stop";
      case "max_tokens":
        return "length";
      default:
        return "error";
    }
  }

  /**
   * Ensures the Anthropic client is initialized.
   * @throws Error if API key is not configured.
   */
  private ensureClient(): Anthropic {
    if (this.client) {
      return this.client;
    }

    if (!this.config.apiKey) {
      throw new Error(
        "Anthropic API key not configured. Set ANTHROPIC_API_KEY environment variable.",
      );
    }

    this.client = new Anthropic({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
    });

    return this.client;
  }

  /**
   * Builds request parameters for Anthropic API calls.
   * Handles extended thinking configuration and temperature settings.
   */
  // deno-lint-ignore no-explicit-any
  private buildRequestParams(request: LLMRequest): any {
    const thinkingBudget = typeof this.config.thinkingBudget === "number"
      ? this.config.thinkingBudget
      : undefined;

    // When thinking is enabled, temperature must be 1 (Anthropic requirement)
    const temperature = thinkingBudget !== undefined
      ? 1
      : (request.temperature ?? this.config.temperature ?? 0.1);

    const maxTokens = request.maxTokens ?? this.config.maxTokens ?? 4000;

    // Validate constraint at request time (catches request overrides)
    if (thinkingBudget !== undefined && maxTokens <= thinkingBudget) {
      throw new Error(
        `maxTokens (${maxTokens}) must be greater than thinkingBudget (${thinkingBudget}). ` +
          `Use tokens=${thinkingBudget + 1000} or higher.`,
      );
    }

    // deno-lint-ignore no-explicit-any
    const params: any = {
      model: this.config.model,
      max_tokens: maxTokens,
      messages: [
        {
          role: "user",
          content: request.prompt,
        },
      ],
      ...(request.systemPrompt ? { system: request.systemPrompt } : {}),
      ...(request.stop ? { stop_sequences: request.stop } : {}),
    };

    // Add thinking configuration if budget is set
    if (thinkingBudget !== undefined) {
      params.thinking = {
        type: "enabled",
        budget_tokens: thinkingBudget,
      };
      // Temperature cannot be set when thinking is enabled
    } else {
      params.temperature = temperature;
    }

    return params;
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
      `[Anthropic] Streaming AL code for task: ${context.taskId} (attempt ${context.attempt})`,
    );

    const result = yield* this.streamAnthropic(request, options);

    // Extract code from accumulated response
    const extraction = CodeExtractor.extract(result.content, "al");

    // Log interaction
    const debugLogger = DebugLogger.getInstance();
    if (debugLogger) {
      await debugLogger.logInteraction(
        "anthropic",
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
      `[Anthropic] Streaming fix for ${errors.length} error(s) in task: ${context.taskId}`,
    );

    const result = yield* this.streamAnthropic(request, options);

    // Extract code from accumulated response
    const extraction = CodeExtractor.extract(result.content, "diff");

    // Log interaction
    const debugLogger = DebugLogger.getInstance();
    if (debugLogger) {
      await debugLogger.logInteraction(
        "anthropic",
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

  private async *streamAnthropic(
    request: LLMRequest,
    options?: StreamOptions,
  ): AsyncGenerator<StreamChunk, StreamResult, undefined> {
    const state = createStreamState();
    const client = this.ensureClient();
    const params = this.buildRequestParams(request);

    try {
      const stream = client.messages.stream(params);
      this.setupAbortHandler(stream, options);

      yield* this.processStreamEvents(stream, state, options);

      const finalMessage = await stream.finalMessage();
      const usage = this.buildUsageFromMessage(finalMessage);

      const { finalChunk, result } = finalizeStream({
        state,
        model: this.config.model,
        usage,
        finishReason: this.mapFinishReason(finalMessage.stop_reason),
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
  // deno-lint-ignore no-explicit-any
  private setupAbortHandler(stream: any, options?: StreamOptions): void {
    if (options?.abortSignal) {
      options.abortSignal.addEventListener("abort", () => {
        stream.abort();
      });
    }
  }

  /**
   * Processes stream events and yields text chunks.
   */
  private async *processStreamEvents(
    // deno-lint-ignore no-explicit-any
    stream: any,
    state: StreamState,
    options?: StreamOptions,
  ): AsyncGenerator<StreamChunk, void, undefined> {
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield createChunk(event.delta.text, state, options);
      }
    }
  }

  /**
   * Builds token usage from final message.
   */
  private buildUsageFromMessage(
    message: Anthropic.Message,
  ): TokenUsage {
    return {
      promptTokens: message.usage.input_tokens,
      completionTokens: message.usage.output_tokens,
      totalTokens: message.usage.input_tokens + message.usage.output_tokens,
      estimatedCost: this.estimateCost(
        message.usage.input_tokens,
        message.usage.output_tokens,
      ),
    };
  }
}
