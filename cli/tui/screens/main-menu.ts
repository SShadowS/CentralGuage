/**
 * Main Menu Screen - Entry point for the TUI
 */
import { Signal } from "tui";
import { Text } from "tui/components";
import type { Screen, TuiApp } from "../app.ts";
import { createHeader } from "../components/header.ts";
import { createMenu, type MenuResult } from "../components/menu.ts";
import { createStatusBar } from "../components/status-bar.ts";
import { theme } from "../theme.ts";
import { EnvLoader } from "../../../src/utils/env-loader.ts";

let menuResult: MenuResult | undefined;

/**
 * Mask an API key, showing only first 4 and last 4 characters
 */
function maskApiKey(key: string | undefined): string {
  if (!key) return "(not set)";
  if (key.length <= 12) return "****";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

/**
 * Get environment status lines for display
 */
function getEnvStatusLines(): string[] {
  const loadResult = EnvLoader.getLoadResult();
  const config = EnvLoader.getAll();
  const providers = EnvLoader.getAvailableProviders().filter(
    (p) => !["mock", "local"].includes(p),
  );

  const lines: string[] = [];

  // Source info
  if (loadResult?.source === ".env") {
    lines.push("[ENV] Loaded from .env file");
  } else if (loadResult?.source === "system") {
    lines.push("[ENV] Using system environment");
  } else {
    lines.push("[ENV] No .env found - using defaults");
  }

  // API Keys with masked values
  if (config.ANTHROPIC_API_KEY) {
    lines.push(`  Anthropic: ${maskApiKey(config.ANTHROPIC_API_KEY)}`);
  }
  if (config.OPENAI_API_KEY) {
    lines.push(`  OpenAI: ${maskApiKey(config.OPENAI_API_KEY)}`);
  }
  if (config.GOOGLE_API_KEY || config.GEMINI_API_KEY) {
    lines.push(
      `  Gemini: ${maskApiKey(config.GOOGLE_API_KEY || config.GEMINI_API_KEY)}`,
    );
  }
  if (config.OPENROUTER_API_KEY) {
    lines.push(`  OpenRouter: ${maskApiKey(config.OPENROUTER_API_KEY)}`);
  }
  if (config.AZURE_OPENAI_API_KEY) {
    lines.push(`  Azure: ${maskApiKey(config.AZURE_OPENAI_API_KEY)}`);
  }

  // Available providers summary
  if (providers.length > 0) {
    lines.push(`  Providers: ${providers.join(", ")}`);
  } else {
    lines.push("  [!] No API keys configured");
  }

  return lines;
}

export const mainMenuScreen: Screen = {
  name: "main-menu",

  render(app: TuiApp): void {
    // Create header
    createHeader({
      parent: app.tui,
    });

    // Environment status panel (right side of screen)
    const envLines = getEnvStatusLines();
    const envStartCol = 50;
    for (let i = 0; i < envLines.length; i++) {
      new Text({
        parent: app.tui,
        text: new Signal(envLines[i] ?? ""),
        rectangle: { column: envStartCol, row: 6 + i, width: 35 },
        theme: { base: i === 0 ? theme.text.highlight : theme.muted },
        zIndex: 0,
      });
    }

    // Create main menu
    menuResult = createMenu({
      parent: app.tui,
      items: [
        {
          label: "Run Benchmark",
          description: "Select tasks, choose LLM, execute",
          action: () => app.navigateTo("benchmark"),
        },
        {
          label: "Browse Tasks",
          description: "View available tasks by category",
          action: () => app.navigateTo("tasks"),
        },
        {
          label: "View Results",
          description: "Past runs, compare models, generate reports",
          action: () => app.navigateTo("results"),
        },
        {
          label: "Configuration",
          description: "API keys, container, defaults",
          action: () => app.navigateTo("config"),
        },
        {
          label: "Container Status",
          description: "Health check, logs",
          action: () => app.navigateTo("container"),
        },
      ],
      startRow: 6,
    });

    // Create status bar
    createStatusBar({
      parent: app.tui,
      containerStatus: app.containerStatus,
      hints: "[Q]uit  [Arrow Keys] Navigate  [Enter] Select",
    });

    // Add quit handler
    const quitHandler = (event: { key: string }) => {
      const key = event.key.toLowerCase();
      if (key === "q") {
        app.quit();
      }
    };
    app.tui.on("keyPress", quitHandler);

    // Store cleanup reference
    const originalCleanup = menuResult.cleanup;
    menuResult.cleanup = () => {
      originalCleanup();
      app.tui.off("keyPress", quitHandler);
    };
  },

  cleanup(): void {
    if (menuResult) {
      menuResult.cleanup();
      menuResult = undefined;
    }
  },
};
