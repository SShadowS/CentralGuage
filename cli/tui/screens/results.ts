/**
 * Results Screen - View benchmark results and generate reports
 */
import { Computed, Signal } from "tui";
import { Text } from "tui/components";
import type { Screen, TuiApp } from "../app.ts";
import { createHeader } from "../components/header.ts";
import { createMenu, type MenuResult } from "../components/menu.ts";
import { createStatusBar } from "../components/status-bar.ts";
import { showError, showSuccess } from "../components/notification.ts";
import {
  type CompareModalResult,
  showCompareModal,
} from "../components/compare-modal.ts";
import { withSpinner } from "../components/spinner.ts";
import {
  createKeyboardHandler,
  type KeyboardResult,
} from "../components/keyboard.ts";
import { layout, theme } from "../theme.ts";
import { expandGlob } from "@std/fs";
import { generateReport as generateReportAction } from "../../services/report-actions.ts";

export interface ResultEntry {
  path: string;
  filename: string;
  date: Date;
  modelCount: number;
}

/**
 * Parse a result file and extract model/agent count.
 * Exported for testing.
 */
export function parseResultFileModelCount(
  filename: string,
  data: Record<string, unknown>,
): number {
  if (filename.startsWith("benchmark-results-")) {
    // Regular benchmark: models are in stats.perModel
    const stats = data["stats"] as Record<string, unknown> | undefined;
    const perModel = stats?.["perModel"];
    if (perModel && typeof perModel === "object") {
      return Object.keys(perModel).length;
    }
  } else if (filename.startsWith("agent-benchmark-")) {
    // Agent benchmark: agents are in agents array
    const agents = data["agents"];
    if (Array.isArray(agents)) {
      return agents.length;
    }
  }
  return 0;
}

/**
 * Check if a filename is a valid result file.
 * Exported for testing.
 */
export function isResultFile(filename: string): boolean {
  return filename.startsWith("benchmark-results-") ||
    filename.startsWith("agent-benchmark-");
}

let menuResult: MenuResult | undefined;
let keyboardResult: KeyboardResult | undefined;
let compareModalResult: CompareModalResult | undefined;

export const resultsScreen: Screen = {
  name: "results",

  render(app: TuiApp): void {
    const col = layout.padding;
    const results = new Signal<ResultEntry[]>([]);
    const selectedIndex = new Signal(0);
    const maxVisible = 6;

    // Create header
    createHeader({
      parent: app.tui,
      subtitle: "View Results",
    });

    // Section title
    new Text({
      parent: app.tui,
      text: new Computed(() => {
        if (results.value.length === 0) {
          return "Loading results...";
        }
        return `Recent Benchmark Runs (${results.value.length})`;
      }),
      rectangle: { column: col, row: 6, width: 50 },
      theme: { base: theme.text.highlight },
      zIndex: 0,
    });

    // Results list
    for (let i = 0; i < maxVisible; i++) {
      const idx = i; // Capture for closure
      new Text({
        parent: app.tui,
        text: new Computed(() => {
          const result = results.value[idx];
          if (!result) return "";
          const prefix = selectedIndex.value === idx ? "> " : "  ";
          const dateStr = result.date.toLocaleDateString() + " " +
            result.date.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            });
          return `${prefix}${dateStr} - ${result.modelCount} model(s)`;
        }),
        rectangle: { column: col, row: 8 + idx, width: 50 },
        theme: { base: theme.text.normal },
        zIndex: 0,
      });
    }

    // Actions
    new Text({
      parent: app.tui,
      text: "Actions",
      rectangle: { column: col, row: 15, width: 40 },
      theme: { base: theme.text.highlight },
      zIndex: 0,
    });

    menuResult = createMenu({
      parent: app.tui,
      items: [
        {
          label: "[G] Generate HTML Report",
          action: () => generateReport(app, results),
        },
        {
          label: "[C] Compare Models",
          action: () => compareModels(app),
        },
        {
          label: "[B] Back to Main Menu",
          action: () => app.goBack(),
        },
      ],
      startRow: 17,
    });

    // Create status bar
    createStatusBar({
      parent: app.tui,
      containerStatus: app.containerStatus,
      hints: "[B]ack  [G]enerate Report  [C]ompare",
    });

    // Keyboard handler
    keyboardResult = createKeyboardHandler(app.tui, {
      onBack: () => app.goBack(),
      onUp: () => {
        const current = selectedIndex.peek();
        if (current > 0) {
          selectedIndex.value = current - 1;
        }
      },
      onDown: () => {
        const resultCount = results.peek().length;
        const current = selectedIndex.peek();
        if (current < resultCount - 1 && current < maxVisible - 1) {
          selectedIndex.value = current + 1;
        }
      },
      custom: {
        g: () => generateReport(app, results),
        c: () => compareModels(app),
      },
    });

    // Load results
    loadResults(results);
  },

  cleanup(): void {
    if (compareModalResult) {
      compareModalResult.cleanup();
      compareModalResult = undefined;
    }
    if (keyboardResult) {
      keyboardResult.cleanup();
      keyboardResult = undefined;
    }
    if (menuResult) {
      menuResult.cleanup();
      menuResult = undefined;
    }
  },
};

async function loadResults(results: Signal<ResultEntry[]>): Promise<void> {
  const entries: ResultEntry[] = [];

  try {
    // Match benchmark-results-*.json and agent-benchmark-*.json files
    for await (const entry of expandGlob("results/**/*.json")) {
      if (entry.isFile && isResultFile(entry.name)) {
        try {
          const stat = await Deno.stat(entry.path);
          const content = await Deno.readTextFile(entry.path);
          const data = JSON.parse(content);

          entries.push({
            path: entry.path,
            filename: entry.name,
            date: stat.mtime ?? new Date(),
            modelCount: parseResultFileModelCount(entry.name, data),
          });
        } catch {
          // Skip invalid files
        }
      }
    }

    // Sort by date, newest first
    entries.sort((a, b) => b.date.getTime() - a.date.getTime());

    results.value = entries;
  } catch (error) {
    console.error("Error loading results:", error);
    results.value = [];
  }
}

async function generateReport(
  app: TuiApp,
  results: Signal<ResultEntry[]>,
): Promise<void> {
  const resultsList = results.peek();

  if (resultsList.length === 0) {
    showError(app.tui, "No benchmark results found");
    return;
  }

  try {
    const result = await withSpinner(
      { parent: app.tui, message: "Generating HTML report...", row: 20 },
      () =>
        generateReportAction({
          resultsDir: "results",
          outputDir: "reports-output",
          html: true,
        }),
    );

    if (result.success) {
      showSuccess(
        app.tui,
        `Report generated: ${result.outputPath}`,
        5000,
      );
    } else {
      showError(app.tui, result.message);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showError(app.tui, `Report failed: ${message}`);
  }
}

function compareModels(app: TuiApp): void {
  // Close any existing modal
  if (compareModalResult) {
    compareModalResult.cleanup();
  }
  compareModalResult = showCompareModal(app.tui);
}
