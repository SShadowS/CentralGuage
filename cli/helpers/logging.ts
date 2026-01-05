/**
 * CLI logging helpers with colored output
 *
 * This module provides CLI-specific logging with colored output and model tracking.
 * It bridges to the unified Logger for level filtering while maintaining
 * specialized CLI formatting.
 *
 * @module cli/helpers/logging
 */

import * as colors from "@std/fmt/colors";
import { Logger } from "../../src/logger/mod.ts";

// Create a CLI-specific logger
const cliLogger = Logger.create("cli");

// =============================================================================
// Color-coded output helpers
// =============================================================================

/** Color palette for different models (cycles through these) */
const MODEL_COLORS = [
  colors.magenta,
  colors.yellow,
  colors.cyan,
  colors.blue,
  colors.green,
  colors.red,
];

/** Track model-to-color assignments */
const modelColorMap = new Map<string, (str: string) => string>();
let colorIndex = 0;

/** Get consistent color for a model */
export function getModelColor(model: string): (str: string) => string {
  if (!modelColorMap.has(model)) {
    const colorFn = MODEL_COLORS[colorIndex % MODEL_COLORS.length];
    if (colorFn) {
      modelColorMap.set(model, colorFn);
    }
    colorIndex++;
  }
  return modelColorMap.get(model) || colors.white;
}

/** Reset model color assignments (useful for testing) */
export function resetModelColors(): void {
  modelColorMap.clear();
  colorIndex = 0;
}

/**
 * Check if a log level is enabled.
 * Used to skip expensive formatting when output would be filtered.
 */
function isInfoEnabled(): boolean {
  return Logger.isEnabled("info");
}

function isWarnEnabled(): boolean {
  return Logger.isEnabled("warn");
}

/**
 * Output prefixes with colors.
 *
 * These methods maintain the existing CLI output format while routing
 * through the Logger for level filtering. All methods use the "info" level
 * except for fail (error) and warn (warn).
 */
export const log = {
  // Channels
  container: (msg: string) => {
    if (!isInfoEnabled()) return;
    console.log(colors.cyan(`[Container] ${msg}`));
  },
  task: (msg: string) => {
    if (!isInfoEnabled()) return;
    console.log(colors.blue(`[Task] ${msg}`));
  },
  llm: (model: string, msg: string) => {
    if (!isInfoEnabled()) return;
    const colorFn = getModelColor(model);
    console.log(colorFn(`[${model}] ${msg}`));
  },
  compile: (model: string, msg: string) => {
    if (!isInfoEnabled()) return;
    const colorFn = getModelColor(model);
    console.log(colorFn(`  [Compile] ${msg}`));
  },
  test: (model: string, msg: string) => {
    if (!isInfoEnabled()) return;
    const colorFn = getModelColor(model);
    console.log(colorFn(`  [Test] ${msg}`));
  },

  // Status
  success: (msg: string) => {
    if (!isInfoEnabled()) return;
    console.log(colors.green(`[OK] ${msg}`));
  },
  fail: (msg: string) => {
    // Always show failures (error level)
    console.log(colors.red(`[FAIL] ${msg}`));
  },
  warn: (msg: string) => {
    if (!isWarnEnabled()) return;
    console.log(colors.yellow(`[WARN] ${msg}`));
  },
  info: (msg: string) => {
    if (!isInfoEnabled()) return;
    console.log(colors.gray(msg));
  },

  // Progress
  progress: (msg: string) => {
    if (!isInfoEnabled()) return;
    console.log(colors.gray(`[Progress] ${msg}`));
  },
  summary: (msg: string) => {
    if (!isInfoEnabled()) return;
    console.log(colors.bold(msg));
  },

  // Generic with prefix
  prefix: (
    prefix: string,
    msg: string,
    color: (s: string) => string = colors.white,
  ) => {
    if (!isInfoEnabled()) return;
    console.log(color(`[${prefix}] ${msg}`));
  },

  // Debug (only shown at debug level)
  debug: (msg: string) => {
    cliLogger.debug(msg);
  },
};

/** Format result status */
export function statusText(success: boolean): string {
  return success ? colors.green("OK") : colors.red("FAIL");
}
