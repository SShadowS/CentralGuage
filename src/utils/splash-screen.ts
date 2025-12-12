/**
 * Splash screen and startup display for CentralGauge
 */

import { brightBlue, brightGreen, brightYellow, gray, bold, cyan } from "@std/fmt/colors";
import { EnvLoader } from "./env-loader.ts";
import { ConfigManager } from "../config/config.ts";
import { LLMAdapterRegistry } from "../llm/registry.ts";
import { ContainerProviderRegistry } from "../container/registry.ts";

const VERSION = "0.1.0";

export interface SplashOptions {
  showEnvironment?: boolean;
  showConfiguration?: boolean;
  showProviders?: boolean;
  compact?: boolean;
}

export class SplashScreen {
  /**
   * Display the main splash screen with system information
   */
  static async display(options: SplashOptions = {}): Promise<void> {
    const {
      showEnvironment = true,
      showConfiguration = true,
      showProviders = true,
      compact = false,
    } = options;

    // ASCII Art Header
    if (!compact) {
      console.log(brightBlue(bold(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   ╔══╗╔═══╗╔═╗ ╔╗╔════╗╔═══╗╔═══╗╔╗   ╔══╗╔═══╗╔╗ ╔╗╔══╗╔═══╗ ║
║   ║  ╚╣╔═╗║║ ╚╗║║║╔══╗║║╔═╗║║╔═╗║║║   ║╔═╝║╔═╗║║║ ║║║╔═╝║╔══╗║ ║
║   ║   ║╚═╝║║  ╚╝║║╚══╝║║╚═╝║║╚═╝║║║   ║║╔═╣╚═╝║║║ ║║║║╔═╣╚══╝║ ║
║   ║   ║╔══╝║  ╔╗║║╔══╗║║╔══╝║╔═╗║║║   ║║╚╗║╔═╗║║║ ║║║║╚╗║╔══╗║ ║
║   ║  ╔╣║   ║ ╔╝║║║╚══╝║║║   ║║ ║║║╚══╗║╚═╝║║ ║║║╚═╝║║╚═╝║╚══╝║ ║
║   ╚══╝╚╝   ╚═╝ ╚╝╚════╝╚╝   ╚╝ ╚╝╚═══╝╚═══╝╚╝ ╚╝╚═══╝╚═══╝╚═══╝ ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝`)));
    } else {
      console.log(brightBlue(bold("CentralGauge")));
    }

    // Version and Description
    console.log(cyan(`   LLM Benchmark for Microsoft Dynamics 365 Business Central AL`));
    console.log(gray(`   Version ${VERSION} • MIT License • https://github.com/your-org/centralgauge`));
    console.log();

    // Environment Status
    if (showEnvironment) {
      EnvLoader.displayEnvironmentStatus(!compact);
    }

    // Configuration Status
    if (showConfiguration) {
      await this.displayConfigurationStatus(compact);
    }

    // Provider Status
    if (showProviders) {
      this.displayProviderStatus(compact);
    }

    if (!compact) {
      console.log(gray("   Ready for benchmark execution! Use --help for available commands."));
      console.log();
    }
  }

  /**
   * Display configuration status
   */
  private static async displayConfigurationStatus(compact: boolean): Promise<void> {
    try {
      const config = await ConfigManager.loadConfig();
      
      console.log(`${brightBlue("⚙️  Configuration")}`);
      
      if (compact) {
        console.log(`   Models: ${config.defaultModels?.benchmark?.join(", ") || "default"}`);
      } else {
        console.log(`   ${brightGreen("Default Models:")}`);
        console.log(`      Benchmark: ${config.defaultModels?.benchmark?.join(", ") || "sonnet"}`);
        console.log(`      Development: ${config.defaultModels?.development?.join(", ") || "mock"}`);
        console.log(`      Comparison: ${config.defaultModels?.comparison?.join(", ") || "flagship"}`);
        
        console.log(`   ${brightGreen("LLM Settings:")}`);
        console.log(`      Temperature: ${config.llm?.temperature || 0.1}`);
        console.log(`      Max Tokens: ${config.llm?.maxTokens || 4000}`);
        console.log(`      Timeout: ${config.llm?.timeout || 30000}ms`);
        
        console.log(`   ${brightGreen("Benchmark Settings:")}`);
        console.log(`      Attempts: ${config.benchmark?.attempts || 2}`);
        console.log(`      Output: ${config.benchmark?.outputDir || "results/"}`);
        console.log(`      Templates: ${config.benchmark?.templateDir || "templates/"}`);
      }
      console.log();
    } catch (error) {
      console.log(`   ${brightYellow("⚠️  Configuration:")} ${error instanceof Error ? error.message : String(error)}`);
      console.log();
    }
  }

  /**
   * Display provider status
   */
  private static displayProviderStatus(compact: boolean): void {
    console.log(`${brightBlue("🔌 Providers")}`);
    
    // LLM Providers
    const llmProviders = LLMAdapterRegistry.list();
    const availableProviders = EnvLoader.getAvailableProviders();
    
    if (compact) {
      console.log(`   LLM: ${availableProviders.length}/${llmProviders.length} available`);
    } else {
      console.log(`   ${brightGreen("LLM Adapters:")} ${llmProviders.length} registered`);
      for (const provider of llmProviders) {
        const isAvailable = availableProviders.includes(provider);
        const status = isAvailable ? brightGreen("✓") : gray("○");
        const models = LLMAdapterRegistry.getSupportedModels(provider);
        const modelCount = models.length;
        
        if (isAvailable) {
          console.log(`      ${status} ${provider} (${modelCount} models)`);
        } else {
          const reason = provider === "mock" || provider === "local" ? "always available" : "no API key";
          console.log(`      ${status} ${gray(provider)} (${reason})`);
        }
      }
    }

    // Container Providers
    const containerProviders = ContainerProviderRegistry.list();
    
    if (compact) {
      console.log(`   Container: ${containerProviders.length} available`);
    } else {
      console.log(`   ${brightGreen("Container Providers:")} ${containerProviders.length} registered`);
      for (const provider of containerProviders) {
        const isReal = provider !== "mock";
        const status = isReal ? brightGreen("✓") : brightYellow("○");
        const note = provider === "bccontainer" ? "(Windows + bccontainerhelper)" :
                    provider === "docker" ? "(Docker required)" :
                    provider === "mock" ? "(testing only)" : "";
        console.log(`      ${status} ${provider} ${gray(note)}`);
      }
    }
    
    console.log();
  }

  /**
   * Display a minimal startup message
   */
  static displayMinimal(): void {
    console.log(`${cyan("CentralGauge")} ${gray(`v${VERSION}`)} ${brightGreen("ready")}`);
  }

  /**
   * Display system health check
   */
  static async displayHealthCheck(): Promise<boolean> {
    console.log(`${brightBlue("🏥 System Health Check")}`);
    
    let allHealthy = true;
    
    // Environment Health
    const envResult = await EnvLoader.loadEnvironment();
    const envValidation = EnvLoader.validateEnvironment();
    
    if (envValidation.valid && envResult.loaded) {
      console.log(`   ${brightGreen("✓")} Environment: Loaded and valid`);
    } else {
      console.log(`   ${brightYellow("⚠")} Environment: ${envValidation.errors.join(", ")}`);
      allHealthy = false;
    }
    
    // LLM Provider Health
    const availableProviders = EnvLoader.getAvailableProviders();
    if (availableProviders.length > 0) {
      console.log(`   ${brightGreen("✓")} LLM Providers: ${availableProviders.length} available`);
    } else {
      console.log(`   ${brightYellow("⚠")} LLM Providers: None available`);
      allHealthy = false;
    }
    
    // Configuration Health
    try {
      await ConfigManager.loadConfig();
      console.log(`   ${brightGreen("✓")} Configuration: Valid`);
    } catch (error) {
      console.log(`   ${brightYellow("⚠")} Configuration: ${error instanceof Error ? error.message : String(error)}`);
      allHealthy = false;
    }
    
    console.log();
    
    if (allHealthy) {
      console.log(`${brightGreen("✅ All systems healthy - ready for benchmark execution!")}`);
    } else {
      console.log(`${brightYellow("⚠️  System has warnings - check configuration and API keys")}`);
    }
    
    console.log();
    return allHealthy;
  }

  /**
   * Display startup tips based on current configuration
   */
  static displayStartupTips(): void {
    const availableProviders = EnvLoader.getAvailableProviders();
    const hasRealProviders = availableProviders.some(p => !["mock", "local"].includes(p));
    
    console.log(`${brightBlue("💡 Quick Start Tips")}`);
    
    if (!hasRealProviders) {
      console.log(`   ${brightYellow("•")} Add API keys to .env file for real LLM testing`);
      console.log(`   ${gray("     Run:")} centralgauge config init ${gray("to create sample .env")}`);
    }
    
    console.log(`   ${brightGreen("•")} List models: ${gray("centralgauge models")}`);
    console.log(`   ${brightGreen("•")} Quick test: ${gray("centralgauge bench --llms mock --tasks tasks/sample-task.yml")}`);
    
    if (hasRealProviders) {
      console.log(`   ${brightGreen("•")} Real benchmark: ${gray("centralgauge bench --llms flagship --tasks tasks/easy/*.yml")}`);
    }
    
    console.log(`   ${brightGreen("•")} Generate report: ${gray("centralgauge report results/ --html")}`);
    console.log();
  }
}