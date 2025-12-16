/**
 * Unit tests for BC Container Provider output parsers
 *
 * Tests the pure parsing functions extracted from BcContainerProvider
 * without requiring PowerShell execution or actual containers.
 */

import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";

import {
  calculateTestMetrics,
  extractArtifactPath,
  extractCompilerFolder,
  isCompilationSuccessful,
  isContainerNotFound,
  isModuleMissing,
  mapHealthStatus,
  parseCompilationErrors,
  parseCompilationWarnings,
  parseStatusOutput,
  parseTestResults,
} from "../../../src/container/bc-output-parsers.ts";

describe("parseStatusOutput", () => {
  it("should parse status block with all fields", () => {
    const output = `
Some log output before
STATUS_START
NAME:mycontainer
RUNNING:True
HEALTH:healthy
BCVERSION:24.0.0.0
UPTIME:3600
STATUS_END
Some log output after
`;
    const result = parseStatusOutput(output);

    assertEquals(result["NAME"], "mycontainer");
    assertEquals(result["RUNNING"], "True");
    assertEquals(result["HEALTH"], "healthy");
    assertEquals(result["BCVERSION"], "24.0.0.0");
    assertEquals(result["UPTIME"], "3600");
  });

  it("should handle empty status block", () => {
    const output = `
STATUS_START
STATUS_END
`;
    const result = parseStatusOutput(output);

    assertEquals(Object.keys(result).length, 0);
  });

  it("should handle missing STATUS_END", () => {
    const output = `
STATUS_START
NAME:mycontainer
RUNNING:True
`;
    const result = parseStatusOutput(output);

    assertEquals(result["NAME"], "mycontainer");
    assertEquals(result["RUNNING"], "True");
  });

  it("should handle colons in values", () => {
    const output = `
STATUS_START
MESSAGE:Error: Something went wrong
PATH:C:\\Users\\test
STATUS_END
`;
    const result = parseStatusOutput(output);

    assertEquals(result["MESSAGE"], "Error: Something went wrong");
    assertEquals(result["PATH"], "C:\\Users\\test");
  });

  it("should ignore lines without colons", () => {
    const output = `
STATUS_START
NAME:mycontainer
Some random line
RUNNING:True
STATUS_END
`;
    const result = parseStatusOutput(output);

    assertEquals(result["NAME"], "mycontainer");
    assertEquals(result["RUNNING"], "True");
    assertEquals(Object.keys(result).length, 2);
  });

  it("should trim whitespace from keys and values", () => {
    const output = `
STATUS_START
  NAME  :  mycontainer
  RUNNING  :  True
STATUS_END
`;
    const result = parseStatusOutput(output);

    assertEquals(result["NAME"], "mycontainer");
    assertEquals(result["RUNNING"], "True");
  });

  it("should return empty object when no STATUS_START marker", () => {
    const output = `
NAME:mycontainer
RUNNING:True
`;
    const result = parseStatusOutput(output);

    assertEquals(Object.keys(result).length, 0);
  });
});

describe("mapHealthStatus", () => {
  it("should map 'running' to 'healthy'", () => {
    assertEquals(mapHealthStatus("running"), "healthy");
  });

  it("should map 'healthy' to 'healthy'", () => {
    assertEquals(mapHealthStatus("healthy"), "healthy");
  });

  it("should map 'starting' to 'starting'", () => {
    assertEquals(mapHealthStatus("starting"), "starting");
  });

  it("should map 'stopped' to 'stopped'", () => {
    assertEquals(mapHealthStatus("stopped"), "stopped");
  });

  it("should map 'unhealthy' to 'unhealthy'", () => {
    assertEquals(mapHealthStatus("unhealthy"), "unhealthy");
  });

  it("should be case-insensitive", () => {
    assertEquals(mapHealthStatus("RUNNING"), "healthy");
    assertEquals(mapHealthStatus("Healthy"), "healthy");
    assertEquals(mapHealthStatus("STARTING"), "starting");
  });

  it("should return 'stopped' for unknown status", () => {
    assertEquals(mapHealthStatus("unknown"), "stopped");
    assertEquals(mapHealthStatus(""), "stopped");
    assertEquals(mapHealthStatus("invalid"), "stopped");
  });
});

