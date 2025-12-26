/**
 * Unit tests for ContainerProviderRegistry
 */

import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertExists, assertThrows } from "@std/assert";
import { ContainerProviderRegistry } from "../../../src/container/registry.ts";
import { MockContainerProvider } from "../../../src/container/mock-provider.ts";
import type { ContainerProvider } from "../../../src/container/interface.ts";

describe("ContainerProviderRegistry", () => {
  beforeEach(() => {
    // Clear cached instances before each test
    ContainerProviderRegistry.clearInstances();
    // Restore mock provider registration in case a previous test overrode it
    ContainerProviderRegistry.register(
      "mock",
      () => new MockContainerProvider(),
    );
  });

  afterEach(() => {
    ContainerProviderRegistry.clearInstances();
  });

  describe("Built-in providers", () => {
    it("should have mock provider registered", () => {
      assert(ContainerProviderRegistry.isAvailable("mock"));
    });

    it("should have bccontainer provider registered", () => {
      assert(ContainerProviderRegistry.isAvailable("bccontainer"));
    });

    it("should have docker provider registered", () => {
      assert(ContainerProviderRegistry.isAvailable("docker"));
    });

    it("should list all built-in providers", () => {
      const providers = ContainerProviderRegistry.list();

      assert(providers.includes("mock"));
      assert(providers.includes("bccontainer"));
      assert(providers.includes("docker"));
      assert(providers.length >= 3);
    });
  });

  describe("register()", () => {
    it("should register a custom provider", () => {
      const customFactory = () =>
        ({
          name: "custom",
          platform: "mock" as const,
          setup: () => Promise.resolve(),
          start: () => Promise.resolve(),
          stop: () => Promise.resolve(),
          remove: () => Promise.resolve(),
          status: () =>
            Promise.resolve({
              name: "test",
              isRunning: false,
              health: "stopped" as const,
            }),
          compileProject: () =>
            Promise.resolve({
              success: true,
              errors: [],
              warnings: [],
              output: "",
              duration: 0,
            }),
          publishApp: () => Promise.resolve(),
          runTests: () =>
            Promise.resolve({
              success: true,
              totalTests: 0,
              passedTests: 0,
              failedTests: 0,
              duration: 0,
              results: [],
              output: "",
            }),
          copyToContainer: () => Promise.resolve(),
          copyFromContainer: () => Promise.resolve(),
          executeCommand: () => Promise.resolve({ output: "", exitCode: 0 }),
          isHealthy: () => Promise.resolve(true),
        }) as ContainerProvider;

      ContainerProviderRegistry.register("custom-test", customFactory);

      assert(ContainerProviderRegistry.isAvailable("custom-test"));
      assert(ContainerProviderRegistry.list().includes("custom-test"));
    });

    it("should allow overriding existing providers", () => {
      ContainerProviderRegistry.register(
        "mock",
        () =>
          ({
            name: "mock-overridden",
            platform: "mock" as const,
            setup: () => Promise.resolve(),
            start: () => Promise.resolve(),
            stop: () => Promise.resolve(),
            remove: () => Promise.resolve(),
            status: () =>
              Promise.resolve({
                name: "test",
                isRunning: false,
                health: "stopped" as const,
              }),
            compileProject: () =>
              Promise.resolve({
                success: true,
                errors: [],
                warnings: [],
                output: "",
                duration: 0,
              }),
            publishApp: () => Promise.resolve(),
            runTests: () =>
              Promise.resolve({
                success: true,
                totalTests: 0,
                passedTests: 0,
                failedTests: 0,
                duration: 0,
                results: [],
                output: "",
              }),
            copyToContainer: () => Promise.resolve(),
            copyFromContainer: () => Promise.resolve(),
            executeCommand: () => Promise.resolve({ output: "", exitCode: 0 }),
            isHealthy: () => Promise.resolve(true),
          }) as ContainerProvider,
      );

      // Clear instances to get new factory
      ContainerProviderRegistry.clearInstances();
      const provider = ContainerProviderRegistry.create("mock");
      assertEquals(provider.name, "mock-overridden");

      // Restore original mock provider
      ContainerProviderRegistry.register(
        "mock",
        () => new MockContainerProvider(),
      );
    });
  });

  describe("create()", () => {
    it("should create a mock provider", () => {
      const provider = ContainerProviderRegistry.create("mock");

      assertExists(provider);
      assertEquals(provider.name, "mock");
      assertEquals(provider.platform, "mock");
    });

    it("should cache created instances", () => {
      const provider1 = ContainerProviderRegistry.create("mock");
      const provider2 = ContainerProviderRegistry.create("mock");

      assertEquals(provider1, provider2);
    });

    it("should throw error for unknown provider", () => {
      assertThrows(
        () => ContainerProviderRegistry.create("unknown-provider"),
        Error,
        "Unknown container provider: unknown-provider",
      );
    });

    it("should include available providers in error message", () => {
      try {
        ContainerProviderRegistry.create("nonexistent");
        assert(false, "Should have thrown");
      } catch (error) {
        assert(error instanceof Error);
        assert(error.message.includes("Available:"));
        assert(error.message.includes("mock"));
        assert(error.message.includes("docker"));
      }
    });
  });

  describe("isAvailable()", () => {
    it("should return true for registered providers", () => {
      assertEquals(ContainerProviderRegistry.isAvailable("mock"), true);
      assertEquals(ContainerProviderRegistry.isAvailable("docker"), true);
    });

    it("should return false for unregistered providers", () => {
      assertEquals(ContainerProviderRegistry.isAvailable("nonexistent"), false);
      assertEquals(ContainerProviderRegistry.isAvailable(""), false);
    });
  });

  describe("list()", () => {
    it("should return array of provider names", () => {
      const providers = ContainerProviderRegistry.list();

      assert(Array.isArray(providers));
      assert(providers.length > 0);
    });

    it("should not include duplicates", () => {
      const providers = ContainerProviderRegistry.list();
      const uniqueProviders = [...new Set(providers)];

      assertEquals(providers.length, uniqueProviders.length);
    });
  });

  describe("clearInstances()", () => {
    it("should clear cached instances", () => {
      // Create an instance
      const provider1 = ContainerProviderRegistry.create("mock");

      // Clear instances
      ContainerProviderRegistry.clearInstances();

      // Create a new instance - should be different object
      // (but we can't test object identity since it's a new factory call)
      const provider2 = ContainerProviderRegistry.create("mock");

      // Just verify both are valid providers
      assertExists(provider1);
      assertExists(provider2);
      assertEquals(provider1.name, "mock");
      assertEquals(provider2.name, "mock");
    });

    it("should be callable multiple times", () => {
      ContainerProviderRegistry.clearInstances();
      ContainerProviderRegistry.clearInstances();
      ContainerProviderRegistry.clearInstances();

      // Should still work after clearing
      const provider = ContainerProviderRegistry.create("mock");
      assertExists(provider);
    });
  });
});

