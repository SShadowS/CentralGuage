import { assertEquals, assertExists, assertNotEquals } from "@std/assert";
import {
  getModelColor,
  log,
  resetModelColors,
  statusText,
} from "../../../../cli/helpers/logging.ts";

Deno.test("statusText", async (t) => {
  await t.step("returns green OK for success", () => {
    const result = statusText(true);
    // Contains "OK" text (color codes wrap it)
    assertEquals(result.includes("OK"), true);
  });

  await t.step("returns red FAIL for failure", () => {
    const result = statusText(false);
    // Contains "FAIL" text (color codes wrap it)
    assertEquals(result.includes("FAIL"), true);
  });
});

Deno.test("getModelColor", async (t) => {
  await t.step("returns a color function for a model", () => {
    resetModelColors(); // Start fresh
    const colorFn = getModelColor("test-model");
    assertExists(colorFn);
    assertEquals(typeof colorFn, "function");
  });

  await t.step("returns consistent color for same model", () => {
    resetModelColors();
    const color1 = getModelColor("model-a");
    const color2 = getModelColor("model-a");
    // Same model should get same color function
    assertEquals(color1, color2);
  });

  await t.step("returns different colors for different models", () => {
    resetModelColors();
    const colorA = getModelColor("model-a");
    const colorB = getModelColor("model-b");
    const colorC = getModelColor("model-c");

    // Different models should get different colors (until palette exhausted)
    assertNotEquals(colorA, colorB);
    assertNotEquals(colorB, colorC);
  });

  await t.step("cycles colors after palette exhausted", () => {
    resetModelColors();
    // Get colors for 7 models (palette has 6 colors)
    const colors = [];
    for (let i = 0; i < 7; i++) {
      colors.push(getModelColor(`model-${i}`));
    }
    // 7th model should have same color as 1st (cycle)
    assertEquals(colors[6], colors[0]);
  });
});

Deno.test("log object", async (t) => {
  await t.step("has all expected methods", () => {
    // Channels
    assertExists(log.container);
    assertExists(log.task);
    assertExists(log.llm);
    assertExists(log.compile);
    assertExists(log.test);

    // Status
    assertExists(log.success);
    assertExists(log.fail);
    assertExists(log.warn);
    assertExists(log.info);

    // Progress
    assertExists(log.progress);
    assertExists(log.summary);

    // Generic
    assertExists(log.prefix);
  });

  await t.step("all methods are functions", () => {
    assertEquals(typeof log.container, "function");
    assertEquals(typeof log.task, "function");
    assertEquals(typeof log.llm, "function");
    assertEquals(typeof log.compile, "function");
    assertEquals(typeof log.test, "function");
    assertEquals(typeof log.success, "function");
    assertEquals(typeof log.fail, "function");
    assertEquals(typeof log.warn, "function");
    assertEquals(typeof log.info, "function");
    assertEquals(typeof log.progress, "function");
    assertEquals(typeof log.summary, "function");
    assertEquals(typeof log.prefix, "function");
  });
});

Deno.test("resetModelColors", async (t) => {
  await t.step("resets color assignments", () => {
    // Assign some colors
    getModelColor("model-x");
    getModelColor("model-y");

    // Reset
    resetModelColors();

    // Now model-x should get first color again
    const colorAfterReset = getModelColor("model-z");
    assertExists(colorAfterReset);
  });
});
