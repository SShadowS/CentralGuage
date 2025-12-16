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
import { DebugLogger } from "../utils/debug-logger.ts";
import * as colors from "@std/fmt/colors";

export class LocalLLMAdapter implements LLMAdapter {
  readonly name = "local";
  readonly supportedModels = [
    // Ollama models
    "llama3.2:latest",
    "llama3.1:latest",
    "llama3:latest",
    "codellama:latest",
    "codellama:13b",
    "codellama:7b",
    "mistral:latest",
    "qwen2.5-coder:latest",
    "deepseek-coder:latest",
    "starcoder2:latest",
    // Generic patterns
    "llama",
    "codellama",
    "mistral",
    "qwen",
    "deepseek",
    "starcoder",
  ];

  private config: LLMConfig = {
    provider: "local",
    model: "codellama:latest",
    temperature: 0.1,
    maxTokens: 4000,
    timeout: 60000, // Local models can be slower
  };

  configure(config: LLMConfig): void {
    this.config = { ...this.config, ...config };
  }

  async generateCode(
    request: LLMRequest,
    context: GenerationContext,
  ): Promise<CodeGenerationResult> {
    console.log(
      colors.blue(
        `[Local LLM] Generating AL code for task: ${context.taskId} (attempt ${context.attempt})`,
      ),
    );

    let rawResponse: unknown;
    let response: LLMResponse;

    try {
      const result = await this.callLocalLLM(request, true);
      response = result.response;
      rawResponse = result.rawResponse;
    } catch (error) {
      const debugLogger = DebugLogger.getInstance();
      if (debugLogger) {
        await debugLogger.logError(
          "local",
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
        "local",
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
      colors.blue(
        `[Local LLM] Generating fix for ${errors.length} error(s) in task: ${context.taskId}`,
      ),
    );

    let rawResponse: unknown;
    let response: LLMResponse;

    try {
      const result = await this.callLocalLLM(request, true);
      response = result.response;
      rawResponse = result.rawResponse;
    } catch (error) {
      const debugLogger = DebugLogger.getInstance();
      if (debugLogger) {
        await debugLogger.logError(
          "local",
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
        "local",
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

    if (
      !config.baseUrl && !Deno.env.get("OLLAMA_HOST") &&
      !Deno.env.get("LOCAL_LLM_ENDPOINT")
    ) {
      errors.push(
        "Local LLM endpoint is required. Set OLLAMA_HOST, LOCAL_LLM_ENDPOINT, or provide baseUrl in config.",
      );
    }

    if (!config.model) {
      errors.push("Model is required");
    }
    // Local models can be any name - no validation needed

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

  estimateCost(_promptTokens: number, _completionTokens: number): number {
    // Local models are typically free to run
    return 0;
  }

  async isHealthy(): Promise<boolean> {
    try {
      // Simple health check with minimal request
      const testRequest: LLMRequest = {
        prompt: "Say 'OK' if you can respond.",
        temperature: 0,
        maxTokens: 5,
      };

      await this.callLocalLLM(testRequest);
      return true;
    } catch {
      return false;
    }
  }

  private async callLocalLLM(
    request: LLMRequest,
    includeRaw = false,
  ): Promise<{ response: LLMResponse; rawResponse?: unknown }> {
    const startTime = Date.now();

    // Determine endpoint - try Ollama first, then generic local endpoint
    const endpoint = this.config.baseUrl ||
      Deno.env.get("LOCAL_LLM_ENDPOINT") ||
      Deno.env.get("OLLAMA_HOST") ||
      "http://localhost:11434";

    // Check if this looks like an Ollama endpoint
    const isOllama = endpoint.includes("11434") || endpoint.includes("ollama");

    let url: string;
    let payload: Record<string, unknown>;
    let headers: Record<string, string>;

    if (isOllama) {
      // Use Ollama API format
      url = `${endpoint}/api/generate`;
      payload = {
        model: this.config.model,
        prompt: request.prompt,
        options: {
          temperature: request.temperature ?? this.config.temperature ?? 0.1,
          num_predict: request.maxTokens ?? this.config.maxTokens ?? 4000,
          stop: request.stop,
        },
        stream: false,
      };
      // Add system prompt if provided (Ollama supports 'system' field)
      if (request.systemPrompt) {
        payload.system = request.systemPrompt;
      }
      headers = {
        "Content-Type": "application/json",
      };
    } else {
      // Use OpenAI-compatible API format
      // Build messages array with optional system prompt
      const messages: Array<{ role: string; content: string }> = [];
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

      url = `${endpoint}/v1/chat/completions`;
      payload = {
        model: this.config.model,
        messages,
        temperature: request.temperature ?? this.config.temperature ?? 0.1,
        max_tokens: request.maxTokens ?? this.config.maxTokens ?? 4000,
        stop: request.stop,
      };
      headers = {
        "Content-Type": "application/json",
      };

      // Add API key if provided
      if (this.config.apiKey) {
        headers["Authorization"] = `Bearer ${this.config.apiKey}`;
      }
    }

    const apiResponse = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.config.timeout || 60000),
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      throw new Error(
        `Local LLM API error (${apiResponse.status}): ${errorText}`,
      );
    }

    const data = await apiResponse.json();
    const duration = Date.now() - startTime;

    let content: string;
    let usage: TokenUsage;

    if (isOllama) {
      // Parse Ollama response
      content = data.response || "";

      // Ollama provides some usage info
      usage = {
        promptTokens: data.prompt_eval_count || 0,
        completionTokens: data.eval_count || 0,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
        estimatedCost: 0,
      };
    } else {
      // Parse OpenAI-compatible response
      if (!data.choices || data.choices.length === 0) {
        throw new Error("No response from local LLM API");
      }

      const choice = data.choices[0];
      content = choice.message?.content || choice.text || "";

      usage = {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
        estimatedCost: 0,
      };
    }

    const llmResponse: LLMResponse = {
      content,
      model: this.config.model,
      usage,
      duration,
      finishReason: "stop", // Local models typically don't provide detailed finish reasons
    };

    return {
      response: llmResponse,
      rawResponse: includeRaw ? data : undefined,
    };
  }
}
