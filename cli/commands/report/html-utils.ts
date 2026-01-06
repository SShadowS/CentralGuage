/**
 * HTML utility functions for report generation
 * @module cli/commands/report/html-utils
 */

/**
 * Escape HTML special characters for safe display
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Sanitize model name for use in URLs and filenames
 */
export function sanitizeModelNameForUrl(modelName: string): string {
  return modelName
    .replace(/\//g, "-")
    .replace(/[^a-zA-Z0-9-_.]/g, "_")
    .toLowerCase();
}

/**
 * Format a score (0-100) as a percentage string
 */
export function formatScore(score: number): string {
  return score.toFixed(1) + "%";
}

/**
 * Format a rate (0-1) as a percentage string
 */
export function formatRate(rate: number): string {
  return (rate * 100).toFixed(1) + "%";
}

/**
 * Format a cost as currency string
 */
export function formatCost(cost: number): string {
  return "$" + cost.toFixed(2);
}
