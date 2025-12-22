/**
 * Benchmark Screen - Configure and run benchmarks
 */
import { Computed, Signal } from "tui";
import { Text } from "tui/components";
import type { Screen, TuiApp } from "../app.ts";
import { createHeader } from "../components/header.ts";
import { createMenu, type MenuResult } from "../components/menu.ts";
import { createStatusBar } from "../components/status-bar.ts";
import { showError } from "../components/notification.ts";
import {
  createKeyboardHandler,
  type KeyboardResult,
} from "../components/keyboard.ts";
import { layout, theme } from "../theme.ts";

interface ModelOption {
  name: string;
  isGroup: boolean;
  selected: boolean;
}

interface BenchmarkState {
  phase: "config" | "running" | "complete";
  models: ModelOption[];
  taskPattern: string;
  attempts: number;
  concurrency: number;
  progress: {
    current: number;
    total: number;
    currentTask: string;
    currentModel: string;
    currentAttempt: number;
    status: string;
    passCount: number;
    failCount: number;
  };
}

/**
 * JSON event types from bench command --json-events
 */
interface BenchJsonEvent {
  type: string;
  taskId?: string;
  model?: string;
  attempt?: number;
  success?: boolean;
  score?: number;
  completed?: number;
  total?: number;
  winner?: string;
  message?: string;
}

let menuResult: MenuResult | undefined;
let keyboardResult: KeyboardResult | undefined;

const defaultModels: ModelOption[] = [
  { name: "sonnet", isGroup: false, selected: true },
  { name: "gpt-4o", isGroup: false, selected: false },
  { name: "gemini", isGroup: false, selected: false },
  { name: "flagship (group)", isGroup: true, selected: false },
  { name: "budget (group)", isGroup: true, selected: false },
];

