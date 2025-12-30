import { exists } from "@std/fs";
import { join } from "@std/path";
import type { ContainerProvider } from "./interface.ts";
import type {
  ALProject,
  CompilationError,
  CompilationResult,
  CompilationWarning,
  ContainerConfig,
  ContainerStatus,
  TestResult,
} from "./types.ts";

export class MockContainerProvider implements ContainerProvider {
  readonly name = "mock";
  readonly platform = "mock" as const;

  private containers = new Map<string, ContainerStatus>();

  async setup(config: ContainerConfig): Promise<void> {
    console.log(`🔧 [Mock] Setting up container: ${config.name}`);
    await this.simulateDelay(2000);

    this.containers.set(config.name, {
      name: config.name,
      isRunning: true,
      bcVersion: config.bcVersion,
      uptime: Date.now(),
      health: "healthy",
    });

    console.log(`✅ [Mock] Container ${config.name} setup complete`);
  }

  async start(containerName: string): Promise<void> {
    console.log(`▶️  [Mock] Starting container: ${containerName}`);
    await this.simulateDelay(1000);

    const status = this.containers.get(containerName);
    if (status) {
      status.isRunning = true;
      status.health = "healthy";
    }

    console.log(`✅ [Mock] Container ${containerName} started`);
  }

  async stop(containerName: string): Promise<void> {
    console.log(`⏹️  [Mock] Stopping container: ${containerName}`);
    await this.simulateDelay(500);

    const status = this.containers.get(containerName);
    if (status) {
      status.isRunning = false;
      status.health = "stopped";
    }

    console.log(`✅ [Mock] Container ${containerName} stopped`);
  }

  async remove(containerName: string): Promise<void> {
    console.log(`🗑️  [Mock] Removing container: ${containerName}`);
    await this.simulateDelay(500);
    this.containers.delete(containerName);
    console.log(`✅ [Mock] Container ${containerName} removed`);
  }

  status(containerName: string): Promise<ContainerStatus> {
    const status = this.containers.get(containerName);
    if (!status) {
      return Promise.resolve({
        name: containerName,
        isRunning: false,
        health: "stopped",
      });
    }
    return Promise.resolve(status);
  }

  async compileProject(
    _containerName: string,
    project: ALProject,
  ): Promise<CompilationResult> {
    console.log(`🔨 [Mock] Compiling AL project: ${project.path}`);
    const startTime = Date.now();

    await this.simulateDelay(1500); // Simulate compilation time

    // Analyze AL files to simulate realistic compilation results
    const errors = await this.analyzeALFiles(project);
    const success = errors.filter((e) => e.severity === "error").length === 0;

    const result: CompilationResult = {
      success,
      errors: errors.filter((e) => e.severity === "error"),
      warnings: errors.filter((e) =>
        e.severity === "warning"
      ) as CompilationWarning[],
      output: this.generateMockOutput(success, errors),
      duration: Date.now() - startTime,
      ...(success && { artifactPath: join(project.path, "bin", "app.app") }),
    };

    console.log(
      `${success ? "✅" : "❌"} [Mock] Compilation ${
        success ? "succeeded" : "failed"
      }: ${errors.length} issues found`,
    );

    return result;
  }

  async publishApp(
    _containerName: string,
    _appPath: string,
  ): Promise<void> {
    console.log(`📦 [Mock] Publishing app`);
    await this.simulateDelay(500);
    console.log(`✅ [Mock] App published`);
  }

  async runTests(
    _containerName: string,
    project: ALProject,
    _appFilePath?: string,
    _testCodeunitId?: number,
  ): Promise<TestResult> {
    console.log(`🧪 [Mock] Running tests for project: ${project.path}`);
    const startTime = Date.now();

    await this.simulateDelay(800); // Simulate test execution time

    const testCount = project.testFiles.length * 2; // Assume 2 tests per file
    const failedTests = Math.floor(Math.random() * testCount * 0.1); // 10% failure rate
    const passedTests = testCount - failedTests;

    const result: TestResult = {
      success: failedTests === 0,
      totalTests: testCount,
      passedTests,
      failedTests,
      duration: Date.now() - startTime,
      results: this.generateMockTestResults(testCount, failedTests),
      output: `Mock test execution: ${passedTests}/${testCount} tests passed`,
    };

    console.log(
      `${result.success ? "✅" : "❌"} [Mock] Tests ${
        result.success ? "passed" : "failed"
      }: ${passedTests}/${testCount}`,
    );

    return result;
  }

