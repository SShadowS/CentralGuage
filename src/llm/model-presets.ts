/**
 * Model presets and aliases for easier command-line usage
 * Instead of typing "anthropic/claude-3-5-sonnet-20241022", users can use "sonnet"
 */

import type { CentralGaugeConfig } from "../config/config.ts";
import type { ModelVariant } from "./variant-types.ts";
import { resolveWithVariants as resolveVariants } from "./variant-parser.ts";

export interface ModelPreset {
  readonly alias: string;
  readonly provider: string;
  readonly model: string;
  readonly displayName: string;
  readonly description: string;
  readonly costTier: "free" | "budget" | "standard" | "premium";
  readonly performanceTier: "fast" | "balanced" | "quality";
  readonly category: string[];
  /** Recommended max output tokens for this model (defaults to 4000 if not specified) */
  readonly maxOutputTokens?: number;
}

export const MODEL_PRESETS: Record<string, ModelPreset> = {
  // OpenAI Models - GPT-5 (2025)
  "gpt-5": {
    alias: "gpt-5",
    provider: "openai",
    model: "gpt-5.2-2025-12-11",
    displayName: "GPT-5.2",
    description: "Best model for coding and agentic tasks",
    costTier: "premium",
    performanceTier: "quality",
    category: ["flagship", "coding", "reasoning", "2025"],
    maxOutputTokens: 16384,
  },
  "gpt-5-pro": {
    alias: "gpt-5-pro",
    provider: "openai",
    model: "gpt-5-pro",
    displayName: "GPT-5 Pro",
    description: "Professional GPT-5 with enhanced capabilities",
    costTier: "premium",
    performanceTier: "quality",
    category: ["flagship", "quality", "2025"],
    maxOutputTokens: 16384,
  },
  "codex": {
    alias: "codex",
    provider: "openai",
    model: "gpt-5.1-codex",
    displayName: "GPT-5.1 Codex",
    description: "Most advanced agentic coding model",
    costTier: "premium",
    performanceTier: "quality",
    category: ["flagship", "coding", "2025"],
    maxOutputTokens: 16384,
  },
  "codex-max": {
    alias: "codex-max",
    provider: "openai",
    model: "gpt-5.1-codex-max",
    displayName: "GPT-5.1 Codex Max",
    description: "Extended agentic coding tasks",
    costTier: "premium",
    performanceTier: "quality",
    category: ["coding", "2025"],
    maxOutputTokens: 16384,
  },
  "codex-mini": {
    alias: "codex-mini",
    provider: "openai",
    model: "gpt-5.1-codex-mini",
    displayName: "GPT-5.1 Codex Mini",
    description: "Optimized for code generation tasks",
    costTier: "standard",
    performanceTier: "fast",
    category: ["coding", "fast", "2025"],
    maxOutputTokens: 8192,
  },
  // OpenAI Models - GPT-4
  "gpt-4o": {
    alias: "gpt-4o",
    provider: "openai",
    model: "gpt-4o",
    displayName: "GPT-4o",
    description: "GPT-4 optimized model with vision capabilities",
    costTier: "premium",
    performanceTier: "quality",
    category: ["flagship", "coding", "reasoning"],
    maxOutputTokens: 16384,
  },
  "gpt-4": {
    alias: "gpt-4",
    provider: "openai",
    model: "gpt-4-turbo",
    displayName: "GPT-4 Turbo",
    description: "High-performance GPT-4 with improved speed",
    costTier: "premium",
    performanceTier: "balanced",
    category: ["flagship", "coding"],
    maxOutputTokens: 4096,
  },
  "gpt-3.5": {
    alias: "gpt-3.5",
    provider: "openai",
    model: "gpt-3.5-turbo",
    displayName: "GPT-3.5 Turbo",
    description: "Fast and cost-effective chat model",
    costTier: "budget",
    performanceTier: "fast",
    category: ["budget", "speed"],
    maxOutputTokens: 4096,
  },
  "o1": {
    alias: "o1",
    provider: "openai",
    model: "o1-preview",
    displayName: "OpenAI o1",
    description: "Advanced reasoning model for complex problems",
    costTier: "premium",
    performanceTier: "quality",
    category: ["reasoning", "complex"],
    maxOutputTokens: 32768,
  },
  "o3": {
    alias: "o3",
    provider: "openai",
    model: "o3-high",
    displayName: "OpenAI o3 High",
    description: "Next-generation reasoning with high compute",
    costTier: "premium",
    performanceTier: "quality",
    category: ["reasoning", "flagship", "2025"],
    maxOutputTokens: 100000,
  },

  // Anthropic Models - Claude 4.5 (2025)
  "claude-4.5": {
    alias: "claude-4.5",
    provider: "anthropic",
    model: "claude-opus-4-5-20251101",
    displayName: "Claude 4.5 Opus",
    description: "Most advanced Claude model with extended reasoning",
    costTier: "premium",
    performanceTier: "quality",
    category: ["flagship", "reasoning", "quality", "2025"],
    maxOutputTokens: 16384,
  },
  "sonnet-4.5": {
    alias: "sonnet-4.5",
    provider: "anthropic",
    model: "claude-sonnet-4-5-20250929",
    displayName: "Claude 4.5 Sonnet",
    description: "Balanced performance Claude 4.5 model",
    costTier: "standard",
    performanceTier: "balanced",
    category: ["flagship", "coding", "balanced", "2025"],
    maxOutputTokens: 8192,
  },
  "haiku-4.5": {
    alias: "haiku-4.5",
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    displayName: "Claude 4.5 Haiku",
    description: "Fast and efficient Claude 4.5 model",
    costTier: "budget",
    performanceTier: "fast",
    category: ["budget", "speed", "2025"],
    maxOutputTokens: 8192,
  },
  // Anthropic Models - Claude 4.5 (short aliases point to latest)
  "sonnet": {
    alias: "sonnet",
    provider: "anthropic",
    model: "claude-sonnet-4-5-20250929",
    displayName: "Claude 4.5 Sonnet",
    description: "Balanced model for coding and analysis",
    costTier: "standard",
    performanceTier: "balanced",
    category: ["flagship", "coding", "balanced", "2025"],
    maxOutputTokens: 8192,
  },
  "haiku": {
    alias: "haiku",
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    displayName: "Claude 4.5 Haiku",
    description: "Fast and efficient model for simple tasks",
    costTier: "budget",
    performanceTier: "fast",
    category: ["budget", "speed", "2025"],
    maxOutputTokens: 8192,
  },
  "opus": {
    alias: "opus",
    provider: "anthropic",
    model: "claude-opus-4-5-20251101",
    displayName: "Claude 4.5 Opus",
    description: "Most capable Claude model for complex reasoning",
    costTier: "premium",
    performanceTier: "quality",
    category: ["flagship", "reasoning", "quality", "2025"],
    maxOutputTokens: 16384,
  },

  // Google Gemini Models - 2025
  "gemini-3": {
    alias: "gemini-3",
    provider: "gemini",
    model: "gemini-3-pro-preview",
    displayName: "Gemini 3 Pro Preview",
    description: "Google's latest multimodal model with thinking support",
    costTier: "premium",
    performanceTier: "quality",
    category: ["flagship", "multimodal", "reasoning", "2025"],
    maxOutputTokens: 8192,
  },
  "gemini-2.5": {
    alias: "gemini-2.5",
    provider: "gemini",
    model: "gemini-2.5-pro",
    displayName: "Gemini 2.5 Pro",
    description: "Advanced Gemini with improved reasoning",
    costTier: "standard",
    performanceTier: "balanced",
    category: ["flagship", "balanced", "2025"],
    maxOutputTokens: 8192,
  },
  "gemini-2.5-flash": {
    alias: "gemini-2.5-flash",
    provider: "gemini",
    model: "gemini-2.5-flash",
    displayName: "Gemini 2.5 Flash",
    description: "Fast Gemini 2.5 model for quick responses",
    costTier: "budget",
    performanceTier: "fast",
    category: ["speed", "budget", "2025"],
    maxOutputTokens: 65536,
  },
  // Google Gemini Models - Short aliases point to latest
  "gemini": {
    alias: "gemini",
    provider: "gemini",
    model: "gemini-3-pro-preview",
    displayName: "Gemini 3 Pro Preview",
    description: "Google's latest multimodal model with thinking support",
    costTier: "premium",
    performanceTier: "quality",
    category: ["flagship", "multimodal", "2025"],
    maxOutputTokens: 8192,
  },
  "gemini-flash": {
    alias: "gemini-flash",
    provider: "gemini",
    model: "gemini-2.5-flash",
    displayName: "Gemini 2.5 Flash",
    description: "Optimized for speed and efficiency",
    costTier: "budget",
    performanceTier: "fast",
    category: ["budget", "speed", "2025"],
    maxOutputTokens: 65536,
  },
  "gemini-3-flash-preview": {
    alias: "gemini-3-flash-preview",
    provider: "gemini",
    model: "gemini-3-flash-preview",
    displayName: "Gemini 3 Flash Preview",
    description: "Latest Gemini 3 Flash preview model",
    costTier: "budget",
    performanceTier: "fast",
    category: ["speed", "budget", "2025"],
    maxOutputTokens: 65536,
  },

  // Local Models (common ones)
  "llama": {
    alias: "llama",
    provider: "local",
    model: "llama3.2:latest",
    displayName: "Llama 3.2",
    description: "Meta's open-source model via Ollama",
    costTier: "free",
    performanceTier: "balanced",
    category: ["local", "open-source"],
    maxOutputTokens: 4096,
  },
  "codellama": {
    alias: "codellama",
    provider: "local",
    model: "codellama:latest",
    displayName: "Code Llama",
    description: "Code-specialized Llama model",
    costTier: "free",
    performanceTier: "balanced",
    category: ["local", "coding", "open-source"],
    maxOutputTokens: 4096,
  },

  // OpenRouter Models (unified API gateway)
  "openrouter-gpt4": {
    alias: "openrouter-gpt4",
    provider: "openrouter",
    model: "openai/gpt-4o",
    displayName: "GPT-4o (via OpenRouter)",
    description: "GPT-4o via OpenRouter unified API",
    costTier: "premium",
    performanceTier: "quality",
    category: ["openrouter", "flagship"],
    maxOutputTokens: 16384,
  },
  "openrouter-claude": {
    alias: "openrouter-claude",
    provider: "openrouter",
    model: "anthropic/claude-3.5-sonnet",
    displayName: "Claude 3.5 Sonnet (via OpenRouter)",
    description: "Claude via OpenRouter unified API",
    costTier: "standard",
    performanceTier: "balanced",
    category: ["openrouter", "balanced"],
    maxOutputTokens: 8192,
  },
  "openrouter-llama": {
    alias: "openrouter-llama",
    provider: "openrouter",
    model: "meta-llama/llama-3.3-70b-instruct",
    displayName: "Llama 3.3 70B (via OpenRouter)",
    description: "Meta's Llama via OpenRouter",
    costTier: "budget",
    performanceTier: "balanced",
    category: ["openrouter", "open-source"],
    maxOutputTokens: 4096,
  },
  "openrouter-deepseek": {
    alias: "openrouter-deepseek",
    provider: "openrouter",
    model: "deepseek/deepseek-chat",
    displayName: "DeepSeek Chat (via OpenRouter)",
    description: "DeepSeek via OpenRouter unified API",
    costTier: "budget",
    performanceTier: "balanced",
    category: ["openrouter", "budget", "open-source"],
    maxOutputTokens: 8192,
  },

  // Mock for testing
  "mock": {
    alias: "mock",
    provider: "mock",
    model: "mock-gpt-4",
    displayName: "Mock GPT-4",
    description: "Mock adapter for testing and development",
    costTier: "free",
    performanceTier: "fast",
    category: ["testing", "development"],
    maxOutputTokens: 4096,
  },
};

