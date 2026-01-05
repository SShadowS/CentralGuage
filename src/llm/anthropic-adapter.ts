import Anthropic from "@anthropic-ai/sdk";
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

const log = Logger.create("llm:anthropic");
import {
  DEFAULT_API_TIMEOUT_MS,
  DEFAULT_MAX_TOKENS,
  DEFAULT_TEMPERATURE,
} from "../constants.ts";
import { LLMProviderError } from "../errors.ts";
import {
  createChunk,
  createStreamState,
  finalizeStream,
  handleStreamError,
  type StreamState,
} from "./stream-handler.ts";

export class AnthropicAdapter extends BaseLLMAdapter {
  readonly name = "anthropic";
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
  ];

  protected override config: LLMConfig = {
    provider: "anthropic",
    model: "claude-sonnet-4-5-20250929",
    temperature: DEFAULT_TEMPERATURE,
    maxTokens: DEFAULT_MAX_TOKENS,
    timeout: DEFAULT_API_TIMEOUT_MS,
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
      log.warn("Custom/unknown model", {
        model: config.model,
        knownModels: this.supportedModels,
      });
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

    return {
      response: {
        content: contentText,
        model: this.config.model,
        usage,
        duration,
        finishReason: this.mapFinishReason(message.stop_reason),
      },
      rawResponse: includeRaw ? message : undefined,
    };
  }

  protected async *streamProvider(
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

  // ============================================================================
  // Private Anthropic-specific helpers
  // ============================================================================

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
      throw new LLMProviderError(
        "Anthropic API key not configured. Set ANTHROPIC_API_KEY environment variable.",
        "anthropic",
        false,
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
  private buildRequestParams(
    request: LLMRequest,
  ): Anthropic.MessageCreateParamsNonStreaming {
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
      throw new LLMProviderError(
        `maxTokens (${maxTokens}) must be greater than thinkingBudget (${thinkingBudget}). ` +
          `Use tokens=${thinkingBudget + 1000} or higher.`,
        "anthropic",
        false,
        undefined,
        { maxTokens, thinkingBudget },
      );
    }

    const params: Anthropic.MessageCreateParamsNonStreaming = {
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

  /**
   * Sets up abort signal handling for a stream.
   */
  private setupAbortHandler(
    stream: ReturnType<Anthropic["messages"]["stream"]>,
    options?: StreamOptions,
  ): void {
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
    stream: ReturnType<Anthropic["messages"]["stream"]>,
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
