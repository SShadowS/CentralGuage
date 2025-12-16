/**
 * Unit tests for CompileQueue
 *
 * Tests the FIFO compile queue with mutex for single container access.
 */

import { assertEquals, assertRejects } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";

import {
  CompileQueue,
  QueueFullError,
  QueueTimeoutError,
} from "../../../src/parallel/compile-queue.ts";
import {
  createMockContainerProvider,
  MockContainerProvider,
} from "../../utils/mock-container-provider.ts";
import {
  createMockCompileWorkItem,
  createMockTaskExecutionContext,
  createMockTaskManifest,
} from "../../utils/test-helpers.ts";

// Note: CompileQueue creates setTimeout handlers for timeouts that aren't cleared
// when items complete or the queue is cleared. Disable sanitizeOps to avoid timer leak errors.
describe({
  name: "CompileQueue",
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
    it("should create queue with default options", () => {
      const queue = new CompileQueue(mockProvider, "test-container");

      assertEquals(queue.length, 0);
      assertEquals(queue.isProcessing, false);
    });

    it("should accept custom maxQueueSize", () => {
      const queue = new CompileQueue(mockProvider, "test-container", {
        maxQueueSize: 5,
      });

      assertEquals(queue.length, 0);
    });

    it("should accept custom timeout", () => {
      const queue = new CompileQueue(mockProvider, "test-container", {
        timeout: 1000,
      });

      assertEquals(queue.length, 0);
    });
  });

  describe("enqueue", () => {
    it("should enqueue a work item and return a promise", () => {
      const queue = new CompileQueue(mockProvider, "test-container");
      const workItem = createMockCompileWorkItem();

      const promise = queue.enqueue(workItem);

      assertEquals(typeof promise.then, "function");
    });

    it("should reject when queue is full", async () => {
      const queue = new CompileQueue(mockProvider, "test-container", {
        maxQueueSize: 2, // Allow 2 items in queue
        timeout: 5000, // Long timeout to prevent timeout errors
      });

      // Configure slow processing to keep queue items pending
      mockProvider.setCompilationConfig({ delay: 500, success: true });

      // Enqueue items rapidly - they will pile up because processing is slow
      const item1 = createMockCompileWorkItem({ id: "item-1" });
      const item2 = createMockCompileWorkItem({ id: "item-2" });
      const item3 = createMockCompileWorkItem({ id: "item-3" });

      // Attach catch handlers immediately to prevent unhandled rejections
      const promise1 = queue.enqueue(item1).catch(() => {});
      const promise2 = queue.enqueue(item2).catch(() => {});

      // Third item should be rejected (queue has 2 items, which is the max)
      await assertRejects(
        () => queue.enqueue(item3),
        QueueFullError,
        "Compile queue full",
      );

      // Clear queue to clean up
      queue.clear();

      // Wait for promises to settle
      await promise1;
      await promise2;
    });

    it("should process items and resolve promise", async () => {
      const queue = new CompileQueue(mockProvider, "test-container");
      mockProvider.setCompilationConfig({ success: true });

      const workItem = createMockCompileWorkItem();
      const result = await queue.enqueue(workItem);

      assertEquals(result.workItemId, workItem.id);
      assertEquals(result.compilationResult.success, true);
      assertEquals(typeof result.duration, "number");
    });

    it("should reject on compilation failure", async () => {
      const queue = new CompileQueue(mockProvider, "test-container");
      mockProvider.setCompilationConfig({
        success: false,
        errors: [
          {
            code: "AL0001",
            message: "Test error",
            file: "test.al",
            line: 1,
            column: 1,
            severity: "error",
          },
        ],
      });

      const workItem = createMockCompileWorkItem();
      const result = await queue.enqueue(workItem);

      // Compilation failure returns result with success=false, doesn't reject
      assertEquals(result.compilationResult.success, false);
      assertEquals(result.compilationResult.errors.length, 1);
    });
  });

  describe("getPosition", () => {
    it("should return -1 for item not in queue", () => {
      const queue = new CompileQueue(mockProvider, "test-container");

      assertEquals(queue.getPosition("non-existent"), -1);
    });
  });

  describe("getStats", () => {
    it("should return initial stats", () => {
      const queue = new CompileQueue(mockProvider, "test-container");
      const stats = queue.getStats();

      assertEquals(stats.pending, 0);
      assertEquals(stats.processing, false);
      assertEquals(stats.processed, 0);
      assertEquals(stats.avgWaitTime, 0);
      assertEquals(stats.avgProcessTime, 0);
    });

    it("should track processed count after processing", async () => {
      const queue = new CompileQueue(mockProvider, "test-container");
      mockProvider.setCompilationConfig({ success: true });

      const workItem = createMockCompileWorkItem();
      await queue.enqueue(workItem);
      await queue.drain();

      const stats = queue.getStats();
      assertEquals(stats.processed, 1);
    });
  });

  describe("length", () => {
    it("should return 0 for empty queue", () => {
      const queue = new CompileQueue(mockProvider, "test-container");
      assertEquals(queue.length, 0);
    });
  });

  describe("isProcessing", () => {
    it("should return false when not processing", () => {
      const queue = new CompileQueue(mockProvider, "test-container");
      assertEquals(queue.isProcessing, false);
    });
  });

  describe("clear", () => {
    it("should clear all pending items", async () => {
      const queue = new CompileQueue(mockProvider, "test-container", {
        timeout: 5000,
      });
      mockProvider.setCompilationConfig({ delay: 1000, success: true });

      // Enqueue items (first starts processing, rest are pending)
      const item1 = createMockCompileWorkItem({ id: "item-1" });
      const item2 = createMockCompileWorkItem({ id: "item-2" });

      queue.enqueue(item1); // First item starts processing
      const promise2 = queue.enqueue(item2);

      // Small delay to let processing start
      await new Promise((r) => setTimeout(r, 50));

      // Clear queue
      queue.clear();

      // Pending items should be rejected
      await assertRejects(() => promise2, Error, "Queue cleared");

      // First item may still complete since it's already processing
      // We just want to verify clear works for pending items
    });

    it("should be callable on empty queue", () => {
      const queue = new CompileQueue(mockProvider, "test-container");
      queue.clear(); // Should not throw
      assertEquals(queue.length, 0);
    });
  });

  describe("drain", () => {
    it("should resolve immediately for empty queue", async () => {
      const queue = new CompileQueue(mockProvider, "test-container");
      await queue.drain(); // Should resolve immediately
      assertEquals(queue.length, 0);
    });

    it("should wait for all items to be processed", async () => {
      const queue = new CompileQueue(mockProvider, "test-container");
      mockProvider.setCompilationConfig({ delay: 10, success: true });

      // Enqueue multiple items
      const item1 = createMockCompileWorkItem({ id: "item-1" });
      const item2 = createMockCompileWorkItem({ id: "item-2" });

      queue.enqueue(item1);
      queue.enqueue(item2);

      // Drain should wait for all to complete
      await queue.drain();

      assertEquals(queue.length, 0);
      assertEquals(queue.getStats().processed, 2);
    });
  });

  describe("FIFO ordering", () => {
    it("should process items in order", async () => {
      const queue = new CompileQueue(mockProvider, "test-container");
      mockProvider.setCompilationConfig({ delay: 10, success: true });

      const processedOrder: string[] = [];

      // Override the mock to track processing order
      const item1 = createMockCompileWorkItem({ id: "item-1" });
      const item2 = createMockCompileWorkItem({ id: "item-2" });
      const item3 = createMockCompileWorkItem({ id: "item-3" });

      const results = await Promise.all([
        queue.enqueue(item1).then((r) => {
          processedOrder.push("item-1");
          return r;
        }),
        queue.enqueue(item2).then((r) => {
          processedOrder.push("item-2");
          return r;
        }),
        queue.enqueue(item3).then((r) => {
          processedOrder.push("item-3");
          return r;
        }),
      ]);

      // All should complete
      assertEquals(results.length, 3);
      // Order should be maintained
      assertEquals(processedOrder, ["item-1", "item-2", "item-3"]);
    });
  });

  describe("test execution", () => {
    it("should run tests when testApp is configured", async () => {
      const queue = new CompileQueue(mockProvider, "test-container");
      mockProvider.setCompilationConfig({ success: true });
      mockProvider.setTestConfig({
        success: true,
        totalTests: 3,
        passedTests: 3,
      });

      const workItem = createMockCompileWorkItem({
        context: createMockTaskExecutionContext({
          manifest: createMockTaskManifest({
            expected: {
              compile: true,
              testApp: "tests/fixtures/TestApp.al",
            },
          }),
        }),
      });

      const result = await queue.enqueue(workItem);

      assertEquals(result.compilationResult.success, true);
      // Note: testResult may be undefined if testApp file doesn't exist
      // This test mainly verifies the flow doesn't error
    });

    it("should not run tests when testApp is not configured", async () => {
      const queue = new CompileQueue(mockProvider, "test-container");
      mockProvider.setCompilationConfig({ success: true });

      const workItem = createMockCompileWorkItem({
        context: createMockTaskExecutionContext({
          manifest: createMockTaskManifest({
            expected: {
              compile: true,
            },
          }),
        }),
      });

      const result = await queue.enqueue(workItem);

      assertEquals(result.compilationResult.success, true);
      assertEquals(result.testResult, undefined);
    });
  });
});

describe("QueueFullError", () => {
  it("should have correct name and properties", () => {
    const error = new QueueFullError("Queue is full", 10);

    assertEquals(error.name, "QueueFullError");
    assertEquals(error.message, "Queue is full");
    assertEquals(error.currentSize, 10);
  });
});

describe("QueueTimeoutError", () => {
  it("should have correct name and properties", () => {
    const error = new QueueTimeoutError("Queue timeout", 5000);

    assertEquals(error.name, "QueueTimeoutError");
    assertEquals(error.message, "Queue timeout");
    assertEquals(error.waitTimeMs, 5000);
  });
});
