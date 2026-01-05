/**
 * Real Business Central Container Provider using bccontainerhelper PowerShell module
 * This provider integrates with Windows bccontainerhelper for real AL compilation and testing
 */

import type { ContainerProvider } from "./interface.ts";
import type {
  ALProject,
  CompilationResult,
  ContainerConfig,
  ContainerCredentials,
  ContainerStatus,
  TestResult,
} from "./types.ts";
import * as colors from "@std/fmt/colors";
import { ensureDir } from "@std/fs";
import {
  calculateTestMetrics,
  extractArtifactPath,
  extractCompilerFolder,
  isCompilationSuccessful,
  isContainerNotFound,
  isModuleMissing,
  mapHealthStatus,
  parseCompilationErrors,
  parseCompilationWarnings,
  parseStatusOutput,
  parseTestResults,
} from "./bc-output-parsers.ts";

/**
 * Parse timing markers from PowerShell output and log sub-timings.
 * Markers format: "PHASE_START:timestamp" and "PHASE_END:timestamp"
 * Note: PRECLEAN removed - fixed app ID with ForceSync handles updates in place
 */
function logSubTimings(output: string): void {
  const lines = output.split("\n");
  const timestamps: Record<string, number> = {};

  for (const line of lines) {
    const match = line.match(/^(PUBLISH|TEST)_(START|END):(\d+)/);
    if (match && match[1] && match[2] && match[3]) {
      const phase = match[1];
      const type = match[2];
      const ts = match[3];
      timestamps[`${phase}_${type}`] = parseInt(ts, 10);
    }
  }

  // Calculate and log durations
  const phases = ["PUBLISH", "TEST"];
  for (const phase of phases) {
    const start = timestamps[`${phase}_START`];
    const end = timestamps[`${phase}_END`];
    if (start && end) {
      const duration = ((end - start) / 1000).toFixed(1);
      console.log(colors.gray(`  [SubTiming] ${phase}: ${duration}s`));
    }
  }
}

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
   * Get credentials for a container (falls back to config defaults)
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

    if (isModuleMissing(checkModule.output)) {
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

      # Check if container exists using Get-BcContainers (plural)
      $containers = Get-BcContainers
      if ($containers -contains "${containerName}") {
        # Get container info via docker inspect
        $inspectJson = docker inspect "${containerName}" 2>$null | ConvertFrom-Json
        if ($inspectJson) {
          $state = $inspectJson.State
          $isRunning = $state.Running
          $health = if ($state.Health) { $state.Health.Status } else { if ($isRunning) { "running" } else { "stopped" } }
          $uptime = if ($isRunning -and $state.StartedAt) {
            $startTime = [DateTime]::Parse($state.StartedAt)
            [int]((Get-Date) - $startTime).TotalSeconds
          } else { 0 }
          # Try to get BC version from container labels
          $bcVersion = $inspectJson.Config.Labels.'nav.version'

          Write-Output "STATUS_START"
          Write-Output "NAME:${containerName}"
          Write-Output "RUNNING:$isRunning"
          Write-Output "HEALTH:$health"
          if ($bcVersion) { Write-Output "BCVERSION:$bcVersion" }
          Write-Output "UPTIME:$uptime"
          Write-Output "STATUS_END"
        } else {
          Write-Output "CONTAINER_NOT_FOUND"
        }
      } else {
        Write-Output "CONTAINER_NOT_FOUND"
      }
    `;

    const result = await this.executePowerShell(script);

    if (isContainerNotFound(result.output)) {
      throw new Error(`Container ${containerName} not found`);
    }

    const statusData = parseStatusOutput(result.output);
    const healthRaw = statusData["HEALTH"] || "stopped";
    const health = mapHealthStatus(healthRaw);
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
      $compilerFolder = New-BcCompilerFolder -artifactUrl $artifactUrl -includeTestToolkit
      Write-Output "COMPILER_FOLDER:$compilerFolder"
    `;

    const result = await this.executePowerShell(script);

    const compilerFolder = extractCompilerFolder(result.output);
    if (!compilerFolder) {
      throw new Error(`Failed to create compiler folder: ${result.output}`);
    }

    this.compilerFolderCache.set(containerName, compilerFolder);

    console.log(
      colors.green(`[BC Container] Compiler folder ready: ${compilerFolder}`),
    );
    return compilerFolder;
  }

  /**
   * Build the PowerShell script for compiling an AL project
   */
  private buildCompileScript(
    compilerFolder: string,
    projectPath: string,
    outputDir: string,
  ): string {
    return `
      Import-Module bccontainerhelper -WarningAction SilentlyContinue

      try {
        $result = Compile-AppWithBcCompilerFolder \`
          -compilerFolder "${compilerFolder}" \`
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
  }

  /**
   * Build a compilation result from PowerShell output
   */
  private buildCompilationResult(
    output: string,
    duration: number,
  ): CompilationResult {
    const errors = parseCompilationErrors(output);
    const warnings = parseCompilationWarnings(output);
    const artifactPath = extractArtifactPath(output);
    const success = isCompilationSuccessful(output, errors.length);

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
      output,
      duration,
      ...(artifactPath && { artifactPath }),
    };
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
    const projectPath = project.path.replace(/\\/g, "\\\\");

    try {
      const compilerFolder = await this.getOrCreateCompilerFolder(
        containerName,
      );
      const escapedCompilerFolder = compilerFolder.replace(/\\/g, "\\\\");

      // Output to a subfolder of the compiler folder (which IS shared with container)
      // Use a unique folder per project based on project name
      const appJson = project.appJson as { name?: string };
      const projectName = (appJson.name || "app").replace(
        /[^a-zA-Z0-9-_]/g,
        "_",
      );
      const outputDir = `${compilerFolder}\\output\\${projectName}`.replace(
        /\\/g,
        "\\\\",
      );
      await Deno.mkdir(`${compilerFolder}\\output\\${projectName}`, {
        recursive: true,
      });

      const script = this.buildCompileScript(
        escapedCompilerFolder,
        projectPath,
        outputDir,
      );
      const result = await this.executePowerShell(script);

      return this.buildCompilationResult(result.output, Date.now() - startTime);
    } catch (error) {
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
        duration: Date.now() - startTime,
      };
    }
  }

  async publishApp(
    containerName: string,
    appPath: string,
  ): Promise<void> {
    console.log(
      colors.cyan(
        `[BC Container] Publishing app to container: ${containerName}`,
      ),
    );

    // Copy the app to the shared "my" folder which is mounted in the container
    const appFileName = appPath.split(/[/\\]/).pop()!;
    const uuid = crypto.randomUUID().slice(0, 8);
    const sharedFolder =
      `C:\\ProgramData\\BcContainerHelper\\Extensions\\${containerName}\\my`;
    const sharedAppPath = `${sharedFolder}\\${uuid}_${appFileName}`;

    await Deno.mkdir(sharedFolder, { recursive: true });
    await Deno.copyFile(appPath, sharedAppPath);

    // Use the host path - bccontainerhelper will translate it to container path internally
    const escapedHostPath = sharedAppPath.replace(/\\/g, "\\\\");

    // Parse app name/publisher/version from filename pattern: Publisher_Name_Version.app
    const fileNameParts = appFileName.replace(".app", "").split("_");
    const publisher = fileNameParts[0] || "";
    const appName = fileNameParts.slice(1, -1).join("_") || "";
    const version = fileNameParts[fileNameParts.length - 1] || "";

    const script = `
      Import-Module bccontainerhelper -WarningAction SilentlyContinue

      # Check if exact same version is already published - skip if so
      $existingApp = Get-BcContainerAppInfo -containerName "${containerName}" | Where-Object { $_.Name -eq "${appName}" -and $_.Publisher -eq "${publisher}" -and $_.Version -eq "${version}" }
      if ($existingApp) {
        Write-Host "App already published with same version, skipping: $($existingApp.Name) v${version}"
        Write-Host "PUBLISH_SUCCESS"
        exit 0
      }

      # Unpublish any existing different version first
      $oldApp = Get-BcContainerAppInfo -containerName "${containerName}" | Where-Object { $_.Name -eq "${appName}" -and $_.Publisher -eq "${publisher}" }
      if ($oldApp) {
        Write-Host "Unpublishing existing app: $($oldApp.Name) v$($oldApp.Version)"
        Unpublish-BcContainerApp -containerName "${containerName}" -appName $oldApp.Name -publisher $oldApp.Publisher -version $oldApp.Version -uninstall -ErrorAction SilentlyContinue
      }

      # Publish the new app using the host path (bccontainerhelper translates it)
      Publish-BcContainerApp -containerName "${containerName}" -appFile "${escapedHostPath}" -skipVerification -sync -syncMode ForceSync -install -ErrorAction Stop
      Write-Host "PUBLISH_SUCCESS"
    `;

    const result = await this.executePowerShell(script);

    // Cleanup the copied file
    try {
      await Deno.remove(sharedAppPath);
    } catch {
      // Ignore cleanup errors
    }

    if (!result.output.includes("PUBLISH_SUCCESS")) {
      throw new Error(`Publish failed: ${result.output}`);
    }

    console.log(
      colors.green(`[BC Container] App published successfully`),
    );
  }

  async runTests(
    containerName: string,
    project: ALProject,
    appFilePath?: string,
    testCodeunitId?: number,
  ): Promise<TestResult> {
    console.log(
      colors.cyan(
        `[BC Container] Running tests in container: ${containerName}`,
      ),
    );

    const startTime = Date.now();
    const credentials = this.getCredentials(containerName);

    // Use provided app file path or search for one
    let actualAppFilePath = appFilePath;
    if (!actualAppFilePath) {
      const appFileResult = await this.ensureCompiledApp(
        containerName,
        project,
        startTime,
      );
      if (!appFileResult.success) {
        return appFileResult.failureResult!;
      }
      actualAppFilePath = appFileResult.appFilePath!;
    }

    // Extract extensionId from app.json for test filtering
    const appJson = project.appJson as { id?: string };
    const extensionId = appJson.id || "";

    // Copy main app to shared folder accessible by container
    const appFileName = actualAppFilePath.split(/[/\\]/).pop()!;
    const uuid = crypto.randomUUID().slice(0, 8);
    const sharedFolder =
      `C:\\ProgramData\\BcContainerHelper\\Extensions\\${containerName}\\my`;
    await ensureDir(sharedFolder);
    const sharedAppPath = `${sharedFolder}\\${uuid}_${appFileName}`;
    await Deno.copyFile(actualAppFilePath, sharedAppPath);

    // Build and execute the test script (prereqs already published)
    const script = this.buildTestScript(
      containerName,
      credentials,
      sharedAppPath,
      extensionId,
      testCodeunitId,
    );
    const result = await this.executePowerShell(script);
    const duration = Date.now() - startTime;

    // Log sub-timings from PowerShell markers
    logSubTimings(result.output);

    // Debug: Check for marker presence
    const hasPublishStart = result.output.includes("PUBLISH_START:");
    const hasPublishEnd = result.output.includes("PUBLISH_END:");
    const hasTestStart = result.output.includes("TEST_START:");
    const hasTestEnd = result.output.includes("TEST_END:");
    console.log(colors.gray(
      `[Debug] Markers: PUBLISH_START=${hasPublishStart}, PUBLISH_END=${hasPublishEnd}, ` +
        `TEST_START=${hasTestStart}, TEST_END=${hasTestEnd}`,
    ));

    // Cleanup copied file
    try {
      await Deno.remove(sharedAppPath);
    } catch {
      // Ignore cleanup errors
    }

    // Parse and return results
    const { results, allPassed, publishFailed } = parseTestResults(
      result.output,
    );
    const { totalTests, passedTests, failedTests, success } =
      calculateTestMetrics(results, allPassed, publishFailed);

    this.logTestResult(success, passedTests, totalTests);

    // Debug: Log raw output when no tests are found (helps diagnose parsing issues)
    if (totalTests === 0) {
      console.log(colors.yellow("[Debug] No tests detected. Raw output:"));
      console.log(colors.gray("--- BEGIN TEST OUTPUT ---"));
      console.log(result.output);
      console.log(colors.gray("--- END TEST OUTPUT ---"));
    }

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

  /** Ensure we have a compiled app file, compiling if necessary */
  private async ensureCompiledApp(
    containerName: string,
    project: ALProject,
    startTime: number,
  ): Promise<{
    success: boolean;
    appFilePath?: string;
    failureResult?: TestResult;
  }> {
    // Try to find existing compiled app
    let appFilePath = await this.findCompiledAppFile(project);

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
          failureResult: this.createFailedTestResult(
            startTime,
            `Compilation failed: ${compileResult.output}`,
          ),
        };
      }
      appFilePath = compileResult.artifactPath;
    }

    if (!appFilePath) {
      return {
        success: false,
        failureResult: this.createFailedTestResult(
          startTime,
          "No compiled app file available for testing",
        ),
      };
    }

    return { success: true, appFilePath };
  }

  /** Find the first .app file in the project output directory */
  private async findCompiledAppFile(
    project: ALProject,
  ): Promise<string | undefined> {
    const outputDir = `${project.path}\\output`;
    try {
      for await (const entry of Deno.readDir(outputDir)) {
        if (entry.isFile && entry.name.endsWith(".app")) {
          return `${outputDir}\\${entry.name}`;
        }
      }
    } catch {
      // Output directory doesn't exist or is empty
    }
    return undefined;
  }

  /** Create a failed test result */
  private createFailedTestResult(
    startTime: number,
    output: string,
  ): TestResult {
    return {
      success: false,
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      results: [],
      duration: Date.now() - startTime,
      output,
    };
  }

  /** Log the test result */
  private logTestResult(
    success: boolean,
    passedTests: number,
    totalTests: number,
  ): void {
    console.log(
      (success ? colors.green : colors.red)(
        `[BC Container] Tests ${
          success ? "passed" : "failed"
        }: ${passedTests}/${totalTests} passed`,
      ),
    );
  }

  /** Build the PowerShell script for publishing and running tests */
  private buildTestScript(
    containerName: string,
    credentials: ContainerCredentials,
    appFilePath: string,
    extensionId: string,
    testCodeunitId?: number,
  ): string {
    const escapedAppFile = appFilePath.replace(/\\/g, "\\\\");

    // Prereqs are already published by publishApp() - just publish main app and run tests
    // Note: PRECLEAN removed - fixed app ID with ForceSync handles updates in place (~13s savings)
    return `
      Import-Module bccontainerhelper -WarningAction SilentlyContinue

      $password = ConvertTo-SecureString "${credentials.password}" -AsPlainText -Force
      $credential = New-Object PSCredential("${credentials.username}", $password)

      ${this.buildPublishScript(containerName, escapedAppFile)}
      ${this.buildRunTestsScript(containerName, extensionId, testCodeunitId)}
    `;
  }

  /** Build the publish app script block */
  private buildPublishScript(
    containerName: string,
    escapedAppFile: string,
  ): string {
    return `
      # Unpublish existing apps that might conflict, EXCEPT prereqs (which we depend on)
      # Prereq apps have "Prereq" in their name by convention
      # Clean up:
      # 1. CentralGauge apps (from our benchmarks)
      # 2. Apps with common default publishers that agents might use
      # 3. Apps with task-related names like "Task App"
      $publishersToClean = @("CentralGauge", "Default Publisher", "Default", "")
      $conflictApps = @(Get-BcContainerAppInfo -containerName "${containerName}" | Where-Object {
        ($publishersToClean -contains $_.Publisher -or $_.Name -like "*Task*") -and
        $_.Name -notlike "*Prereq*" -and
        $_.Publisher -ne "Microsoft"
      })
      foreach ($app in $conflictApps) {
        try {
          Write-Output "CLEANUP:Removing $($app.Name) by $($app.Publisher)"
          Unpublish-BcContainerApp -containerName "${containerName}" -appName $app.Name -publisher $app.Publisher -version $app.Version -unInstall -ErrorAction SilentlyContinue
        } catch { }
      }

      # Publish the app with ForceSync for destructive schema changes
      try {
        Write-Output "PUBLISH_START:$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
        Publish-BcContainerApp -containerName "${containerName}" -appFile "${escapedAppFile}" -skipVerification -sync -syncMode ForceSync -install -ErrorAction Stop
        Write-Output "PUBLISH_END:$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
      } catch {
        Write-Output "PUBLISH_END:$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
        Write-Output "PUBLISH_FAILED:$($_.Exception.Message)"
        exit 1
      }
    `;
  }

  /** Build the run tests script block */
  private buildRunTestsScript(
    containerName: string,
    extensionId: string,
    testCodeunitId?: number,
  ): string {
    // Build extensionId parameter if provided
    const extensionIdParam = extensionId ? `-extensionId "${extensionId}"` : "";
    // Use specific codeunit ID if provided, otherwise scan all with "*"
    const codeunitFilter = testCodeunitId ? testCodeunitId.toString() : "*";

    return `
      # Run tests
      Write-Output "TEST_START:$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
      try {
        # Use -detailed for verbose output
        # The *>&1 captures all streams (including Write-Host) and outputs them
        $results = Run-TestsInBcContainer -containerName "${containerName}" -credential $credential ${extensionIdParam} -testCodeunit "${codeunitFilter}" -detailed -ErrorAction Stop *>&1

        # Output each line and count test results for accurate pass/fail detection
        $passedCount = 0
        $failedCount = 0
        foreach ($line in $results) {
          $lineStr = "$line"
          Write-Output $lineStr
          # Match test result lines: "Testfunction <name> Success/Failure"
          # Use capture group to determine pass/fail status
          if ($lineStr -match "Testfunction\s+\S+\s+(Success|Failure)") {
            if ($Matches[1] -eq "Success") {
              $passedCount++
            } else {
              $failedCount++
            }
          }
        }

        if ($failedCount -eq 0 -and $passedCount -gt 0) {
          Write-Output "ALL_TESTS_PASSED"
        } elseif ($failedCount -gt 0) {
          Write-Output "SOME_TESTS_FAILED"
        }
      } catch {
        Write-Output "TEST_ERROR:$($_.Exception.Message)"
      }
      Write-Output "TEST_END:$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
    `;
  }

  /** Build the post-test cleanup script block */
  // @ts-ignore: Kept for potential future use - currently disabled for performance
  private buildPostCleanupScript(containerName: string): string {
    return `
      # POST-TEST CLEANUP: Uninstall and unpublish the test app
      try {
        Invoke-ScriptInBcContainer -containerName "${containerName}" -scriptblock {
          $apps = Get-NAVAppInfo -ServerInstance BC | Where-Object { $_.Publisher -eq "CentralGauge" }
          if ($apps) {
            foreach ($app in $apps) {
              $version = $app.Version.ToString()
              Write-Host "CLEANUP:Removing app $($app.Name) (Publisher=$($app.Publisher))"
              try { Uninstall-NAVApp -ServerInstance BC -Name $app.Name -Publisher $app.Publisher -Version $version -Force -ErrorAction SilentlyContinue } catch {}
              try { Unpublish-NAVApp -ServerInstance BC -Name $app.Name -Publisher $app.Publisher -Version $version -ErrorAction SilentlyContinue } catch {}
            }
          }
        }
      } catch {
        Write-Output "CLEANUP_WARNING:$($_.Exception.Message)"
      }
    `;
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

  /**
   * Clean up compiler folders to free disk space.
   * Removes all cached compiler folders from this session.
   */
  async cleanupCompilerFolders(): Promise<void> {
    if (this.compilerFolderCache.size === 0) {
      return;
    }

    console.log(
      colors.cyan(
        `[BC Container] Cleaning up ${this.compilerFolderCache.size} compiler folder(s)...`,
      ),
    );

    for (const [containerName, folderPath] of this.compilerFolderCache) {
      try {
        await Deno.remove(folderPath, { recursive: true });
        console.log(
          colors.green(`[BC Container] Removed compiler folder: ${folderPath}`),
        );
      } catch (error) {
        console.log(
          colors.yellow(
            `[BC Container] Failed to remove compiler folder ${folderPath}: ${error}`,
          ),
        );
      }
      this.compilerFolderCache.delete(containerName);
    }
  }

  /**
   * Clean up all compiler folders in the BcContainerHelper directory.
   * Use this to reclaim disk space from previous runs.
   */
  async cleanupAllCompilerFolders(): Promise<
    { removed: number; failed: number }
  > {
    const compilerDir = "C:\\ProgramData\\BcContainerHelper\\compiler";
    let removed = 0;
    let failed = 0;

    console.log(
      colors.cyan(
        `[BC Container] Cleaning up all compiler folders in ${compilerDir}...`,
      ),
    );

    try {
      for await (const entry of Deno.readDir(compilerDir)) {
        if (entry.isDirectory) {
          const folderPath = `${compilerDir}\\${entry.name}`;
          try {
            await Deno.remove(folderPath, { recursive: true });
            removed++;
          } catch {
            failed++;
          }
        }
      }
    } catch (error) {
      console.log(
        colors.yellow(
          `[BC Container] Could not access compiler directory: ${error}`,
        ),
      );
    }

    if (removed > 0) {
      console.log(
        colors.green(`[BC Container] Removed ${removed} compiler folder(s)`),
      );
    }
    if (failed > 0) {
      console.log(
        colors.yellow(`[BC Container] Failed to remove ${failed} folder(s)`),
      );
    }

    // Clear the cache
    this.compilerFolderCache.clear();

    return { removed, failed };
  }
}
