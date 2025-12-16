/**
 * Unit tests for DebugLogger
 */

import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertExists } from "@std/assert";
import {
  type DebugConfig,
  DebugLogger,
} from "../../../src/utils/debug-logger.ts";
import {
  cleanupTempDir,
  createMockLLMResponse,
  createTempDir,
} from "../../utils/test-helpers.ts";

describe("DebugLogger", () => {
  let tempDir: string;
  let config: DebugConfig;

  beforeEach(async () => {
    tempDir = await createTempDir("debug-logger-test");
    config = {
      enabled: true,
      outputDir: tempDir,
      sessionId: "test-session-123",
      logLevel: "basic",
      includeRawResponse: false,
      includeRequestHeaders: false,
      maxFileSize: 10, // 10 MB
    };
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  describe("Static methods", () => {
    afterEach(() => {
      // Reset the singleton
      // @ts-ignore - accessing private static for testing
      DebugLogger.instance = null;
    });

    describe("initialize()", () => {
      it("should initialize the singleton instance", () => {
        const logger = DebugLogger.initialize(config);

        assertExists(logger);
        assertEquals(DebugLogger.getInstance(), logger);
      });

      it("should replace existing instance on re-initialize", () => {
        const logger1 = DebugLogger.initialize(config);
        const logger2 = DebugLogger.initialize({
          ...config,
          sessionId: "new-session",
        });

        assertEquals(DebugLogger.getInstance(), logger2);
        assert(logger1 !== logger2);
      });
    });

    describe("getInstance()", () => {
      it("should return null when not initialized", () => {
        assertEquals(DebugLogger.getInstance(), null);
      });

      it("should return the initialized instance", () => {
        DebugLogger.initialize(config);
        const instance = DebugLogger.getInstance();

        assertExists(instance);
      });
    });

    describe("isEnabled()", () => {
      it("should return false when not initialized", () => {
        assertEquals(DebugLogger.isEnabled(), false);
      });

      it("should return true when enabled", () => {
        DebugLogger.initialize(config);
        assertEquals(DebugLogger.isEnabled(), true);
      });

      it("should return false when disabled", () => {
        DebugLogger.initialize({ ...config, enabled: false });
        assertEquals(DebugLogger.isEnabled(), false);
      });
    });
  });

  describe("Logging methods", () => {
    let logger: DebugLogger;

    beforeEach(() => {
      // @ts-ignore - accessing private static for testing
      DebugLogger.instance = null;
      logger = DebugLogger.initialize(config);
    });

    afterEach(() => {
      // @ts-ignore - accessing private static for testing
      DebugLogger.instance = null;
    });

    describe("logInteraction()", () => {
      it("should log an LLM interaction", async () => {
        await logger.logInteraction(
          "mock",
          "generateCode",
          {
            prompt: "Generate code",
            temperature: 0.1,
            maxTokens: 4000,
          },
          {
            taskId: "test-task",
            attempt: 1,
            description: "Test task description",
          },
          createMockLLMResponse(),
          "codeunit 50100 Test {}",
          true,
          "al",
        );

        // Check that log file was created
        const files = [];
        for await (const entry of Deno.readDir(tempDir)) {
          files.push(entry.name);
        }
        assert(files.some((f) => f.includes("mock-")));
      });

      it("should not log when disabled", async () => {
        // @ts-ignore - accessing private static for testing
        DebugLogger.instance = null;
        const disabledLogger = DebugLogger.initialize({
          ...config,
          enabled: false,
        });

        await disabledLogger.logInteraction(
          "mock",
          "generateCode",
          { prompt: "Test", temperature: 0.1, maxTokens: 1000 },
          { taskId: "test", attempt: 1, description: "Test task" },
          createMockLLMResponse(),
          "code",
          false,
          "al",
        );

        // Check that no log files were created
        const files = [];
        for await (const entry of Deno.readDir(tempDir)) {
          files.push(entry.name);
        }
        assertEquals(files.length, 0);
      });
    });

    describe("logCompilation()", () => {
      it("should log compilation result", async () => {
        await logger.logCompilation(
          "test-task",
          "mock-gpt-4",
          1,
          "test-container",
          {
            success: true,
            errors: [],
            warnings: [],
            output: "Compilation succeeded",
            duration: 1000,
          },
        );

        // Check that compilation log file was created
        const files = [];
        for await (const entry of Deno.readDir(tempDir)) {
          files.push(entry.name);
        }
        assert(files.some((f) => f.includes("compilation-")));
      });

      it("should log compilation errors", async () => {
        await logger.logCompilation(
          "test-task",
          "mock-gpt-4",
          1,
          "test-container",
          {
            success: false,
            errors: [
              {
                file: "test.al",
                line: 10,
                column: 5,
                code: "AL0001",
                message: "Syntax error",
                severity: "error",
              },
            ],
            warnings: [],
            output: "Compilation failed",
            duration: 500,
          },
        );

        // Should complete without error
      });
    });

    describe("logTestResult()", () => {
      it("should log test result", async () => {
        await logger.logTestResult(
          "test-task",
          "mock-gpt-4",
          1,
          "test-container",
          {
            success: true,
            totalTests: 5,
            passedTests: 5,
            failedTests: 0,
            results: [
              { name: "Test1", passed: true, duration: 100 },
              { name: "Test2", passed: true, duration: 150 },
            ],
            duration: 2000,
            output: "All tests passed",
          },
        );

        // Check that test log file was created
        const files = [];
        for await (const entry of Deno.readDir(tempDir)) {
          files.push(entry.name);
        }
        assert(files.some((f) => f.includes("tests-")));
      });

      it("should log failed tests", async () => {
        await logger.logTestResult(
          "test-task",
          "mock-gpt-4",
          1,
          "test-container",
          {
            success: false,
            totalTests: 5,
            passedTests: 3,
            failedTests: 2,
            results: [
              { name: "Test1", passed: true, duration: 100 },
              {
                name: "Test2",
                passed: false,
                duration: 150,
                error: "Assertion failed",
              },
            ],
            duration: 2000,
            output: "2 tests failed",
          },
        );

        // Should complete without error
      });
    });

    describe("logError()", () => {
      it("should log an LLM error", async () => {
        await logger.logError(
          "mock",
          "generateCode",
          { prompt: "Test", temperature: 0.1, maxTokens: 1000 },
          { taskId: "test-task", attempt: 1, description: "Test task" },
          new Error("API rate limit exceeded"),
        );

        // Check that log file was created
        const files = [];
        for await (const entry of Deno.readDir(tempDir)) {
          files.push(entry.name);
        }
        assert(files.some((f) => f.includes("mock-")));
      });
    });

    describe("getSessionStats()", () => {
      it("should return session statistics", async () => {
        await logger.logInteraction(
          "mock",
          "generateCode",
          { prompt: "Test", temperature: 0.1, maxTokens: 1000 },
          { taskId: "test", attempt: 1, description: "Test task" },
          createMockLLMResponse(),
          "code",
          false,
          "al",
        );

        const stats = logger.getSessionStats();

        assertExists(stats.totalRequests);
        assertExists(stats.providersUsed);
        assert(stats.totalRequests >= 1);
        assert(stats.providersUsed.includes("mock"));
      });
    });
  });

  describe("Log levels", () => {
    afterEach(() => {
      // @ts-ignore - accessing private static for testing
      DebugLogger.instance = null;
    });

    it("should write basic logs at basic level", async () => {
      const basicLogger = DebugLogger.initialize({
        ...config,
        logLevel: "basic",
      });

      await basicLogger.logInteraction(
        "mock",
        "generateCode",
        { prompt: "Test", temperature: 0.1, maxTokens: 1000 },
        { taskId: "test", attempt: 1, description: "Test task" },
        createMockLLMResponse(),
        "code",
        false,
        "al",
      );

      // Basic log should not create details subdirectory
      const hasDetails = await Deno.stat(`${tempDir}/details`).then(
        () => true,
        () => false,
      );
      assertEquals(hasDetails, false);
    });

    it("should write detailed logs at detailed level", async () => {
      // @ts-ignore - accessing private static for testing
      DebugLogger.instance = null;
      const detailedLogger = DebugLogger.initialize({
        ...config,
        logLevel: "detailed",
      });

      await detailedLogger.logInteraction(
        "mock",
        "generateCode",
        { prompt: "Test", temperature: 0.1, maxTokens: 1000 },
        { taskId: "test", attempt: 1, description: "Test task" },
        createMockLLMResponse(),
        "code",
        false,
        "al",
      );

      // Detailed log should create details subdirectory
      const hasDetails = await Deno.stat(`${tempDir}/details`).then(
        () => true,
        () => false,
      );
      assertEquals(hasDetails, true);
    });

    it("should write verbose logs at verbose level", async () => {
      // @ts-ignore - accessing private static for testing
      DebugLogger.instance = null;
      const verboseLogger = DebugLogger.initialize({
        ...config,
        logLevel: "verbose",
      });

      await verboseLogger.logCompilation(
        "test-task",
        "mock-gpt-4",
        1,
        "test-container",
        {
          success: true,
          errors: [],
          warnings: [],
          output: "Compilation succeeded with verbose output",
          duration: 1000,
        },
      );

      // Verbose log should create compilation-output subdirectory
      const hasOutput = await Deno.stat(`${tempDir}/compilation-output`).then(
        () => true,
        () => false,
      );
      assertEquals(hasOutput, true);
    });
  });

  describe("generateSummaryReport()", () => {
    afterEach(() => {
      // @ts-ignore - accessing private static for testing
      DebugLogger.instance = null;
    });

    it("should generate summary report", async () => {
      const logger = DebugLogger.initialize(config);

      // Log some interactions first
      await logger.logInteraction(
        "mock",
        "generateCode",
        { prompt: "Test", temperature: 0.1, maxTokens: 1000 },
        { taskId: "test", attempt: 1, description: "Test task" },
        createMockLLMResponse(),
        "code",
        false,
        "al",
      );

      await logger.generateSummaryReport();

      // Check that summary file was created
      const files = [];
      for await (const entry of Deno.readDir(tempDir)) {
        files.push(entry.name);
      }
      assert(files.some((f) => f.includes("debug-summary-")));
    });

    it("should not generate summary when disabled", async () => {
      const disabledLogger = DebugLogger.initialize({
        ...config,
        enabled: false,
      });

      await disabledLogger.generateSummaryReport();

      // No files should be created
      const files = [];
      for await (const entry of Deno.readDir(tempDir)) {
        files.push(entry.name);
      }
      assertEquals(files.length, 0);
    });
  });

  describe("finalize()", () => {
    afterEach(() => {
      // @ts-ignore - accessing private static for testing
      DebugLogger.instance = null;
    });

    it("should finalize session and generate summary", async () => {
      const logger = DebugLogger.initialize(config);

      await logger.logInteraction(
        "mock",
        "generateCode",
        { prompt: "Test", temperature: 0.1, maxTokens: 1000 },
        { taskId: "test", attempt: 1, description: "Test task" },
        createMockLLMResponse(),
        "code",
        false,
        "al",
      );

      await logger.finalize();

      // Summary should be generated
      const files = [];
      for await (const entry of Deno.readDir(tempDir)) {
        files.push(entry.name);
      }
      assert(files.some((f) => f.includes("debug-summary-")));
    });

    it("should not throw when disabled", async () => {
      const disabledLogger = DebugLogger.initialize({
        ...config,
        enabled: false,
      });

      // Should not throw
      await disabledLogger.finalize();
    });
  });

  describe("Log content validation", () => {
    let logger: DebugLogger;

    beforeEach(() => {
      // @ts-ignore - accessing private static for testing
      DebugLogger.instance = null;
      logger = DebugLogger.initialize(config);
    });

    afterEach(() => {
      // @ts-ignore - accessing private static for testing
      DebugLogger.instance = null;
    });

    it("should write valid JSON lines in log file", async () => {
      await logger.logInteraction(
        "mock",
        "generateCode",
        { prompt: "Test", temperature: 0.1, maxTokens: 1000 },
        { taskId: "test", attempt: 1, description: "Test task" },
        createMockLLMResponse(),
        "code",
        false,
        "al",
      );

      // Find and read the log file
      let logFile = "";
      for await (const entry of Deno.readDir(tempDir)) {
        if (entry.name.includes("mock-") && entry.name.endsWith(".jsonl")) {
          logFile = `${tempDir}/${entry.name}`;
          break;
        }
      }

      assert(logFile !== "", "Log file should exist");
      const content = await Deno.readTextFile(logFile);
      const lines = content.split("\n").filter((l) => l.trim());

      // Each line should be valid JSON
      for (const line of lines) {
        const parsed = JSON.parse(line);
        assertExists(parsed.type);
      }
    });

    it("should include session header in log file", async () => {
      await logger.logInteraction(
        "anthropic",
        "generateCode",
        { prompt: "Test", temperature: 0.1, maxTokens: 1000 },
        { taskId: "test", attempt: 1, description: "Test task" },
        createMockLLMResponse(),
        "code",
        true,
        "al",
      );

      let logFile = "";
      for await (const entry of Deno.readDir(tempDir)) {
        if (
          entry.name.includes("anthropic-") && entry.name.endsWith(".jsonl")
        ) {
          logFile = `${tempDir}/${entry.name}`;
          break;
        }
      }

      const content = await Deno.readTextFile(logFile);
      const lines = content.split("\n").filter((l) => l.trim());
      assert(lines.length >= 1, "Should have at least 1 line");
      const header = JSON.parse(lines[0]!);

      assertEquals(header.type, "debug_session_start");
      assertEquals(header.provider, "anthropic");
      assertEquals(header.sessionId, config.sessionId);
      assertExists(header.centralgauge);
      assertExists(header.centralgauge.version);
      assertExists(header.centralgauge.platform);
    });

    it("should correctly log interaction data", async () => {
      const response = createMockLLMResponse();
      await logger.logInteraction(
        "openai",
        "generateFix",
        { prompt: "Fix this code", temperature: 0.5, maxTokens: 2000 },
        { taskId: "task-123", attempt: 2, description: "Fix test" },
        response,
        "fixed code here",
        true,
        "al",
      );

      let logFile = "";
      for await (const entry of Deno.readDir(tempDir)) {
        if (entry.name.includes("openai-") && entry.name.endsWith(".jsonl")) {
          logFile = `${tempDir}/${entry.name}`;
          break;
        }
      }

      const content = await Deno.readTextFile(logFile);
      const lines = content.split("\n").filter((l) => l.trim());
      assert(lines.length >= 2, "Should have at least 2 lines");
      const interaction = JSON.parse(lines[1]!);

      assertEquals(interaction.type, "llm_interaction");
      assertEquals(interaction.provider, "openai");
      assertEquals(interaction.operation, "generateFix");
      assertEquals(interaction.taskId, "task-123");
      assertEquals(interaction.attempt, 2);
      assertEquals(interaction.request.prompt, "Fix this code");
      assertEquals(interaction.request.temperature, 0.5);
      assertEquals(interaction.request.maxTokens, 2000);
      assertEquals(interaction.extractedCode, "fixed code here");
      assertEquals(interaction.metadata.extractedFromDelimiters, true);
      assertEquals(interaction.metadata.language, "al");
    });

    it("should correctly log error data", async () => {
      const testError = new Error("API rate limit exceeded");

      await logger.logError(
        "gemini",
        "generateCode",
        { prompt: "Generate code for testing", temperature: 0.1, maxTokens: 1000 },
        { taskId: "task-error", attempt: 1, description: "Error test" },
        testError,
      );

      let logFile = "";
      for await (const entry of Deno.readDir(tempDir)) {
        if (entry.name.includes("gemini-") && entry.name.endsWith(".jsonl")) {
          logFile = `${tempDir}/${entry.name}`;
          break;
        }
      }

      const content = await Deno.readTextFile(logFile);
      const lines = content.split("\n").filter((l) => l.trim());
      assert(lines.length >= 2, "Should have at least 2 lines");
      const errorEntry = JSON.parse(lines[1]!);

      assertEquals(errorEntry.type, "llm_error");
      assertEquals(errorEntry.provider, "gemini");
      assertEquals(errorEntry.operation, "generateCode");
      assertEquals(errorEntry.error.message, "API rate limit exceeded");
      assertEquals(errorEntry.error.name, "Error");
      assertExists(errorEntry.error.stack);
    });

    it("should truncate long prompts in error logs", async () => {
      const longPrompt = "A".repeat(500);
      await logger.logError(
        "mock",
        "generateCode",
        { prompt: longPrompt, temperature: 0.1, maxTokens: 1000 },
        { taskId: "task-long", attempt: 1, description: "Long prompt test" },
        new Error("Test error"),
      );

      let logFile = "";
      for await (const entry of Deno.readDir(tempDir)) {
        if (entry.name.includes("mock-") && entry.name.endsWith(".jsonl")) {
          logFile = `${tempDir}/${entry.name}`;
          break;
        }
      }

      const content = await Deno.readTextFile(logFile);
      const lines = content.split("\n").filter((l) => l.trim());
      assert(lines.length >= 2, "Should have at least 2 lines");
      const errorEntry = JSON.parse(lines[1]!);

      // Prompt should be truncated
      assert(errorEntry.request.prompt.length < 250);
      assert(errorEntry.request.prompt.endsWith("..."));
    });
  });

  describe("Summary report content", () => {
    afterEach(() => {
      // @ts-ignore - accessing private static for testing
      DebugLogger.instance = null;
    });

    it("should include statistics from all providers", async () => {
      const logger = DebugLogger.initialize(config);

      // Log interactions from multiple providers
      await logger.logInteraction(
        "anthropic",
        "generateCode",
        { prompt: "Test", temperature: 0.1, maxTokens: 1000 },
        { taskId: "test", attempt: 1, description: "Test task" },
        createMockLLMResponse(),
        "code",
        false,
        "al",
      );

      await logger.logInteraction(
        "openai",
        "generateFix",
        { prompt: "Test", temperature: 0.1, maxTokens: 1000 },
        { taskId: "test", attempt: 2, description: "Test task" },
        createMockLLMResponse(),
        "code",
        false,
        "al",
      );

      await logger.generateSummaryReport();

      // Find summary file
      let summaryFile = "";
      for await (const entry of Deno.readDir(tempDir)) {
        if (entry.name.includes("debug-summary-")) {
          summaryFile = `${tempDir}/${entry.name}`;
          break;
        }
      }

      const content = await Deno.readTextFile(summaryFile);
      const summary = JSON.parse(content);

      assertEquals(summary.type, "debug_summary");
      assertExists(summary.statistics.anthropic);
      assertExists(summary.statistics.openai);
      assertEquals(summary.totalRequests, 2);
    });

    it("should calculate correct totals in summary", async () => {
      const logger = DebugLogger.initialize(config);

      // Log multiple interactions
      for (let i = 0; i < 3; i++) {
        await logger.logInteraction(
          "mock",
          "generateCode",
          { prompt: "Test", temperature: 0.1, maxTokens: 1000 },
          { taskId: `test-${i}`, attempt: 1, description: "Test task" },
          createMockLLMResponse(),
          "code",
          false,
          "al",
        );
      }

      await logger.generateSummaryReport();

      let summaryFile = "";
      for await (const entry of Deno.readDir(tempDir)) {
        if (entry.name.includes("debug-summary-")) {
          summaryFile = `${tempDir}/${entry.name}`;
          break;
        }
      }

      const content = await Deno.readTextFile(summaryFile);
      const summary = JSON.parse(content);

      assertEquals(summary.totalRequests, 3);
      assertEquals(summary.statistics.mock.requests, 3);
    });
  });

  describe("Test output logging", () => {
    afterEach(() => {
      // @ts-ignore - accessing private static for testing
      DebugLogger.instance = null;
    });

    it("should create test-output directory at verbose level", async () => {
      const logger = DebugLogger.initialize({
        ...config,
        logLevel: "verbose",
      });

      await logger.logTestResult(
        "test-task",
        "mock-gpt-4",
        1,
        "test-container",
        {
          success: true,
          totalTests: 1,
          passedTests: 1,
          failedTests: 0,
          results: [{ name: "Test1", passed: true, duration: 100 }],
          duration: 100,
          output: "Verbose test output for analysis",
        },
      );

      // Should create test-output directory
      const hasOutput = await Deno.stat(`${tempDir}/test-output`).then(
        () => true,
        () => false,
      );
      assertEquals(hasOutput, true);
    });
  });

  describe("includeRawResponse option", () => {
    afterEach(() => {
      // @ts-ignore - accessing private static for testing
      DebugLogger.instance = null;
    });

    it("should include raw response when configured", async () => {
      const logger = DebugLogger.initialize({
        ...config,
        logLevel: "detailed",
        includeRawResponse: true,
      });

      const rawResponse = { rawData: "test", apiResponse: { id: "123" } };

      await logger.logInteraction(
        "mock",
        "generateCode",
        { prompt: "Test", temperature: 0.1, maxTokens: 1000 },
        { taskId: "test", attempt: 1, description: "Test task" },
        createMockLLMResponse(),
        "code",
        false,
        "al",
        rawResponse,
      );

      // Find details file
      let detailsFile = "";
      for await (const entry of Deno.readDir(`${tempDir}/details`)) {
        if (entry.name.endsWith(".json")) {
          detailsFile = `${tempDir}/details/${entry.name}`;
          break;
        }
      }

      const content = await Deno.readTextFile(detailsFile);
      const details = JSON.parse(content);

      assertEquals(details.rawResponse, rawResponse);
    });

    it("should include raw error when configured", async () => {
      const logger = DebugLogger.initialize({
        ...config,
        includeRawResponse: true,
      });

      const rawError = { statusCode: 429, headers: { "retry-after": "60" } };

      await logger.logError(
        "mock",
        "generateCode",
        { prompt: "Test", temperature: 0.1, maxTokens: 1000 },
        { taskId: "test", attempt: 1, description: "Test task" },
        new Error("Rate limited"),
        rawError,
      );

      let logFile = "";
      for await (const entry of Deno.readDir(tempDir)) {
        if (entry.name.includes("mock-") && entry.name.endsWith(".jsonl")) {
          logFile = `${tempDir}/${entry.name}`;
          break;
        }
      }

      const content = await Deno.readTextFile(logFile);
      const lines = content.split("\n").filter((l) => l.trim());
      assert(lines.length >= 2, "Should have at least 2 lines");
      const errorEntry = JSON.parse(lines[1]!);

      assertEquals(errorEntry.rawError, rawError);
    });
  });
});
