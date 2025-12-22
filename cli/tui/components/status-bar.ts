/**
 * Status Bar Component - Container status and keyboard hints
 */
import { Computed, Signal } from "tui";
import { Text } from "tui/components";
import type { Tui } from "tui";
import { layout, theme } from "../theme.ts";

export interface StatusBarOptions {
  parent: Tui;
  containerStatus: Signal<string>;
  hints?: string;
  row?: number;
}

export function createStatusBar(options: StatusBarOptions): void {
  const {
    parent,
    containerStatus,
    hints = "[Q]uit  [Arrow Keys] Navigate  [Enter] Select",
    row = 22,
  } = options;

  const col = layout.padding;

  // Container status line
  new Text({
    parent,
    text: new Computed(() => {
      const status = containerStatus.value;
      const isRunning = status.toLowerCase().includes("running");
      const icon = isRunning ? "[OK]" : "[--]";
      return `${icon} ${status}`;
    }),
    rectangle: { column: col, row, width: 40 },
    theme: { base: theme.statusBar.running },
    zIndex: 0,
  });

  // Keyboard hints line
  new Text({
    parent,
    text: hints,
    rectangle: { column: col, row: row + 1, width: 60 },
    theme: { base: theme.statusBar.base },
    zIndex: 0,
  });
}
