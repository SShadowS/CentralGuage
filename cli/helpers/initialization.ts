/**
 * CLI initialization helpers
 * @module cli/helpers/initialization
 */

import { EnvLoader } from "../../src/utils/env-loader.ts";
import { SplashScreen } from "../../src/utils/splash-screen.ts";
import { type DebugConfig, DebugLogger } from "../../src/utils/debug-logger.ts";
import { log } from "./logging.ts";

/** Valid debug log levels */
export type DebugLogLevel = "basic" | "detailed" | "verbose";

/**
 * Options for debug logging initialization
 */
export interface DebugOptions {
  debug?: boolean;
  debugLogLevel?: DebugLogLevel;
  debugOutputDir?: string;
}

/**
 * Initialize benchmark environment with splash screen and debug logging.
 * Extracts common initialization logic from runParallelBenchmark and runBenchmark.
 *
 * @param options - Debug options from CLI
 * @param quiet - Whether to suppress splash screen
 * @returns DebugLogger instance if debug is enabled, null otherwise
 */
export async function initializeBenchmarkEnvironment(
  options: DebugOptions,
  quiet: boolean,
): Promise<DebugLogger | null> {
  if (!quiet) {
    await EnvLoader.loadEnvironment();
    await SplashScreen.display({
      showEnvironment: true,
      showConfiguration: true,
      showProviders: true,
      compact: false,
    });
  }

  // Initialize debug logging if enabled (--debug or --debug-level implies debug mode)
  if (options.debug || options.debugLogLevel) {
    const sessionId = `session-${Date.now()}`;
    const logLevel: DebugLogLevel = options.debugLogLevel || "basic";
    const debugConfig: DebugConfig = {
      enabled: true,
      outputDir: options.debugOutputDir || "debug",
      sessionId,
      logLevel,
      includeRawResponse: logLevel === "verbose",
      includeRequestHeaders: logLevel !== "basic",
      maxFileSize: 100, // 100MB
    };

    const debugLogger = DebugLogger.initialize(debugConfig);
    log.info(
      `[DEBUG] Debug logging enabled: ${debugConfig.outputDir} (level: ${logLevel})`,
    );
    return debugLogger;
  }

  return null;
}

/**
 * Initialize the application on startup.
 * Loads environment variables and displays splash screen if appropriate.
 *
 * @param quiet - Whether to suppress output
 */
export async function initializeApp(quiet = false): Promise<void> {
  // Load environment variables first
  await EnvLoader.loadEnvironment();

  // Show startup screen if not quiet and no arguments
  if (!quiet && Deno.args.length === 0) {
    await SplashScreen.display({
      showEnvironment: true,
      showConfiguration: true,
      showProviders: true,
      compact: false,
    });
    SplashScreen.displayStartupTips();
    return;
  }
}

/**
 * Finalize debug logging, ensuring logs are flushed even on error.
 *
 * @param debugLogger - The debug logger instance (may be null)
 */
export async function finalizeDebugLogging(
  debugLogger: DebugLogger | null,
): Promise<void> {
  if (debugLogger) {
    await debugLogger.finalize();
  }
}
