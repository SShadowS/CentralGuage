/**
 * FIFO compile queue with mutex for single container access
 * Ensures only one compilation runs at a time
 */

import type {
  CompileWorkItem,
  CompileWorkResult,
  QueueStats,
} from "./types.ts";
import type { ContainerProvider } from "../container/interface.ts";
import type { TestResult } from "../container/types.ts";
import { ALProjectManager } from "../compiler/al-project.ts";

/**
 * Internal queue entry with resolve/reject callbacks
 */
interface QueueEntry {
  item: CompileWorkItem;
  resolve: (result: CompileWorkResult) => void;
  reject: (error: Error) => void;
  enqueuedAt: number;
}

/**
 * Promise-based mutex for single-resource access
 */
class Mutex {
  private locked = false;
  private waiters: Array<() => void> = [];

  acquire(): Promise<() => void> {
    if (!this.locked) {
      this.locked = true;
      return Promise.resolve(() => this.release());
    }

    return new Promise((resolve) => {
      this.waiters.push(() => {
        resolve(() => this.release());
      });
    });
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next) {
      next();
    } else {
      this.locked = false;
    }
  }

  isLocked(): boolean {
    return this.locked;
  }

  queueLength(): number {
    return this.waiters.length;
  }
}

/**
 * FIFO queue for container compilation operations
 */
export class CompileQueue {
  private queue: QueueEntry[] = [];
  private mutex = new Mutex();
  private containerProvider: ContainerProvider;
  private containerName: string;

  // Stats tracking
  private processedCount = 0;
  private totalWaitTime = 0;
  private totalProcessTime = 0;

  // Configuration
  private maxQueueSize: number;
  private timeout: number;

  constructor(
    containerProvider: ContainerProvider,
    containerName: string,
    options?: {
      maxQueueSize?: number;
      timeout?: number;
    },
  ) {
    this.containerProvider = containerProvider;
    this.containerName = containerName;
    this.maxQueueSize = options?.maxQueueSize ?? 100;
    this.timeout = options?.timeout ?? 300000; // 5 minutes default
  }

  /**
   * Enqueue a compile job and return promise that resolves when complete
   */
  enqueue(item: CompileWorkItem): Promise<CompileWorkResult> {
    // Check queue size limit
    if (this.queue.length >= this.maxQueueSize) {
      return Promise.reject(
        new QueueFullError(
          `Compile queue full (max ${this.maxQueueSize} items)`,
          this.queue.length,
        ),
      );
    }

    const enqueuedAt = Date.now();

    return new Promise<CompileWorkResult>((resolve, reject) => {
      // Add to queue
      this.queue.push({
        item,
        resolve,
        reject,
        enqueuedAt,
      });

      // Start processing (non-blocking)
      this.processQueue().catch((error) => {
        console.error("Error processing compile queue:", error);
      });

      // Set up timeout
      setTimeout(() => {
        const idx = this.queue.findIndex(
          (e) => e.item.id === item.id && e.enqueuedAt === enqueuedAt,
        );
        if (idx !== -1) {
          const [entry] = this.queue.splice(idx, 1);
          if (entry) {
            entry.reject(
              new QueueTimeoutError(
                `Compile queue timeout after ${this.timeout}ms`,
                Date.now() - enqueuedAt,
              ),
            );
          }
        }
      }, this.timeout);
    });
  }

