/**
 * Unit tests for the debug parser
 */

import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { findLatestSession, parseDebugDir } from "../../../src/verify/mod.ts";

// Note: These tests use mock data in temp directories, not the actual debug dir

Deno.test("debug-parser: findLatestSession returns null for empty directory", async () => {
  // Create a temp directory
  const tempDir = await Deno.makeTempDir();
  try {
    const session = await findLatestSession(tempDir);
    assertEquals(session, null);
  } finally {
    await Deno.remove(tempDir);
  }
});

Deno.test("debug-parser: findLatestSession finds session from JSONL files", async () => {
  // Create a temp directory with mock session files
  const tempDir = await Deno.makeTempDir();
  const sessionId = "1234567890";

  try {
    // Create mock compilation log
    const header = {
      type: "debug_session_start",
      timestamp: new Date().toISOString(),
      provider: "compilation",
      sessionId: `session-${sessionId}`,
    };
    await Deno.writeTextFile(
      `${tempDir}/compilation-2025-01-01-session-${sessionId}.jsonl`,
      JSON.stringify(header) + "\n",
    );

    const session = await findLatestSession(tempDir);
    assertEquals(session, sessionId);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("debug-parser: parseDebugDir returns empty for no failures", async () => {
  // Create a temp directory with mock session files (all successful)
  const tempDir = await Deno.makeTempDir();
  const sessionId = "1234567890";

  try {
    // Create mock compilation log with success
    const header = {
      type: "debug_session_start",
      timestamp: new Date().toISOString(),
      provider: "compilation",
      sessionId: `session-${sessionId}`,
    };
    const successEntry = {
      type: "compilation_result",
      taskId: "CG-AL-E001",
      model: "test-model",
      attempt: 1,
      success: true,
      errors: [],
      output: "COMPILE_SUCCESS",
    };

    await Deno.writeTextFile(
      `${tempDir}/compilation-2025-01-01-session-${sessionId}.jsonl`,
      JSON.stringify(header) + "\n" + JSON.stringify(successEntry) + "\n",
    );

    // Create mock test log with success
    const testHeader = {
      type: "debug_session_start",
      timestamp: new Date().toISOString(),
      provider: "tests",
      sessionId: `session-${sessionId}`,
    };
    const testEntry = {
      type: "test_result",
      taskId: "CG-AL-E001",
      model: "test-model",
      attempt: 1,
      success: true,
      totalTests: 1,
      passedTests: 1,
      failedTests: 0,
      results: [],
      output: "ALL_TESTS_PASSED",
    };

    await Deno.writeTextFile(
      `${tempDir}/tests-2025-01-01-session-${sessionId}.jsonl`,
      JSON.stringify(testHeader) + "\n" + JSON.stringify(testEntry) + "\n",
    );

    const failures = await parseDebugDir(tempDir, sessionId);
    assertEquals(failures.length, 0);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("debug-parser: parseDebugDir finds compilation failures", async () => {
  // Create a temp directory with mock session files
  const tempDir = await Deno.makeTempDir();
  const sessionId = "1234567890";

  try {
    // Create mock compilation log with failure
    const header = {
      type: "debug_session_start",
      timestamp: new Date().toISOString(),
      provider: "compilation",
      sessionId: `session-${sessionId}`,
    };
    const failureEntry = {
      type: "compilation_result",
      taskId: "CG-AL-E002",
      model: "test-model",
      attempt: 1,
      success: false,
      errors: [
        {
          file: "test.al",
          line: 10,
          column: 5,
          code: "AL0185",
          message: "Table 'Test' is missing",
          severity: "error",
        },
      ],
      output: "COMPILE_ERROR",
    };

    await Deno.writeTextFile(
      `${tempDir}/compilation-2025-01-01-session-${sessionId}.jsonl`,
      JSON.stringify(header) + "\n" + JSON.stringify(failureEntry) + "\n",
    );

    const failures = await parseDebugDir(tempDir, sessionId);
    assertEquals(failures.length, 1);
    const failure = failures[0]!;
    assertEquals(failure.taskId, "CG-AL-E002");
    assertEquals(failure.failureType, "compilation");
    assertEquals(failure.model, "test-model");
    assertExists(failure.compilationErrors);
    assertEquals(failure.compilationErrors!.length, 1);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("debug-parser: parseDebugDir skips tasks that eventually succeeded", async () => {
  // Create a temp directory with mock session files
  const tempDir = await Deno.makeTempDir();
  const sessionId = "1234567890";

  try {
    // Create mock compilation log with failure then success
    const header = {
      type: "debug_session_start",
      timestamp: new Date().toISOString(),
      provider: "compilation",
      sessionId: `session-${sessionId}`,
    };
    const failureEntry = {
      type: "compilation_result",
      taskId: "CG-AL-E002",
      model: "test-model",
      attempt: 1,
      success: false,
      errors: [],
      output: "COMPILE_ERROR",
    };
    const successEntry = {
      type: "compilation_result",
      taskId: "CG-AL-E002",
      model: "test-model",
      attempt: 2,
      success: true,
      errors: [],
      output: "COMPILE_SUCCESS",
    };

    await Deno.writeTextFile(
      `${tempDir}/compilation-2025-01-01-session-${sessionId}.jsonl`,
      JSON.stringify(header) +
        "\n" +
        JSON.stringify(failureEntry) +
        "\n" +
        JSON.stringify(successEntry) +
        "\n",
    );

    // Create mock test log with success on attempt 2
    const testHeader = {
      type: "debug_session_start",
      timestamp: new Date().toISOString(),
      provider: "tests",
      sessionId: `session-${sessionId}`,
    };
    const testEntry = {
      type: "test_result",
      taskId: "CG-AL-E002",
      model: "test-model",
      attempt: 2,
      success: true,
      totalTests: 1,
      passedTests: 1,
      failedTests: 0,
      results: [],
      output: "ALL_TESTS_PASSED",
    };

    await Deno.writeTextFile(
      `${tempDir}/tests-2025-01-01-session-${sessionId}.jsonl`,
      JSON.stringify(testHeader) + "\n" + JSON.stringify(testEntry) + "\n",
    );

    const failures = await parseDebugDir(tempDir, sessionId);
    assertEquals(
      failures.length,
      0,
      "Task that succeeded on attempt 2 should not be in failures",
    );
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});
