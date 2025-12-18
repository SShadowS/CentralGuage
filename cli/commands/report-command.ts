/**
 * Report generation command
 * @module cli/commands/report
 */

import { Command } from "@cliffy/command";
import { exists, expandGlob } from "@std/fs";
import { Select } from "@cliffy/prompt";
import { extractModelName } from "../helpers/mod.ts";
import { shortVariantName } from "../../src/utils/formatters.ts";
import type {
  ModelShortcomingEntry,
  ModelShortcomingsFile,
} from "../../src/verify/types.ts";
import type {
  BenchmarkResult,
  BenchmarkStats,
  FileOption,
  PerModelStats,
} from "../types/cli-types.ts";

async function generateReport(
  resultsDir: string,
  outputDir: string,
  html: boolean,
): Promise<void> {
  console.log("Generating report...");
  console.log(`Results: ${resultsDir}`);
  console.log(`Output: ${outputDir}`);
  console.log(`HTML: ${html}`);

  try {
    // Ensure output directory exists
    await Deno.mkdir(outputDir, { recursive: true });

    if (html) {
      console.log("Building HTML report...");

      // Find all JSON result files in the results directory
      const jsonFiles = [];
      for await (const entry of expandGlob(`${resultsDir}/**/*.json`)) {
        if (entry.isFile && entry.name.endsWith(".json")) {
          jsonFiles.push(entry.path);
        }
      }

      if (jsonFiles.length === 0) {
        console.error(
          "[ERROR] No JSON result files found in results directory",
        );
        return;
      }

      console.log(`Found ${jsonFiles.length} result file(s)`);

      // Get file info for each JSON file
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

      // Let user select which file to use
      let selectedFiles: string[];
      const firstFile = fileOptions[0];
      if (fileOptions.length === 1 && firstFile) {
        selectedFiles = [firstFile.path];
        console.log(`Using: ${firstFile.name}`);
      } else {
        const choices = [
          { name: "All files (merge results)", value: "__all__" },
          ...fileOptions.map((f) => ({
            name: `${f.name} (${
              (f.size / 1024).toFixed(1)
            }KB, ${f.date.toLocaleString()})`,
            value: f.path,
          })),
        ];

        const selected = await Select.prompt({
          message: "Select which result file to use for the report:",
          options: choices,
        });

        if (selected === "__all__") {
          selectedFiles = fileOptions.map((f) => f.path);
          console.log(`Using all ${selectedFiles.length} files`);
        } else {
          selectedFiles = [selected];
          console.log(`Using: ${selected.split(/[\\/]/).pop()}`);
        }
      }

      // Read and merge selected result files
      const allResults: BenchmarkResult[] = [];

      for (const jsonFile of selectedFiles) {
        try {
          const content = await Deno.readTextFile(jsonFile);
          const data = JSON.parse(content);
          const results = Array.isArray(data) ? data : data.results;
          if (Array.isArray(results)) {
            allResults.push(...results);
          }
        } catch (error) {
          console.warn(
            `[WARN] Failed to parse ${jsonFile}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      // Load model shortcomings data
      const shortcomingsMap = new Map<string, ModelShortcomingsFile>();
      const shortcomingsDir = "./model-shortcomings";
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

      // Build task -> model -> shortcoming lookup for task-failure linking
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

      // Calculate perModel stats from all results
      const perModelMap = new Map<string, PerModelStats>();
      for (const result of allResults) {
        const variantId = result.context?.variantId ||
          result.context?.llmModel || "unknown";
        if (!perModelMap.has(variantId)) {
          perModelMap.set(variantId, {
            model: variantId.split("/").pop()?.split("@")[0] || variantId,
            provider: result.context?.llmProvider || "unknown",
            variantId,
            tasksPassed: 0,
            tasksFailed: 0,
            avgScore: 0,
            tokens: 0,
            cost: 0,
            avgAttempts: 0,
            passedOnAttempt1: 0,
            passedOnAttempt2: 0,
            compileFailures: 0,
            testFailures: 0,
            malformedResponses: 0,
            variantConfig: result.context?.variantConfig ?? null,
          });
        }
        const m = perModelMap.get(variantId)!;
        if (result.success) {
          m.tasksPassed++;
          if (result.attempts?.[0]?.success) {
            m.passedOnAttempt1++;
          }
          m.passedOnAttempt2++;
        } else {
          m.tasksFailed++;
        }
        m.tokens += result.totalTokensUsed || 0;
        m.avgScore += result.finalScore || 0;
      }
      // Calculate averages
      for (const m of perModelMap.values()) {
        const total = m.tasksPassed + m.tasksFailed;
        if (total > 0) {
          m.avgScore = m.avgScore / total;
        }
      }

      const calculatedStats: BenchmarkStats = {
        overallPassRate: 0,
        averageScore: 0,
        totalTokens: allResults.reduce(
          (sum, r) => sum + (r.totalTokensUsed || 0),
          0,
        ),
        totalCost: 0,
        totalDuration: 0,
        perModel: Object.fromEntries(perModelMap),
      };
      const stats = calculatedStats;

      const uniqueTasks = new Set(allResults.map((r) => r.taskId)).size;
      const modelCount = stats?.perModel
        ? Object.keys(stats.perModel).length
        : new Set(
          allResults.map((r) => r.context?.variantId || r.context?.llmModel),
        ).size;
      const totalTokens = stats?.totalTokens ??
        allResults.reduce((sum, r) => sum + (r.totalTokensUsed || 0), 0);
      const totalCost = stats?.totalCost ?? 0;

      // Score is already 0-100, just format it
      const formatScore = (score: number): string => score.toFixed(1) + "%";
      // Rate is 0-1, convert to percentage
      const formatRate = (rate: number): string =>
        (rate * 100).toFixed(1) + "%";
      // Format cost as currency
      const formatCost = (cost: number): string => "$" + cost.toFixed(2);

      // Helper to escape HTML for title attribute
      const escapeHtml = (text: string): string =>
        text
          .replace(/&/g, "&amp;")
          .replace(/"/g, "&quot;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");

      // Helper to generate shortcomings HTML for a model
      const generateShortcomingsHtml = (variantId: string): string => {
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
            const truncatedDesc = s.description.length > 200
              ? s.description.substring(0, 200) + "..."
              : s.description;
            return `<li class="shortcoming-item" title="${
              escapeHtml(truncatedDesc)
            }">
              <span class="shortcoming-concept">${escapeHtml(s.concept)}</span>
              <span class="shortcoming-count">${s.occurrences}x</span>
            </li>`;
          })
          .join("");

        const moreCount = modelShortcomings.shortcomings.length - 5;
        const moreIndicator = moreCount > 0
          ? `<div class="shortcomings-more">+${moreCount} more</div>`
          : "";

        return `
          <div class="shortcomings-section">
            <h4>Known Shortcomings (${modelShortcomings.shortcomings.length})</h4>
            <ul class="shortcomings-list">${listItems}</ul>
            ${moreIndicator}
          </div>`;
      };

      // Generate model cards HTML and charts using stats.perModel if available
      let modelCardsHtml = "";
      let chartsHtml = "";
      if (stats?.perModel) {
        // Sort models by pass rate descending
        const sortedModels = Object.entries(stats.perModel).sort(
          ([, a], [, b]) => {
            const aRate = a.tasksPassed / (a.tasksPassed + a.tasksFailed);
            const bRate = b.tasksPassed / (b.tasksPassed + b.tasksFailed);
            return bRate - aRate;
          },
        );

        // Generate chart data with 1st and 2nd pass rates
        const chartData = sortedModels.map(([variantId, m]) => {
          const total = m.tasksPassed + m.tasksFailed;
          const firstPassRate = total > 0 ? m.passedOnAttempt1 / total : 0;
          const secondPassOnly = m.passedOnAttempt2 - m.passedOnAttempt1;
          const secondPassRate = total > 0 ? secondPassOnly / total : 0;
          const totalPassRate = total > 0 ? m.tasksPassed / total : 0;
          const shortName = variantId.split("/").pop()?.split("@")[0] ||
            variantId;
          return {
            variantId,
            shortName,
            firstPassRate,
            secondPassRate,
            totalPassRate,
          };
        });

        // Horizontal Bar Chart with stacked 1st/2nd pass
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

        chartsHtml = `
        <div class="chart-card h-bar-chart">
          ${legendHtml}
          ${hBarHtml}
        </div>`;

        // Build temperature lookup from results
        const tempLookup = new Map<string, number | undefined>();
        for (const result of allResults) {
          const vid = result.context?.variantId || result.context?.llmModel;
          if (vid && !tempLookup.has(vid)) {
            tempLookup.set(vid, result.context?.temperature);
          }
        }

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
              <div class="stat"><span class="stat-label">Temperature:</span><span class="stat-value">${
            temperature !== undefined ? temperature : "-"
          }</span></div>
              <div class="stat"><span class="stat-label">Thinking:</span><span class="stat-value">${thinkingDisplay}</span></div>
              <div class="stat"><span class="stat-label">Tokens:</span><span class="stat-value">${
            Math.round(m.tokens).toLocaleString("en-US")
          }</span></div>
              <div class="stat"><span class="stat-label">Cost:</span><span class="stat-value">${
            formatCost(m.cost)
          }</span></div>
            </div>
            ${generateShortcomingsHtml(variantId)}
          </div>`;
        }
      } else {
        // Fallback: group by model from results
        const modelMap = new Map<string, BenchmarkResult[]>();
        for (const result of allResults) {
          const model = result.context?.variantId ||
            result.context?.llmModel || "unknown";
          if (!modelMap.has(model)) {
            modelMap.set(model, []);
          }
          modelMap.get(model)!.push(result);
        }
        for (const [model, results] of modelMap) {
          const mTotal = results.length;
          const mPassed = results.filter((r) => r.success === true).length;
          const mAvgScore = mTotal > 0
            ? results.reduce((sum, r) => sum + (r.finalScore || 0), 0) / mTotal
            : 0;
          const mFirstPass = results.filter((r) => r.attempts?.[0]?.success)
            .length;
          const mTokens = results.reduce(
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
            ${generateShortcomingsHtml(model)}
          </div>`;
        }
      }

      // Build task results matrix
      const modelList = stats?.perModel
        ? Object.entries(stats.perModel)
          .sort(([, a], [, b]) => {
            const aRate = a.tasksPassed / (a.tasksPassed + a.tasksFailed);
            const bRate = b.tasksPassed / (b.tasksPassed + b.tasksFailed);
            return bRate - aRate;
          })
          .map(([id]) => id)
        : [
          ...new Set(allResults.map((r) => r.context?.variantId || "unknown")),
        ];

      const taskIds = [...new Set(allResults.map((r) => r.taskId))].sort();

      const resultMatrix = new Map<string, Map<string, BenchmarkResult>>();
      for (const result of allResults) {
        const variantId = result.context?.variantId ||
          result.context?.llmModel || "unknown";
        if (!resultMatrix.has(result.taskId)) {
          resultMatrix.set(result.taskId, new Map());
        }
        resultMatrix.get(result.taskId)!.set(variantId, result);
      }

      const taskDescriptions = new Map<string, string>();
      for (const result of allResults) {
        if (!taskDescriptions.has(result.taskId)) {
          const desc = result.context?.manifest?.description || "";
          taskDescriptions.set(result.taskId, desc);
        }
      }

      const matrixHeaderHtml = modelList
        .map((m) => `<th title="${m}">${shortVariantName(m)}</th>`)
        .join("");

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

      // Generate standalone HTML
      const htmlContent = generateHtmlTemplate({
        uniqueTasks,
        modelCount,
        totalTokens,
        totalCost,
        chartsHtml,
        modelCardsHtml,
        matrixHeaderHtml,
        matrixRowsHtml,
        formatCost,
      });

      // Ensure output directory exists
      await Deno.mkdir(outputDir, { recursive: true });

      // Write the HTML file
      const outputFile = `${outputDir}/index.html`;
      await Deno.writeTextFile(outputFile, htmlContent);

      console.log("[OK] HTML report generated successfully!");
      console.log(`Report available at: ${outputFile}`);
      console.log(
        `Open in browser: file://${Deno.cwd()}/${outputFile}`,
      );
    } else {
      // Generate JSON summary report
      console.log("Generating JSON summary...");

      // Find all JSON result files
      const jsonFiles = [];
      for await (const entry of expandGlob(`${resultsDir}/**/*.json`)) {
        if (entry.isFile && entry.name.endsWith(".json")) {
          jsonFiles.push(entry.path);
        }
      }

      const summary = {
        generatedAt: new Date().toISOString(),
        resultFiles: jsonFiles,
        totalFiles: jsonFiles.length,
      };

      await Deno.writeTextFile(
        `${outputDir}/summary.json`,
        JSON.stringify(summary, null, 2),
      );
      console.log(`[OK] Summary saved to: ${outputDir}/summary.json`);
    }
  } catch (error) {
    console.error(
      `[ERROR] Report generation failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    throw error;
  }
}

function generateHtmlTemplate(params: {
  uniqueTasks: number;
  modelCount: number;
  totalTokens: number;
  totalCost: number;
  chartsHtml: string;
  modelCardsHtml: string;
  matrixHeaderHtml: string;
  matrixRowsHtml: string;
  formatCost: (cost: number) => string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CentralGauge - Benchmark Results</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
    header { text-align: center; margin-bottom: 3rem; }
    header h1 { font-size: 2.5rem; margin: 0; color: #2563eb; }
    header p { font-size: 1.1rem; color: #6b7280; margin: 0.5rem 0; }
    .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin: 1rem 0 2rem; }
    .metric-card { background: white; border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 1.5rem; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .metric-card.success { border-color: #10b981; background: #f0fdf4; }
    .metric-card.error { border-color: #ef4444; background: #fef2f2; }
    .metric-value { font-size: 2rem; font-weight: bold; color: #1f2937; }
    .metric-label { font-size: 0.875rem; color: #6b7280; margin-top: 0.5rem; }
    h2 { color: #1f2937; margin: 2rem 0 1rem; border-bottom: 2px solid #e5e7eb; padding-bottom: 0.5rem; }
    .models-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; }
    .model-card { background: white; border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .model-card h3 { margin: 0 0 1rem 0; color: #1f2937; font-size: 1rem; word-break: break-all; }
    .stat { display: flex; justify-content: space-between; margin-bottom: 0.5rem; }
    .stat-label { color: #6b7280; font-size: 0.875rem; }
    .stat-value { font-weight: 500; color: #1f2937; }
    .shortcomings-section { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #e5e7eb; }
    .shortcomings-section h4 { margin: 0 0 0.5rem 0; font-size: 0.875rem; color: #4b5563; font-weight: 600; }
    .shortcomings-list { list-style: none; padding: 0; margin: 0; }
    .shortcoming-item { display: flex; justify-content: space-between; padding: 0.25rem 0; font-size: 0.8rem; cursor: help; }
    .shortcoming-concept { color: #dc2626; }
    .shortcoming-count { color: #6b7280; font-size: 0.75rem; }
    .shortcomings-more { font-size: 0.75rem; color: #9ca3af; margin-top: 0.25rem; }
    .matrix-legend { color: #6b7280; font-size: 0.875rem; margin-bottom: 1rem; }
    .matrix-legend .pass { color: #166534; font-weight: bold; }
    .matrix-legend .fail { color: #991b1b; font-weight: bold; }
    .matrix-container { overflow-x: auto; background: white; border: 1px solid #e5e7eb; border-radius: 0.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .result-matrix { border-collapse: collapse; width: 100%; font-size: 0.8rem; }
    .result-matrix th, .result-matrix td { padding: 0.5rem; text-align: center; border: 1px solid #e5e7eb; }
    .result-matrix th { background: #f9fafb; font-weight: 600; color: #374151; white-space: nowrap; }
    .result-matrix .task-id { text-align: left; font-family: monospace; font-weight: 500; white-space: nowrap; background: #f9fafb; position: sticky; left: 0; }
    .result-matrix .task-desc { text-align: left; max-width: 300px; font-size: 0.75rem; color: #4b5563; cursor: help; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .matrix-cell { width: 2rem; font-weight: bold; }
    .matrix-cell.pass { background: #dcfce7; color: #166534; }
    .matrix-cell.fail { background: #fee2e2; color: #991b1b; }
    .chart-card { background: white; border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .chart-legend { display: flex; gap: 1.5rem; margin-bottom: 1rem; font-size: 0.8rem; color: #374151; }
    .chart-legend .legend-item { display: flex; align-items: center; gap: 0.4rem; }
    .chart-legend .legend-dot { width: 14px; height: 14px; border-radius: 3px; }
    .chart-legend .legend-dot.bar-first { background: #22c55e; }
    .chart-legend .legend-dot.bar-second { background: #3b82f6; }
    .h-bar-chart .bar-row { display: flex; align-items: center; margin-bottom: 0.5rem; }
    .h-bar-chart .bar-label { width: 140px; font-size: 0.8rem; color: #374151; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; flex-shrink: 0; }
    .h-bar-chart .bar-container { flex: 1; height: 24px; background: #f3f4f6; border-radius: 4px; margin: 0 0.75rem; overflow: hidden; display: flex; }
    .h-bar-chart .bar-fill { height: 100%; transition: width 0.3s; display: flex; align-items: center; justify-content: center; position: relative; }
    .h-bar-chart .bar-fill.bar-first { background: #22c55e; border-radius: 4px 0 0 4px; }
    .h-bar-chart .bar-fill.bar-second { background: #3b82f6; border-radius: 0 4px 4px 0; }
    .h-bar-chart .bar-pct { font-size: 0.7rem; font-weight: 600; color: white; text-shadow: 0 1px 2px rgba(0,0,0,0.3); }
    .h-bar-chart .bar-value { width: 50px; font-size: 0.8rem; font-weight: 600; color: #374151; text-align: right; }
    @media (max-width: 768px) {
      .result-matrix { font-size: 0.7rem; }
      .result-matrix th, .result-matrix td { padding: 0.25rem; }
    }
    .theme-toggle { position: fixed; top: 1rem; right: 1rem; z-index: 100; background: #e5e7eb; border: none; border-radius: 2rem; padding: 0.5rem 1rem; cursor: pointer; font-size: 0.875rem; display: flex; align-items: center; gap: 0.5rem; transition: background 0.2s, color 0.2s; }
    .theme-toggle:hover { background: #d1d5db; }
    .theme-toggle .icon { font-size: 1rem; }
    body.dark { background: #111827; color: #f3f4f6; }
    body.dark header h1 { color: #60a5fa; }
    body.dark header p { color: #9ca3af; }
    body.dark h2 { color: #f3f4f6; border-bottom-color: #374151; }
    body.dark .theme-toggle { background: #374151; color: #f3f4f6; }
    body.dark .theme-toggle:hover { background: #4b5563; }
    body.dark .metric-card { background: #1f2937; border-color: #374151; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
    body.dark .metric-card.success { border-color: #10b981; background: #064e3b; }
    body.dark .metric-card.error { border-color: #ef4444; background: #7f1d1d; }
    body.dark .metric-value { color: #f3f4f6; }
    body.dark .metric-label { color: #9ca3af; }
    body.dark .model-card { background: #1f2937; border-color: #374151; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
    body.dark .model-card h3 { color: #f3f4f6; }
    body.dark .stat-label { color: #9ca3af; }
    body.dark .stat-value { color: #f3f4f6; }
    body.dark .shortcomings-section { border-top-color: #374151; }
    body.dark .shortcomings-section h4 { color: #9ca3af; }
    body.dark .shortcoming-concept { color: #f87171; }
    body.dark .shortcoming-count { color: #9ca3af; }
    body.dark .shortcomings-more { color: #6b7280; }
    body.dark .chart-card { background: #1f2937; border-color: #374151; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
    body.dark .chart-legend { color: #d1d5db; }
    body.dark .h-bar-chart .bar-label { color: #d1d5db; }
    body.dark .h-bar-chart .bar-container { background: #374151; }
    body.dark .h-bar-chart .bar-value { color: #d1d5db; }
    body.dark .matrix-legend { color: #9ca3af; }
    body.dark .matrix-container { background: #1f2937; border-color: #374151; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
    body.dark .result-matrix th, body.dark .result-matrix td { border-color: #374151; }
    body.dark .result-matrix th { background: #111827; color: #d1d5db; }
    body.dark .result-matrix .task-id { background: #111827; color: #f3f4f6; }
    body.dark .result-matrix .task-desc { color: #9ca3af; }
    body.dark .matrix-cell.pass { background: #064e3b; color: #34d399; }
    body.dark .matrix-cell.fail { background: #7f1d1d; color: #fca5a5; }
  </style>
</head>
<body>
  <button class="theme-toggle" id="theme-toggle" aria-label="Toggle dark mode">
    <span class="icon" id="theme-icon">&#9790;</span>
    <span id="theme-label">Dark</span>
  </button>
  <script>
    (function() {
      const toggle = document.getElementById('theme-toggle');
      const icon = document.getElementById('theme-icon');
      const label = document.getElementById('theme-label');
      function setTheme(dark) {
        document.body.classList.toggle('dark', dark);
        icon.innerHTML = dark ? '&#9788;' : '&#9790;';
        label.textContent = dark ? 'Light' : 'Dark';
        localStorage.setItem('cg-theme', dark ? 'dark' : 'light');
      }
      const saved = localStorage.getItem('cg-theme');
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const isDark = saved === 'dark' || (!saved && prefersDark);
      setTheme(isDark);
      toggle.addEventListener('click', function() {
        setTheme(!document.body.classList.contains('dark'));
      });
    })();
  </script>
  <main class="container">
    <header>
      <h1>CentralGauge</h1>
      <p>LLM Benchmark Results for Microsoft Dynamics 365 Business Central AL Code</p>
    </header>

    <section>
      <h2>Model Rankings</h2>
      ${params.chartsHtml}
    </section>

    <section>
      <h2>Benchmark Overview</h2>
      <div class="metrics-grid">
        <div class="metric-card"><div class="metric-value">${params.uniqueTasks}</div><div class="metric-label">Unique Tasks</div></div>
        <div class="metric-card"><div class="metric-value">${params.modelCount}</div><div class="metric-label">Models Tested</div></div>
        <div class="metric-card"><div class="metric-value">${
    Math.round(params.totalTokens).toLocaleString("en-US")
  }</div><div class="metric-label">Total Tokens</div></div>
        <div class="metric-card"><div class="metric-value">${
    params.formatCost(params.totalCost)
  }</div><div class="metric-label">Total Cost</div></div>
      </div>
    </section>

    <section>
      <h2>Model Performance</h2>
      <div class="models-grid">${params.modelCardsHtml}</div>
    </section>

    <section>
      <h2>Task Results Matrix</h2>
      <p class="matrix-legend"><span class="pass">P</span> = Pass, <span class="fail">F</span> = Fail (hover for details)</p>
      <div class="matrix-container">
        <table class="result-matrix">
          <thead>
            <tr><th>Task</th><th>Description</th>${params.matrixHeaderHtml}</tr>
          </thead>
          <tbody>
            ${params.matrixRowsHtml}
          </tbody>
        </table>
      </div>
    </section>
  </main>
</body>
</html>`;
}

export function registerReportCommand(cli: Command): void {
  cli.command(
    "report <results-dir>",
    "Generate HTML report from benchmark results",
  )
    .option("--html", "Generate HTML report", { default: false })
    .option("-o, --output <dir>", "Output directory", {
      default: "reports-output/",
    })
    .action(async (options, resultsDir: string) => {
      if (!await exists(resultsDir)) {
        console.error(
          `[ERROR] Results directory '${resultsDir}' does not exist`,
        );
        Deno.exit(1);
      }
      await generateReport(resultsDir, options.output, options.html);
    });
}
