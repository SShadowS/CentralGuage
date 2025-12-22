/**
 * Model Comparison Modal - Select and compare two models
 */
import { Computed, Signal } from "tui";
import { Text } from "tui/components";
import type { Tui } from "tui";
import { keys, layout, theme } from "../theme.ts";
import { showPreview } from "./modal.ts";
import {
  compareModels,
  formatComparisonLines,
  formatModelName,
  getAvailableModels,
} from "../../services/compare-actions.ts";
import { showError, showInfo } from "./notification.ts";
import { withSpinner } from "./spinner.ts";

export interface CompareModalResult {
  cleanup: () => void;
}

interface SelectionState {
  models: string[];
  cursor: number;
  selected: [string | null, string | null];
  phase: "loading" | "select1" | "select2" | "comparing" | "done";
  error: string | null;
}

/**
 * Show the model comparison modal
 */
export function showCompareModal(parent: Tui): CompareModalResult {
  const state = new Signal<SelectionState>({
    models: [],
    cursor: 0,
    selected: [null, null],
    phase: "loading",
    error: null,
  });

  const components: Text[] = [];
  let keyHandler: ((event: { key: string }) => void) | null = null;

  // Modal dimensions and position
  const width = 50;
  const height = 18;
  const startCol = Math.floor((layout.screenWidth - width) / 2) +
    layout.padding;
  const startRow = Math.floor((24 - height) / 2);
  const maxVisible = 10;
  const zIndex = 200;

  // Draw modal frame
  const { box } = theme;

  // Top border
  components.push(
    new Text({
      parent,
      text: box.topLeft +
        box.horizontal.repeat(2) +
        " Compare Models " +
        box.horizontal.repeat(width - 20) +
        box.topRight,
      rectangle: { column: startCol, row: startRow, width },
      theme: { base: theme.header.border },
      zIndex,
    }),
  );

  // Side borders and background
  for (let i = 1; i < height - 1; i++) {
    components.push(
      new Text({
        parent,
        text: box.vertical,
        rectangle: { column: startCol, row: startRow + i, width: 1 },
        theme: { base: theme.header.border },
        zIndex,
      }),
    );
    components.push(
      new Text({
        parent,
        text: box.vertical,
        rectangle: {
          column: startCol + width - 1,
          row: startRow + i,
          width: 1,
        },
        theme: { base: theme.header.border },
        zIndex,
      }),
    );
    components.push(
      new Text({
        parent,
        text: " ".repeat(width - 2),
        rectangle: {
          column: startCol + 1,
          row: startRow + i,
          width: width - 2,
        },
        theme: { base: theme.bg.base },
        zIndex: zIndex - 1,
      }),
    );
  }

  // Bottom border
  components.push(
    new Text({
      parent,
      text: box.bottomLeft +
        box.horizontal.repeat(width - 2) +
        box.bottomRight,
      rectangle: { column: startCol, row: startRow + height - 1, width },
      theme: { base: theme.muted },
      zIndex,
    }),
  );

  // Phase indicator
  components.push(
    new Text({
      parent,
      text: new Computed(() => {
        const s = state.value;
        if (s.phase === "loading") return "Loading models...";
        if (s.phase === "select1") return "Select first model:";
        if (s.phase === "select2") {
          return `First: ${formatModelName(s.selected[0] ?? "", 25)}`;
        }
        if (s.phase === "comparing") return "Comparing...";
        return "";
      }),
      rectangle: { column: startCol + 2, row: startRow + 1, width: width - 4 },
      theme: { base: theme.text.highlight },
      zIndex: zIndex + 1,
    }),
  );

  // Second selection hint (only in select2 phase)
  components.push(
    new Text({
      parent,
      text: new Computed((): string => {
        const s = state.value;
        if (s.phase === "select2") return "Select second model:";
        return "";
      }),
      rectangle: { column: startCol + 2, row: startRow + 2, width: width - 4 },
      theme: { base: theme.text.normal },
      zIndex: zIndex + 1,
    }),
  );

  // Error display
  components.push(
    new Text({
      parent,
      text: new Computed(() => {
        const s = state.value;
        if (s.error) return `[ERR] ${s.error}`;
        return "";
      }),
      rectangle: { column: startCol + 2, row: startRow + 2, width: width - 4 },
      theme: { base: theme.error },
      zIndex: zIndex + 1,
    }),
  );

  // Model list
  const listStartRow = startRow + 4;
  for (let i = 0; i < maxVisible; i++) {
    const idx = i;
    components.push(
      new Text({
        parent,
        text: new Computed((): string => {
          const s = state.value;
          if (s.phase === "loading" || s.error) return "";
          const model = s.models[idx];
          if (!model) return "";

          const isSelected = s.selected[0] === model;
          const isCursor = s.cursor === idx;
          const prefix = isCursor ? "> " : "  ";
          const marker = isSelected ? "[1]" : "   ";
          const name = formatModelName(model, width - 12);
          return `${prefix}${marker} ${name}`;
        }),
        rectangle: {
          column: startCol + 2,
          row: listStartRow + idx,
          width: width - 4,
        },
        // Use normal theme - cursor/selection shown via prefix characters
        theme: { base: theme.text.normal },
        zIndex: zIndex + 1,
      }),
    );
  }

  // Hint bar
  components.push(
    new Text({
      parent,
      text: new Computed((): string => {
        const s = state.value;
        if (s.phase === "loading") return "";
        if (s.error) return "[Esc] Close";
        return "[Up/Down] Navigate  [Enter] Select  [Esc] Cancel";
      }),
      rectangle: {
        column: startCol + 2,
        row: startRow + height - 2,
        width: width - 4,
      },
      theme: { base: theme.muted },
      zIndex: zIndex + 1,
    }),
  );

  // Keyboard handler
  keyHandler = (event: { key: string }) => {
    const key = event.key.toLowerCase();
    const s = state.peek();

    // Close on Escape
    if ((keys.back as readonly string[]).includes(key)) {
      cleanup();
      return;
    }

    if (s.phase === "loading" || s.error) return;

    // Navigation
    if ((keys.up as readonly string[]).includes(key)) {
      if (s.cursor > 0) {
        state.value = { ...s, cursor: s.cursor - 1 };
      }
      return;
    }

    if ((keys.down as readonly string[]).includes(key)) {
      if (s.cursor < s.models.length - 1) {
        state.value = { ...s, cursor: s.cursor + 1 };
      }
      return;
    }

    // Selection
    if ((keys.select as readonly string[]).includes(key)) {
      const selectedModel = s.models[s.cursor];
      if (!selectedModel) return;

      if (s.phase === "select1") {
        // First model selected, move to select2
        state.value = {
          ...s,
          selected: [selectedModel, null],
          phase: "select2",
          cursor: 0,
        };
      } else if (s.phase === "select2") {
        // Can't select the same model
        if (selectedModel === s.selected[0]) {
          showInfo(parent, "Select a different model");
          return;
        }

        // Both models selected, do comparison
        state.value = {
          ...s,
          selected: [s.selected[0], selectedModel],
          phase: "comparing",
        };

        runComparison(parent, s.selected[0]!, selectedModel, cleanup);
      }
    }
  };

  parent.on("keyPress", keyHandler);

  // Cleanup function
  function cleanup() {
    if (keyHandler) {
      parent.off("keyPress", keyHandler);
      keyHandler = null;
    }
    for (const component of components) {
      component.destroy();
    }
    components.length = 0;
  }

  // Load models
  loadModels(state);

  return { cleanup };
}

async function loadModels(state: Signal<SelectionState>): Promise<void> {
  const result = await getAvailableModels();

  if (!result.success || !result.availableModels) {
    state.value = {
      ...state.peek(),
      phase: "loading",
      error: result.message,
    };
    return;
  }

  state.value = {
    ...state.peek(),
    models: result.availableModels,
    phase: "select1",
  };
}

async function runComparison(
  parent: Tui,
  model1: string,
  model2: string,
  onComplete: () => void,
): Promise<void> {
  try {
    const result = await withSpinner(
      { parent, message: "Comparing models...", row: 12 },
      () => compareModels(model1, model2),
    );

    // Close selection modal
    onComplete();

    if (!result.success || !result.comparison) {
      showError(parent, result.message);
      return;
    }

    // Show comparison results in a preview modal
    const lines = formatComparisonLines(result.comparison);
    showPreview(parent, "Model Comparison", lines.join("\n"));
  } catch (error) {
    onComplete();
    const message = error instanceof Error ? error.message : String(error);
    showError(parent, `Comparison failed: ${message}`);
  }
}
