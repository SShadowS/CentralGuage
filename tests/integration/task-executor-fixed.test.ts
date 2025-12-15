import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertExists } from "@std/assert";
import { join } from "@std/path";
import { ensureDir } from "@std/fs";
import { DefaultTaskExecutor } from "../../src/tasks/executor.ts";
import { LLMAdapterRegistry } from "../../src/llm/registry.ts";
import { ContainerProviderRegistry } from "../../src/container/registry.ts";
import { MockLLMAdapter } from "../../src/llm/mock-adapter.ts";
import { MockContainerProvider } from "../../src/container/mock-provider.ts";
import type { TaskExecutionConfig, TaskManifest } from "../../types/index.ts";

describe("TaskExecutor Integration Tests - Fixed", () => {
  let executor: DefaultTaskExecutor;
  let tempDir: string;
  let mockContainerProvider: MockContainerProvider;

  beforeEach(async () => {
    // Setup temporary directories
    tempDir = await Deno.makeTempDir({ prefix: "executor-test-" });

    // Create template directory with required templates
    const templateDir = join(tempDir, "templates");
    await ensureDir(templateDir);

    // Create required prompt templates
    const promptTemplate = `Task: {{description}}

Generate AL code for the following requirement:
{{expected}}`;

    const fixTemplate = `Fix the following compilation errors:
{{errors}}

Original code:
{{code}}`;

    await Deno.writeTextFile(
      join(templateDir, "prompt.md"),
      promptTemplate,
    );

    await Deno.writeTextFile(
      join(templateDir, "fix.md"),
      fixTemplate,
    );

    // Initialize executor with test template directory
    executor = new DefaultTaskExecutor(templateDir);

    // Create shared mock container provider instance
    mockContainerProvider = new MockContainerProvider();

    // Pre-setup the test container so isHealthy returns true
    await mockContainerProvider.setup({
      name: "test-container",
      bcVersion: "24.0",
      memoryLimit: "8G",
      acceptEula: true,
      includeAL: true,
      includeTestToolkit: true,
    });

    // Register mock providers for testing (return shared instance)
    LLMAdapterRegistry.register("mock", () => new MockLLMAdapter());
    ContainerProviderRegistry.register("mock", () => mockContainerProvider);
  });

  afterEach(async () => {
    try {
      await Deno.remove(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("Simple Code Generation Task", () => {
    it("should execute a basic task successfully", async () => {
      // Create task manifest matching the actual interface
      const manifest: TaskManifest = {
        id: "test-task-001",
        description: "Create a simple AL codeunit",
        prompt_template: "prompt.md",
        fix_template: "fix.md",
        max_attempts: 2,
        expected: {
          compile: true,
          testApp: "TestApp",
        },
        metrics: ["compile_success", "token_usage"],
      };

      // Configure execution matching the actual interface
      const config: TaskExecutionConfig = {
        taskManifest: manifest,
        llmProvider: "mock",
        llmModel: "mock-gpt-4",
        containerProvider: "mock",
        containerName: "test-container",
        templateDir: join(tempDir, "templates"),
        outputDir: join(tempDir, "output"),
        maxAttempts: 2,
        temperature: 0.1,
        maxTokens: 4000,
      };

      // Execute task
      const result = await executor.executeTask(config);

      // Verify results
      assertEquals(result.taskId, "test-task-001");
      assertEquals(result.model, "mock-gpt-4");
      assert(result.attempts.length > 0, "Should have at least one attempt");
      assertExists(result.finalResult);
      assert(result.totalDuration > 0);
      assert(result.metadata.totalTokens > 0);
    });

    it("should handle task validation errors", async () => {
      const invalidManifest: TaskManifest = {
        id: "invalid-task",
        description: "Invalid task",
        prompt_template: "non-existent.md",
        fix_template: "also-non-existent.md",
        max_attempts: 0, // Invalid
        expected: {
          compile: true,
          testApp: "",
        },
        metrics: [],
      };

      const config: TaskExecutionConfig = {
        taskManifest: invalidManifest,
        llmProvider: "mock",
        llmModel: "mock-gpt-4",
        containerProvider: "mock",
        containerName: "test-container",
        templateDir: join(tempDir, "templates"),
        outputDir: join(tempDir, "output"),
        maxAttempts: 2,
        temperature: 0.1,
        maxTokens: 4000,
      };

      let errorThrown = false;
      let errorMessage = "";

      try {
        await executor.executeTask(config);
      } catch (error) {
        errorThrown = true;
        errorMessage = error instanceof Error ? error.message : String(error);
      }

      assert(errorThrown, "Should throw error for invalid task");
      assert(errorMessage.includes("validation failed"));
    });
  });

  describe("Error Handling", () => {
    it("should respect attempt limits", async () => {
      const manifest: TaskManifest = {
        id: "limit-test",
        description: "Test attempt limits",
        prompt_template: "prompt.md",
        fix_template: "fix.md",
        max_attempts: 3,
        expected: {
          compile: true,
          testApp: "TestApp",
        },
        metrics: ["attempts", "compile_success"],
      };

      const config: TaskExecutionConfig = {
        taskManifest: manifest,
        llmProvider: "mock",
        llmModel: "mock-gpt-4",
        containerProvider: "mock",
        containerName: "test-container",
        templateDir: join(tempDir, "templates"),
        outputDir: join(tempDir, "output"),
        maxAttempts: 3,
        temperature: 0.1,
        maxTokens: 4000,
      };

      const result = await executor.executeTask(config);

      // Verify attempt limit is respected: either passes early or exhausts attempts
      assert(result.attempts.length >= 1, "Should have at least one attempt");
      assert(result.attempts.length <= 3, "Should not exceed attempt limit");

      // If passed, should stop early; if failed, should have used all attempts
      if (result.finalResult === "pass") {
        assert(result.passAttempt > 0, "Pass attempt should be recorded");
        assertEquals(
          result.attempts.length,
          result.passAttempt,
          "Should stop on success",
        );
      } else {
        assertEquals(
          result.attempts.length,
          3,
          "Should use all attempts on failure",
        );
        assertEquals(
          result.passAttempt,
          0,
          "Should have no pass attempt on failure",
        );
      }
    });
  });
});
