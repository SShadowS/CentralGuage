/**
 * TUI Command - Launch the Text User Interface
 * @module cli/commands/tui-command
 */

import { Command } from "@cliffy/command";
import { EnvLoader } from "../../src/utils/env-loader.ts";
import { startTui } from "../tui/mod.ts";

/**
 * Register the TUI command
 */
export function registerTuiCommand(cli: Command): void {
  cli.command(
    "tui",
    new Command()
      .description("Launch the interactive Text User Interface")
      .example("Launch TUI", "centralgauge tui")
      .action(async () => {
        // Load environment variables before starting TUI
        // This ensures spawned subprocesses inherit the correct env
        await EnvLoader.loadEnvironment();
        await startTui();
      }),
  );
}
