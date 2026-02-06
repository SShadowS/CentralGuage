/**
 * Dataset CRUD operations for report generation
 * @module cli/commands/report/dataset
 */

import { exists } from "@std/fs";
import { join, relative } from "@std/path";
import { parse as parseYaml, stringify as stringifyYaml } from "@std/yaml";
import * as colors from "@std/fmt/colors";
import { Confirm, Input } from "@cliffy/prompt";
import type {
  DatasetLoadResult,
  ReportDataset,
} from "../../types/dataset-types.ts";

const DATASETS_DIR = "datasets";

/**
 * Get the path to a dataset file
 */
export function getDatasetPath(resultsDir: string, name: string): string {
  return join(resultsDir, DATASETS_DIR, `${name}.yml`);
}

/**
 * Get the datasets directory path
 */
export function getDatasetsDir(resultsDir: string): string {
  return join(resultsDir, DATASETS_DIR);
}

/**
 * Ensure the datasets directory exists
 */
async function ensureDatasetsDir(resultsDir: string): Promise<void> {
  const datasetsDir = getDatasetsDir(resultsDir);
  await Deno.mkdir(datasetsDir, { recursive: true });
}

/**
 * Convert absolute file paths to paths relative to the results directory
 */
export function toRelativePaths(
  resultsDir: string,
  absolutePaths: string[],
): string[] {
  return absolutePaths.map((absPath) => {
    // Normalize path separators for cross-platform compatibility
    const relPath = relative(resultsDir, absPath);
    // Convert backslashes to forward slashes for consistent storage
    return relPath.replace(/\\/g, "/");
  });
}

/**
 * Convert relative paths to absolute paths
 */
export function toAbsolutePaths(
  resultsDir: string,
  relativePaths: string[],
): string[] {
  return relativePaths.map((relPath) => join(resultsDir, relPath));
}

/**
 * Save a new dataset
 */
export async function saveDataset(
  resultsDir: string,
  name: string,
  files: string[],
  description?: string,
): Promise<void> {
  await ensureDatasetsDir(resultsDir);

  const now = new Date().toISOString();
  const dataset: ReportDataset = {
    name,
    ...(description && { description }),
    created: now,
    updated: now,
    files: toRelativePaths(resultsDir, files),
  };

  const yamlContent = stringifyYaml(
    dataset as unknown as Record<string, unknown>,
  );
  const datasetPath = getDatasetPath(resultsDir, name);
  await Deno.writeTextFile(datasetPath, yamlContent);
}

/**
 * Load a dataset and check file availability
 */
export async function loadDataset(
  resultsDir: string,
  name: string,
): Promise<DatasetLoadResult> {
  const datasetPath = getDatasetPath(resultsDir, name);

  if (!await exists(datasetPath)) {
    throw new Error(`Dataset '${name}' not found at ${datasetPath}`);
  }

  const content = await Deno.readTextFile(datasetPath);
  const dataset = parseYaml(content) as ReportDataset;

  const missingFiles: string[] = [];
  const availableFiles: string[] = [];

  for (const relPath of dataset.files) {
    const absPath = join(resultsDir, relPath);
    if (await exists(absPath)) {
      availableFiles.push(absPath);
    } else {
      missingFiles.push(relPath);
    }
  }

  return { dataset, missingFiles, availableFiles };
}

/**
 * Update an existing dataset with additional files
 */
export async function updateDataset(
  resultsDir: string,
  name: string,
  newFiles: string[],
): Promise<ReportDataset> {
  const { dataset } = await loadDataset(resultsDir, name);

  // Convert new files to relative paths
  const newRelativePaths = toRelativePaths(resultsDir, newFiles);

  // Merge files (avoid duplicates)
  const existingSet = new Set(dataset.files);
  for (const path of newRelativePaths) {
    existingSet.add(path);
  }

  const updatedDataset: ReportDataset = {
    ...dataset,
    updated: new Date().toISOString(),
    files: Array.from(existingSet),
  };

  const yamlContent = stringifyYaml(
    updatedDataset as unknown as Record<string, unknown>,
  );
  const datasetPath = getDatasetPath(resultsDir, name);
  await Deno.writeTextFile(datasetPath, yamlContent);

  return updatedDataset;
}

