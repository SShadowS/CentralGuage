/**
 * CLI model utility helpers
 * @module cli/helpers/model-utils
 */

import { ModelPresetRegistry } from "../../src/llm/model-presets.ts";
import { log } from "./logging.ts";

/** Valid LLM providers */
export const VALID_PROVIDERS = [
  "openai",
  "anthropic",
  "gemini",
  "azure-openai",
  "local",
  "mock",
  "openrouter",
] as const;

export type ValidProvider = typeof VALID_PROVIDERS[number];

/**
 * Extract model name from variantId for shortcomings lookup.
 * e.g., "anthropic/claude-opus-4-5-20251101@thinking=50000" -> "claude-opus-4-5-20251101"
 * e.g., "openrouter/deepseek/deepseek-v3.2" -> "deepseek/deepseek-v3.2"
 */
export function extractModelName(variantId: string): string {
  // Remove any @params suffix first
  const baseVariant = variantId.split("@")[0] || variantId;
  const parts = baseVariant.split("/");

  // For OpenRouter models (3+ parts starting with "openrouter"), combine provider and model
  // e.g., "openrouter/deepseek/deepseek-v3.2" -> "deepseek/deepseek-v3.2"
  if (parts.length >= 3 && parts[0] === "openrouter") {
    const provider = parts[parts.length - 2];
    const model = parts[parts.length - 1];
    return `${provider}/${model}`;
  }

  // For standard format (provider/model), just return the model part
  return parts[parts.length - 1] || baseVariant;
}

/**
 * Parse provider and model from various formats:
 * - Aliases: "sonnet", "gpt-4o", "haiku"
 * - Groups: "flagship", "budget", "coding"
 * - Provider/model: "openai/gpt-4o", "anthropic/claude-3-5-sonnet-20241022"
 * - Legacy patterns: "gpt-4", "claude-3-sonnet" (with warnings)
 */
export function parseProviderAndModel(
  modelSpec: string,
): { provider: string; model: string } {
  // First try to resolve through preset system (handles aliases, groups, and provider/model)
  const resolved = ModelPresetRegistry.resolve(modelSpec);

  const resolvedSpec = resolved[0];
  if (resolved.length === 1 && resolvedSpec && resolvedSpec !== modelSpec) {
    // Successfully resolved to a different spec, parse the resolved spec
    if (resolvedSpec.includes("/")) {
      const parts = resolvedSpec.split("/");
      const provider = parts[0] || "";
      const model = parts.slice(1).join("/");

      // Validate provider
      const validProviders = [
        "openai",
        "anthropic",
        "gemini",
        "azure-openai",
        "local",
        "mock",
      ];
      if (validProviders.includes(provider)) {
        return { provider, model };
      }
    }
  }

  // If not resolved or is already provider/model format, handle directly
  if (modelSpec.includes("/")) {
    const parts = modelSpec.split("/");
    const provider = parts[0] || "";
    const model = parts.slice(1).join("/"); // Handle models with slashes like "models/gemini-pro"

    // Validate provider
    const validProviders = [
      "openai",
      "anthropic",
      "gemini",
      "azure-openai",
      "local",
      "mock",
    ];
    if (validProviders.includes(provider)) {
      return { provider, model };
    } else {
      log.warn(`Unknown provider: ${provider}, using mock adapter`);
      return { provider: "mock", model: modelSpec };
    }
  }

  // Backwards compatibility: detect provider from model name patterns
  log.warn(
    `Using pattern detection for model: ${modelSpec}. Consider using aliases or provider/model format.`,
  );

  let provider: string;

  // OpenAI models
  if (
    modelSpec.startsWith("gpt-") || modelSpec.startsWith("o1-") ||
    modelSpec.startsWith("o3-")
  ) {
    provider = "openai";
  } // Anthropic Claude models
  else if (modelSpec.startsWith("claude-")) {
    provider = "anthropic";
  } // Google Gemini models
  else if (
    modelSpec.startsWith("gemini-") || modelSpec.startsWith("models/gemini-")
  ) {
    provider = "gemini";
  } // Azure OpenAI (usually with deployment name)
  else if (
    modelSpec.includes("azure") || Deno.env.get("AZURE_OPENAI_ENDPOINT")
  ) {
    provider = "azure-openai";
  } // Local models (Ollama, etc.)
  else if (
    modelSpec.startsWith("llama") || modelSpec.startsWith("codellama") ||
    modelSpec.startsWith("mistral") || modelSpec.startsWith("qwen") ||
    Deno.env.get("OLLAMA_HOST") || Deno.env.get("LOCAL_LLM_ENDPOINT")
  ) {
    provider = "local";
  } // Default to mock for unknown models
  else {
    log.warn(`Unknown model format: ${modelSpec}, using mock adapter`);
    provider = "mock";
  }

  return { provider, model: modelSpec };
}
