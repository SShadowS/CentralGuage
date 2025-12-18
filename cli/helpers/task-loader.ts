/**
 * CLI task loading helpers
 * @module cli/helpers/task-loader
 */

import { expandGlob } from "@std/fs";
import { loadTaskManifest } from "../../src/tasks/loader.ts";
import type { TaskManifest } from "../../src/tasks/interfaces.ts";
import { log } from "./logging.ts";

/**
 * Load task manifests from glob patterns.
 * Creates the output directory if it doesn't exist.
 *
 * @param patterns - Glob patterns for task YAML files
 * @param outputDir - Output directory to create
 * @param verbose - Whether to log each loaded task
 * @returns Array of loaded task manifests
 */
export async function loadTaskManifests(
  patterns: string[],
  outputDir: string,
  verbose = true,
): Promise<TaskManifest[]> {
  // Ensure output directory exists
  await Deno.mkdir(outputDir, { recursive: true });

  const manifests: TaskManifest[] = [];

  for (const taskPattern of patterns) {
    for await (const entry of expandGlob(taskPattern)) {
      if (entry.isFile && entry.name.endsWith(".yml")) {
        if (verbose) {
          log.task(`Loading: ${entry.path}`);
        }
        const manifest = await loadTaskManifest(entry.path);
        manifests.push(manifest);
      }
    }
  }

  if (manifests.length === 0) {
    log.fail(
      `No task manifests found matching patterns: ${patterns.join(", ")}`,
    );
  } else if (verbose) {
    log.task(`Loaded ${manifests.length} task(s)`);
  }

  return manifests;
}

/**
 * Find all JSON files in a directory recursively.
 *
 * @param directory - Directory to search
 * @returns Array of file paths
 */
export async function findJsonFiles(directory: string): Promise<string[]> {
  const jsonFiles: string[] = [];

  for await (const entry of expandGlob(`${directory}/**/*.json`)) {
    if (entry.isFile && entry.name.endsWith(".json")) {
      jsonFiles.push(entry.path);
    }
  }

  return jsonFiles;
}
