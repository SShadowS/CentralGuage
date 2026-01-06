/**
 * Tests for ModelPresetRegistry
 * @module tests/unit/llm/model-presets
 */

import { assertEquals, assertExists } from "@std/assert";
import {
  MODEL_GROUPS,
  MODEL_PRESETS,
  ModelPresetRegistry,
} from "../../../src/llm/model-presets.ts";

Deno.test("ModelPresetRegistry.resolve", async (t) => {
  await t.step("resolves alias to provider/model format", () => {
    const result = ModelPresetRegistry.resolve("sonnet");
    assertEquals(result.length, 1);
    assertEquals(result[0], "anthropic/claude-sonnet-4-5-20250929");
  });

  await t.step("resolves gpt-4o alias correctly", () => {
    const result = ModelPresetRegistry.resolve("gpt-4o");
    assertEquals(result.length, 1);
    assertEquals(result[0], "openai/gpt-4o");
  });

  await t.step("resolves haiku alias correctly", () => {
    const result = ModelPresetRegistry.resolve("haiku");
    assertEquals(result.length, 1);
    assertEquals(result[0], "anthropic/claude-haiku-4-5-20251001");
  });

  await t.step("resolves group to multiple models", () => {
    const result = ModelPresetRegistry.resolve("flagship");
    // flagship group contains multiple models
    assertEquals(result.length > 1, true);
    // Each result should be in provider/model format
    result.forEach((r) => assertEquals(r.includes("/"), true));
  });

  await t.step("resolves budget group", () => {
    const result = ModelPresetRegistry.resolve("budget");
    assertEquals(result.length > 0, true);
    // Should include haiku variants
    const hasHaiku = result.some((r) => r.includes("haiku"));
    assertEquals(hasHaiku, true);
  });

  await t.step("passes through provider/model format unchanged", () => {
    const result = ModelPresetRegistry.resolve("openai/gpt-4-turbo");
    assertEquals(result.length, 1);
    assertEquals(result[0], "openai/gpt-4-turbo");
  });

  await t.step("passes through unknown spec unchanged", () => {
    const result = ModelPresetRegistry.resolve("unknown-model-xyz");
    assertEquals(result.length, 1);
    assertEquals(result[0], "unknown-model-xyz");
  });

  await t.step("resolves mock preset", () => {
    const result = ModelPresetRegistry.resolve("mock");
    assertEquals(result.length, 1);
    assertEquals(result[0], "mock/mock-gpt-4");
  });

  await t.step("resolves all group to all presets", () => {
    const result = ModelPresetRegistry.resolve("all");
    const presetCount = Object.keys(MODEL_PRESETS).length;
    assertEquals(result.length, presetCount);
  });
});

Deno.test("ModelPresetRegistry.getPreset", async (t) => {
  await t.step("returns preset for valid alias", () => {
    const preset = ModelPresetRegistry.getPreset("sonnet");
    assertExists(preset);
    assertEquals(preset.alias, "sonnet");
    assertEquals(preset.provider, "anthropic");
  });

  await t.step("returns null for invalid alias", () => {
    const preset = ModelPresetRegistry.getPreset("nonexistent-model");
    assertEquals(preset, null);
  });

  await t.step("returns preset with all required fields", () => {
    const preset = ModelPresetRegistry.getPreset("gpt-4o");
    assertExists(preset);
    assertExists(preset.alias);
    assertExists(preset.provider);
    assertExists(preset.model);
    assertExists(preset.displayName);
    assertExists(preset.description);
    assertExists(preset.costTier);
    assertExists(preset.performanceTier);
    assertExists(preset.category);
  });
});

Deno.test("ModelPresetRegistry.getPresetsByCategory", async (t) => {
  await t.step("returns presets grouped by category", () => {
    const categories = ModelPresetRegistry.getPresetsByCategory();
    assertExists(categories);
    assertEquals(typeof categories, "object");
  });

  await t.step("includes flagship category", () => {
    const categories = ModelPresetRegistry.getPresetsByCategory();
    assertExists(categories["flagship"]);
    assertEquals(categories["flagship"].length > 0, true);
  });

  await t.step("includes coding category", () => {
    const categories = ModelPresetRegistry.getPresetsByCategory();
    assertExists(categories["coding"]);
    assertEquals(categories["coding"].length > 0, true);
  });

  await t.step("presets in category have that category in their list", () => {
    const categories = ModelPresetRegistry.getPresetsByCategory();
    const flagshipPresets = categories["flagship"] ?? [];
    flagshipPresets.forEach((preset) => {
      assertEquals(preset.category.includes("flagship"), true);
    });
  });
});

