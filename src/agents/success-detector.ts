/**
 * Success Detection for Agent Output
 *
 * Consolidates all success pattern detection logic for sandbox/agent output.
 * Used to determine if an agent completed a task successfully based on its output.
 *
 * @module src/agents/success-detector
 */

// =============================================================================
// Compile Success Detection
// =============================================================================

/**
 * Checks for common compile success patterns.
 * Used in both test tasks and compile-only task detection.
 */
export function hasCompileSuccess(output: string): boolean {
  const outputLower = output.toLowerCase();
  return (
    outputLower.includes("compilation successful") ||
    outputLower.includes("compilation: success") ||
    outputLower.includes("compilation: **success**") ||
    outputLower.includes("compilation status**: ✅") ||
    outputLower.includes("✅ compilation") ||
    outputLower.includes("✅ success") ||
    // JSON patterns from al_compile tool response
    outputLower.includes('"success":true') ||
    outputLower.includes('"success": true') ||
    // Agent summary patterns like "al_compile returning success: true"
    outputLower.includes("success: true") ||
    outputLower.includes("returning success: true")
  );
}

// =============================================================================
// Structured Result Detection
// =============================================================================

/**
 * Check for structured output format "Result: Pass" or "Result: Fail".
 * This is the most reliable format and takes highest priority.
 *
 * @returns true if Pass, false if Fail, null if no structured result found
 */
export function detectStructuredResult(output: string): boolean | null {
  const match = output.match(/Result:\s*(Pass|Fail)/i);
  if (match && match[1]) {
    return match[1].toLowerCase() === "pass";
  }
  return null;
}

// =============================================================================
// Test Task Success Detection
// =============================================================================

/**
 * Detects success for tasks that require tests to pass.
 * Checks for various test success patterns in the output.
 */
export function detectTestSuccess(output: string): boolean {
  const outputLower = output.toLowerCase();

  // Check for various success patterns
  // Must verify ALL tests passed, not partial passes like "1/7 passed"
  const allPassedMatch = outputLower.match(/(\d+)\/\1 passed/); // "7/7 passed" (same number)
  const allTestsPassedPattern = /all \d+ (?:verification )?tests passed/; // "all 7 tests passed"

  return (
    outputLower.includes("all tests passed") ||
    outputLower.includes("tests passed!") ||
    /\d+ tests passed/.test(outputLower) || // "6 tests passed"
    allPassedMatch !== null || // "7/7 passed" where both numbers match
    allTestsPassedPattern.test(outputLower) ||
    outputLower.includes("task completed successfully") ||
    outputLower.includes("task is now complete") ||
    // Test verification patterns
    outputLower.includes("ran successfully (0 failures)") ||
    outputLower.includes("verification: completed") ||
    // If compilation succeeded AND no test failures mentioned, consider it success
    (hasCompileSuccess(output) && !outputLower.includes("failed"))
  );
}

// =============================================================================
// Compile-Only Task Success Detection
// =============================================================================

/**
 * Detects success for compile-only tasks (no tests required).
 */
export function detectCompileOnlySuccess(output: string): boolean {
  const outputLower = output.toLowerCase();

  return (
    hasCompileSuccess(output) ||
    outputLower.includes("task completed successfully") ||
    outputLower.includes("task is now complete")
  );
}

// =============================================================================
// Unified Success Detection
// =============================================================================

/**
 * Result of success detection with details about what was found.
 */
export interface SuccessDetectionResult {
  /** Whether the task was successful */
  success: boolean;
  /** How success was determined */
  detectionMethod:
    | "structured_result"
    | "test_patterns"
    | "compile_patterns"
    | "none";
  /** Whether compilation was successful (if determinable) */
  compileSuccess?: boolean;
}

/**
 * Unified success detection that handles both test and compile-only tasks.
 * Checks in order of reliability:
 * 1. Structured result format (most reliable)
 * 2. Test success patterns (if requiresTests)
 * 3. Compile success patterns (for compile-only tasks)
 *
 * @param output - Combined stdout/stderr output from agent
 * @param requiresTests - Whether the task requires tests to pass
 */
export function detectSuccess(
  output: string,
  requiresTests: boolean,
): SuccessDetectionResult {
  // Check structured result first (highest priority)
  const structuredResult = detectStructuredResult(output);
  if (structuredResult !== null) {
    return {
      success: structuredResult,
      detectionMethod: "structured_result",
      compileSuccess: hasCompileSuccess(output),
    };
  }

  // Check for task type specific patterns
  if (requiresTests) {
    const success = detectTestSuccess(output);
    return {
      success,
      detectionMethod: success ? "test_patterns" : "none",
      compileSuccess: hasCompileSuccess(output),
    };
  } else {
    const success = detectCompileOnlySuccess(output);
    return {
      success,
      detectionMethod: success ? "compile_patterns" : "none",
      compileSuccess: success,
    };
  }
}
