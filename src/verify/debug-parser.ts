/**
 * Debug output parser for the verify command
 * Parses JSONL debug files to find failing tasks
 */

import { exists } from "@std/fs";
import type {
  CompilationLogEntry,
  TestLogEntry,
} from "../utils/debug-logger.ts";
import type { FailingTask, TaskDifficulty } from "./types.ts";

/**
 * Session info extracted from debug directory
 */
interface SessionInfo {
  sessionId: string;
  compilationLogPath: string | null;
  testLogPath: string | null;
}

/**
 * Extract task difficulty from task ID
 */
function getDifficulty(taskId: string): TaskDifficulty {
  if (taskId.includes("-E")) return "easy";
  if (taskId.includes("-M")) return "medium";
  if (taskId.includes("-H")) return "hard";
  // Default to easy if unclear
  return "easy";
}

/**
 * Get the path to task YAML file based on task ID
 */
function getTaskYamlPath(taskId: string): string {
  const difficulty = getDifficulty(taskId);
  return `tasks/${difficulty}/${taskId}.yml`;
}

/**
 * Get the path to test AL file based on task ID
 */
function getTestAlPath(taskId: string): string {
  const difficulty = getDifficulty(taskId);
  return `tests/al/${difficulty}/${taskId}.Test.al`;
}

/**
 * Get the path to generated code artifact directory
 */
function getGeneratedCodePath(
  debugDir: string,
  taskId: string,
  model: string,
  attempt: number,
): string {
  // Model format in artifacts: "anthropic_claude-opus-4-5-20251101"
  // The model we get from logs is just "claude-opus-4-5-20251101"
  // We need to find the actual directory that contains this model
  return `${debugDir}/artifacts/${taskId}/anthropic_${model}/attempt_${attempt}/project`;
}

/**
 * Find all sessions in the debug directory
 */
async function findSessions(debugDir: string): Promise<SessionInfo[]> {
  const sessions = new Map<string, SessionInfo>();

  for await (const entry of Deno.readDir(debugDir)) {
    if (!entry.isFile || !entry.name.endsWith(".jsonl")) continue;

    // Parse session ID from filename pattern: {provider}-{timestamp}-session-{id}.jsonl
    const sessionMatch = entry.name.match(/session-(\d+)\.jsonl$/);
    if (!sessionMatch || !sessionMatch[1]) continue;

    const sessionId = sessionMatch[1];
    const filePath = `${debugDir}/${entry.name}`;

    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, {
        sessionId,
        compilationLogPath: null,
        testLogPath: null,
      });
    }

    const session = sessions.get(sessionId);
    if (!session) continue;

    if (entry.name.startsWith("compilation-")) {
      session.compilationLogPath = filePath;
    } else if (entry.name.startsWith("tests-")) {
      session.testLogPath = filePath;
    }
  }

  return Array.from(sessions.values());
}

/**
 * Find the latest session in the debug directory
 */
export async function findLatestSession(
  debugDir: string,
): Promise<string | null> {
  const sessions = await findSessions(debugDir);
  if (sessions.length === 0) return null;

  // Session IDs are timestamps, so the largest is the latest
  const sortedSessions = sessions.sort((a, b) =>
    parseInt(b.sessionId) - parseInt(a.sessionId)
  );

  const latestSession = sortedSessions[0];
  return latestSession ? latestSession.sessionId : null;
}

/**
 * Parse a JSONL file and extract entries of a specific type
 */
async function parseJsonlFile<T>(
  filePath: string,
  typeFilter: string,
): Promise<T[]> {
  const content = await Deno.readTextFile(filePath);
  const lines = content.split("\n").filter((line) => line.trim());
  const results: T[] = [];

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.type === typeFilter) {
        results.push(entry as T);
      }
    } catch {
      // Skip malformed lines
    }
  }

  return results;
}

/**
 * Parse compilation log for failures
 */