export const MODEL_GROUPS: Record<string, string[]> = {
  // Performance-based groups
  "flagship": [
    "gpt-5",
    "claude-4.5",
    "gemini-3",
    "gpt-4o",
    "sonnet",
    "opus",
    "gemini",
    "o3",
  ],
  "budget": [
    "gpt-3.5",
    "haiku",
    "haiku-4.5",
    "gemini-flash",
    "gemini-2.5-flash",
  ],
  "fast": [
    "gpt-3.5",
    "haiku",
    "haiku-4.5",
    "gemini-flash",
    "gemini-2.5-flash",
    "codex-mini",
    "llama",
  ],
  "quality": [
    "gpt-5",
    "gpt-5-pro",
    "claude-4.5",
    "gemini-3",
    "gpt-4o",
    "opus",
    "o1",
    "o3",
  ],

  // Use case groups
  "coding": [
    "gpt-5",
    "codex",
    "codex-max",
    "codex-mini",
    "sonnet-4.5",
    "gpt-4o",
    "sonnet",
    "codellama",
    "gpt-4",
  ],
  "reasoning": ["o1", "o3", "claude-4.5", "gpt-5-pro", "gemini-3", "opus"],
  "multimodal": ["gpt-4o", "gemini", "gemini-3"],
  "local": ["llama", "codellama"],
  "free": ["llama", "codellama", "mock"],

  // 2025 models group
  "2025": [
    "gpt-5",
    "gpt-5-pro",
    "codex",
    "codex-max",
    "codex-mini",
    "claude-4.5",
    "sonnet-4.5",
    "haiku-4.5",
    "gemini-3",
    "gemini-2.5",
    "gemini-2.5-flash",
    "o3",
  ],

  // OpenRouter models
  "openrouter": [
    "openrouter-gpt4",
    "openrouter-claude",
    "openrouter-llama",
    "openrouter-deepseek",
  ],

  // Cost-based groups
  "expensive": [
    "gpt-5",
    "gpt-5-pro",
    "claude-4.5",
    "gemini-3",
    "gpt-4o",
    "opus",
    "o1",
    "o3",
  ],
  "cheap": [
    "gpt-3.5",
    "haiku",
    "haiku-4.5",
    "gemini-flash",
    "gemini-2.5-flash",
    "openrouter-deepseek",
  ],

  // Testing groups
  "comparison": [
    "gpt-5",
    "sonnet-4.5",
    "gemini-2.5",
    "gpt-4o",
    "sonnet",
    "gemini",
    "opus",
  ],
  "speed-test": [
    "gpt-3.5",
    "haiku",
    "haiku-4.5",
    "gemini-flash",
    "gemini-2.5-flash",
  ],
  "quality-test": ["gpt-5", "claude-4.5", "gemini-3", "gpt-4o", "opus", "o1"],
  "all": Object.keys(MODEL_PRESETS),
};

