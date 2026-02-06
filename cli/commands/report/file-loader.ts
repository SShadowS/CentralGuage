/**
 * File loading and selection utilities for report generation
 * @module cli/commands/report/file-loader
 */

import { Checkbox } from "@cliffy/prompt";
import type {
  BenchmarkResult,
  FileOption,
  ResultFileData,
} from "../../types/cli-types.ts";
import {
  type AgentResultEntry,
  normalizeAgentResult,
} from "../../helpers/result-normalizer.ts";
import { toRelativePaths } from "./dataset.ts";

/**
 * Metadata about a result file
 */
export interface FileMetadata {
  type: string;
  count: number;
  models: string[];
}

/**
 * Get metadata about a result file for display in picker
 */
export async function getFileMetadata(filePath: string): Promise<FileMetadata> {
  try {
    const content = await Deno.readTextFile(filePath);
    const data = JSON.parse(content);
    const fileName = filePath.split(/[\\/]/).pop() || "";
    const isAgent = fileName.startsWith("agent-benchmark");

    if (isAgent) {
      const results = data.results as AgentResultEntry[] | undefined;
      if (Array.isArray(results)) {
        const agents = [...new Set(results.map((r) => r.agentId))];
        return { type: "Agent", count: results.length, models: agents };
      }
    } else {
      const results = Array.isArray(data) ? data : data.results;
      if (Array.isArray(results)) {
        const models = [
          ...new Set(
            results.map(
              (r: { context?: { variantId?: string } }) =>
                r.context?.variantId || "unknown",
            ),
          ),
        ];
        return {
          type: "LLM",
          count: results.length,
          models: models as string[],
        };
      }
    }
  } catch {
    // Ignore parse errors
  }
  return { type: "Unknown", count: 0, models: [] };
}

/**
 * Build file options from a list of JSON file paths
 */
export async function buildFileOptions(
  jsonFiles: string[],
): Promise<FileOption[]> {
  const fileOptions: FileOption[] = [];
  for (const filePath of jsonFiles) {
    const stat = await Deno.stat(filePath);
    const name = filePath.split(/[\\/]/).pop() || filePath;
    fileOptions.push({
      path: filePath,
      name,
      date: stat.mtime || new Date(),
      size: stat.size,
    });
  }
  // Sort by date descending (most recent first)
  fileOptions.sort((a, b) => b.date.getTime() - a.date.getTime());
  return fileOptions;
}

/**
 * Prompt user to select result files via interactive checkbox
 */
export async function selectResultFiles(
  fileOptions: FileOption[],
): Promise<string[]> {
  const firstFile = fileOptions[0];
  if (fileOptions.length === 1 && firstFile) {
    console.log(`Using: ${firstFile.name}`);
    return [firstFile.path];
  }

  // Build choices with metadata
  const choices = await Promise.all(
    fileOptions.map(async (f) => {
      const meta = await getFileMetadata(f.path);
      const modelList = meta.models.slice(0, 2).join(", ");
      const moreModels = meta.models.length > 2
        ? ` +${meta.models.length - 2}`
        : "";
      return {
        name:
          `${f.name} (${meta.type}: ${modelList}${moreModels}, ${meta.count} results)`,
        value: f.path,
        checked: false, // Default none selected
      };
    }),
  );

  const selectedFiles = await Checkbox.prompt({
    message: "Select result files to include (space to toggle):",
    options: choices,
    minOptions: 1,
    hint: "Use arrow keys, space to toggle, enter to confirm",
  });

  if (selectedFiles.length === 0) {
    throw new Error("No files selected");
  }

  console.log(`Using ${selectedFiles.length} file(s)`);
  return selectedFiles;
}

/**
 * Load and merge results from selected JSON files
 */
export async function loadResultFiles(
  selectedFiles: string[],
): Promise<BenchmarkResult[]> {
  const allResults: BenchmarkResult[] = [];

  for (const jsonFile of selectedFiles) {
    try {
      const content = await Deno.readTextFile(jsonFile);
      const data = JSON.parse(content);
      const fileName = jsonFile.split(/[\\/]/).pop() || "";

      // Check if this is an agent benchmark result file
      if (fileName.startsWith("agent-benchmark")) {
        // Agent result format: { results: [{ agentId, taskId, result: {...} }] }
        const agentResults = data.results as AgentResultEntry[] | undefined;
        if (Array.isArray(agentResults)) {
          const normalized = agentResults.map(normalizeAgentResult);
          allResults.push(...normalized);
          console.log(
            `  Loaded ${normalized.length} agent result(s) from ${fileName}`,
          );
        }
      } else {
        // LLM result format: array or { results: [...] }
        const results = Array.isArray(data) ? data : data.results;
        if (Array.isArray(results)) {
          allResults.push(...results);
          console.log(
            `  Loaded ${results.length} LLM result(s) from ${fileName}`,
          );
        }
      }
    } catch (error) {
      console.warn(
        `[WARN] Failed to parse ${jsonFile}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return allResults;
}

/**
 * Load results from selected JSON files, preserving file boundaries and metadata.
 * Returns one ResultFileData per file with optional taskSetHash from hashInfo.
 */
export async function loadResultFilesGrouped(
  selectedFiles: string[],
): Promise<ResultFileData[]> {
  const fileDataList: ResultFileData[] = [];

  for (const jsonFile of selectedFiles) {
    try {
      const content = await Deno.readTextFile(jsonFile);
      const data = JSON.parse(content);
      const fileName = jsonFile.split(/[\\/]/).pop() || "";

      let results: BenchmarkResult[] = [];
      let taskSetHash: string | undefined;

      if (fileName.startsWith("agent-benchmark")) {
        const agentResults = data.results as AgentResultEntry[] | undefined;
        if (Array.isArray(agentResults)) {
          results = agentResults.map(normalizeAgentResult);
        }
      } else {
        const rawResults = Array.isArray(data) ? data : data.results;
        if (Array.isArray(rawResults)) {
          results = rawResults;
        }
        // Extract taskSetHash from hashInfo if present
        if (data.hashInfo?.taskSetHash) {
          taskSetHash = data.hashInfo.taskSetHash;
        }
      }

      if (results.length > 0) {
        fileDataList.push({ filePath: jsonFile, taskSetHash, results });
        console.log(
          `  Loaded ${results.length} result(s) from ${fileName}${
            taskSetHash ? ` [hash: ${taskSetHash.slice(0, 8)}]` : ""
          }`,
        );
      }
    } catch (error) {
      console.warn(
        `[WARN] Failed to parse ${jsonFile}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return fileDataList;
}

/**
 * Filter out files that are already in a dataset
 * Returns file options for files NOT already in the dataset
 */
export function filterExistingDatasetFiles(
  fileOptions: FileOption[],
  existingFiles: string[],
  resultsDir: string,
): FileOption[] {
  // Convert existing paths to relative form for comparison
  const existingRelative = new Set(existingFiles);

  return fileOptions.filter((option) => {
    // Convert option path to relative for comparison
    const relativePaths = toRelativePaths(resultsDir, [option.path]);
    const relativePath = relativePaths[0];
    return !relativePath || !existingRelative.has(relativePath);
  });
}

/**
 * Get filenames from absolute paths for display
 */
export function getFilenames(absolutePaths: string[]): string[] {
  return absolutePaths.map((p) => p.split(/[\\/]/).pop() || p);
}
