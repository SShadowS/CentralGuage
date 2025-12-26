/**
 * FIFO compile queue with mutex for single container access
 * Ensures only one compilation runs at a time
 */

import { basename, dirname, join } from "@std/path";
import { ensureDir, exists } from "@std/fs";
import type {
  CompileWorkItem,
  CompileWorkResult,
  QueueStats,
} from "./types.ts";
import type { ContainerProvider } from "../container/interface.ts";
import type { TestResult } from "../container/types.ts";
import { ALProjectManager } from "../compiler/al-project.ts";
import { DebugLogger } from "../utils/debug-logger.ts";

/**
 * Critical error that should abort the entire benchmark run.
 * Used for infrastructure issues like disk space, container failures, etc.
 */
export class CriticalError extends Error {
  public readonly originalError: Error | undefined;

  constructor(message: string, originalError?: Error) {
    super(message);
    this.name = "CriticalError";
    this.originalError = originalError;
  }

  /**
   * Check if an error is a critical infrastructure error that should abort the run.
   */
  static isCriticalError(error: unknown): boolean {
    if (error instanceof CriticalError) return true;
    const message = error instanceof Error ? error.message : String(error);
    // Disk space errors
    if (message.includes("not enough space on the disk")) return true;
    if (message.includes("os error 112")) return true; // Windows disk full
    if (message.includes("ENOSPC")) return true; // Linux/Unix disk full
    // Container not running
    if (message.includes("container is not running")) return true;
    if (message.includes("Container not found")) return true;
    return false;
  }

  /**
   * Wrap an error as CriticalError if it matches critical patterns.
   */
  static wrapIfCritical(error: unknown): Error {
    if (CriticalError.isCriticalError(error)) {
      const message = error instanceof Error ? error.message : String(error);
      return new CriticalError(
        `Critical infrastructure error: ${message}`,
        error instanceof Error ? error : undefined,
      );
    }
    return error instanceof Error ? error : new Error(String(error));
  }
}

/**
 * Prereq app information
 */
interface PrereqApp {
  path: string;
  appJson: Record<string, unknown>;
  compiledAppPath?: string | undefined;
}

/**
 * Find prereq app directory for a given task ID.
 */
async function findPrereqApp(
  taskId: string,
  projectRoot: string,
): Promise<PrereqApp | null> {
  const prereqDir = join(projectRoot, "tests", "al", "dependencies", taskId);

  try {
    const stat = await Deno.stat(prereqDir);
    if (!stat.isDirectory) return null;

    const appJsonPath = join(prereqDir, "app.json");
    const appJsonContent = await Deno.readTextFile(appJsonPath);
    const appJson = JSON.parse(appJsonContent) as Record<string, unknown>;

    return { path: prereqDir, appJson };
  } catch {
    return null;
  }
}

/**
 * Find prereq app by its app ID (used for resolving dependencies).
 */