describe("parseCompilationErrors", () => {
  it("should parse AL compiler error format", () => {
    const output = `
Compiling...
Test.al(10,5): error AL0001: Expected ';'
Module.al(25,1): error AL0101: Variable 'x' is undefined
Done.
`;
    const errors = parseCompilationErrors(output);

    assertEquals(errors.length, 2);
    assertEquals(errors[0]!.file, "Test.al");
    assertEquals(errors[0]!.line, 10);
    assertEquals(errors[0]!.column, 5);
    assertEquals(errors[0]!.code, "AL0001");
    assertEquals(errors[0]!.message, "Expected ';'");
    assertEquals(errors[0]!.severity, "error");

    assertEquals(errors[1]!.file, "Module.al");
    assertEquals(errors[1]!.line, 25);
    assertEquals(errors[1]!.column, 1);
    assertEquals(errors[1]!.code, "AL0101");
    assertEquals(errors[1]!.message, "Variable 'x' is undefined");
  });

  it("should parse full path file names", () => {
    const output = `C:\\AL\\src\\Table.al(5,10): error AL0001: Some error`;
    const errors = parseCompilationErrors(output);

    assertEquals(errors.length, 1);
    assertEquals(errors[0]!.file, "C:\\AL\\src\\Table.al");
    assertEquals(errors[0]!.line, 5);
    assertEquals(errors[0]!.column, 10);
  });

  it("should parse generic ERROR: prefix", () => {
    const output = `
ERROR: Failed to compile
ERROR: Missing reference
`;
    const errors = parseCompilationErrors(output);

    assertEquals(errors.length, 2);
    assertEquals(errors[0]!.message, "Failed to compile");
    assertEquals(errors[0]!.file, "unknown");
    assertEquals(errors[0]!.code, "AL0000");
    assertEquals(errors[1]!.message, "Missing reference");
  });

  it("should parse lines containing ': error ' pattern", () => {
    const output = `Build process: error occurred during compilation`;
    const errors = parseCompilationErrors(output);

    assertEquals(errors.length, 1);
    assertEquals(
      errors[0]!.message,
      "Build process: error occurred during compilation",
    );
  });

  it("should return empty array for no errors", () => {
    const output = `
Compiling...
Successfully compiled 10 files.
Done.
`;
    const errors = parseCompilationErrors(output);

    assertEquals(errors.length, 0);
  });

  it("should not match warning lines", () => {
    const output = `Test.al(10,5): warning AL0500: Variable unused`;
    const errors = parseCompilationErrors(output);

    assertEquals(errors.length, 0);
  });
});

describe("parseCompilationWarnings", () => {
  it("should parse AL compiler warning format", () => {
    const output = `
Compiling...
Test.al(10,5): warning AL0500: Variable 'x' is never used
Module.al(25,1): warning AL0501: Function can be simplified
Done.
`;
    const warnings = parseCompilationWarnings(output);

    assertEquals(warnings.length, 2);
    assertEquals(warnings[0]!.file, "Test.al");
    assertEquals(warnings[0]!.line, 10);
    assertEquals(warnings[0]!.column, 5);
    assertEquals(warnings[0]!.code, "AL0500");
    assertEquals(warnings[0]!.message, "Variable 'x' is never used");
    assertEquals(warnings[0]!.severity, "warning");

    assertEquals(warnings[1]!.file, "Module.al");
    assertEquals(warnings[1]!.line, 25);
    assertEquals(warnings[1]!.column, 1);
  });

  it("should parse full path file names", () => {
    const output =
      `C:\\AL\\src\\Page.al(15,3): warning AL0600: Consider using explicit type`;
    const warnings = parseCompilationWarnings(output);

    assertEquals(warnings.length, 1);
    assertEquals(warnings[0]!.file, "C:\\AL\\src\\Page.al");
    assertEquals(warnings[0]!.line, 15);
  });

  it("should return empty array for no warnings", () => {
    const output = `
Compiling...
Successfully compiled.
`;
    const warnings = parseCompilationWarnings(output);

    assertEquals(warnings.length, 0);
  });

  it("should not match error lines", () => {
    const output = `Test.al(10,5): error AL0001: Expected ';'`;
    const warnings = parseCompilationWarnings(output);

    assertEquals(warnings.length, 0);
  });
});

