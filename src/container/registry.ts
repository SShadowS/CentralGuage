import type { ContainerProvider } from "./interface.ts";
import { MockContainerProvider } from "./mock-provider.ts";
import { BcContainerProvider } from "./bc-container-provider.ts";
import { DockerContainerProvider } from "./docker-container-provider.ts";
import { ConfigurationError } from "../errors.ts";
import { Logger } from "../logger/mod.ts";

const log = Logger.create("container");

export class ContainerProviderRegistry {
  private static providers = new Map<string, () => ContainerProvider>();
  private static instances = new Map<string, ContainerProvider>();

  static {
    // Register built-in providers
    this.register("bccontainer", () => new BcContainerProvider());
    this.register("docker", () => new DockerContainerProvider());
    this.register("mock", () => new MockContainerProvider());
  }

  static register(name: string, factory: () => ContainerProvider): void {
    this.providers.set(name, factory);
  }

  static create(name: string): ContainerProvider {
    // Return cached instance if it exists (for providers that need to maintain state)
    if (this.instances.has(name)) {
      return this.instances.get(name)!;
    }

    const factory = this.providers.get(name);
    if (!factory) {
      throw new ConfigurationError(
        `Unknown container provider: ${name}. Available: ${
          Array.from(this.providers.keys()).join(", ")
        }`,
        undefined,
        { provider: name, available: Array.from(this.providers.keys()) },
      );
    }

    const instance = factory();
    this.instances.set(name, instance);
    return instance;
  }

  static list(): string[] {
    return Array.from(this.providers.keys());
  }

  static isAvailable(name: string): boolean {
    return this.providers.has(name);
  }

  // Clear cached instances (useful for testing)
  static clearInstances(): void {
    this.instances.clear();
  }

  /**
   * Auto-detect the best available container provider for the current platform
   */
  static async detectBestProvider(): Promise<string> {
    // On Windows, prefer bccontainer if available
    if (Deno.build.os === "windows") {
      try {
        // Verify provider is registered (will throw if not)
        this.create("bccontainer");
        // Test if PowerShell and bccontainerhelper are available
        const process = new Deno.Command("powershell.exe", {
          args: [
            "-Command",
            "Get-Module -ListAvailable -Name bccontainerhelper",
          ],
          stdout: "piped",
          stderr: "piped",
        });
        const result = await process.output();
        if (result.code === 0) {
          log.info("bccontainerhelper detected - using Windows BC containers");
          return "bccontainer";
        }
      } catch {
        // Fall through to Docker
      }
    }

    // Try Docker on all platforms
    try {
      const process = new Deno.Command("docker", {
        args: ["--version"],
        stdout: "piped",
        stderr: "piped",
      });
      const result = await process.output();
      if (result.code === 0) {
        log.info("Docker detected - using Docker containers");
        return "docker";
      }
    } catch {
      // Fall through to mock
    }

    log.warn("No real container providers available - falling back to mock");
    log.warn(
      "Install Docker or (on Windows) bccontainerhelper for real BC compilation",
    );
    return "mock";
  }

  /**
   * Get the default container provider (auto-detected or fallback to mock)
   */
  static async getDefault(): Promise<ContainerProvider> {
    const providerName = await this.detectBestProvider();
    return this.create(providerName);
  }
}
