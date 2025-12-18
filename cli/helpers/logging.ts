/**
 * CLI logging helpers with colored output
 * @module cli/helpers/logging
 */

import * as colors from "@std/fmt/colors";

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

/** Output prefixes with colors */
export const log = {
  // Channels
  container: (msg: string) => console.log(colors.cyan(`[Container] ${msg}`)),
  task: (msg: string) => console.log(colors.blue(`[Task] ${msg}`)),
  llm: (model: string, msg: string) => {
    const colorFn = getModelColor(model);
    console.log(colorFn(`[${model}] ${msg}`));
  },
  compile: (model: string, msg: string) => {
    const colorFn = getModelColor(model);
    console.log(colorFn(`  [Compile] ${msg}`));
  },
  test: (model: string, msg: string) => {
    const colorFn = getModelColor(model);
    console.log(colorFn(`  [Test] ${msg}`));
  },

  // Status
  success: (msg: string) => console.log(colors.green(`[OK] ${msg}`)),
  fail: (msg: string) => console.log(colors.red(`[FAIL] ${msg}`)),
  warn: (msg: string) => console.log(colors.yellow(`[WARN] ${msg}`)),
  info: (msg: string) => console.log(colors.gray(msg)),

  // Progress
  progress: (msg: string) => console.log(colors.gray(`[Progress] ${msg}`)),
  summary: (msg: string) => console.log(colors.bold(msg)),

  // Generic with prefix
  prefix: (
    prefix: string,
    msg: string,
    color: (s: string) => string = colors.white,
  ) => console.log(color(`[${prefix}] ${msg}`)),
};

/** Format result status */
export function statusText(success: boolean): string {
  return success ? colors.green("OK") : colors.red("FAIL");
}