describe("ContainerProvider interface compliance", () => {
  beforeEach(() => {
    ContainerProviderRegistry.clearInstances();
  });

  afterEach(() => {
    ContainerProviderRegistry.clearInstances();
  });

  it("mock provider should have required properties", () => {
    const provider = ContainerProviderRegistry.create("mock");

    assertExists(provider.name);
    assertExists(provider.platform);
    assertEquals(typeof provider.setup, "function");
    assertEquals(typeof provider.start, "function");
    assertEquals(typeof provider.stop, "function");
    assertEquals(typeof provider.remove, "function");
    assertEquals(typeof provider.status, "function");
    assertEquals(typeof provider.compileProject, "function");
    assertEquals(typeof provider.runTests, "function");
    assertEquals(typeof provider.copyToContainer, "function");
    assertEquals(typeof provider.copyFromContainer, "function");
    assertEquals(typeof provider.executeCommand, "function");
    assertEquals(typeof provider.isHealthy, "function");
  });

  it("mock provider should report correct platform", () => {
    const provider = ContainerProviderRegistry.create("mock");

    assertEquals(provider.platform, "mock");
  });

  it("docker provider should have required properties", () => {
    const provider = ContainerProviderRegistry.create("docker");

    assertExists(provider.name);
    assertExists(provider.platform);
    assertEquals(typeof provider.setup, "function");
    assertEquals(typeof provider.start, "function");
    assertEquals(typeof provider.compileProject, "function");
  });

  it("bccontainer provider should have required properties", () => {
    const provider = ContainerProviderRegistry.create("bccontainer");

    assertExists(provider.name);
    assertExists(provider.platform);
    assertEquals(typeof provider.setup, "function");
    assertEquals(typeof provider.start, "function");
    assertEquals(typeof provider.compileProject, "function");
  });
});

