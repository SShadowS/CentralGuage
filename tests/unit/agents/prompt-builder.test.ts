/**
 * Unit tests for the universal prompt builder.
 */

import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  buildUniversalPrompt,
  buildUniversalPromptSync,
  preloadTemplate,
  renderTemplate,
} from "../../../src/agents/prompt-builder.ts";

Deno.test("renderTemplate", async (t) => {
  await t.step("substitutes simple variables", () => {
    const template = "Hello {{NAME}}, welcome to {{PLACE}}!";
    const result = renderTemplate(template, {
      NAME: "Alice",
      PLACE: "Wonderland",
    });
    assertEquals(result, "Hello Alice, welcome to Wonderland!");
  });

  await t.step("handles boolean variables as strings", () => {
    const template = "Status: {{ENABLED}}";
    const result = renderTemplate(template, { ENABLED: true });
    assertEquals(result, "Status: true");
  });

  await t.step("preserves unresolved variables", () => {
    const template = "Hello {{NAME}}, your ID is {{USER_ID}}";
    const result = renderTemplate(template, { NAME: "Bob" });
    assertEquals(result, "Hello Bob, your ID is {{USER_ID}}");
  });

  await t.step("processes {{#if VAR}} blocks when true", () => {
    const template = "Start{{#if SHOW_EXTRA}} EXTRA{{/if}} End";
    const result = renderTemplate(template, { SHOW_EXTRA: true });
    assertEquals(result, "Start EXTRA End");
  });

  await t.step("removes {{#if VAR}} blocks when false", () => {
    const template = "Start{{#if SHOW_EXTRA}} EXTRA{{/if}} End";
    const result = renderTemplate(template, { SHOW_EXTRA: false });
    assertEquals(result, "Start End");
  });

  await t.step("processes {{#unless VAR}} blocks when false", () => {
    const template = "Start{{#unless HIDE_IT}} VISIBLE{{/unless}} End";
    const result = renderTemplate(template, { HIDE_IT: false });
    assertEquals(result, "Start VISIBLE End");
  });

  await t.step("removes {{#unless VAR}} blocks when true", () => {
    const template = "Start{{#unless HIDE_IT}} VISIBLE{{/unless}} End";
    const result = renderTemplate(template, { HIDE_IT: true });
    assertEquals(result, "Start End");
  });

  await t.step("handles multiline conditional blocks", () => {
    const template = `Header
{{#if INCLUDE_SECTION}}
## Section
Content here
{{/if}}
Footer`;
    const result = renderTemplate(template, { INCLUDE_SECTION: true });
    assertStringIncludes(result, "## Section");
    assertStringIncludes(result, "Content here");
  });

  await t.step("handles multiple conditionals", () => {
    const template = "{{#if A}}A{{/if}}{{#if B}}B{{/if}}{{#if C}}C{{/if}}";
    const result = renderTemplate(template, { A: true, B: false, C: true });
    assertEquals(result, "AC");
  });
});

Deno.test("preloadTemplate", async (t) => {
  await t.step("loads the universal-agent.md template", async () => {
    const template = await preloadTemplate();
    assertStringIncludes(template, "AL Code Generation Task");
    assertStringIncludes(template, "al_compile");
    assertStringIncludes(template, "{{TASK_ID}}");
    assertStringIncludes(template, "{{WORKSPACE_PATH}}");
  });
});