  /**
   * Process queue items one at a time
   */
  private async processQueue(): Promise<void> {
    // Acquire mutex (blocks if already processing)
    const release = await this.mutex.acquire();

    try {
      while (this.queue.length > 0) {
        const entry = this.queue.shift();
        if (!entry) break;

        const waitTime = Date.now() - entry.enqueuedAt;
        this.totalWaitTime += waitTime;

        const processStart = Date.now();

        try {
          const result = await this.executeCompile(entry.item);
          this.processedCount++;
          this.totalProcessTime += Date.now() - processStart;
          entry.resolve(result);
        } catch (error) {
          this.processedCount++;
          this.totalProcessTime += Date.now() - processStart;
          entry.reject(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      }
    } finally {
      release();
    }
  }

  /**
   * Execute compilation and tests for a single item
   */
  private async executeCompile(
    item: CompileWorkItem,
  ): Promise<CompileWorkResult> {
    const startTime = Date.now();

    // Create temporary project with the generated code
    const projectDir = await this.createTempProject(item);

    // Load the project
    const project = await ALProjectManager.loadProject(projectDir);

    // Compile
    const compilationResult = await this.containerProvider.compileProject(
      this.containerName,
      project,
    );

    // Run tests if compilation succeeded and tests are configured
    let testResult: TestResult | undefined;
    if (compilationResult.success && item.context.manifest.expected.testApp) {
      testResult = await this.containerProvider.runTests(
        this.containerName,
        project,
      );
    }

    // Clean up temp project
    await this.cleanupTempProject(projectDir);

    const result: CompileWorkResult = {
      workItemId: item.id,
      compilationResult,
      duration: Date.now() - startTime,
    };
    if (testResult) {
      result.testResult = testResult;
    }
    return result;
  }

  /**
   * Create a temporary AL project for compilation
   */
  private async createTempProject(item: CompileWorkItem): Promise<string> {
    const tempDir = await Deno.makeTempDir({ prefix: "cg_compile_" });

    // Create app.json
    const appJson = {
      id: crypto.randomUUID(),
      name: `CentralGauge_${item.context.manifest.id}_${item.attemptNumber}`,
      publisher: "CentralGauge",
      version: "1.0.0.0",
      platform: "24.0.0.0",
      runtime: "13.0",
      application: "24.0.0.0",
      dependencies: [],
      features: ["NoImplicitWith"],
    };

    await Deno.writeTextFile(
      `${tempDir}/app.json`,
      JSON.stringify(appJson, null, 2),
    );

    // Write the generated code
    const codeFileName = `${item.context.manifest.id}.al`;
    await Deno.writeTextFile(`${tempDir}/${codeFileName}`, item.code);

    return tempDir;
  }

  /**
   * Clean up temporary project directory
   */
  private async cleanupTempProject(projectDir: string): Promise<void> {
    try {
      await Deno.remove(projectDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  }

  /**
   * Get current queue position for an item
   */
  getPosition(itemId: string): number {
    const idx = this.queue.findIndex((e) => e.item.id === itemId);
    return idx === -1 ? -1 : idx + 1; // 1-based position
  }

  /**
   * Get queue statistics
   */
  getStats(): QueueStats {
    return {
      pending: this.queue.length,
      processing: this.mutex.isLocked(),
      processed: this.processedCount,
      avgWaitTime: this.processedCount > 0
        ? this.totalWaitTime / this.processedCount
        : 0,
      avgProcessTime: this.processedCount > 0
        ? this.totalProcessTime / this.processedCount
        : 0,
    };
  }

  /**
   * Get number of pending items
   */
  get length(): number {
    return this.queue.length;
  }

  /**
   * Check if currently processing
   */
  get isProcessing(): boolean {
    return this.mutex.isLocked();
  }

  /**
   * Clear the queue (cancels pending items)
   */
  clear(): void {
    const error = new Error("Queue cleared");
    for (const entry of this.queue) {
      entry.reject(error);
    }
    this.queue = [];
  }

  /**
   * Wait for the queue to become empty
   */
  async drain(): Promise<void> {
    while (this.queue.length > 0 || this.mutex.isLocked()) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

/**
 * Error thrown when queue is full
 */
export class QueueFullError extends Error {
  constructor(
    message: string,
    public readonly currentSize: number,
  ) {
    super(message);
    this.name = "QueueFullError";
  }
}

/**
 * Error thrown when queue wait times out
 */
export class QueueTimeoutError extends Error {
  constructor(
    message: string,
    public readonly waitTimeMs: number,
  ) {
    super(message);
    this.name = "QueueTimeoutError";
  }
}
