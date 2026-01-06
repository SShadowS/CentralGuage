/**
 * Task results matrix generation for benchmark reports
 * @module cli/commands/report/matrix-builder
 */

import type { BenchmarkResult } from "../../types/cli-types.ts";
import type { ModelShortcomingEntry } from "../../../src/verify/types.ts";
import { shortVariantName } from "../../../src/utils/formatters.ts";
import { extractModelName } from "../../helpers/mod.ts";
import { escapeHtml } from "./html-utils.ts";

/**
 * Build a result matrix: taskId -> variantId -> result
 */
export function buildResultMatrix(
  results: BenchmarkResult[],
): Map<string, Map<string, BenchmarkResult>> {
  const resultMatrix = new Map<string, Map<string, BenchmarkResult>>();

  for (const result of results) {
    const variantId = result.context?.variantId ||
      result.context?.llmModel || "unknown";

    if (!resultMatrix.has(result.taskId)) {
      resultMatrix.set(result.taskId, new Map());
    }
    resultMatrix.get(result.taskId)!.set(variantId, result);
  }

  return resultMatrix;
}

/**
 * Build task descriptions lookup map
 */
export function buildTaskDescriptions(
  results: BenchmarkResult[],
): Map<string, string> {
  const taskDescriptions = new Map<string, string>();

  for (const result of results) {
    if (!taskDescriptions.has(result.taskId)) {
      const desc = result.context?.manifest?.description || "";
      taskDescriptions.set(result.taskId, desc);
    }
  }

  return taskDescriptions;
}

/**
 * Get sorted list of model IDs from results or perModel stats
 */
export function getModelList(
  results: BenchmarkResult[],
  perModel?: Record<string, unknown>,
): string[] {
  if (perModel) {
    return Object.entries(perModel)
      .sort(([, a], [, b]) => {
        const aStats = a as { tasksPassed: number; tasksFailed: number };
        const bStats = b as { tasksPassed: number; tasksFailed: number };
        const aRate = aStats.tasksPassed /
          (aStats.tasksPassed + aStats.tasksFailed);
        const bRate = bStats.tasksPassed /
          (bStats.tasksPassed + bStats.tasksFailed);
        return bRate - aRate;
      })
      .map(([id]) => id);
  }

  return [
    ...new Set(results.map((r) => r.context?.variantId || "unknown")),
  ];
}

/**
 * Generate matrix header HTML with model names
 */
export function generateMatrixHeaderHtml(modelList: string[]): string {
  return modelList
    .map((m) => `<th title="${m}">${shortVariantName(m)}</th>`)
    .join("");
}

/**
 * Generate matrix rows HTML with task results
 */
export function generateMatrixRowsHtml(
  taskIds: string[],
  modelList: string[],
  resultMatrix: Map<string, Map<string, BenchmarkResult>>,
  taskDescriptions: Map<string, string>,
  taskShortcomingMap: Map<string, Map<string, ModelShortcomingEntry>>,
): string {
  let matrixRowsHtml = "";

  for (const taskId of taskIds) {
    const taskResults = resultMatrix.get(taskId);
    let cellsHtml = "";

    for (const modelId of modelList) {
      const result = taskResults?.get(modelId);

      if (result) {
        const cls = result.success ? "pass" : "fail";
        const symbol = result.success ? "P" : "F";
        let title = `${
          result.success ? "Pass" : "Fail"
        } - Score: ${result.finalScore}%`;

        if (!result.success) {
          const modelName = extractModelName(modelId);
          const taskShortcomings = taskShortcomingMap.get(taskId);
          const shortcoming = taskShortcomings?.get(modelName);
          if (shortcoming) {
            const truncatedDesc = shortcoming.description.length > 150
              ? shortcoming.description.substring(0, 150) + "..."
              : shortcoming.description;
            title += `&#10;&#10;Shortcoming: ${shortcoming.concept}&#10;${
              escapeHtml(truncatedDesc)
            }`;
          }
        }

        cellsHtml +=
          `<td class="matrix-cell ${cls}" title="${title}">${symbol}</td>`;
      } else {
        cellsHtml += `<td class="matrix-cell">-</td>`;
      }
    }

    const description = taskDescriptions.get(taskId) || "";
    const firstLine = (description.split(/\r?\n/)[0] || "").trim();
    const tooltipText = escapeHtml(description).replace(/\r?\n/g, "&#10;");
    const titleAttr = description ? ` title="${tooltipText}"` : "";

    matrixRowsHtml +=
      `<tr><td class="task-id">${taskId}</td><td class="task-desc"${titleAttr}>${
        escapeHtml(firstLine)
      }</td>${cellsHtml}</tr>`;
  }

  return matrixRowsHtml;
}
