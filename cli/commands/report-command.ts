/**
 * Report generation command
 * @module cli/commands/report
 */

import { Command } from "@cliffy/command";
import { exists, expandGlob } from "@std/fs";
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
  escapeHtml,
  generateChartHtml,
  generateFallbackModelCardsHtml,
  generateHtmlTemplate,
  generateMatrixHeaderHtml,
  generateMatrixRowsHtml,
  generateModelCardsHtml,
  generateModelDetailPage,
  getModelList,
  loadResultFiles,
  loadShortcomingsData,
  sanitizeModelNameForUrl,
  selectResultFiles,
  sortModelsByPassRate,
} from "./report/mod.ts";

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
      await generateHtmlReport(resultsDir, outputDir);
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

async function generateHtmlReport(
  resultsDir: string,
  outputDir: string,
): Promise<void> {
  console.log("Building HTML report...");

  // Find all JSON result files in the results directory
  const jsonFiles = [];
  for await (const entry of expandGlob(`${resultsDir}/**/*.json`)) {
    if (entry.isFile && entry.name.endsWith(".json")) {
      jsonFiles.push(entry.path);
    }
  }

  if (jsonFiles.length === 0) {
    console.error("[ERROR] No JSON result files found in results directory");
    return;
  }

  console.log(`Found ${jsonFiles.length} result file(s)`);

  // Build file options and let user select files
  const fileOptions = await buildFileOptions(jsonFiles);
  const selectedFiles = await selectResultFiles(fileOptions);

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

  // Generate main HTML page
  const htmlContent = generateHtmlTemplate({
    chartsHtml,
    modelCardsHtml,
    matrixHeaderHtml,
    matrixRowsHtml,
    generatedDate: new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
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
