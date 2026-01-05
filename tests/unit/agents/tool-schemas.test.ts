/**
 * Unit tests for tool schemas.
 */

import { assertEquals, assertExists } from "@std/assert";
import {
  AL_TOOL_SCHEMAS,
  getToolName,
  matchToolName,
  toClaudeTools,
  toGeminiFunctions,
  toOpenAIFunctions,
} from "../../../src/agents/tool-schemas.ts";

Deno.test("AL_TOOL_SCHEMAS", async (t) => {
  await t.step("contains al_compile tool", () => {
    const compile = AL_TOOL_SCHEMAS.find((t) => t.name === "al_compile");
    assertExists(compile);
    assertEquals(compile.parameters.required, ["projectDir"]);
  });

  await t.step("contains al_verify_task tool", () => {
    const verify = AL_TOOL_SCHEMAS.find((t) => t.name === "al_verify_task");
    assertExists(verify);
    assertEquals(verify.parameters.required, ["projectDir", "taskId"]);
  });

  await t.step("contains al_container_status tool", () => {
    const status = AL_TOOL_SCHEMAS.find(
      (t) => t.name === "al_container_status",
    );
    assertExists(status);
    assertEquals(status.parameters.required, []);
  });

  await t.step("all tools have descriptions", () => {
    for (const tool of AL_TOOL_SCHEMAS) {
      assertExists(tool.description);
      assertEquals(tool.description.length > 10, true);
    }
  });
});

Deno.test("getToolName", async (t) => {
  await t.step("returns generic name by default", () => {
    assertEquals(getToolName("al_compile"), "al_compile");
    assertEquals(getToolName("al_verify_task"), "al_verify_task");
  });

  await t.step("returns generic name when style is generic", () => {
    assertEquals(getToolName("al_compile", "generic"), "al_compile");
  });

  await t.step("returns MCP-prefixed name when style is mcp", () => {
    assertEquals(getToolName("al_compile", "mcp"), "mcp__al-tools__al_compile");
    assertEquals(
      getToolName("al_verify_task", "mcp"),
      "mcp__al-tools__al_verify_task",
    );
  });
});

Deno.test("matchToolName", async (t) => {
  await t.step("matches generic tool names", () => {
    assertEquals(matchToolName("al_compile"), "al_compile");
    assertEquals(matchToolName("al_verify_task"), "al_verify_task");
    assertEquals(matchToolName("al_container_status"), "al_container_status");
  });

  await t.step("matches MCP-prefixed tool names", () => {
    assertEquals(matchToolName("mcp__al-tools__al_compile"), "al_compile");
    assertEquals(
      matchToolName("mcp__al-tools__al_verify_task"),
      "al_verify_task",
    );
  });

  await t.step("returns null for unknown tools", () => {
    assertEquals(matchToolName("unknown_tool"), null);
    assertEquals(matchToolName("mcp__other__al_compile"), null);
  });
});

Deno.test("toOpenAIFunctions", async (t) => {
  await t.step("converts to OpenAI function format", () => {
    const functions = toOpenAIFunctions();

    assertEquals(functions.length, AL_TOOL_SCHEMAS.length);

    const compile = functions.find((f) => f.function.name === "al_compile");
    assertExists(compile);
    assertEquals(compile.type, "function");
    assertExists(compile.function.description);
    assertExists(compile.function.parameters);
  });
});

Deno.test("toClaudeTools", async (t) => {
  await t.step("converts to Claude tools format", () => {
    const tools = toClaudeTools();

    assertEquals(tools.length, AL_TOOL_SCHEMAS.length);

    const compile = tools.find((t) => t.name === "al_compile");
    assertExists(compile);
    assertExists(compile.description);
    assertExists(compile.input_schema);
    assertEquals(compile.input_schema.type, "object");
  });
});

Deno.test("toGeminiFunctions", async (t) => {
  await t.step("converts to Gemini function declarations", () => {
    const functions = toGeminiFunctions();

    assertEquals(functions.length, AL_TOOL_SCHEMAS.length);

    const compile = functions.find((f) => f.name === "al_compile");
    assertExists(compile);
    assertExists(compile.description);
    assertExists(compile.parameters);
  });
});
