#!/usr/bin/env -S deno run --allow-all

/**
 * CentralGauge CLI - Main entry point
 *
 * LLM benchmark for Microsoft Dynamics 365 Business Central AL code
 *
 * @module cli/centralgauge
 */

import { Command } from "@cliffy/command";
import { EnvLoader } from "../src/utils/env-loader.ts";
import { SplashScreen } from "../src/utils/splash-screen.ts";

// Command registration functions
import {
  registerAgentsCommand,
  registerBenchCommand,
  registerCompileTestCommands,
  registerConfigCommands,
  registerContainerCommands,
  registerModelsCommand,
  registerReportCommand,
  registerStatsCommands,
  registerVerifyCommand,
} from "./commands/mod.ts";

const VERSION = "0.1.0";

/**
 * Initialize environment and display startup screen
 */
async function initializeApp(quiet = false): Promise<void> {
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
  }
}

// Create the main CLI application
const cli = new Command()
  .name("centralgauge")
  .version(VERSION)
  .description(
    "LLM benchmark for Microsoft Dynamics 365 Business Central AL code",
  )
  .globalOption("-v, --verbose", "Enable verbose output")
  .globalOption("-q, --quiet", "Disable splash screen and minimize output")
  .example(
    "Basic benchmark with aliases",
    "centralgauge bench --llms sonnet,gpt-4o --tasks tasks/*.yml",
  )
  .example(
    "Group-based comparison",
    "centralgauge bench --llms flagship --attempts 2",
  )
  .example(
    "Mixed aliases and groups",
    "centralgauge bench --llms coding,budget --tasks tasks/easy/*.yml",
  )
  .example(
    "Traditional provider/model format",
    "centralgauge bench --llms openai/gpt-4o,anthropic/claude-3-5-sonnet-20241022",
  )
  .example(
    "Reasoning models comparison",
    "centralgauge bench --llms opus@reasoning=50000,gpt-5@reasoning=50000",
  )
  .example(
    "Generate HTML report",
    "centralgauge report results/ --html --output reports/",
  );

// Register all command modules
// deno-lint-ignore no-explicit-any
const cliAny = cli as any;
registerAgentsCommand(cliAny);
registerBenchCommand(cliAny);
registerReportCommand(cliAny);
registerVerifyCommand(cliAny);
registerContainerCommands(cliAny);
registerCompileTestCommands(cliAny);
registerModelsCommand(cliAny);
registerConfigCommands(cliAny);
registerStatsCommands(cliAny);

// Parse and execute
if (import.meta.main) {
  // Check for global quiet flag
  const isQuiet = Deno.args.includes("--quiet") || Deno.args.includes("-q");

  // Initialize app
  await initializeApp(isQuiet);

  // Parse CLI commands
  await cli.parse(Deno.args);
}
