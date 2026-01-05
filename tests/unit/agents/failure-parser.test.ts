/**
 * Unit tests for failure-parser.ts
 *
 * Tests parsing of AL compilation errors, test failures, and sandbox output analysis.
 */

import { assertEquals, assertExists } from "@std/assert";
import {
  analyzeSandboxOutput,
  buildFailureReason,
  buildFailureReasonFromAnalysis,
  formatFailureReason,
  parseCompilationErrors,
  parseTestFailures,
  parseTestStats,
} from "../../../src/agents/failure-parser.ts";

Deno.test("parseCompilationErrors", async (t) => {
  await t.step("parses standard AL error format", () => {
    const output =
      `Solution.al(10,5): error AL0001: The identifier 'Foo' is not valid
Solution.al(15,1): error AL0118: The function is missing a return value`;

    const result = parseCompilationErrors(output);

    assertExists(result);
    assertEquals(result.errors.length, 2);
    const err0 = result.errors[0]!;
    const err1 = result.errors[1]!;
    assertEquals(err0.code, "AL0001");
    assertEquals(err0.message, "The identifier 'Foo' is not valid");
    assertEquals(err0.file, "Solution.al");
    assertEquals(err0.line, 10);
    assertEquals(err0.column, 5);
    assertEquals(err1.code, "AL0118");
    assertEquals(err1.line, 15);
  });

  await t.step("parses generic ERROR: lines", () => {
    const output = `ERROR: App generation failed
ERROR: Something went wrong`;

    const result = parseCompilationErrors(output);

    assertExists(result);
    assertEquals(result.errors.length, 2);
    assertEquals(result.errors[0]!.message, "App generation failed");
    assertEquals(result.errors[1]!.message, "Something went wrong");
  });

  await t.step("detects 'App generation failed' pattern", () => {
    const output =
      "Build output: App generation failed due to compilation errors";

    const result = parseCompilationErrors(output);

    assertExists(result);
    assertEquals(result.errors.length, 1);
    assertEquals(result.errors[0]!.message, "App generation failed");
  });

  await t.step("returns undefined when no errors found", () => {
    const output = "Compilation successful. No errors.";

    const result = parseCompilationErrors(output);

    assertEquals(result, undefined);
  });

  await t.step("truncates raw output to 2000 chars", () => {
    const longOutput = "X".repeat(3000);
    const errorLine = "Solution.al(1,1): error AL0001: Test error\n";

    const result = parseCompilationErrors(errorLine + longOutput);

    assertExists(result);
    assertExists(result.rawOutput);
    assertEquals(result.rawOutput.length, 2000);
  });
});

Deno.test("parseTestStats", async (t) => {
  await t.step("parses 'X/Y passed' format", () => {
    const output = "Test run complete. 5/7 passed";

    const result = parseTestStats(output);

    assertExists(result);
    assertEquals(result.passed, 5);
    assertEquals(result.total, 7);
  });

  await t.step("parses 'X/Y tests passed' format", () => {
    const output = "3/10 tests passed";

    const result = parseTestStats(output);

    assertExists(result);
    assertEquals(result.passed, 3);
    assertEquals(result.total, 10);
  });

  await t.step("returns undefined when no stats found", () => {
    const output = "All tests passed!";

    const result = parseTestStats(output);

    assertEquals(result, undefined);
  });
});

Deno.test("parseTestFailures", async (t) => {
  await t.step("parses test failure patterns", () => {
    const output = `Running tests...
Testfunction TestAdd Failure
Testfunction TestSubtract Failure
1/3 passed`;

    const result = parseTestFailures(output);

    assertExists(result);
    assertEquals(result.totalTests, 3);
    assertEquals(result.passedTests, 1);
    assertEquals(result.failedTests, 2);
    assertEquals(result.failures.length, 2);
    assertEquals(result.failures[0]!.testName, "TestAdd");
    assertEquals(result.failures[1]!.testName, "TestSubtract");
  });

  await t.step(
    "creates placeholder failures when stats exist but no names",
    () => {
      const output = "2/5 passed";

      const result = parseTestFailures(output);

      assertExists(result);
      assertEquals(result.totalTests, 5);
      assertEquals(result.passedTests, 2);
      assertEquals(result.failedTests, 3);
      assertEquals(result.failures.length, 3);
    },
  );

  await t.step("returns undefined when no failures found", () => {
    const output = "Success!";

    const result = parseTestFailures(output);

    assertEquals(result, undefined);
  });
});

Deno.test("analyzeSandboxOutput", async (t) => {
  await t.step("detects timeout", () => {
    const result = analyzeSandboxOutput("partial output", "", 0, true);

    assertEquals(result.success, false);
    assertEquals(result.failurePhase, "timeout");
    assertEquals(result.terminationReason, "timeout");
    assertEquals(result.summary, "Execution timed out");
  });

  await t.step("detects successful completion with all tests passed", () => {
    const output = `Compile: Success
Tests: 7/7 passed
Result: Pass`;

    const result = analyzeSandboxOutput(output);

    assertEquals(result.success, true);
    assertEquals(result.terminationReason, "success");
    assertEquals(result.summary, "All 7 tests passed");
  });

  await t.step("detects compilation failure", () => {
    const output = `Compile: Failed
Solution.al(10,5): error AL0001: Unknown identifier`;

    const result = analyzeSandboxOutput(output);

    assertEquals(result.success, false);
    assertEquals(result.failurePhase, "compilation");
    assertEquals(result.terminationReason, "error");
    assertExists(result.compilation);
    assertEquals(result.compilation.errors.length, 1);
  });

  await t.step("detects test failure", () => {
    const output = `Compile: Success
Tests: 2/5 passed
Result: Fail`;

    const result = analyzeSandboxOutput(output);

    assertEquals(result.success, false);
    assertEquals(result.failurePhase, "test_execution");
    assertEquals(result.terminationReason, "test_failure");
    assertEquals(result.summary, "Tests failed: 2/5 passed (3 failed)");
  });

  await t.step("detects max turns limit", () => {
    const output = "Agent reached maximum turns limit. Stopping.";

    const result = analyzeSandboxOutput(output);

    assertEquals(result.success, false);
    assertEquals(result.failurePhase, "agent_execution");
    assertEquals(result.terminationReason, "max_turns");
  });

  await t.step("detects container startup failure", () => {
    const output = "Container failed to start: timeout";

    const result = analyzeSandboxOutput(output);

    assertEquals(result.success, false);
    assertEquals(result.failurePhase, "container_startup");
  });
});

