/**
 * Rules generation module
 * @module src/rules
 */

export type { RulesGeneratorOptions } from "./generator.ts";
export {
  generateRulesMarkdown,
  getDefaultOutputPath,
  isActionableShortcoming,
  loadShortcomingsFile,
} from "./generator.ts";
