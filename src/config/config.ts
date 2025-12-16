/**
 * Configuration management for CentralGauge
 * Supports config files, environment variables, and CLI overrides
 */

import { exists } from "@std/fs";
import { parse as parseYaml } from "@std/yaml";
import type { PromptInjectionConfig } from "../prompts/mod.ts";
import type {
  SystemPromptDefinition,
  VariantProfile,
} from "../llm/variant-types.ts";

export interface CentralGaugeConfig {
  // Default models for different scenarios
  defaultModels?: {
    benchmark?: string[];
    development?: string[];
    comparison?: string[];
  };

  // LLM provider settings
  llm?: {
    temperature?: number;
    maxTokens?: number;
    timeout?: number;
  };

  // Benchmark settings
  benchmark?: {
    attempts?: number;
    outputDir?: string;
    templateDir?: string;
  };

  // Container settings
  container?: {
    provider?: string;
    name?: string;
    bcVersion?: string;
    memoryLimit?: string;
    credentials?: {
      username?: string;
      password?: string;
    };
  };

  // Debug settings
  debug?: {
    enabled?: boolean;
    outputDir?: string;
    logLevel?: "basic" | "detailed" | "verbose";
    includeRawResponse?: boolean;
    includeRequestHeaders?: boolean;
    maxFileSize?: number; // in MB
  };

  // Environment overrides
  environment?: Record<string, string>;

  // Prompt injection configuration
  prompts?: PromptInjectionConfig;

  // Named system prompts for model variants
  systemPrompts?: Record<string, SystemPromptDefinition>;

  // Named variant profiles for comparing same model with different configs
  variantProfiles?: Record<string, VariantProfile>;
}

export class ConfigManager {
  private static config: CentralGaugeConfig = {};
  private static configLoaded = false;

  /**
   * Reset configuration (mainly for testing)
   */
  static reset(): void {
    this.config = {};
    this.configLoaded = false;
  }

  /**
   * Set configuration directly (for testing)
   */
  static setConfig(config: Partial<CentralGaugeConfig>): void {
    this.config = { ...this.config, ...config };
    this.configLoaded = true;
  }

  /**
   * Load configuration from various sources in priority order:
   * 1. CLI arguments (highest priority)
   * 2. Environment variables
   * 3. .centralgauge.yml in current directory
   * 4. .centralgauge.yml in home directory
   * 5. Built-in defaults (lowest priority)
   */
  static async loadConfig(
    cliOverrides?: Partial<CentralGaugeConfig>,
  ): Promise<CentralGaugeConfig> {
    if (this.configLoaded && !cliOverrides) {
      return this.config;
    }

    let config: CentralGaugeConfig = this.getDefaults();

    // 4. Home directory config
    try {
      const homeDir = Deno.env.get("HOME") || Deno.env.get("USERPROFILE");
      if (homeDir) {
        const homeConfigPath = `${homeDir}/.centralgauge.yml`;
        if (await exists(homeConfigPath)) {
          const homeConfig = await this.loadConfigFile(homeConfigPath);
          config = this.mergeConfigs(config, homeConfig);
        }
      }
    } catch {
      // Ignore errors loading home config
    }

    // 3. Current directory config
    try {
      const localConfigPath = ".centralgauge.yml";
      if (await exists(localConfigPath)) {
        const localConfig = await this.loadConfigFile(localConfigPath);
        config = this.mergeConfigs(config, localConfig);
      }
    } catch {
      // Ignore errors loading local config
    }

    // 2. Environment variables
    const envConfig = this.loadEnvironmentConfig();
    config = this.mergeConfigs(config, envConfig);

    // 1. CLI overrides (highest priority)
    if (cliOverrides) {
      config = this.mergeConfigs(config, cliOverrides);
    }

    this.config = config;
    this.configLoaded = true;
    return config;
  }

  /**
   * Get configuration value with fallback
   */
  static async get<T>(path: string, fallback?: T): Promise<T | undefined> {
    const config = await this.loadConfig();
    const keys = path.split(".");

    let value: unknown = config;
    for (const key of keys) {
      value = (value as Record<string, unknown>)?.[key];
      if (value === undefined) {
        return fallback;
      }
    }

    return value as T;
  }

  /**
   * Resolve model specifications using config defaults
   */
  static async resolveModels(
    spec?: string[],
    scenario: "benchmark" | "development" | "comparison" = "benchmark",
  ): Promise<string[]> {
    const config = await this.loadConfig();

    // Use provided specs if available
    if (spec && spec.length > 0) {
      return spec;
    }

    // Fall back to config defaults
    const defaultModels = config.defaultModels?.[scenario];
    if (defaultModels && defaultModels.length > 0) {
      return defaultModels;
    }

    // Final fallback based on scenario
    switch (scenario) {
      case "development":
        return ["mock"];
      case "comparison":
        return ["flagship"];
      case "benchmark":
      default:
        return ["sonnet"];
    }
  }

