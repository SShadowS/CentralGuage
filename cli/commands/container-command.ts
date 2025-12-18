/**
 * Container management commands
 * @module cli/commands/container
 */

import { Command } from "@cliffy/command";
import { ContainerProviderRegistry } from "../../src/container/registry.ts";
import type { ContainerConfig } from "../../src/container/types.ts";

async function handleContainerSetup(
  name: string,
  provider: string,
  bcVersion?: string,
  memory?: string,
): Promise<void> {
  const containerProvider = ContainerProviderRegistry.create(provider);
  const config: ContainerConfig = {
    name,
    bcVersion: bcVersion || "24.0",
    memoryLimit: memory || "8G",
    acceptEula: true,
    includeAL: true,
    includeTestToolkit: true,
  };

  await containerProvider.setup(config);
}

async function handleContainerControl(
  action: string,
  name: string,
): Promise<void> {
  const provider = await ContainerProviderRegistry.getDefault();

  switch (action) {
    case "start":
      await provider.start(name);
      break;
    case "stop":
      await provider.stop(name);
      break;
    case "remove":
      await provider.remove(name);
      break;
    case "status": {
      const status = await provider.status(name);
      console.log(`Container Status: ${status.name}`);
      console.log(`   Running: ${status.isRunning ? "Yes" : "No"}`);
      console.log(`   Health: ${status.health}`);
      if (status.bcVersion) console.log(`   BC Version: ${status.bcVersion}`);
      if (status.uptime) console.log(`   Uptime: ${status.uptime}s`);
      break;
    }
  }
}

export function registerContainerCommands(cli: Command): void {
  const containerCmd = new Command()
    .description("Manage Business Central containers");

  containerCmd.command("setup", "Create and setup a new container")
    .option("-n, --name <name>", "Container name", { required: true })
    .option("-p, --provider <provider>", "Container provider", {
      required: true,
    })
    .option("--bc-version <version>", "Business Central version", {
      default: "24.0",
    })
    .option("--memory <size>", "Memory limit", { default: "8G" })
    .action(async (options) => {
      await handleContainerSetup(
        options.name,
        options.provider,
        options.bcVersion,
        options.memory,
      );
    });

  containerCmd.command("start <name>", "Start an existing container")
    .action(async (_options, name: string) => {
      await handleContainerControl("start", name);
    });

  containerCmd.command("stop <name>", "Stop a running container")
    .action(async (_options, name: string) => {
      await handleContainerControl("stop", name);
    });

  containerCmd.command("remove <name>", "Remove a container")
    .action(async (_options, name: string) => {
      await handleContainerControl("remove", name);
    });

  containerCmd.command("status <name>", "Show container status")
    .action(async (_options, name: string) => {
      await handleContainerControl("status", name);
    });

  containerCmd.command("list", "List available providers")
    .action(() => {
      const providers = ContainerProviderRegistry.list();
      console.log("Available Container Providers:");
      for (const provider of providers) {
        console.log(`   - ${provider}`);
      }
    });

  cli.command("container", containerCmd);
}
