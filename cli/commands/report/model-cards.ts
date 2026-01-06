/**
 * Model card HTML generation for benchmark reports
 * @module cli/commands/report/model-cards
 */

import type { BenchmarkResult, PerModelStats } from "../../types/cli-types.ts";
import type { ModelShortcomingsFile } from "../../../src/verify/types.ts";
import { formatCost, formatRate, formatScore } from "./html-utils.ts";
import { generateShortcomingsHtml } from "./shortcomings.ts";

/**
 * Generate model cards HTML from perModel stats
 */
export function generateModelCardsHtml(
  sortedModels: [string, PerModelStats][],
  tempLookup: Map<string, number | undefined>,
  shortcomingsMap: Map<string, ModelShortcomingsFile>,
): string {
  let modelCardsHtml = "";

  for (const [variantId, m] of sortedModels) {
    const mTotal = m.tasksPassed + m.tasksFailed;
    const passRate = mTotal > 0 ? m.tasksPassed / mTotal : 0;
    const firstPassRate = mTotal > 0 ? m.passedOnAttempt1 / mTotal : 0;
    const temperature = tempLookup.get(variantId);
    const thinkingBudget = m.variantConfig?.thinkingBudget;
    const reasoningEffort = m.variantConfig?.reasoningEffort;

    let thinkingDisplay = "-";
    if (thinkingBudget !== undefined && thinkingBudget !== null) {
      thinkingDisplay = typeof thinkingBudget === "number"
        ? thinkingBudget.toLocaleString("en-US")
        : String(thinkingBudget);
    } else if (reasoningEffort) {
      thinkingDisplay = reasoningEffort;
    }

    modelCardsHtml += `
          <div class="model-card">
            <h3>${variantId}</h3>
            <div class="model-stats">
              <div class="stat"><span class="stat-label">Pass Rate:</span><span class="stat-value">${
      formatRate(passRate)
    }</span></div>
              <div class="stat"><span class="stat-label">Avg Score:</span><span class="stat-value">${
      formatScore(m.avgScore)
    }</span></div>
              <div class="stat"><span class="stat-label">First Pass:</span><span class="stat-value">${
      formatRate(firstPassRate)
    }</span></div>
              <div class="stat"><span class="stat-label" title="Controls randomness in responses. Lower values (0) produce more deterministic output, higher values (1) increase creativity and variability.">Temperature:</span><span class="stat-value">${
      temperature !== undefined ? temperature : "-"
    }</span></div>
              <div class="stat"><span class="stat-label" title="Extended thinking capability. Shows token budget or effort level (low/medium/high) for models that support chain-of-thought reasoning.">Thinking:</span><span class="stat-value">${thinkingDisplay}</span></div>
              <div class="stat"><span class="stat-label">Tokens:</span><span class="stat-value">${
      Math.round(m.tokens).toLocaleString("en-US")
    }</span></div>
              <div class="stat"><span class="stat-label">Cost:</span><span class="stat-value">${
      formatCost(m.cost)
    }</span></div>
            </div>
            ${generateShortcomingsHtml(variantId, shortcomingsMap)}
          </div>`;
  }

  return modelCardsHtml;
}

/**
 * Generate fallback model cards from raw results (when perModel stats not available)
 */
export function generateFallbackModelCardsHtml(
  results: BenchmarkResult[],
  shortcomingsMap: Map<string, ModelShortcomingsFile>,
): string {
  const modelMap = new Map<string, BenchmarkResult[]>();

  for (const result of results) {
    const model = result.context?.variantId ||
      result.context?.llmModel || "unknown";
    if (!modelMap.has(model)) {
      modelMap.set(model, []);
    }
    modelMap.get(model)!.push(result);
  }

  let modelCardsHtml = "";

  for (const [model, modelResults] of modelMap) {
    const mTotal = modelResults.length;
    const mPassed = modelResults.filter((r) => r.success === true).length;
    const mAvgScore = mTotal > 0
      ? modelResults.reduce((sum, r) => sum + (r.finalScore || 0), 0) / mTotal
      : 0;
    const mFirstPass = modelResults.filter((r) => r.attempts?.[0]?.success)
      .length;
    const mTokens = modelResults.reduce(
      (sum, r) => sum + (r.totalTokensUsed || 0),
      0,
    );

    modelCardsHtml += `
          <div class="model-card">
            <h3>${model}</h3>
            <div class="model-stats">
              <div class="stat"><span class="stat-label">Pass Rate:</span><span class="stat-value">${
      formatRate(mPassed / mTotal)
    }</span></div>
              <div class="stat"><span class="stat-label">Avg Score:</span><span class="stat-value">${
      formatScore(mAvgScore)
    }</span></div>
              <div class="stat"><span class="stat-label">First Pass:</span><span class="stat-value">${
      formatRate(mFirstPass / mTotal)
    }</span></div>
              <div class="stat"><span class="stat-label">Tokens:</span><span class="stat-value">${
      Math.round(mTokens).toLocaleString("en-US")
    }</span></div>
            </div>
            ${generateShortcomingsHtml(model, shortcomingsMap)}
          </div>`;
  }

  return modelCardsHtml;
}
