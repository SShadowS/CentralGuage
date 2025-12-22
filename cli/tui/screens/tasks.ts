/**
 * Tasks Browser Screen - Browse available benchmark tasks
 */
import { Computed, Signal } from "tui";
import { Text } from "tui/components";
import type { Screen, TuiApp } from "../app.ts";
import { createHeader } from "../components/header.ts";
import { createMenu, type MenuResult } from "../components/menu.ts";
import { createStatusBar } from "../components/status-bar.ts";
import {
  createKeyboardHandler,
  type KeyboardResult,
} from "../components/keyboard.ts";
import { showPreview } from "../components/modal.ts";
import {
  createSearchInput,
  filterItems,
  findNextMatch,
  type SearchInputResult,
} from "../components/search-input.ts";
import { layout, theme } from "../theme.ts";
import { expandGlob } from "@std/fs";
import { relative } from "@std/path";

interface TaskEntry {
  path: string;
  name: string;
  category: string;
}

import type { ModalInstance } from "../components/modal.ts";

let menuResult: MenuResult | undefined;
let keyboardResult: KeyboardResult | undefined;
let modalInstance: ModalInstance | undefined;
let searchResult: SearchInputResult | undefined;

export const tasksScreen: Screen = {
  name: "tasks",

  render(app: TuiApp): void {
    const col = layout.padding;
    const tasks = new Signal<TaskEntry[]>([]);
    const filteredTasks = new Signal<TaskEntry[]>([]);
    const searchQuery = new Signal("");
    const selectedTask = new Signal<TaskEntry | null>(null);
    const scrollOffset = new Signal(0);
    const maxVisible = 10;

    // Helper to get task display text for filtering
    const getTaskText = (task: TaskEntry): string =>
      `${task.category}/${task.name}`;

    // Update filtered tasks when tasks or search query changes
    const updateFiltered = (): void => {
      const query = searchQuery.peek();
      const allTasks = tasks.peek();
      const filtered = filterItems(allTasks, query, getTaskText);
      filteredTasks.value = filtered;

      // Reset selection to first filtered task
      if (filtered.length > 0) {
        const currentSelected = selectedTask.peek();
        if (!currentSelected || !filtered.includes(currentSelected)) {
          selectedTask.value = filtered[0] ?? null;
          scrollOffset.value = 0;
        }
      } else {
        selectedTask.value = null;
      }
    };

    // Create header
    createHeader({
      parent: app.tui,
      subtitle: "Browse Tasks",
    });

    // Loading/status indicator
    new Text({
      parent: app.tui,
      text: new Computed((): string => {
        if (tasks.value.length === 0) {
          return "Loading tasks...";
        }
        const total = tasks.value.length;
        const filtered = filteredTasks.value.length;
        const query = searchQuery.value;
        if (query) {
          return `Showing ${filtered}/${total} tasks (filter: "${query}")`;
        }
        return `Found ${total} tasks`;
      }),
      rectangle: { column: col, row: 6, width: 60 },
      theme: { base: theme.text.highlight },
      zIndex: 0,
    });

    // Task list display (using Text components for scrollable list)
    for (let i = 0; i < maxVisible; i++) {
      const idx = i; // Capture for closure
      new Text({
        parent: app.tui,
        text: new Computed((): string => {
          const taskList = filteredTasks.value;
          const offset = scrollOffset.value;
          const task = taskList[offset + idx];
          if (!task) return "";
          const prefix = selectedTask.value === task ? "> " : "  ";
          return `${prefix}${task.category}/${task.name}`;
        }),
        rectangle: { column: col, row: 8 + idx, width: 50 },
        theme: { base: theme.text.normal },
        zIndex: 0,
      });
    }

    // Scroll indicator
    new Text({
      parent: app.tui,
      text: new Computed((): string => {
        const total = filteredTasks.value.length;
        const offset = scrollOffset.value;
        if (total <= maxVisible) return "";
        return `[${offset + 1}-${
          Math.min(offset + maxVisible, total)
        } of ${total}]`;
      }),
      rectangle: { column: col, row: 19, width: 30 },
      theme: { base: theme.muted },
      zIndex: 0,
    });

    // Action menu
    menuResult = createMenu({
      parent: app.tui,
      items: [
        {
          label: "[B] Back to Main Menu",
          action: () => app.goBack(),
        },
      ],
      startRow: 20,
    });

    // Create status bar
    createStatusBar({
      parent: app.tui,
      containerStatus: app.containerStatus,
      hints: "[/] Search  [n/N] Next/Prev  [B]ack  [Enter] Preview",
    });

    // Search input component
    searchResult = createSearchInput({
      parent: app.tui,
      onSearch: (query) => {
        searchQuery.value = query;
        updateFiltered();
      },
      onConfirm: (_query) => {
        // Keep filter active, just exit search input mode
      },
      onCancel: () => {
        searchQuery.value = "";
        updateFiltered();
      },
    });

    // Helper to navigate to a specific index in filtered list
    const navigateToIndex = (index: number): void => {
      const taskList = filteredTasks.peek();
      if (index < 0 || index >= taskList.length) return;
      selectedTask.value = taskList[index] ?? null;
      // Adjust scroll if needed
      if (index < scrollOffset.peek()) {
        scrollOffset.value = index;
      } else if (index >= scrollOffset.peek() + maxVisible) {
        scrollOffset.value = index - maxVisible + 1;
      }
    };

    // Keyboard handler
    keyboardResult = createKeyboardHandler(app.tui, {
      onBack: () => {
        // If search is active, clear it first
        if (searchQuery.peek()) {
          searchQuery.value = "";
          updateFiltered();
          return;
        }
        app.goBack();
      },
      onUp: () => {
        // Ignore if search input is active
        if (searchResult?.isActive.peek()) return;
        const taskList = filteredTasks.peek();
        const currentSelected = selectedTask.peek();
        const currentIndex = currentSelected
          ? taskList.indexOf(currentSelected)
          : -1;
        if (currentIndex > 0) {
          navigateToIndex(currentIndex - 1);
        }
      },
      onDown: () => {
        // Ignore if search input is active
        if (searchResult?.isActive.peek()) return;
        const taskList = filteredTasks.peek();
        const currentSelected = selectedTask.peek();
        const currentIndex = currentSelected
          ? taskList.indexOf(currentSelected)
          : -1;
        if (currentIndex < taskList.length - 1) {
          navigateToIndex(currentIndex + 1);
        }
      },
      onSelect: () => {
        // Ignore if search input is active
        if (searchResult?.isActive.peek()) return;
        const currentSelected = selectedTask.peek();
        if (currentSelected) {
          showTaskPreview(app, currentSelected);
        }
      },
      custom: {
        "/": () => {
          // Activate search mode
          if (searchResult && !searchResult.isActive.peek()) {
            searchResult.activate();
          }
        },
        "n": () => {
          // Next match
          if (searchResult?.isActive.peek()) return;
          const query = searchQuery.peek();
          if (!query) return;
          const taskList = filteredTasks.peek();
          const currentSelected = selectedTask.peek();
          const currentIndex = currentSelected
            ? taskList.indexOf(currentSelected)
            : -1;
          const nextIndex = findNextMatch(
            taskList,
            query,
            currentIndex,
            getTaskText,
            1,
          );
          navigateToIndex(nextIndex);
        },
        "N": () => {
          // Previous match
          if (searchResult?.isActive.peek()) return;
          const query = searchQuery.peek();
          if (!query) return;
          const taskList = filteredTasks.peek();
          const currentSelected = selectedTask.peek();
          const currentIndex = currentSelected
            ? taskList.indexOf(currentSelected)
            : -1;
          const prevIndex = findNextMatch(
            taskList,
            query,
            currentIndex,
            getTaskText,
            -1,
          );
          navigateToIndex(prevIndex);
        },
      },
    });

    // Load tasks
    loadTasks(tasks, filteredTasks, selectedTask);
  },

  cleanup(): void {
    if (modalInstance) {
      modalInstance.close();
      modalInstance = undefined;
    }
    if (searchResult) {
      searchResult.cleanup();
      searchResult = undefined;
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

async function loadTasks(
  tasks: Signal<TaskEntry[]>,
  filteredTasks: Signal<TaskEntry[]>,
  selectedTask: Signal<TaskEntry | null>,
): Promise<void> {
  const taskEntries: TaskEntry[] = [];

  try {
    for await (const entry of expandGlob("tasks/**/*.yml")) {
      if (entry.isFile) {
        const relPath = relative(Deno.cwd(), entry.path);
        const parts = relPath.split(/[/\\]/);
        const category = parts.length > 2 ? parts[1] ?? "root" : "root";
        const name = parts[parts.length - 1]?.replace(".yml", "") ?? "";

        taskEntries.push({
          path: entry.path,
          name,
          category,
        });
      }
    }

    // Sort by category then name
    taskEntries.sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.name.localeCompare(b.name);
    });

    tasks.value = taskEntries;
    filteredTasks.value = taskEntries; // Initially show all tasks
    if (taskEntries.length > 0) {
      selectedTask.value = taskEntries[0] ?? null;
    }
  } catch (error) {
    console.error("Error loading tasks:", error);
    tasks.value = [];
    filteredTasks.value = [];
  }
}

async function showTaskPreview(app: TuiApp, task: TaskEntry): Promise<void> {
  try {
    const content = await Deno.readTextFile(task.path);
    modalInstance = showPreview(
      app.tui,
      `${task.category}/${task.name}`,
      content,
      () => {
        modalInstance = undefined;
      },
    );
  } catch (error) {
    console.error("Error reading task file:", error);
  }
}
