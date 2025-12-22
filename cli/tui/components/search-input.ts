/**
 * Search Input Component - Vim-style `/` search for filtering lists
 *
 * Features:
 * - Appears at bottom of screen when activated
 * - Real-time filtering as user types
 * - Enter to confirm, Escape to cancel
 * - Backspace support for editing query
 */
import { Signal } from "tui";
import { Text } from "tui/components";
import type { Tui } from "tui";
import { layout, theme } from "../theme.ts";

export interface SearchInputOptions {
  parent: Tui;
  /** Called on each keystroke with current query */
  onSearch: (query: string) => void;
  /** Called when search is confirmed (Enter) */
  onConfirm: (query: string) => void;
  /** Called when search is cancelled (Escape) */
  onCancel: () => void;
  /** Row to display search input (default: bottom of screen) */
  row?: number;
}

export interface SearchInputResult {
  /** Current search query */
  query: Signal<string>;
  /** Whether search is active */
  isActive: Signal<boolean>;
  /** Activate search mode */
  activate: () => void;
  /** Deactivate search mode */
  deactivate: () => void;
  /** Clean up resources */
  cleanup: () => void;
}

/**
 * Create a vim-style search input
 */
export function createSearchInput(
  options: SearchInputOptions,
): SearchInputResult {
  const { parent, onSearch, onConfirm, onCancel, row = 22 } = options;

  const query = new Signal("");
  const isActive = new Signal(false);

  // Search input display
  const searchText = new Text({
    parent,
    text: new Signal(""), // Will be updated by computed-like logic
    rectangle: {
      column: layout.padding,
      row,
      width: layout.screenWidth - layout.padding * 2,
    },
    theme: { base: theme.primary },
    zIndex: 100,
  });

  // Update display when query or active state changes
  function updateDisplay(): void {
    const active = isActive.peek();
    const q = query.peek();
    if (active) {
      searchText.text.value = `/${q}█`;
    } else if (q) {
      searchText.text.value = `[/${q}] (n/N next/prev, Esc clear)`;
    } else {
      searchText.text.value = "";
    }
  }

  // Key handler for search mode
  const keyHandler = (event: { key: string }) => {
    if (!isActive.peek()) return;

    const key = event.key;

    // Escape - cancel search
    if (key === "escape" || key === "Escape") {
      query.value = "";
      isActive.value = false;
      updateDisplay();
      onCancel();
      return;
    }

    // Enter - confirm search
    if (
      key === "return" || key === "Return" || key === "enter" || key === "Enter"
    ) {
      isActive.value = false;
      updateDisplay();
      onConfirm(query.peek());
      return;
    }

    // Backspace - delete last character
    if (key === "backspace" || key === "Backspace") {
      const current = query.peek();
      if (current.length > 0) {
        query.value = current.slice(0, -1);
        updateDisplay();
        onSearch(query.peek());
      }
      return;
    }

    // Regular character - append to query
    if (key.length === 1 && key.charCodeAt(0) >= 32) {
      query.value = query.peek() + key;
      updateDisplay();
      onSearch(query.peek());
    }
  };

  parent.on("keyPress", keyHandler);

  function activate(): void {
    isActive.value = true;
    updateDisplay();
  }

  function deactivate(): void {
    isActive.value = false;
    updateDisplay();
  }

  function cleanup(): void {
    parent.off("keyPress", keyHandler);
    searchText.destroy();
  }

  return {
    query,
    isActive,
    activate,
    deactivate,
    cleanup,
  };
}

/**
 * Filter items based on search query
 * Matches against any part of the item string (case-insensitive)
 */
export function filterItems<T>(
  items: T[],
  query: string,
  getText: (item: T) => string,
): T[] {
  if (!query) return items;
  const lowerQuery = query.toLowerCase();
  return items.filter((item) =>
    getText(item).toLowerCase().includes(lowerQuery)
  );
}

/**
 * Find next match index from current position
 */
export function findNextMatch<T>(
  items: T[],
  query: string,
  currentIndex: number,
  getText: (item: T) => string,
  direction: 1 | -1 = 1,
): number {
  if (!query || items.length === 0) return currentIndex;

  const lowerQuery = query.toLowerCase();
  const len = items.length;

  // Start searching from next/previous item
  for (let i = 1; i <= len; i++) {
    const idx = (currentIndex + i * direction + len) % len;
    const text = getText(items[idx]!).toLowerCase();
    if (text.includes(lowerQuery)) {
      return idx;
    }
  }

  return currentIndex; // No match found
}