  private static getDefaults(): CentralGaugeConfig {
    return {
      defaultModels: {
        benchmark: ["sonnet"],
        development: ["mock"],
        comparison: ["flagship"],
      },
      llm: {
        temperature: 0.1,
        maxTokens: 4000,
        timeout: 30000,
      },
      benchmark: {
        attempts: 2,
        outputDir: "results",
        templateDir: "templates",
      },
      container: {
        provider: "mock",
        name: "Cronus27",
        bcVersion: "24.0",
        memoryLimit: "8G",
        credentials: {
          username: "admin",
          password: "admin",
        },
      },
    };
  }

  private static async loadConfigFile(
    path: string,
  ): Promise<CentralGaugeConfig> {
    const content = await Deno.readTextFile(path);
    return parseYaml(content) as CentralGaugeConfig;
  }

  private static loadEnvironmentConfig(): CentralGaugeConfig {
    const config: CentralGaugeConfig = {};

    // Model defaults from environment
    const envBenchmarkModels = Deno.env.get("CENTRALGAUGE_BENCHMARK_MODELS");
    const envDevModels = Deno.env.get("CENTRALGAUGE_DEV_MODELS");
    const envComparisonModels = Deno.env.get("CENTRALGAUGE_COMPARISON_MODELS");

    if (envBenchmarkModels || envDevModels || envComparisonModels) {
      config.defaultModels = {};
      if (envBenchmarkModels) {
        config.defaultModels.benchmark = envBenchmarkModels.split(",").map(
          (s) => s.trim(),
        );
      }
      if (envDevModels) {
        config.defaultModels.development = envDevModels.split(",").map((s) =>
          s.trim()
        );
      }
      if (envComparisonModels) {
        config.defaultModels.comparison = envComparisonModels.split(",").map(
          (s) => s.trim(),
        );
      }
    }

    // LLM settings
    const temperature = Deno.env.get("CENTRALGAUGE_TEMPERATURE");
    const maxTokens = Deno.env.get("CENTRALGAUGE_MAX_TOKENS");

    if (temperature || maxTokens) {
      config.llm = {};
      if (temperature) config.llm.temperature = parseFloat(temperature);
      if (maxTokens) config.llm.maxTokens = parseInt(maxTokens);
    }

    // Benchmark settings
    const attempts = Deno.env.get("CENTRALGAUGE_ATTEMPTS");
    const outputDir = Deno.env.get("CENTRALGAUGE_OUTPUT_DIR");

    if (attempts || outputDir) {
      config.benchmark = {};
      if (attempts) config.benchmark.attempts = parseInt(attempts);
      if (outputDir) config.benchmark.outputDir = outputDir;
    }

    // Container settings
    const containerProvider = Deno.env.get("CENTRALGAUGE_CONTAINER_PROVIDER");
    const containerName = Deno.env.get("CENTRALGAUGE_CONTAINER_NAME");
    const containerUsername = Deno.env.get("CENTRALGAUGE_CONTAINER_USERNAME");
    const containerPassword = Deno.env.get("CENTRALGAUGE_CONTAINER_PASSWORD");

    if (
      containerProvider || containerName || containerUsername ||
      containerPassword
    ) {
      config.container = {};
      if (containerProvider) config.container.provider = containerProvider;
      if (containerName) config.container.name = containerName;
      if (containerUsername || containerPassword) {
        config.container.credentials = {};
        if (containerUsername) {
          config.container.credentials.username = containerUsername;
        }
        if (containerPassword) {
          config.container.credentials.password = containerPassword;
        }
      }
    }

    // Debug settings
    const debugEnabled = Deno.env.get("CENTRALGAUGE_DEBUG");
    const debugOutputDir = Deno.env.get("CENTRALGAUGE_DEBUG_OUTPUT_DIR");
    const debugLogLevel = Deno.env.get("CENTRALGAUGE_DEBUG_LOG_LEVEL");
    const debugIncludeRaw = Deno.env.get("CENTRALGAUGE_DEBUG_INCLUDE_RAW");
    const debugIncludeHeaders = Deno.env.get(
      "CENTRALGAUGE_DEBUG_INCLUDE_HEADERS",
    );
    const debugMaxFileSize = Deno.env.get("CENTRALGAUGE_DEBUG_MAX_FILE_SIZE");

    if (
      debugEnabled || debugOutputDir || debugLogLevel || debugIncludeRaw ||
      debugIncludeHeaders || debugMaxFileSize
    ) {
      config.debug = {};
      if (debugEnabled) {
        config.debug.enabled = debugEnabled.toLowerCase() === "true";
      }
      if (debugOutputDir) config.debug.outputDir = debugOutputDir;
      if (
        debugLogLevel &&
        ["basic", "detailed", "verbose"].includes(debugLogLevel)
      ) {
        config.debug.logLevel = debugLogLevel as
          | "basic"
          | "detailed"
          | "verbose";
      }
      if (debugIncludeRaw) {
        config.debug.includeRawResponse =
          debugIncludeRaw.toLowerCase() === "true";
      }
      if (debugIncludeHeaders) {
        config.debug.includeRequestHeaders =
          debugIncludeHeaders.toLowerCase() === "true";
      }
      if (debugMaxFileSize) {
        config.debug.maxFileSize = parseInt(debugMaxFileSize);
      }
    }

    return config;
  }

