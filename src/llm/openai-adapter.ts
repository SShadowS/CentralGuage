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

export class OpenAIAdapter implements LLMAdapter {
  readonly name = "openai";
  readonly supportedModels = [
    "gpt-4o",
    "gpt-4o-mini", 
    "gpt-4-turbo",
    "gpt-4",
    "gpt-3.5-turbo",
  ];
  
  private config: LLMConfig = {
    provider: "openai",
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
    console.log(`🤖 [OpenAI] Generating AL code for task: ${context.taskId} (attempt ${context.attempt})`);
    
    const response = await this.callOpenAI(request);
    const extraction = CodeExtractor.extract(response.content, "al");
    
    return {
      code: extraction.code,
      language: "al",
      response,
      extractedFromDelimiters: extraction.extractedFromDelimiters,
    };
  }

  async generateFix(
    originalCode: string,
    errors: string[],
    request: LLMRequest,
    context: GenerationContext,
  ): Promise<CodeGenerationResult> {
    console.log(`🤖 [OpenAI] Generating fix for ${errors.length} error(s) in task: ${context.taskId}`);
    
    const response = await this.callOpenAI(request);
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
      errors.push("API key is required for OpenAI");
    }
    
    if (!config.model) {
      errors.push("Model is required");
    } else if (!this.supportedModels.includes(config.model) && !this.isCustomModel(config.model)) {
      console.warn(`⚠️  Custom/unknown model: ${config.model}. Known models: ${this.supportedModels.join(", ")}`);
    }
    
    if (config.temperature !== undefined && (config.temperature < 0 || config.temperature > 2)) {
      errors.push("Temperature must be between 0 and 2");
    }
    
    if (config.maxTokens !== undefined && config.maxTokens < 1) {
      errors.push("Max tokens must be greater than 0");
    }
    
    return errors;
  }
  
  private isCustomModel(model: string): boolean {
    // Allow custom model names that follow OpenAI patterns
    return model.startsWith("gpt-") || 
           model.startsWith("o1-") || 
           model.startsWith("o3-") ||
           model.includes("turbo") ||
           model.includes("high") ||  // For reasoning modes
           model.includes("low") ||
           model.includes("medium");
  }

  estimateCost(promptTokens: number, completionTokens: number): number {
    // Rough cost estimation for OpenAI models (as of 2024)
    const modelCosts: Record<string, { input: number; output: number }> = {
      "gpt-4o": { input: 0.0025, output: 0.01 },
      "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
      "gpt-4-turbo": { input: 0.01, output: 0.03 },
      "gpt-4": { input: 0.03, output: 0.06 },
      "gpt-3.5-turbo": { input: 0.0005, output: 0.0015 },
    };
    
    const costs = modelCosts[this.config.model] || modelCosts["gpt-4o"];
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
      
      await this.callOpenAI(testRequest);
      return true;
    } catch {
      return false;
    }
  }

  private async callOpenAI(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    
    if (!this.config.apiKey) {
      throw new Error("OpenAI API key not configured");
    }

    const url = this.config.baseUrl || "https://api.openai.com/v1/chat/completions";
    
    const payload = {
      model: this.config.model,
      messages: [
        {
          role: "user",
          content: request.prompt,
        },
      ],
      temperature: request.temperature ?? this.config.temperature ?? 0.1,
      max_tokens: request.maxTokens ?? this.config.maxTokens ?? 4000,
      stop: request.stop,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.config.timeout || 30000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const duration = Date.now() - startTime;

    if (!data.choices || data.choices.length === 0) {
      throw new Error("No response from OpenAI API");
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

    return {
      content: choice.message?.content || "",
      model: this.config.model,
      usage,
      duration,
      finishReason: this.mapFinishReason(choice.finish_reason),
    };
  }

  private mapFinishReason(reason: string | undefined): "stop" | "length" | "content_filter" | "error" {
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