Deno.test("buildFailureReason", async (t) => {
  await t.step("creates basic failure reason", () => {
    const reason = buildFailureReason(
      "error",
      "compilation",
      "Compilation failed with 2 errors",
    );

    assertEquals(reason.terminationReason, "error");
    assertEquals(reason.phase, "compilation");
    assertEquals(reason.summary, "Compilation failed with 2 errors");
    assertExists(reason.failedAt);
  });

  await t.step("includes compilation details when provided", () => {
    const reason = buildFailureReason(
      "error",
      "compilation",
      "Compilation failed",
      {
        compilation: {
          errors: [{ code: "AL0001", message: "Test error" }],
        },
      },
    );

    assertExists(reason.compilation);
    assertEquals(reason.compilation.errors.length, 1);
  });

  await t.step("includes container details when provided", () => {
    const reason = buildFailureReason(
      "error",
      "agent_execution",
      "Execution failed",
      {
        exitCode: 1,
        containerName: "test-container",
        errorOutput: "Some error",
      },
    );

    assertExists(reason.container);
    assertEquals(reason.container.exitCode, 1);
    assertEquals(reason.container.containerName, "test-container");
    assertEquals(reason.container.errorOutput, "Some error");
  });
});

Deno.test("buildFailureReasonFromAnalysis", async (t) => {
  await t.step("returns undefined for successful analysis", () => {
    const analysis = analyzeSandboxOutput("Compile: Success\nResult: Pass");

    const reason = buildFailureReasonFromAnalysis(analysis);

    assertEquals(reason, undefined);
  });

  await t.step("builds reason from failed analysis", () => {
    const analysis = analyzeSandboxOutput("Compile: Failed");

    const reason = buildFailureReasonFromAnalysis(analysis, {
      exitCode: 1,
      containerName: "test-sandbox",
    });

    assertExists(reason);
    assertEquals(reason.phase, "compilation");
    assertExists(reason.container);
    assertEquals(reason.container.exitCode, 1);
    assertEquals(reason.container.containerName, "test-sandbox");
  });

  await t.step("adds timeout details for timeout failures", () => {
    const analysis = analyzeSandboxOutput("", "", 0, true);

    const reason = buildFailureReasonFromAnalysis(analysis, {
      timeoutMs: 60000,
      elapsedMs: 60500,
    });

    assertExists(reason);
    assertExists(reason.timeout);
    assertEquals(reason.timeout.configuredTimeoutMs, 60000);
    assertEquals(reason.timeout.elapsedMs, 60500);
  });
});

Deno.test("formatFailureReason", async (t) => {
  await t.step("formats basic failure", () => {
    const reason = buildFailureReason(
      "error",
      "compilation",
      "Compilation failed",
    );

    const formatted = formatFailureReason(reason);

    assertEquals(formatted.includes("Phase: compilation"), true);
    assertEquals(formatted.includes("Reason: Compilation failed"), true);
  });

  await t.step("includes errors in verbose mode", () => {
    const reason = buildFailureReason(
      "error",
      "compilation",
      "Compilation failed",
      {
        compilation: {
          errors: [
            {
              code: "AL0001",
              message: "Unknown identifier",
              file: "Test.al",
              line: 10,
            },
          ],
        },
      },
    );

    const formatted = formatFailureReason(reason, true);

    assertEquals(formatted.includes("Errors:"), true);
    assertEquals(formatted.includes("AL0001"), true);
    assertEquals(formatted.includes("Unknown identifier"), true);
    assertEquals(formatted.includes("Test.al(10)"), true);
  });

  await t.step("includes test failures in verbose mode", () => {
    const reason = buildFailureReason(
      "test_failure",
      "test_execution",
      "Tests failed",
      {
        tests: {
          totalTests: 5,
          passedTests: 2,
          failedTests: 3,
          failures: [
            { testName: "TestAdd", errorMessage: "Expected 5, got 4" },
          ],
        },
      },
    );

    const formatted = formatFailureReason(reason, true);

    assertEquals(formatted.includes("Failed tests:"), true);
    assertEquals(formatted.includes("TestAdd"), true);
    assertEquals(formatted.includes("Expected 5, got 4"), true);
  });

  await t.step("includes timeout info in verbose mode", () => {
    const reason = buildFailureReason(
      "timeout",
      "timeout",
      "Execution timed out",
      {
        timeout: {
          timedOutPhase: "agent_execution",
          configuredTimeoutMs: 60000,
          elapsedMs: 60500,
        },
      },
    );

    const formatted = formatFailureReason(reason, true);

    assertEquals(formatted.includes("Timeout:"), true);
    assertEquals(formatted.includes("60500ms"), true);
    assertEquals(formatted.includes("60000ms"), true);
  });
});