/**
 * List all datasets in a results directory
 */
export async function listDatasets(
  resultsDir: string,
): Promise<ReportDataset[]> {
  const datasetsDir = getDatasetsDir(resultsDir);

  if (!await exists(datasetsDir)) {
    return [];
  }

  const datasets: ReportDataset[] = [];

  for await (const entry of Deno.readDir(datasetsDir)) {
    if (entry.isFile && entry.name.endsWith(".yml")) {
      try {
        const content = await Deno.readTextFile(join(datasetsDir, entry.name));
        const dataset = parseYaml(content) as ReportDataset;
        datasets.push(dataset);
      } catch {
        // Skip invalid dataset files
      }
    }
  }

  // Sort by updated date descending
  datasets.sort((a, b) =>
    new Date(b.updated).getTime() - new Date(a.updated).getTime()
  );

  return datasets;
}

/**
 * Check if a dataset exists
 */
export async function datasetExists(
  resultsDir: string,
  name: string,
): Promise<boolean> {
  return await exists(getDatasetPath(resultsDir, name));
}

/**
 * Print datasets list to console
 */
export async function printDatasetsList(resultsDir: string): Promise<void> {
  const datasets = await listDatasets(resultsDir);

  if (datasets.length === 0) {
    console.log(`No datasets found in ${getDatasetsDir(resultsDir)}`);
    return;
  }

  console.log(`\nDatasets in ${getDatasetsDir(resultsDir)}:\n`);

  for (const dataset of datasets) {
    const updated = new Date(dataset.updated).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    const fileCount = dataset.files.length;
    const desc = dataset.description ? ` - ${dataset.description}` : "";

    console.log(
      `  ${colors.cyan(dataset.name.padEnd(20))} ${
        colors.dim(`${fileCount} file${fileCount !== 1 ? "s" : ""}`.padEnd(12))
      } Updated: ${colors.dim(updated)}${desc}`,
    );
  }
  console.log();
}

/**
 * Show dataset summary and prompt for confirmation
 * Returns available file paths if confirmed, null if cancelled
 */
export async function confirmDatasetUsage(
  resultsDir: string,
  name: string,
): Promise<string[] | null> {
  const loadResult = await loadDataset(resultsDir, name);
  const { dataset, missingFiles, availableFiles } = loadResult;

  console.log(
    `\nDataset: ${colors.cyan(dataset.name)} (${availableFiles.length} files)`,
  );

  for (const relPath of dataset.files) {
    const isMissing = missingFiles.includes(relPath);
    if (isMissing) {
      console.log(`  ${colors.red("[MISSING]")} ${relPath}`);
    } else {
      console.log(`  - ${relPath}`);
    }
  }

  if (missingFiles.length > 0) {
    console.log(
      colors.yellow(
        `\n[WARN] ${missingFiles.length} file(s) not found, will be skipped`,
      ),
    );
  }

  if (availableFiles.length === 0) {
    console.error(colors.red("\n[ERROR] All files in dataset are missing"));
    return null;
  }

  const confirmed = await Confirm.prompt({
    message: "Generate report from this dataset?",
    default: true,
  });

  return confirmed ? availableFiles : null;
}

/**
 * Handle dataset name collision - prompt for overwrite or new name
 * Returns the final name to use, or null if cancelled
 */
export async function handleDatasetCollision(
  resultsDir: string,
  name: string,
): Promise<string | null> {
  if (!await datasetExists(resultsDir, name)) {
    return name;
  }

  console.log(colors.yellow(`\nDataset '${name}' already exists.`));

  const overwrite = await Confirm.prompt({
    message: "Overwrite existing dataset?",
    default: false,
  });

  if (overwrite) {
    return name;
  }

  const newName = await Input.prompt({
    message: "Enter a new dataset name (or empty to cancel):",
    validate: (input) => {
      if (input === "") return true;
      if (!/^[\w-]+$/.test(input)) {
        return "Name can only contain letters, numbers, hyphens, and underscores";
      }
      return true;
    },
  });

  if (newName === "") {
    return null;
  }

  // Recursively check the new name
  return handleDatasetCollision(resultsDir, newName);
}
