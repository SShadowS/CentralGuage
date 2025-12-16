/**
 * Unit tests for test result success logic
 * Verifies that zero tests = failure (not success)
 */

import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";

/**
 * Replicates the success calculation logic from bc-container-provider.ts
 * This is extracted for unit testing purposes.
 */
function calculateTestSuccess(
  publishFailed: boolean,
  totalTests: number,
  failedTests: number,
  allPassed: boolean,
): boolean {
  // Require at least one test to have run for success (zero tests = failure)
  return !publishFailed && totalTests > 0 && (allPassed || failedTests === 0);
}

describe("Test Result Success Logic", () => {
  describe("calculateTestSuccess", () => {
    it("should return true when all tests pass", () => {
      const result = calculateTestSuccess(
        false, // publishFailed
        5, // totalTests
        0, // failedTests
        true, // allPassed
      );
      assertEquals(result, true);
    });

    it("should return true when some tests pass and none fail", () => {
      const result = calculateTestSuccess(
        false, // publishFailed
        3, // totalTests
        0, // failedTests
        false, // allPassed (not explicitly marked)
      );
      assertEquals(result, true);
    });

    it("should return false when some tests fail", () => {
      const result = calculateTestSuccess(
        false, // publishFailed
        5, // totalTests
        2, // failedTests
        false, // allPassed
      );
      assertEquals(result, false);
    });

    it("should return false when publish failed", () => {
      const result = calculateTestSuccess(
        true, // publishFailed
        5, // totalTests
        0, // failedTests
        true, // allPassed
      );
      assertEquals(result, false);
    });

    it("should return false when zero tests exist (the bug fix)", () => {
      // This is the key test - zero tests should NOT be considered success
      const result = calculateTestSuccess(
        false, // publishFailed
        0, // totalTests - NO TESTS!
        0, // failedTests
        false, // allPassed
      );
      assertEquals(result, false, "Zero tests should be treated as failure");
    });

    it("should return false when zero tests even if allPassed marker is true", () => {
      // Edge case: allPassed might be true but totalTests is 0
      const result = calculateTestSuccess(
        false, // publishFailed
        0, // totalTests
        0, // failedTests
        true, // allPassed (incorrectly set)
      );
      assertEquals(
        result,
        false,
        "Zero tests should fail even with allPassed=true",
      );
    });

    it("should return true with exactly one passing test", () => {
      const result = calculateTestSuccess(
        false, // publishFailed
        1, // totalTests
        0, // failedTests
        true, // allPassed
      );
      assertEquals(result, true);
    });

    it("should return false with one failing test", () => {
      const result = calculateTestSuccess(
        false, // publishFailed
        1, // totalTests
        1, // failedTests
        false, // allPassed
      );
      assertEquals(result, false);
    });
  });

  describe("Edge cases", () => {
    it("should handle negative test counts gracefully", () => {
      // While this shouldn't happen in practice, ensure no crashes
      const result = calculateTestSuccess(false, -1, 0, false);
      assertEquals(result, false);
    });

    it("should handle more failed tests than total (invalid state)", () => {
      // Invalid state but shouldn't crash
      const result = calculateTestSuccess(false, 3, 5, false);
      assertEquals(result, false);
    });
  });
});
