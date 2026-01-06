/**
 * Tests for session-selection helpers
 * @module tests/unit/cli/helpers/session-selection
 */

import { assertEquals } from "@std/assert";
import {
  determineModeFromOptions,
  type VerifyMode,
} from "../../../../cli/helpers/session-selection.ts";

Deno.test("determineModeFromOptions", async (t) => {
  await t.step(
    "returns 'shortcomings-only' when shortcomingsOnly is true",
    () => {
      const result = determineModeFromOptions({
        shortcomingsOnly: true,
        fixesOnly: false,
      });
      assertEquals(result, "shortcomings-only" as VerifyMode);
    },
  );

  await t.step("returns 'fixes-only' when fixesOnly is true", () => {
    const result = determineModeFromOptions({
      shortcomingsOnly: false,
      fixesOnly: true,
    });
    assertEquals(result, "fixes-only" as VerifyMode);
  });

  await t.step("returns 'all' when both are false", () => {
    const result = determineModeFromOptions({
      shortcomingsOnly: false,
      fixesOnly: false,
    });
    assertEquals(result, "all" as VerifyMode);
  });

  await t.step("shortcomingsOnly takes precedence when both are true", () => {
    // Note: validateTaskFilterOptions would catch this, but determineModeFromOptions
    // doesn't validate - it just returns based on first match
    const result = determineModeFromOptions({
      shortcomingsOnly: true,
      fixesOnly: true,
    });
    assertEquals(result, "shortcomings-only" as VerifyMode);
  });
});
