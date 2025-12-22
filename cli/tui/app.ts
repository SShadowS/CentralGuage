/**
 * TUI Application - Screen navigation and state management
 */
import {
  Computed,
  handleInput,
  handleKeyboardControls,
  handleMouseControls,
  Signal,
  Tui,
} from "tui";
import type { CentralGaugeConfig } from "../../src/config/config.ts";
import { theme } from "./theme.ts";

export type ScreenName =
  | "main-menu"
  | "benchmark"
  | "tasks"
  | "results"
  | "config"
  | "container";

export interface Screen {
  name: ScreenName;
  render: (app: TuiApp) => void;
  cleanup?: () => void;
}

export class TuiApp {
  readonly tui: Tui;
  readonly currentScreen: Signal<ScreenName>;
  readonly screenStack: ScreenName[] = [];
  readonly containerStatus: Signal<string>;
  readonly isRunning: Signal<boolean>;
  readonly config: CentralGaugeConfig;

  private screens: Map<ScreenName, Screen> = new Map();
  private cleanupFn: (() => void) | undefined;

  constructor(config: CentralGaugeConfig) {
    this.config = config;
    this.tui = new Tui({
      style: theme.bg.base,
      refreshRate: 1000 / 30, // 30 FPS
    });

    this.currentScreen = new Signal<ScreenName>("main-menu");
    this.containerStatus = new Signal("Checking...");
    this.isRunning = new Signal(true);

    // Setup input handling
    handleInput(this.tui);
    handleKeyboardControls(this.tui);
    handleMouseControls(this.tui);

    // Setup Ctrl+C handler
    this.tui.dispatch();
  }

  registerScreen(screen: Screen): void {
    this.screens.set(screen.name, screen);
  }

  navigateTo(screenName: ScreenName): void {
    // Cleanup current screen
    if (this.cleanupFn) {
      this.cleanupFn();
      this.cleanupFn = undefined;
    }

    // Clear all components
    this.clearScreen();

    // Push current to stack for back navigation
    const current = this.currentScreen.peek();
    if (current !== screenName) {
      this.screenStack.push(current);
    }

    // Update current screen
    this.currentScreen.value = screenName;

    // Render new screen
    const screen = this.screens.get(screenName);
    if (screen) {
      screen.render(this);
      this.cleanupFn = screen.cleanup;
    }
  }

  goBack(): void {
    if (this.screenStack.length > 0) {
      const previous = this.screenStack.pop();
      if (previous) {
        // Cleanup current screen
        if (this.cleanupFn) {
          this.cleanupFn();
          this.cleanupFn = undefined;
        }

        this.clearScreen();
        this.currentScreen.value = previous;

        const screen = this.screens.get(previous);
        if (screen) {
          screen.render(this);
          this.cleanupFn = screen.cleanup;
        }
      }
    }
  }

  private clearScreen(): void {
    // Remove all children from tui
    for (const child of [...this.tui.children]) {
      child.destroy();
    }
  }

  quit(): void {
    this.isRunning.value = false;
    this.tui.destroy();
    Deno.exit(0);
  }

  async run(): Promise<void> {
    // Start with main menu
    this.navigateTo("main-menu");

    // Run the TUI
    this.tui.run();

    // Keep running until quit
    await new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        if (!this.isRunning.peek()) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }

  // Utility to create computed values
  computed<T>(fn: () => T): Computed<T> {
    return new Computed(fn);
  }

  // Utility to create signals
  signal<T>(initial: T): Signal<T> {
    return new Signal(initial);
  }

  // Get container name from config
  get containerName(): string {
    return this.config.container?.name ?? "Cronus27";
  }

  // Get container credentials from config
  get containerCredentials(): { username: string; password: string } {
    return {
      username: this.config.container?.credentials?.username ?? "admin",
      password: this.config.container?.credentials?.password ?? "admin",
    };
  }
}
