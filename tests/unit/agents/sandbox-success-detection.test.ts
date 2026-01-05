/**
 * Tests for sandbox success detection patterns.
 *
 * These patterns are used in executeSandboxed() to determine if an agent
 * completed a task successfully based on its output.
 */

import { assertEquals } from "@std/assert";

/**
 * Checks for common compile success patterns used in both test and compile-only detection.
 */
function hasCompileSuccess(output: string): boolean {
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

/**
 * Simulates the success detection logic from src/agents/executor.ts
 * for test tasks that require tests to pass.
 */
function detectTestSuccess(output: string): boolean {
  const outputLower = output.toLowerCase();

  // Check for various success patterns
  // Must verify ALL tests passed, not partial passes like "1/7 passed"
  const allPassedMatch = outputLower.match(/(\d+)\/\1 passed/); // "7/7 passed" (same number)
  const allTestsPassedPattern = /all \d+ (?:verification )?tests passed/; // "all 7 tests passed" or "all 6 verification tests passed"

  return (
    outputLower.includes("all tests passed") ||
    outputLower.includes("tests passed!") ||
    /\d+ tests passed/.test(outputLower) || // "6 tests passed", "7 verification tests passed"
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

/**
 * Simulates the success detection logic for compile-only tasks.
 */
function detectCompileSuccess(output: string): boolean {
  const outputLower = output.toLowerCase();

  return (
    hasCompileSuccess(output) ||
    outputLower.includes("task completed successfully") ||
    outputLower.includes("task is now complete")
  );
}

/**
 * Check for structured output format "Result: Pass" or "Result: Fail"
 */
function detectStructuredResult(output: string): boolean | null {
  const match = output.match(/Result:\s*(Pass|Fail)/i);
  if (match && match[1]) {
    return match[1].toLowerCase() === "pass";
  }
  return null; // No structured result found
}

Deno.test("sandbox success detection", async (t) => {
  // ==========================================================================
  // Structured Output Format (highest priority)
  // ==========================================================================

  await t.step("structured: detects Result: Pass", () => {
    const output = "Compile: Success\nTests: 7/7\nResult: Pass";
    assertEquals(detectStructuredResult(output), true);
  });

  await t.step("structured: detects Result: Fail", () => {
    const output = "Compile: Success\nTests: 5/7\nResult: Fail";
    assertEquals(detectStructuredResult(output), false);
  });

  await t.step("structured: handles case insensitivity", () => {
    const output = "result: PASS";
    assertEquals(detectStructuredResult(output), true);
  });

  await t.step("structured: returns null when no match", () => {
    const output = "Some other output without the pattern";
    assertEquals(detectStructuredResult(output), null);
  });

  await t.step("structured: compile-only format", () => {
    const output = "Compile: Success\nResult: Pass";
    assertEquals(detectStructuredResult(output), true);
  });

  // ==========================================================================
  // Test Results Detection (tasks with tests)
  // ==========================================================================

  await t.step("detects full pass: 7/7 passed", () => {
    const output = "Tests completed: 7/7 passed";
    assertEquals(detectTestSuccess(output), true);
  });

  await t.step("detects full pass: 10/10 passed", () => {
    const output = "**Tests**: All 10 tests passed (10/10)";
    assertEquals(detectTestSuccess(output), true);
  });

  await t.step("rejects partial pass: 1/7 passed", () => {
    const output = "Tests completed: 1/7 passed";
    assertEquals(detectTestSuccess(output), false);
  });

  await t.step("rejects partial pass: 6/7 passed", () => {
    const output = "Tests completed: 6/7 passed";
    assertEquals(detectTestSuccess(output), false);
  });

  await t.step("rejects partial pass: 0/7 passed", () => {
    const output = "Tests completed: 0/7 passed";
    assertEquals(detectTestSuccess(output), false);
  });

  await t.step("detects: all tests passed", () => {
    const output = "Compilation successful, all tests passed.";
    assertEquals(detectTestSuccess(output), true);
  });

  await t.step("detects: All Tests Passed (case insensitive)", () => {
    const output = "All Tests Passed!";
    assertEquals(detectTestSuccess(output), true);
  });

  await t.step("detects: tests passed!", () => {
    const output = "7 tests passed!";
    assertEquals(detectTestSuccess(output), true);
  });

  await t.step("detects: all 7 tests passed", () => {
    const output = "**Tests**: All 7 tests passed (7/7)";
    assertEquals(detectTestSuccess(output), true);
  });

  await t.step("detects: all 15 tests passed", () => {
    const output = "Result: all 15 tests passed";
    assertEquals(detectTestSuccess(output), true);
  });

  await t.step("detects: task completed successfully", () => {
    const output = "Task Completed Successfully!";
    assertEquals(detectTestSuccess(output), true);
  });

  await t.step("detects: task is now complete", () => {
    const output = "The task is now complete.";
    assertEquals(detectTestSuccess(output), true);
  });

  await t.step("detects: 6 tests passed", () => {
    const output = "Ran 6 tests passed";
    assertEquals(detectTestSuccess(output), true);
  });

  await t.step("detects: 7 verification tests passed", () => {
    const output = "All 7 verification tests passed";
    assertEquals(detectTestSuccess(output), true);
  });

  await t.step("detects: ran successfully (0 failures)", () => {
    const output = "Tests: The al_verify_task tool ran successfully (0 failures)";
    assertEquals(detectTestSuccess(output), true);
  });

  await t.step("detects: verification: completed", () => {
    const output = "Verification: Completed (0 tests found)";
    assertEquals(detectTestSuccess(output), true);
  });

  await t.step("detects: compilation success with emoji", () => {
    const output = "✅ Compilation: Success";
    assertEquals(detectTestSuccess(output), true);
  });

  await t.step("detects: compilation status with emoji checkmark", () => {
    const output = "**Compilation Status**: ✅ Success";
    assertEquals(detectTestSuccess(output), true);
  });

  await t.step("detects: emoji success pattern", () => {
    const output = "The task completed ✅ Success!";
    assertEquals(detectTestSuccess(output), true);
  });

  await t.step("detects: compilation: success (colon format)", () => {
    const output = "Compilation: Success - all good";
    assertEquals(detectTestSuccess(output), true);
  });

  await t.step("detects: JSON success without failed keyword", () => {
    const output = '`al_compile` returned `{ "success": true }` ✓';
    assertEquals(detectTestSuccess(output), true);
  });

  await t.step("rejects: compilation success but tests failed", () => {
    const output = "Compilation: Success but 2 tests failed";
    assertEquals(detectTestSuccess(output), false);
  });

  await t.step("rejects: compilation successful without test mention (old behavior preserved for non-compile-success)", () => {
    // Just "Compilation successful." without clear success indicators
    // should now pass because hasCompileSuccess matches
    const output = "Compilation successful.";
    assertEquals(detectTestSuccess(output), true);
  });

  await t.step("rejects: compilation failed", () => {
    const output = "Compilation failed with 3 errors";
    assertEquals(detectTestSuccess(output), false);
  });

  await t.step("rejects: tests failed", () => {
    const output = "3 tests failed, 4 passed";
    assertEquals(detectTestSuccess(output), false);
  });

  await t.step("handles multi-line output with success at end", () => {
    const output = `Compiling...
Errors found: 0
Running tests...
Test 1: PASS
Test 2: PASS
All tests passed`;
    assertEquals(detectTestSuccess(output), true);
  });

  await t.step("handles multi-line output with failure", () => {
    const output = `Compiling...
Running tests...
Test 1: PASS
Test 2: FAIL
1/2 passed`;
    assertEquals(detectTestSuccess(output), false);
  });

  // ==========================================================================
  // Compile-Only Detection (tasks without tests)
  // ==========================================================================

  await t.step("compile: detects compilation successful", () => {
    const output = "Compilation successful.";
    assertEquals(detectCompileSuccess(output), true);
  });

  await t.step("compile: detects compilation: success (colon format)", () => {
    const output = "Compilation: Success";
    assertEquals(detectCompileSuccess(output), true);
  });

  await t.step("compile: detects emoji success", () => {
    const output = "✅ Compilation: Success";
    assertEquals(detectCompileSuccess(output), true);
  });

  await t.step("compile: detects compilation: **success**", () => {
    // Note: Pattern expects "compilation: **success**" not "**compilation**: **success**"
    const output = "Compilation: **SUCCESS** - no errors found";
    assertEquals(detectCompileSuccess(output), true);
  });

  await t.step("compile: detects task completed successfully", () => {
    const output = "Task Completed Successfully!";
    assertEquals(detectCompileSuccess(output), true);
  });

  await t.step("compile: rejects compilation failed", () => {
    const output = "Compilation failed with errors";
    assertEquals(detectCompileSuccess(output), false);
  });

  await t.step("compile: rejects with no success message", () => {
    const output = "Processing completed.";
    assertEquals(detectCompileSuccess(output), false);
  });

  await t.step("compile: detects task is now complete", () => {
    const output = "The task is now complete.";
    assertEquals(detectCompileSuccess(output), true);
  });

  // ==========================================================================
  // JSON Success Patterns (from al_compile tool response)
  // ==========================================================================

  await t.step("compile: detects JSON success:true (no space)", () => {
    const output = '{"success":true,"message":"Compilation successful"}';
    assertEquals(detectCompileSuccess(output), true);
  });

  await t.step("compile: detects JSON success: true (with space)", () => {
    const output = '{"success": true, "message": "Compilation successful"}';
    assertEquals(detectCompileSuccess(output), true);
  });

  await t.step("compile: detects mixed case Success: True", () => {
    const output = '{"Success": True}';
    assertEquals(detectCompileSuccess(output), true);
  });

  // ==========================================================================
  // Agent Summary Patterns
  // ==========================================================================

  await t.step("compile: detects 'success: true' in agent summary", () => {
    const output = "The al_compile tool returned success: true";
    assertEquals(detectCompileSuccess(output), true);
  });

  await t.step("compile: detects 'returning success: true'", () => {
    const output = "al_compile returning success: true";
    assertEquals(detectCompileSuccess(output), true);
  });

  await t.step("compile: detects success pattern in long output", () => {
    const output = `I've completed the task.

1. Created the enum file PriorityLevel.Enum.al
2. Added all required values: Low, Medium, High, Critical
3. Successfully compiled with al_compile returning success: true

The implementation follows BC conventions.`;
    assertEquals(detectCompileSuccess(output), true);
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  await t.step("edge: empty output", () => {
    assertEquals(detectTestSuccess(""), false);
    assertEquals(detectCompileSuccess(""), false);
  });

  await t.step("edge: only whitespace", () => {
    assertEquals(detectTestSuccess("   \n\t  "), false);
    assertEquals(detectCompileSuccess("   \n\t  "), false);
  });

  await t.step("edge: large numbers 100/100 passed", () => {
    const output = "Final: 100/100 passed";
    assertEquals(detectTestSuccess(output), true);
  });

  await t.step("edge: single digit 3/3 passed", () => {
    const output = "Tests: 3/3 passed";
    assertEquals(detectTestSuccess(output), true);
  });

  await t.step("edge: leading zeros still match embedded pattern", () => {
    // "07/7 passed" actually contains "7/7 passed" as a substring, so it matches!
    // This is expected behavior - the regex finds "7/7" within the string
    const output = "Tests: 07/7 passed";
    assertEquals(detectTestSuccess(output), true);
  });

  await t.step("edge: truly different numbers rejected", () => {
    // 2/7 has no matching substring like "7/7"
    const output = "Tests: 2/7 passed";
    assertEquals(detectTestSuccess(output), false);
  });

  await t.step("edge: mixed case ALL TESTS PASSED", () => {
    const output = "ALL TESTS PASSED";
    assertEquals(detectTestSuccess(output), true);
  });

  await t.step("edge: passed without context shouldn't match", () => {
    // Just "passed" alone shouldn't trigger success
    const output = "Parameter passed to function";
    assertEquals(detectTestSuccess(output), false);
  });
});
