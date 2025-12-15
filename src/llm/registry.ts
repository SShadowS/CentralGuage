import type { LLMAdapter, LLMConfig } from "./types.ts";
import { MockLLMAdapter } from "./mock-adapter.ts";
import { OpenAIAdapter } from "./openai-adapter.ts";
import { AnthropicAdapter } from "./anthropic-adapter.ts";
import { GeminiAdapter } from "./gemini-adapter.ts";
import { AzureOpenAIAdapter } from "./azure-openai-adapter.ts";
import { LocalLLMAdapter } from "./local-adapter.ts";
import { OpenRouterAdapter } from "./openrouter-adapter.ts";

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
      throw new Error(
        `Unknown LLM adapter: ${name}. Available: ${
          Array.from(this.adapters.keys()).join(", ")
        }`,
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
}
