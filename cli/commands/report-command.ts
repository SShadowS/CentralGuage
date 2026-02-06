/**
 * Report generation command
 * @module cli/commands/report
 */

import { Command } from "@cliffy/command";
import { exists, expandGlob } from "@std/fs";
import * as path from "@std/path";
import * as colors from "@std/fmt/colors";
import type { BenchmarkStats } from "../types/cli-types.ts";
import { extractModelName } from "../helpers/mod.ts";
import {
  buildChartData,
  buildFileOptions,
  buildResultMatrix,
  buildTaskDescriptions,
  buildTaskShortcomingMap,
  buildTemperatureLookup,
  calculateBenchmarkStats,
  calculatePerModelStats,
  confirmDatasetUsage,
  escapeHtml,
  filterExistingDatasetFiles,
  generateChartHtml,
  generateFallbackModelCardsHtml,
  generateHtmlTemplate,
  generateMatrixHeaderHtml,
  generateMatrixRowsHtml,
  generateModelCardsHtml,
  generateModelDetailPage,
  getModelList,
  handleDatasetCollision,
  loadDataset,
  loadResultFiles,
  loadShortcomingsData,
  printDatasetsList,
  sanitizeModelNameForUrl,
  saveDataset,
  selectResultFiles,
  sortModelsByPassRate,
  updateDataset,
} from "./report/mod.ts";

interface ReportOptions {
  html: boolean;
  output: string;
  saveAs?: string;
  addTo?: string;
  dataset?: string;
  listDatasets: boolean;
}

