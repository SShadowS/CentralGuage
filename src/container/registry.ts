import type { ContainerProvider } from "./interface.ts";
import { MockContainerProvider } from "./mock-provider.ts";

export class ContainerProviderRegistry {
  private static providers = new Map<string, () => ContainerProvider>();
  private static instances = new Map<string, ContainerProvider>();
  
  static {
    // Register built-in providers
    this.register("mock", () => new MockContainerProvider());
  }
  
  static register(name: string, factory: () => ContainerProvider): void {
    this.providers.set(name, factory);
  }
  
  static create(name: string): ContainerProvider {
    // Return cached instance if it exists (for providers that need to maintain state)
    if (this.instances.has(name)) {
      return this.instances.get(name)!;
    }
    
    const factory = this.providers.get(name);
    if (!factory) {
      throw new Error(`Unknown container provider: ${name}. Available: ${Array.from(this.providers.keys()).join(", ")}`);
    }
    
    const instance = factory();
    this.instances.set(name, instance);
    return instance;
  }
  
  static list(): string[] {
    return Array.from(this.providers.keys());
  }
  
  static isAvailable(name: string): boolean {
    return this.providers.has(name);
  }
  
  // Clear cached instances (useful for testing)
  static clearInstances(): void {
    this.instances.clear();
  }
}