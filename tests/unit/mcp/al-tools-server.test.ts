import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { ensureDir } from "@std/fs";
import {
  loadTaskTarget,
  loadTestCodeunitId,
} from "../../../mcp/al-tools-server.ts";

describe("al-tools-server", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await Deno.makeTempDir({ prefix: "al-tools-test-" });
  });

  afterEach(async () => {
    try {
      await Deno.remove(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("loadTaskTarget", () => {
    it("should return OnPrem when metadata.target is OnPrem", async () => {
      // Create task directory structure
      const tasksDir = join(tempDir, "tasks", "medium");
      await ensureDir(tasksDir);

      // Create task YAML with OnPrem target
      const taskYaml = `id: CG-AL-M022
description: Test task
metadata:
  target: OnPrem
expected:
  compile: true
`;
      await Deno.writeTextFile(
        join(tasksDir, "CG-AL-M022-mock-httpclient.yml"),
        taskYaml,
      );

      const target = await loadTaskTarget("CG-AL-M022", tempDir);
      assertEquals(target, "OnPrem");
    });

    it("should return Cloud when metadata.target is Cloud", async () => {
      const tasksDir = join(tempDir, "tasks", "easy");
      await ensureDir(tasksDir);

      const taskYaml = `id: CG-AL-E001
description: Test task
metadata:
  target: Cloud
expected:
  compile: true
`;
      await Deno.writeTextFile(
        join(tasksDir, "CG-AL-E001-basic-table.yml"),
        taskYaml,
      );

      const target = await loadTaskTarget("CG-AL-E001", tempDir);
      assertEquals(target, "Cloud");
    });

    it("should return undefined when metadata.target is not set", async () => {
      const tasksDir = join(tempDir, "tasks", "hard");
      await ensureDir(tasksDir);

      const taskYaml = `id: CG-AL-H001
description: Test task without target
expected:
  compile: true
`;
      await Deno.writeTextFile(
        join(tasksDir, "CG-AL-H001-tax-calculator.yml"),
        taskYaml,
      );

      const target = await loadTaskTarget("CG-AL-H001", tempDir);
      assertEquals(target, undefined);
    });

    it("should return undefined when task file does not exist", async () => {
      const target = await loadTaskTarget("CG-AL-M999", tempDir);
      assertEquals(target, undefined);
    });

    it("should return undefined for invalid task ID format", async () => {
      const target = await loadTaskTarget("invalid-id", tempDir);
      assertEquals(target, undefined);
    });
  });

  describe("loadTestCodeunitId", () => {
    it("should return testCodeunitId from expected section", async () => {
      const tasksDir = join(tempDir, "tasks", "medium");
      await ensureDir(tasksDir);

      const taskYaml = `id: CG-AL-M022
description: Test task
expected:
  compile: true
  testCodeunitId: 80122
`;
      await Deno.writeTextFile(
        join(tasksDir, "CG-AL-M022-mock-httpclient.yml"),
        taskYaml,
      );

      const id = await loadTestCodeunitId("CG-AL-M022", tempDir);
      assertEquals(id, 80122);
    });

    it("should return undefined when testCodeunitId is not set", async () => {
      const tasksDir = join(tempDir, "tasks", "easy");
      await ensureDir(tasksDir);

      const taskYaml = `id: CG-AL-E001
description: Test task
expected:
  compile: true
`;
      await Deno.writeTextFile(
        join(tasksDir, "CG-AL-E001-basic-table.yml"),
        taskYaml,
      );

      const id = await loadTestCodeunitId("CG-AL-E001", tempDir);
      assertEquals(id, undefined);
    });
  });
});
