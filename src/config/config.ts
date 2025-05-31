/**
 * Configuration management for CentralGauge
 * Supports config files, environment variables, and CLI overrides
 */

import { exists } from "@std/fs";
import { parse as parseYaml } from "@std/yaml";
import { ModelPresetRegistry } from "../llm/model-presets.ts";

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
    bcVersion?: string;
    memoryLimit?: string;
  };
  
  // Environment overrides
  environment?: Record<string, string>;
}

export class ConfigManager {
  private static config: CentralGaugeConfig = {};
  private static configLoaded = false;
  
  /**
   * Load configuration from various sources in priority order:
   * 1. CLI arguments (highest priority)
   * 2. Environment variables
   * 3. .centralgauge.yml in current directory
   * 4. .centralgauge.yml in home directory
   * 5. Built-in defaults (lowest priority)
   */
  static async loadConfig(cliOverrides?: Partial<CentralGaugeConfig>): Promise<CentralGaugeConfig> {
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
    const keys = path.split('.');
    
    let value: any = config;
    for (const key of keys) {
      value = value?.[key];
      if (value === undefined) {
        return fallback;
      }
    }
    
    return value;
  }
  
  /**
   * Resolve model specifications using config defaults
   */
  static async resolveModels(spec?: string[], scenario: 'benchmark' | 'development' | 'comparison' = 'benchmark'): Promise<string[]> {
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
      case 'development':
        return ['mock'];
      case 'comparison':
        return ['flagship'];
      case 'benchmark':
      default:
        return ['sonnet'];
    }
  }
  
  private static getDefaults(): CentralGaugeConfig {
    return {
      defaultModels: {
        benchmark: ['sonnet'],
        development: ['mock'],
        comparison: ['flagship']
      },
      llm: {
        temperature: 0.1,
        maxTokens: 4000,
        timeout: 30000
      },
      benchmark: {
        attempts: 2,
        outputDir: 'results',
        templateDir: 'templates'
      },
      container: {
        provider: 'mock',
        bcVersion: '24.0',
        memoryLimit: '8G'
      }
    };
  }
  
  private static async loadConfigFile(path: string): Promise<CentralGaugeConfig> {
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
        config.defaultModels.benchmark = envBenchmarkModels.split(',').map(s => s.trim());
      }
      if (envDevModels) {
        config.defaultModels.development = envDevModels.split(',').map(s => s.trim());
      }
      if (envComparisonModels) {
        config.defaultModels.comparison = envComparisonModels.split(',').map(s => s.trim());
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
    
    return config;
  }
  
  private static mergeConfigs(base: CentralGaugeConfig, override: CentralGaugeConfig): CentralGaugeConfig {
    const result = { ...base };
    
    // Deep merge for nested objects
    if (override.defaultModels) {
      result.defaultModels = { ...result.defaultModels, ...override.defaultModels };
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
  provider: mock                   # Container provider (mock, bc-container)
  bcVersion: "24.0"               # Business Central version
  memoryLimit: 8G                  # Container memory limit

# Environment variable overrides (optional)
# These will be set during execution
# environment:
#   ANTHROPIC_API_KEY: sk-ant-...
#   OPENAI_API_KEY: sk-...
`;
  }
}