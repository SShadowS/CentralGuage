/**
 * Tests for result parsing helpers used to extract structured data from tool responses.
 *
 * These functions parse tool results (al_compile, al_verify_task) and format them
 * into a standardized plain-text format for easy regex extraction.
 */

import { assertEquals } from "@std/assert";

/**
 * Extracted compile/test results from tool response (mirrors PartialParsedResult)
 */
interface PartialParsedResult {
  compileSuccess?: boolean;
  testsPassed?: number;
  testsTotal?: number;
}

/**
 * Extract structured data from a tool result JSON string.
 * Mirrors the function in src/agents/executor.ts
 */
function extractResultFromToolResult(content: string): PartialParsedResult {
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

/**
 * Format a parsed result into the standardized plain-text format.
 * Mirrors the function in src/agents/executor.ts
 */
function formatTaskResult(
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

Deno.test("extractResultFromToolResult - JSON responses", async (t) => {
  await t.step("parses al_compile success response", () => {
    const json = JSON.stringify({
      success: true,
      message: "Compilation successful",
      errors: [],
      warnings: [],
    });
    const result = extractResultFromToolResult(json);
    assertEquals(result.compileSuccess, true);
    assertEquals(result.testsPassed, undefined);
    assertEquals(result.testsTotal, undefined);
  });

  await t.step("parses al_compile failure response", () => {
    const json = JSON.stringify({
      success: false,
      message: "Compilation failed",
      errors: ["Error: Syntax error on line 10"],
      warnings: [],
    });
    const result = extractResultFromToolResult(json);
    assertEquals(result.compileSuccess, false);
  });

  await t.step("parses al_verify_task success response", () => {
    const json = JSON.stringify({
      success: true,
      message: "All tests passed!",
      passed: 7,
      totalTests: 7,
      failures: [],
    });
    const result = extractResultFromToolResult(json);
    assertEquals(result.testsPassed, 7);
    assertEquals(result.testsTotal, 7);
  });

  await t.step("parses al_verify_task partial pass response", () => {
    const json = JSON.stringify({
      success: false,
      message: "Some tests failed",
      passed: 5,
      totalTests: 7,
      failures: ["TestFoo: assertion failed"],
    });
    const result = extractResultFromToolResult(json);
    assertEquals(result.testsPassed, 5);
    assertEquals(result.testsTotal, 7);
  });

  await t.step("handles JSON without relevant fields", () => {
    const json = JSON.stringify({
      status: "ok",
      data: "irrelevant",
    });
    const result = extractResultFromToolResult(json);
    assertEquals(result.compileSuccess, undefined);
    assertEquals(result.testsPassed, undefined);
    assertEquals(result.testsTotal, undefined);
  });
});

Deno.test("extractResultFromToolResult - text patterns", async (t) => {
  await t.step("extracts from 'compilation successful' text", () => {
    const text = "Build completed. Compilation successful.";
    const result = extractResultFromToolResult(text);
    assertEquals(result.compileSuccess, true);
  });

  await t.step(
    "extracts from 'Compilation Successful' (case insensitive)",
    () => {
      const text = "Result: COMPILATION SUCCESSFUL";
      const result = extractResultFromToolResult(text);
      assertEquals(result.compileSuccess, true);
    },
  );

  await t.step("extracts from 'all 7 tests passed' text", () => {
    const text = "All 7 tests passed!";
    const result = extractResultFromToolResult(text);
    assertEquals(result.testsPassed, 7);
    assertEquals(result.testsTotal, 7);
  });

  await t.step("extracts from 'all 15 tests passed'", () => {
    const text = "Result: all 15 tests passed";
    const result = extractResultFromToolResult(text);
    assertEquals(result.testsPassed, 15);
    assertEquals(result.testsTotal, 15);
  });

  await t.step("extracts from '7/7 passed' pattern", () => {
    const text = "Tests: 7/7 passed";
    const result = extractResultFromToolResult(text);
    assertEquals(result.testsPassed, 7);
    assertEquals(result.testsTotal, 7);
  });

  await t.step("extracts from '5/7 passed' pattern (partial)", () => {
    const text = "Tests: 5/7 passed";
    const result = extractResultFromToolResult(text);
    assertEquals(result.testsPassed, 5);
    assertEquals(result.testsTotal, 7);
  });

  await t.step("returns empty for unrecognized text", () => {
    const text = "Something unrelated happened";
    const result = extractResultFromToolResult(text);
    assertEquals(result.compileSuccess, undefined);
    assertEquals(result.testsPassed, undefined);
    assertEquals(result.testsTotal, undefined);
  });
});

Deno.test("formatTaskResult - output format", async (t) => {
  await t.step("formats compile success only", () => {
    const output = formatTaskResult(true);
    assertEquals(
      output,
      "Compile: Success\nResult: Pass",
    );
  });

  await t.step("formats compile failure only", () => {
    const output = formatTaskResult(false);
    assertEquals(
      output,
      "Compile: Failed\nResult: Fail",
    );
  });

  await t.step("formats with test counts - all passing", () => {
    const output = formatTaskResult(true, 7, 7);
    assertEquals(
      output,
      "Compile: Success\nTests: 7/7\nResult: Pass",
    );
  });

  await t.step("formats with test counts - partial pass", () => {
    const output = formatTaskResult(true, 5, 7);
    assertEquals(
      output,
      "Compile: Success\nTests: 5/7\nResult: Fail",
    );
  });

  await t.step("formats with zero tests passed", () => {
    const output = formatTaskResult(true, 0, 7);
    assertEquals(
      output,
      "Compile: Success\nTests: 0/7\nResult: Fail",
    );
  });

  await t.step("formats compile failure with tests", () => {
    const output = formatTaskResult(false, 0, 7);
    assertEquals(
      output,
      "Compile: Failed\nTests: 0/7\nResult: Fail",
    );
  });
});

Deno.test("formatTaskResult - regex extraction", async (t) => {
  await t.step("result can be extracted with full regex", () => {
    const output = formatTaskResult(true, 7, 7);
    const regex =
      /Compile: (Success|Failed)\nTests: (\d+)\/(\d+)\nResult: (Pass|Fail)/;
    const match = output.match(regex);

    assertEquals(match !== null, true);
    assertEquals(match![1], "Success");
    assertEquals(match![2], "7");
    assertEquals(match![3], "7");
    assertEquals(match![4], "Pass");
  });

  await t.step("result can be extracted with simple regex", () => {
    const output = formatTaskResult(true, 5, 7);
    const regex = /Result: (Pass|Fail)/;
    const match = output.match(regex);

    assertEquals(match !== null, true);
    assertEquals(match![1], "Fail");
  });

  await t.step("compile-only result can be extracted", () => {
    const output = formatTaskResult(true);
    const regex = /Compile: (Success|Failed)\nResult: (Pass|Fail)/;
    const match = output.match(regex);

    assertEquals(match !== null, true);
    assertEquals(match![1], "Success");
    assertEquals(match![2], "Pass");
  });
});

Deno.test("end-to-end: parse and format", async (t) => {
  await t.step("al_compile JSON to formatted output", () => {
    const json = JSON.stringify({
      success: true,
      message: "Compilation successful",
      errors: [],
    });
    const parsed = extractResultFromToolResult(json);
    const output = formatTaskResult(parsed.compileSuccess ?? false);
    assertEquals(output, "Compile: Success\nResult: Pass");
  });

  await t.step("al_verify_task JSON to formatted output", () => {
    const json = JSON.stringify({
      success: true,
      message: "All tests passed!",
      passed: 7,
      totalTests: 7,
    });
    const parsed = extractResultFromToolResult(json);
    const output = formatTaskResult(
      true, // compileSuccess assumed if tests ran
      parsed.testsPassed,
      parsed.testsTotal,
    );
    assertEquals(output, "Compile: Success\nTests: 7/7\nResult: Pass");
  });

  await t.step("failed test JSON to formatted output", () => {
    const json = JSON.stringify({
      success: false,
      message: "Some tests failed",
      passed: 3,
      totalTests: 7,
    });
    const parsed = extractResultFromToolResult(json);
    const output = formatTaskResult(
      true,
      parsed.testsPassed,
      parsed.testsTotal,
    );
    assertEquals(output, "Compile: Success\nTests: 3/7\nResult: Fail");
  });
});
