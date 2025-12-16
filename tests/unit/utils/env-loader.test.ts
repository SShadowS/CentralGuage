/**
 * Unit tests for EnvLoader utility
 * Note: EnvLoader uses static state and caches environment on first load.
 * Tests are designed to work with the static nature of the class.
 */

import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertExists } from "@std/assert";
import { EnvLoader } from "../../../src/utils/env-loader.ts";

// Helper to reset EnvLoader static state
function resetEnvLoader() {
  // @ts-ignore - accessing private for testing
  EnvLoader.loadResult = null;
  // @ts-ignore - accessing private for testing
  EnvLoader.envConfig = {};
}

describe("EnvLoader", () => {
  // Save/restore environment state to prevent pollution
  const savedEnvValues = new Map<string, string | undefined>();
  const testKeys = [
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GOOGLE_API_KEY",
    "GEMINI_API_KEY",
    "OPENROUTER_API_KEY",
    "AZURE_OPENAI_API_KEY",
    "AZURE_OPENAI_ENDPOINT",
    "CENTRALGAUGE_TEMPERATURE",
    "CENTRALGAUGE_MAX_TOKENS",
    "CENTRALGAUGE_ATTEMPTS",
  ];

  beforeEach(() => {
    // Save all relevant env vars
    for (const key of testKeys) {
      savedEnvValues.set(key, Deno.env.get(key));
    }
    resetEnvLoader();
  });

  afterEach(() => {
    // Restore all env vars
    for (const key of testKeys) {
      const val = savedEnvValues.get(key);
      if (val !== undefined) {
        Deno.env.set(key, val);
      } else {
        try {
          Deno.env.delete(key);
        } catch {
          // Ignore
        }
      }
    }
    resetEnvLoader();
    savedEnvValues.clear();
  });

  describe("loadEnvironment", () => {
    it("should load environment and return result", async () => {
      const result = await EnvLoader.loadEnvironment();

      assertExists(result);
      assertEquals(typeof result.loaded, "boolean");
      assertExists(result.source);
      assert(Array.isArray(result.envVarsFound));
      assert(Array.isArray(result.apiKeysFound));
      assert(Array.isArray(result.configVarsFound));
      assert(Array.isArray(result.errors));
    });

    it("should cache result on subsequent calls", async () => {
      const result1 = await EnvLoader.loadEnvironment();
      const result2 = await EnvLoader.loadEnvironment();

      // Should return same object (cached)
      assertEquals(result1, result2);
    });

    it("should detect API keys from environment when set", async () => {
      // Set test values
      Deno.env.set("OPENAI_API_KEY", "test-openai-key-unique");
      Deno.env.set("ANTHROPIC_API_KEY", "test-anthropic-key-unique");

      const result = await EnvLoader.loadEnvironment();

      assert(
        result.apiKeysFound.includes("OPENAI_API_KEY") ||
          result.envVarsFound.includes("OPENAI_API_KEY"),
      );
    });

    it("should detect CentralGauge config from environment", async () => {
      Deno.env.set("CENTRALGAUGE_TEMPERATURE", "0.5");

      const result = await EnvLoader.loadEnvironment();

      assert(
        result.configVarsFound.includes("CENTRALGAUGE_TEMPERATURE") ||
          result.envVarsFound.includes("CENTRALGAUGE_TEMPERATURE"),
      );
    });
  });

  describe("get", () => {
    it("should return value when key exists", async () => {
      // Use LOCAL_LLM_ENDPOINT which is less likely to be in .env files
      Deno.env.set("LOCAL_LLM_ENDPOINT", "http://test-endpoint.local");
      await EnvLoader.loadEnvironment();

      const value = EnvLoader.get("LOCAL_LLM_ENDPOINT");
      // Should return a string (may be from .env file or our test value)
      assertEquals(typeof value, "string");
    });

    it("should return undefined for missing key", async () => {
      await EnvLoader.loadEnvironment();

      const value = EnvLoader.get("NONEXISTENT_KEY_FOR_TEST" as any);
      assertEquals(value, undefined);
    });

    it("should return fallback for missing key", async () => {
      await EnvLoader.loadEnvironment();
      const value = EnvLoader.get("NONEXISTENT_KEY_FOR_TEST" as any, "fallback");
      assertEquals(value, "fallback");
    });
  });

  describe("getAll", () => {
    it("should return copy of all env config", async () => {
      await EnvLoader.loadEnvironment();

      const all = EnvLoader.getAll();

      assertExists(all);
      assertEquals(typeof all, "object");
      // Just verify it's an object, don't check specific values
      // since .env file may override test values
    });

    it("should return copy not reference", async () => {
      await EnvLoader.loadEnvironment();
      const all1 = EnvLoader.getAll();
      const all2 = EnvLoader.getAll();

      // Should be different objects
      assert(all1 !== all2);
    });
  });

  describe("hasApiKey", () => {
    it("should return true when OpenAI key exists", async () => {
      Deno.env.set("OPENAI_API_KEY", "sk-test-has-api-key");
      await EnvLoader.loadEnvironment();

      assertEquals(EnvLoader.hasApiKey("openai"), true);
    });

    it("should return true when Anthropic key exists", async () => {
      Deno.env.set("ANTHROPIC_API_KEY", "sk-ant-test");
      await EnvLoader.loadEnvironment();

      assertEquals(EnvLoader.hasApiKey("anthropic"), true);
    });

    it("should return true when Google API key exists", async () => {
      Deno.env.set("GOOGLE_API_KEY", "AIza-test");
      await EnvLoader.loadEnvironment();

      assertEquals(EnvLoader.hasApiKey("google"), true);
      assertEquals(EnvLoader.hasApiKey("gemini"), true);
    });

    it("should return true when Gemini API key exists", async () => {
      Deno.env.set("GEMINI_API_KEY", "AIza-test-gemini");
      await EnvLoader.loadEnvironment();

      assertEquals(EnvLoader.hasApiKey("gemini"), true);
    });

    it("should return true when OpenRouter key exists", async () => {
      Deno.env.set("OPENROUTER_API_KEY", "sk-or-test");
      await EnvLoader.loadEnvironment();

      assertEquals(EnvLoader.hasApiKey("openrouter"), true);
    });

    it("should return true when Azure keys both exist", async () => {
      Deno.env.set("AZURE_OPENAI_API_KEY", "azure-key-test");
      Deno.env.set("AZURE_OPENAI_ENDPOINT", "https://test.openai.azure.com/");
      await EnvLoader.loadEnvironment();

      assertEquals(EnvLoader.hasApiKey("azure"), true);
    });
  });

  describe("getAvailableProviders", () => {
    it("should always include mock and local", async () => {
      await EnvLoader.loadEnvironment();
      const providers = EnvLoader.getAvailableProviders();

      assert(providers.includes("mock"));
      assert(providers.includes("local"));
    });

    it("should include openai when key set", async () => {
      Deno.env.set("OPENAI_API_KEY", "sk-test-providers");
      await EnvLoader.loadEnvironment();

      const providers = EnvLoader.getAvailableProviders();
      assert(providers.includes("openai"));
    });

    it("should include anthropic when key set", async () => {
      Deno.env.set("ANTHROPIC_API_KEY", "sk-ant-test-providers");
      await EnvLoader.loadEnvironment();

      const providers = EnvLoader.getAvailableProviders();
      assert(providers.includes("anthropic"));
    });

    it("should include azure-openai when both key and endpoint set", async () => {
      Deno.env.set("AZURE_OPENAI_API_KEY", "azure-key-providers");
      Deno.env.set("AZURE_OPENAI_ENDPOINT", "https://test.azure.com/");
      await EnvLoader.loadEnvironment();

      const providers = EnvLoader.getAvailableProviders();
      assert(providers.includes("azure-openai"));
    });
  });

  describe("validateEnvironment", () => {
    it("should return result with valid, warnings and errors arrays", async () => {
      await EnvLoader.loadEnvironment();

      const result = EnvLoader.validateEnvironment();
      assertEquals(typeof result.valid, "boolean");
      assert(Array.isArray(result.warnings));
      assert(Array.isArray(result.errors));
    });

    it("should not throw when validating any environment", async () => {
      await EnvLoader.loadEnvironment();

      // Should not throw
      const result = EnvLoader.validateEnvironment();
      assertExists(result);
    });
  });

  describe("generateSampleEnvFile", () => {
    it("should generate sample .env file content", () => {
      const sample = EnvLoader.generateSampleEnvFile();

      assert(sample.includes("OPENAI_API_KEY"));
      assert(sample.includes("ANTHROPIC_API_KEY"));
      assert(sample.includes("GOOGLE_API_KEY"));
      assert(sample.includes("AZURE_OPENAI_API_KEY"));
      assert(sample.includes("CENTRALGAUGE_TEMPERATURE"));
      assert(sample.includes("CENTRALGAUGE_MAX_TOKENS"));
    });

    it("should include comments", () => {
      const sample = EnvLoader.generateSampleEnvFile();

      assert(sample.includes("#"));
      assert(sample.includes("CentralGauge"));
    });
  });

  describe("displayEnvironmentStatus", () => {
    it("should not throw when loadResult is null", () => {
      resetEnvLoader();

      // Should not throw, just print error message
      EnvLoader.displayEnvironmentStatus();
    });

    it("should not throw when loadResult exists", async () => {
      await EnvLoader.loadEnvironment();

      // Should not throw
      EnvLoader.displayEnvironmentStatus();
      EnvLoader.displayEnvironmentStatus(false);
    });
  });
});
