/**
 * File loading and selection utilities for report generation
 * @module cli/commands/report/file-loader
 */

import { Checkbox } from "@cliffy/prompt";
import type { BenchmarkResult, FileOption } from "../../types/cli-types.ts";
import {
  type AgentResultEntry,
  normalizeAgentResult,
} from "../../helpers/result-normalizer.ts";

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
