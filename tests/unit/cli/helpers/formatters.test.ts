import { assertEquals } from "@std/assert";
import { formatDurationMs } from "../../../../cli/helpers/formatters.ts";

Deno.test("formatDurationMs", async (t) => {
  await t.step("formats milliseconds under 1 second", () => {
    assertEquals(formatDurationMs(0), "0ms");
    assertEquals(formatDurationMs(1), "1ms");
    assertEquals(formatDurationMs(500), "500ms");
    assertEquals(formatDurationMs(999), "999ms");
  });

  await t.step("formats seconds under 1 minute", () => {
    assertEquals(formatDurationMs(1000), "1.0s");
    assertEquals(formatDurationMs(1500), "1.5s");
    assertEquals(formatDurationMs(30000), "30.0s");
    assertEquals(formatDurationMs(59999), "60.0s"); // rounds to 60.0s
  });

  await t.step("formats minutes under 1 hour", () => {
    assertEquals(formatDurationMs(60000), "1m 0s");
    assertEquals(formatDurationMs(90000), "1m 30s");
    assertEquals(formatDurationMs(300000), "5m 0s");
    assertEquals(formatDurationMs(3540000), "59m 0s");
  });

  await t.step("formats hours", () => {
    assertEquals(formatDurationMs(3600000), "1h 0m");
    assertEquals(formatDurationMs(5400000), "1h 30m");
    assertEquals(formatDurationMs(7200000), "2h 0m");
    assertEquals(formatDurationMs(36000000), "10h 0m");
  });

  await t.step("handles edge cases", () => {
    // Exactly at boundaries
    assertEquals(formatDurationMs(1000), "1.0s"); // 1 second
    assertEquals(formatDurationMs(60000), "1m 0s"); // 1 minute
    assertEquals(formatDurationMs(3600000), "1h 0m"); // 1 hour
  });
});
