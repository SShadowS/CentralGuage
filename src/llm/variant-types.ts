/**
 * Model variant types for comparing the same model with different configurations
 */

/**
 * Configuration parameters that can vary per variant
 */
export interface VariantConfig {
  /** Temperature for generation (0.0 - 1.0) */
  temperature?: number;
  /** Maximum tokens for response */
  maxTokens?: number;
  /** Inline system prompt content */
  systemPrompt?: string;
  /** Reference to named system prompt in config */
  systemPromptName?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /**
   * Thinking/reasoning budget for supported models:
   * - Claude 4.5+: Extended thinking token budget (number)
   * - OpenAI o1/o3/GPT-5: Reasoning effort ("low" | "medium" | "high")
   * - Gemini with thinking: Thinking token budget (number)
   */
  thinkingBudget?: number | string;
}

/**
 * Parsed model variant specification
 */
export interface ModelVariant {
  /** Original spec string (e.g., "sonnet@temp=0.5") */
  originalSpec: string;

  /** Base model alias or provider/model (e.g., "sonnet") */
  baseModel: string;

  /** Resolved provider (e.g., "anthropic") */
  provider: string;

  /** Resolved model ID (e.g., "claude-3-5-sonnet-20241022") */
  model: string;

  /** Variant configuration overrides */
  config: VariantConfig;

  /** Unique display identifier (e.g., "anthropic/claude-3-5-sonnet-20241022@temp=0.5") */
  variantId: string;

  /** Whether this has variant overrides */
  hasVariant: boolean;
}

/**
 * Named system prompt definition in config
 */
export interface SystemPromptDefinition {
  /** The prompt content */
  content: string;
  /** Optional description */
  description?: string;
}

/**
 * Named variant profile in config
 */
export interface VariantProfile {
  /** Profile description */
  description?: string;
  /** The variant configuration */
  config: VariantConfig;
}

/**
 * Parameter key mappings for short aliases
 */
export const VARIANT_PARAM_ALIASES: Record<string, keyof VariantConfig> = {
  temp: "temperature",
  temperature: "temperature",
  maxtokens: "maxTokens",
  max_tokens: "maxTokens",
  tokens: "maxTokens",
  prompt: "systemPromptName",
  systemprompt: "systemPromptName",
  system_prompt: "systemPromptName",
  timeout: "timeout",
  // Thinking/reasoning budget aliases
  thinking: "thinkingBudget",
  thinkingbudget: "thinkingBudget",
  thinking_budget: "thinkingBudget",
  reasoning: "thinkingBudget",
  reasoning_budget: "thinkingBudget",
};

/**
 * Generate a deterministic variant ID from base model and config
 */
export function generateVariantId(
  provider: string,
  model: string,
  config: VariantConfig,
): string {
  const baseId = `${provider}/${model}`;

  // Build sorted key=value pairs for deterministic ID
  const parts: string[] = [];

  if (config.temperature !== undefined) {
    parts.push(`temp=${config.temperature}`);
  }
  if (config.maxTokens !== undefined) {
    parts.push(`maxTokens=${config.maxTokens}`);
  }
  if (config.systemPromptName) {
    parts.push(`prompt=${config.systemPromptName}`);
  }
  if (config.thinkingBudget !== undefined) {
    parts.push(`thinking=${config.thinkingBudget}`);
  }
  if (config.timeout !== undefined) {
    parts.push(`timeout=${config.timeout}`);
  }

  if (parts.length === 0) {
    return baseId;
  }

  return `${baseId}@${parts.join(";")}`;
}
