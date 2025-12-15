/**
 * Simple example test to demonstrate TDD setup is working
 */

import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals } from "@std/assert";

describe("Example Tests", () => {
  describe("Basic Functionality", () => {
    it("should run simple assertions", () => {
      assertEquals(2 + 2, 4);
      assert(true);
    });

    it("should handle string operations", () => {
      const greeting = "Hello, TDD!";
      assert(greeting.includes("TDD"));
      assertEquals(greeting.length, 11);
    });

    it("should work with arrays", () => {
      const items = ["test", "driven", "development"];
      assertEquals(items.length, 3);
      assert(items.includes("driven"));
    });
  });

  describe("Math Operations", () => {
    function add(a: number, b: number): number {
      return a + b;
    }

    function multiply(a: number, b: number): number {
      return a * b;
    }

    it("should add numbers correctly", () => {
      assertEquals(add(5, 3), 8);
      assertEquals(add(-1, 1), 0);
      assertEquals(add(0, 0), 0);
    });

    it("should multiply numbers correctly", () => {
      assertEquals(multiply(3, 4), 12);
      assertEquals(multiply(-2, 5), -10);
      assertEquals(multiply(0, 100), 0);
    });
  });

  describe("Async Operations", () => {
    function delay(ms: number): Promise<string> {
      return new Promise((resolve) => {
        setTimeout(() => resolve(`Delayed ${ms}ms`), ms);
      });
    }

    it("should handle async functions", async () => {
      const result = await delay(10);
      assertEquals(result, "Delayed 10ms");
    });

    it("should handle promises", async () => {
      const promise = Promise.resolve("test value");
      const result = await promise;
      assertEquals(result, "test value");
    });
  });
});
