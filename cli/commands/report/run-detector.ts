/**
 * Multi-run detection, validation, and grouping for pass@k reporting
 * @module cli/commands/report/run-detector
 */

import type { BenchmarkResult, ResultFileData } from "../../types/cli-types.ts";

/** Result of multi-run detection */
export interface MultiRunDetection {
  isMultiRun: boolean;
  runCount: number;
}

/** Result of comparability validation */
export interface ComparabilityResult {
  valid: boolean;
  taskSetHash: string | null;
  warnings: string[];
}

/**
 * Detect whether the loaded files represent multiple runs of the same benchmark.
 * Multi-run is detected when the same (variantId, taskId) pair appears across multiple files.
 */
export function detectMultiRun(files: ResultFileData[]): MultiRunDetection {
  if (files.length <= 1) {
    return { isMultiRun: false, runCount: files.length };
  }

  // Build a map of (variantId, taskId) -> set of file indices
  const pairToFiles = new Map<string, Set<number>>();

  for (let fileIdx = 0; fileIdx < files.length; fileIdx++) {
    const file = files[fileIdx]!;
    for (const result of file.results) {
      const variantId = result.context?.variantId ||
        result.context?.llmModel || "unknown";
      const key = `${variantId}::${result.taskId}`;

      if (!pairToFiles.has(key)) {
        pairToFiles.set(key, new Set());
      }
      pairToFiles.get(key)!.add(fileIdx);
    }
  }

  // If any (model, task) pair appears in multiple files, it's multi-run
  let maxFiles = 0;
  for (const fileSet of pairToFiles.values()) {
    maxFiles = Math.max(maxFiles, fileSet.size);
  }

  return {
    isMultiRun: maxFiles > 1,
    runCount: maxFiles,
  };
}

/**
 * Validate that multiple result files are comparable (same task set).
 * Compares taskSetHash across all files.
 */
export function validateComparability(
  files: ResultFileData[],
): ComparabilityResult {
  const warnings: string[] = [];
  const hashes = new Set<string>();
  let filesWithHash = 0;
  let filesWithoutHash = 0;

  for (const file of files) {
    if (file.taskSetHash) {
      hashes.add(file.taskSetHash);
      filesWithHash++;
    } else {
      filesWithoutHash++;
    }
  }

  if (filesWithoutHash > 0) {
    warnings.push(
      `${filesWithoutHash} file(s) missing taskSetHash (older format). Treating as separate runs.`,
    );
  }

  if (hashes.size > 1) {
    return {
      valid: false,
      taskSetHash: null,
      warnings: [
        ...warnings,
        `Files have ${hashes.size} different task set hashes. Results may not be comparable.`,
      ],
    };
  }

  const taskSetHash = hashes.size === 1 ? [...hashes][0] ?? null : null;

  return { valid: true, taskSetHash, warnings };
}

/**
 * Group results by model (variantId) and task, preserving all runs per (model, task) pair.
 * Returns Map<variantId, Map<taskId, BenchmarkResult[]>> where the array contains
 * one result per run.
 */
export function groupResultsByModelAndTask(
  files: ResultFileData[],
): Map<string, Map<string, BenchmarkResult[]>> {
  const grouped = new Map<string, Map<string, BenchmarkResult[]>>();

  for (const file of files) {
    for (const result of file.results) {
      const variantId = result.context?.variantId ||
        result.context?.llmModel || "unknown";

      if (!grouped.has(variantId)) {
        grouped.set(variantId, new Map());
      }
      const modelMap = grouped.get(variantId)!;

      if (!modelMap.has(result.taskId)) {
        modelMap.set(result.taskId, []);
      }
      modelMap.get(result.taskId)!.push(result);
    }
  }

  return grouped;
}
