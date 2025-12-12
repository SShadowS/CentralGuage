export interface LLMConfig {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  // Azure OpenAI specific
  deploymentName?: string;
  apiVersion?: string;
}

export interface LLMRequest {
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
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
  estimatedCost?: number; // USD
}

export interface GenerationContext {
  taskId: string;
  attempt: number;
  description: string;
  previousCode?: string;
  errors?: string[];
  metadata?: Record<string, unknown>;
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