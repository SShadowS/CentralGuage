/**
 * Rules generation module
 * @module src/rules
 */

export type {
  OptimizedRulesOptions,
  RulesGeneratorOptions,
} from "./generator.ts";
export {
  generateOptimizedRules,
  generateRulesMarkdown,
  getDefaultOutputPath,
  isActionableShortcoming,
  loadShortcomingsFile,
} from "./generator.ts";
