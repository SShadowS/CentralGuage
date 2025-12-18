/**
 * Compile and test commands
 * @module cli/commands/compile-test
 */

import { Command } from "@cliffy/command";
import { exists } from "@std/fs";
import { ALProjectManager } from "../../src/compiler/al-project.ts";
import { ContainerProviderRegistry } from "../../src/container/registry.ts";
import { DebugLogger } from "../../src/utils/debug-logger.ts";

async function handleCompile(
  projectPath: string,
  containerName: string,
  _outputDir?: string,
): Promise<void> {
  if (!await exists(projectPath)) {
    console.error(`Error: Project path does not exist: ${projectPath}`);
    Deno.exit(1);
  }

  try {
    const project = await ALProjectManager.loadProject(projectPath);
    const provider = await ContainerProviderRegistry.getDefault();

    console.log(
      `Compiling AL project: ${ALProjectManager.getProjectInfo(project)}`,
    );

    const result = await provider.compileProject(containerName, project);

    // Log compilation result if debug is enabled
    const debugLogger = DebugLogger.getInstance();
    if (debugLogger) {
      await debugLogger.logCompilation(
        "manual",
        "n/a",
        0,
        containerName,
        result,
      );
    }

    if (result.success) {
      console.log("[OK] Compilation succeeded!");
      if (result.warnings.length > 0) {
        console.log(`[WARN] ${result.warnings.length} warning(s):`);
        for (const warning of result.warnings) {
          console.log(
            `   ${warning.file}:${warning.line} - ${warning.message}`,
          );
        }
      }
    } else {
      console.log("[FAIL] Compilation failed!");
      console.log(`   ${result.errors.length} error(s):`);
      for (const error of result.errors) {
        console.log(`   ${error.file}:${error.line} - ${error.message}`);
      }
    }

    console.log(`Duration: ${result.duration}ms`);
  } catch (error) {
    console.error(
      `Error: ${error instanceof Error ? error.message : String(error)}`,
    );
    Deno.exit(1);
  }
}

async function handleTest(
  projectPath: string,
  containerName: string,
  _outputDir?: string,
): Promise<void> {
  if (!await exists(projectPath)) {
    console.error(`Error: Project path does not exist: ${projectPath}`);
    Deno.exit(1);
  }

  try {
    const project = await ALProjectManager.loadProject(projectPath);
    const provider = await ContainerProviderRegistry.getDefault();

    console.log(
      `Running tests for: ${ALProjectManager.getProjectInfo(project)}`,
    );

    const result = await provider.runTests(containerName, project);

    // Log test result if debug is enabled
    const debugLogger = DebugLogger.getInstance();
    if (debugLogger) {
      await debugLogger.logTestResult(
        "manual",
        "n/a",
        0,
        containerName,
        result,
      );
    }

    if (result.success) {
      console.log("[OK] All tests passed!");
    } else {
      console.log("[FAIL] Some tests failed!");
    }

    console.log(
      `   Total: ${result.totalTests}, Passed: ${result.passedTests}, Failed: ${result.failedTests}`,
    );
    console.log(`Duration: ${result.duration}ms`);

    if (result.failedTests > 0) {
      console.log("\nFailed tests:");
      for (const test of result.results.filter((t) => !t.passed)) {
        console.log(`   [FAIL] ${test.name}: ${test.error}`);
      }
    }
  } catch (error) {
    console.error(
      `Error: ${error instanceof Error ? error.message : String(error)}`,
    );
    Deno.exit(1);
  }
}

export function registerCompileTestCommands(cli: Command): void {
  cli.command("compile <project-path>", "Compile AL project in container")
    .option("-c, --container <name>", "Container name", { required: true })
    .option("-o, --output <dir>", "Output directory for compilation results")
    .action(async (options, projectPath: string) => {
      await handleCompile(projectPath, options.container, options.output);
    });

  cli.command("test <project-path>", "Run AL tests in container")
    .option("-c, --container <name>", "Container name", { required: true })
    .option("-o, --output <dir>", "Output directory for test results")
    .action(async (options, projectPath: string) => {
      await handleTest(projectPath, options.container, options.output);
    });
}