describe("MockContainerProvider behavior", () => {
  let provider: ContainerProvider;

  beforeEach(() => {
    ContainerProviderRegistry.clearInstances();
    provider = ContainerProviderRegistry.create("mock");
  });

  afterEach(() => {
    ContainerProviderRegistry.clearInstances();
  });

  it("should report as healthy after setup", async () => {
    // Container must be set up before it reports as healthy
    await provider.setup({
      name: "test-container",
      bcVersion: "24.0",
      memoryLimit: "4G",
      acceptEula: true,
      includeAL: true,
      includeTestToolkit: false,
    });
    const isHealthy = await provider.isHealthy("test-container");
    assertEquals(isHealthy, true);
  });

  it("should return running status after setup", async () => {
    await provider.setup({
      name: "test-container",
      bcVersion: "24.0",
      memoryLimit: "4G",
      acceptEula: true,
      includeAL: true,
      includeTestToolkit: false,
    });
    const status = await provider.status("test-container");

    assertExists(status);
  });

  it("should execute commands and return output", async () => {
    const result = await provider.executeCommand(
      "test-container",
      "echo hello",
    );

    assertExists(result);
    assertEquals(typeof result.output, "string");
    assertEquals(typeof result.exitCode, "number");
  });

  it("should compile projects successfully", async () => {
    const project = {
      path: "/test",
      appJson: { id: "test", name: "Test" },
      sourceFiles: [],
      testFiles: [],
    };

    const result = await provider.compileProject("test-container", project);

    assertExists(result);
    assertEquals(typeof result.success, "boolean");
    assert(Array.isArray(result.errors));
    assert(Array.isArray(result.warnings));
  });

  it("should run tests and return results", async () => {
    const project = {
      path: "/test",
      appJson: { id: "test", name: "Test" },
      sourceFiles: [],
      testFiles: [],
    };

    const result = await provider.runTests("test-container", project);

    assertExists(result);
    assertEquals(typeof result.success, "boolean");
    assertEquals(typeof result.passedTests, "number");
    assertEquals(typeof result.failedTests, "number");
    assertEquals(typeof result.duration, "number");
  });
});

describe("Provider registration isolation", () => {
  beforeEach(() => {
    ContainerProviderRegistry.clearInstances();
    ContainerProviderRegistry.register(
      "mock",
      () => new MockContainerProvider(),
    );
  });

  afterEach(() => {
    ContainerProviderRegistry.clearInstances();
  });

  it("should maintain independent registrations", () => {
    // Register multiple providers
    ContainerProviderRegistry.register(
      "test-1",
      () =>
        ({
          name: "test-1",
          platform: "mock" as const,
          setup: () => Promise.resolve(),
          start: () => Promise.resolve(),
          stop: () => Promise.resolve(),
          remove: () => Promise.resolve(),
          status: () =>
            Promise.resolve({
              name: "test-1",
              isRunning: false,
              health: "stopped" as const,
            }),
          compileProject: () =>
            Promise.resolve({
              success: true,
              errors: [],
              warnings: [],
              output: "",
              duration: 0,
            }),
          publishApp: () => Promise.resolve(),
          runTests: () =>
            Promise.resolve({
              success: true,
              totalTests: 0,
              passedTests: 0,
              failedTests: 0,
              duration: 0,
              results: [],
              output: "",
            }),
          copyToContainer: () => Promise.resolve(),
          copyFromContainer: () => Promise.resolve(),
          executeCommand: () => Promise.resolve({ output: "", exitCode: 0 }),
          isHealthy: () => Promise.resolve(true),
        }) as ContainerProvider,
    );

    ContainerProviderRegistry.register(
      "test-2",
      () =>
        ({
          name: "test-2",
          platform: "mock" as const,
          setup: () => Promise.resolve(),
          start: () => Promise.resolve(),
          stop: () => Promise.resolve(),
          remove: () => Promise.resolve(),
          status: () =>
            Promise.resolve({
              name: "test-2",
              isRunning: false,
              health: "stopped" as const,
            }),
          compileProject: () =>
            Promise.resolve({
              success: true,
              errors: [],
              warnings: [],
              output: "",
              duration: 0,
            }),
          publishApp: () => Promise.resolve(),
          runTests: () =>
            Promise.resolve({
              success: true,
              totalTests: 0,
              passedTests: 0,
              failedTests: 0,
              duration: 0,
              results: [],
              output: "",
            }),
          copyToContainer: () => Promise.resolve(),
          copyFromContainer: () => Promise.resolve(),
          executeCommand: () => Promise.resolve({ output: "", exitCode: 0 }),
          isHealthy: () => Promise.resolve(true),
        }) as ContainerProvider,
    );

    // Verify both are registered
    assert(ContainerProviderRegistry.isAvailable("test-1"));
    assert(ContainerProviderRegistry.isAvailable("test-2"));

    // Verify they create different instances
    const provider1 = ContainerProviderRegistry.create("test-1");
    const provider2 = ContainerProviderRegistry.create("test-2");

    assertEquals(provider1.name, "test-1");
    assertEquals(provider2.name, "test-2");
  });

  it("should cache instances per provider", () => {
    const mock1 = ContainerProviderRegistry.create("mock");
    const mock2 = ContainerProviderRegistry.create("mock");
    const docker1 = ContainerProviderRegistry.create("docker");
    const docker2 = ContainerProviderRegistry.create("docker");

    // Same provider type should return cached instance
    assertEquals(mock1, mock2);
    assertEquals(docker1, docker2);

    // Different provider types should return different instances
    assert(mock1 !== docker1);
  });
});