async function parseCompilationFailures(
  logPath: string,
): Promise<Map<string, CompilationLogEntry[]>> {
  type CompilationEntry = { type: string } & CompilationLogEntry;
  const entries = await parseJsonlFile<CompilationEntry>(
    logPath,
    "compilation_result",
  );

  const failures = new Map<string, CompilationLogEntry[]>();

  for (const entry of entries) {
    if (!entry.success) {
      const key = `${entry.taskId}_${entry.model}`;
      if (!failures.has(key)) {
        failures.set(key, []);
      }
      failures.get(key)!.push(entry);
    }
  }

  return failures;
}

/**
 * Parse test log for failures
 */
async function parseTestFailures(
  logPath: string,
): Promise<Map<string, TestLogEntry[]>> {
  type TestEntry = { type: string } & TestLogEntry;
  const entries = await parseJsonlFile<TestEntry>(logPath, "test_result");

  const failures = new Map<string, TestLogEntry[]>();

  for (const entry of entries) {
    if (!entry.success) {
      const key = `${entry.taskId}_${entry.model}`;
      if (!failures.has(key)) {
        failures.set(key, []);
      }
      failures.get(key)!.push(entry);
    }
  }

  return failures;
}

/**
 * Check if a task eventually succeeded (on a later attempt)
 */
function taskEventuallySucceeded(
  taskId: string,
  model: string,
  compilationEntries: CompilationLogEntry[],
  testEntries: TestLogEntry[],
): boolean {
  // Check if any compilation attempt succeeded
  const lastCompilation = compilationEntries
    .filter((e) => e.taskId === taskId && e.model === model)
    .sort((a, b) => b.attempt - a.attempt)[0];

  if (!lastCompilation?.success) return false;

  // Check if any test attempt succeeded
  const lastTest = testEntries
    .filter((e) => e.taskId === taskId && e.model === model)
    .sort((a, b) => b.attempt - a.attempt)[0];

  return lastTest?.success ?? false;
}

/**
 * Parse debug directory and find all failing tasks
 */