export class ModelPresetRegistry {
  /**
   * Resolve a model specification to provider/model format
   * Supports: aliases, groups, and full provider/model specs
   */
  static resolve(spec: string): string[] {
    // If it's already provider/model format, return as-is
    if (spec.includes("/")) {
      return [spec];
    }

    // Check if it's a group
    if (MODEL_GROUPS[spec]) {
      return MODEL_GROUPS[spec].map((alias) => {
        const preset = MODEL_PRESETS[alias];
        if (!preset) return alias; // Return alias as-is if not found
        return `${preset.provider}/${preset.model}`;
      });
    }

    // Check if it's a preset alias
    if (MODEL_PRESETS[spec]) {
      const preset = MODEL_PRESETS[spec];
      return [`${preset.provider}/${preset.model}`];
    }

    // Unknown spec, return as-is (will be handled by existing logic)
    return [spec];
  }

  /**
   * Get all available presets grouped by category
   */
  static getPresetsByCategory(): Record<string, ModelPreset[]> {
    const categories: Record<string, ModelPreset[]> = {};

    for (const preset of Object.values(MODEL_PRESETS)) {
      for (const category of preset.category) {
        if (!categories[category]) {
          categories[category] = [];
        }
        categories[category].push(preset);
      }
    }

    return categories;
  }