  async copyToContainer(
    _containerName: string,
    localPath: string,
    containerPath: string,
  ): Promise<void> {
    console.log(
      `📤 [Mock] Copy to container: ${localPath} -> ${containerPath}`,
    );
    await this.simulateDelay(200);
  }

  async copyFromContainer(
    _containerName: string,
    containerPath: string,
    localPath: string,
  ): Promise<void> {
    console.log(
      `📥 [Mock] Copy from container: ${containerPath} -> ${localPath}`,
    );
    await this.simulateDelay(200);
  }

  async executeCommand(
    _containerName: string,
    command: string,
  ): Promise<{ output: string; exitCode: number }> {
    console.log(`💻 [Mock] Execute: ${command}`);
    await this.simulateDelay(300);

    return {
      output: `Mock execution of: ${command}`,
      exitCode: 0,
    };
  }

  async isHealthy(containerName: string): Promise<boolean> {
    const status = await this.status(containerName);
    return status.health === "healthy" && status.isRunning;
  }

  private async analyzeALFiles(
    project: ALProject,
  ): Promise<CompilationError[]> {
    const errors: CompilationError[] = [];

    for (const file of project.sourceFiles) {
      if (await exists(file)) {
        const content = await Deno.readTextFile(file);
        errors.push(...this.analyzeALContent(content, file));
      }
    }

    return errors;
  }

  private analyzeALContent(
    content: string,
    filename: string,
  ): CompilationError[] {
    const errors: CompilationError[] = [];
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const lineNumber = i + 1;

      // Simulate common AL compilation errors
      if (line.includes("Unit Cost") && !line.includes('"Unit Cost"')) {
        errors.push({
          code: "AL0432",
          message:
            "Field identifier must be enclosed in quotes when it contains spaces",
          file: filename,
          line: lineNumber,
          column: line.indexOf("Unit Cost"),
          severity: "error",
        });
      }

      if (
        line.trim().endsWith("then") &&
        !lines[i + 1]?.trim().startsWith("repeat")
      ) {
        errors.push({
          code: "AL0118",
          message: "Missing 'if' keyword before 'then'",
          file: filename,
          line: lineNumber,
          column: line.indexOf("then"),
          severity: "error",
        });
      }

      if (line.includes("exit(") && !line.includes(";")) {
        errors.push({
          code: "AL0002",
          message: "Missing semicolon",
          file: filename,
          line: lineNumber,
          column: line.length,
          severity: "error",
        });
      }

      // Check for missing Access property
      if (line.includes("codeunit") && !content.includes("Access =")) {
        errors.push({
          code: "AL0486",
          message: "Access property should be specified for public objects",
          file: filename,
          line: lineNumber,
          column: 0,
          severity: "warning",
        });
      }
    }

    return errors;
  }

  private generateMockOutput(
    success: boolean,
    errors: CompilationError[],
  ): string {
    let output = "Microsoft (R) AL Compiler version 13.0.0.0\n";
    output += "Copyright (C) Microsoft Corporation. All rights reserved.\n\n";

    if (errors.length > 0) {
      for (const error of errors) {
        output +=
          `${error.file}(${error.line},${error.column}): ${error.severity} ${error.code}: ${error.message}\n`;
      }
    }

    if (success) {
      output += "\nCompilation completed successfully.\n";
    } else {
      output += `\nCompilation failed with ${
        errors.filter((e) => e.severity === "error").length
      } error(s).\n`;
    }

    return output;
  }

  private generateMockTestResults(total: number, failed: number) {
    const results = [];
    for (let i = 0; i < total; i++) {
      const isFailed = i < failed;
      const result: {
        name: string;
        passed: boolean;
        duration: number;
        error?: string;
      } = {
        name: `Test_${i + 1}`,
        passed: !isFailed,
        duration: Math.floor(Math.random() * 500) + 100,
      };
      if (isFailed) {
        result.error = "Assertion failed: Expected value did not match";
      }
      results.push(result);
    }
    return results;
  }

  private async simulateDelay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
