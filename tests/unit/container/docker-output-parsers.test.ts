/**
 * Unit tests for Docker Container Provider output parsers
 *
 * Tests the pure parsing functions extracted from DockerContainerProvider
 * without requiring Docker execution or actual containers.
 */

import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";

import {
  calculateDockerTestMetrics,
  calculateUptime,
  extractBcVersionFromImage,
  isContainerReady,
  isDockerCompilationSuccessful,
  mapDockerHealthStatus,
  parseDockerCompilationErrors,
  parseDockerCompilationWarnings,
  parseDockerInspect,
  parseDockerTestResults,
} from "../../../src/container/docker-output-parsers.ts";

describe("parseDockerInspect", () => {
  it("should parse all fields from docker inspect output", () => {
    const output =
      "true|healthy|mcr.microsoft.com/businesscentral:24.0|2024-01-15T10:30:00Z";
    const result = parseDockerInspect(output);

    assertEquals(result.running, "true");
    assertEquals(result.health, "healthy");
    assertEquals(result.image, "mcr.microsoft.com/businesscentral:24.0");
    assertEquals(result.startedAt, "2024-01-15T10:30:00Z");
  });

  it("should handle missing fields", () => {
    const output = "true|healthy||";
    const result = parseDockerInspect(output);

    assertEquals(result.running, "true");
    assertEquals(result.health, "healthy");
    assertEquals(result.image, "");
    assertEquals(result.startedAt, "");
  });

  it("should handle partial output", () => {
    const output = "false|unhealthy";
    const result = parseDockerInspect(output);

    assertEquals(result.running, "false");
    assertEquals(result.health, "unhealthy");
    assertEquals(result.image, "");
    assertEquals(result.startedAt, "");
  });

  it("should handle empty output", () => {
    const output = "";
    const result = parseDockerInspect(output);

    assertEquals(result.running, "");
    assertEquals(result.health, "");
    assertEquals(result.image, "");
    assertEquals(result.startedAt, "");
  });

  it("should trim whitespace", () => {
    const output = "  true|healthy|image:tag|timestamp  \n";
    const result = parseDockerInspect(output);

    assertEquals(result.running, "true");
    assertEquals(result.health, "healthy");
  });
});

describe("extractBcVersionFromImage", () => {
  it("should extract version from standard BC image", () => {
    const image = "mcr.microsoft.com/businesscentral:24.0";
    assertEquals(extractBcVersionFromImage(image), "24.0");
  });

  it("should extract version with patch number", () => {
    const image = "mcr.microsoft.com/businesscentral:24.5";
    assertEquals(extractBcVersionFromImage(image), "24.5");
  });

  it("should handle image with additional tags", () => {
    const image = "mcr.microsoft.com/businesscentral:23.1-ltsc2022";
    assertEquals(extractBcVersionFromImage(image), "23.1");
  });

  it("should return undefined for non-BC images", () => {
    const image = "nginx:latest";
    assertEquals(extractBcVersionFromImage(image), undefined);
  });

  it("should return undefined for malformed image names", () => {
    const image = "some-random-image";
    assertEquals(extractBcVersionFromImage(image), undefined);
  });

  it("should return undefined for empty string", () => {
    assertEquals(extractBcVersionFromImage(""), undefined);
  });
});

describe("mapDockerHealthStatus", () => {
  it("should map 'healthy' to 'healthy'", () => {
    assertEquals(mapDockerHealthStatus("healthy", true), "healthy");
  });

  it("should map 'unhealthy' to 'unhealthy'", () => {
    assertEquals(mapDockerHealthStatus("unhealthy", true), "unhealthy");
  });

  it("should map 'starting' to 'starting'", () => {
    assertEquals(mapDockerHealthStatus("starting", true), "starting");
  });

  it("should map 'none' to 'healthy' when running", () => {
    assertEquals(mapDockerHealthStatus("none", true), "healthy");
  });

  it("should map 'none' to 'stopped' when not running", () => {
    assertEquals(mapDockerHealthStatus("none", false), "stopped");
  });

  it("should map empty string to 'healthy' when running", () => {
    assertEquals(mapDockerHealthStatus("", true), "healthy");
  });

  it("should map empty string to 'stopped' when not running", () => {
    assertEquals(mapDockerHealthStatus("", false), "stopped");
  });

  it("should map unknown status to 'stopped'", () => {
    assertEquals(mapDockerHealthStatus("unknown", true), "stopped");
  });
});

