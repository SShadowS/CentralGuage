/**
 * Docker-based Business Central Container Provider
 * Cross-platform container support using Docker with BC container images
 */

import type { ContainerProvider } from "./interface.ts";
import type {
  ALProject,
  CompilationResult,
  ContainerConfig,
  ContainerStatus,
  TestResult,
} from "./types.ts";
import { ContainerError } from "../errors.ts";
import { Logger } from "../logger/mod.ts";

const log = Logger.create("container:docker");
import {
  calculateDockerTestMetrics,
  calculateUptime,
  extractBcVersionFromImage,
  isContainerReady,
  isDockerCompilationSuccessful,
  mapDockerHealthStatus,
  parseDockerCompilationErrors,
  parseDockerCompilationWarnings,
  parseDockerInspect,
  parseDockerTestResults,
} from "./docker-output-parsers.ts";

export class DockerContainerProvider implements ContainerProvider {
  readonly name = "docker";
  readonly platform = "linux" as const;

  private async executeDocker(
    args: string[],
  ): Promise<{ output: string; exitCode: number }> {
    try {
      const process = new Deno.Command("docker", {
        args,
        stdout: "piped",
        stderr: "piped",
      });

      const { code, stdout, stderr } = await process.output();
      const output = new TextDecoder().decode(stdout);
      const error = new TextDecoder().decode(stderr);

      return {
        output: output + (error ? `\nSTDERR: ${error}` : ""),
        exitCode: code,
      };
    } catch (error) {
      throw new ContainerError(
        `Docker command failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "docker",
        "setup",
        {
          originalError: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  private async checkDockerAvailable(): Promise<void> {
    try {
      const result = await this.executeDocker(["--version"]);
      if (result.exitCode !== 0) {
        throw new ContainerError(
          "Docker is not responding",
          "docker",
          "health",
        );
      }
    } catch (error) {
      if (error instanceof ContainerError) throw error;
      throw new ContainerError(
        "Docker is not installed or not accessible. Please install Docker and ensure it's running.",
        "docker",
        "setup",
      );
    }
  }

  async setup(config: ContainerConfig): Promise<void> {
    log.info("Setting up container", { name: config.name });

    await this.checkDockerAvailable();

    // Remove existing container if it exists
    await this.executeDocker(["rm", "-f", config.name]).catch(() => {
      // Ignore error if container doesn't exist
    });

    // Determine BC image to use
    const bcVersion = config.bcVersion || "24.0";
    const imageName = `mcr.microsoft.com/businesscentral:${bcVersion}`;

    log.info("Using BC image", { image: imageName });

    // Pull the BC image if not present
    log.info("Pulling BC image");
    const pullResult = await this.executeDocker(["pull", imageName]);
    if (pullResult.exitCode !== 0) {
      throw new ContainerError(
        `Failed to pull BC image: ${pullResult.output}`,
        config.name,
        "setup",
        { image: imageName },
      );
    }

    // Get credentials from config or use defaults
    const username = config.credentials?.username ?? "admin";
    const password = config.credentials?.password ?? "admin";

    // Create and start container
    const dockerArgs = [
      "run",
      "-d",
      "--name",
      config.name,
      "--hostname",
      config.name,
      "-e",
      "ACCEPT_EULA=Y",
      "-e",
      "useSSL=N",
      "-e",
      "auth=NavUserPassword",
      "-e",
      `username=${username}`,
      "-e",
      `password=${password}`,
      "-p",
      "8080:8080", // Web client
      "-p",
      "7046-7049:7046-7049", // Service tiers
      "--memory",
      config.memoryLimit || "8g",
    ];

    if (config.includeAL) {
      dockerArgs.push("-e", "includeAL=Y");
    }

    if (config.includeTestToolkit) {
      dockerArgs.push("-e", "includeTestToolkit=Y");
    }

    dockerArgs.push(imageName);

    const createResult = await this.executeDocker(dockerArgs);
    if (createResult.exitCode !== 0) {
      throw new ContainerError(
        `Failed to create container: ${createResult.output}`,
        config.name,
        "setup",
      );
    }

    // Wait for container to be ready
    log.info("Waiting for container to be ready");
    await this.waitForContainerReady(config.name, 300000); // 5 minute timeout

    log.info("Container setup complete", { name: config.name });
  }

  private async waitForContainerReady(
    containerName: string,
    timeoutMs: number,
  ): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      try {
        const logsResult = await this.executeDocker([
          "logs",
          "--tail",
          "50",
          containerName,
        ]);
        if (isContainerReady(logsResult.output)) {
          return;
        }
      } catch {
        // Continue waiting
      }

      await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds
    }

    throw new ContainerError(
      `Container ${containerName} did not become ready within ${
        timeoutMs / 1000
      } seconds`,
      containerName,
      "start",
      { timeoutMs },
    );
  }

  async start(containerName: string): Promise<void> {
    log.info("Starting container", { name: containerName });

    const result = await this.executeDocker(["start", containerName]);
    if (result.exitCode !== 0) {
      throw new ContainerError(
        `Failed to start container: ${result.output}`,
        containerName,
        "start",
      );
    }

    log.info("Container started", { name: containerName });
  }

  async stop(containerName: string): Promise<void> {
    log.info("Stopping container", { name: containerName });

    const result = await this.executeDocker(["stop", containerName]);
    if (result.exitCode !== 0) {
      throw new ContainerError(
        `Failed to stop container: ${result.output}`,
        containerName,
        "stop",
      );
    }

    log.info("Container stopped", { name: containerName });
  }

  async remove(containerName: string): Promise<void> {
    log.info("Removing container", { name: containerName });

    const result = await this.executeDocker(["rm", "-f", containerName]);
    if (result.exitCode !== 0) {
      throw new ContainerError(
        `Failed to remove container: ${result.output}`,
        containerName,
        "stop",
      );
    }

    log.info("Container removed", { name: containerName });
  }

  async status(containerName: string): Promise<ContainerStatus> {
    // Get container info
    const inspectResult = await this.executeDocker([
      "inspect",
      containerName,
      "--format",
      "{{.State.Running}}|{{.State.Health.Status}}|{{.Config.Image}}|{{.State.StartedAt}}",
    ]);

    if (inspectResult.exitCode !== 0) {
      throw new ContainerError(
        `Container ${containerName} not found`,
        containerName,
        "health",
      );
    }

    // Parse docker inspect output using extracted function
    const inspectData = parseDockerInspect(inspectResult.output);
    const isRunning = inspectData.running === "true";

    // Extract BC version and calculate uptime
    const bcVersion = extractBcVersionFromImage(inspectData.image);
    const uptime = calculateUptime(inspectData.startedAt, isRunning);

    // Map health status using extracted function
    const healthStatus = mapDockerHealthStatus(inspectData.health, isRunning);

    // Build result with optional properties
    const result: ContainerStatus = {
      name: containerName,
      isRunning,
      health: healthStatus,
    };
    if (bcVersion !== undefined) {
      result.bcVersion = bcVersion;
    }
    if (uptime > 0) {
      result.uptime = uptime;
    }

    return result;
  }

  async compileProject(
    containerName: string,
    project: ALProject,
  ): Promise<CompilationResult> {
    log.info("Compiling AL project in container", { name: containerName });

    const startTime = Date.now();
    const projectPath = project.path;

    // Copy project to container
    const containerPath = "/tmp/al_project";
    const copyResult = await this.executeDocker([
      "cp",
      `${projectPath}/.`,
      `${containerName}:${containerPath}`,
    ]);

    if (copyResult.exitCode !== 0) {
      throw new ContainerError(
        `Failed to copy project to container: ${copyResult.output}`,
        containerName,
        "compile",
        { projectPath },
      );
    }

    try {
      // Compile AL project using BC container's AL compiler
      const compileScript = `
        cd ${containerPath} && \
        alc.exe /project:. /packagecachepath:/packages /out:/tmp/build 2>&1 || echo "COMPILE_FAILED"
      `;

      const compileResult = await this.executeDocker([
        "exec",
        containerName,
        "powershell",
        "-Command",
        compileScript,
      ]);

      const duration = Date.now() - startTime;

      // Parse compilation results using extracted functions
      const errors = parseDockerCompilationErrors(compileResult.output);
      const warnings = parseDockerCompilationWarnings(compileResult.output);
      const success = isDockerCompilationSuccessful(
        compileResult.output,
        errors.length,
      );

      log.info("Compilation complete", {
        success,
        errors: errors.length,
        warnings: warnings.length,
      });

      return {
        success,
        errors,
        warnings,
        output: compileResult.output,
        duration,
      };
    } finally {
      // Clean up container temp files
      await this.executeDocker([
        "exec",
        containerName,
        "powershell",
        "-Command",
        "Remove-Item -Path /tmp/al_project -Recurse -Force -ErrorAction SilentlyContinue",
      ]).catch(() => {
        // Ignore cleanup errors
      });
    }
  }

  publishApp(
    _containerName: string,
    _appPath: string,
  ): Promise<void> {
    return Promise.reject(
      new ContainerError(
        "publishApp not implemented for Docker provider",
        _containerName,
        "setup",
      ),
    );
  }

  async runTests(
    containerName: string,
    project: ALProject,
    _appFilePath?: string,
    _testCodeunitId?: number,
  ): Promise<TestResult> {
    log.info("Running tests in container", { name: containerName });

    const startTime = Date.now();
    const projectPath = project.path;

    // Copy project to container
    const containerPath = "/tmp/al_test";
    await this.executeDocker([
      "cp",
      `${projectPath}/.`,
      `${containerName}:${containerPath}`,
    ]);

    try {
      // Run AL tests
      const testScript = `
        cd ${containerPath} && \
        Get-TestsFromBCContainer -containerName localhost -testCodeunit * 2>&1 || echo "TEST_FAILED"
      `;

      const testResult = await this.executeDocker([
        "exec",
        containerName,
        "powershell",
        "-Command",
        testScript,
      ]);

      const duration = Date.now() - startTime;

      // Parse test results using extracted functions
      const results = parseDockerTestResults(testResult.output);
      const metrics = calculateDockerTestMetrics(results);

      log.info("Tests complete", {
        success: metrics.success,
        passed: metrics.passedTests,
        total: metrics.totalTests,
      });

      return {
        success: metrics.success,
        totalTests: metrics.totalTests,
        passedTests: metrics.passedTests,
        failedTests: metrics.failedTests,
        results,
        duration,
        output: testResult.output,
      };
    } finally {
      // Clean up container temp files
      await this.executeDocker([
        "exec",
        containerName,
        "powershell",
        "-Command",
        "Remove-Item -Path /tmp/al_test -Recurse -Force -ErrorAction SilentlyContinue",
      ]).catch(() => {
        // Ignore cleanup errors
      });
    }
  }

  async copyToContainer(
    containerName: string,
    localPath: string,
    containerPath: string,
  ): Promise<void> {
    const result = await this.executeDocker([
      "cp",
      localPath,
      `${containerName}:${containerPath}`,
    ]);

    if (result.exitCode !== 0) {
      throw new ContainerError(
        `Failed to copy to container: ${result.output}`,
        containerName,
        "compile",
        { localPath, containerPath },
      );
    }
  }

  async copyFromContainer(
    containerName: string,
    containerPath: string,
    localPath: string,
  ): Promise<void> {
    const result = await this.executeDocker([
      "cp",
      `${containerName}:${containerPath}`,
      localPath,
    ]);

    if (result.exitCode !== 0) {
      throw new ContainerError(
        `Failed to copy from container: ${result.output}`,
        containerName,
        "compile",
        { localPath, containerPath },
      );
    }
  }

  async executeCommand(
    containerName: string,
    command: string,
  ): Promise<{ output: string; exitCode: number }> {
    return await this.executeDocker([
      "exec",
      containerName,
      "powershell",
      "-Command",
      command,
    ]);
  }

  async isHealthy(containerName: string): Promise<boolean> {
    try {
      const status = await this.status(containerName);
      return status.isRunning && status.health === "healthy";
    } catch {
      return false;
    }
  }
}
