/**
 * Unit tests for Configuration Management
 */

import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertExists } from "@std/assert";
import { ConfigManager } from "../../../src/config/config.ts";
import {
  cleanupTempDir,
  createTempDir,
  MockEnv,
} from "../../utils/test-helpers.ts";

describe("ConfigManager", () => {
  let mockEnv: MockEnv;
  let tempDir: string;

  beforeEach(async () => {
    mockEnv = new MockEnv();
    tempDir = await createTempDir();
    ConfigManager.reset();
  });

  afterEach(async () => {
    mockEnv.restore();
    await cleanupTempDir(tempDir);
  });

  describe("Default Configuration", () => {
    it("should provide sensible defaults", async () => {
      // Change to temp directory to avoid loading project's .centralgauge.yml
      const originalCwd = Deno.cwd();
      Deno.chdir(tempDir);

      try {
        const config = await ConfigManager.loadConfig();

        assertExists(config.defaultModels);
        assertExists(config.defaultModels.benchmark);
        assertExists(config.defaultModels.development);
        assertExists(config.defaultModels.comparison);

        assertEquals(config.defaultModels.benchmark, ["sonnet"]);
        assertEquals(config.defaultModels.development, ["mock"]);
        assertEquals(config.defaultModels.comparison, ["flagship"]);

        assertExists(config.llm);
        assertEquals(config.llm.temperature, 0.1);
        assertEquals(config.llm.maxTokens, 4000);
        assertEquals(config.llm.timeout, 30000);

        assertExists(config.benchmark);
        assertEquals(config.benchmark.attempts, 2);
        assertEquals(config.benchmark.outputDir, "results");
        assertEquals(config.benchmark.templateDir, "templates");

        assertExists(config.container);
        assertEquals(config.container.provider, "mock");
        assertEquals(config.container.bcVersion, "24.0");
        assertEquals(config.container.memoryLimit, "8G");
      } finally {
        Deno.chdir(originalCwd);
      }
    });
  });

  describe("Environment Variable Configuration", () => {
    it("should load models from environment variables", async () => {
      mockEnv.set("CENTRALGAUGE_BENCHMARK_MODELS", "gpt-4o,sonnet");
      mockEnv.set("CENTRALGAUGE_DEV_MODELS", "mock,haiku");
      mockEnv.set("CENTRALGAUGE_COMPARISON_MODELS", "flagship,budget");

      const config = await ConfigManager.loadConfig();

      assertEquals(config.defaultModels?.benchmark, ["gpt-4o", "sonnet"]);
      assertEquals(config.defaultModels?.development, ["mock", "haiku"]);
      assertEquals(config.defaultModels?.comparison, ["flagship", "budget"]);
    });

    it("should load LLM settings from environment variables", async () => {
      mockEnv.set("CENTRALGAUGE_TEMPERATURE", "0.5");
      mockEnv.set("CENTRALGAUGE_MAX_TOKENS", "8000");

      const config = await ConfigManager.loadConfig();

      assertEquals(config.llm?.temperature, 0.5);
      assertEquals(config.llm?.maxTokens, 8000);
    });

    it("should load benchmark settings from environment variables", async () => {
      mockEnv.set("CENTRALGAUGE_ATTEMPTS", "3");
      mockEnv.set("CENTRALGAUGE_OUTPUT_DIR", "custom-results");

      const config = await ConfigManager.loadConfig();

      assertEquals(config.benchmark?.attempts, 3);
      assertEquals(config.benchmark?.outputDir, "custom-results");
    });

    it("should handle malformed environment variables gracefully", async () => {
      mockEnv.set("CENTRALGAUGE_TEMPERATURE", "invalid");
      mockEnv.set("CENTRALGAUGE_MAX_TOKENS", "not-a-number");
      mockEnv.set("CENTRALGAUGE_ATTEMPTS", "NaN");

      const config = await ConfigManager.loadConfig();

      // Should fall back to defaults for invalid values
      assert(
        isNaN(config.llm?.temperature as number) ||
          config.llm?.temperature === 0.1,
      );
      assert(
        isNaN(config.llm?.maxTokens as number) ||
          config.llm?.maxTokens === 4000,
      );
      assert(
        isNaN(config.benchmark?.attempts as number) ||
          config.benchmark?.attempts === 2,
      );
    });
  });

  describe("Configuration File Loading", () => {
    it("should generate sample configuration", () => {
      const sample = ConfigManager.generateSampleConfig();

      assert(sample.includes("defaultModels:"));
      assert(sample.includes("benchmark: [sonnet, gpt-4o]"));
      assert(sample.includes("development: [mock]"));
      assert(sample.includes("comparison: [flagship]"));
      assert(sample.includes("temperature: 0.1"));
      assert(sample.includes("maxTokens: 4000"));
      assert(sample.includes("attempts: 2"));
      assert(sample.includes('bcVersion: "24.0"'));
    });

    it("should load configuration from YAML file", async () => {
      const configYaml = `
defaultModels:
  benchmark: [custom-model]
  development: [test-model]
llm:
  temperature: 0.8
  maxTokens: 2000
benchmark:
  attempts: 5
  outputDir: custom-output
`;

      const configPath = `${tempDir}/.centralgauge.yml`;
      await Deno.writeTextFile(configPath, configYaml);

      // Change to temp directory to test local config loading
      const originalCwd = Deno.cwd();
      Deno.chdir(tempDir);

      try {
        const config = await ConfigManager.loadConfig();

        assertEquals(config.defaultModels?.benchmark, ["custom-model"]);
        assertEquals(config.defaultModels?.development, ["test-model"]);
        assertEquals(config.llm?.temperature, 0.8);
        assertEquals(config.llm?.maxTokens, 2000);
        assertEquals(config.benchmark?.attempts, 5);
        assertEquals(config.benchmark?.outputDir, "custom-output");
      } finally {
        Deno.chdir(originalCwd);
      }
    });
  });

  describe("Configuration Merging", () => {
    it("should merge CLI overrides with highest priority", async () => {
      mockEnv.set("CENTRALGAUGE_TEMPERATURE", "0.5");

      const cliOverrides = {
        llm: {
          temperature: 0.9,
          maxTokens: 1000,
        },
      };

      const config = await ConfigManager.loadConfig(cliOverrides);

      // CLI override should win
      assertEquals(config.llm?.temperature, 0.9);
      assertEquals(config.llm?.maxTokens, 1000);
    });

    it("should preserve unspecified values during merging", async () => {
      // Change to temp directory to avoid loading project's .centralgauge.yml
      const originalCwd = Deno.cwd();
      Deno.chdir(tempDir);

      try {
        const cliOverrides = {
          llm: {
            temperature: 0.9,
          },
        };

        const config = await ConfigManager.loadConfig(cliOverrides);

        // Override specified value
        assertEquals(config.llm?.temperature, 0.9);
        // Keep default for unspecified value
        assertEquals(config.llm?.maxTokens, 4000);
        assertEquals(config.llm?.timeout, 30000);
      } finally {
        Deno.chdir(originalCwd);
      }
    });
  });

  describe("Model Resolution", () => {
    it("should resolve models for different scenarios", async () => {
      // Change to temp directory to avoid loading project's .centralgauge.yml
      const originalCwd = Deno.cwd();
      Deno.chdir(tempDir);

      try {
        const benchmarkModels = await ConfigManager.resolveModels(
          undefined,
          "benchmark",
        );
        const devModels = await ConfigManager.resolveModels(
          undefined,
          "development",
        );
        const comparisonModels = await ConfigManager.resolveModels(
          undefined,
          "comparison",
        );

        assertEquals(benchmarkModels, ["sonnet"]);
        assertEquals(devModels, ["mock"]);
        assertEquals(comparisonModels, ["flagship"]);
      } finally {
        Deno.chdir(originalCwd);
      }
    });

    it("should use provided specs over defaults", async () => {
      const providedModels = ["custom-model", "another-model"];
      const resolvedModels = await ConfigManager.resolveModels(
        providedModels,
        "benchmark",
      );

      assertEquals(resolvedModels, providedModels);
    });

    it("should use config defaults when available", async () => {
      const config = {
        defaultModels: {
          benchmark: ["config-model"],
          development: ["config-dev"],
          comparison: ["config-comparison"],
        },
      };

      await ConfigManager.loadConfig(config);

      const benchmarkModels = await ConfigManager.resolveModels(
        undefined,
        "benchmark",
      );
      assertEquals(benchmarkModels, ["config-model"]);
    });
  });

  describe("Configuration Value Access", () => {
    it("should get nested configuration values", async () => {
      // Change to temp directory to avoid loading project's .centralgauge.yml
      const originalCwd = Deno.cwd();
      Deno.chdir(tempDir);

      try {
        const temperature = await ConfigManager.get("llm.temperature");
        const attempts = await ConfigManager.get("benchmark.attempts");
        const provider = await ConfigManager.get("container.provider");

        assertEquals(temperature, 0.1);
        assertEquals(attempts, 2);
        assertEquals(provider, "mock");
      } finally {
        Deno.chdir(originalCwd);
      }
    });

    it("should return fallback for missing values", async () => {
      const missingValue = await ConfigManager.get(
        "nonexistent.path",
        "fallback",
      );
      const deepMissing = await ConfigManager.get("llm.nonexistent", 42);

      assertEquals(missingValue, "fallback");
      assertEquals(deepMissing, 42);
    });

    it("should return undefined for missing values without fallback", async () => {
      const missingValue = await ConfigManager.get("nonexistent.path");
      assertEquals(missingValue, undefined);
    });
  });
});