async function findPrereqAppById(
  appId: string,
  projectRoot: string,
): Promise<PrereqApp | null> {
  const depsDir = join(projectRoot, "tests", "al", "dependencies");

  try {
    for await (const entry of Deno.readDir(depsDir)) {
      if (!entry.isDirectory) continue;

      const appJsonPath = join(depsDir, entry.name, "app.json");
      try {
        const content = await Deno.readTextFile(appJsonPath);
        const appJson = JSON.parse(content) as Record<string, unknown>;
        if (appJson["id"] === appId) {
          return { path: join(depsDir, entry.name), appJson };
        }
      } catch {
        continue;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Find all prereq apps needed for a task, in dependency order.
 */
async function findAllPrereqApps(
  taskId: string,
  projectRoot: string,
): Promise<PrereqApp[]> {
  const result: PrereqApp[] = [];
  const visited = new Set<string>();

  async function collectDeps(prereq: PrereqApp): Promise<void> {
    const appId = prereq.appJson["id"] as string;
    if (visited.has(appId)) return;
    visited.add(appId);

    const deps = prereq.appJson["dependencies"] as
      | Array<{ id: string }>
      | undefined || [];
    for (const dep of deps) {
      const depPrereq = await findPrereqAppById(dep.id, projectRoot);
      if (depPrereq) {
        await collectDeps(depPrereq);
      }
    }

    result.push(prereq);
  }

  const mainPrereq = await findPrereqApp(taskId, projectRoot);
  if (mainPrereq) {
    await collectDeps(mainPrereq);
  }

  return result;
}

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
    let projectDir: string | undefined;
    try {
      projectDir = await this.createTempProject(item);
    } catch (error) {
      // Check for critical errors during project creation (e.g., disk space)
      throw CriticalError.wrapIfCritical(error);
    }

    try {
      return await this.executeCompileInner(item, projectDir, startTime);
    } finally {
      // Always clean up temp directory, even on error
      await this.cleanupTempProject(projectDir);
    }
  }

  /**
   * Inner compile execution (called within try/finally for cleanup)
   */
  private async executeCompileInner(
    item: CompileWorkItem,
    projectDir: string,
    startTime: number,
  ): Promise<CompileWorkResult> {
    // Find and compile prereq apps
    const taskId = item.context.manifest.id;
    const projectRoot = Deno.cwd();
    const prereqApps = await findAllPrereqApps(taskId, projectRoot);
    const compiledPrereqs: PrereqApp[] = [];

    for (const prereq of prereqApps) {
      // For chained prereqs, copy previously compiled prereqs to this prereq's .alpackages
      if (compiledPrereqs.length > 0) {
        const prereqAlpackages = join(prereq.path, ".alpackages");
        await ensureDir(prereqAlpackages);
        for (const compiled of compiledPrereqs) {
          if (compiled.compiledAppPath) {
            const appFileName = basename(compiled.compiledAppPath);
            const destPath = join(prereqAlpackages, appFileName);
            await Deno.copyFile(compiled.compiledAppPath, destPath);
          }
        }
      }

      const prereqProject = await ALProjectManager.loadProject(prereq.path);
      const prereqCompileResult = await this.containerProvider.compileProject(
        this.containerName,
        prereqProject,
      );
      if (!prereqCompileResult.success) {
        console.error(
          `[Prereq] Compilation failed for ${prereq.appJson["name"]}: ${
            prereqCompileResult.errors.map((e) => e.message).join(", ")
          }`,
        );
      } else {
        // Publish prereq immediately after successful compilation
        if (prereqCompileResult.artifactPath) {
          await this.containerProvider.publishApp(
            this.containerName,
            prereqCompileResult.artifactPath,
          );
        }
        compiledPrereqs.push({
          ...prereq,
          compiledAppPath: prereqCompileResult.artifactPath,
        });
      }
    }

    // Inject prereq dependencies into main app.json and copy symbols
    const lastPrereq = compiledPrereqs[compiledPrereqs.length - 1];
    if (lastPrereq) {
      const appJsonPath = join(projectDir, "app.json");
      const alpackagesDir = join(projectDir, ".alpackages");

      try {
        await ensureDir(alpackagesDir);

        // Copy all prereq .app files to .alpackages
        for (const prereq of compiledPrereqs) {
          if (prereq.compiledAppPath) {
            const appFileName = basename(prereq.compiledAppPath);
            const destPath = join(alpackagesDir, appFileName);
            await Deno.copyFile(prereq.compiledAppPath, destPath);
          }
        }

        // Update app.json with ALL prereq dependencies (for transitive resolution)
        const appJsonContent = await Deno.readTextFile(appJsonPath);
        const appJson = JSON.parse(appJsonContent);
        const deps = appJson["dependencies"] || [];

        for (const prereq of compiledPrereqs) {
          const prereqId = prereq.appJson["id"] as string;
          if (!deps.some((d: { id: string }) => d.id === prereqId)) {
            deps.push({
              id: prereqId,
              name: prereq.appJson["name"],
              publisher: prereq.appJson["publisher"],
              version: prereq.appJson["version"],
            });
          }
        }
        appJson["dependencies"] = deps;
        await Deno.writeTextFile(
          appJsonPath,
          JSON.stringify(appJson, null, 2),
        );
      } catch (e) {
        console.error(`[Prereq] Failed to inject dependency: ${e}`);
      }
    }

    // Load the project (after prereq injection)
    const project = await ALProjectManager.loadProject(projectDir);

    // Compile (track time separately)
    const compileStart = Date.now();
    const compilationResult = await this.containerProvider.compileProject(
      this.containerName,
      project,
    );
    const compileDuration = Date.now() - compileStart;

    // Log compilation result if debug is enabled
    const debugLogger = DebugLogger.getInstance();
    if (debugLogger) {
      await debugLogger.logCompilation(
        item.context.manifest.id,
        item.context.llmModel,
        item.attemptNumber,
        this.containerName,
        compilationResult,
      );
    }

    // Run tests if compilation succeeded and tests are configured (track time separately)
    let testResult: TestResult | undefined;
    let testDuration: number | undefined;
    if (compilationResult.success && item.context.manifest.expected.testApp) {
      // Prereqs are already published after compilation - just run tests
      const testStart = Date.now();
      testResult = await this.containerProvider.runTests(
        this.containerName,
        project,
        compilationResult.artifactPath,
      );
      testDuration = Date.now() - testStart;

      // Log test result if debug is enabled
      if (debugLogger && testResult) {
        await debugLogger.logTestResult(
          item.context.manifest.id,
          item.context.llmModel,
          item.attemptNumber,
          this.containerName,
          testResult,
        );
      }
    }

    // Save verbose artifacts (AL files and .app) before cleanup (cleanup is in finally block)
    if (debugLogger) {
      await debugLogger.saveVerboseArtifacts(
        item.context.manifest.id,
        item.context.variantId || item.context.llmModel,
        item.attemptNumber,
        projectDir,
        compilationResult.artifactPath,
      );
    }

    const result: CompileWorkResult = {
      workItemId: item.id,
      compilationResult,
      duration: Date.now() - startTime,
      compileDuration,
    };
    if (testResult) {
      result.testResult = testResult;
    }
    if (testDuration !== undefined) {
      result.testDuration = testDuration;
    }
    return result;
  }

  /**
   * Create a temporary AL project for compilation
   */
  private async createTempProject(item: CompileWorkItem): Promise<string> {
    const tempDir = await Deno.makeTempDir({ prefix: "cg_compile_" });

    // Check if we need test toolkit dependencies
    const hasTestApp = item.context.manifest.expected.testApp &&
      item.context.manifest.expected.testApp.length > 0;

    // Create app.json with test toolkit dependencies if needed
    const appJson: Record<string, unknown> = {
      id: crypto.randomUUID(),
      name: `CentralGauge_${item.context.manifest.id}_${item.attemptNumber}`,
      publisher: "CentralGauge",
      version: "1.0.0.0",
      platform: "24.0.0.0",
      runtime: "15.0",
      application: "24.0.0.0",
      idRanges: [{ from: 70000, to: 89999 }],
      features: ["NoImplicitWith"],
    };

    // Add test toolkit dependencies if testApp is specified
    if (hasTestApp) {
      appJson["dependencies"] = [
        {
          id: "dd0be2ea-f733-4d65-bb34-a28f4624fb14",
          name: "Library Assert",
          publisher: "Microsoft",
          version: "24.0.0.0",
        },
        {
          id: "5d86850b-0d76-4eca-bd7b-951ad998e997",
          name: "Tests-TestLibraries",
          publisher: "Microsoft",
          version: "24.0.0.0",
        },
      ];
    } else {
      appJson["dependencies"] = [];
    }

    await Deno.writeTextFile(
      `${tempDir}/app.json`,
      JSON.stringify(appJson, null, 2),
    );

    // Write the generated code
    const codeFileName = `${item.context.manifest.id}.al`;
    await Deno.writeTextFile(`${tempDir}/${codeFileName}`, item.code);

    // Copy test file(s) if testApp is specified
    // Also copies any helper files (enums, mocks) with the same task ID prefix
    if (hasTestApp) {
      const testAppPath = item.context.manifest.expected.testApp!;
      // Resolve testApp path relative to project root
      const fullTestPath = join(Deno.cwd(), testAppPath);
      const testDir = dirname(fullTestPath);
      const taskId = item.context.manifest.id;

      if (await exists(testDir)) {
        // Copy all .al files with the task ID prefix (test file + helpers)
        for await (const entry of Deno.readDir(testDir)) {
          if (
            entry.isFile && entry.name.endsWith(".al") &&
            entry.name.startsWith(taskId)
          ) {
            const srcPath = join(testDir, entry.name);
            await Deno.copyFile(srcPath, join(tempDir, entry.name));
          }
        }
      } else {
        console.warn(
          `[CompileQueue] Test directory not found: ${testDir}`,
        );
      }
    }

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