Deno.test("ModelPresetRegistry.getPresetsByCostTier", async (t) => {
  await t.step("returns presets grouped by cost tier", () => {
    const tiers = ModelPresetRegistry.getPresetsByCostTier();
    assertExists(tiers);
    assertExists(tiers["free"]);
    assertExists(tiers["budget"]);
    assertExists(tiers["standard"]);
    assertExists(tiers["premium"]);
  });

  await t.step("free tier includes local and mock models", () => {
    const tiers = ModelPresetRegistry.getPresetsByCostTier();
    const freeTier = tiers["free"] ?? [];
    const freeAliases = freeTier.map((p) => p.alias);
    assertEquals(freeAliases.includes("mock"), true);
    assertEquals(freeAliases.includes("llama"), true);
  });

  await t.step("premium tier includes flagship models", () => {
    const tiers = ModelPresetRegistry.getPresetsByCostTier();
    const premiumTier = tiers["premium"] ?? [];
    const premiumAliases = premiumTier.map((p) => p.alias);
    assertEquals(premiumAliases.includes("gpt-4o"), true);
  });

  await t.step("budget tier includes haiku", () => {
    const tiers = ModelPresetRegistry.getPresetsByCostTier();
    const budgetTier = tiers["budget"] ?? [];
    const budgetAliases = budgetTier.map((p) => p.alias);
    assertEquals(budgetAliases.includes("haiku"), true);
  });
});

Deno.test("ModelPresetRegistry.getGroups", async (t) => {
  await t.step("returns array of group names", () => {
    const groups = ModelPresetRegistry.getGroups();
    assertEquals(Array.isArray(groups), true);
    assertEquals(groups.length > 0, true);
  });

  await t.step("includes essential groups", () => {
    const groups = ModelPresetRegistry.getGroups();
    assertEquals(groups.includes("flagship"), true);
    assertEquals(groups.includes("budget"), true);
    assertEquals(groups.includes("coding"), true);
    assertEquals(groups.includes("all"), true);
  });

  await t.step("matches MODEL_GROUPS keys", () => {
    const groups = ModelPresetRegistry.getGroups();
    const expectedGroups = Object.keys(MODEL_GROUPS);
    assertEquals(groups.sort(), expectedGroups.sort());
  });
});

Deno.test("ModelPresetRegistry.getAliases", async (t) => {
  await t.step("returns array of alias names", () => {
    const aliases = ModelPresetRegistry.getAliases();
    assertEquals(Array.isArray(aliases), true);
    assertEquals(aliases.length > 0, true);
  });

  await t.step("includes common aliases", () => {
    const aliases = ModelPresetRegistry.getAliases();
    assertEquals(aliases.includes("sonnet"), true);
    assertEquals(aliases.includes("haiku"), true);
    assertEquals(aliases.includes("gpt-4o"), true);
    assertEquals(aliases.includes("gemini"), true);
    assertEquals(aliases.includes("mock"), true);
  });

  await t.step("matches MODEL_PRESETS keys", () => {
    const aliases = ModelPresetRegistry.getAliases();
    const expectedAliases = Object.keys(MODEL_PRESETS);
    assertEquals(aliases.sort(), expectedAliases.sort());
  });
});

Deno.test("MODEL_PRESETS structure", async (t) => {
  await t.step("all presets have required fields", () => {
    for (const [alias, preset] of Object.entries(MODEL_PRESETS)) {
      assertExists(preset.alias, `${alias} missing alias`);
      assertExists(preset.provider, `${alias} missing provider`);
      assertExists(preset.model, `${alias} missing model`);
      assertExists(preset.displayName, `${alias} missing displayName`);
      assertExists(preset.description, `${alias} missing description`);
      assertExists(preset.costTier, `${alias} missing costTier`);
      assertExists(preset.performanceTier, `${alias} missing performanceTier`);
      assertExists(preset.category, `${alias} missing category`);
      assertEquals(
        Array.isArray(preset.category),
        true,
        `${alias} category should be array`,
      );
    }
  });

  await t.step("alias matches key", () => {
    for (const [key, preset] of Object.entries(MODEL_PRESETS)) {
      assertEquals(preset.alias, key, `${key} alias mismatch`);
    }
  });

  await t.step("costTier is valid value", () => {
    const validTiers = ["free", "budget", "standard", "premium"];
    for (const [alias, preset] of Object.entries(MODEL_PRESETS)) {
      assertEquals(
        validTiers.includes(preset.costTier),
        true,
        `${alias} has invalid costTier: ${preset.costTier}`,
      );
    }
  });

  await t.step("performanceTier is valid value", () => {
    const validTiers = ["fast", "balanced", "quality"];
    for (const [alias, preset] of Object.entries(MODEL_PRESETS)) {
      assertEquals(
        validTiers.includes(preset.performanceTier),
        true,
        `${alias} has invalid performanceTier: ${preset.performanceTier}`,
      );
    }
  });
});

Deno.test("MODEL_GROUPS structure", async (t) => {
  await t.step("all groups are arrays", () => {
    for (const [name, aliases] of Object.entries(MODEL_GROUPS)) {
      assertEquals(
        Array.isArray(aliases),
        true,
        `${name} should be an array`,
      );
    }
  });

  await t.step("group aliases exist as presets", () => {
    for (const [groupName, aliases] of Object.entries(MODEL_GROUPS)) {
      // Skip 'all' group as it's dynamically generated
      if (groupName === "all") continue;

      for (const alias of aliases) {
        assertExists(
          MODEL_PRESETS[alias],
          `Group '${groupName}' contains unknown alias '${alias}'`,
        );
      }
    }
  });

  await t.step("all group contains all presets", () => {
    const allGroup = MODEL_GROUPS["all"] ?? [];
    const presetKeys = Object.keys(MODEL_PRESETS);
    assertEquals(allGroup.length, presetKeys.length);
  });
});