Deno.test("buildUniversalPrompt", async (t) => {
  await t.step("renders prompt with tests required", async () => {
    const prompt = await buildUniversalPrompt({
      taskId: "CG-AL-E001",
      taskDescription: "Create a table called Product.",
      workspacePath: "C:/workspace",
      requiresTests: true,
    });

    // Check task ID substitution
    assertStringIncludes(prompt, "# CG-AL-E001:");
    assertStringIncludes(prompt, 'taskId: "CG-AL-E001"');

    // Check description substitution
    assertStringIncludes(prompt, "Create a table called Product.");

    // Check workspace path substitution
    assertStringIncludes(prompt, "C:/workspace");

    // Check Phase 3 is included (tests required)
    assertStringIncludes(prompt, "### PHASE 3: Run Tests");
    assertStringIncludes(prompt, "al_verify_task");

    // Check success criteria for tests
    assertStringIncludes(prompt, "All tests passed!");
  });

  await t.step("renders prompt without tests required", async () => {
    const prompt = await buildUniversalPrompt({
      taskId: "CG-AL-E002",
      taskDescription: "Create a codeunit.",
      workspacePath: "/workspace",
      requiresTests: false,
    });

    // Check task ID substitution
    assertStringIncludes(prompt, "# CG-AL-E002:");

    // Check description substitution
    assertStringIncludes(prompt, "Create a codeunit.");

    // Check Phase 3 is NOT included
    assertEquals(prompt.includes("### PHASE 3: Run Tests"), false);

    // Check compile-only success criteria
    assertStringIncludes(prompt, "Compilation successful");
  });

  await t.step("generates unique app GUID each time", async () => {
    const prompt1 = await buildUniversalPrompt({
      taskId: "CG-AL-E001",
      taskDescription: "Test",
      workspacePath: "/workspace",
      requiresTests: false,
    });

    const prompt2 = await buildUniversalPrompt({
      taskId: "CG-AL-E001",
      taskDescription: "Test",
      workspacePath: "/workspace",
      requiresTests: false,
    });

    // Extract GUIDs from app.json sections
    const guidRegex = /"id": "([a-f0-9-]+)"/;
    const guid1 = prompt1.match(guidRegex)?.[1];
    const guid2 = prompt2.match(guidRegex)?.[1];

    // GUIDs should be different
    assertEquals(guid1 !== guid2, true);
  });

  await t.step("uses provided app GUID when specified", async () => {
    const customGuid = "custom-guid-1234-5678-abcd";
    const prompt = await buildUniversalPrompt({
      taskId: "CG-AL-E001",
      taskDescription: "Test",
      workspacePath: "/workspace",
      requiresTests: false,
      appGuid: customGuid,
    });

    assertStringIncludes(prompt, customGuid);
  });
});

Deno.test("buildUniversalPromptSync", async (t) => {
  await t.step(
    "renders prompt synchronously with preloaded template",
    async () => {
      const template = await preloadTemplate();

      const prompt = buildUniversalPromptSync(template, {
        taskId: "CG-AL-M001",
        taskDescription: "Create a page.",
        workspacePath: "D:/projects",
        requiresTests: true,
      });

      assertStringIncludes(prompt, "# CG-AL-M001:");
      assertStringIncludes(prompt, "Create a page.");
      assertStringIncludes(prompt, "D:/projects");
      assertStringIncludes(prompt, "### PHASE 3: Run Tests");
    },
  );
});

Deno.test("universal prompt content validation", async (t) => {
  const prompt = await buildUniversalPrompt({
    taskId: "CG-AL-TEST",
    taskDescription: "Test task",
    workspacePath: "/workspace",
    requiresTests: true,
  });

  await t.step("includes role description", () => {
    assertStringIncludes(prompt, "AL code generator");
    assertStringIncludes(prompt, "Microsoft Dynamics 365 Business Central");
  });

  await t.step("documents al_compile tool", () => {
    assertStringIncludes(prompt, "### al_compile");
    assertStringIncludes(prompt, "projectDir");
    assertStringIncludes(prompt, '"success": true/false');
  });

  await t.step("documents al_verify_task tool", () => {
    assertStringIncludes(prompt, "### al_verify_task");
    assertStringIncludes(prompt, "taskId");
  });

  await t.step("includes app.json template", () => {
    assertStringIncludes(prompt, '"publisher": "CentralGauge"');
    assertStringIncludes(prompt, '"platform": "27.0.0.0"');
    assertStringIncludes(prompt, "idRanges");
  });

  await t.step("includes critical reminders about tool calls", () => {
    assertStringIncludes(prompt, "FILE CREATION IS NOT COMPLETION");
    assertStringIncludes(prompt, "MUST call tools");
  });

  await t.step("includes AL coding guidelines", () => {
    assertStringIncludes(prompt, "PascalCase");
    assertStringIncludes(prompt, "DataClassification");
  });
});
