import type { LLMAdapter, LLMConfig } from "./types.ts";
import { MockLLMAdapter } from "./mock-adapter.ts";
import { OpenAIAdapter } from "./openai-adapter.ts";
import { AnthropicAdapter } from "./anthropic-adapter.ts";
import { GeminiAdapter } from "./gemini-adapter.ts";
import { AzureOpenAIAdapter } from "./azure-openai-adapter.ts";
import { LocalLLMAdapter } from "./local-adapter.ts";
import { OpenRouterAdapter } from "./openrouter-adapter.ts";
import { ConfigurationError } from "../errors.ts";

/**
 * Pooled adapter entry with tracking metadata
 */
interface PooledAdapter {
  adapter: LLMAdapter;
  provider: string;
  model: string;
  inUse: boolean;
  lastUsed: number;
}

export class LLMAdapterRegistry {
  private static adapters = new Map<string, () => LLMAdapter>();

  // Adapter pool for reuse in parallel execution
  private static pool: PooledAdapter[] = [];
  private static poolMaxSize = 50;
  private static poolMaxIdleMs = 300000; // 5 minutes

  static {
    // Register built-in adapters
    this.register("mock", () => new MockLLMAdapter());
    this.register("openai", () => new OpenAIAdapter());
    this.register("anthropic", () => new AnthropicAdapter());
    this.register("gemini", () => new GeminiAdapter());
    this.register("azure-openai", () => new AzureOpenAIAdapter());
    this.register("local", () => new LocalLLMAdapter());
    this.register("openrouter", () => new OpenRouterAdapter());
  }

  static register(name: string, factory: () => LLMAdapter): void {
    this.adapters.set(name, factory);
  }

  static create(name: string, config?: LLMConfig): LLMAdapter {
    const factory = this.adapters.get(name);
    if (!factory) {
      throw new ConfigurationError(
        `Unknown LLM adapter: ${name}. Available: ${
          Array.from(this.adapters.keys()).join(", ")
        }`,
        undefined,
        {
          requestedAdapter: name,
          availableAdapters: Array.from(this.adapters.keys()),
        },
      );
    }

    const adapter = factory();
    if (config) {
      adapter.configure(config);
    }

    return adapter;
  }

  /**
   * Acquire an adapter from the pool or create a new one
   * Use this for parallel execution to enable adapter reuse
   */
  static acquire(name: string, config?: LLMConfig): LLMAdapter {
    const model = config?.model || "default";

    // Clean up idle adapters first
    this.cleanupIdleAdapters();

    // Look for an available adapter in the pool
    const pooledEntry = this.pool.find(
      (entry) =>
        entry.provider === name &&
        entry.model === model &&
        !entry.inUse,
    );

    if (pooledEntry) {
      pooledEntry.inUse = true;
      pooledEntry.lastUsed = Date.now();
      return pooledEntry.adapter;
    }

    // Create new adapter
    const adapter = this.create(name, config);

    // Add to pool if not full
    if (this.pool.length < this.poolMaxSize) {
      this.pool.push({
        adapter,
        provider: name,
        model,
        inUse: true,
        lastUsed: Date.now(),
      });
    }

    return adapter;
  }

  /**
   * Release an adapter back to the pool
   */
  static release(adapter: LLMAdapter): void {
    const entry = this.pool.find((e) => e.adapter === adapter);
    if (entry) {
      entry.inUse = false;
      entry.lastUsed = Date.now();
    }
  }

  /**
   * Clean up idle adapters from the pool
   */
  private static cleanupIdleAdapters(): void {
    const now = Date.now();
    this.pool = this.pool.filter((entry) => {
      // Keep adapters that are in use or haven't been idle too long
      if (entry.inUse) return true;
      return now - entry.lastUsed < this.poolMaxIdleMs;
    });
  }

  /**
   * Get pool statistics
   */
  static getPoolStats(): {
    total: number;
    inUse: number;
    available: number;
    byProvider: Map<string, { total: number; inUse: number }>;
  } {
    const byProvider = new Map<string, { total: number; inUse: number }>();

    for (const entry of this.pool) {
      const stats = byProvider.get(entry.provider) || { total: 0, inUse: 0 };
      stats.total++;
      if (entry.inUse) stats.inUse++;
      byProvider.set(entry.provider, stats);
    }

    return {
      total: this.pool.length,
      inUse: this.pool.filter((e) => e.inUse).length,
      available: this.pool.filter((e) => !e.inUse).length,
      byProvider,
    };
  }

