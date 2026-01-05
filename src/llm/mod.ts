/**
 * LLM Module
 *
 * Provides LLM adapters for various providers (OpenAI, Anthropic, Gemini, etc.)
 * with unified interfaces, streaming support, and cost estimation.
 */

// Types
export type {
  CodeGenerationResult,
  ContinuationConfig,
  GenerationContext,
  LLMAdapter,
  LLMConfig,
  LLMRequest,
  LLMResponse,
  StreamCallback,
  StreamChunk,
  StreamingLLMAdapter,
  StreamOptions,
  StreamResult,
  TokenUsage,
} from "./types.ts";

export { DEFAULT_CONTINUATION_CONFIG, isStreamingAdapter } from "./types.ts";

// Registry
export { LLMAdapterRegistry } from "./registry.ts";

// Model Presets
export type { ModelPreset } from "./model-presets.ts";
export {
  MODEL_GROUPS,
  MODEL_PRESETS,
  ModelPresetRegistry,
} from "./model-presets.ts";

// Code Extraction
export type { ExtractionResult } from "./code-extractor.ts";
export { CodeExtractor } from "./code-extractor.ts";

// Adapters
export { AnthropicAdapter } from "./anthropic-adapter.ts";
export { AzureOpenAIAdapter } from "./azure-openai-adapter.ts";
export { GeminiAdapter } from "./gemini-adapter.ts";
export { LocalLLMAdapter } from "./local-adapter.ts";
export { MockLLMAdapter } from "./mock-adapter.ts";
export { OpenAIAdapter } from "./openai-adapter.ts";
export { OpenRouterAdapter } from "./openrouter-adapter.ts";