  /**
   * Get presets by cost tier
   */
  static getPresetsByCostTier(): Record<string, ModelPreset[]> {
    const tiers: Record<string, ModelPreset[]> = {
      free: [],
      budget: [],
      standard: [],
      premium: [],
    };

    for (const preset of Object.values(MODEL_PRESETS)) {
      const tier = tiers[preset.costTier];
      if (tier) {
        tier.push(preset);
      }
    }

    return tiers;
  }

  /**
   * Get preset info by alias
   */
  static getPreset(alias: string): ModelPreset | null {
    return MODEL_PRESETS[alias] || null;
  }

  /**
   * List all available groups
   */
  static getGroups(): string[] {
    return Object.keys(MODEL_GROUPS);
  }

  /**
   * List all available aliases
   */
  static getAliases(): string[] {
    return Object.keys(MODEL_PRESETS);
  }

  /**
   * Resolve model specifications with variant support
   * Handles inline syntax (model@temp=0.5) and profile references (model@profile=name)
   * @param specs Array of model specs (e.g., ["sonnet@temp=0.5", "gpt-4o"])
   * @param config Config containing systemPrompts and variantProfiles
   * @returns Array of resolved ModelVariant objects
   */
  static resolveWithVariants(
    specs: string[],
    config?: CentralGaugeConfig,
  ): ModelVariant[] {
    return resolveVariants(specs, config);
  }
}
