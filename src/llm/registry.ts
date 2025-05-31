import type { LLMAdapter, LLMConfig } from "./types.ts";
import { MockLLMAdapter } from "./mock-adapter.ts";
import { OpenAIAdapter } from "./openai-adapter.ts";
import { AnthropicAdapter } from "./anthropic-adapter.ts";
import { GeminiAdapter } from "./gemini-adapter.ts";
import { AzureOpenAIAdapter } from "./azure-openai-adapter.ts";
import { LocalLLMAdapter } from "./local-adapter.ts";

export class LLMAdapterRegistry {
  private static adapters = new Map<string, () => LLMAdapter>();
  
  static {
    // Register built-in adapters
    this.register("mock", () => new MockLLMAdapter());
    this.register("openai", () => new OpenAIAdapter());
    this.register("anthropic", () => new AnthropicAdapter());
    this.register("gemini", () => new GeminiAdapter());
    this.register("azure-openai", () => new AzureOpenAIAdapter());
    this.register("local", () => new LocalLLMAdapter());
  }
  
  static register(name: string, factory: () => LLMAdapter): void {
    this.adapters.set(name, factory);
  }
  
  static create(name: string, config?: LLMConfig): LLMAdapter {
    const factory = this.adapters.get(name);
    if (!factory) {
      throw new Error(`Unknown LLM adapter: ${name}. Available: ${Array.from(this.adapters.keys()).join(", ")}`);
    }
    
    const adapter = factory();
    if (config) {
      adapter.configure(config);
    }
    
    return adapter;
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