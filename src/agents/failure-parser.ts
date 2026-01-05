/**
 * Failure Parser - Extracts structured failure information from agent output
 *
 * Parses container output, tool responses, and exceptions to build
 * detailed failure reasons for agent sandbox execution.
 */

import type {
  CompilationFailureDetails,
  ContainerFailureDetails,
  DetailedFailureReason,
  FailurePhase,
  TerminationReason,
  TestFailureDetails,
  TimeoutDetails,
} from "./types.ts";

// =============================================================================
// Parsing Patterns
// =============================================================================

/**
 * Pattern for AL compilation errors: filename(line,col): error AL####: message
 */
const AL_ERROR_PATTERN = /([^(]+)\((\d+),(\d+)\):\s*error\s+(AL\d+):\s*(.+)/g;

/**
 * Pattern for generic error lines
 */
const GENERIC_ERROR_PATTERN = /^ERROR:\s*(.+)$/gm;

/**
 * Pattern for test statistics: X/Y passed
 */
const TEST_STATS_PATTERN = /(\d+)\/(\d+)\s+(?:tests?\s+)?passed/i;

/**
 * Pattern for individual test failures from BC test runner
 */
const TEST_FAILURE_PATTERN = /Testfunction\s+(\S+)\s+Failure/g;

/**
 * Pattern for structured output format: Compile: Success/Failed
 */
const COMPILE_STATUS_PATTERN = /Compile:\s*(Success|Failed)/i;

/**
 * Pattern for structured result: Result: Pass/Fail
 */
const RESULT_PATTERN = /Result:\s*(Pass|Fail)/i;

// =============================================================================
// Compilation Error Parsing
// =============================================================================

/**
 * Parse AL compilation errors from output
 *
 * @param output - Raw compiler output or container output
 * @returns Structured compilation failure details or undefined if no errors found
 */
export function parseCompilationErrors(
  output: string,
): CompilationFailureDetails | undefined {
  const errors: CompilationFailureDetails["errors"] = [];

  // Parse standard AL error format
  let match;
  const alPattern = new RegExp(AL_ERROR_PATTERN);
  while ((match = alPattern.exec(output)) !== null) {
    const errorEntry: {
      code: string;
      message: string;
      file?: string;
      line?: number;
      column?: number;
    } = {
      code: match[4] || "AL0000",
      message: match[5] || "Unknown error",
      line: parseInt(match[2] || "0"),
      column: parseInt(match[3] || "0"),
    };
    const file = match[1]?.trim();
    if (file) {
      errorEntry.file = file;
    }
    errors.push(errorEntry);
  }

  // Parse generic ERROR: lines
  const genericPattern = new RegExp(GENERIC_ERROR_PATTERN);
  while ((match = genericPattern.exec(output)) !== null) {
    // Avoid duplicates - check if we already have this message
    const message = match[1]?.trim() || "Unknown error";
    if (!errors.some((e) => e.message === message)) {
      errors.push({
        code: "AL0000",
        message,
      });
    }
  }

  // Check for generic "App generation failed" error
  if (
    output.includes("App generation failed") &&
    !errors.some((e) => e.message.includes("App generation failed"))
  ) {
    errors.push({
      code: "AL0000",
      message: "App generation failed",
    });
  }

  if (errors.length === 0) {
    return undefined;
  }

  return {
    errors,
    rawOutput: output.length > 2000 ? output.slice(-2000) : output,
  };
}

// =============================================================================
// Test Failure Parsing
// =============================================================================

/**
 * Parse test statistics from output
 *
 * @param output - Raw container output
 * @returns Test statistics or undefined if not found
 */
export function parseTestStats(
  output: string,
): { passed: number; total: number } | undefined {
  const match = output.match(TEST_STATS_PATTERN);
  if (match) {
    return {
      passed: parseInt(match[1] || "0"),
      total: parseInt(match[2] || "0"),
    };
  }
  return undefined;
}

/**
 * Parse test failures from output
 *
 * @param output - Raw container output
 * @returns Structured test failure details or undefined if no failures found
 */
export function parseTestFailures(
  output: string,
): TestFailureDetails | undefined {
  const stats = parseTestStats(output);
  const failures: TestFailureDetails["failures"] = [];

  // Parse BC test runner failure lines
  let match;
  const failurePattern = new RegExp(TEST_FAILURE_PATTERN);
  while ((match = failurePattern.exec(output)) !== null) {
    failures.push({
      testName: match[1] || "Unknown",
      errorMessage: "Test failed",
    });
  }

  // Also look for error messages after test names
  const testErrorPattern =
    /Testfunction\s+(\S+).*?(?:Error|Exception):\s*(.+)/gi;
  while ((match = testErrorPattern.exec(output)) !== null) {
    const testName = match[1] || "Unknown";
    // Update existing failure with error message, or add new one
    const existing = failures.find((f) => f.testName === testName);
    if (existing) {
      existing.errorMessage = match[2]?.trim() || "Test failed";
    } else {
      failures.push({
        testName,
        errorMessage: match[2]?.trim() || "Test failed",
      });
    }
  }

  // If we have stats but no parsed failures, create placeholder failures
  if (stats && stats.passed < stats.total && failures.length === 0) {
    const failedCount = stats.total - stats.passed;
    for (let i = 0; i < failedCount; i++) {
      failures.push({
        testName: `Test ${i + 1}`,
        errorMessage: "Test failed (details not available)",
      });
    }
  }

  if (!stats && failures.length === 0) {
    return undefined;
  }

  return {
    totalTests: stats?.total ?? failures.length,
    passedTests: stats?.passed ?? 0,
    failedTests: stats ? (stats.total - stats.passed) : failures.length,
    failures,
    rawOutput: output.length > 2000 ? output.slice(-2000) : output,
  };
}

// =============================================================================
// Output Analysis
// =============================================================================

/**
 * Result of analyzing sandbox output
 */
export interface SandboxOutputAnalysis {
  /** Whether execution succeeded */
  success: boolean;
  /** Detected failure phase */
  failurePhase?: FailurePhase;
  /** Detected termination reason */
  terminationReason: TerminationReason;
  /** Compilation failure details */
  compilation?: CompilationFailureDetails;
  /** Test failure details */
  tests?: TestFailureDetails;
  /** Human-readable summary */
  summary: string;
}

/**
 * Analyze sandbox output to extract structured failure information
 *
 * @param stdout - Container stdout
 * @param stderr - Container stderr (optional)
 * @param exitCode - Container exit code
 * @param timedOut - Whether execution timed out
 * @returns Structured analysis of the output
 */
export function analyzeSandboxOutput(
  stdout: string,
  stderr: string = "",
  _exitCode: number = 0, // Reserved for future use (e.g., distinguishing crash vs error)
  timedOut: boolean = false,
): SandboxOutputAnalysis {
  const combinedOutput = `${stdout}\n${stderr}`;
  const outputLower = combinedOutput.toLowerCase();

  // Check for timeout first
  if (timedOut) {
    return {
      success: false,
      failurePhase: "timeout",
      terminationReason: "timeout",
      summary: "Execution timed out",
    };
  }

  // Check for structured result format
  const compileMatch = combinedOutput.match(COMPILE_STATUS_PATTERN);
  const resultMatch = combinedOutput.match(RESULT_PATTERN);
  const testStats = parseTestStats(combinedOutput);

  const compileSuccess = compileMatch
    ? compileMatch[1]?.toLowerCase() === "success"
    : !outputLower.includes("compile: failed") &&
      !outputLower.includes("compilation failed");

  const resultPass = resultMatch
    ? resultMatch[1]?.toLowerCase() === "pass"
    : false;

  // Determine success
  const testsAllPassed = testStats
    ? testStats.passed === testStats.total && testStats.total > 0
    : outputLower.includes("all tests passed") ||
      outputLower.match(/(\d+)\/\1 passed/);

  const success = compileSuccess && (resultPass || testsAllPassed === true);

  if (success) {
    return {
      success: true,
      terminationReason: "success",
      summary: testStats
        ? `All ${testStats.total} tests passed`
        : "Task completed successfully",
    };
  }

  // Analyze failure
  let failurePhase: FailurePhase = "unknown";
  let terminationReason: TerminationReason = "error";
  let summary = "Task failed";

  // Check for compilation failure
  if (!compileSuccess || outputLower.includes("compilation failed")) {
    failurePhase = "compilation";
    terminationReason = "error";
    const compilationDetails = parseCompilationErrors(combinedOutput);
    const errorCount = compilationDetails?.errors.length ?? 0;
    summary = errorCount > 0
      ? `Compilation failed with ${errorCount} error${
        errorCount > 1 ? "s" : ""
      }`
      : "Compilation failed";

    const result: SandboxOutputAnalysis = {
      success: false,
      failurePhase,
      terminationReason,
      summary,
    };
    if (compilationDetails) {
      result.compilation = compilationDetails;
    }
    return result;
  }

  // Check for test failures
  if (testStats && testStats.passed < testStats.total) {
    failurePhase = "test_execution";
    terminationReason = "test_failure";
    const failedCount = testStats.total - testStats.passed;
    summary =
      `Tests failed: ${testStats.passed}/${testStats.total} passed (${failedCount} failed)`;

    const result: SandboxOutputAnalysis = {
      success: false,
      failurePhase,
      terminationReason,
      summary,
    };
    const testDetails = parseTestFailures(combinedOutput);
    if (testDetails) {
      result.tests = testDetails;
    }
    return result;
  }

  // Check for max turns
  if (
    outputLower.includes("max turns") ||
    outputLower.includes("maximum turns")
  ) {
    failurePhase = "agent_execution";
    terminationReason = "max_turns";
    summary = "Agent reached maximum turns limit";

    return {
      success: false,
      failurePhase,
      terminationReason,
      summary,
    };
  }

  // Check for container/startup failures
  if (
    outputLower.includes("container") &&
    (outputLower.includes("failed") || outputLower.includes("error"))
  ) {
    failurePhase = "container_startup";
    summary = "Container startup or execution failed";

    return {
      success: false,
      failurePhase,
      terminationReason,
      summary,
    };
  }

  // Generic failure - try to extract any useful info
  const compilationDetails = parseCompilationErrors(combinedOutput);
  const testDetails = parseTestFailures(combinedOutput);

  if (compilationDetails) {
    failurePhase = "compilation";
    summary =
      `Compilation failed with ${compilationDetails.errors.length} error(s)`;
  } else if (testDetails) {
    failurePhase = "test_execution";
    terminationReason = "test_failure";
    summary =
      `Tests failed: ${testDetails.passedTests}/${testDetails.totalTests} passed`;
  }

  const result: SandboxOutputAnalysis = {
    success: false,
    failurePhase,
    terminationReason,
    summary,
  };
  if (compilationDetails) {
    result.compilation = compilationDetails;
  }
  if (testDetails) {
    result.tests = testDetails;
  }
  return result;
}

// =============================================================================
// Failure Reason Building
// =============================================================================

/**
 * Build a detailed failure reason from various inputs
 *
 * @param terminationReason - High-level termination reason
 * @param phase - Failure phase
 * @param summary - Human-readable summary
 * @param options - Additional failure context
 * @returns Complete DetailedFailureReason object
 */
export function buildFailureReason(
  terminationReason: TerminationReason,
  phase: FailurePhase,
  summary: string,
  options: {
    compilation?: CompilationFailureDetails;
    tests?: TestFailureDetails;
    timeout?: TimeoutDetails;
    exitCode?: number;
    errorOutput?: string;
    containerName?: string;
  } = {},
): DetailedFailureReason {
  const reason: DetailedFailureReason = {
    terminationReason,
    phase,
    summary,
    failedAt: new Date(),
  };

  if (options.compilation) {
    reason.compilation = options.compilation;
  }

  if (options.tests) {
    reason.tests = options.tests;
  }

  if (options.timeout) {
    reason.timeout = options.timeout;
  }

  if (
    options.exitCode !== undefined ||
    options.errorOutput ||
    options.containerName
  ) {
    const container: ContainerFailureDetails = {};
    if (options.exitCode !== undefined) {
      container.exitCode = options.exitCode;
    }
    if (options.errorOutput) {
      container.errorOutput = options.errorOutput;
    }
    if (options.containerName) {
      container.containerName = options.containerName;
    }
    reason.container = container;
  }

  return reason;
}

/**
 * Build failure reason from sandbox output analysis
 *
 * @param analysis - Output from analyzeSandboxOutput
 * @param options - Additional context (container name, exit code, etc.)
 * @returns DetailedFailureReason or undefined if success
 */
export function buildFailureReasonFromAnalysis(
  analysis: SandboxOutputAnalysis,
  options: {
    exitCode?: number;
    containerName?: string;
    timeoutMs?: number;
    elapsedMs?: number;
  } = {},
): DetailedFailureReason | undefined {
  if (analysis.success) {
    return undefined;
  }

  const buildOptions: {
    compilation?: CompilationFailureDetails;
    tests?: TestFailureDetails;
    exitCode?: number;
    containerName?: string;
  } = {};
  if (analysis.compilation) {
    buildOptions.compilation = analysis.compilation;
  }
  if (analysis.tests) {
    buildOptions.tests = analysis.tests;
  }
  if (options.exitCode !== undefined) {
    buildOptions.exitCode = options.exitCode;
  }
  if (options.containerName) {
    buildOptions.containerName = options.containerName;
  }

  const reason = buildFailureReason(
    analysis.terminationReason,
    analysis.failurePhase || "unknown",
    analysis.summary,
    buildOptions,
  );

  // Add timeout details if applicable
  if (
    analysis.failurePhase === "timeout" &&
    options.timeoutMs &&
    options.elapsedMs
  ) {
    reason.timeout = {
      timedOutPhase: "agent_execution",
      configuredTimeoutMs: options.timeoutMs,
      elapsedMs: options.elapsedMs,
    };
  }

  return reason;
}

/**
 * Format failure reason for display
 *
 * @param reason - DetailedFailureReason to format
 * @param verbose - Include detailed error messages
 * @returns Formatted string for CLI display
 */
export function formatFailureReason(
  reason: DetailedFailureReason,
  verbose: boolean = false,
): string {
  const lines: string[] = [];

  lines.push(`  Phase: ${reason.phase}`);
  lines.push(`  Reason: ${reason.summary}`);

  if (verbose) {
    if (reason.compilation?.errors.length) {
      lines.push("  Errors:");
      for (const err of reason.compilation.errors.slice(0, 10)) {
        const location = err.file && err.line
          ? `${err.file}(${err.line}${err.column ? `,${err.column}` : ""})`
          : "";
        lines.push(`    ${location}: ${err.code} - ${err.message}`);
      }
      if (reason.compilation.errors.length > 10) {
        lines.push(
          `    ... and ${reason.compilation.errors.length - 10} more errors`,
        );
      }
    }

    if (reason.tests?.failures.length) {
      lines.push("  Failed tests:");
      for (const fail of reason.tests.failures.slice(0, 10)) {
        lines.push(`    [FAIL] ${fail.testName}: ${fail.errorMessage}`);
      }
      if (reason.tests.failures.length > 10) {
        lines.push(
          `    ... and ${reason.tests.failures.length - 10} more failures`,
        );
      }
    }

    if (reason.timeout) {
      lines.push(
        `  Timeout: ${reason.timeout.elapsedMs}ms / ${reason.timeout.configuredTimeoutMs}ms limit`,
      );
    }

    if (reason.container?.exitCode !== undefined) {
      lines.push(`  Exit code: ${reason.container.exitCode}`);
    }
  }

  return lines.join("\n");
}
