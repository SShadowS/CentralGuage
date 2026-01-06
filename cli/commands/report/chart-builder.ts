/**
 * Chart HTML generation for benchmark reports
 * @module cli/commands/report/chart-builder
 */

import type { PerModelStats } from "../../types/cli-types.ts";
import { shortVariantName } from "../../../src/utils/formatters.ts";

/**
 * Chart data for a single model
 */
export interface ChartDataEntry {
  variantId: string;
  shortName: string;
  firstPassRate: number;
  secondPassRate: number;
  totalPassRate: number;
}

/**
 * Build chart data from sorted models with pass rate information
 */
export function buildChartData(
  sortedModels: [string, PerModelStats][],
  tempLookup: Map<string, number | undefined>,
): ChartDataEntry[] {
  return sortedModels.map(([variantId, m]) => {
    const total = m.tasksPassed + m.tasksFailed;
    const firstPassRate = total > 0 ? m.passedOnAttempt1 / total : 0;
    const secondPassOnly = m.passedOnAttempt2 - m.passedOnAttempt1;
    const secondPassRate = total > 0 ? secondPassOnly / total : 0;
    const totalPassRate = total > 0 ? m.tasksPassed / total : 0;

    // Build short name with config suffixes
    let shortName = shortVariantName(variantId);
    const suffixes: string[] = [];

    // Add reasoning effort for OpenAI models (high, med, low)
    // Check both reasoningEffort (converted) and string thinkingBudget (raw JSON)
    const reasoningEffort = m.variantConfig?.reasoningEffort ??
      (typeof m.variantConfig?.thinkingBudget === "string"
        ? m.variantConfig.thinkingBudget
        : undefined);
    if (reasoningEffort && !shortName.includes(reasoningEffort)) {
      const short = reasoningEffort.length > 4
        ? reasoningEffort.slice(0, 3)
        : reasoningEffort;
      suffixes.push(short);
    }

    // Add temperature if available
    const temp = tempLookup.get(variantId);
    if (temp !== undefined) {
      const tempStr = Number.isInteger(temp)
        ? String(temp)
        : temp.toFixed(1).replace(/\.0$/, "");
      suffixes.push(`t${tempStr}`);
    }

    // Append suffixes to name
    if (suffixes.length > 0) {
      if (shortName.includes("(") && shortName.endsWith(")")) {
        shortName = shortName.slice(0, -1) + `, ${suffixes.join(", ")})`;
      } else {
        shortName = `${shortName} (${suffixes.join(", ")})`;
      }
    }

    return {
      variantId,
      shortName,
      firstPassRate,
      secondPassRate,
      totalPassRate,
    };
  });
}

/**
 * Generate horizontal bar chart HTML from chart data
 */
export function generateChartHtml(chartData: ChartDataEntry[]): string {
  const hBarHtml = chartData
    .map((d) => {
      const firstPct = (d.firstPassRate * 100).toFixed(0);
      const secondPct = (d.secondPassRate * 100).toFixed(0);
      const firstLabel = d.firstPassRate > 0.08 ? `${firstPct}%` : "";
      const secondLabel = d.secondPassRate > 0.08 ? `${secondPct}%` : "";
      return `<div class="bar-row">
                <div class="bar-label" title="${d.variantId}">${d.shortName}</div>
                <div class="bar-container">
                  <div class="bar-fill bar-first" style="width: ${
        d.firstPassRate * 100
      }%;"><span class="bar-pct">${firstLabel}</span></div>
                  <div class="bar-fill bar-second" style="width: ${
        d.secondPassRate * 100
      }%;"><span class="bar-pct">${secondLabel}</span></div>
                </div>
                <div class="bar-value">${
        (d.totalPassRate * 100).toFixed(1)
      }%</div>
              </div>`;
    })
    .join("");

  const legendHtml = `<div class="chart-legend">
          <span class="legend-item"><span class="legend-dot bar-first"></span> 1st Pass</span>
          <span class="legend-item"><span class="legend-dot bar-second"></span> 2nd Pass</span>
        </div>`;

  return `
        <div class="chart-card h-bar-chart">
          ${legendHtml}
          ${hBarHtml}
        </div>`;
}