describe("extractArtifactPath", () => {
  it("should extract artifact path from APP_FILE marker", () => {
    const output = `
Compiling...
APP_FILE:C:\\Output\\MyApp.app
Done.
`;
    const path = extractArtifactPath(output);

    assertEquals(path, "C:\\Output\\MyApp.app");
  });

  it("should handle path with spaces", () => {
    const output = `APP_FILE:C:\\My Project\\Output\\MyApp.app`;
    const path = extractArtifactPath(output);

    assertEquals(path, "C:\\My Project\\Output\\MyApp.app");
  });

  it("should return undefined when no artifact", () => {
    const output = `
Compiling...
Error occurred.
`;
    const path = extractArtifactPath(output);

    assertEquals(path, undefined);
  });

  it("should trim whitespace from path", () => {
    const output = `APP_FILE:  C:\\Output\\MyApp.app  `;
    const path = extractArtifactPath(output);

    assertEquals(path, "C:\\Output\\MyApp.app");
  });
});

describe("isCompilationSuccessful", () => {
  it("should return true when no errors and COMPILE_SUCCESS marker", () => {
    const output = `
Compiling...
COMPILE_SUCCESS
Done.
`;
    assertEquals(isCompilationSuccessful(output, 0), true);
  });

  it("should return false when errors exist", () => {
    const output = `COMPILE_SUCCESS`;
    assertEquals(isCompilationSuccessful(output, 1), false);
  });

  it("should return false when COMPILE_SUCCESS missing", () => {
    const output = `
Compiling...
Done.
`;
    assertEquals(isCompilationSuccessful(output, 0), false);
  });

  it("should return false when both errors and missing marker", () => {
    const output = `Compiling failed.`;
    assertEquals(isCompilationSuccessful(output, 2), false);
  });
});

describe("parseTestResults", () => {
  it("should parse passing test results", () => {
    const output = `
TEST_START
TESTRESULT:Test MyTest passed
TESTRESULT:Test AnotherTest success
TEST_END
`;
    const { results, allPassed, publishFailed } = parseTestResults(output);

    assertEquals(results.length, 2);
    assertEquals(results[0]!.name, "MyTest");
    assertEquals(results[0]!.passed, true);
    assertEquals(results[1]!.name, "AnotherTest");
    assertEquals(results[1]!.passed, true);
    assertEquals(allPassed, false);
    assertEquals(publishFailed, false);
  });

  it("should parse failing test results", () => {
    const output = `
TEST_START
TESTRESULT:Test MyTest failed: Assertion error
TESTRESULT:Test AnotherTest error: Expected 5, got 10
TEST_END
`;
    const { results } = parseTestResults(output);

    assertEquals(results.length, 2);
    assertEquals(results[0]!.name, "MyTest");
    assertEquals(results[0]!.passed, false);
    assertEquals(results[0]!.error, "Assertion error");
    assertEquals(results[1]!.name, "AnotherTest");
    assertEquals(results[1]!.passed, false);
  });

  it("should detect ALL_TESTS_PASSED marker", () => {
    const output = `
TEST_START
TESTRESULT:Test MyTest passed
TEST_END
ALL_TESTS_PASSED
`;
    const { allPassed } = parseTestResults(output);

    assertEquals(allPassed, true);
  });

  it("should detect PUBLISH_FAILED marker", () => {
    const output = `
PUBLISH_FAILED: Could not install app
TEST_START
TEST_END
`;
    const { publishFailed } = parseTestResults(output);

    assertEquals(publishFailed, true);
  });

  it("should return empty results when no test markers", () => {
    const output = `Some random output`;
    const { results } = parseTestResults(output);

    assertEquals(results.length, 0);
  });

  it("should handle mixed pass/fail results", () => {
    const output = `
TEST_START
TESTRESULT:Test Pass1 passed
TESTRESULT:Test Fail1 failed: error
TESTRESULT:Test Pass2 success
TEST_END
`;
    const { results } = parseTestResults(output);

    assertEquals(results.length, 3);
    assertEquals(results[0]!.passed, true);
    assertEquals(results[1]!.passed, false);
    assertEquals(results[2]!.passed, true);
  });
});