  private static mergeConfigs(
    base: CentralGaugeConfig,
    override: CentralGaugeConfig,
  ): CentralGaugeConfig {
    const result = { ...base };

    // Deep merge for nested objects
    if (override.defaultModels) {
      result.defaultModels = {
        ...result.defaultModels,
        ...override.defaultModels,
      };
    }
    if (override.llm) {
      result.llm = { ...result.llm, ...override.llm };
    }
    if (override.benchmark) {
      result.benchmark = { ...result.benchmark, ...override.benchmark };
    }
    if (override.container) {
      result.container = { ...result.container, ...override.container };
    }
    if (override.environment) {
      result.environment = { ...result.environment, ...override.environment };
    }
    if (override.prompts) {
      result.prompts = this.mergePromptConfigs(
        result.prompts,
        override.prompts,
      );
    }
    if (override.systemPrompts) {
      result.systemPrompts = {
        ...result.systemPrompts,
        ...override.systemPrompts,
      };
    }
    if (override.variantProfiles) {
      result.variantProfiles = {
        ...result.variantProfiles,
        ...override.variantProfiles,
      };
    }

    return result;
  }

  /**
   * Deep merge prompt injection configs
   */
  private static mergePromptConfigs(
    base: PromptInjectionConfig | undefined,
    override: PromptInjectionConfig,
  ): PromptInjectionConfig {
    if (!base) {
      return override;
    }

    const result: PromptInjectionConfig = {};

    // Handle enabled flag
    if (override.enabled !== undefined) {
      result.enabled = override.enabled;
    } else if (base.enabled !== undefined) {
      result.enabled = base.enabled;
    }

    // Deep merge injections
    if (base.injections || override.injections) {
      result.injections = {};

      // Get all provider keys
      const allProviders = new Set([
        ...Object.keys(base.injections || {}),
        ...Object.keys(override.injections || {}),
      ]);

      for (const provider of allProviders) {
        const baseProvider = base.injections?.[provider];
        const overrideProvider = override.injections?.[provider];

        if (overrideProvider && baseProvider) {
          // Merge stage injections - build object conditionally
          const merged: import("../prompts/mod.ts").StageInjections = {};

          const defaultVal = overrideProvider.default ?? baseProvider.default;
          if (defaultVal) merged.default = defaultVal;

          const generationVal = overrideProvider.generation ??
            baseProvider.generation;
          if (generationVal) merged.generation = generationVal;

          const fixVal = overrideProvider.fix ?? baseProvider.fix;
          if (fixVal) merged.fix = fixVal;

          result.injections[provider] = merged;
        } else {
          result.injections[provider] = overrideProvider ?? baseProvider;
        }
      }
    }

    return result;
  }

  /**
   * Generate a sample configuration file
   */
  static generateSampleConfig(): string {
    return `# CentralGauge Configuration File
# Place this file as .centralgauge.yml in your project root or home directory

# Default models for different scenarios
defaultModels:
  benchmark: [sonnet, gpt-4o]      # Models for production benchmarks
  development: [mock]              # Models for development/testing
  comparison: [flagship]           # Models for side-by-side comparison

# LLM provider settings
llm:
  temperature: 0.1                 # Lower = more deterministic
  maxTokens: 4000                  # Maximum response length
  timeout: 30000                   # Request timeout in milliseconds

# Benchmark execution settings
benchmark:
  attempts: 2                      # Number of attempts per task
  outputDir: results               # Directory for benchmark results
  templateDir: templates           # Directory for prompt templates

# Container settings
container:
  provider: bccontainer            # Container provider (mock, bccontainer, docker)
  name: Cronus27                   # Container name
  bcVersion: "24.0"               # Business Central version
  memoryLimit: 8G                  # Container memory limit
  credentials:
    username: sshadows             # Container authentication username
    password: "1234"               # Container authentication password

# Environment variable overrides (optional)
# These will be set during execution
# environment:
#   ANTHROPIC_API_KEY: sk-ant-...
#   OPENAI_API_KEY: sk-...

# Named system prompts for model variants
# Reference these in variant specs: sonnet@prompt=strict-al
# systemPrompts:
#   strict-al:
#     content: |
#       You are a strict AL code generator for Business Central.
#       Only output valid AL code without explanations.
#   creative:
#     content: |
#       Think creatively about solutions while ensuring code compiles.

# Named variant profiles for comparing same model with different configs
# Reference these in model specs: sonnet@profile=conservative
# variantProfiles:
#   conservative:
#     description: "Low temperature for deterministic output"
#     config:
#       temperature: 0.1
#       maxTokens: 4000
#   creative:
#     description: "Higher temperature for varied solutions"
#     config:
#       temperature: 0.8
#       maxTokens: 8000
#       systemPromptName: creative
#   deep-thinking:
#     description: "Extended reasoning for complex tasks"
#     config:
#       temperature: 0.2
#       thinkingBudget: 50000
`;
  }
}
