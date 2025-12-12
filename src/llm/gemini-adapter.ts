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

export class GeminiAdapter implements LLMAdapter {
  readonly name = "gemini";
  readonly supportedModels = [
    "gemini-1.5-pro",
    "gemini-1.5-pro-002",
    "gemini-1.5-flash",
    "gemini-1.5-flash-002",
    "gemini-1.0-pro",
  ];
  
  private config: LLMConfig = {
    provider: "gemini",
    model: "gemini-1.5-pro",
    temperature: 0.1,
    maxTokens: 8192,
    timeout: 30000,
  };

  configure(config: LLMConfig): void {
    this.config = { ...this.config, ...config };
  }

  async generateCode(
    request: LLMRequest,
    context: GenerationContext,
  ): Promise<CodeGenerationResult> {
    console.log(`🤖 [Gemini] Generating AL code for task: ${context.taskId} (attempt ${context.attempt})`);
    
    const response = await this.callGemini(request);
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
    console.log(`🤖 [Gemini] Generating fix for ${errors.length} error(s) in task: ${context.taskId}`);
    
    const response = await this.callGemini(request);
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
      errors.push("API key is required for Google Gemini");
    }
    
    if (!config.model) {
      errors.push("Model is required");
    } else if (!this.supportedModels.includes(config.model) && !this.isCustomModel(config.model)) {
      console.warn(`⚠️  Custom/unknown model: ${config.model}. Known models: ${this.supportedModels.join(", ")}`);
    }
    
    if (config.temperature !== undefined && (config.temperature < 0 || config.temperature > 2)) {
      errors.push("Temperature must be between 0 and 2 for Gemini");
    }
    
    if (config.maxTokens !== undefined && config.maxTokens < 1) {
      errors.push("Max tokens must be greater than 0");
    }
    
    return errors;
  }
  
  private isCustomModel(model: string): boolean {
    // Allow custom model names that follow Gemini patterns
    return model.includes("gemini") || 
           model.includes("pro") || 
           model.includes("flash") ||
           model.includes("experimental") ||
           model.includes("thinking");
  }

  estimateCost(promptTokens: number, completionTokens: number): number {
    // Google Gemini pricing (as of 2024)
    const defaultCost = { input: 0.00125, output: 0.005 };
    const modelCosts: Record<string, { input: number; output: number }> = {
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
      // Simple health check with minimal request
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

  private async callGemini(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    
    if (!this.config.apiKey) {
      throw new Error("Google API key not configured. Set GOOGLE_API_KEY environment variable.");
    }

    // Use the Gemini REST API
    const url = this.config.baseUrl || 
      `https://generativelanguage.googleapis.com/v1beta/models/${this.config.model}:generateContent?key=${this.config.apiKey}`;
    
    const payload = {
      contents: [
        {
          parts: [
            {
              text: request.prompt,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: request.temperature ?? this.config.temperature ?? 0.1,
        maxOutputTokens: request.maxTokens ?? this.config.maxTokens ?? 8192,
        stopSequences: request.stop,
      },
      safetySettings: [
        {
          category: "HARM_CATEGORY_HARASSMENT",
          threshold: "BLOCK_NONE",
        },
        {
          category: "HARM_CATEGORY_HATE_SPEECH",
          threshold: "BLOCK_NONE",
        },
        {
          category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
          threshold: "BLOCK_NONE",
        },
        {
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          threshold: "BLOCK_NONE",
        },
      ],
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.config.timeout || 30000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google Gemini API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const duration = Date.now() - startTime;

    if (!data.candidates || data.candidates.length === 0) {
      throw new Error("No response from Google Gemini API");
    }

    const candidate = data.candidates[0];
    if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
      throw new Error("Empty response from Google Gemini API");
    }

    const contentText = candidate.content.parts
      .filter((part: any) => part.text)
      .map((part: any) => part.text)
      .join("");

    // Gemini doesn't provide exact token counts in response, so we estimate
    const estimatedPromptTokens = Math.ceil(request.prompt.length / 4);
    const estimatedCompletionTokens = Math.ceil(contentText.length / 4);

    const usage: TokenUsage = {
      promptTokens: data.usageMetadata?.promptTokenCount || estimatedPromptTokens,
      completionTokens: data.usageMetadata?.candidatesTokenCount || estimatedCompletionTokens,
      totalTokens: data.usageMetadata?.totalTokenCount || (estimatedPromptTokens + estimatedCompletionTokens),
      estimatedCost: this.estimateCost(
        data.usageMetadata?.promptTokenCount || estimatedPromptTokens,
        data.usageMetadata?.candidatesTokenCount || estimatedCompletionTokens,
      ),
    };

    return {
      content: contentText,
      model: this.config.model,
      usage,
      duration,
      finishReason: this.mapFinishReason(candidate.finishReason),
    };
  }

  private mapFinishReason(reason: string | undefined): "stop" | "length" | "content_filter" | "error" {
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