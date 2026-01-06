/**
 * Modular Prompt Injection System
 * Supports cascading configuration (CLI > Task > Global) with
 * provider-specific and stage-specific injections.
 */

/**
 * Stage of execution for prompt injection
 */
export type InjectionStage = "generation" | "fix";

/**
 * Single prompt injection definition
 */
export interface PromptInjection {
  /** System prompt - sent as separate system role message */
  system?: string;
  /** Prepended to user prompt */
  prefix?: string;
  /** Appended to user prompt */
  suffix?: string;
}

/**
 * Stage-specific injections
 */
export interface StageInjections {
  /** Injections for first attempt (generation) */
  generation?: PromptInjection;
  /** Injections for retry attempts (fix) */
  fix?: PromptInjection;
  /** Applied to both stages if stage-specific not defined */
  default?: PromptInjection;
}

/**
 * Provider-specific overrides
 * Keys are provider names (anthropic, openai, gemini, etc.)
 */
export interface ProviderInjections {
  /** Default injections for all providers */
  default?: StageInjections;
  /** Override for Anthropic/Claude */
  anthropic?: StageInjections;
  /** Override for OpenAI */
  openai?: StageInjections;
  /** Override for Google Gemini */
  gemini?: StageInjections;
  /** Override for Azure OpenAI */
  "azure-openai"?: StageInjections;
  /** Override for OpenRouter */
  openrouter?: StageInjections;
  /** Override for local models */
  local?: StageInjections;
  /** Override for mock adapter */
  mock?: StageInjections;
  /** Allow additional providers */
  [provider: string]: StageInjections | undefined;
}

/**
 * Complete prompt injection configuration
 * Used in both global config and task manifests
 */
export interface PromptInjectionConfig {
  /** Whether injections are enabled (default: true if injections defined) */
  enabled?: boolean;
  /** Provider-specific and stage-specific injections */
  injections?: ProviderInjections;
}

/**
 * Resolved injections for a specific call
 * Result of cascading/merging all config levels
 */
export interface ResolvedPromptInjection {
  /** Resolved system prompt */
  system?: string;
  /** Resolved prefix */
  prefix?: string;
  /** Resolved suffix */
  suffix?: string;
}

/**
 * CLI override options for prompt injection
 */
export interface CLIPromptOverrides {
  /** System prompt override */
  systemPrompt?: string;
  /** Prefix override */
  prefix?: string;
  /** Suffix override */
  suffix?: string;
  /** Which stage these apply to (default: both) */
  stage?: InjectionStage | "both";
  /** Which provider these apply to (default: all) */
  provider?: string;
  /** Pre-loaded knowledge bank content to prepend to system prompt */
  knowledgeContent?: string;
  /** Custom run label for results/reports */
  runLabel?: string;
}

/**
 * Result of applying injections to a prompt
 */
export interface AppliedPromptInjection {
  /** The assembled user prompt (prefix + base + suffix) */
  prompt: string;
  /** System prompt to send as separate message (if provider supports it) */
  systemPrompt?: string;
}
