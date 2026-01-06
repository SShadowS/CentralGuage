/**
 * Result Parsing for Agent Output
 *
 * Extracts structured compile/test results from agent tool responses
 * and formats them into standardized output.
 *
 * @module src/agents/result-parser
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Extracted compile/test results from tool response.
 * Fields are optional as not all responses contain all data.
 */
export interface PartialParsedResult {
  compileSuccess?: boolean;
  testsPassed?: number;
  testsTotal?: number;
}

// =============================================================================
// Result Extraction
// =============================================================================

/**
 * Extract structured data from a tool result string.
 * Handles both JSON responses (al_compile, al_verify_task) and text patterns.
 *
 * @param content - Raw tool output (JSON or text)
 * @returns Extracted result fields (may be empty if no patterns match)
 */
export function extractResultFromToolResult(
  content: string,
): PartialParsedResult {
  try {
    const json = JSON.parse(content);
    if (json.passed !== undefined && json.totalTests !== undefined) {
      // al_verify_task response format
      return {
        testsPassed: json.passed,
        testsTotal: json.totalTests,
      };
    }
    if (json.message?.toLowerCase().includes("compilation")) {
      // al_compile response format
      return {
        compileSuccess: json.success,
      };
    }
  } catch {
    // Not JSON, check for patterns in text
    const lower = content.toLowerCase();
    if (lower.includes("compilation successful")) {
      return { compileSuccess: true };
    }
    // Check for "all N tests passed" pattern first (extracts count)
    const allTestsMatch = content.match(/all\s+(\d+)\s+tests?\s+passed/i);
    if (allTestsMatch && allTestsMatch[1]) {
      const count = parseInt(allTestsMatch[1], 10);
      return { testsPassed: count, testsTotal: count };
    }
    // Check for "N/N passed" pattern
    const passedMatch = content.match(/(\d+)\/(\d+)\s+passed/i);
    if (passedMatch && passedMatch[1] && passedMatch[2]) {
      return {
        testsPassed: parseInt(passedMatch[1], 10),
        testsTotal: parseInt(passedMatch[2], 10),
      };
    }
  }
  return {};
}

// =============================================================================
// Result Formatting
// =============================================================================

/**
 * Format a parsed result into the standardized plain-text format.
 *
 * Output format:
 * ```
 * Compile: Success|Failed
 * Tests: N/M (if testsTotal provided)
 * Result: Pass|Fail
 * ```
 *
 * @param compileSuccess - Whether compilation succeeded
 * @param testsPassed - Number of tests passed (optional)
 * @param testsTotal - Total number of tests (optional)
 * @returns Formatted multi-line result string
 */
export function formatTaskResult(
  compileSuccess: boolean,
  testsPassed?: number,
  testsTotal?: number,
): string {
  const lines: string[] = [];
  lines.push(`Compile: ${compileSuccess ? "Success" : "Failed"}`);
  if (testsTotal !== undefined) {
    lines.push(`Tests: ${testsPassed ?? 0}/${testsTotal}`);
  }
  const pass = testsTotal !== undefined
    ? testsPassed === testsTotal
    : compileSuccess;
  lines.push(`Result: ${pass ? "Pass" : "Fail"}`);
  return lines.join("\n");
}
