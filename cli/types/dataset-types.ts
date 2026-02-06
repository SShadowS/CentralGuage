/**
 * Report dataset type definitions
 * @module cli/types/dataset-types
 */

/**
 * A saved report dataset configuration
 */
export interface ReportDataset {
  /** Dataset name (used as filename without extension) */
  name: string;
  /** Optional description of the dataset */
  description?: string;
  /** ISO 8601 timestamp when dataset was created */
  created: string;
  /** ISO 8601 timestamp when dataset was last updated */
  updated: string;
  /** Paths to result files, relative to the results directory */
  files: string[];
}

/**
 * Result of loading a dataset with file availability info
 */
export interface DatasetLoadResult {
  /** The loaded dataset configuration */
  dataset: ReportDataset;
  /** Files listed in dataset but not found on disk */
  missingFiles: string[];
  /** Full absolute paths to existing files */
  availableFiles: string[];
}