  /**
   * Clear the adapter pool (for testing)
   */
  static clearPool(): void {
    this.pool = [];
  }

  /**
   * Configure pool settings
   */
  static configurePool(options: {
    maxSize?: number;
    maxIdleMs?: number;
  }): void {
    if (options.maxSize !== undefined) {
      this.poolMaxSize = options.maxSize;
    }
    if (options.maxIdleMs !== undefined) {
      this.poolMaxIdleMs = options.maxIdleMs;
    }
  }

  static list(): string[] {
    return Array.from(this.adapters.keys());
  }

  static isAvailable(name: string): boolean {
    return this.adapters.has(name);
  }

  static getSupportedModels(adapterName: string): string[] {
    if (!this.isAvailable(adapterName)) {
      return [];
    }

    const adapter = this.create(adapterName);
    return adapter.supportedModels;
  }

  static getAllSupportedModels(): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const adapterName of this.list()) {
      result[adapterName] = this.getSupportedModels(adapterName);
    }
    return result;
  }

  /**
   * Validate a model specification against the adapter's supported models.
   * Models match if they exactly match or start with a supported model prefix.
   * @param provider - The provider name (e.g., "openai", "anthropic")
   * @param model - The model ID (e.g., "gpt-5.2-2025-12-11")
   * @returns Validation result with error message and suggestions if invalid
   */
  static validateModel(
    provider: string,
    model: string,
  ): {
    valid: boolean;
    error?: string;
    suggestions?: string[];
    availableModels?: string[];
  } {
    // Check if provider exists
    if (!this.isAvailable(provider)) {
      return {
        valid: false,
        error: `Unknown provider '${provider}'`,
        suggestions: this.list(),
      };
    }

    const supportedModels = this.getSupportedModels(provider);

    // Check exact match or prefix match
    const isValid = supportedModels.some(
      (supported) =>
        model === supported || model.startsWith(supported + "-") ||
        model.startsWith(supported),
    );

    if (isValid) {
      return { valid: true };
    }

    // Find similar models for suggestions
    const suggestions = this.findSimilarModels(model, supportedModels);

    const result: {
      valid: boolean;
      error?: string;
      suggestions?: string[];
      availableModels?: string[];
    } = {
      valid: false,
      error: `Model '${model}' not supported by ${provider} provider`,
      availableModels: supportedModels,
    };

    if (suggestions.length > 0) {
      result.suggestions = suggestions;
    }

    return result;
  }

  /**
   * Find similar models using simple string matching
   */
  private static findSimilarModels(
    target: string,
    candidates: string[],
  ): string[] {
    const targetLower = target.toLowerCase();
    const suggestions: Array<{ model: string; score: number }> = [];

    for (const candidate of candidates) {
      const candidateLower = candidate.toLowerCase();
      let score = 0;

      // Exact prefix match
      if (targetLower.startsWith(candidateLower)) {
        score += 50;
      }
      // Reverse prefix match
      if (candidateLower.startsWith(targetLower)) {
        score += 40;
      }
      // Contains match
      if (targetLower.includes(candidateLower)) {
        score += 30;
      }
      if (candidateLower.includes(targetLower)) {
        score += 25;
      }
      // Check for common substrings (e.g., "gpt", "claude", "codex")
      const targetParts = targetLower.split(/[-_./]/);
      const candidateParts = candidateLower.split(/[-_./]/);
      for (const part of targetParts) {
        if (
          part.length >= 3 && candidateParts.some((cp) => cp.includes(part))
        ) {
          score += 10;
        }
      }

      if (score > 0) {
        suggestions.push({ model: candidate, score });
      }
    }

    // Sort by score descending and return top 3
    return suggestions
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((s) => s.model);
  }

  /**
   * List all models for a specific provider
   * @param provider - The provider name
   * @returns Array of supported model names, or empty array if provider not found
   */
  static listModelsForProvider(provider: string): string[] {
    return this.getSupportedModels(provider);
  }
}
