/**
 * Agent Registry
 *
 * Manages agent configuration discovery, loading, and resolution.
 * Follows the factory pattern similar to LLMAdapterRegistry.
 */

import { exists } from "@std/fs";
import type {
  AgentConfig,
  AgentValidationResult,
  ResolvedAgentConfig,
} from "./types.ts";
import {
  loadAgentConfig,
  loadAgentConfigs,
  resolveAgentInheritance,
  validateAgentConfig,
} from "./loader.ts";

/**
 * Default agents directory relative to project root
 */
const DEFAULT_AGENTS_DIR = "agents";

export class AgentRegistry {
  private static configs = new Map<string, AgentConfig>();
  private static resolvedCache = new Map<string, ResolvedAgentConfig>();
  private static loadedDirs = new Set<string>();

  /**
   * Load all agent configurations from a directory
   */
  static async load(directory: string = DEFAULT_AGENTS_DIR): Promise<void> {
    // Avoid reloading the same directory
    if (this.loadedDirs.has(directory)) {
      return;
    }

    if (!await exists(directory)) {
      console.warn(`Agents directory not found: ${directory}`);
      return;
    }

    const configs = await loadAgentConfigs(directory);
    for (const [id, config] of configs) {
      this.configs.set(id, config);
    }

    this.loadedDirs.add(directory);
    // Clear resolved cache when new configs are loaded
    this.resolvedCache.clear();
  }

  /**
   * Load a single agent configuration from a file
   */
  static async loadFile(filePath: string): Promise<AgentConfig> {
    const config = await loadAgentConfig(filePath);
    this.configs.set(config.id, config);
    this.resolvedCache.delete(config.id);
    return config;
  }

  /**
   * Register an agent configuration directly
   */
  static register(config: AgentConfig): void {
    this.configs.set(config.id, config);
    this.resolvedCache.delete(config.id);
  }

  /**
   * Get a raw agent configuration by ID (without inheritance resolution)
   */
  static getRaw(id: string): AgentConfig | undefined {
    return this.configs.get(id);
  }

  /**
   * Get a fully resolved agent configuration (with inheritance applied)
   */
  static get(id: string): ResolvedAgentConfig | undefined {
    // Check cache first
    if (this.resolvedCache.has(id)) {
      return this.resolvedCache.get(id);
    }

    if (!this.configs.has(id)) {
      return undefined;
    }

    try {
      const resolved = resolveAgentInheritance(id, this.configs);
      this.resolvedCache.set(id, resolved);
      return resolved;
    } catch (error) {
      console.error(`Failed to resolve agent ${id}: ${error}`);
      return undefined;
    }
  }

  /**
   * Get a resolved agent, throwing if not found
   */
  static getOrThrow(id: string): ResolvedAgentConfig {
    const config = this.get(id);
    if (!config) {
      throw new Error(
        `Agent not found: ${id}. Available: ${
          this.list().join(", ") || "(none)"
        }`,
      );
    }
    return config;
  }

  /**
   * List all registered agent IDs
   */
  static list(): string[] {
    return Array.from(this.configs.keys()).sort();
  }

  /**
   * Check if an agent exists
   */
  static has(id: string): boolean {
    return this.configs.has(id);
  }

  /**
   * Validate an agent configuration
   */
  static validate(id: string): AgentValidationResult {
    const config = this.get(id);
    if (!config) {
      return {
        valid: false,
        errors: [`Agent not found: ${id}`],
        warnings: [],
      };
    }
    return validateAgentConfig(config);
  }

  /**
   * Get all agent configurations with their resolved versions
   */
  static getAll(): Map<string, ResolvedAgentConfig> {
    const result = new Map<string, ResolvedAgentConfig>();
    for (const id of this.configs.keys()) {
      const resolved = this.get(id);
      if (resolved) {
        result.set(id, resolved);
      }
    }
    return result;
  }

  /**
   * Get agents by tag
   */
  static getByTag(tag: string): ResolvedAgentConfig[] {
    const results: ResolvedAgentConfig[] = [];
    for (const id of this.configs.keys()) {
      const resolved = this.get(id);
      if (resolved?.tags?.includes(tag)) {
        results.push(resolved);
      }
    }
    return results;
  }

  /**
   * Clear all registered configurations (for testing)
   */
  static clear(): void {
    this.configs.clear();
    this.resolvedCache.clear();
    this.loadedDirs.clear();
  }

  /**
   * Get registry statistics
   */
  static getStats(): {
    total: number;
    loadedDirs: string[];
    byTag: Map<string, number>;
  } {
    const byTag = new Map<string, number>();

    for (const config of this.configs.values()) {
      for (const tag of config.tags ?? []) {
        byTag.set(tag, (byTag.get(tag) ?? 0) + 1);
      }
    }

    return {
      total: this.configs.size,
      loadedDirs: [...this.loadedDirs],
      byTag,
    };
  }
}
