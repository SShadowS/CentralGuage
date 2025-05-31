/**
 * Environment variable loading and management for CentralGauge
 * Supports .env files, validation, and environment detection
 */

import { load } from "@std/dotenv";
import { exists } from "@std/fs";
import { brightBlue, brightGreen, brightYellow, gray, red } from "@std/fmt/colors";

export interface EnvConfig {
  // API Keys
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  GOOGLE_API_KEY?: string;
  AZURE_OPENAI_API_KEY?: string;
  AZURE_OPENAI_ENDPOINT?: string;
  OLLAMA_HOST?: string;
  LOCAL_LLM_ENDPOINT?: string;

  // CentralGauge Configuration
  CENTRALGAUGE_BENCHMARK_MODELS?: string;
  CENTRALGAUGE_DEV_MODELS?: string;
  CENTRALGAUGE_COMPARISON_MODELS?: string;
  CENTRALGAUGE_TEMPERATURE?: string;
  CENTRALGAUGE_MAX_TOKENS?: string;
  CENTRALGAUGE_ATTEMPTS?: string;
  CENTRALGAUGE_OUTPUT_DIR?: string;
  CENTRALGAUGE_LOG_LEVEL?: string;

  // Development Settings
  NODE_ENV?: string;
  DEBUG?: string;
  DENO_ENV?: string;
}

export interface EnvLoadResult {
  loaded: boolean;
  source: ".env" | "system" | "none";
  envVarsFound: string[];
  apiKeysFound: string[];
  configVarsFound: string[];
  errors: string[];
}

export class EnvLoader {
  private static envConfig: EnvConfig = {};
  private static loadResult: EnvLoadResult | null = null;

