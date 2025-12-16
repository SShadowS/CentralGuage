/**
 * Pure parsing functions for DockerContainerProvider output
 *
 * These functions are extracted to enable unit testing without
 * actual Docker execution or container interaction.
 */

import type {
  CompilationError,
  CompilationWarning,
  ContainerStatus,
  TestCaseResult,
} from "./types.ts";

/**
 * Parse Docker inspect output in the format:
 * "Running|HealthStatus|Image|StartedAt"
 *
 * @param output - Raw docker inspect --format output
 * @returns Parsed status data
 */
export interface DockerInspectData {
  running: string;
  health: string;
  image: string;
  startedAt: string;
}

export function parseDockerInspect(output: string): DockerInspectData {
  const parts = output.trim().split("|");
  return {
    running: parts[0] || "",
    health: parts[1] || "",
    image: parts[2] || "",
    startedAt: parts[3] || "",
  };
}

/**
 * Extract BC version from Docker image name
 *
 * @param image - Docker image name (e.g., "mcr.microsoft.com/businesscentral:24.0")
 * @returns BC version string or undefined
 *
 * @example
 * ```
 * extractBcVersionFromImage("mcr.microsoft.com/businesscentral:24.0");
 * // "24.0"
 * ```
 */
export function extractBcVersionFromImage(image: string): string | undefined {
  const match = image.match(/businesscentral:(\d+\.\d+)/);
  return match ? match[1] : undefined;
}

/**
 * Map Docker health status to ContainerStatus health type
 *
 * @param health - Raw health status from docker inspect
 * @param isRunning - Whether container is running
 * @returns Normalized health status
 */
export function mapDockerHealthStatus(
  health: string,
  isRunning: boolean,
): ContainerStatus["health"] {
  const healthMap: Record<string, ContainerStatus["health"]> = {
    "healthy": "healthy",
    "unhealthy": "unhealthy",
    "starting": "starting",
    "none": isRunning ? "healthy" : "stopped",
  };
  return healthMap[health || "none"] || "stopped";
}

/**
 * Calculate container uptime from startedAt timestamp
 *
 * @param startedAt - ISO timestamp string from docker inspect
 * @param isRunning - Whether container is running
 * @returns Uptime in seconds, or 0 if not running
 */
export function calculateUptime(
  startedAt: string,
  isRunning: boolean,
): number {
  if (!isRunning || !startedAt) return 0;
  try {
    const startTime = new Date(startedAt);
    const uptime = Math.floor((Date.now() - startTime.getTime()) / 1000);
    // new Date() returns NaN for invalid dates
    return Number.isNaN(uptime) ? 0 : uptime;
  } catch {
    return 0;
  }
}

/**
 * Parse AL compiler error output (same format as bccontainerhelper)
 *
 * @param output - Raw compiler output
 * @returns Array of parsed compilation errors
 */
export function parseDockerCompilationErrors(
  output: string,
): CompilationError[] {
  const errors: CompilationError[] = [];
  const lines = output.split("\n");

  for (const line of lines) {
    const errorMatch = line.match(
      /([^(]+)\((\d+),(\d+)\):\s*error\s+(AL\d+):\s*(.+)/,
    );
    if (errorMatch) {
      errors.push({
        file: errorMatch[1] || "unknown",
        line: parseInt(errorMatch[2] || "0"),
        column: parseInt(errorMatch[3] || "0"),
        code: errorMatch[4] || "AL0000",
        message: errorMatch[5] || "",
        severity: "error",
      });
    }
  }

  return errors;
}

/**
 * Parse AL compiler warning output (same format as bccontainerhelper)
 *
 * @param output - Raw compiler output
 * @returns Array of parsed compilation warnings
 */
export function parseDockerCompilationWarnings(
  output: string,
): CompilationWarning[] {
  const warnings: CompilationWarning[] = [];
  const lines = output.split("\n");

  for (const line of lines) {
    const warningMatch = line.match(
      /([^(]+)\((\d+),(\d+)\):\s*warning\s+(AL\d+):\s*(.+)/,
    );
    if (warningMatch) {
      warnings.push({
        file: warningMatch[1] || "unknown",
        line: parseInt(warningMatch[2] || "0"),
        column: parseInt(warningMatch[3] || "0"),
        code: warningMatch[4] || "AL0000",
        message: warningMatch[5] || "",
        severity: "warning",
      });
    }
  }

  return warnings;
}

/**
 * Check if compilation was successful based on output markers
 *
 * @param output - Raw compiler output
 * @param errorCount - Number of errors found
 * @returns true if compilation succeeded
 */
export function isDockerCompilationSuccessful(
  output: string,
  errorCount: number,
): boolean {
  return errorCount === 0 && !output.includes("COMPILE_FAILED");
}

/**
 * Parse Docker test output in AL test format
 *
 * Format: "Test TestName passed in 123ms" or "Test TestName failed in 123ms: error message"
 *
 * @param output - Raw test output
 * @returns Array of parsed test case results
 */
export function parseDockerTestResults(output: string): TestCaseResult[] {
  const results: TestCaseResult[] = [];
  const lines = output.split("\n");

  for (const line of lines) {
    const passMatch = line.match(
      /Test\s+(\w+)\s+passed(?:\s+in\s+(\d+)ms)?/,
    );
    const failMatch = line.match(
      /Test\s+(\w+)\s+failed(?:\s+in\s+(\d+)ms)?:\s*(.+)/,
    );

    if (passMatch) {
      results.push({
        name: passMatch[1] || "unknown",
        passed: true,
        duration: parseInt(passMatch[2] || "0"),
      });
    } else if (failMatch) {
      const testCase: TestCaseResult = {
        name: failMatch[1] || "unknown",
        passed: false,
        duration: parseInt(failMatch[2] || "0"),
      };
      if (failMatch[3]) {
        testCase.error = failMatch[3];
      }
      results.push(testCase);
    }
  }

  return results;
}

/**
 * Calculate test success metrics from parsed results
 *
 * @param results - Array of test case results
 * @returns Object with totalTests, passedTests, failedTests, success
 */
export function calculateDockerTestMetrics(results: TestCaseResult[]): {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  success: boolean;
} {
  const totalTests = results.length;
  const passedTests = results.filter((r) => r.passed).length;
  const failedTests = totalTests - passedTests;
  const success = failedTests === 0;

  return { totalTests, passedTests, failedTests, success };
}

/**
 * Check if container is ready based on log output
 *
 * @param logOutput - Docker logs output
 * @returns true if container is ready
 */
export function isContainerReady(logOutput: string): boolean {
  return logOutput.includes("Ready for connections!") ||
    logOutput.includes("Container is ready");
}
