/**
 * Health check action functions - shared between CLI and TUI
 * These are testable, pure-ish functions that return results instead of printing.
 */
import { ConfigManager } from "../../src/config/config.ts";
import { EnvLoader } from "../../src/utils/env-loader.ts";

/**
 * Individual health check result
 */
export interface HealthCheckItem {
  name: string;
  status: "ok" | "warning" | "error";
  message: string;
  details?: string;
}

/**
 * Overall health check result
 */
export interface HealthCheckResult {
  healthy: boolean;
  items: HealthCheckItem[];
  summary: string;
}

/**
 * Run a full system health check
 *
 * Checks:
 * - Environment (.env loading and validation)
 * - LLM Providers (API key availability)
 * - Configuration (config file validity)
 *
 * @returns Health check results with status for each component
 */
export async function runHealthCheck(): Promise<HealthCheckResult> {
  const items: HealthCheckItem[] = [];
  let allHealthy = true;

  // 1. Environment Health
  const envResult = await EnvLoader.loadEnvironment();
  const envValidation = EnvLoader.validateEnvironment();

  if (envValidation.valid && envResult.loaded) {
    items.push({
      name: "Environment",
      status: "ok",
      message: "Loaded and valid",
      details: envResult.source,
    });
  } else if (envResult.loaded) {
    items.push({
      name: "Environment",
      status: "warning",
      message: "Loaded with warnings",
      details: envValidation.errors.join(", "),
    });
    allHealthy = false;
  } else {
    items.push({
      name: "Environment",
      status: "warning",
      message: "No .env file found",
      details: "Using environment variables only",
    });
  }

  // 2. LLM Provider Health
  const availableProviders = EnvLoader.getAvailableProviders();
  const realProviders = availableProviders.filter(
    (p) => !["mock", "local"].includes(p),
  );

  if (realProviders.length > 0) {
    items.push({
      name: "LLM Providers",
      status: "ok",
      message: `${realProviders.length} available`,
      details: realProviders.join(", "),
    });
  } else if (availableProviders.length > 0) {
    items.push({
      name: "LLM Providers",
      status: "warning",
      message: "Only mock/local available",
      details: "Add API keys for real providers",
    });
    allHealthy = false;
  } else {
    items.push({
      name: "LLM Providers",
      status: "error",
      message: "None available",
      details: "Check API key configuration",
    });
    allHealthy = false;
  }

  // 3. Configuration Health
  try {
    const config = await ConfigManager.loadConfig();
    const modelCount = config.defaultModels?.benchmark?.length ?? 0;
    const configItem: HealthCheckItem = {
      name: "Configuration",
      status: "ok",
      message: "Valid",
    };
    if (modelCount > 0) {
      configItem.details = `${modelCount} default models`;
    }
    items.push(configItem);
  } catch (error) {
    items.push({
      name: "Configuration",
      status: "warning",
      message: "Using defaults",
      details: error instanceof Error ? error.message : String(error),
    });
  }

  // Generate summary
  const warningCount = items.filter((i) => i.status === "warning").length;
  const errorCount = items.filter((i) => i.status === "error").length;

  let summary: string;
  if (allHealthy) {
    summary = "All systems healthy - ready for benchmarks!";
  } else if (errorCount > 0) {
    summary =
      `${errorCount} error(s), ${warningCount} warning(s) - check configuration`;
  } else {
    summary = `${warningCount} warning(s) - system functional with limitations`;
  }

  return {
    healthy: allHealthy,
    items,
    summary,
  };
}

/**
 * Format health check results for display
 *
 * @param result - Health check result
 * @returns Formatted string for display
 */
export function formatHealthCheckResult(result: HealthCheckResult): string {
  const lines: string[] = [];

  for (const item of result.items) {
    const statusIcon = item.status === "ok"
      ? "[OK]"
      : item.status === "warning"
      ? "[WARN]"
      : "[ERR]";
    lines.push(`${statusIcon} ${item.name}: ${item.message}`);
    if (item.details) {
      lines.push(`     ${item.details}`);
    }
  }

  lines.push("");
  lines.push(result.summary);

  return lines.join("\n");
}
