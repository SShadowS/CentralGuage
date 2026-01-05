/**
 * Prereq App Resolution
 *
 * Shared utilities for finding and resolving prerequisite apps
 * that task tests depend on. Used by both agent executor and
 * task executor v2.
 */

import { basename, join } from "@std/path";
import { exists } from "@std/fs";

// =============================================================================
// Types
// =============================================================================

/**
 * Prereq app info with path and app.json content.
 * The compiledAppPath is populated after compilation.
 */
export interface PrereqApp {
  path: string;
  appJson: Record<string, unknown>;
  compiledAppPath?: string | undefined;
}

// =============================================================================
// Task ID Extraction
// =============================================================================

/**
 * Extract task ID from test file path.
 * @example "tests/al/easy/CG-AL-E002.Test.al" -> "CG-AL-E002"
 */
export function extractTaskIdFromTestPath(testFilePath: string): string | null {
  const fileName = basename(testFilePath);
  const match = fileName.match(/^(CG-AL-[A-Z]\d+)/);
  return match?.[1] ?? null;
}

/**
 * Extract project root from test file path.
 * Looks for "tests/al/" in the path and returns everything before it.
 */
export function extractProjectRoot(testFilePath: string): string {
  // Normalize path separators
  const normalized = testFilePath.replace(/\\/g, "/");
  const testsAlIndex = normalized.indexOf("tests/al/");
  if (testsAlIndex > 0) {
    return normalized.substring(0, testsAlIndex);
  }
  // If path starts with "tests/al/" or not found, use cwd
  return Deno.cwd();
}

// =============================================================================
// Prereq App Finding
// =============================================================================

/**
 * Find prereq app directory for a given task ID.
 * Checks for tests/al/dependencies/{task-id}/ directory.
 *
 * @param taskId - The task identifier (e.g., "CG-AL-E002")
 * @param projectRoot - The project root directory
 * @returns PrereqApp if found, null otherwise
 */
export async function findPrereqApp(
  taskId: string,
  projectRoot: string,
): Promise<PrereqApp | null> {
  const prereqDir = join(projectRoot, "tests", "al", "dependencies", taskId);

  try {
    const dirExists = await exists(prereqDir, { isDirectory: true });
    if (!dirExists) return null;

    const appJsonPath = join(prereqDir, "app.json");
    const appJsonContent = await Deno.readTextFile(appJsonPath);
    const appJson = JSON.parse(appJsonContent) as Record<string, unknown>;

    return { path: prereqDir, appJson };
  } catch {
    return null;
  }
}

/**
 * Find prereq app by its app ID (for resolving dependency chains).
 * Scans all directories under tests/al/dependencies/ to find matching app ID.
 *
 * @param appId - The app ID to search for (UUID from app.json)
 * @param projectRoot - The project root directory
 * @returns PrereqApp if found, null otherwise
 */
export async function findPrereqAppById(
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
 * Returns array with dependencies first, then the main prereq.
 * Handles circular dependencies by tracking visited app IDs.
 *
 * @param taskId - The task identifier (e.g., "CG-AL-E002")
 * @param projectRoot - The project root directory
 * @returns Array of PrereqApp in dependency order (dependencies first)
 */
export async function findAllPrereqApps(
  taskId: string,
  projectRoot: string,
): Promise<PrereqApp[]> {
  const result: PrereqApp[] = [];
  const visited = new Set<string>();

  async function collectDeps(prereq: PrereqApp): Promise<void> {
    const appId = prereq.appJson["id"] as string;
    if (visited.has(appId)) return;
    visited.add(appId);

    // First, process dependencies (ensures correct order)
    const deps = (prereq.appJson["dependencies"] as Array<{ id: string }>) ||
      [];
    for (const dep of deps) {
      const depPrereq = await findPrereqAppById(dep.id, projectRoot);
      if (depPrereq) {
        await collectDeps(depPrereq);
      }
    }

    // Then add this prereq
    result.push(prereq);
  }

  const mainPrereq = await findPrereqApp(taskId, projectRoot);
  if (mainPrereq) {
    await collectDeps(mainPrereq);
  }

  return result;
}
