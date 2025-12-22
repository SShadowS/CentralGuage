/**
 * Configuration Screen - API keys and settings
 */
import { Computed, Signal } from "tui";
import { Text } from "tui/components";
import type { Screen, TuiApp } from "../app.ts";
import { createHeader } from "../components/header.ts";
import { createMenu, type MenuResult } from "../components/menu.ts";
import { createStatusBar } from "../components/status-bar.ts";
import { showError, showSuccess } from "../components/notification.ts";
import {
  createKeyboardHandler,
  type KeyboardResult,
} from "../components/keyboard.ts";
import { layout, theme } from "../theme.ts";
import {
  createEnvTemplate as createEnvTemplateAction,
  initializeConfigFile,
} from "../../services/config-actions.ts";

interface ConfigInfo {
  anthropicKey: string;
  openaiKey: string;
  azureKey: string;
  containerName: string;
  containerProvider: string;
}

let menuResult: MenuResult | undefined;
let keyboardResult: KeyboardResult | undefined;

export const configScreen: Screen = {
  name: "config",

  render(app: TuiApp): void {
    const col = layout.padding;
    const configInfo = new Signal<ConfigInfo>({
      anthropicKey: "Checking...",
      openaiKey: "Checking...",
      azureKey: "Not Set",
      containerName: app.containerName,
      containerProvider: app.config.container?.provider ?? "bccontainer",
    });

    // Create header
    createHeader({
      parent: app.tui,
      subtitle: "Configuration",
    });

    // API Keys section
    const infoStartRow = 6;

    new Text({
      parent: app.tui,
      text: "API Keys",
      rectangle: { column: col, row: infoStartRow, width: 40 },
      theme: { base: theme.text.highlight },
      zIndex: 0,
    });

    new Text({
      parent: app.tui,
      text: new Computed(
        () => `  Anthropic: ${configInfo.value.anthropicKey}`,
      ),
      rectangle: { column: col, row: infoStartRow + 2, width: 50 },
      theme: { base: theme.success },
      zIndex: 0,
    });

    new Text({
      parent: app.tui,
      text: new Computed(() => `  OpenAI:    ${configInfo.value.openaiKey}`),
      rectangle: { column: col, row: infoStartRow + 3, width: 50 },
      theme: { base: theme.success },
      zIndex: 0,
    });

    new Text({
      parent: app.tui,
      text: new Computed(() => `  Azure:     ${configInfo.value.azureKey}`),
      rectangle: { column: col, row: infoStartRow + 4, width: 50 },
      theme: { base: theme.muted },
      zIndex: 0,
    });

    // Container section
    new Text({
      parent: app.tui,
      text: "Container Settings",
      rectangle: { column: col, row: infoStartRow + 6, width: 40 },
      theme: { base: theme.text.highlight },
      zIndex: 0,
    });

    new Text({
      parent: app.tui,
      text: new Computed(
        () => `  Name:     ${configInfo.value.containerName}`,
      ),
      rectangle: { column: col, row: infoStartRow + 8, width: 40 },
      theme: { base: theme.text.normal },
      zIndex: 0,
    });

    new Text({
      parent: app.tui,
      text: new Computed(
        () => `  Provider: ${configInfo.value.containerProvider}`,
      ),
      rectangle: { column: col, row: infoStartRow + 9, width: 40 },
      theme: { base: theme.text.normal },
      zIndex: 0,
    });

    // Actions menu
    menuResult = createMenu({
      parent: app.tui,
      items: [
        {
          label: "[I] Initialize Config File",
          action: () => initConfig(app),
        },
        {
          label: "[E] Create .env Template",
          action: () => createEnvTemplate(app),
        },
        {
          label: "[B] Back to Main Menu",
          action: () => app.goBack(),
        },
      ],
      startRow: infoStartRow + 11,
    });

    // Create status bar
    createStatusBar({
      parent: app.tui,
      containerStatus: app.containerStatus,
      hints: "[B]ack  [I]nit Config  [E]nv Template",
    });

    // Keyboard shortcuts
    keyboardResult = createKeyboardHandler(app.tui, {
      onBack: () => app.goBack(),
      custom: {
        i: () => initConfig(app),
        e: () => createEnvTemplate(app),
      },
    });

    // Load config on mount
    loadConfig(configInfo, app);
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

function loadConfig(configInfo: Signal<ConfigInfo>, app: TuiApp): void {
  // Check environment variables
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  const azureKey = Deno.env.get("AZURE_OPENAI_API_KEY");

  configInfo.value = {
    anthropicKey: anthropicKey ? maskKey(anthropicKey) : "Not Set",
    openaiKey: openaiKey ? maskKey(openaiKey) : "Not Set",
    azureKey: azureKey ? maskKey(azureKey) : "Not Set",
    containerName: app.containerName,
    containerProvider: app.config.container?.provider ?? "bccontainer",
  };
}

function maskKey(key: string): string {
  if (key.length <= 8) return "****";
  return key.slice(0, 7) + "..." + key.slice(-4);
}

async function initConfig(app: TuiApp): Promise<void> {
  try {
    const result = await initializeConfigFile();
    if (result.success) {
      showSuccess(app.tui, result.message);
    } else {
      showError(app.tui, result.message);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showError(app.tui, `Failed to create config: ${message}`);
  }
}

async function createEnvTemplate(app: TuiApp): Promise<void> {
  try {
    const result = await createEnvTemplateAction();
    if (result.success) {
      showSuccess(app.tui, result.message);
    } else {
      showError(app.tui, result.message);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showError(app.tui, `Failed to create .env: ${message}`);
  }
}
