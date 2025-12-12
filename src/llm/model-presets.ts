/**
 * Model presets and aliases for easier command-line usage
 * Instead of typing "anthropic/claude-3-5-sonnet-20241022", users can use "sonnet"
 */

export interface ModelPreset {
  readonly alias: string;
  readonly provider: string;
  readonly model: string;
  readonly displayName: string;
  readonly description: string;
  readonly costTier: "free" | "budget" | "standard" | "premium";
  readonly performanceTier: "fast" | "balanced" | "quality";
  readonly category: string[];
}

export const MODEL_PRESETS: Record<string, ModelPreset> = {
  // OpenAI Models
  "gpt-4o": {
    alias: "gpt-4o",
    provider: "openai",
    model: "gpt-4o",
    displayName: "GPT-4o",
    description: "Latest GPT-4 optimized model with vision capabilities",
    costTier: "premium",
    performanceTier: "quality",
    category: ["flagship", "coding", "reasoning"]
  },
  "gpt-4": {
    alias: "gpt-4",
    provider: "openai", 
    model: "gpt-4-turbo",
    displayName: "GPT-4 Turbo",
    description: "High-performance GPT-4 with improved speed",
    costTier: "premium",
    performanceTier: "balanced",
    category: ["flagship", "coding"]
  },
  "gpt-3.5": {
    alias: "gpt-3.5",
    provider: "openai",
    model: "gpt-3.5-turbo",
    displayName: "GPT-3.5 Turbo", 
    description: "Fast and cost-effective chat model",
    costTier: "budget",
    performanceTier: "fast",
    category: ["budget", "speed"]
  },
  "o1": {
    alias: "o1",
    provider: "openai",
    model: "o1-preview",
    displayName: "OpenAI o1",
    description: "Advanced reasoning model for complex problems",
    costTier: "premium",
    performanceTier: "quality",
    category: ["reasoning", "complex"]
  },
  "o3": {
    alias: "o3",
    provider: "openai",
    model: "o3-high",
    displayName: "OpenAI o3 High",
    description: "Next-generation reasoning with high compute",
    costTier: "premium", 
    performanceTier: "quality",
    category: ["reasoning", "flagship", "experimental"]
  },

  // Anthropic Models
  "sonnet": {
    alias: "sonnet",
    provider: "anthropic",
    model: "claude-3-5-sonnet-20241022",
    displayName: "Claude 3.5 Sonnet",
    description: "Balanced model for coding and analysis",
    costTier: "standard",
    performanceTier: "balanced",
    category: ["flagship", "coding", "balanced"]
  },
  "haiku": {
    alias: "haiku",
    provider: "anthropic", 
    model: "claude-3-haiku-20240307",
    displayName: "Claude 3 Haiku",
    description: "Fast and efficient model for simple tasks",
    costTier: "budget",
    performanceTier: "fast",
    category: ["budget", "speed"]
  },
  "opus": {
    alias: "opus",
    provider: "anthropic",
    model: "claude-3-opus-20240229", 
    displayName: "Claude 3 Opus",
    description: "Most capable model for complex reasoning",
    costTier: "premium",
    performanceTier: "quality",
    category: ["flagship", "reasoning", "quality"]
  },
  "sonnet-4": {
    alias: "sonnet-4",
    provider: "anthropic",
    model: "sonnet-4-think-8k",
    displayName: "Claude Sonnet-4 (Thinking)",
    description: "Advanced model with extended thinking capabilities",
    costTier: "premium",
    performanceTier: "quality", 
    category: ["flagship", "reasoning", "experimental"]
  },

  // Google Gemini Models
  "gemini": {
    alias: "gemini",
    provider: "gemini",
    model: "gemini-1.5-pro",
    displayName: "Gemini 1.5 Pro",
    description: "Google's flagship multimodal model",
    costTier: "standard",
    performanceTier: "balanced",
    category: ["flagship", "multimodal"]
  },
  "gemini-flash": {
    alias: "gemini-flash",
    provider: "gemini", 
    model: "gemini-1.5-flash",
    displayName: "Gemini 1.5 Flash",
    description: "Optimized for speed and efficiency",
    costTier: "budget",
    performanceTier: "fast",
    category: ["budget", "speed"]
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
    category: ["local", "open-source"]
  },
  "codellama": {
    alias: "codellama", 
    provider: "local",
    model: "codellama:latest",
    displayName: "Code Llama",
    description: "Code-specialized Llama model",
    costTier: "free",
    performanceTier: "balanced",
    category: ["local", "coding", "open-source"]
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
    category: ["testing", "development"]
  }
};

export const MODEL_GROUPS: Record<string, string[]> = {
  // Performance-based groups
  "flagship": ["gpt-4o", "sonnet", "opus", "gemini", "o3"],
  "budget": ["gpt-3.5", "haiku", "gemini-flash"],
  "fast": ["gpt-3.5", "haiku", "gemini-flash", "llama"], 
  "quality": ["gpt-4o", "opus", "o1", "o3", "sonnet-4"],
  
  // Use case groups
  "coding": ["gpt-4o", "sonnet", "codellama", "gpt-4"],
  "reasoning": ["o1", "o3", "opus", "sonnet-4"],
  "multimodal": ["gpt-4o", "gemini"],
  "local": ["llama", "codellama"],
  "free": ["llama", "codellama", "mock"],
  
  // Cost-based groups  
  "expensive": ["gpt-4o", "opus", "o1", "o3"],
  "cheap": ["gpt-3.5", "haiku", "gemini-flash"],
  
  // Testing groups
  "comparison": ["gpt-4o", "sonnet", "gemini", "opus"],
  "speed-test": ["gpt-3.5", "haiku", "gemini-flash"],
  "quality-test": ["gpt-4o", "opus", "o1"],
  "all": Object.keys(MODEL_PRESETS)
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
      return MODEL_GROUPS[spec].map(alias => {
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
      premium: []
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
}