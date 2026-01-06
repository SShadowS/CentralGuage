/**
 * Shortcomings data processing and HTML generation
 * @module cli/commands/report/shortcomings
 */

import type {
  ModelShortcomingEntry,
  ModelShortcomingsFile,
} from "../../../src/verify/types.ts";
import { extractModelName } from "../../helpers/mod.ts";
import { escapeHtml, sanitizeModelNameForUrl } from "./html-utils.ts";

/**
 * Load model shortcomings data from directory
 */
export async function loadShortcomingsData(
  shortcomingsDir: string,
): Promise<Map<string, ModelShortcomingsFile>> {
  const shortcomingsMap = new Map<string, ModelShortcomingsFile>();

  try {
    for await (const entry of Deno.readDir(shortcomingsDir)) {
      if (entry.isFile && entry.name.endsWith(".json")) {
        try {
          const content = await Deno.readTextFile(
            `${shortcomingsDir}/${entry.name}`,
          );
          const data = JSON.parse(content) as ModelShortcomingsFile;
          shortcomingsMap.set(data.model, data);
        } catch {
          // Skip invalid shortcomings files
        }
      }
    }
  } catch {
    // shortcomings directory may not exist - continue without shortcomings
  }

  return shortcomingsMap;
}

/**
 * Build a lookup map: taskId -> modelName -> shortcoming entry
 */
export function buildTaskShortcomingMap(
  shortcomingsMap: Map<string, ModelShortcomingsFile>,
): Map<string, Map<string, ModelShortcomingEntry>> {
  const taskShortcomingMap = new Map<
    string,
    Map<string, ModelShortcomingEntry>
  >();

  for (const [modelName, modelData] of shortcomingsMap) {
    for (const shortcoming of modelData.shortcomings) {
      for (const taskId of shortcoming.affectedTasks) {
        if (!taskShortcomingMap.has(taskId)) {
          taskShortcomingMap.set(taskId, new Map());
        }
        taskShortcomingMap.get(taskId)!.set(modelName, shortcoming);
      }
    }
  }

  return taskShortcomingMap;
}

/**
 * Generate shortcomings HTML section for a model card
 */
export function generateShortcomingsHtml(
  variantId: string,
  shortcomingsMap: Map<string, ModelShortcomingsFile>,
): string {
  const modelName = extractModelName(variantId);
  const modelShortcomings = shortcomingsMap.get(modelName);

  if (!modelShortcomings || modelShortcomings.shortcomings.length === 0) {
    return "";
  }

  const topShortcomings = [...modelShortcomings.shortcomings]
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, 5);

  const listItems = topShortcomings
    .map((s) => {
      // Use data-tooltip for CSS tooltip with FULL description
      const fullDesc = escapeHtml(s.description);
      return `<li class="shortcoming-item has-tooltip" data-tooltip="${fullDesc}">
              <span class="shortcoming-concept">${escapeHtml(s.concept)}</span>
              <span class="shortcoming-count">${s.occurrences}x</span>
            </li>`;
    })
    .join("");

  const totalCount = modelShortcomings.shortcomings.length;
  const moreCount = totalCount - 5;

  // Generate link to detail page
  const sanitizedName = sanitizeModelNameForUrl(modelName);
  const viewAllLink = totalCount > 0
    ? `<a href="model-${sanitizedName}.html" class="view-all-link">View all ${totalCount}</a>`
    : "";

  const moreIndicator = moreCount > 0
    ? `<div class="shortcomings-more">+${moreCount} more ${viewAllLink}</div>`
    : totalCount > 0
    ? `<div class="shortcomings-more">${viewAllLink}</div>`
    : "";

  return `
          <div class="shortcomings-section">
            <h4>Known Shortcomings (${totalCount})</h4>
            <ul class="shortcomings-list">${listItems}</ul>
            ${moreIndicator}
          </div>`;
}
