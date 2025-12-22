/**
 * Tests for search-input pure functions
 */
import { assertEquals } from "@std/assert";
import {
  filterItems,
  findNextMatch,
} from "../../../cli/tui/components/search-input.ts";

// Test data
interface TestItem {
  id: string;
  name: string;
  category: string;
}

const testItems: TestItem[] = [
  { id: "1", name: "user-auth", category: "auth" },
  { id: "2", name: "user-profile", category: "users" },
  { id: "3", name: "admin-panel", category: "admin" },
  { id: "4", name: "api-gateway", category: "api" },
  { id: "5", name: "user-settings", category: "users" },
];

const getText = (item: TestItem): string => `${item.category}/${item.name}`;

// ============================================================================
// filterItems tests
// ============================================================================

Deno.test("filterItems - empty query returns all items", () => {
  const result = filterItems(testItems, "", getText);
  assertEquals(result.length, 5);
  assertEquals(result, testItems);
});

Deno.test("filterItems - matches substring in name", () => {
  const result = filterItems(testItems, "user", getText);
  assertEquals(result.length, 3);
  assertEquals(result[0]?.name, "user-auth");
  assertEquals(result[1]?.name, "user-profile");
  assertEquals(result[2]?.name, "user-settings");
});

Deno.test("filterItems - matches substring in category", () => {
  const result = filterItems(testItems, "admin", getText);
  assertEquals(result.length, 1);
  assertEquals(result[0]?.name, "admin-panel");
});

Deno.test("filterItems - case insensitive matching", () => {
  const result = filterItems(testItems, "USER", getText);
  assertEquals(result.length, 3);
});

Deno.test("filterItems - matches partial words", () => {
  const result = filterItems(testItems, "api", getText);
  assertEquals(result.length, 1);
  assertEquals(result[0]?.name, "api-gateway");
});

Deno.test("filterItems - no matches returns empty array", () => {
  const result = filterItems(testItems, "xyz", getText);
  assertEquals(result.length, 0);
});

Deno.test("filterItems - matches across category/name boundary", () => {
  // "users/user" should match items in users category with user in name
  const result = filterItems(testItems, "users/user", getText);
  assertEquals(result.length, 2);
  assertEquals(result[0]?.name, "user-profile");
  assertEquals(result[1]?.name, "user-settings");
});

Deno.test("filterItems - empty items array returns empty", () => {
  const result = filterItems([], "test", getText);
  assertEquals(result.length, 0);
});

Deno.test("filterItems - special characters in query", () => {
  const itemsWithSpecial: TestItem[] = [
    { id: "1", name: "test-item", category: "cat" },
    { id: "2", name: "test.item", category: "cat" },
  ];
  const result = filterItems(itemsWithSpecial, "test-", getText);
  assertEquals(result.length, 1);
  assertEquals(result[0]?.name, "test-item");
});

// ============================================================================
// findNextMatch tests
// ============================================================================

Deno.test("findNextMatch - finds next matching item forward", () => {
  // Start at index 0 (user-auth), find next "user" match
  const result = findNextMatch(testItems, "user", 0, getText, 1);
  assertEquals(result, 1); // user-profile
});

Deno.test("findNextMatch - wraps around to beginning", () => {
  // Start at last user item (index 4), should wrap to first user item (index 0)
  const result = findNextMatch(testItems, "user", 4, getText, 1);
  assertEquals(result, 0); // user-auth
});

Deno.test("findNextMatch - finds previous match backward", () => {
  // Start at index 4 (user-settings), find previous "user" match
  const result = findNextMatch(testItems, "user", 4, getText, -1);
  assertEquals(result, 1); // user-profile
});

Deno.test("findNextMatch - wraps around backward", () => {
  // Start at index 0, find previous "user" match (should wrap to end)
  const result = findNextMatch(testItems, "user", 0, getText, -1);
  assertEquals(result, 4); // user-settings
});

Deno.test("findNextMatch - empty query returns current index", () => {
  const result = findNextMatch(testItems, "", 2, getText, 1);
  assertEquals(result, 2);
});

Deno.test("findNextMatch - no match returns current index", () => {
  const result = findNextMatch(testItems, "xyz", 2, getText, 1);
  assertEquals(result, 2);
});

Deno.test("findNextMatch - empty items returns current index", () => {
  const result = findNextMatch([], "test", 0, getText, 1);
  assertEquals(result, 0);
});

Deno.test("findNextMatch - single item that matches returns same index", () => {
  const singleItem: TestItem[] = [
    { id: "1", name: "user-auth", category: "auth" },
  ];
  const result = findNextMatch(singleItem, "user", 0, getText, 1);
  assertEquals(result, 0);
});

Deno.test("findNextMatch - finds only match from any position", () => {
  // Only one item matches "admin", should find it from any start position
  const fromStart = findNextMatch(testItems, "admin", 0, getText, 1);
  assertEquals(fromStart, 2);

  const fromMiddle = findNextMatch(testItems, "admin", 1, getText, 1);
  assertEquals(fromMiddle, 2);

  const fromEnd = findNextMatch(testItems, "admin", 4, getText, 1);
  assertEquals(fromEnd, 2);
});

Deno.test("findNextMatch - case insensitive search", () => {
  const result = findNextMatch(testItems, "ADMIN", 0, getText, 1);
  assertEquals(result, 2);
});
