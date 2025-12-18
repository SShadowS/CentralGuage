/**
 * Configuration and environment commands
 * @module cli/commands/config
 */

import { Command } from "@cliffy/command";
import { exists } from "@std/fs";
import { ConfigManager } from "../../src/config/config.ts";
import { EnvLoader } from "../../src/utils/env-loader.ts";
import { SplashScreen } from "../../src/utils/splash-screen.ts";

export function registerConfigCommands(cli: Command): void {
  // Config command with subcommands
  const configCmd = new Command()
    .description("Manage configuration");

  configCmd.command("init", "Generate sample configuration file")
    .option("--global", "Create in home directory instead of current directory")
    .action(async (options) => {
      const configPath = options.global
        ? `${
          Deno.env.get("HOME") || Deno.env.get("USERPROFILE")
        }/.centralgauge.yml`
        : ".centralgauge.yml";

      if (await exists(configPath)) {
        console.log(`[WARN] Configuration file already exists: ${configPath}`);
        console.log("Remove it first if you want to regenerate.");
        return;
      }

      const sampleConfig = ConfigManager.generateSampleConfig();
      await Deno.writeTextFile(configPath, sampleConfig);
      console.log(`[OK] Created configuration file: ${configPath}`);
      console.log("Edit this file to customize your default settings.");
    });

  configCmd.command("view", "Show current configuration")
    .action(async () => {
      const config = await ConfigManager.loadConfig();
      console.log("Current Configuration:\n");
      console.log(JSON.stringify(config, null, 2));
    });

  cli.command("config", configCmd);

  // Environment command with subcommands
  const envCmd = new Command()
    .description("Environment and configuration management");

  envCmd.command("show", "Show current environment status")
    .option("--detailed", "Show detailed environment information")
    .action(async (options) => {
      await EnvLoader.loadEnvironment();
      EnvLoader.displayEnvironmentStatus(options.detailed);
    });

  envCmd.command("create", "Generate sample .env file")
    .option("--overwrite", "Overwrite existing .env file")
    .action(async (options) => {
      if (await exists(".env") && !options.overwrite) {
        console.log(
          "[WARN] .env file already exists. Use --overwrite to replace it.",
        );
        return;
      }

      const sampleEnv = EnvLoader.generateSampleEnvFile();
      await Deno.writeTextFile(".env", sampleEnv);
      console.log("[OK] Created .env file with sample configuration");
      console.log("Edit this file and add your API keys to get started.");
    });

  cli.command("env", envCmd);

  // Health check command
  cli.command("health", "Check system health and configuration")
    .action(async () => {
      await EnvLoader.loadEnvironment();
      const isHealthy = await SplashScreen.displayHealthCheck();
      if (!isHealthy) {
        Deno.exit(1);
      }
    });
}
