/**
 * Parser for model variant specifications
 * Handles inline syntax (model@temp=0.5) and profile references (model@profile=name)
 */

import type { CentralGaugeConfig } from "../config/config.ts";
import {
  generateVariantId,
  type ModelVariant,
  VARIANT_PARAM_ALIASES,
  type VariantConfig,
} from "./variant-types.ts";
import { MODEL_GROUPS, MODEL_PRESETS } from "./model-presets.ts";

/**
 * Parse a model spec with optional variant configuration
 * @param spec e.g., "sonnet@temp=0.5,prompt=coding" or "sonnet@profile=conservative"
 * @param config Config containing systemPrompts and variantProfiles
 */
export function parseVariantSpec(
  spec: string,
  config?: CentralGaugeConfig,
): ModelVariant[] {
  // Check for @ separator
  const atIndex = spec.indexOf("@");

  if (atIndex === -1) {
    // No variant - resolve normally and return default variant(s)
    return resolveBaseModelsToVariants(spec, {});
  }

  const baseModelSpec = spec.substring(0, atIndex);
  const variantSpec = spec.substring(atIndex + 1);

  // Parse the variant spec
  const variantConfig = parseVariantConfig(variantSpec, config);

  // Resolve base model(s) and apply variant config to each
  return resolveBaseModelsToVariants(baseModelSpec, variantConfig, spec);
}

/**
 * Resolve base model spec to ModelVariant array
 */
function resolveBaseModelsToVariants(
  baseSpec: string,
  variantConfig: VariantConfig,
  originalSpec?: string,
): ModelVariant[] {
  const hasVariant = Object.keys(variantConfig).length > 0;
  const results: ModelVariant[] = [];

  // Check if it's a group - expand to all members
  if (MODEL_GROUPS[baseSpec]) {
    const groupMembers = MODEL_GROUPS[baseSpec];
    for (const member of groupMembers) {
      const variants = resolveBaseModelsToVariants(
        member,
        variantConfig,
        originalSpec || (hasVariant ? `${member}@...` : member),
      );
      results.push(...variants);
    }
    return results;
  }

  // Resolve single model
  const { provider, model } = resolveProviderAndModel(baseSpec);

  const variant: ModelVariant = {
    originalSpec: originalSpec || baseSpec,
    baseModel: baseSpec,
    provider,
    model,
    config: variantConfig,
    variantId: generateVariantId(provider, model, variantConfig),
    hasVariant,
  };

  return [variant];
}

/**
 * Resolve a base model spec to provider and model
 */
function resolveProviderAndModel(
  spec: string,
): { provider: string; model: string } {
  // If already provider/model format
  if (spec.includes("/")) {
    const [provider, model] = spec.split("/", 2);
    return { provider, model };
  }

  // Check presets
  const preset = MODEL_PRESETS[spec];
  if (preset) {
    return { provider: preset.provider, model: preset.model };
  }

  // Unknown - return as-is (will be handled downstream)
  return { provider: spec, model: spec };
}

/**
 * Parse variant config from spec string
 */
function parseVariantConfig(
  variantSpec: string,
  config?: CentralGaugeConfig,
): VariantConfig {
  const result: VariantConfig = {};

  // Parse key=value pairs
  const pairs = variantSpec.split(",").map((p) => p.trim()).filter((p) => p);

  for (const pair of pairs) {
    const eqIndex = pair.indexOf("=");
    if (eqIndex === -1) continue;

    const rawKey = pair.substring(0, eqIndex).trim().toLowerCase();
    const value = pair.substring(eqIndex + 1).trim();

    // Check for profile reference
    if (rawKey === "profile") {
      const profile = config?.variantProfiles?.[value];
      if (profile) {
        // Merge profile config into result
        Object.assign(result, profile.config);

        // Resolve systemPromptName to actual content if needed
        if (profile.config.systemPromptName && config?.systemPrompts) {
          const promptDef =
            config.systemPrompts[profile.config.systemPromptName];
          if (promptDef) {
            result.systemPrompt = promptDef.content;
          }
        }
      }
      continue;
    }

    // Map alias to canonical key
    const canonicalKey = VARIANT_PARAM_ALIASES[rawKey];
    if (!canonicalKey) continue;

    // Parse and set value
    switch (canonicalKey) {
      case "temperature":
        result.temperature = parseFloat(value);
        break;
      case "maxTokens":
        result.maxTokens = parseInt(value, 10);
        break;
      case "timeout":
        result.timeout = parseInt(value, 10);
        break;
      case "systemPromptName":
        result.systemPromptName = value;
        // Also resolve to actual content if config is available
        if (config?.systemPrompts?.[value]) {
          result.systemPrompt = config.systemPrompts[value].content;
        }
        break;
      case "thinkingBudget":
        result.thinkingBudget = parseInt(value, 10);
        break;
    }
  }

  return result;
}

/**
 * Resolve model spec(s) with variant support
 * Main entry point that replaces ModelPresetRegistry.resolve for variant-aware resolution
 */
export function resolveWithVariants(
  specs: string[],
  config?: CentralGaugeConfig,
): ModelVariant[] {
  const results: ModelVariant[] = [];

  for (const spec of specs) {
    const variants = parseVariantSpec(spec, config);
    results.push(...variants);
  }

  return results;
}

/**
 * Get display name for a variant (shorter than variantId for output)
 */
export function getVariantDisplayName(variant: ModelVariant): string {
  if (!variant.hasVariant) {
    // Use alias if available
    const preset = Object.entries(MODEL_PRESETS).find(
      ([, p]) => p.provider === variant.provider && p.model === variant.model,
    );
    return preset ? preset[0] : `${variant.provider}/${variant.model}`;
  }

  // Find alias for base
  const preset = Object.entries(MODEL_PRESETS).find(
    ([, p]) => p.provider === variant.provider && p.model === variant.model,
  );
  const baseName = preset ? preset[0] : `${variant.provider}/${variant.model}`;

  // Build short variant suffix
  const parts: string[] = [];
  if (variant.config.temperature !== undefined) {
    parts.push(`temp=${variant.config.temperature}`);
  }
  if (variant.config.maxTokens !== undefined) {
    parts.push(`tokens=${variant.config.maxTokens}`);
  }
  if (variant.config.systemPromptName) {
    parts.push(`prompt=${variant.config.systemPromptName}`);
  }
  if (variant.config.thinkingBudget !== undefined) {
    parts.push(`thinking=${variant.config.thinkingBudget}`);
  }

  return parts.length > 0 ? `${baseName}@${parts.join(",")}` : baseName;
}
