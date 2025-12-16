export interface LLMConfig {
  provider: string;
  model: string;
  apiKey?: string | undefined;
  baseUrl?: string | undefined;
  temperature?: number | undefined;
  maxTokens?: number | undefined;
  timeout?: number | undefined;
  // Azure OpenAI specific
  deploymentName?: string | undefined;
  apiVersion?: string | undefined;
  // OpenRouter specific
  siteUrl?: string | undefined;
  siteName?: string | undefined;
  // Extended thinking (Claude 4.5+)
  thinkingBudget?: number | undefined;
}

export interface LLMRequest {
  prompt: string;
  /** System prompt - sent as separate system role message (if provider supports it) */
  systemPrompt?: string | undefined;
  temperature?: number | undefined;
  maxTokens?: number | undefined;
  stop?: string[] | undefined;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage: TokenUsage;
  duration: number; // milliseconds
  finishReason: "stop" | "length" | "content_filter" | "error";
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost?: number | undefined; // USD
}

export interface GenerationContext {
  taskId: string;
  attempt: number;
  description: string;
  previousCode?: string | undefined;
  errors?: string[] | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface CodeGenerationResult {
  code: string;
  language: "al" | "diff";
  response: LLMResponse;
  extractedFromDelimiters: boolean;
}

export interface LLMAdapter {
  readonly name: string;
  readonly supportedModels: string[];

  // Configuration
  configure(config: LLMConfig): void;

  // Code generation
  generateCode(
    request: LLMRequest,
    context: GenerationContext,
  ): Promise<CodeGenerationResult>;

  // Fix generation (for second attempt)
  generateFix(
    originalCode: string,
    errors: string[],
    request: LLMRequest,
    context: GenerationContext,
  ): Promise<CodeGenerationResult>;

  // Utility methods
  validateConfig(config: LLMConfig): string[]; // Returns validation errors
  estimateCost(promptTokens: number, completionTokens: number): number;
  isHealthy(): Promise<boolean>;
}
