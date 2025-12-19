/**
 * Debug output parser for the verify command
 * Parses JSONL debug files to find failing tasks
 */

import { exists, expandGlob } from "@std/fs";
import type {
  CompilationLogEntry,
  TestLogEntry,
} from "../utils/debug-logger.ts";
import type {
  FailingTask,
  TaskDifficulty,
  TaskFailureAnalysis,
} from "./types.ts";

/**
 * Session info extracted from debug directory
 */
export interface SessionInfo {
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
 * Uses glob to find files matching the pattern taskId-*.yml or taskId.yml
 * Always returns a relative path for consistency with other path functions
 */
async function getTaskYamlPath(taskId: string): Promise<string> {
  const difficulty = getDifficulty(taskId);
  const pattern = `tasks/${difficulty}/${taskId}*.yml`;

  for await (const entry of expandGlob(pattern)) {
    // Return relative path using the found filename, not the absolute path
    // expandGlob returns absolute paths, but we want relative for consistency
    return `tasks/${difficulty}/${entry.name}`;
  }

  // Fallback to constructed path if no match found
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
 * The path is relative to debugDir and uses forward slashes for consistency
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
  // Normalize backslashes to forward slashes for consistency
  const normalizedDebugDir = debugDir.replace(/\\/g, "/");
  return `${normalizedDebugDir}/artifacts/${taskId}/anthropic_${model}/attempt_${attempt}/project`;
}

/**
 * Find all sessions in the debug directory
 */
export async function findSessions(debugDir: string): Promise<SessionInfo[]> {
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
 * Loaded session entries for checking eventual success
 */
interface SessionEntries {
  compilationEntries: CompilationLogEntry[];
  testEntries: TestLogEntry[];
}

/**
 * Context needed for processing failures
 */
interface FailureProcessingContext {
  debugDir: string;
  sessionId: string;
  entries: SessionEntries;
  existingFailures: FailingTask[];
}

/**
 * Validate debug directory and get target session
 */
async function validateAndGetSession(
  debugDir: string,
  sessionId?: string,
): Promise<{ session: SessionInfo; targetSessionId: string }> {
  if (!await exists(debugDir)) {
    throw new Error(`Debug directory does not exist: ${debugDir}`);
  }

  const targetSessionId = sessionId ?? await findLatestSession(debugDir);
  if (!targetSessionId) {
    throw new Error("No sessions found in debug directory");
  }

  const sessions = await findSessions(debugDir);
  const session = sessions.find((s) => s.sessionId === targetSessionId);

  if (!session) {
    throw new Error(`Session not found: ${targetSessionId}`);
  }

  return { session, targetSessionId };
}

/**
 * Load all session entries for checking eventual success
 */
async function loadAllSessionEntries(
  session: SessionInfo,
): Promise<SessionEntries> {
  type CompilationEntry = { type: string } & CompilationLogEntry;
  type TestEntry = { type: string } & TestLogEntry;

  let compilationEntries: CompilationLogEntry[] = [];
  let testEntries: TestLogEntry[] = [];

  if (session.compilationLogPath) {
    compilationEntries = await parseJsonlFile<CompilationEntry>(
      session.compilationLogPath,
      "compilation_result",
    );
  }

  if (session.testLogPath) {
    testEntries = await parseJsonlFile<TestEntry>(
      session.testLogPath,
      "test_result",
    );
  }

  return { compilationEntries, testEntries };
}

/**
 * Parse failure key into taskId and model
 */
function parseFailureKey(
  key: string,
): { taskId: string; model: string } | null {
  const parts = key.split("_");
  const taskId = parts[0];
  const model = parts[1];
  if (!taskId || !model) return null;
  return { taskId, model };
}

/**
 * Check if a failure should be skipped
 */
async function shouldSkipFailure(
  taskId: string,
  model: string,
  entries: SessionEntries,
): Promise<{ skip: boolean; taskYamlPath?: string }> {
  // Skip if task eventually succeeded
  if (
    taskEventuallySucceeded(
      taskId,
      model,
      entries.compilationEntries,
      entries.testEntries,
    )
  ) {
    return { skip: true };
  }

  // Skip if task file no longer exists
  const taskYamlPath = await getTaskYamlPath(taskId);
  if (!await exists(taskYamlPath)) {
    return { skip: true };
  }

  return { skip: false, taskYamlPath };
}

/**
 * Process compilation failures and return failing tasks
 */
async function collectCompilationFailures(
  session: SessionInfo,
  ctx: FailureProcessingContext,
): Promise<FailingTask[]> {
  if (!session.compilationLogPath) return [];

  const failures: FailingTask[] = [];
  const compilationFailures = await parseCompilationFailures(
    session.compilationLogPath,
  );

  for (const [key, keyFailures] of compilationFailures) {
    const sortedFailures = keyFailures.sort((a, b) => b.attempt - a.attempt);
    const lastFailure = sortedFailures[0];
    if (!lastFailure) continue;

    const parsed = parseFailureKey(key);
    if (!parsed) continue;

    const { taskId, model } = parsed;
    const skipResult = await shouldSkipFailure(taskId, model, ctx.entries);
    if (skipResult.skip || !skipResult.taskYamlPath) continue;

    failures.push({
      taskId,
      difficulty: getDifficulty(taskId),
      failureType: "compilation",
      model,
      attempt: lastFailure.attempt,
      compilationErrors: lastFailure.errors,
      output: lastFailure.output,
      taskYamlPath: skipResult.taskYamlPath,
      testAlPath: getTestAlPath(taskId),
      generatedCodePath: getGeneratedCodePath(
        ctx.debugDir,
        taskId,
        model,
        lastFailure.attempt,
      ),
      sessionId: ctx.sessionId,
    });
  }

  return failures;
}

/**
 * Process test failures and return failing tasks
 */
async function collectTestFailures(
  session: SessionInfo,
  ctx: FailureProcessingContext,
): Promise<FailingTask[]> {
  if (!session.testLogPath) return [];

  const failures: FailingTask[] = [];
  const testFailures = await parseTestFailures(session.testLogPath);

  for (const [key, keyFailures] of testFailures) {
    const sortedFailures = keyFailures.sort((a, b) => b.attempt - a.attempt);
    const lastFailure = sortedFailures[0];
    if (!lastFailure) continue;

    const parsed = parseFailureKey(key);
    if (!parsed) continue;

    const { taskId, model } = parsed;
    const skipResult = await shouldSkipFailure(taskId, model, ctx.entries);
    if (skipResult.skip || !skipResult.taskYamlPath) continue;

    // Skip if we already have a compilation failure for this task/model
    const alreadyHasCompilationFailure = ctx.existingFailures.some(
      (t) =>
        t.taskId === taskId &&
        t.model === model &&
        t.failureType === "compilation",
    );
    if (alreadyHasCompilationFailure) continue;

    failures.push({
      taskId,
      difficulty: getDifficulty(taskId),
      failureType: "test",
      model,
      attempt: lastFailure.attempt,
      testResults: lastFailure.results,
      output: lastFailure.output,
      taskYamlPath: skipResult.taskYamlPath,
      testAlPath: getTestAlPath(taskId),
      generatedCodePath: getGeneratedCodePath(
        ctx.debugDir,
        taskId,
        model,
        lastFailure.attempt,
      ),
      sessionId: ctx.sessionId,
    });
  }

  return failures;
}

/**
 * Parse debug directory and find all failing tasks
 */
export async function parseDebugDir(
  debugDir: string,
  sessionId?: string,
): Promise<FailingTask[]> {
  const { session, targetSessionId } = await validateAndGetSession(
    debugDir,
    sessionId,
  );
  const entries = await loadAllSessionEntries(session);

  const ctx: FailureProcessingContext = {
    debugDir,
    sessionId: targetSessionId,
    entries,
    existingFailures: [],
  };

  // Collect compilation failures first
  const compilationFailures = await collectCompilationFailures(session, ctx);
  ctx.existingFailures = compilationFailures;

  // Collect test failures (excluding tasks with compilation failures)
  const testFailures = await collectTestFailures(session, ctx);

  return [...compilationFailures, ...testFailures];
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

/**
 * Analyze failure patterns across models for filtering
 *
 * Groups failing tasks by taskId and determines whether each task
 * failed unanimously (all models) or partially (some models).
 *
 * @param tasks - List of failing tasks to analyze
 * @param allModels - List of all models that were tested
 * @returns Map of taskId -> TaskFailureAnalysis
 */
export function analyzeFailurePatterns(
  tasks: FailingTask[],
  allModels: string[],
): Map<string, TaskFailureAnalysis> {
  const analysis = new Map<string, TaskFailureAnalysis>();

  // Group tasks by taskId
  for (const task of tasks) {
    if (!analysis.has(task.taskId)) {
      analysis.set(task.taskId, {
        taskId: task.taskId,
        failedModels: [],
        totalFailures: 0,
        isUnanimousFail: false,
        tasks: [],
      });
    }

    const entry = analysis.get(task.taskId)!;
    entry.tasks.push(task);
    entry.totalFailures++;

    // Track unique models that failed
    if (!entry.failedModels.includes(task.model)) {
      entry.failedModels.push(task.model);
    }
  }

  // Determine unanimous failures
  const allModelsSet = new Set(allModels);
  for (const entry of analysis.values()) {
    // A task is unanimous if ALL tested models failed it
    entry.isUnanimousFail = allModelsSet.size > 0 &&
      entry.failedModels.length === allModelsSet.size &&
      entry.failedModels.every((m) => allModelsSet.has(m));
  }

  return analysis;
}
