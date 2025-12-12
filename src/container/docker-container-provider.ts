/**
 * Docker-based Business Central Container Provider
 * Cross-platform container support using Docker with BC container images
 */

import type { ContainerProvider } from "./interface.ts";
import type {
  ALProject,
  CompilationError,
  CompilationResult,
  CompilationWarning,
  ContainerConfig,
  ContainerStatus,
  TestCaseResult,
  TestResult,
} from "./types.ts";

export class DockerContainerProvider implements ContainerProvider {
  readonly name = "docker";
  readonly platform = "linux" as const;

  private async executeDocker(args: string[]): Promise<{ output: string; exitCode: number }> {
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
        exitCode: code
      };
    } catch (error) {
      throw new Error(`Docker command failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async checkDockerAvailable(): Promise<void> {
    try {
      const result = await this.executeDocker(["--version"]);
      if (result.exitCode !== 0) {
        throw new Error("Docker is not responding");
      }
    } catch {
      throw new Error("Docker is not installed or not accessible. Please install Docker and ensure it's running.");
    }
  }

  async setup(config: ContainerConfig): Promise<void> {
    console.log(`🐳 [Docker] Setting up container: ${config.name}`);
    
    await this.checkDockerAvailable();

    // Remove existing container if it exists
    await this.executeDocker(["rm", "-f", config.name]).catch(() => {
      // Ignore error if container doesn't exist
    });

    // Determine BC image to use
    const bcVersion = config.bcVersion || "24.0";
    const imageName = `mcr.microsoft.com/businesscentral:${bcVersion}`;

    console.log(`📦 [Docker] Using BC image: ${imageName}`);

    // Pull the BC image if not present
    console.log(`📥 [Docker] Pulling BC image...`);
    const pullResult = await this.executeDocker(["pull", imageName]);
    if (pullResult.exitCode !== 0) {
      throw new Error(`Failed to pull BC image: ${pullResult.output}`);
    }

    // Create and start container
    const dockerArgs = [
      "run", "-d",
      "--name", config.name,
      "--hostname", config.name,
      "-e", "ACCEPT_EULA=Y",
      "-e", "useSSL=N",
      "-e", "auth=NavUserPassword",
      "-e", "username=admin",
      "-e", "password=admin",
      "-p", "8080:8080", // Web client
      "-p", "7046-7049:7046-7049", // Service tiers
      "--memory", config.memoryLimit || "8g",
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
      throw new Error(`Failed to create container: ${createResult.output}`);
    }

    // Wait for container to be ready
    console.log(`⏳ [Docker] Waiting for container to be ready...`);
    await this.waitForContainerReady(config.name, 300000); // 5 minute timeout

    console.log(`✅ [Docker] Container ${config.name} setup complete`);
  }

  private async waitForContainerReady(containerName: string, timeoutMs: number): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      try {
        const logsResult = await this.executeDocker(["logs", "--tail", "50", containerName]);
        if (logsResult.output.includes("Ready for connections!") || 
            logsResult.output.includes("Container is ready")) {
          return;
        }
      } catch {
        // Continue waiting
      }
      
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
    }
    
    throw new Error(`Container ${containerName} did not become ready within ${timeoutMs / 1000} seconds`);
  }

  async start(containerName: string): Promise<void> {
    console.log(`🚀 [Docker] Starting container: ${containerName}`);
    
    const result = await this.executeDocker(["start", containerName]);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to start container: ${result.output}`);
    }

    console.log(`✅ [Docker] Container ${containerName} started`);
  }

  async stop(containerName: string): Promise<void> {
    console.log(`🛑 [Docker] Stopping container: ${containerName}`);
    
    const result = await this.executeDocker(["stop", containerName]);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to stop container: ${result.output}`);
    }

    console.log(`✅ [Docker] Container ${containerName} stopped`);
  }

  async remove(containerName: string): Promise<void> {
    console.log(`🗑️  [Docker] Removing container: ${containerName}`);
    
    const result = await this.executeDocker(["rm", "-f", containerName]);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to remove container: ${result.output}`);
    }

    console.log(`✅ [Docker] Container ${containerName} removed`);
  }

  async status(containerName: string): Promise<ContainerStatus> {
    // Get container info
    const inspectResult = await this.executeDocker([
      "inspect", containerName, 
      "--format", 
      "{{.State.Running}}|{{.State.Health.Status}}|{{.Config.Image}}|{{.State.StartedAt}}"
    ]);

    if (inspectResult.exitCode !== 0) {
      throw new Error(`Container ${containerName} not found`);
    }

    const parts = inspectResult.output.trim().split('|');
    const running = parts[0];
    const health = parts[1];
    const image = parts[2] || "";
    const startedAt = parts[3];

    let uptime = 0;
    if (running === "true" && startedAt) {
      try {
        const startTime = new Date(startedAt);
        uptime = Math.floor((Date.now() - startTime.getTime()) / 1000);
      } catch {
        uptime = 0;
      }
    }

    // Extract BC version from image name
    const bcVersionMatch = image.match(/businesscentral:(\d+\.\d+)/);
    const bcVersion = bcVersionMatch ? bcVersionMatch[1] : undefined;

    // Map health status to valid union type
    const healthMap: Record<string, ContainerStatus["health"]> = {
      "healthy": "healthy",
      "unhealthy": "unhealthy",
      "starting": "starting",
      "none": running === "true" ? "healthy" : "stopped",
    };
    const healthStatus = healthMap[health || "none"] || "stopped";

    return {
      name: containerName,
      isRunning: running === "true",
      health: healthStatus,
      ...(bcVersion && { bcVersion }),
      ...(uptime > 0 && { uptime }),
    };
  }

  async compileProject(containerName: string, project: ALProject): Promise<CompilationResult> {
    console.log(`🔨 [Docker] Compiling AL project in container: ${containerName}`);

    const startTime = Date.now();
    const projectPath = project.path;

    // Copy project to container
    const containerPath = "/tmp/al_project";
    const copyResult = await this.executeDocker([
      "cp", `${projectPath}/.`, `${containerName}:${containerPath}`
    ]);

    if (copyResult.exitCode !== 0) {
      throw new Error(`Failed to copy project to container: ${copyResult.output}`);
    }

    try {
      // Compile AL project using BC container's AL compiler
      const compileScript = `
        cd ${containerPath} && \
        alc.exe /project:. /packagecachepath:/packages /out:/tmp/build 2>&1 || echo "COMPILE_FAILED"
      `;

      const compileResult = await this.executeDocker([
        "exec", containerName, "powershell", "-Command", compileScript
      ]);

      const duration = Date.now() - startTime;

      // Parse compilation results
      const errors: CompilationError[] = [];
      const warnings: CompilationWarning[] = [];

      const lines = compileResult.output.split('\n');

      for (const line of lines) {
        // Parse AL compiler output
        // Format: filename(line,col): error AL####: message
        const errorMatch = line.match(/([^(]+)\((\d+),(\d+)\):\s*error\s+(AL\d+):\s*(.+)/);
        const warningMatch = line.match(/([^(]+)\((\d+),(\d+)\):\s*warning\s+(AL\d+):\s*(.+)/);

        if (errorMatch) {
          errors.push({
            file: errorMatch[1] || "unknown",
            line: parseInt(errorMatch[2] || "0"),
            column: parseInt(errorMatch[3] || "0"),
            code: errorMatch[4] || "AL0000",
            message: errorMatch[5] || "",
            severity: "error",
          });
        } else if (warningMatch) {
          warnings.push({
            file: warningMatch[1] || "unknown",
            line: parseInt(warningMatch[2] || "0"),
            column: parseInt(warningMatch[3] || "0"),
            code: warningMatch[4] || "AL0000",
            message: warningMatch[5] || "",
            severity: "warning",
          });
        }
      }

      const success = errors.length === 0 && !compileResult.output.includes("COMPILE_FAILED");

      console.log(`${success ? '✅' : '❌'} [Docker] Compilation ${success ? 'succeeded' : 'failed'}: ${errors.length} errors, ${warnings.length} warnings`);

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
        "exec", containerName, "powershell", "-Command", "Remove-Item -Path /tmp/al_project -Recurse -Force -ErrorAction SilentlyContinue"
      ]).catch(() => {
        // Ignore cleanup errors
      });
    }
  }

  async runTests(containerName: string, project: ALProject): Promise<TestResult> {
    console.log(`🧪 [Docker] Running tests in container: ${containerName}`);

    const startTime = Date.now();
    const projectPath = project.path;

    // Copy project to container
    const containerPath = "/tmp/al_test";
    await this.executeDocker([
      "cp", `${projectPath}/.`, `${containerName}:${containerPath}`
    ]);

    try {
      // Run AL tests
      const testScript = `
        cd ${containerPath} && \
        Get-TestsFromBCContainer -containerName localhost -testCodeunit * 2>&1 || echo "TEST_FAILED"
      `;

      const testResult = await this.executeDocker([
        "exec", containerName, "powershell", "-Command", testScript
      ]);

      const duration = Date.now() - startTime;

      // Parse test results
      const results: TestCaseResult[] = [];

      const lines = testResult.output.split('\n');

      for (const line of lines) {
        // Parse AL test result format
        const passMatch = line.match(/Test\s+(\w+)\s+passed(?:\s+in\s+(\d+)ms)?/);
        const failMatch = line.match(/Test\s+(\w+)\s+failed(?:\s+in\s+(\d+)ms)?:\s*(.+)/);

        if (passMatch) {
          results.push({
            name: passMatch[1] || "unknown",
            passed: true,
            duration: parseInt(passMatch[2] || "0"),
          });
        } else if (failMatch) {
          const errorMsg = failMatch[3];
          results.push({
            name: failMatch[1] || "unknown",
            passed: false,
            duration: parseInt(failMatch[2] || "0"),
            ...(errorMsg && { error: errorMsg }),
          });
        }
      }

      const totalTests = results.length;
      const passedTests = results.filter(r => r.passed).length;
      const failedTests = totalTests - passedTests;
      const success = failedTests === 0;

      console.log(`${success ? '✅' : '❌'} [Docker] Tests ${success ? 'passed' : 'failed'}: ${passedTests}/${totalTests} passed`);

      return {
        success,
        totalTests,
        passedTests,
        failedTests,
        results,
        duration,
        output: testResult.output,
      };

    } finally {
      // Clean up container temp files
      await this.executeDocker([
        "exec", containerName, "powershell", "-Command", "Remove-Item -Path /tmp/al_test -Recurse -Force -ErrorAction SilentlyContinue"
      ]).catch(() => {
        // Ignore cleanup errors
      });
    }
  }

  async copyToContainer(containerName: string, localPath: string, containerPath: string): Promise<void> {
    const result = await this.executeDocker(["cp", localPath, `${containerName}:${containerPath}`]);
    
    if (result.exitCode !== 0) {
      throw new Error(`Failed to copy to container: ${result.output}`);
    }
  }

  async copyFromContainer(containerName: string, containerPath: string, localPath: string): Promise<void> {
    const result = await this.executeDocker(["cp", `${containerName}:${containerPath}`, localPath]);
    
    if (result.exitCode !== 0) {
      throw new Error(`Failed to copy from container: ${result.output}`);
    }
  }

  async executeCommand(containerName: string, command: string): Promise<{ output: string; exitCode: number }> {
    return await this.executeDocker(["exec", containerName, "powershell", "-Command", command]);
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