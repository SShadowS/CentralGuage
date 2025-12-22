/**
 * Container Status Screen - View and manage BC container
 */
import { Computed, Signal } from "tui";
import { Text } from "tui/components";
import type { Screen, TuiApp } from "../app.ts";
import { createHeader } from "../components/header.ts";
import { createMenu, type MenuResult } from "../components/menu.ts";
import { createStatusBar } from "../components/status-bar.ts";
import {
  showError,
  showSuccess,
  showWarning,
} from "../components/notification.ts";
import { withSpinner } from "../components/spinner.ts";
import {
  createKeyboardHandler,
  type KeyboardResult,
} from "../components/keyboard.ts";
import { layout, theme } from "../theme.ts";
import { runHealthCheck as performHealthCheck } from "../../services/health-actions.ts";

interface ContainerInfo {
  name: string;
  status: string;
  bcVersion: string;
  uptime: string;
}

let menuResult: MenuResult | undefined;
let keyboardResult: KeyboardResult | undefined;

export const containerScreen: Screen = {
  name: "container",

  render(app: TuiApp): void {
    const col = layout.padding;
    const containerName = app.containerName;
    const containerInfo = new Signal<ContainerInfo>({
      name: containerName,
      status: "Checking...",
      bcVersion: "...",
      uptime: "...",
    });

    // Create header
    createHeader({
      parent: app.tui,
      subtitle: "Container Status",
    });

    // Container info display
    const infoStartRow = 6;

    new Text({
      parent: app.tui,
      text: "Container Information",
      rectangle: { column: col, row: infoStartRow, width: 40 },
      theme: { base: theme.text.highlight },
      zIndex: 0,
    });

    new Text({
      parent: app.tui,
      text: new Computed(() => `  Name:       ${containerInfo.value.name}`),
      rectangle: { column: col, row: infoStartRow + 2, width: 40 },
      theme: { base: theme.text.normal },
      zIndex: 0,
    });

    new Text({
      parent: app.tui,
      text: new Computed(() => `  Status:     ${containerInfo.value.status}`),
      rectangle: { column: col, row: infoStartRow + 3, width: 40 },
      theme: { base: theme.success },
      zIndex: 0,
    });

    new Text({
      parent: app.tui,
      text: new Computed(
        () => `  BC Version: ${containerInfo.value.bcVersion}`,
      ),
      rectangle: { column: col, row: infoStartRow + 4, width: 40 },
      theme: { base: theme.text.normal },
      zIndex: 0,
    });

    new Text({
      parent: app.tui,
      text: new Computed(() => `  Uptime:     ${containerInfo.value.uptime}`),
      rectangle: { column: col, row: infoStartRow + 5, width: 40 },
      theme: { base: theme.text.normal },
      zIndex: 0,
    });

    // Actions menu
    new Text({
      parent: app.tui,
      text: "Quick Actions",
      rectangle: { column: col, row: infoStartRow + 7, width: 40 },
      theme: { base: theme.text.highlight },
      zIndex: 0,
    });

    menuResult = createMenu({
      parent: app.tui,
      items: [
        {
          label: "[R] Refresh Status",
          action: () => refreshContainerStatus(containerInfo, containerName),
        },
        {
          label: "[H] Full Health Check",
          action: () => runHealthCheck(app),
        },
        {
          label: "[B] Back to Main Menu",
          action: () => app.goBack(),
        },
      ],
      startRow: infoStartRow + 9,
    });

    // Create status bar
    createStatusBar({
      parent: app.tui,
      containerStatus: app.containerStatus,
      hints: "[B]ack  [R]efresh  [H]ealth Check",
    });

    // Keyboard shortcuts
    keyboardResult = createKeyboardHandler(app.tui, {
      onBack: () => app.goBack(),
      onRefresh: () => refreshContainerStatus(containerInfo, containerName),
      custom: {
        h: () => runHealthCheck(app),
      },
    });

    // Initial load
    refreshContainerStatus(containerInfo, containerName);
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

async function refreshContainerStatus(
  containerInfo: Signal<ContainerInfo>,
  containerName: string,
): Promise<void> {
  containerInfo.value = {
    ...containerInfo.peek(),
    status: "Checking...",
  };

  try {
    const cmd = new Deno.Command("pwsh", {
      args: [
        "-NoProfile",
        "-Command",
        `
        Import-Module bccontainerhelper -ErrorAction SilentlyContinue
        $state = docker inspect ${containerName} --format "{{.State.Status}}" 2>$null
        if ($state) {
          Write-Output "STATUS:$state"
          # Get uptime with proper UTC handling
          $startedAtStr = docker inspect ${containerName} --format "{{.State.StartedAt}}"
          $startedAtUtc = [DateTimeOffset]::Parse($startedAtStr)
          $uptime = [DateTimeOffset]::Now - $startedAtUtc
          $uptimeStr = "{0}h {1}m" -f [int]$uptime.TotalHours, $uptime.Minutes
          Write-Output "UPTIME:$uptimeStr"
          # Get actual BC version from container
          try {
            $version = Get-BcContainerNavVersion -containerOrImageName ${containerName}
            Write-Output "VERSION:$version"
          } catch {
            Write-Output "VERSION:Unknown"
          }
        } else {
          Write-Output "STATUS:Not Found"
          Write-Output "UPTIME:N/A"
          Write-Output "VERSION:N/A"
        }
        `,
      ],
      stdout: "piped",
      stderr: "piped",
    });

    const { stdout } = await cmd.output();
    const output = new TextDecoder().decode(stdout);

    const lines = output.split("\n");
    let status = "Unknown";
    let uptime = "N/A";
    let version = "N/A";

    for (const line of lines) {
      if (line.startsWith("STATUS:")) {
        status = line.replace("STATUS:", "").trim();
        status = status.charAt(0).toUpperCase() + status.slice(1);
      } else if (line.startsWith("UPTIME:")) {
        uptime = line.replace("UPTIME:", "").trim();
      } else if (line.startsWith("VERSION:")) {
        version = line.replace("VERSION:", "").trim();
      }
    }

    containerInfo.value = {
      name: containerName,
      status,
      bcVersion: version,
      uptime,
    };
  } catch {
    containerInfo.value = {
      name: containerName,
      status: "Error checking status",
      bcVersion: "N/A",
      uptime: "N/A",
    };
  }
}

async function runHealthCheck(app: TuiApp): Promise<void> {
  try {
    const result = await withSpinner(
      { parent: app.tui, message: "Running health check...", row: 20 },
      () => performHealthCheck(),
    );

    if (result.healthy) {
      showSuccess(app.tui, result.summary);
    } else {
      // Show warning with summary - detailed results in future modal
      showWarning(app.tui, result.summary);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showError(app.tui, `Health check failed: ${message}`);
  }
}