  /**
   * Load environment variables from .env file and system environment
   */
  static async loadEnvironment(): Promise<EnvLoadResult> {
    if (this.loadResult) {
      return this.loadResult;
    }

    const result: EnvLoadResult = {
      loaded: false,
      source: "none",
      envVarsFound: [],
      apiKeysFound: [],
      configVarsFound: [],
      errors: [],
    };

    try {
      // Check for .env file
      const envFiles = [".env", ".env.local", ".env.development"];
      let envFileFound = false;
      let loadedFromFile: Record<string, string> = {};

      for (const envFile of envFiles) {
        if (await exists(envFile)) {
          try {
            const fileVars = await load({ envPath: envFile, export: false });
            loadedFromFile = { ...loadedFromFile, ...fileVars };
            envFileFound = true;
            result.source = ".env";
            console.log(gray(`📁 Loaded environment from ${envFile}`));
          } catch (error) {
            result.errors.push(`Failed to load ${envFile}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }

      // Load from system environment if no .env file
      if (!envFileFound) {
        result.source = "system";
      }

      // Get all environment variables (file + system)
      const allEnvVars = envFileFound ? { ...loadedFromFile } : {};
      
      // Add system environment variables
      for (const [key, value] of Object.entries(Deno.env.toObject())) {
        if (!allEnvVars[key]) {
          allEnvVars[key] = value;
        }
      }

      // Categorize found variables
      const apiKeyPrefixes = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_API_KEY", "AZURE_OPENAI"];
      const configPrefixes = ["CENTRALGAUGE_", "OLLAMA_HOST", "LOCAL_LLM_ENDPOINT"];

      for (const [key, value] of Object.entries(allEnvVars)) {
        if (value) {
          result.envVarsFound.push(key);

          if (apiKeyPrefixes.some(prefix => key.startsWith(prefix))) {
            result.apiKeysFound.push(key);
          } else if (configPrefixes.some(prefix => key.startsWith(prefix))) {
            result.configVarsFound.push(key);
          }
        }
      }

      // Store configuration
      this.envConfig = allEnvVars as EnvConfig;
      result.loaded = true;

    } catch (error) {
      result.errors.push(`Environment loading failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    this.loadResult = result;
    return result;
  }

  /**
   * Get environment variable with optional fallback
   */
  static get<T extends string | number>(key: keyof EnvConfig, fallback?: T): T | string | undefined {
    const value = this.envConfig[key];
    if (value === undefined) {
      return fallback;
    }
    return value as T;
  }

  /**
   * Get all loaded environment variables
   */
  static getAll(): EnvConfig {
    return { ...this.envConfig };
  }

  /**
   * Check if an API key is available
   */
  static hasApiKey(provider: "openai" | "anthropic" | "google" | "azure"): boolean {
    switch (provider) {
      case "openai":
        return !!this.envConfig.OPENAI_API_KEY;
      case "anthropic":
        return !!this.envConfig.ANTHROPIC_API_KEY;
      case "google":
        return !!this.envConfig.GOOGLE_API_KEY;
      case "azure":
        return !!(this.envConfig.AZURE_OPENAI_API_KEY && this.envConfig.AZURE_OPENAI_ENDPOINT);
      default:
        return false;
    }
  }

  /**
   * Get available LLM providers based on API keys
   */
  static getAvailableProviders(): string[] {
    const providers: string[] = ["mock", "local"]; // Always available

    if (this.hasApiKey("openai")) providers.push("openai");
    if (this.hasApiKey("anthropic")) providers.push("anthropic");
    if (this.hasApiKey("google")) providers.push("gemini");
    if (this.hasApiKey("azure")) providers.push("azure-openai");

    return providers;
  }

  /**
   * Validate environment configuration
   */
  static validateEnvironment(): { valid: boolean; warnings: string[]; errors: string[] } {
    const warnings: string[] = [];
    const errors: string[] = [];

    // Check for at least one API key
    const hasAnyApiKey = this.getAvailableProviders().some(p => !["mock", "local"].includes(p));
    if (!hasAnyApiKey) {
      warnings.push("No API keys found - only mock and local providers available");
    }

    // Validate Azure configuration if partially set
    const hasAzureKey = !!this.envConfig.AZURE_OPENAI_API_KEY;
    const hasAzureEndpoint = !!this.envConfig.AZURE_OPENAI_ENDPOINT;
    if (hasAzureKey && !hasAzureEndpoint) {
      errors.push("AZURE_OPENAI_ENDPOINT required when AZURE_OPENAI_API_KEY is set");
    }
    if (hasAzureEndpoint && !hasAzureKey) {
      errors.push("AZURE_OPENAI_API_KEY required when AZURE_OPENAI_ENDPOINT is set");
    }

    // Validate numeric configuration values
    const numericConfigs = [
      ["CENTRALGAUGE_TEMPERATURE", "0-2"],
      ["CENTRALGAUGE_MAX_TOKENS", "positive integer"],
      ["CENTRALGAUGE_ATTEMPTS", "positive integer"],
    ];

    for (const [key, description] of numericConfigs) {
      const value = this.envConfig[key as keyof EnvConfig];
      if (value) {
        const num = Number(value);
        if (isNaN(num)) {
          errors.push(`${key} must be a valid number (${description}), got: ${value}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      warnings,
      errors,
    };
  }

  /**
   * Display environment status in a formatted way
   */
  static displayEnvironmentStatus(showDetails = true): void {
    if (!this.loadResult) {
      console.log(red("❌ Environment not loaded"));
      return;
    }

    const result = this.loadResult;
    
    // Header
    console.log(`${brightBlue("🌍 Environment Status")}`);
    console.log(`   Source: ${result.source === ".env" ? brightGreen(".env file") : brightYellow("system")}`);
    
    if (showDetails) {
      // API Keys
      if (result.apiKeysFound.length > 0) {
        console.log(`   ${brightGreen("🔑 API Keys:")} ${result.apiKeysFound.map(key => 
          key.replace(/_API_KEY$/, "").toLowerCase()
        ).join(", ")}`);
      } else {
        console.log(`   ${brightYellow("🔑 API Keys:")} none (mock/local only)`);
      }

      // Configuration Variables
      if (result.configVarsFound.length > 0) {
        console.log(`   ${brightGreen("⚙️  Config:")} ${result.configVarsFound.length} variables`);
        for (const key of result.configVarsFound) {
          const value = this.envConfig[key as keyof EnvConfig];
          if (value) {
            console.log(`      ${gray(key)}: ${value}`);
          }
        }
      }

      // Available Providers
      const providers = this.getAvailableProviders();
      console.log(`   ${brightGreen("🔌 Providers:")} ${providers.join(", ")}`);

      // Validation
      const validation = this.validateEnvironment();
      if (validation.warnings.length > 0) {
        console.log(`   ${brightYellow("⚠️  Warnings:")}`);
        for (const warning of validation.warnings) {
          console.log(`      ${brightYellow("•")} ${warning}`);
        }
      }
      if (validation.errors.length > 0) {
        console.log(`   ${red("❌ Errors:")}`);
        for (const error of validation.errors) {
          console.log(`      ${red("•")} ${error}`);
        }
      }
    }

    console.log(); // Empty line
  }

  /**
   * Create a sample .env file
   */
  static generateSampleEnvFile(): string {
    return `# CentralGauge Environment Configuration
# Copy this file to .env and fill in your API keys

# ============================================
# LLM Provider API Keys
# ============================================

# OpenAI Configuration
OPENAI_API_KEY=sk-...

# Anthropic Configuration  
ANTHROPIC_API_KEY=sk-ant-...

# Google Gemini Configuration
GOOGLE_API_KEY=AIza...

# Azure OpenAI Configuration
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/

# Local LLM Configuration
OLLAMA_HOST=http://localhost:11434
LOCAL_LLM_ENDPOINT=http://localhost:8080

# ============================================
# CentralGauge Configuration
# ============================================

# Default models for different scenarios
CENTRALGAUGE_BENCHMARK_MODELS=sonnet,gpt-4o
CENTRALGAUGE_DEV_MODELS=mock
CENTRALGAUGE_COMPARISON_MODELS=flagship

# LLM Settings
CENTRALGAUGE_TEMPERATURE=0.1
CENTRALGAUGE_MAX_TOKENS=4000
CENTRALGAUGE_ATTEMPTS=2

# Output Configuration
CENTRALGAUGE_OUTPUT_DIR=results
CENTRALGAUGE_LOG_LEVEL=info

# ============================================
# Development Settings
# ============================================

# Environment mode
DENO_ENV=development
DEBUG=centralgauge:*
`;
  }
}