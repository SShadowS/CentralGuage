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

export class AnthropicAdapter implements LLMAdapter {
  readonly name = "anthropic";
  readonly supportedModels = [
    "claude-3-5-sonnet-20241022",
    "claude-3-5-sonnet-20240620", 
    "claude-3-5-haiku-20241022",
    "claude-3-opus-20240229",
    "claude-3-sonnet-20240229",
    "claude-3-haiku-20240307",
  ];
  
  private config: LLMConfig = {
    provider: "anthropic",
    model: "claude-3-5-sonnet-20241022",
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
    console.log(`🤖 [Anthropic] Generating AL code for task: ${context.taskId} (attempt ${context.attempt})`);
    
    const response = await this.callAnthropic(request);
    const extraction = CodeExtractor.extract(response.content, "al");
    
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
    console.log(`🤖 [Anthropic] Generating fix for ${errors.length} error(s) in task: ${context.taskId}`);
    
    const response = await this.callAnthropic(request);
    const extraction = CodeExtractor.extract(response.content, "diff");
    
    return {
      code: extraction.code,
      language: extraction.language === "unknown" ? "diff" : extraction.language,
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
    } else if (!this.supportedModels.includes(config.model) && !this.isCustomModel(config.model)) {
      console.warn(`⚠️  Custom/unknown model: ${config.model}. Known models: ${this.supportedModels.join(", ")}`);
    }
    
    if (config.temperature !== undefined && (config.temperature < 0 || config.temperature > 1)) {
      errors.push("Temperature must be between 0 and 1 for Anthropic");
    }
    
    if (config.maxTokens !== undefined && (config.maxTokens < 1 || config.maxTokens > 200000)) {
      errors.push("Max tokens must be between 1 and 200000 for Anthropic");
    }
    
    return errors;
  }
  
  private isCustomModel(model: string): boolean {
    // Allow custom model names that follow Anthropic patterns
    return model.includes("claude") || 
           model.includes("sonnet") || 
           model.includes("haiku") || 
           model.includes("opus") ||
           model.includes("think"); // For thinking models
  }

  estimateCost(promptTokens: number, completionTokens: number): number {
    // Anthropic pricing (as of 2024)
    const defaultCost = { input: 0.003, output: 0.015 };
    const modelCosts: Record<string, { input: number; output: number }> = {
      "claude-3-5-sonnet-20241022": { input: 0.003, output: 0.015 },
      "claude-3-5-sonnet-20240620": { input: 0.003, output: 0.015 },
      "claude-3-5-haiku-20241022": { input: 0.001, output: 0.005 },
      "claude-3-opus-20240229": { input: 0.015, output: 0.075 },
      "claude-3-sonnet-20240229": { input: 0.003, output: 0.015 },
      "claude-3-haiku-20240307": { input: 0.00025, output: 0.00125 },
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
      
      await this.callAnthropic(testRequest);
      return true;
    } catch {
      return false;
    }
  }

  private async callAnthropic(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    
    if (!this.config.apiKey) {
      throw new Error("Anthropic API key not configured. Set ANTHROPIC_API_KEY environment variable.");
    }

    const url = this.config.baseUrl || "https://api.anthropic.com/v1/messages";
    
    const payload = {
      model: this.config.model,
      max_tokens: request.maxTokens ?? this.config.maxTokens ?? 4000,
      temperature: request.temperature ?? this.config.temperature ?? 0.1,
      messages: [
        {
          role: "user",
          content: request.prompt,
        },
      ],
      stop_sequences: request.stop,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.config.timeout || 30000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const duration = Date.now() - startTime;

    if (!data.content || data.content.length === 0) {
      throw new Error("No response from Anthropic API");
    }

    // Anthropic returns content as an array of content blocks
    const contentText = data.content
      .filter((block: any) => block.type === "text")
      .map((block: any) => block.text)
      .join("");

    const usage: TokenUsage = {
      promptTokens: data.usage?.input_tokens || 0,
      completionTokens: data.usage?.output_tokens || 0,
      totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      estimatedCost: this.estimateCost(
        data.usage?.input_tokens || 0,
        data.usage?.output_tokens || 0,
      ),
    };

    return {
      content: contentText,
      model: this.config.model,
      usage,
      duration,
      finishReason: this.mapFinishReason(data.stop_reason),
    };
  }

  private mapFinishReason(reason: string | undefined): "stop" | "length" | "content_filter" | "error" {
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
}