export async function parseDebugDir(
  debugDir: string,
  sessionId?: string,
): Promise<FailingTask[]> {
  // Validate debug directory exists
  if (!await exists(debugDir)) {
    throw new Error(`Debug directory does not exist: ${debugDir}`);
  }

  // Find session
  const targetSessionId = sessionId ?? await findLatestSession(debugDir);
  if (!targetSessionId) {
    throw new Error("No sessions found in debug directory");
  }

  // Find session files
  const sessions = await findSessions(debugDir);
  const session = sessions.find((s) => s.sessionId === targetSessionId);

  if (!session) {
    throw new Error(`Session not found: ${targetSessionId}`);
  }

  const failingTasks: FailingTask[] = [];

  // Parse all compilation entries (for checking eventual success)
  type CompilationEntry = { type: string } & CompilationLogEntry;
  type TestEntry = { type: string } & TestLogEntry;

  let allCompilationEntries: CompilationLogEntry[] = [];
  let allTestEntries: TestLogEntry[] = [];

  if (session.compilationLogPath) {
    allCompilationEntries = await parseJsonlFile<CompilationEntry>(
      session.compilationLogPath,
      "compilation_result",
    );
  }

  if (session.testLogPath) {
    allTestEntries = await parseJsonlFile<TestEntry>(
      session.testLogPath,
      "test_result",
    );
  }

  // Find compilation failures
  if (session.compilationLogPath) {
    const compilationFailures = await parseCompilationFailures(
      session.compilationLogPath,
    );

    for (const [key, failures] of compilationFailures) {
      // Get the last failure (highest attempt number)
      const sortedFailures = failures.sort((a, b) => b.attempt - a.attempt);
      const lastFailure = sortedFailures[0];
      if (!lastFailure) continue;

      const parts = key.split("_");
      const taskId = parts[0];
      const model = parts[1];
      if (!taskId || !model) continue;

      // Skip if task eventually succeeded
      if (
        taskEventuallySucceeded(
          taskId,
          model,
          allCompilationEntries,
          allTestEntries,
        )
      ) {
        continue;
      }

      failingTasks.push({
        taskId,
        difficulty: getDifficulty(taskId),
        failureType: "compilation",
        model,
        attempt: lastFailure.attempt,
        compilationErrors: lastFailure.errors,
        output: lastFailure.output,
        taskYamlPath: getTaskYamlPath(taskId),
        testAlPath: getTestAlPath(taskId),
        generatedCodePath: getGeneratedCodePath(
          debugDir,
          taskId,
          model,
          lastFailure.attempt,
        ),
        sessionId: targetSessionId,
      });
    }
  }

  // Find test failures (only for tasks that compiled successfully)
  if (session.testLogPath) {
    const testFailures = await parseTestFailures(session.testLogPath);

    for (const [key, failures] of testFailures) {
      const sortedFailures = failures.sort((a, b) => b.attempt - a.attempt);
      const lastFailure = sortedFailures[0];
      if (!lastFailure) continue;

      const parts = key.split("_");
      const taskId = parts[0];
      const model = parts[1];
      if (!taskId || !model) continue;

      // Skip if task eventually succeeded
      if (
        taskEventuallySucceeded(
          taskId,
          model,
          allCompilationEntries,
          allTestEntries,
        )
      ) {
        continue;
      }

      // Skip if we already have a compilation failure for this task/model
      const alreadyHasCompilationFailure = failingTasks.some(
        (t) =>
          t.taskId === taskId &&
          t.model === model &&
          t.failureType === "compilation",
      );

      if (alreadyHasCompilationFailure) continue;

      failingTasks.push({
        taskId,
        difficulty: getDifficulty(taskId),
        failureType: "test",
        model,
        attempt: lastFailure.attempt,
        testResults: lastFailure.results,
        output: lastFailure.output,
        taskYamlPath: getTaskYamlPath(taskId),
        testAlPath: getTestAlPath(taskId),
        generatedCodePath: getGeneratedCodePath(
          debugDir,
          taskId,
          model,
          lastFailure.attempt,
        ),
        sessionId: targetSessionId,
      });
    }
  }

  return failingTasks;
}

/**
 * Get debug parser statistics for a session
 */
export async function getSessionStats(
  debugDir: string,
  sessionId?: string,
): Promise<{
  totalCompilations: number;
  failedCompilations: number;
  totalTests: number;
  failedTests: number;
}> {
  const targetSessionId = sessionId ?? await findLatestSession(debugDir);
  if (!targetSessionId) {
    return {
      totalCompilations: 0,
      failedCompilations: 0,
      totalTests: 0,
      failedTests: 0,
    };
  }

  const sessions = await findSessions(debugDir);
  const session = sessions.find((s) => s.sessionId === targetSessionId);

  if (!session) {
    return {
      totalCompilations: 0,
      failedCompilations: 0,
      totalTests: 0,
      failedTests: 0,
    };
  }

  type CompilationEntry = { type: string } & CompilationLogEntry;
  type TestEntry = { type: string } & TestLogEntry;

  let totalCompilations = 0;
  let failedCompilations = 0;
  let totalTests = 0;
  let failedTests = 0;

  if (session.compilationLogPath) {
    const entries = await parseJsonlFile<CompilationEntry>(
      session.compilationLogPath,
      "compilation_result",
    );
    totalCompilations = entries.length;
    failedCompilations = entries.filter((e) => !e.success).length;
  }

  if (session.testLogPath) {
    const entries = await parseJsonlFile<TestEntry>(
      session.testLogPath,
      "test_result",
    );
    totalTests = entries.length;
    failedTests = entries.filter((e) => !e.success).length;
  }

  return {
    totalCompilations,
    failedCompilations,
    totalTests,
    failedTests,
  };
}
