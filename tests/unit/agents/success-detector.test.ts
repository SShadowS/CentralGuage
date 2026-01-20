/**
 * Tests for success-detector module
 * @module tests/unit/agents/success-detector
 */

import { assertEquals } from "@std/assert";
import {
  detectCompileOnlySuccess,
  detectStructuredResult,
  detectSuccess,
  detectTestSuccess,
  hasCompileSuccess,
} from "../../../src/agents/success-detector.ts";

Deno.test("hasCompileSuccess", async (t) => {
  await t.step("detects 'compilation successful'", () => {
    assertEquals(hasCompileSuccess("Compilation successful"), true);
  });

  await t.step("detects 'compilation: success'", () => {
    assertEquals(hasCompileSuccess("Compilation: success"), true);
  });

  await t.step("detects markdown format 'compilation: **success**'", () => {
    assertEquals(hasCompileSuccess("Compilation: **success**"), true);
  });

  await t.step("detects emoji format '✅ compilation'", () => {
    assertEquals(hasCompileSuccess("✅ compilation"), true);
  });

  await t.step("detects JSON format '\"success\":true'", () => {
    assertEquals(hasCompileSuccess('{"success":true}'), true);
  });

  await t.step("detects JSON format with space '\"success\": true'", () => {
    assertEquals(hasCompileSuccess('{"success": true}'), true);
  });

  await t.step("detects 'success: true' pattern", () => {
    assertEquals(hasCompileSuccess("al_compile returning success: true"), true);
  });

  await t.step("returns false for failed compilation", () => {
    assertEquals(hasCompileSuccess("Compilation failed"), false);
  });

  await t.step("returns false for empty string", () => {
    assertEquals(hasCompileSuccess(""), false);
  });

  await t.step("is case insensitive", () => {
    assertEquals(hasCompileSuccess("COMPILATION SUCCESSFUL"), true);
  });
});

Deno.test("detectStructuredResult", async (t) => {
  await t.step("detects 'Result: Pass'", () => {
    assertEquals(detectStructuredResult("Result: Pass"), true);
  });

  await t.step("detects 'Result: Fail'", () => {
    assertEquals(detectStructuredResult("Result: Fail"), false);
  });

  await t.step("handles case insensitivity", () => {
    assertEquals(detectStructuredResult("result: PASS"), true);
    assertEquals(detectStructuredResult("RESULT: fail"), false);
  });

  await t.step("returns null when no structured result", () => {
    assertEquals(detectStructuredResult("Some other output"), null);
  });

  await t.step("handles full format with compile and tests", () => {
    const output = "Compile: Success\nTests: 7/7\nResult: Pass";
    assertEquals(detectStructuredResult(output), true);
  });
});

Deno.test("detectTestSuccess", async (t) => {
  await t.step("detects 'all tests passed'", () => {
    assertEquals(detectTestSuccess("All tests passed"), true);
  });

  await t.step("detects 'tests passed!'", () => {
    assertEquals(detectTestSuccess("Tests passed!"), true);
  });

  await t.step("detects 'N tests passed'", () => {
    assertEquals(detectTestSuccess("7 tests passed"), true);
  });

  await t.step("detects '7/7 passed' (matching numbers)", () => {
    assertEquals(detectTestSuccess("7/7 passed"), true);
  });

  await t.step("rejects '3/7 passed' (non-matching numbers)", () => {
    // The regex /(\d+)\/\1 passed/ only matches when both numbers are the same
    assertEquals(detectTestSuccess("3/7 passed"), false);
  });

  await t.step("detects 'all 7 tests passed'", () => {
    assertEquals(detectTestSuccess("All 7 tests passed"), true);
  });

  await t.step("detects 'all 6 verification tests passed'", () => {
    assertEquals(detectTestSuccess("All 6 verification tests passed"), true);
  });

  await t.step("detects 'task completed successfully'", () => {
    assertEquals(detectTestSuccess("Task completed successfully"), true);
  });

  await t.step("detects 'task is now complete'", () => {
    assertEquals(detectTestSuccess("Task is now complete"), true);
  });

  await t.step("detects 'ran successfully (0 failures)'", () => {
    assertEquals(detectTestSuccess("Ran successfully (0 failures)"), true);
  });

  await t.step("detects compile success without failures", () => {
    assertEquals(detectTestSuccess("Compilation successful"), true);
  });

  await t.step("rejects compile success with failures", () => {
    assertEquals(
      detectTestSuccess("Compilation successful but tests failed"),
      false,
    );
  });

  await t.step("returns false for failed tests", () => {
    assertEquals(detectTestSuccess("Tests failed: 3/7"), false);
  });
});

Deno.test("detectCompileOnlySuccess", async (t) => {
  await t.step("detects compile success patterns", () => {
    assertEquals(detectCompileOnlySuccess("Compilation successful"), true);
  });

  await t.step("detects 'task completed successfully'", () => {
    assertEquals(detectCompileOnlySuccess("Task completed successfully"), true);
  });

  await t.step("detects 'task is now complete'", () => {
    assertEquals(detectCompileOnlySuccess("Task is now complete"), true);
  });

  await t.step("returns false for failed output", () => {
    assertEquals(detectCompileOnlySuccess("Compilation failed"), false);
  });
});

Deno.test("detectSuccess (unified)", async (t) => {
  await t.step("uses structured result when available (test task)", () => {
    const result = detectSuccess("Result: Pass", true);
    assertEquals(result.success, true);
    assertEquals(result.detectionMethod, "structured_result");
  });

  await t.step("uses structured result when available (compile task)", () => {
    const result = detectSuccess("Result: Fail", false);
    assertEquals(result.success, false);
    assertEquals(result.detectionMethod, "structured_result");
  });

  await t.step("falls back to test patterns when requiresTests=true", () => {
    const result = detectSuccess("All tests passed", true);
    assertEquals(result.success, true);
    assertEquals(result.detectionMethod, "test_patterns");
  });

  await t.step(
    "falls back to compile patterns when requiresTests=false",
    () => {
      const result = detectSuccess("Compilation successful", false);
      assertEquals(result.success, true);
      assertEquals(result.detectionMethod, "compile_patterns");
    },
  );

  await t.step("returns none when no patterns match", () => {
    const result = detectSuccess("Some random output", true);
    assertEquals(result.success, false);
    assertEquals(result.detectionMethod, "none");
  });

  await t.step("includes compileSuccess in result", () => {
    const result = detectSuccess(
      "Compilation successful\nAll tests passed",
      true,
    );
    assertEquals(result.compileSuccess, true);
  });

  await t.step("handles real-world test output", () => {
    const output = `
      [Task] Running verification...
      Compilation: **SUCCESS**
      Running tests...
      7/7 passed
      Result: Pass
    `;
    const result = detectSuccess(output, true);
    assertEquals(result.success, true);
  });

  await t.step("handles compile-only real output", () => {
    const output = `
      Writing App.al...
      {"success": true, "artifactPath": "output.app"}
      Task completed successfully
    `;
    const result = detectSuccess(output, false);
    assertEquals(result.success, true);
  });
});