export const benchmarkScreen: Screen = {
  name: "benchmark",

  render(app: TuiApp): void {
    const col = layout.padding;
    const state = new Signal<BenchmarkState>({
      phase: "config",
      models: [...defaultModels],
      taskPattern: "tasks/**/*.yml",
      attempts: 2,
      concurrency: 10,
      progress: {
        current: 0,
        total: 0,
        currentTask: "",
        currentModel: "",
        currentAttempt: 0,
        status: "Ready",
        passCount: 0,
        failCount: 0,
      },
    });

    const modelCursor = new Signal(0);

    // Create header
    createHeader({
      parent: app.tui,
      subtitle: "Run Benchmark",
    });

    // Models section
    new Text({
      parent: app.tui,
      text: "Select Models (Space to toggle)",
      rectangle: { column: col, row: 6, width: 40 },
      theme: { base: theme.text.highlight },
      zIndex: 0,
    });

    // Model checkboxes
    for (let i = 0; i < defaultModels.length; i++) {
      const idx = i; // Capture for closure
      new Text({
        parent: app.tui,
        text: new Computed(() => {
          const models = state.value.models;
          const model = models[idx];
          if (!model) return "";
          const checkbox = model.selected ? "[x]" : "[ ]";
          const cursor = modelCursor.value === idx ? ">" : " ";
          return `${cursor} ${checkbox} ${model.name}`;
        }),
        rectangle: { column: col + 2, row: 8 + idx, width: 30 },
        theme: { base: theme.text.normal },
        zIndex: 0,
      });
    }

    // Task pattern
    new Text({
      parent: app.tui,
      text: "Task Pattern",
      rectangle: { column: col, row: 14, width: 40 },
      theme: { base: theme.text.highlight },
      zIndex: 0,
    });

    new Text({
      parent: app.tui,
      text: new Computed(() => `  ${state.value.taskPattern}`),
      rectangle: { column: col, row: 15, width: 40 },
      theme: { base: theme.text.normal },
      zIndex: 0,
    });

    // Settings
    new Text({
      parent: app.tui,
      text: new Computed(
        () =>
          `Attempts: ${state.value.attempts}  Concurrency: ${state.value.concurrency}`,
      ),
      rectangle: { column: col, row: 17, width: 40 },
      theme: { base: theme.muted },
      zIndex: 0,
    });

    // Progress (shown during running phase)
    new Text({
      parent: app.tui,
      text: new Computed((): string => {
        const p = state.value.progress;
        if (
          state.value.phase !== "running" && state.value.phase !== "complete"
        ) {
          return "";
        }
        const pct = p.total > 0 ? Math.round((p.current / p.total) * 100) : 0;
        return `Progress: ${p.current}/${p.total} (${pct}%) - ${p.status}`;
      }),
      rectangle: { column: col, row: 18, width: 50 },
      theme: { base: theme.primary },
      zIndex: 0,
    });

    new Text({
      parent: app.tui,
      text: new Computed((): string => {
        const p = state.value.progress;
        if (state.value.phase !== "running") return "";
        if (!p.currentTask) return "Initializing...";
        const attemptStr = p.currentAttempt > 0
          ? ` (attempt ${p.currentAttempt})`
          : "";
        return `Task: ${p.currentTask} - ${p.currentModel}${attemptStr}`;
      }),
      rectangle: { column: col, row: 19, width: 50 },
      theme: { base: theme.muted },
      zIndex: 0,
    });

    // Pass/fail counts
    new Text({
      parent: app.tui,
      text: new Computed((): string => {
        const p = state.value.progress;
        if (
          state.value.phase !== "running" && state.value.phase !== "complete"
        ) {
          return "";
        }
        return `Pass: ${p.passCount}  Fail: ${p.failCount}`;
      }),
      rectangle: { column: col, row: 20, width: 50 },
      theme: { base: theme.text.normal },
      zIndex: 0,
    });

    // Action menu
    menuResult = createMenu({
      parent: app.tui,
      items: [
        {
          label: "[Enter] Start Benchmark",
          action: () => startBenchmark(state, app),
        },
        {
          label: "[B] Back to Main Menu",
          action: () => app.goBack(),
        },
      ],
      startRow: 22,
    });

    // Create status bar
    createStatusBar({
      parent: app.tui,
      containerStatus: app.containerStatus,
      hints: "[Space] Toggle  [B]ack  [Enter] Start",
    });

    // Keyboard handler
    keyboardResult = createKeyboardHandler(app.tui, {
      onBack: () => app.goBack(),
      onUp: () => {
        if (modelCursor.peek() > 0) {
          modelCursor.value = modelCursor.peek() - 1;
        }
      },
      onDown: () => {
        const models = state.peek().models;
        if (modelCursor.peek() < models.length - 1) {
          modelCursor.value = modelCursor.peek() + 1;
        }
      },
      onSelect: () => startBenchmark(state, app),
      custom: {
        " ": () => {
          // Toggle selected model
          const models = state.peek().models;
          const cursor = modelCursor.peek();
          const model = models[cursor];
          if (model) {
            const newModels = [...models];
            newModels[cursor] = { ...model, selected: !model.selected };
            state.value = { ...state.peek(), models: newModels };
          }
        },
        space: () => {
          // Toggle selected model (alternative key name)
          const models = state.peek().models;
          const cursor = modelCursor.peek();
          const model = models[cursor];
          if (model) {
            const newModels = [...models];
            newModels[cursor] = { ...model, selected: !model.selected };
            state.value = { ...state.peek(), models: newModels };
          }
        },
      },
    });
  },

  cleanup(): void {
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

async function startBenchmark(
  state: Signal<BenchmarkState>,
  app: TuiApp,
): Promise<void> {
  const currentState = state.peek();

  // Get selected models
  const selectedModels = currentState.models
    .filter((m) => m.selected)
    .map((m) => m.name.replace(" (group)", ""));

  if (selectedModels.length === 0) {
    showError(app.tui, "Please select at least one model");
    return;
  }

  // Update to running phase
  state.value = {
    ...currentState,
    phase: "running",
    progress: {
      current: 0,
      total: 0,
      currentTask: "",
      currentModel: "",
      currentAttempt: 0,
      status: "Starting...",
      passCount: 0,
      failCount: 0,
    },
  };

  try {
    // Build command with --json-events for machine-readable output
    const modelArg = selectedModels.join(",");
    const cmd = new Deno.Command("deno", {
      args: [
        "task",
        "bench",
        "--llms",
        modelArg,
        "--tasks",
        currentState.taskPattern,
        "--attempts",
        currentState.attempts.toString(),
        "--max-concurrency",
        currentState.concurrency.toString(),
        "--json-events",
      ],
      stdout: "piped",
      stderr: "piped",
      cwd: Deno.cwd(),
    });

    const process = cmd.spawn();

    // Read stdout and parse JSON events
    const reader = process.stdout.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete JSON lines
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line) as BenchJsonEvent;
          updateProgressFromEvent(state, event);
        } catch {
          // Skip non-JSON lines (e.g., startup messages)
        }
      }
    }

    const result = await process.status;

    state.value = {
      ...state.peek(),
      phase: "complete",
      progress: {
        ...state.peek().progress,
        status: result.success ? "Complete!" : "Failed",
      },
    };
  } catch (error) {
    state.value = {
      ...state.peek(),
      phase: "complete",
      progress: {
        ...state.peek().progress,
        status: `Error: ${error instanceof Error ? error.message : "Unknown"}`,
      },
    };
  }
}

/**
 * Update progress state based on a JSON event from the benchmark
 */
function updateProgressFromEvent(
  state: Signal<BenchmarkState>,
  event: BenchJsonEvent,
): void {
  const current = state.peek();
  const progress = { ...current.progress };

  switch (event.type) {
    case "task_started":
      progress.currentTask = event.taskId ?? "";
      progress.status = "Running";
      break;

    case "llm_started":
      progress.currentModel = event.model ?? "";
      progress.currentAttempt = event.attempt ?? 0;
      progress.status = "LLM generating...";
      break;

    case "llm_completed":
      progress.status = event.success
        ? "Compiling..."
        : "LLM failed, retrying...";
      break;

    case "compile_completed":
      progress.status = event.success ? "Tests running..." : "Compile failed";
      break;

    case "result":
      if (event.success) {
        progress.passCount++;
      } else {
        progress.failCount++;
      }
      progress.status = event.success
        ? `Pass (score: ${event.score?.toFixed(1) ?? "?"})`
        : "Fail";
      break;

    case "task_completed":
      progress.current++;
      progress.status = event.winner
        ? `Winner: ${event.winner}`
        : "Task complete";
      break;

    case "progress":
      progress.total = event.total ?? progress.total;
      progress.current = event.completed ?? progress.current;
      break;

    case "error":
      progress.status = `Error: ${event.message ?? "Unknown"}`;
      break;
  }

  state.value = { ...current, progress };
}
