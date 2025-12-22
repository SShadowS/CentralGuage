/**
 * CentralGauge TUI - Text User Interface entry point
 */
import { ConfigManager } from "../../src/config/config.ts";
import { TuiApp } from "./app.ts";
import { mainMenuScreen } from "./screens/main-menu.ts";
import { benchmarkScreen } from "./screens/benchmark.ts";
import { tasksScreen } from "./screens/tasks.ts";
import { resultsScreen } from "./screens/results.ts";
import { configScreen } from "./screens/config.ts";
import { containerScreen } from "./screens/container.ts";

/**
 * Start the TUI application
 */
export async function startTui(): Promise<void> {
  // Load configuration
  const config = await ConfigManager.loadConfig();
  const app = new TuiApp(config);

  // Register all screens
  app.registerScreen(mainMenuScreen);
  app.registerScreen(benchmarkScreen);
  app.registerScreen(tasksScreen);
  app.registerScreen(resultsScreen);
  app.registerScreen(configScreen);
  app.registerScreen(containerScreen);

  // Check container status on startup
  checkContainerStatus(app);

  // Run the app
  await app.run();
}

/**
 * Check container status in background
 */
async function checkContainerStatus(app: TuiApp): Promise<void> {
  const containerName = app.containerName;
  try {
    // Try to get container status via PowerShell
    const cmd = new Deno.Command("pwsh", {
      args: [
        "-NoProfile",
        "-Command",
        `Import-Module bccontainerhelper; $c = Get-BcContainers | Where-Object { $_.containerName -eq '${containerName}' }; if ($c) { Write-Output '${containerName}: Running' } else { Write-Output '${containerName}: Not Found' }`,
      ],
      stdout: "piped",
      stderr: "piped",
    });

    const { stdout } = await cmd.output();
    const output = new TextDecoder().decode(stdout).trim();

    if (output.includes("Running")) {
      app.containerStatus.value = `${containerName}: Running`;
    } else if (output.includes("Not Found")) {
      app.containerStatus.value = `${containerName}: Not Found`;
    } else {
      app.containerStatus.value = `${containerName}: Unknown`;
    }
  } catch {
    // If PowerShell fails, show unknown status
    app.containerStatus.value =
      `${containerName}: Unknown (pwsh not available)`;
  }
}
