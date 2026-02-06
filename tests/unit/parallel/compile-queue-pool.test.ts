/**
 * Unit tests for CompileQueuePool
 *
 * Tests the multi-container pool that routes work to least-loaded queues.
 */

import { assert, assertEquals, assertThrows } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";

import { CompileQueuePool } from "../../../src/parallel/compile-queue-pool.ts";
import { CompileQueue } from "../../../src/parallel/compile-queue.ts";
import {
  createMockContainerProvider,
  MockContainerProvider,
} from "../../utils/mock-container-provider.ts";
import { createMockCompileWorkItem } from "../../utils/test-helpers.ts";

// CompileQueue creates setTimeout handlers for timeouts that aren't cleared.
// Disable sanitizeOps to avoid timer leak errors.
describe({
  name: "CompileQueuePool",
  sanitizeOps: false,
  sanitizeResources: false,
}, () => {
  let mockProvider: MockContainerProvider;

  beforeEach(() => {
    mockProvider = createMockContainerProvider();
  });

  afterEach(() => {
    mockProvider.reset();
  });

  describe("constructor", () => {
    it("should create pool with multiple containers", () => {
      const pool = new CompileQueuePool(mockProvider, ["c1", "c2", "c3"]);

      assertEquals(pool.poolSize, 3);
      assertEquals(pool.length, 0);
      assertEquals(pool.isProcessing, false);
    });

    it("should create pool with single container", () => {
      const pool = new CompileQueuePool(mockProvider, ["c1"]);

      assertEquals(pool.poolSize, 1);
      assertEquals(pool.length, 0);
    });

    it("should throw if no container names provided", () => {
      assertThrows(
        () => new CompileQueuePool(mockProvider, []),
        Error,
        "at least one container name",
      );
    });

    it("should accept custom options", () => {
      const pool = new CompileQueuePool(mockProvider, ["c1", "c2"], {
        maxQueueSize: 5,
        timeout: 1000,
        compileConcurrency: 2,
      });

      assertEquals(pool.poolSize, 2);
    });
  });

  describe("enqueue", () => {
    it("should enqueue a work item and return a promise", () => {
      const pool = new CompileQueuePool(mockProvider, ["c1", "c2"]);
      const workItem = createMockCompileWorkItem();

      const promise = pool.enqueue(workItem);

      assertEquals(typeof promise.then, "function");
    });

    it("should complete a work item successfully", async () => {
      const pool = new CompileQueuePool(mockProvider, ["c1"]);
      const workItem = createMockCompileWorkItem();

      const result = await pool.enqueue(workItem);

      assert(result.compilationResult);
      assertEquals(result.workItemId, workItem.id);
    });
  });

  describe("length", () => {
    it("should report 0 when empty", () => {
      const pool = new CompileQueuePool(mockProvider, ["c1", "c2"]);

      assertEquals(pool.length, 0);
    });
  });

  describe("isProcessing", () => {
    it("should report false when idle", () => {
      const pool = new CompileQueuePool(mockProvider, ["c1", "c2"]);

      assertEquals(pool.isProcessing, false);
    });
  });

  describe("getStats", () => {
    it("should return aggregated stats", () => {
      const pool = new CompileQueuePool(mockProvider, ["c1", "c2", "c3"]);
      const stats = pool.getStats();

      assertEquals(stats.pending, 0);
      assertEquals(stats.processing, false);
      assertEquals(stats.activeCompilations, 0);
      assertEquals(stats.testRunning, false);
      assertEquals(stats.activeItems, 0);
      assertEquals(stats.processed, 0);
      assertEquals(stats.avgWaitTime, 0);
      assertEquals(stats.avgProcessTime, 0);
    });
  });

  describe("drain", () => {
    it("should resolve immediately when all queues are empty", async () => {
      const pool = new CompileQueuePool(mockProvider, ["c1", "c2"]);

      await pool.drain();
      // Should not hang
      assertEquals(pool.length, 0);
    });
  });

  describe("CompileWorkQueue interface", () => {
    it("CompileQueue should implement CompileWorkQueue", () => {
      const queue = new CompileQueue(mockProvider, "test-container");

      // Verify all interface methods exist
      assertEquals(typeof queue.enqueue, "function");
      assertEquals(typeof queue.drain, "function");
      assertEquals(typeof queue.length, "number");
      assertEquals(typeof queue.isProcessing, "boolean");
      assertEquals(typeof queue.getStats, "function");
    });

    it("CompileQueuePool should implement CompileWorkQueue", () => {
      const pool = new CompileQueuePool(mockProvider, ["c1"]);

      // Verify all interface methods exist
      assertEquals(typeof pool.enqueue, "function");
      assertEquals(typeof pool.drain, "function");
      assertEquals(typeof pool.length, "number");
      assertEquals(typeof pool.isProcessing, "boolean");
      assertEquals(typeof pool.getStats, "function");
    });
  });
});