describe("calculateUptime", () => {
  it("should calculate uptime in seconds when running", () => {
    // Use a fixed date 10 seconds ago
    const tenSecondsAgo = new Date(Date.now() - 10000).toISOString();
    const uptime = calculateUptime(tenSecondsAgo, true);

    // Allow for small timing differences
    assertEquals(uptime >= 9 && uptime <= 12, true);
  });

  it("should return 0 when not running", () => {
    const timestamp = new Date().toISOString();
    assertEquals(calculateUptime(timestamp, false), 0);
  });

  it("should return 0 for empty startedAt", () => {
    assertEquals(calculateUptime("", true), 0);
  });

  it("should return 0 for invalid timestamp", () => {
    assertEquals(calculateUptime("invalid-timestamp", true), 0);
  });

  it("should handle timestamps in the past", () => {
    // 1 hour ago
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const uptime = calculateUptime(oneHourAgo, true);

    // Should be around 3600 seconds (1 hour)
    assertEquals(uptime >= 3599 && uptime <= 3602, true);
  });
});

describe("parseDockerCompilationErrors", () => {
  it("should parse AL compiler error format", () => {
    const output = `
Compiling AL project...
Table.al(10,5): error AL0001: Expected ';'
Page.al(25,1): error AL0101: Variable 'x' is undefined
Build completed with errors.
`;
    const errors = parseDockerCompilationErrors(output);

    assertEquals(errors.length, 2);
    assertEquals(errors[0]!.file, "Table.al");
    assertEquals(errors[0]!.line, 10);
    assertEquals(errors[0]!.column, 5);
    assertEquals(errors[0]!.code, "AL0001");
    assertEquals(errors[0]!.message, "Expected ';'");
    assertEquals(errors[0]!.severity, "error");
  });

  it("should parse full path file names", () => {
    const output = `/tmp/al_project/Table.al(5,10): error AL0001: Some error`;
    const errors = parseDockerCompilationErrors(output);

    assertEquals(errors.length, 1);
    assertEquals(errors[0]!.file, "/tmp/al_project/Table.al");
    assertEquals(errors[0]!.line, 5);
    assertEquals(errors[0]!.column, 10);
  });

  it("should return empty array for no errors", () => {
    const output = `
Compiling AL project...
Build succeeded.
`;
    const errors = parseDockerCompilationErrors(output);

    assertEquals(errors.length, 0);
  });

  it("should not match warning lines", () => {
    const output = `Table.al(10,5): warning AL0500: Variable unused`;
    const errors = parseDockerCompilationErrors(output);

    assertEquals(errors.length, 0);
  });

  it("should handle multiple errors on same line", () => {
    const output =
      `File.al(1,1): error AL0001: Error 1\nFile.al(1,2): error AL0002: Error 2`;
    const errors = parseDockerCompilationErrors(output);

    assertEquals(errors.length, 2);
  });
});

describe("parseDockerCompilationWarnings", () => {
  it("should parse AL compiler warning format", () => {
    const output = `
Compiling AL project...
Table.al(10,5): warning AL0500: Variable 'x' is never used
Page.al(25,1): warning AL0501: Function can be simplified
Build completed.
`;
    const warnings = parseDockerCompilationWarnings(output);

    assertEquals(warnings.length, 2);
    assertEquals(warnings[0]!.file, "Table.al");
    assertEquals(warnings[0]!.line, 10);
    assertEquals(warnings[0]!.column, 5);
    assertEquals(warnings[0]!.code, "AL0500");
    assertEquals(warnings[0]!.message, "Variable 'x' is never used");
    assertEquals(warnings[0]!.severity, "warning");
  });

  it("should return empty array for no warnings", () => {
    const output = `Build succeeded with no warnings.`;
    const warnings = parseDockerCompilationWarnings(output);

    assertEquals(warnings.length, 0);
  });

  it("should not match error lines", () => {
    const output = `Table.al(10,5): error AL0001: Expected ';'`;
    const warnings = parseDockerCompilationWarnings(output);

    assertEquals(warnings.length, 0);
  });
});

describe("isDockerCompilationSuccessful", () => {
  it("should return true when no errors and no COMPILE_FAILED marker", () => {
    const output = `
Compiling...
Build succeeded.
`;
    assertEquals(isDockerCompilationSuccessful(output, 0), true);
  });

  it("should return false when errors exist", () => {
    const output = `Build succeeded.`;
    assertEquals(isDockerCompilationSuccessful(output, 1), false);
  });

  it("should return false when COMPILE_FAILED marker present", () => {
    const output = `
Compiling...
COMPILE_FAILED
`;
    assertEquals(isDockerCompilationSuccessful(output, 0), false);
  });

  it("should return false when both errors and COMPILE_FAILED", () => {
    const output = `COMPILE_FAILED`;
    assertEquals(isDockerCompilationSuccessful(output, 2), false);
  });
});

