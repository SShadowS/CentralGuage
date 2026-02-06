/**
 * Report generation module exports
 * @module cli/commands/report
 */

// Types
export type { HtmlTemplateParams, ModelDetailPageParams } from "./templates.ts";
export type { FileMetadata } from "./file-loader.ts";
export type {
  DatasetLoadResult,
  ReportDataset,
} from "../../types/dataset-types.ts";
export type { ChartDataEntry } from "./chart-builder.ts";

// HTML utilities
export {
  escapeHtml,
  formatCost,
  formatRate,
  formatScore,
  sanitizeModelNameForUrl,
} from "./html-utils.ts";

// File loading
export {
  buildFileOptions,
  filterExistingDatasetFiles,
  getFileMetadata,
  getFilenames,
  loadResultFiles,
  selectResultFiles,
} from "./file-loader.ts";

// Dataset management
export {
  confirmDatasetUsage,
  datasetExists,
  getDatasetPath,
  getDatasetsDir,
  handleDatasetCollision,
  listDatasets,
  loadDataset,
  printDatasetsList,
  saveDataset,
  toAbsolutePaths,
  toRelativePaths,
  updateDataset,
} from "./dataset.ts";

// Shortcomings processing
export {
  buildTaskShortcomingMap,
  generateShortcomingsHtml,
  loadShortcomingsData,
} from "./shortcomings.ts";

// Statistics calculation
export {
  buildTemperatureLookup,
  calculateBenchmarkStats,
  calculatePerModelStats,
  sortModelsByPassRate,
} from "./stats-calculator.ts";

// Chart generation
export { buildChartData, generateChartHtml } from "./chart-builder.ts";

// Matrix generation
export {
  buildResultMatrix,
  buildTaskDescriptions,
  generateMatrixHeaderHtml,
  generateMatrixRowsHtml,
  getModelList,
} from "./matrix-builder.ts";

// Model cards generation
export {
  generateFallbackModelCardsHtml,
  generateModelCardsHtml,
} from "./model-cards.ts";

// HTML templates
export { generateHtmlTemplate, generateModelDetailPage } from "./templates.ts";
