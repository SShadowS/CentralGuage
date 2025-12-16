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
  ContainerCredentials,
  ContainerStatus,
  TestCaseResult,
  TestResult,
} from "./types.ts";
import * as colors from "@std/fmt/colors";

export class BcContainerProvider implements ContainerProvider {
  readonly name = "bccontainer";
  readonly platform = "windows" as const;

  // Cached compiler folder path (reuse across compilations)
  private compilerFolderCache: Map<string, string> = new Map();

  // Container credentials (configured per container)
  private credentialsCache: Map<string, ContainerCredentials> = new Map();

  /**
   * Configure credentials for a container
   */
  setCredentials(
    containerName: string,
    credentials: ContainerCredentials,
  ): void {
    this.credentialsCache.set(containerName, credentials);
  }

  /**
   * Get credentials for a container (falls back to defaults)
   */
  private getCredentials(containerName: string): ContainerCredentials {
    return this.credentialsCache.get(containerName) ||
      { username: "admin", password: "admin" };
  }

  private isWindows(): boolean {
    return Deno.build.os === "windows";
  }

  private async executePowerShell(
    script: string,
  ): Promise<{ output: string; exitCode: number }> {
    if (!this.isWindows()) {
      throw new Error(
        "BcContainerProvider requires Windows with bccontainerhelper PowerShell module",
      );
    }

    const process = new Deno.Command("pwsh", {
      args: [
        "-NoProfile",
        "-Command",
        script,
      ],
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
  }

  async setup(config: ContainerConfig): Promise<void> {
    console.log(
      colors.cyan(`[BC Container] Setting up container: ${config.name}`),
    );

    // Store credentials if provided
    if (config.credentials) {
      this.setCredentials(config.name, config.credentials);
    }

    // Check if bccontainerhelper is available
    const checkModule = await this.executePowerShell(`
      if (-not (Get-Module -ListAvailable -Name bccontainerhelper)) {
        Write-Output "MISSING_MODULE"
      } else {
        Write-Output "MODULE_AVAILABLE"
      }
    `);

    if (checkModule.output.includes("MISSING_MODULE")) {
      console.log(
        colors.cyan("[BC Container] Installing bccontainerhelper module..."),
      );
      const installResult = await this.executePowerShell(`
        Install-Module bccontainerhelper -Force -AllowClobber -Scope CurrentUser
        Import-Module bccontainerhelper
        Write-Output "MODULE_INSTALLED"
      `);

      if (installResult.exitCode !== 0) {
        throw new Error(
          `Failed to install bccontainerhelper: ${installResult.output}`,
        );
      }
    }

    // Remove existing container if it exists
    await this.executePowerShell(`
      Import-Module bccontainerhelper -WarningAction SilentlyContinue
      if (Get-BcContainer -containerName "${config.name}" -ErrorAction SilentlyContinue) {
        Write-Output "Removing existing container: ${config.name}"
        Remove-BcContainer -containerName "${config.name}"
      }
    `);

    // Create new container
    const setupScript = `
      Import-Module bccontainerhelper -WarningAction SilentlyContinue

      Write-Output "Creating Business Central container: ${config.name}"
      New-BcContainer \`
        -containerName "${config.name}" \`
        -bcVersion "${config.bcVersion || "24.0"}" \`
        -accept_eula \`
        ${config.includeAL ? "-includeAL" : ""} \`
        ${config.includeTestToolkit ? "-includeTestToolkit" : ""} \`
        -auth NavUserPassword \`
        -memoryLimit "${config.memoryLimit || "8G"}" \`
        -accept_outdated \`
        -updateHosts

      Write-Output "Container ${config.name} created successfully"
    `;

    const result = await this.executePowerShell(setupScript);

    if (result.exitCode !== 0) {
      throw new Error(`Failed to create BC container: ${result.output}`);
    }

    console.log(
      colors.green(`[BC Container] Container ${config.name} setup complete`),
    );
  }

  async start(containerName: string): Promise<void> {
    console.log(
      colors.cyan(`[BC Container] Starting container: ${containerName}`),
    );

    const script = `
      Import-Module bccontainerhelper
      Start-BcContainer -containerName "${containerName}"
      Write-Output "Container ${containerName} started"
    `;

    const result = await this.executePowerShell(script);

    if (result.exitCode !== 0) {
      throw new Error(`Failed to start container: ${result.output}`);
    }

    console.log(
      colors.green(`[BC Container] Container ${containerName} started`),
    );
  }

  async stop(containerName: string): Promise<void> {
    console.log(
      colors.cyan(`[BC Container] Stopping container: ${containerName}`),
    );

    const script = `
      Import-Module bccontainerhelper
      Stop-BcContainer -containerName "${containerName}"
      Write-Output "Container ${containerName} stopped"
    `;

    const result = await this.executePowerShell(script);

    if (result.exitCode !== 0) {
      throw new Error(`Failed to stop container: ${result.output}`);
    }

    console.log(
      colors.green(`[BC Container] Container ${containerName} stopped`),
    );
  }

  async remove(containerName: string): Promise<void> {
    console.log(
      colors.cyan(`[BC Container] Removing container: ${containerName}`),
    );

    const script = `
      Import-Module bccontainerhelper
      Remove-BcContainer -containerName "${containerName}"
      Write-Output "Container ${containerName} removed"
    `;

    const result = await this.executePowerShell(script);

    if (result.exitCode !== 0) {
      throw new Error(`Failed to remove container: ${result.output}`);
    }

    console.log(
      colors.green(`[BC Container] Container ${containerName} removed`),
    );
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

    const lines = result.output.split("\n");
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
      if (inStatus && line.includes(":")) {
        const colonIndex = line.indexOf(":");
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

  /**
   * Get or create a compiler folder for the container (cached for performance)
   */
  private async getOrCreateCompilerFolder(
    containerName: string,
  ): Promise<string> {
    // Check cache first
    const cached = this.compilerFolderCache.get(containerName);
    if (cached) {
      // Verify it still exists
      try {
        await Deno.stat(cached);
        return cached;
      } catch {
        // Cache entry invalid, will recreate
        this.compilerFolderCache.delete(containerName);
      }
    }

    console.log(
      colors.cyan(
        `[BC Container] Creating compiler folder for ${containerName}...`,
      ),
    );

    const script = `
      Import-Module bccontainerhelper -WarningAction SilentlyContinue
      $artifactUrl = Get-BcContainerArtifactUrl -containerName "${containerName}"
      Write-Output "ARTIFACT_URL:$artifactUrl"
      $compilerFolder = New-BcCompilerFolder -artifactUrl $artifactUrl
      Write-Output "COMPILER_FOLDER:$compilerFolder"
    `;

    const result = await this.executePowerShell(script);

    const compilerFolderMatch = result.output.match(/COMPILER_FOLDER:(.+)/);
    if (!compilerFolderMatch || !compilerFolderMatch[1]) {
      throw new Error(`Failed to create compiler folder: ${result.output}`);
    }

    const compilerFolder = compilerFolderMatch[1].trim();
    this.compilerFolderCache.set(containerName, compilerFolder);

    console.log(
      colors.green(`[BC Container] Compiler folder ready: ${compilerFolder}`),
    );
    return compilerFolder;
  }

  async compileProject(
    containerName: string,
    project: ALProject,
  ): Promise<CompilationResult> {
    console.log(
      colors.cyan(
        `[BC Container] Compiling AL project for container: ${containerName}`,
      ),
    );

    const startTime = Date.now();

    // Escape paths for PowerShell
    const projectPath = project.path.replace(/\\/g, "\\\\");
    const outputDir = `${project.path}\\output`.replace(/\\/g, "\\\\");

    try {
      // Get or create compiler folder (cached)
      const compilerFolder = await this.getOrCreateCompilerFolder(
        containerName,
      );
      const escapedCompilerFolder = compilerFolder.replace(/\\/g, "\\\\");

      // Create output directory
      await Deno.mkdir(`${project.path}\\output`, { recursive: true });

      // Compile on HOST using the compiler folder
      const script = `
        Import-Module bccontainerhelper -WarningAction SilentlyContinue

        try {
          $result = Compile-AppWithBcCompilerFolder \`
            -compilerFolder "${escapedCompilerFolder}" \`
            -appProjectFolder "${projectPath}" \`
            -appOutputFolder "${outputDir}" \`
            -ErrorAction Stop 2>&1

          # Check for compiled app file
          $appFile = Get-ChildItem -Path "${outputDir}" -Filter "*.app" -ErrorAction SilentlyContinue | Select-Object -First 1
          if ($appFile) {
            Write-Output "COMPILE_SUCCESS"
            Write-Output "APP_FILE:$($appFile.FullName)"
          } else {
            Write-Output "COMPILE_ERROR"
            Write-Output "ERROR:No .app file was generated"
          }
        } catch {
          Write-Output "COMPILE_ERROR"
          Write-Output "ERROR:$($_.Exception.Message)"
          # Output the full error for parsing
          $_ | Out-String | ForEach-Object { Write-Output "DETAIL:$_" }
        }
      `;

      const result = await this.executePowerShell(script);
      const duration = Date.now() - startTime;

      // Parse compilation results
      const errors: CompilationError[] = [];
      const warnings: CompilationWarning[] = [];
      let artifactPath: string | undefined;

      const lines = result.output.split("\n");

      for (const line of lines) {
        const trimmedLine = line.trim();

        // Check for app file path
        if (trimmedLine.startsWith("APP_FILE:")) {
          artifactPath = trimmedLine.substring(9).trim();
          continue;
        }

        // Parse AL error format: filename(line,col): error AL####: message
        const errorMatch = trimmedLine.match(
          /([^(]+)\((\d+),(\d+)\):\s*error\s+(AL\d+):\s*(.+)/,
        );
        if (errorMatch) {
          errors.push({
            file: errorMatch[1]?.trim() || "unknown",
            line: parseInt(errorMatch[2] || "0"),
            column: parseInt(errorMatch[3] || "0"),
            code: errorMatch[4] || "AL0000",
            message: errorMatch[5] || trimmedLine,
            severity: "error",
          });
          continue;
        }

        // Parse AL warning format
        const warningMatch = trimmedLine.match(
          /([^(]+)\((\d+),(\d+)\):\s*warning\s+(AL\d+):\s*(.+)/,
        );
        if (warningMatch) {
          warnings.push({
            file: warningMatch[1]?.trim() || "unknown",
            line: parseInt(warningMatch[2] || "0"),
            column: parseInt(warningMatch[3] || "0"),
            code: warningMatch[4] || "AL0000",
            message: warningMatch[5] || trimmedLine,
            severity: "warning",
          });
          continue;
        }

        // Generic error detection
        if (
          trimmedLine.startsWith("ERROR:") || trimmedLine.includes(": error ")
        ) {
          const message = trimmedLine.startsWith("ERROR:")
            ? trimmedLine.substring(6)
            : trimmedLine;
          errors.push({
            file: "unknown",
            line: 0,
            column: 0,
            code: "AL0000",
            message: message.trim(),
            severity: "error",
          });
        }
      }

      const success = errors.length === 0 &&
        result.output.includes("COMPILE_SUCCESS");

      console.log(
        (success ? colors.green : colors.red)(
          `[BC Container] Compilation ${
            success ? "succeeded" : "failed"
          }: ${errors.length} errors, ${warnings.length} warnings`,
        ),
      );

      return {
        success,
        errors,
        warnings,
        output: result.output,
        duration,
        ...(artifactPath && { artifactPath }),
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);

      return {
        success: false,
        errors: [{
          file: "unknown",
          line: 0,
          column: 0,
          code: "SYSTEM",
          message: errorMessage,
          severity: "error",
        }],
        warnings: [],
        output: errorMessage,
        duration,
      };
    }
  }

  async runTests(
    containerName: string,
    project: ALProject,
  ): Promise<TestResult> {
    console.log(
      colors.cyan(
        `[BC Container] Running tests in container: ${containerName}`,
      ),
    );

    const startTime = Date.now();
    const credentials = this.getCredentials(containerName);

    // Find the compiled app file
    const outputDir = `${project.path}\\output`;
    let appFilePath: string | undefined;

    try {
      for await (const entry of Deno.readDir(outputDir)) {
        if (entry.isFile && entry.name.endsWith(".app")) {
          appFilePath = `${outputDir}\\${entry.name}`;
          break;
        }
      }
    } catch {
      // Output directory doesn't exist or is empty
    }

    if (!appFilePath) {
      console.log(
        colors.yellow(
          `[BC Container] No compiled app found, compiling first...`,
        ),
      );
      const compileResult = await this.compileProject(containerName, project);
      if (!compileResult.success) {
        return {
          success: false,
          totalTests: 0,
          passedTests: 0,
          failedTests: 0,
          results: [],
          duration: Date.now() - startTime,
          output: `Compilation failed: ${compileResult.output}`,
        };
      }
      appFilePath = compileResult.artifactPath;
    }

    if (!appFilePath) {
      return {
        success: false,
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        results: [],
        duration: Date.now() - startTime,
        output: "No compiled app file available for testing",
      };
    }

    const escapedAppFile = appFilePath.replace(/\\/g, "\\\\");

    // Publish app and run tests
    const script = `
      Import-Module bccontainerhelper -WarningAction SilentlyContinue

      $password = ConvertTo-SecureString "${credentials.password}" -AsPlainText -Force
      $credential = New-Object PSCredential("${credentials.username}", $password)


      # PRE-PUBLISH CLEANUP: Remove any existing CentralGauge apps to prevent duplicate conflicts
      # This is critical because multiple apps with same name/publisher/version but different AppIds
      # will cause "Multiple published extensions match" errors during sync/install
      Write-Output "PRECLEAN_START"
      try {
        Invoke-ScriptInBcContainer -containerName "${containerName}" -scriptblock {
          $apps = Get-NAVAppInfo -ServerInstance BC | Where-Object { $_.Publisher -eq "CentralGauge" }
          if ($apps) {
            Write-Host "Found $($apps.Count) existing CentralGauge app(s) to clean up"
            foreach ($app in $apps) {
              $appId = $app.AppId.ToString()
              $version = $app.Version.ToString()
              Write-Host "  Removing: $($app.Name) (AppId=$appId)"
              try {
                # Uninstall first (may already be uninstalled)
                Uninstall-NAVApp -ServerInstance BC -Name $app.Name -Publisher $app.Publisher -Version $version -Force -ErrorAction SilentlyContinue
              } catch {}
              try {
                # Unpublish using AppId for precise removal when duplicates exist
                Unpublish-NAVApp -ServerInstance BC -AppId $appId -Version $version -ErrorAction SilentlyContinue
              } catch {}
            }
          }
        }
        Write-Output "PRECLEAN_SUCCESS"
      } catch {
        Write-Output "PRECLEAN_WARNING:$($_.Exception.Message)"
        # Continue anyway - cleanup failure shouldn't block the test
      }

      # Publish the app (will sync and install)
      try {
        Write-Output "PUBLISH_START"
        Publish-BcContainerApp -containerName "${containerName}" -appFile "${escapedAppFile}" -skipVerification -sync -install -ErrorAction Stop
        Write-Output "PUBLISH_SUCCESS"
      } catch {
        Write-Output "PUBLISH_FAILED:$($_.Exception.Message)"
        exit 1
      }

      # Run tests - get test codeunit IDs from the app
      Write-Output "TEST_START"
      try {
        $results = Run-TestsInBcContainer -containerName "${containerName}" -credential $credential -detailed -returnTrueIfAllPassed -ErrorAction Stop 2>&1

        if ($results -eq $true) {
          Write-Output "ALL_TESTS_PASSED"
        } elseif ($results -eq $false) {
          Write-Output "SOME_TESTS_FAILED"
        } else {
          # Detailed results
          foreach ($line in $results) {
            Write-Output "TESTRESULT:$line"
          }
        }
      } catch {
        Write-Output "TEST_ERROR:$($_.Exception.Message)"
      }
      Write-Output "TEST_END"


      # POST-TEST CLEANUP: Uninstall and unpublish the test app using AppId for precision
      try {
        Invoke-ScriptInBcContainer -containerName "${containerName}" -scriptblock {
          $apps = Get-NAVAppInfo -ServerInstance BC | Where-Object { $_.Publisher -eq "CentralGauge" }
          if ($apps) {
            foreach ($app in $apps) {
              $appId = $app.AppId.ToString()
              $version = $app.Version.ToString()
              Write-Host "CLEANUP:Removing app $($app.Name) (AppId=$appId)"
              try {
                Uninstall-NAVApp -ServerInstance BC -Name $app.Name -Publisher $app.Publisher -Version $version -Force -ErrorAction SilentlyContinue
              } catch {}
              try {
                Unpublish-NAVApp -ServerInstance BC -AppId $appId -Version $version -ErrorAction SilentlyContinue
              } catch {}
            }
          }
        }
      } catch {
        Write-Output "CLEANUP_WARNING:$($_.Exception.Message)"
      }
    `;

    const result = await this.executePowerShell(script);
    const duration = Date.now() - startTime;

    // Parse test results
    const results: TestCaseResult[] = [];
    let allPassed = false;
    let publishFailed = false;

    const lines = result.output.split("\n");
    let inTest = false;

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (trimmedLine === "TEST_START") {
        inTest = true;
        continue;
      }
      if (trimmedLine === "TEST_END") {
        inTest = false;
        continue;
      }

      if (trimmedLine.startsWith("PUBLISH_FAILED:")) {
        publishFailed = true;
        continue;
      }

      if (trimmedLine === "ALL_TESTS_PASSED") {
        allPassed = true;
        continue;
      }

      if (inTest && trimmedLine.startsWith("TESTRESULT:")) {
        const testInfo = trimmedLine.substring(11);
        // Parse various AL test result formats
        const passMatch = testInfo.match(
          /(?:Test\s+)?(\w+).*?(?:passed|success)/i,
        );
        const failMatch = testInfo.match(
          /(?:Test\s+)?(\w+).*?(?:failed|error)(?:.*?:\s*(.+))?/i,
        );

        if (passMatch) {
          results.push({
            name: passMatch[1] || "unknown",
            passed: true,
            duration: 0,
          });
        } else if (failMatch) {
          results.push({
            name: failMatch[1] || "unknown",
            passed: false,
            duration: 0,
            error: failMatch[2] || "Test failed",
          });
        }
      }
    }

    // If we got ALL_TESTS_PASSED but no individual results, mark as 1 passed test
    if (allPassed && results.length === 0) {
      results.push({
        name: "AllTests",
        passed: true,
        duration: 0,
      });
    }

    const totalTests = results.length || (allPassed ? 1 : 0);
    const passedTests = results.filter((r) => r.passed).length ||
      (allPassed ? 1 : 0);
    const failedTests = totalTests - passedTests;
    // Require at least one test to have run for success (zero tests = failure)
    const success = !publishFailed && totalTests > 0 &&
      (allPassed || failedTests === 0);

    console.log(
      (success ? colors.green : colors.red)(
        `[BC Container] Tests ${
          success ? "passed" : "failed"
        }: ${passedTests}/${totalTests} passed`,
      ),
    );

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

  async copyToContainer(
    containerName: string,
    localPath: string,
    containerPath: string,
  ): Promise<void> {
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

  async copyFromContainer(
    containerName: string,
    containerPath: string,
    localPath: string,
  ): Promise<void> {
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

  async executeCommand(
    containerName: string,
    command: string,
  ): Promise<{ output: string; exitCode: number }> {
    const script = `
      Import-Module bccontainerhelper
      $result = Invoke-ScriptInBcContainer -containerName "${containerName}" -scriptblock { ${command} }
      Write-Output $result
    `;

    return await this.executePowerShell(script);
  }

  async isHealthy(containerName: string): Promise<boolean> {
    try {
      const script = `
        Import-Module bccontainerhelper -WarningAction SilentlyContinue
        $result = Test-BcContainer -containerName "${containerName}"
        Write-Output "HEALTHY:$result"
      `;
      const result = await this.executePowerShell(script);
      return result.output.includes("HEALTHY:True");
    } catch {
      return false;
    }
  }
}
