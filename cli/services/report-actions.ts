/**
 * Report generation action functions - shared between CLI and TUI
 * These are testable functions that return results instead of printing.
 */
import { exists, expandGlob } from "@std/fs";
import { join } from "@std/path";

/**
 * Report generation options
 */
export interface GenerateReportOptions {
  /** Directory containing benchmark result JSON files */
  resultsDir: string;
  /** Output directory for the report (default: reports-output/) */
  outputDir?: string;
  /** Generate HTML report (default: true) */
  html?: boolean;
}

/**
 * Result of report generation
 */
export interface ReportResult {
  success: boolean;
  message: string;
  /** Path to the generated report (if successful) */
  outputPath?: string;
  /** Number of result files processed */
  fileCount?: number;
}

/**
 * Generate an HTML report from benchmark results
 *
 * This runs the centralgauge report command to generate an HTML report.
 * Unlike the CLI version, it doesn't prompt for file selection - it uses
 * all JSON files in the results directory.
 *
 * @param options - Report generation options
 * @returns Report result with success status and output path
 */
export async function generateReport(
  options: GenerateReportOptions,
): Promise<ReportResult> {
  const {
    resultsDir,
    outputDir = "reports-output",
    html = true,
  } = options;

  // Validate results directory exists
  if (!await exists(resultsDir)) {
    return {
      success: false,
      message: `Results directory not found: ${resultsDir}`,
    };
  }

  // Count JSON files to validate there's something to process
  let fileCount = 0;
  try {
    for await (const entry of expandGlob(`${resultsDir}/**/*.json`)) {
      if (entry.isFile) {
        fileCount++;
      }
    }
  } catch (error) {
    return {
      success: false,
      message: `Failed to scan results: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  if (fileCount === 0) {
    return {
      success: false,
      message: "No JSON result files found in results directory",
    };
  }

  // Build command arguments
  const args = ["task", "cli", "report", resultsDir, "-o", outputDir];
  if (html) {
    args.push("--html");
  }

  try {
    const cmd = new Deno.Command("deno", {
      args,
      stdout: "piped",
      stderr: "piped",
      cwd: Deno.cwd(),
      stdin: "null", // Non-interactive mode
    });

    const result = await cmd.output();

    if (result.success) {
      const outputPath = join(outputDir, "index.html");
      return {
        success: true,
        message: `Report generated: ${outputPath}`,
        outputPath,
        fileCount,
      };
    } else {
      const stderr = new TextDecoder().decode(result.stderr);
      const errorMsg = stderr.trim() || "Report generation failed";
      return {
        success: false,
        message: errorMsg.split("\n")[0] || "Report generation failed",
      };
    }
  } catch (error) {
    return {
      success: false,
      message: `Failed to run report command: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

/**
 * Get summary info about available results
 *
 * @param resultsDir - Directory containing benchmark results
 * @returns Summary of available results
 */
export async function getResultsSummary(resultsDir: string): Promise<{
  fileCount: number;
  latestDate: Date | null;
  models: string[];
}> {
  const models = new Set<string>();
  let fileCount = 0;
  let latestDate: Date | null = null;

  try {
    for await (const entry of expandGlob(`${resultsDir}/**/*.json`)) {
      if (entry.isFile) {
        fileCount++;
        try {
          const stat = await Deno.stat(entry.path);
          if (stat.mtime && (!latestDate || stat.mtime > latestDate)) {
            latestDate = stat.mtime;
          }

          // Try to extract model info
          const content = await Deno.readTextFile(entry.path);
          const data = JSON.parse(content);
          const results = Array.isArray(data) ? data : data.results;
          if (Array.isArray(results)) {
            for (const result of results) {
              const model = result.context?.variantId ||
                result.context?.llmModel;
              if (model) {
                models.add(model);
              }
            }
          }
        } catch {
          // Skip files that can't be parsed
        }
      }
    }
  } catch {
    // Directory might not exist
  }

  return {
    fileCount,
    latestDate,
    models: [...models],
  };
}
