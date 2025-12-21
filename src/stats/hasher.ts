/**
 * Config hash generation for identifying comparable benchmark runs
 *
 * The config hash uniquely identifies a benchmark configuration, allowing:
 * - Grouping runs with identical configs for trend analysis
 * - Detecting when configs change
 * - Comparing apples-to-apples across runs
 */

import { expandGlob } from "@std/fs";
import { basename, join, relative } from "@std/path";
import type {
  ConfigHashInput,
  HashedFileInfo,
  TaskContentHashInfo,
  TaskSetHashResult,
} from "./types.ts";

/**
 * Generate SHA-256 hash of input data
 */
async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generate a deterministic config hash from benchmark configuration
 *
 * The hash includes:
 * - Task manifests (IDs and content hashes)
 * - Model variants and their configurations
 * - Execution parameters (attempt limit, defaults)
 *
 * @param input The config hash input
 * @returns SHA-256 hash (64 hex characters)
 */
export async function generateConfigHash(
  input: ConfigHashInput,
): Promise<string> {
  // Sort for determinism
  const normalized = {
    tasks: [...input.taskManifests]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((t) => ({ id: t.id, hash: t.contentHash })),
    variants: [...input.variants]
      .sort((a, b) => a.variantId.localeCompare(b.variantId))
      .map((v) => ({
        id: v.variantId,
        config: sortObjectKeys(v.config as unknown as Record<string, unknown>),
      })),
    execution: {
      attemptLimit: input.execution.attemptLimit,
      temperature: input.execution.defaultTemperature,
      maxTokens: input.execution.defaultMaxTokens,
    },
  };

  const serialized = JSON.stringify(normalized);
  return await sha256(serialized);
}

/**
 * Generate a task set hash from task manifests only
 *
 * This is useful for grouping runs that tested the same tasks,
 * regardless of which models were used.
 *
 * @param tasks Array of task IDs and their content hashes
 * @returns SHA-256 hash (first 16 hex characters for brevity)
 */
export async function generateTaskSetHash(
  tasks: Array<{ id: string; contentHash: string }>,
): Promise<string> {
  const sorted = [...tasks]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((t) => ({ id: t.id, hash: t.contentHash }));

  const serialized = JSON.stringify(sorted);
  const fullHash = await sha256(serialized);
  // Return shorter hash for readability (still unique enough)
  return fullHash.slice(0, 16);
}

/**
 * Generate a content hash for a task manifest
 *
 * @param manifestContent The YAML content of the manifest
 * @returns SHA-256 hash (first 16 hex characters)
 */
export async function generateManifestHash(
  manifestContent: string,
): Promise<string> {
  // Normalize whitespace but preserve meaningful content
  const normalized = manifestContent.trim();
  const fullHash = await sha256(normalized);
  return fullHash.slice(0, 16);
}

/**
 * Sort object keys recursively for deterministic serialization
 */
function sortObjectKeys<T extends Record<string, unknown>>(
  obj: T,
): Record<string, unknown> {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) =>
      typeof item === "object" && item !== null
        ? sortObjectKeys(item as Record<string, unknown>)
        : item
    ) as unknown as Record<string, unknown>;
  }

  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    const value = obj[key];
    sorted[key] = typeof value === "object" && value !== null
      ? sortObjectKeys(value as Record<string, unknown>)
      : value;
  }
  return sorted;
}

/**
 * Generate a short hash suitable for display
 *
 * @param fullHash The full SHA-256 hash
 * @param length Number of characters (default 8)
 * @returns Shortened hash
 */
export function shortenHash(fullHash: string, length = 8): string {
  return fullHash.slice(0, length);
}

// =============================================================================
// Comprehensive Task Set Hashing (includes test .al files)
// =============================================================================

/**
 * Hash a single file's content
 * @param filePath Absolute path to file
 * @returns Hash info or null if file doesn't exist
 */
export async function hashFile(filePath: string): Promise<HashedFileInfo | null> {
  try {
    const content = await Deno.readTextFile(filePath);
    const hash = await sha256(content.trim());
    const stat = await Deno.stat(filePath);
    return {
      path: filePath,
      hash: hash.slice(0, 16),
      size: stat.size,
    };
  } catch {
    return null;
  }
}

/**
 * Extract task ID from manifest path
 * @example "tasks/easy/CG-AL-E008-basic-interface.yml" -> "CG-AL-E008"
 */
export function extractTaskId(manifestPath: string): string {
  const filename = basename(manifestPath);
  // Match pattern: CG-AL-{letter}{number(s)}
  const match = filename.match(/^(CG-AL-[A-Z]\d+)/);
  if (!match || !match[1]) {
    throw new Error(`Cannot extract task ID from: ${manifestPath}`);
  }
  return match[1];
}

/**
 * Determine difficulty level from manifest path
 */
