/**
 * Unit tests for Agent Registry
 */

import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { assertEquals, assertExists, assertThrows } from "@std/assert";
import { join } from "@std/path";
import { AgentRegistry } from "../../../src/agents/registry.ts";
import { cleanupTempDir, createTempDir } from "../../utils/test-helpers.ts";

describe("AgentRegistry", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("agent-registry-test");
    AgentRegistry.clear();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
    AgentRegistry.clear();
  });

  describe("load", () => {
    it("should load agents from directory", async () => {
      // Create agent config files
      await Deno.writeTextFile(
        join(tempDir, "agent1.yml"),
        `
id: agent1
name: Agent One
model: claude-sonnet-4-5-20250929
maxTurns: 10
allowedTools: [Read]
`,
      );
      await Deno.writeTextFile(
        join(tempDir, "agent2.yml"),
        `
id: agent2
name: Agent Two
model: gpt-4o
maxTurns: 15
allowedTools: [Write]
`,
      );

      await AgentRegistry.load(tempDir);

      const agents = AgentRegistry.list();
      assertEquals(agents.length, 2);
      assertEquals(agents.includes("agent1"), true);
      assertEquals(agents.includes("agent2"), true);
    });

    it("should handle empty directory", async () => {
      const emptyDir = join(tempDir, "empty");
      await Deno.mkdir(emptyDir);

      await AgentRegistry.load(emptyDir);

      assertEquals(AgentRegistry.list().length, 0);
    });

    it("should handle non-existent directory", async () => {
      await AgentRegistry.load(join(tempDir, "non-existent"));

      assertEquals(AgentRegistry.list().length, 0);
    });

    it("should be idempotent (only load once)", async () => {
      await Deno.writeTextFile(
        join(tempDir, "agent.yml"),
        `
id: single-agent
name: Single Agent
model: claude-sonnet-4-5-20250929
maxTurns: 10
allowedTools: [Read]
`,
      );

      await AgentRegistry.load(tempDir);
      await AgentRegistry.load(tempDir); // Second load should be no-op

      assertEquals(AgentRegistry.list().length, 1);
    });

    it("should reload after clear", async () => {
      await Deno.writeTextFile(
        join(tempDir, "agent.yml"),
        `
id: original
name: Original Agent
model: claude-sonnet-4-5-20250929
maxTurns: 10
allowedTools: [Read]
`,
      );

      await AgentRegistry.load(tempDir);
      assertEquals(AgentRegistry.list().includes("original"), true);

      // Change the file
      await Deno.remove(join(tempDir, "agent.yml"));
      await Deno.writeTextFile(
        join(tempDir, "new-agent.yml"),
        `
id: new-agent
name: New Agent
model: claude-sonnet-4-5-20250929
maxTurns: 10
allowedTools: [Read]
`,
      );

      // Clear and reload
      AgentRegistry.clear();
      await AgentRegistry.load(tempDir);

      assertEquals(AgentRegistry.list().includes("original"), false);
      assertEquals(AgentRegistry.list().includes("new-agent"), true);
    });
  });

  describe("get", () => {
    beforeEach(async () => {
      await Deno.writeTextFile(
        join(tempDir, "test-agent.yml"),
        `
id: test-agent
name: Test Agent
model: claude-sonnet-4-5-20250929
maxTurns: 10
maxTokens: 50000
allowedTools:
  - Read
  - Write
tags:
  - test
`,
      );
      await AgentRegistry.load(tempDir);
    });

    it("should return resolved agent config by id", () => {
      const config = AgentRegistry.get("test-agent");

      assertExists(config);
      assertEquals(config.id, "test-agent");
      assertEquals(config.name, "Test Agent");
      assertEquals(config.model, "claude-sonnet-4-5-20250929");
      assertEquals(config.maxTurns, 10);
      assertEquals(config.maxTokens, 50000);
      assertEquals(config.allowedTools, ["Read", "Write"]);
      assertEquals(config.tags, ["test"]);
    });

    it("should return undefined for non-existent agent", () => {
      const config = AgentRegistry.get("non-existent");

      assertEquals(config, undefined);
    });

    it("should return resolved config with inheritance chain", async () => {
      // Add parent and child agents
      await Deno.writeTextFile(
        join(tempDir, "parent.yml"),
        `
id: parent
name: Parent Agent
model: claude-sonnet-4-5-20250929
maxTurns: 5
maxTokens: 25000
allowedTools: [Read]
`,
      );
      await Deno.writeTextFile(
        join(tempDir, "child.yml"),
        `
id: child
name: Child Agent
model: gpt-4o
maxTurns: 10
extends: parent
allowedTools: [Read, Write]
`,
      );

      AgentRegistry.clear();
      await AgentRegistry.load(tempDir);

      const config = AgentRegistry.get("child");

      assertExists(config);
      assertEquals(config.model, "gpt-4o"); // Child override
      assertEquals(config.maxTokens, 25000); // Inherited from parent
      assertEquals(config._inheritanceChain, ["parent", "child"]);
    });
  });

  describe("getOrThrow", () => {
    beforeEach(async () => {
      await Deno.writeTextFile(
        join(tempDir, "existing.yml"),
        `
id: existing
name: Existing Agent
model: claude-sonnet-4-5-20250929
maxTurns: 10
allowedTools: [Read]
`,
      );
      await AgentRegistry.load(tempDir);
    });

    it("should return config for existing agent", () => {
      const config = AgentRegistry.getOrThrow("existing");

      assertEquals(config.id, "existing");
    });

    it("should throw for non-existent agent", () => {
      assertThrows(
        () => AgentRegistry.getOrThrow("non-existent"),
        Error,
        "Agent not found: non-existent",
      );
    });

    it("should include available agents in error message", () => {
      try {
        AgentRegistry.getOrThrow("missing");
      } catch (error) {
        assertEquals(
          (error as Error).message.includes("existing"),
          true,
        );
      }
    });
  });

  describe("list", () => {
    it("should return empty array when no agents loaded", () => {
      assertEquals(AgentRegistry.list(), []);
    });

    it("should return all agent ids", async () => {
      await Deno.writeTextFile(
        join(tempDir, "a.yml"),
        `
id: agent-a
name: Agent A
model: claude-sonnet-4-5-20250929
maxTurns: 10
allowedTools: [Read]
`,
      );
      await Deno.writeTextFile(
        join(tempDir, "b.yml"),
        `
id: agent-b
name: Agent B
model: claude-sonnet-4-5-20250929
maxTurns: 10
allowedTools: [Read]
`,
      );
      await Deno.writeTextFile(
        join(tempDir, "c.yml"),
        `
id: agent-c
name: Agent C
model: claude-sonnet-4-5-20250929
maxTurns: 10
allowedTools: [Read]
`,
      );

      await AgentRegistry.load(tempDir);

      const agents = AgentRegistry.list();

      assertEquals(agents.length, 3);
      assertEquals(agents.includes("agent-a"), true);
      assertEquals(agents.includes("agent-b"), true);
      assertEquals(agents.includes("agent-c"), true);
    });
  });

  describe("validate", () => {
    beforeEach(async () => {
      await Deno.writeTextFile(
        join(tempDir, "valid.yml"),
        `
id: valid-agent
name: Valid Agent
model: claude-sonnet-4-5-20250929
maxTurns: 10
allowedTools:
  - Read
  - Write
`,
      );
      await AgentRegistry.load(tempDir);
    });

    it("should return valid result for valid agent", () => {
      const result = AgentRegistry.validate("valid-agent");

      assertEquals(result.valid, true);
      assertEquals(result.errors.length, 0);
    });

    it("should return invalid result for non-existent agent", () => {
      const result = AgentRegistry.validate("non-existent");

      assertEquals(result.valid, false);
      assertEquals(result.errors.length, 1);
      assertEquals(result.errors[0]?.includes("not found"), true);
    });
  });

  describe("clear", () => {
    it("should clear all loaded agents", async () => {
      await Deno.writeTextFile(
        join(tempDir, "agent.yml"),
        `
id: to-be-cleared
name: Agent
model: claude-sonnet-4-5-20250929
maxTurns: 10
allowedTools: [Read]
`,
      );

      await AgentRegistry.load(tempDir);
      assertEquals(AgentRegistry.list().length, 1);

      AgentRegistry.clear();

      assertEquals(AgentRegistry.list().length, 0);
    });

    it("should allow reloading after clear", async () => {
      await Deno.writeTextFile(
        join(tempDir, "agent.yml"),
        `
id: reloadable
name: Agent
model: claude-sonnet-4-5-20250929
maxTurns: 10
allowedTools: [Read]
`,
      );

      await AgentRegistry.load(tempDir);
      AgentRegistry.clear();
      await AgentRegistry.load(tempDir);

      assertEquals(AgentRegistry.list().length, 1);
      assertEquals(AgentRegistry.list().includes("reloadable"), true);
    });

    it("should clear loaded directories tracking", async () => {
      await AgentRegistry.load(tempDir);
      const statsBefore = AgentRegistry.getStats();
      assertEquals(statsBefore.loadedDirs.length, 1);

      AgentRegistry.clear();

      const statsAfter = AgentRegistry.getStats();
      assertEquals(statsAfter.loadedDirs.length, 0);
    });
  });

  describe("getStats", () => {
    it("should return empty stats before loading", () => {
      const stats = AgentRegistry.getStats();

      assertEquals(stats.total, 0);
      assertEquals(stats.loadedDirs.length, 0);
    });

    it("should track loaded directories", async () => {
      await Deno.writeTextFile(
        join(tempDir, "agent.yml"),
        `
id: test-agent
name: Agent
model: claude-sonnet-4-5-20250929
maxTurns: 10
allowedTools: [Read]
`,
      );

      await AgentRegistry.load(tempDir);

      const stats = AgentRegistry.getStats();

      assertEquals(stats.total, 1);
      assertEquals(stats.loadedDirs.includes(tempDir), true);
    });
  });

  describe("inheritance resolution", () => {
    it("should handle complex inheritance chains", async () => {
      // Create a three-level inheritance chain
      await Deno.writeTextFile(
        join(tempDir, "base.yml"),
        `
id: base
name: Base Agent
model: claude-sonnet-4-5-20250929
maxTurns: 5
maxTokens: 10000
allowedTools: [Read]
mcpServers:
  base-server:
    command: node
    args: [base.js]
`,
      );
      await Deno.writeTextFile(
        join(tempDir, "middle.yml"),
        `
id: middle
name: Middle Agent
model: claude-sonnet-4-5-20250929
maxTurns: 10
extends: base
allowedTools: [Read, Write]
mcpServers:
  middle-server:
    command: node
    args: [middle.js]
`,
      );
      await Deno.writeTextFile(
        join(tempDir, "top.yml"),
        `
id: top
name: Top Agent
model: gpt-4o
maxTurns: 15
extends: middle
allowedTools: [Read, Write, Edit]
`,
      );

      await AgentRegistry.load(tempDir);

      const config = AgentRegistry.get("top");

      assertExists(config);
      assertEquals(config.model, "gpt-4o");
      assertEquals(config.maxTurns, 15);
      assertEquals(config.maxTokens, 10000); // From base
      assertEquals(config.allowedTools, ["Read", "Write", "Edit"]);
      assertExists(config.mcpServers?.["base-server"]); // Inherited
      assertExists(config.mcpServers?.["middle-server"]); // Inherited
      assertEquals(config._inheritanceChain, ["base", "middle", "top"]);
    });
  });
});