describe("parseDockerTestResults", () => {
  it("should parse passing test results", () => {
    const output = `
Running tests...
Test TestOne passed in 100ms
Test TestTwo passed in 200ms
Done.
`;
    const results = parseDockerTestResults(output);

    assertEquals(results.length, 2);
    assertEquals(results[0]!.name, "TestOne");
    assertEquals(results[0]!.passed, true);
    assertEquals(results[0]!.duration, 100);
    assertEquals(results[1]!.name, "TestTwo");
    assertEquals(results[1]!.passed, true);
    assertEquals(results[1]!.duration, 200);
  });

  it("should parse failing test results with error messages", () => {
    const output = `
Test TestFail failed in 50ms: Assertion error at line 10
Test AnotherFail failed in 30ms: Expected 5 but got 10
`;
    const results = parseDockerTestResults(output);

    assertEquals(results.length, 2);
    assertEquals(results[0]!.name, "TestFail");
    assertEquals(results[0]!.passed, false);
    assertEquals(results[0]!.duration, 50);
    assertEquals(results[0]!.error, "Assertion error at line 10");
    assertEquals(results[1]!.name, "AnotherFail");
    assertEquals(results[1]!.passed, false);
    assertEquals(results[1]!.error, "Expected 5 but got 10");
  });

  it("should handle tests without duration", () => {
    const output = `
Test TestNoDuration passed
`;
    const results = parseDockerTestResults(output);

    assertEquals(results.length, 1);
    assertEquals(results[0]!.name, "TestNoDuration");
    assertEquals(results[0]!.passed, true);
    assertEquals(results[0]!.duration, 0);
  });

  it("should return empty array for no test output", () => {
    const output = `Some random output without test markers`;
    const results = parseDockerTestResults(output);

    assertEquals(results.length, 0);
  });

  it("should handle mixed pass/fail results", () => {
    const output = `
Test Pass1 passed in 100ms
Test Fail1 failed in 200ms: error message
Test Pass2 passed in 150ms
`;
    const results = parseDockerTestResults(output);

    assertEquals(results.length, 3);
    assertEquals(results[0]!.passed, true);
    assertEquals(results[1]!.passed, false);
    assertEquals(results[2]!.passed, true);
  });
});

describe("calculateDockerTestMetrics", () => {
  it("should calculate metrics for all passing tests", () => {
    const results = [
      { name: "Test1", passed: true, duration: 100 },
      { name: "Test2", passed: true, duration: 200 },
      { name: "Test3", passed: true, duration: 150 },
    ];

    const metrics = calculateDockerTestMetrics(results);

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

    const metrics = calculateDockerTestMetrics(results);

    assertEquals(metrics.totalTests, 3);
    assertEquals(metrics.passedTests, 2);
    assertEquals(metrics.failedTests, 1);
    assertEquals(metrics.success, false);
  });

  it("should calculate metrics for all failing tests", () => {
    const results = [
      { name: "Test1", passed: false, duration: 100 },
      { name: "Test2", passed: false, duration: 200 },
    ];

    const metrics = calculateDockerTestMetrics(results);

    assertEquals(metrics.totalTests, 2);
    assertEquals(metrics.passedTests, 0);
    assertEquals(metrics.failedTests, 2);
    assertEquals(metrics.success, false);
  });

  it("should handle empty results array", () => {
    const metrics = calculateDockerTestMetrics([]);

    assertEquals(metrics.totalTests, 0);
    assertEquals(metrics.passedTests, 0);
    assertEquals(metrics.failedTests, 0);
    assertEquals(metrics.success, true); // No failures = success
  });
});

describe("isContainerReady", () => {
  it("should return true when 'Ready for connections!' is present", () => {
    const output = `
Starting services...
Ready for connections!
`;
    assertEquals(isContainerReady(output), true);
  });

  it("should return true when 'Container is ready' is present", () => {
    const output = `
Starting services...
Container is ready
`;
    assertEquals(isContainerReady(output), true);
  });

  it("should return false when neither marker is present", () => {
    const output = `
Starting services...
Still initializing...
`;
    assertEquals(isContainerReady(output), false);
  });

  it("should return false for empty output", () => {
    assertEquals(isContainerReady(""), false);
  });

  it("should be case-sensitive", () => {
    const output = `READY FOR CONNECTIONS!`;
    assertEquals(isContainerReady(output), false);
  });
});