export function extractDifficulty(
  manifestPath: string,
): "easy" | "medium" | "hard" {
  // Normalize path separators for cross-platform support
  const normalized = manifestPath.replace(/\\/g, "/");
  if (normalized.includes("/easy/")) {
    return "easy";
  }
  if (normalized.includes("/medium/")) {
    return "medium";
  }
  if (normalized.includes("/hard/")) {
    return "hard";
  }
  throw new Error(`Cannot determine difficulty from: ${manifestPath}`);
}

/**
 * Discover and hash all files for a single task
 * @param manifestPath Path to the YAML manifest
 * @param projectRoot Project root directory (default: cwd)
 * @param testsAlDir Path to tests/al directory relative to project root
 * @returns Task content hash info with warnings
 */
export async function hashTaskContent(
  manifestPath: string,
  projectRoot: string = Deno.cwd(),
  testsAlDir: string = "tests/al",
): Promise<TaskContentHashInfo & { warnings: string[] }> {
  const warnings: string[] = [];

  // Extract task info
  const taskId = extractTaskId(manifestPath);
  const difficulty = extractDifficulty(manifestPath);

  // Hash manifest
  const manifestContent = await Deno.readTextFile(manifestPath);
  const manifestHash = await generateManifestHash(manifestContent);

  // Find and hash test files
  const testDir = join(projectRoot, testsAlDir, difficulty);
  const testFilePattern = join(testDir, `${taskId}*.al`);
  const testFiles: HashedFileInfo[] = [];

  try {
    for await (const entry of expandGlob(testFilePattern)) {
      if (entry.isFile) {
        const hashInfo = await hashFile(entry.path);
        if (hashInfo) {
          // Store relative path for portability
          hashInfo.path = relative(projectRoot, entry.path).replace(/\\/g, "/");
          testFiles.push(hashInfo);
        }
      }
    }
  } catch (error) {
    warnings.push(`Error scanning test files for ${taskId}: ${error}`);
  }

  // Sort test files by path for determinism
  testFiles.sort((a, b) => a.path.localeCompare(b.path));

  // Warn if no test files found (might be intentional for some tasks)
  if (testFiles.length === 0) {
    warnings.push(`No test files found for ${taskId} in ${testDir}`);
  }

  // Compute combined hash (deterministic order)
  const combinedData = {
    manifest: manifestHash,
    testFiles: testFiles.map((f) => ({ path: f.path, hash: f.hash })),
  };
  const combinedHash = (await sha256(JSON.stringify(combinedData))).slice(0, 16);

  return {
    taskId,
    manifestHash,
    manifestPath: relative(projectRoot, manifestPath).replace(/\\/g, "/"),
    testFiles,
    combinedHash,
    warnings,
  };
}

/**
 * Generate comprehensive task set hash including all test files
 *
 * This hashes:
 * - All YAML manifest files
 * - All test .al files matching {taskId}*.al pattern
 * - The tests/al/app.json manifest
 *
 * @param manifestPaths Absolute paths to YAML manifest files
 * @param projectRoot Project root directory
 * @param testsAlDir Path to tests/al directory relative to project root
 * @returns Complete hash result with per-task details
 */
export async function generateComprehensiveTaskSetHash(
  manifestPaths: string[],
  projectRoot: string = Deno.cwd(),
  testsAlDir: string = "tests/al",
): Promise<TaskSetHashResult> {
  const tasks: TaskContentHashInfo[] = [];
  const allWarnings: string[] = [];
  const missingFiles: string[] = [];

  // Hash each task
  for (const manifestPath of manifestPaths) {
    try {
      const { warnings, ...taskInfo } = await hashTaskContent(
        manifestPath,
        projectRoot,
        testsAlDir,
      );
      tasks.push(taskInfo);
      allWarnings.push(...warnings);
    } catch (error) {
      allWarnings.push(`Failed to hash ${manifestPath}: ${error}`);
    }
  }

  // Hash tests/al/app.json
  const appJsonPath = join(projectRoot, testsAlDir, "app.json");
  let testAppManifestHash = "missing";
  try {
    const appJsonContent = await Deno.readTextFile(appJsonPath);
    testAppManifestHash = (await sha256(appJsonContent.trim())).slice(0, 16);
  } catch {
    allWarnings.push(`Test app manifest not found: ${appJsonPath}`);
    missingFiles.push(appJsonPath);
  }

  // Sort tasks by ID for determinism
  tasks.sort((a, b) => a.taskId.localeCompare(b.taskId));

  // Compute final hash
  const hashData = {
    testAppManifest: testAppManifestHash,
    tasks: tasks.map((t) => ({
      id: t.taskId,
      combined: t.combinedHash,
    })),
  };
  const finalHash = (await sha256(JSON.stringify(hashData))).slice(0, 16);

  // Count total files hashed
  const totalFilesHashed = tasks.reduce(
    (sum, t) => sum + t.testFiles.length + 1, // +1 for manifest
    testAppManifestHash !== "missing" ? 1 : 0, // +1 for app.json if exists
  );

  return {
    hash: finalHash,
    testAppManifestHash,
    computedAt: new Date(),
    taskCount: tasks.length,
    totalFilesHashed,
    tasks,
    missingFiles,
    warnings: allWarnings,
  };
}
