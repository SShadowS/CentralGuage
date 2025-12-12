/**
 * Real Business Central Container Provider using bccontainerhelper PowerShell module
 * This provider integrates with Windows bccontainerhelper for real AL compilation and testing
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

export class BcContainerProvider implements ContainerProvider {
  readonly name = "bccontainer";
  readonly platform = "windows" as const;

  private isWindows(): boolean {
    return Deno.build.os === "windows";
  }

  private async executePowerShell(script: string): Promise<{ output: string; exitCode: number }> {
    if (!this.isWindows()) {
      throw new Error("BcContainerProvider requires Windows with bccontainerhelper PowerShell module");
    }

    const process = new Deno.Command("powershell.exe", {
      args: [
        "-ExecutionPolicy", "Bypass",
        "-NoProfile",
        "-Command", script
      ],
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
  }

  async setup(config: ContainerConfig): Promise<void> {
    console.log(`🐳 [BC Container] Setting up container: ${config.name}`);
    
    // Check if bccontainerhelper is available
    const checkModule = await this.executePowerShell(`
      if (-not (Get-Module -ListAvailable -Name bccontainerhelper)) {
        Write-Output "MISSING_MODULE"
      } else {
        Write-Output "MODULE_AVAILABLE"
      }
    `);

    if (checkModule.output.includes("MISSING_MODULE")) {
      console.log("📦 Installing bccontainerhelper module...");
      const installResult = await this.executePowerShell(`
        Install-Module bccontainerhelper -Force -AllowClobber -Scope CurrentUser
        Import-Module bccontainerhelper
        Write-Output "MODULE_INSTALLED"
      `);
      
      if (installResult.exitCode !== 0) {
        throw new Error(`Failed to install bccontainerhelper: ${installResult.output}`);
      }
    }

    // Remove existing container if it exists
    await this.executePowerShell(`
      Import-Module bccontainerhelper
      if (Get-BcContainer -containerName "${config.name}" -ErrorAction SilentlyContinue) {
        Write-Output "Removing existing container: ${config.name}"
        Remove-BcContainer -containerName "${config.name}"
      }
    `);

    // Create new container
    const setupScript = `
      Import-Module bccontainerhelper
      
      Write-Output "Creating Business Central container: ${config.name}"
      New-BcContainer \
        -containerName "${config.name}" \
        -bcVersion "${config.bcVersion || "24.0"}" \
        -accept_eula \
        ${config.includeAL ? "-includeAL" : ""} \
        ${config.includeTestToolkit ? "-includeTestToolkit" : ""} \
        -auth NavUserPassword \
        -memoryLimit "${config.memoryLimit || "8G"}" \
        -accept_outdated \
        -updateHosts
      
      Write-Output "Container ${config.name} created successfully"
    `;

    const result = await this.executePowerShell(setupScript);
    
    if (result.exitCode !== 0) {
      throw new Error(`Failed to create BC container: ${result.output}`);
    }

    console.log(`✅ [BC Container] Container ${config.name} setup complete`);
  }

  async start(containerName: string): Promise<void> {
    console.log(`🚀 [BC Container] Starting container: ${containerName}`);
    
    const script = `
      Import-Module bccontainerhelper
      Start-BcContainer -containerName "${containerName}"
      Write-Output "Container ${containerName} started"
    `;

    const result = await this.executePowerShell(script);
    
    if (result.exitCode !== 0) {
      throw new Error(`Failed to start container: ${result.output}`);
    }

    console.log(`✅ [BC Container] Container ${containerName} started`);
  }

  async stop(containerName: string): Promise<void> {
    console.log(`🛑 [BC Container] Stopping container: ${containerName}`);
    
    const script = `
      Import-Module bccontainerhelper
      Stop-BcContainer -containerName "${containerName}"
      Write-Output "Container ${containerName} stopped"
    `;

    const result = await this.executePowerShell(script);
    
    if (result.exitCode !== 0) {
      throw new Error(`Failed to stop container: ${result.output}`);
    }

    console.log(`✅ [BC Container] Container ${containerName} stopped`);
  }

  async remove(containerName: string): Promise<void> {
    console.log(`🗑️  [BC Container] Removing container: ${containerName}`);
    
    const script = `
      Import-Module bccontainerhelper
      Remove-BcContainer -containerName "${containerName}"
      Write-Output "Container ${containerName} removed"
    `;

    const result = await this.executePowerShell(script);
    
    if (result.exitCode !== 0) {
      throw new Error(`Failed to remove container: ${result.output}`);
    }

    console.log(`✅ [BC Container] Container ${containerName} removed`);
  }

  async status(containerName: string): Promise<ContainerStatus> {
    const script = `
      Import-Module bccontainerhelper
      
      $container = Get-BcContainer -containerName "${containerName}" -ErrorAction SilentlyContinue
      if ($container) {
        $isRunning = docker ps --filter "name=${containerName}" --format "{{.Names}}" | Select-String "${containerName}"
        $uptime = if ($isRunning) {
          (docker inspect "${containerName}" --format "{{.State.StartedAt}}" | ForEach-Object {
            $startTime = [DateTime]::Parse($_)
            [int]((Get-Date) - $startTime).TotalSeconds
          })
        } else { 0 }
        
        Write-Output "STATUS_START"
        Write-Output "NAME:${containerName}"
        Write-Output "RUNNING:$($null -ne $isRunning)"
        Write-Output "HEALTH:$($container.State)"
        Write-Output "BCVERSION:$($container.BcVersion)"
        Write-Output "UPTIME:$uptime"
        Write-Output "STATUS_END"
      } else {
        Write-Output "CONTAINER_NOT_FOUND"
      }
    `;

    const result = await this.executePowerShell(script);
    
    if (result.output.includes("CONTAINER_NOT_FOUND")) {
      throw new Error(`Container ${containerName} not found`);
    }

    const lines = result.output.split('\n');
    const statusData: Record<string, string> = {};
    
    let inStatus = false;
    for (const line of lines) {
      if (line.trim() === "STATUS_START") {
        inStatus = true;
        continue;
      }
      if (line.trim() === "STATUS_END") {
        break;
      }
      if (inStatus && line.includes(':')) {
        const colonIndex = line.indexOf(':');
        const key = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();
        if (key) {
          statusData[key] = value;
        }
      }
    }

    // Map health status to valid union type
    const healthRaw = statusData["HEALTH"] || "stopped";
    const healthMap: Record<string, ContainerStatus["health"]> = {
      "running": "healthy",
      "healthy": "healthy",
      "starting": "starting",
      "stopped": "stopped",
      "unhealthy": "unhealthy",
    };
    const health = healthMap[healthRaw.toLowerCase()] || "stopped";

    const bcVersion = statusData["BCVERSION"];
    const uptime = parseInt(statusData["UPTIME"] || "0");

    return {
      name: statusData["NAME"] || containerName,
      isRunning: statusData["RUNNING"] === "True",
      health,
      ...(bcVersion && { bcVersion }),
      ...(uptime > 0 && { uptime }),
    };
  }

  async compileProject(containerName: string, project: ALProject): Promise<CompilationResult> {
    console.log(`🔨 [BC Container] Compiling AL project in container: ${containerName}`);

    const startTime = Date.now();
    const projectPath = project.path.replace(/\\/g, '\\\\');

    // Copy project to container and compile
    const script = `
      Import-Module bccontainerhelper

      $tempPath = "C:\\temp\\al_project_${Date.now()}"

      # Copy project to container
      Copy-ToNavContainer -containerName "${containerName}" -localPath "${projectPath}" -containerPath $tempPath

      # Compile AL project
      $compileResult = Compile-AppInBcContainer -containerName "${containerName}" -appProjectFolder $tempPath -credential (New-Object PSCredential("admin", (ConvertTo-SecureString "admin" -AsPlainText -Force))) -ErrorAction Continue

      # Parse compilation results
      if ($compileResult -and $compileResult.Count -gt 0) {
        Write-Output "COMPILE_START"
        foreach ($result in $compileResult) {
          if ($result -match "error|Error|ERROR") {
            Write-Output "ERROR:$result"
          } elseif ($result -match "warning|Warning|WARNING") {
            Write-Output "WARNING:$result"
          }
        }
        Write-Output "COMPILE_END"
      } else {
        Write-Output "COMPILE_SUCCESS"
      }

      # Clean up container temp directory
      Invoke-ScriptInBcContainer -containerName "${containerName}" -scriptblock { Remove-Item -Path $tempPath -Recurse -Force -ErrorAction SilentlyContinue }
    `;

    const result = await this.executePowerShell(script);
    const duration = Date.now() - startTime;

    // Parse compilation results
    const errors: CompilationError[] = [];
    const warnings: CompilationWarning[] = [];

    const lines = result.output.split('\n');
    let inCompile = false;

    for (const line of lines) {
      if (line.trim() === "COMPILE_START") {
        inCompile = true;
        continue;
      }
      if (line.trim() === "COMPILE_END" || line.trim() === "COMPILE_SUCCESS") {
        break;
      }

      if (inCompile) {
        if (line.startsWith("ERROR:")) {
          const message = line.substring(6);
          // Parse AL error format: filename(line,col): error AL####: message
          const match = message.match(/([^(]+)\((\d+),(\d+)\):\s*error\s+(AL\d+):\s*(.+)/);
          if (match) {
            errors.push({
              file: match[1] || "unknown",
              line: parseInt(match[2] || "0"),
              column: parseInt(match[3] || "0"),
              code: match[4] || "AL0000",
              message: match[5] || message,
              severity: "error",
            });
          } else {
            errors.push({
              file: "unknown",
              line: 0,
              column: 0,
              code: "AL0000",
              message: message,
              severity: "error",
            });
          }
        } else if (line.startsWith("WARNING:")) {
          const message = line.substring(8);
          const match = message.match(/([^(]+)\((\d+),(\d+)\):\s*warning\s+(AL\d+):\s*(.+)/);
          if (match) {
            warnings.push({
              file: match[1] || "unknown",
              line: parseInt(match[2] || "0"),
              column: parseInt(match[3] || "0"),
              code: match[4] || "AL0000",
              message: match[5] || message,
              severity: "warning",
            });
          } else {
            warnings.push({
              file: "unknown",
              line: 0,
              column: 0,
              code: "AL0000",
              message: message,
              severity: "warning",
            });
          }
        }
      }
    }

    const success = errors.length === 0;

    console.log(`${success ? '✅' : '❌'} [BC Container] Compilation ${success ? 'succeeded' : 'failed'}: ${errors.length} errors, ${warnings.length} warnings`);

    return {
      success,
      errors,
      warnings,
      output: result.output,
      duration,
    };
  }

  async runTests(containerName: string, project: ALProject): Promise<TestResult> {
    console.log(`🧪 [BC Container] Running tests in container: ${containerName}`);

    const startTime = Date.now();
    const projectPath = project.path.replace(/\\/g, '\\\\');

    // Run tests in container
    const script = `
      Import-Module bccontainerhelper

      $tempPath = "C:\\temp\\al_test_${Date.now()}"

      # Copy project to container
      Copy-ToNavContainer -containerName "${containerName}" -localPath "${projectPath}" -containerPath $tempPath

      # Run AL tests
      $testResult = Run-TestsInBcContainer -containerName "${containerName}" -appProjectFolder $tempPath -credential (New-Object PSCredential("admin", (ConvertTo-SecureString "admin" -AsPlainText -Force))) -ErrorAction Continue

      # Parse test results
      Write-Output "TEST_START"
      if ($testResult) {
        foreach ($result in $testResult) {
          Write-Output "TESTRESULT:$result"
        }
      }
      Write-Output "TEST_END"

      # Clean up container temp directory
      Invoke-ScriptInBcContainer -containerName "${containerName}" -scriptblock { Remove-Item -Path $tempPath -Recurse -Force -ErrorAction SilentlyContinue }
    `;

    const result = await this.executePowerShell(script);
    const duration = Date.now() - startTime;

    // Parse test results
    const results: TestCaseResult[] = [];

    const lines = result.output.split('\n');
    let inTest = false;

    for (const line of lines) {
      if (line.trim() === "TEST_START") {
        inTest = true;
        continue;
      }
      if (line.trim() === "TEST_END") {
        break;
      }

      if (inTest && line.startsWith("TESTRESULT:")) {
        const testInfo = line.substring(11);
        // Parse AL test result format
        const passMatch = testInfo.match(/Test\s+(\w+)\s+passed(?:\s+in\s+(\d+)ms)?/);
        const failMatch = testInfo.match(/Test\s+(\w+)\s+failed(?:\s+in\s+(\d+)ms)?:\s*(.+)/);

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
    }

    const totalTests = results.length;
    const passedTests = results.filter(r => r.passed).length;
    const failedTests = totalTests - passedTests;
    const success = failedTests === 0;

    console.log(`${success ? '✅' : '❌'} [BC Container] Tests ${success ? 'passed' : 'failed'}: ${passedTests}/${totalTests} passed`);

    return {
      success,
      totalTests,
      passedTests,
      failedTests,
      results,
      duration,
      output: result.output,
    };
  }

  async copyToContainer(containerName: string, localPath: string, containerPath: string): Promise<void> {
    const script = `
      Import-Module bccontainerhelper
      Copy-ToNavContainer -containerName "${containerName}" -localPath "${localPath}" -containerPath "${containerPath}"
      Write-Output "Copied ${localPath} to ${containerName}:${containerPath}"
    `;

    const result = await this.executePowerShell(script);
    
    if (result.exitCode !== 0) {
      throw new Error(`Failed to copy to container: ${result.output}`);
    }
  }

  async copyFromContainer(containerName: string, containerPath: string, localPath: string): Promise<void> {
    const script = `
      Import-Module bccontainerhelper
      Copy-FromNavContainer -containerName "${containerName}" -containerPath "${containerPath}" -localPath "${localPath}"
      Write-Output "Copied ${containerName}:${containerPath} to ${localPath}"
    `;

    const result = await this.executePowerShell(script);
    
    if (result.exitCode !== 0) {
      throw new Error(`Failed to copy from container: ${result.output}`);
    }
  }

  async executeCommand(containerName: string, command: string): Promise<{ output: string; exitCode: number }> {
    const script = `
      Import-Module bccontainerhelper
      $result = Invoke-ScriptInBcContainer -containerName "${containerName}" -scriptblock { ${command} }
      Write-Output $result
    `;

    return await this.executePowerShell(script);
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