/**
 * Config action functions - shared between CLI and TUI
 * These are testable, pure-ish functions that return results instead of printing.
 */
import { exists } from "@std/fs";
import { join } from "@std/path";
import { ConfigManager } from "../../src/config/config.ts";
import { EnvLoader } from "../../src/utils/env-loader.ts";

/**
 * Result of an action operation
 */
export interface ActionResult {
  success: boolean;
  message: string;
  path: string;
}

/**
 * Options for initializing a config file
 */
export interface InitConfigOptions {
  /** Create in home directory instead of current directory */
  global?: boolean;
  /** Explicit target path (overrides global) */
  targetPath?: string;
}

/**
 * Options for creating an env template
 */
export interface CreateEnvOptions {
  /** Explicit target path */
  targetPath?: string;
  /** Overwrite existing file */
  overwrite?: boolean;
}

/**
 * Initialize a CentralGauge configuration file
 *
 * @param options - Configuration options
 * @returns Result with success status, message, and file path
 */
export async function initializeConfigFile(
  options?: InitConfigOptions,
): Promise<ActionResult> {
  const { global: useGlobal = false, targetPath } = options ?? {};

  // Determine the config file path
  let configPath: string;
  if (targetPath) {
    configPath = targetPath;
  } else if (useGlobal) {
    const homeDir = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE") ?? ".";
    configPath = join(homeDir, ".centralgauge.yml");
  } else {
    configPath = ".centralgauge.yml";
  }

  // Check if file already exists
  if (await exists(configPath)) {
    return {
      success: false,
      message: `Configuration file already exists: ${configPath}`,
      path: configPath,
    };
  }

  // Generate and write sample config
  const sampleConfig = ConfigManager.generateSampleConfig();
  await Deno.writeTextFile(configPath, sampleConfig);

  return {
    success: true,
    message: `Created configuration file: ${configPath}`,
    path: configPath,
  };
}

/**
 * Create a sample .env file template
 *
 * @param options - Creation options
 * @returns Result with success status, message, and file path
 */
export async function createEnvTemplate(
  options?: CreateEnvOptions,
): Promise<ActionResult> {
  const { targetPath, overwrite = false } = options ?? {};

  // Determine the env file path
  const envPath = targetPath ?? ".env";

  // Check if file already exists
  if (!overwrite && await exists(envPath)) {
    return {
      success: false,
      message:
        `.env file already exists: ${envPath}. Use overwrite option to replace.`,
      path: envPath,
    };
  }

  // Generate and write sample env file
  const sampleEnv = EnvLoader.generateSampleEnvFile();
  await Deno.writeTextFile(envPath, sampleEnv);

  return {
    success: true,
    message: `Created .env template: ${envPath}`,
    path: envPath,
  };
}
