/**
 * Keyboard Handler Component - Consistent keyboard shortcuts across screens
 * Provides standardized key handling with proper cleanup
 */
import type { Tui } from "tui";
import { keys } from "../theme.ts";

/**
 * Standard keyboard actions available in screens
 */
export interface KeyboardActions {
  /** Go back to previous screen */
  onBack?: () => void;
  /** Quit the application */
  onQuit?: () => void;
  /** Navigate up in a list */
  onUp?: () => void;
  /** Navigate down in a list */
  onDown?: () => void;
  /** Select/confirm current item */
  onSelect?: () => void;
  /** Refresh current view */
  onRefresh?: () => void;
  /** Custom key handlers: key -> action */
  custom?: Record<string, () => void>;
}

export interface KeyboardResult {
  /** Remove the keyboard handler */
  cleanup: () => void;
}

/**
 * Check if a key matches any in a list (case-insensitive for letters)
 */
function keyMatches(eventKey: string, keyList: readonly string[]): boolean {
  const lowerKey = eventKey.toLowerCase();
  return keyList.some((k) => k.toLowerCase() === lowerKey || k === eventKey);
}

/**
 * Create a standardized keyboard handler for a screen
 *
 * Automatically handles:
 * - Back: b, B, Escape
 * - Quit: q, Q (goes back if not on main menu)
 * - Navigation: up/k, down/j
 * - Select: Enter/Return
 *
 * @param tui - The TUI instance
 * @param actions - Actions to handle
 * @returns Cleanup function
 */
export function createKeyboardHandler(
  tui: Tui,
  actions: KeyboardActions,
): KeyboardResult {
  const handler = (event: { key: string }) => {
    const eventKey = event.key;

    // Back navigation (b, B, Escape)
    if (actions.onBack && keyMatches(eventKey, keys.back)) {
      actions.onBack();
      return;
    }

    // Quit (q, Q) - typically same as back for sub-screens
    if (actions.onQuit && keyMatches(eventKey, keys.quit)) {
      actions.onQuit();
      return;
    }

    // Navigation up (up arrow, k)
    if (actions.onUp && keyMatches(eventKey, keys.up)) {
      actions.onUp();
      return;
    }

    // Navigation down (down arrow, j)
    if (actions.onDown && keyMatches(eventKey, keys.down)) {
      actions.onDown();
      return;
    }

    // Select/confirm (Enter, Return)
    if (actions.onSelect && keyMatches(eventKey, keys.select)) {
      actions.onSelect();
      return;
    }

    // Refresh (r, R) - common action
    if (actions.onRefresh && eventKey.toLowerCase() === "r") {
      actions.onRefresh();
      return;
    }

    // Custom key handlers
    if (actions.custom) {
      const lowerKey = eventKey.toLowerCase();
      const customAction = actions.custom[lowerKey] || actions.custom[eventKey];
      if (customAction) {
        customAction();
        return;
      }
    }
  };

  tui.on("keyPress", handler);

  return {
    cleanup: () => {
      tui.off("keyPress", handler);
    },
  };
}

/**
 * Standard hint text for common actions
 */
export const keyHints = {
  back: "[B]ack",
  quit: "[Q]uit",
  navigation: "[↑/k] Up  [↓/j] Down",
  select: "[Enter] Select",
  refresh: "[R]efresh",
  toggle: "[Space] Toggle",
} as const;

/**
 * Build a hints string from action names
 */
export function buildHints(...hints: (keyof typeof keyHints)[]): string {
  return hints.map((h) => keyHints[h]).join("  ");
}
