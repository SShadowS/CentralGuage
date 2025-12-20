/**
 * Agent Configuration Loader
 *
 * Loads agent configurations from YAML files and resolves inheritance chains.
 */

import { exists, walk } from "@std/fs";
import { parse } from "@std/yaml";
import { basename, extname } from "@std/path";
import type {
  AgentConfig,
  AgentValidationResult,
  ResolvedAgentConfig,
} from "./types.ts";

/**
 * Load a single agent configuration from a YAML file
 */
export async function loadAgentConfig(
  configPath: string,
): Promise<AgentConfig> {
  if (!await exists(configPath)) {
    throw new Error(`Agent config not found: ${configPath}`);
  }

  const content = await Deno.readTextFile(configPath);
  const config = parse(content) as AgentConfig;

  // Validate required fields
  if (!config.id) {
    throw new Error(`Agent config missing 'id' field: ${configPath}`);
  }

  return config;
}

/**
 * Load all agent configurations from a directory
 */
export async function loadAgentConfigs(
  directory: string,
): Promise<Map<string, AgentConfig>> {
  const configs = new Map<string, AgentConfig>();

  if (!await exists(directory)) {
    return configs;
  }

  for await (
    const entry of walk(directory, {
      maxDepth: 1,
      exts: [".yml", ".yaml"],
      includeFiles: true,
      includeDirs: false,
    })
  ) {
    try {
      const config = await loadAgentConfig(entry.path);
      configs.set(config.id, config);
    } catch (error) {
      console.warn(
        `Failed to load agent config ${entry.path}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  return configs;
}

/**
 * Resolve agent inheritance chain and merge configurations
 */
export function resolveAgentInheritance(
  agentId: string,
  configs: Map<string, AgentConfig>,
  visited: Set<string> = new Set(),
): ResolvedAgentConfig {
  const config = configs.get(agentId);
  if (!config) {
    throw new Error(`Agent config not found: ${agentId}`);
  }

  // Detect circular inheritance
  if (visited.has(agentId)) {
    throw new Error(
      `Circular inheritance detected: ${[...visited, agentId].join(" -> ")}`,
    );
  }
  visited.add(agentId);

  // Base case: no parent to inherit from
  if (!config.extends) {
    return {
      ...config,
      _inheritanceChain: [agentId],
    };
  }

  // Recursively resolve parent
  const parent = resolveAgentInheritance(config.extends, configs, visited);

  // Merge parent and child configs
  const resolved: ResolvedAgentConfig = {
    // Parent values as defaults
    ...parent,
    // Child values override
    ...config,
    // Special handling for nested objects (merge instead of replace)
    mcpServers: {
      ...parent.mcpServers,
      ...config.mcpServers,
    },
    limits: {
      ...parent.limits,
      ...config.limits,
    },
    // Merge allowed tools (child adds to parent)
    allowedTools: config.allowedTools ?? parent.allowedTools,
    // Merge setting sources if child specifies (default to ['project'])
    settingSources: config.settingSources ?? parent.settingSources ??
      ["project"],
    // Track inheritance chain
    _inheritanceChain: [...(parent._inheritanceChain ?? []), agentId],
  };

  return resolved;
}

/**
 * Validate an agent configuration
 */
export function validateAgentConfig(
  config: AgentConfig,
): AgentValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!config.id) {
    errors.push("Missing required field: id");
  }
  if (!config.name) {
    errors.push("Missing required field: name");
  }
  if (!config.model) {
    errors.push("Missing required field: model");
  }
  if (config.maxTurns === undefined || config.maxTurns <= 0) {
    errors.push("maxTurns must be a positive number");
  }
  if (!config.allowedTools || config.allowedTools.length === 0) {
    errors.push("allowedTools must contain at least one tool");
  }

  // Warnings
  if (config.maxTokens && config.maxTokens < 10000) {
    warnings.push("maxTokens is very low, agent may terminate prematurely");
  }
  if (config.maxTurns > 50) {
    warnings.push("maxTurns is very high, consider setting a lower limit");
  }

  // Validate system prompt
  if (config.systemPrompt) {
    if (typeof config.systemPrompt === "object") {
      if (config.systemPrompt.preset !== "claude_code") {
        errors.push("systemPrompt.preset must be 'claude_code'");
      }
    }
  }

  // Validate MCP servers
  if (config.mcpServers) {
    for (const [name, server] of Object.entries(config.mcpServers)) {
      if (!server.command) {
        errors.push(`MCP server '${name}' missing required field: command`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Get the display name for an agent (for CLI output)
 */
export function getAgentDisplayName(config: AgentConfig): string {
  return config.name || config.id;
}

/**
 * Get agent ID from a file path
 */
export function getAgentIdFromPath(filePath: string): string {
  const filename = basename(filePath);
  const ext = extname(filename);
  return filename.slice(0, -ext.length);
}
