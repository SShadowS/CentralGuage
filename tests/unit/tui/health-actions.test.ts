/**
 * Tests for health-actions pure functions
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  formatHealthCheckResult,
  type HealthCheckResult,
} from "../../../cli/services/health-actions.ts";

// ============================================================================
// formatHealthCheckResult tests
// ============================================================================

Deno.test("formatHealthCheckResult - formats healthy result", () => {
  const result: HealthCheckResult = {
    healthy: true,
    items: [
      { name: "Environment", status: "ok", message: "Loaded and valid" },
      {
        name: "LLM Providers",
        status: "ok",
        message: "3 available",
        details: "anthropic, openai, gemini",
      },
      { name: "Configuration", status: "ok", message: "Valid" },
    ],
    summary: "All systems healthy - ready for benchmarks!",
  };

  const formatted = formatHealthCheckResult(result);

  assertStringIncludes(formatted, "[OK] Environment");
  assertStringIncludes(formatted, "[OK] LLM Providers");
  assertStringIncludes(formatted, "[OK] Configuration");
  assertStringIncludes(formatted, "anthropic, openai, gemini");
  assertStringIncludes(formatted, "All systems healthy");
});

Deno.test("formatHealthCheckResult - formats warning result", () => {
  const result: HealthCheckResult = {
    healthy: false,
    items: [
      {
        name: "Environment",
        status: "warning",
        message: "No .env file found",
        details: "Using environment variables only",
      },
      {
        name: "LLM Providers",
        status: "ok",
        message: "2 available",
      },
    ],
    summary: "1 warning(s) - system functional with limitations",
  };

  const formatted = formatHealthCheckResult(result);

  assertStringIncludes(formatted, "[WARN] Environment");
  assertStringIncludes(formatted, "No .env file found");
  assertStringIncludes(formatted, "[OK] LLM Providers");
  assertStringIncludes(formatted, "1 warning(s)");
});

Deno.test("formatHealthCheckResult - formats error result", () => {
  const result: HealthCheckResult = {
    healthy: false,
    items: [
      { name: "Environment", status: "ok", message: "Loaded" },
      {
        name: "LLM Providers",
        status: "error",
        message: "None available",
        details: "Check API key configuration",
      },
    ],
    summary: "1 error(s), 0 warning(s) - check configuration",
  };

  const formatted = formatHealthCheckResult(result);

  assertStringIncludes(formatted, "[OK] Environment");
  assertStringIncludes(formatted, "[ERR] LLM Providers");
  assertStringIncludes(formatted, "None available");
  assertStringIncludes(formatted, "Check API key configuration");
  assertStringIncludes(formatted, "1 error(s)");
});

Deno.test("formatHealthCheckResult - includes details on separate line", () => {
  const result: HealthCheckResult = {
    healthy: true,
    items: [
      {
        name: "Test Item",
        status: "ok",
        message: "Test message",
        details: "Additional details here",
      },
    ],
    summary: "Done",
  };

  const formatted = formatHealthCheckResult(result);
  const lines = formatted.split("\n");

  // Details should be indented on next line
  const detailsLine = lines.find((l) => l.includes("Additional details here"));
  assertEquals(detailsLine !== undefined, true);
  assertEquals(detailsLine!.startsWith("     "), true); // Indented
});

Deno.test("formatHealthCheckResult - omits details line when not provided", () => {
  const result: HealthCheckResult = {
    healthy: true,
    items: [
      { name: "Test Item", status: "ok", message: "Test message" },
    ],
    summary: "Done",
  };

  const formatted = formatHealthCheckResult(result);
  const lines = formatted.split("\n");

  // Should have item line, empty line, summary - no details line
  assertEquals(lines[0]!.includes("[OK] Test Item"), true);
  assertEquals(lines[1], ""); // Empty line before summary
  assertEquals(lines[2], "Done");
});

Deno.test("formatHealthCheckResult - handles empty items array", () => {
  const result: HealthCheckResult = {
    healthy: true,
    items: [],
    summary: "No checks performed",
  };

  const formatted = formatHealthCheckResult(result);

  // Should still have summary
  assertStringIncludes(formatted, "No checks performed");
});

Deno.test("formatHealthCheckResult - preserves item order", () => {
  const result: HealthCheckResult = {
    healthy: true,
    items: [
      { name: "First", status: "ok", message: "msg1" },
      { name: "Second", status: "ok", message: "msg2" },
      { name: "Third", status: "ok", message: "msg3" },
    ],
    summary: "Done",
  };

  const formatted = formatHealthCheckResult(result);

  const firstIdx = formatted.indexOf("First");
  const secondIdx = formatted.indexOf("Second");
  const thirdIdx = formatted.indexOf("Third");

  assertEquals(firstIdx < secondIdx, true);
  assertEquals(secondIdx < thirdIdx, true);
});

Deno.test("formatHealthCheckResult - mixed statuses", () => {
  const result: HealthCheckResult = {
    healthy: false,
    items: [
      { name: "Item1", status: "ok", message: "OK" },
      { name: "Item2", status: "warning", message: "Warn" },
      { name: "Item3", status: "error", message: "Error" },
    ],
    summary: "Mixed results",
  };

  const formatted = formatHealthCheckResult(result);

  assertStringIncludes(formatted, "[OK] Item1");
  assertStringIncludes(formatted, "[WARN] Item2");
  assertStringIncludes(formatted, "[ERR] Item3");
});
