/**
 * Model card HTML generation for benchmark reports
 * @module cli/commands/report/model-cards
 */

import type { BenchmarkResult, PerModelStats } from "../../types/cli-types.ts";
import type { ModelShortcomingsFile } from "../../../src/verify/types.ts";
import { formatCost, formatRate } from "./html-utils.ts";
import { generateShortcomingsHtml } from "./shortcomings.ts";

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th"];
const PILL_CLASSES = [
  "attempt-pill-1st",
  "attempt-pill-2nd",
  "attempt-pill-3rd",
  "attempt-pill-4th",
  "attempt-pill-5th",
];

/**
 * Get the passedByAttempt array, falling back to legacy fields for old data
 */
function getPassedByAttempt(m: PerModelStats): number[] {
  if (m.passedByAttempt?.length) {
    return m.passedByAttempt;
  }
  // Backward compat: derive from passedOnAttempt1/passedOnAttempt2
  const first = m.passedOnAttempt1 || 0;
  const secondOnly = (m.passedOnAttempt2 || 0) - first;
  const arr = [first];
  if (secondOnly > 0) arr.push(secondOnly);
  return arr;
}

/**
 * Generate attempt pill badges HTML
 */
function generateAttemptPillsHtml(
  passedByAttempt: number[],
  tasksFailed: number,
  tasksPassed: number,
  totalTasks: number,
): string {
  const pills: string[] = [];

  for (let i = 0; i < passedByAttempt.length; i++) {
    const count = passedByAttempt[i] ?? 0;
    if (count <= 0) continue;
    const ordinal = ORDINALS[i] || `${i + 1}th`;
    const cls = PILL_CLASSES[Math.min(i, PILL_CLASSES.length - 1)];
    pills.push(
      `<span class="attempt-pill ${cls}" title="Tasks that passed on the ${ordinal} attempt">${ordinal}: ${count}</span>`,
    );
  }

  if (tasksFailed > 0) {
    pills.push(
      `<span class="attempt-pill attempt-pill-failed" title="Tasks that failed all attempts">Failed: ${tasksFailed}</span>`,
    );
  }

  const totalLabel =
    `<span class="attempt-total">${tasksPassed}/${totalTasks} passed</span>`;

  return `<div class="attempt-pills">${pills.join("")}${totalLabel}</div>`;
}

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

    const passedByAttempt = getPassedByAttempt(m);
    const pillsHtml = generateAttemptPillsHtml(
      passedByAttempt,
      m.tasksFailed,
      m.tasksPassed,
      mTotal,
    );

    modelCardsHtml += `
          <div class="model-card">
            <h3>${variantId}</h3>
            <div class="model-stats">
              <div class="stat"><span class="stat-label" title="Percentage of tasks that passed across all allowed attempts.">Pass Rate:</span><span class="stat-value">${
      formatRate(passRate)
    }</span></div>
              ${pillsHtml}
              <div class="stat"><span class="stat-label" title="Controls randomness in responses. Lower values (0) produce more deterministic output, higher values (1) increase creativity and variability.">Temperature:</span><span class="stat-value">${
      temperature !== undefined ? temperature : "-"
    }</span></div>
              <div class="stat"><span class="stat-label" title="Extended thinking capability. Shows token budget or effort level (low/medium/high) for models that support chain-of-thought reasoning.">Thinking:</span><span class="stat-value">${thinkingDisplay}</span></div>
              <div class="stat"><span class="stat-label" title="Total tokens (prompt + completion) across all tasks and attempts.">Tokens:</span><span class="stat-value">${
      Math.round(m.tokens).toLocaleString("en-US")
    }</span></div>
              <div class="stat"><span class="stat-label" title="Estimated total API cost at current provider pricing.">Cost:</span><span class="stat-value">${
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
    const mFailed = mTotal - mPassed;
    const mTokens = modelResults.reduce(
      (sum, r) => sum + (r.totalTokensUsed || 0),
      0,
    );

    // Compute passedByAttempt from raw results
    const passedByAttempt: number[] = [];
    for (const r of modelResults) {
      if (!r.success) continue;
      const successIndex = r.attempts?.findIndex((a) => a.success) ?? 0;
      while (passedByAttempt.length <= successIndex) {
        passedByAttempt.push(0);
      }
      passedByAttempt[successIndex] = (passedByAttempt[successIndex] ?? 0) + 1;
    }

    const pillsHtml = generateAttemptPillsHtml(
      passedByAttempt,
      mFailed,
      mPassed,
      mTotal,
    );

    modelCardsHtml += `
          <div class="model-card">
            <h3>${model}</h3>
            <div class="model-stats">
              <div class="stat"><span class="stat-label" title="Percentage of tasks that passed across all allowed attempts.">Pass Rate:</span><span class="stat-value">${
      formatRate(mPassed / mTotal)
    }</span></div>
              ${pillsHtml}
              <div class="stat"><span class="stat-label" title="Total tokens (prompt + completion) across all tasks and attempts.">Tokens:</span><span class="stat-value">${
      Math.round(mTokens).toLocaleString("en-US")
    }</span></div>
            </div>
            ${generateShortcomingsHtml(model, shortcomingsMap)}
          </div>`;
  }

  return modelCardsHtml;
}