describe("calculateTestMetrics", () => {
  it("should calculate metrics for all passing tests", () => {
    const results = [
      { name: "Test1", passed: true, duration: 100 },
      { name: "Test2", passed: true, duration: 200 },
      { name: "Test3", passed: true, duration: 150 },
    ];

    const metrics = calculateTestMetrics(results, false, false);

    assertEquals(metrics.totalTests, 3);
    assertEquals(metrics.passedTests, 3);
    assertEquals(metrics.failedTests, 0);
    assertEquals(metrics.success, true);
  });

  it("should calculate metrics for mixed results", () => {
    const results = [
      { name: "Test1", passed: true, duration: 100 },
      { name: "Test2", passed: false, duration: 200 },
      { name: "Test3", passed: true, duration: 150 },
    ];

    const metrics = calculateTestMetrics(results, false, false);

    assertEquals(metrics.totalTests, 3);
    assertEquals(metrics.passedTests, 2);
    assertEquals(metrics.failedTests, 1);
    assertEquals(metrics.success, false);
  });

  it("should return success=true when allPassed is true", () => {
    const results = [
      { name: "Test1", passed: true, duration: 100 },
    ];

    const metrics = calculateTestMetrics(results, true, false);

    assertEquals(metrics.success, true);
  });

  it("should return success=false when publishFailed is true", () => {
    const results = [
      { name: "Test1", passed: true, duration: 100 },
    ];

    const metrics = calculateTestMetrics(results, true, true);

    assertEquals(metrics.success, false);
  });

  it("should return success=false for zero tests", () => {
    const metrics = calculateTestMetrics([], false, false);

    assertEquals(metrics.totalTests, 0);
    assertEquals(metrics.success, false);
  });

  it("should create synthetic result when allPassed but no results", () => {
    const metrics = calculateTestMetrics([], true, false);

    assertEquals(metrics.totalTests, 1);
    assertEquals(metrics.passedTests, 1);
    assertEquals(metrics.success, true);
  });

  it("should use actual results when both results and allPassed exist", () => {
    const results = [
      { name: "Test1", passed: true, duration: 100 },
      { name: "Test2", passed: true, duration: 200 },
    ];

    const metrics = calculateTestMetrics(results, true, false);

    assertEquals(metrics.totalTests, 2);
    assertEquals(metrics.passedTests, 2);
  });
});

describe("extractCompilerFolder", () => {
  it("should extract compiler folder path", () => {
    const output = `
Getting compiler...
COMPILER_FOLDER:C:\\Temp\\compiler\\24.0
Done.
`;
    const folder = extractCompilerFolder(output);

    assertEquals(folder, "C:\\Temp\\compiler\\24.0");
  });

  it("should handle path with spaces", () => {
    const output = `COMPILER_FOLDER:C:\\Program Files\\BC Compiler\\24.0`;
    const folder = extractCompilerFolder(output);

    assertEquals(folder, "C:\\Program Files\\BC Compiler\\24.0");
  });

  it("should return undefined when no marker", () => {
    const output = `Some output without compiler folder`;
    const folder = extractCompilerFolder(output);

    assertEquals(folder, undefined);
  });
});

describe("isContainerNotFound", () => {
  it("should return true when CONTAINER_NOT_FOUND marker present", () => {
    const output = `
Checking container...
CONTAINER_NOT_FOUND
`;
    assertEquals(isContainerNotFound(output), true);
  });

  it("should return false when marker not present", () => {
    const output = `
Checking container...
Container found.
`;
    assertEquals(isContainerNotFound(output), false);
  });
});

describe("isModuleMissing", () => {
  it("should return true when MISSING_MODULE marker present", () => {
    const output = `
Loading bccontainerhelper...
MISSING_MODULE
`;
    assertEquals(isModuleMissing(output), true);
  });

  it("should return false when marker not present", () => {
    const output = `
Loading bccontainerhelper...
Module loaded.
`;
    assertEquals(isModuleMissing(output), false);
  });
});