async function generateReport(
  resultsDir: string,
  outputDir: string,
  html: boolean,
  options: ReportOptions,
): Promise<void> {
  console.log("Generating report...");
  console.log(`Results: ${resultsDir}`);
  console.log(`Output: ${outputDir}`);
  console.log(`HTML: ${html}`);

  try {
    // Ensure output directory exists
    await Deno.mkdir(outputDir, { recursive: true });

    if (html) {
      await generateHtmlReportWithDataset(resultsDir, outputDir, options);
    } else {
      await generateJsonSummary(resultsDir, outputDir);
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

/**
 * Find all JSON result files in the results directory
 */
async function findJsonFiles(resultsDir: string): Promise<string[]> {
  const jsonFiles = [];
  for await (const entry of expandGlob(`${resultsDir}/**/*.json`)) {
    if (entry.isFile && entry.name.endsWith(".json")) {
      jsonFiles.push(entry.path);
    }
  }
  return jsonFiles;
}

/**
 * Generate HTML report with dataset support
 */
async function generateHtmlReportWithDataset(
  resultsDir: string,
  outputDir: string,
  options: ReportOptions,
): Promise<void> {
  console.log("Building HTML report...");

  let selectedFiles: string[];

  // Handle --dataset option: load from saved dataset
  if (options.dataset) {
    const confirmed = await confirmDatasetUsage(resultsDir, options.dataset);
    if (!confirmed) {
      console.log("Report generation cancelled.");
      return;
    }
    selectedFiles = confirmed;
  } // Handle --add-to option: add new files to existing dataset
  else if (options.addTo) {
    const loadResult = await loadDataset(resultsDir, options.addTo);
    const jsonFiles = await findJsonFiles(resultsDir);

    if (jsonFiles.length === 0) {
      console.error(
        colors.red("[ERROR] No JSON result files found in results directory"),
      );
      return;
    }

    // Build file options and filter out existing ones
    const allFileOptions = await buildFileOptions(jsonFiles);
    const newFileOptions = filterExistingDatasetFiles(
      allFileOptions,
      loadResult.dataset.files,
      resultsDir,
    );

    if (newFileOptions.length === 0) {
      console.log(colors.yellow("\nNo new files to add to dataset."));
      console.log(
        `Dataset '${options.addTo}' already contains all available files.`,
      );
      return;
    }

    console.log(
      `\nDataset '${options.addTo}' has ${loadResult.dataset.files.length} file(s).`,
    );
    console.log(
      `Found ${newFileOptions.length} new file(s) to potentially add.\n`,
    );

    // Let user select from new files only
    const newFiles = await selectResultFiles(newFileOptions);

    // Update the dataset with new files
    const updatedDataset = await updateDataset(
      resultsDir,
      options.addTo,
      newFiles,
    );
    console.log(
      colors.green(
        `[OK] Added ${newFiles.length} file(s) to dataset '${options.addTo}' (now ${updatedDataset.files.length} total)`,
      ),
    );

    // Resolve all files from the updated dataset for report generation
    const reloadResult = await loadDataset(resultsDir, options.addTo);
    selectedFiles = reloadResult.availableFiles;
  } // Normal flow: interactive file selection with optional --save-as
  else {
    const jsonFiles = await findJsonFiles(resultsDir);

    if (jsonFiles.length === 0) {
      console.error(
        colors.red("[ERROR] No JSON result files found in results directory"),
      );
      return;
    }

    console.log(`Found ${jsonFiles.length} result file(s)`);

    // Build file options and let user select files
    const fileOptions = await buildFileOptions(jsonFiles);
    selectedFiles = await selectResultFiles(fileOptions);

    // Save as dataset if requested
    if (options.saveAs) {
      const finalName = await handleDatasetCollision(
        resultsDir,
        options.saveAs,
      );
      if (finalName) {
        await saveDataset(resultsDir, finalName, selectedFiles);
        console.log(
          colors.green(
            `[OK] Dataset '${finalName}' saved with ${selectedFiles.length} file(s)`,
          ),
        );
      }
    }
  }

  // Generate the HTML report from selected files
  await generateHtmlReportFromFiles(resultsDir, outputDir, selectedFiles);
}

/**
 * Extract the date range from result filenames
 * Filenames contain epoch timestamps in ms (e.g., "sonnet-1704067200000.json")
 */
function extractDateRangeFromFiles(
  files: string[],
): { earliest: Date; latest: Date } | null {
  const timestamps: number[] = [];

  for (const file of files) {
    const basename = path.basename(file, ".json");
    // Look for epoch timestamp pattern (13 digits for milliseconds)
    const match = basename.match(/(\d{13})/);
    if (match && match[1]) {
      const ts = parseInt(match[1], 10);
      if (!isNaN(ts) && ts > 0) {
        timestamps.push(ts);
      }
    }
  }

  if (timestamps.length === 0) {
    return null;
  }

  return {
    earliest: new Date(Math.min(...timestamps)),
    latest: new Date(Math.max(...timestamps)),
  };
}

/**
 * Format a date range as a human-readable string
 */
function formatDateRange(earliest: Date, latest: Date): string {
  const formatOpts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  };

  const earliestStr = earliest.toLocaleDateString("en-US", formatOpts);
  const latestStr = latest.toLocaleDateString("en-US", formatOpts);

  // If same day, show just one date
  if (earliestStr === latestStr) {
    return earliestStr;
  }

  // Use en-dash for date ranges
  return `${earliestStr} \u2013 ${latestStr}`;
}

/**
 * Generate the summary statistics HTML
 */
function generateSummaryHtml(
  stats: BenchmarkStats,
  modelCount: number,
  taskCount: number,
): string {
  const passRate = Object.values(stats.perModel).reduce(
    (sum, m) => sum + m.tasksPassed,
    0,
  );
  const total = Object.values(stats.perModel).reduce(
    (sum, m) => sum + m.tasksPassed + m.tasksFailed,
    0,
  );
  const passRatePct = total > 0 ? ((passRate / total) * 100).toFixed(1) : "0.0";

  const formatCost = (cost: number): string => {
    if (cost >= 1000) {
      return `$${(cost / 1000).toFixed(1)}K`;
    }
    return `$${cost.toFixed(2)}`;
  };

  const formatTokens = (tokens: number): string => {
    if (tokens >= 1_000_000) {
      return `${(tokens / 1_000_000).toFixed(1)}M`;
    }
    if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}K`;
    }
    return tokens.toString();
  };

  return `<div class="summary-grid">
    <div class="summary-card">
      <div class="summary-value">${modelCount}</div>
      <div class="summary-label">Models</div>
    </div>
    <div class="summary-card">
      <div class="summary-value">${taskCount}</div>
      <div class="summary-label">Tasks</div>
    </div>
    <div class="summary-card">
      <div class="summary-value">${passRatePct}%</div>
      <div class="summary-label">Pass Rate</div>
    </div>
    <div class="summary-card">
      <div class="summary-value">${formatCost(stats.totalCost)}</div>
      <div class="summary-label">Total Cost</div>
    </div>
    <div class="summary-card">
      <div class="summary-value">${formatTokens(stats.totalTokens)}</div>
      <div class="summary-label">Tokens</div>
    </div>
  </div>`;
}

/**
 * Generate the footer HTML with version and timestamp
 */
function generateFooterHtml(version: string): string {
  const isoTimestamp = new Date().toISOString();
  return `<p>CentralGauge v${version} &bull; Generated ${isoTimestamp}</p>
    <p><a href="https://github.com/SShadowS/CentralGuage" target="_blank" rel="noopener">GitHub</a></p>`;
}

/**
 * Read the version from deno.json
 */
async function getVersion(): Promise<string> {
  try {
    const denoJson = await Deno.readTextFile("./deno.json");
    const config = JSON.parse(denoJson) as { version?: string };
    return config.version || "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Generate HTML report from a list of selected files
 */
async function generateHtmlReportFromFiles(
  _resultsDir: string,
  outputDir: string,
  selectedFiles: string[],
): Promise<void> {
  // Load results from selected files
  const allResults = await loadResultFiles(selectedFiles);

  // Load model shortcomings data
  const shortcomingsMap = await loadShortcomingsData("./model-shortcomings");
  const taskShortcomingMap = buildTaskShortcomingMap(shortcomingsMap);

  // Calculate statistics
  const perModelMap = calculatePerModelStats(allResults);
  const stats = calculateBenchmarkStats(allResults, perModelMap);
  const sortedModels = sortModelsByPassRate(perModelMap);
  const tempLookup = buildTemperatureLookup(allResults);

  // Generate chart HTML
  const chartData = buildChartData(sortedModels, tempLookup);
  const chartsHtml = generateChartHtml(chartData);

  // Generate model cards HTML
  const modelCardsHtml = stats?.perModel
    ? generateModelCardsHtml(sortedModels, tempLookup, shortcomingsMap)
    : generateFallbackModelCardsHtml(allResults, shortcomingsMap);

  // Build task results matrix
  const modelList = getModelList(allResults, stats?.perModel);
  const taskIds = [...new Set(allResults.map((r) => r.taskId))].sort();
  const resultMatrix = buildResultMatrix(allResults);
  const taskDescriptions = buildTaskDescriptions(allResults);

  const matrixHeaderHtml = generateMatrixHeaderHtml(modelList);
  const matrixRowsHtml = generateMatrixRowsHtml(
    taskIds,
    modelList,
    resultMatrix,
    taskDescriptions,
    taskShortcomingMap,
  );

  // Generate date and time for report
  const now = new Date();
  const generatedDate = now.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }) + " at " + now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  // Extract data date range from file timestamps
  const dateRange = extractDateRangeFromFiles(selectedFiles);
  const dataDateRange = dateRange
    ? formatDateRange(dateRange.earliest, dateRange.latest)
    : "Unknown";

  // Generate summary HTML
  const summaryHtml = generateSummaryHtml(
    stats,
    perModelMap.size,
    taskIds.length,
  );

  // Generate footer HTML
  const version = await getVersion();
  const footerHtml = generateFooterHtml(version);

  // Generate main HTML page
  const htmlContent = generateHtmlTemplate({
    chartsHtml,
    modelCardsHtml,
    matrixHeaderHtml,
    matrixRowsHtml,
    generatedDate,
    dataDateRange,
    summaryHtml,
    footerHtml,
  });

  // Copy favicon if it exists
  const faviconSource = "./reports/static/favicon.svg";
  try {
    await Deno.copyFile(faviconSource, `${outputDir}/favicon.svg`);
  } catch {
    // Favicon not found - continue without it
  }

  // Write the main HTML file
  const outputFile = `${outputDir}/index.html`;
  await Deno.writeTextFile(outputFile, htmlContent);

  // Generate model detail pages
  if (stats?.perModel) {
    let detailPagesGenerated = 0;

    for (const [variantId, modelStats] of Object.entries(stats.perModel)) {
      const modelName = extractModelName(variantId);
      const modelShortcomings = shortcomingsMap.get(modelName);

      if (modelShortcomings && modelShortcomings.shortcomings.length > 0) {
        const sortedShortcomings = [...modelShortcomings.shortcomings].sort(
          (a, b) => b.occurrences - a.occurrences,
        );

        const sanitizedName = sanitizeModelNameForUrl(modelName);
        const detailPageContent = generateModelDetailPage({
          modelName,
          variantId,
          shortcomings: sortedShortcomings,
          stats: modelStats,
          escapeHtml,
        });

        const detailFile = `${outputDir}/model-${sanitizedName}.html`;
        await Deno.writeTextFile(detailFile, detailPageContent);
        detailPagesGenerated++;
      }
    }

    if (detailPagesGenerated > 0) {
      console.log(
        `[OK] Generated ${detailPagesGenerated} model detail page(s)`,
      );
    }
  }

  console.log("[OK] HTML report generated successfully!");
  console.log(`Report available at: ${outputFile}`);
  console.log(`Open in browser: file://${Deno.cwd()}/${outputFile}`);
}

async function generateJsonSummary(
  resultsDir: string,
  outputDir: string,
): Promise<void> {
  console.log("Generating JSON summary...");

  const jsonFiles = await findJsonFiles(resultsDir);

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

export function registerReportCommand(cli: Command): void {
  cli.command(
    "report <results-dir>",
    "Generate HTML report from benchmark results",
  )
    .option("--html", "Generate HTML report", { default: false })
    .option("-o, --output <dir>", "Output directory", {
      default: "reports-output/",
    })
    .option("--save-as <name:string>", "Save file selection as a named dataset")
    .option("--add-to <name:string>", "Add files to existing dataset")
    .option("--dataset <name:string>", "Generate report from saved dataset")
    .option("--list-datasets", "List all saved datasets", { default: false })
    .action(async (options, resultsDir: string) => {
      if (!await exists(resultsDir)) {
        console.error(
          `[ERROR] Results directory '${resultsDir}' does not exist`,
        );
        Deno.exit(1);
      }

      // Handle --list-datasets first (doesn't require other options)
      if (options.listDatasets) {
        await printDatasetsList(resultsDir);
        return;
      }

      // Validate mutually exclusive options
      const datasetOptions = [options.saveAs, options.addTo, options.dataset]
        .filter(Boolean);
      if (datasetOptions.length > 1) {
        console.error(
          colors.red(
            "[ERROR] Cannot combine --save-as, --add-to, and --dataset options",
          ),
        );
        Deno.exit(1);
      }

      await generateReport(
        resultsDir,
        options.output,
        options.html,
        options as ReportOptions,
      );
    });
}
