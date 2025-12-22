#!/usr/bin/env -S deno run --allow-all
/**
 * AL Tools MCP Server
 *
 * Provides AL compilation and testing tools for Claude Code agents
 * via the Model Context Protocol (MCP).
 *
 * Tools:
 * - al_compile: Compile AL code in a BC container
 * - al_test: Run AL tests in a BC container
 * - al_container_status: Check container health
 */

import { basename, join } from "@std/path";
import { ensureDir } from "@std/fs";
import { BcContainerProvider } from "../src/container/bc-container-provider.ts";
import type { ALProject } from "../src/container/types.ts";

// =============================================================================
// MCP Protocol Types
// =============================================================================

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// =============================================================================
// Server State
// =============================================================================

const containerProvider = new BcContainerProvider();
const DEFAULT_CONTAINER = "Cronus27";

// =============================================================================
// Tool Definitions
// =============================================================================

const TOOLS: Tool[] = [
  {
    name: "al_compile",
    description:
      "Compile AL code in a Business Central container. Returns compilation result with errors/warnings. " +
      "The projectDir must contain app.json and .al source files.",
    inputSchema: {
      type: "object",
      properties: {
        projectDir: {
          type: "string",
          description:
            "Directory containing AL files and app.json. Must be an absolute path.",
        },
        containerName: {
          type: "string",
          description:
            `Name of the BC container to use. Default: ${DEFAULT_CONTAINER}`,
        },
      },
      required: ["projectDir"],
    },
  },
  {
    name: "al_test",
    description:
      "Run AL tests in a Business Central container. Compiles and runs tests from the project directory.",
    inputSchema: {
      type: "object",
      properties: {
        projectDir: {
          type: "string",
          description:
            "Directory containing AL test files and app.json. Must be an absolute path.",
        },
        containerName: {
          type: "string",
          description:
            `Name of the BC container to use. Default: ${DEFAULT_CONTAINER}`,
        },
      },
      required: ["projectDir"],
    },
  },
  {
    name: "al_container_status",
    description: "Check the status of a Business Central container.",
    inputSchema: {
      type: "object",
      properties: {
        containerName: {
          type: "string",
          description:
            `Name of the BC container to check. Default: ${DEFAULT_CONTAINER}`,
        },
      },
    },
  },
  {
    name: "al_verify",
    description:
      "Internal tool for test verification. Copies agent code to isolated directory, " +
      "adds test file, compiles with Test Toolkit dependencies, and runs tests.",
    inputSchema: {
      type: "object",
      properties: {
        projectDir: {
          type: "string",
          description:
            "Agent's compiled project directory containing AL files and app.json.",
        },
        testFile: {
          type: "string",
          description:
            "Absolute path to the test file to copy into the project.",
        },
        containerName: {
          type: "string",
          description:
            `Name of the BC container to use. Default: ${DEFAULT_CONTAINER}`,
        },
      },
      required: ["projectDir", "testFile"],
    },
  },
];

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Build ALProject from a directory path
 * @param includeTestFiles - Whether to include test files (default: true)
 */
async function buildALProject(
  projectDir: string,
  includeTestFiles = true,
): Promise<ALProject> {
  const appJsonPath = join(projectDir, "app.json");
  const appJsonContent = await Deno.readTextFile(appJsonPath);
  const appJson = JSON.parse(appJsonContent);

  // Find all .al files in the directory
  const sourceFiles: string[] = [];
  const testFiles: string[] = [];

  for await (const entry of Deno.readDir(projectDir)) {
    if (entry.isFile && entry.name.endsWith(".al")) {
      const filePath = join(projectDir, entry.name);
      // Test files typically have "Test" in the name
      const isTestFile = entry.name.toLowerCase().includes("test") ||
        entry.name.toLowerCase().includes(".test.");

      if (isTestFile) {
        if (includeTestFiles) {
          testFiles.push(filePath);
        }
        // Skip test files from sourceFiles to avoid compilation errors
        // (test files require Test Toolkit dependencies)
      } else {
        sourceFiles.push(filePath);
      }
    }
  }

  return {
    path: projectDir,
    appJson,
    sourceFiles,
    testFiles,
  };
}

// =============================================================================
// App.json Helpers for Test Verification
// =============================================================================

interface AppJson {
  dependencies?: Array<
    { id: string; name: string; publisher: string; version: string }
  >;
  idRanges?: Array<{ from: number; to: number }>;
  [key: string]: unknown;
}

/** Test Toolkit dependencies required for running AL tests */
const TEST_TOOLKIT_DEPS = [
  {
    id: "dd0be2ea-f733-4d65-bb34-a28f4624fb14",
    name: "Library Assert",
    publisher: "Microsoft",
    version: "27.0.0.0",
  },
  {
    id: "e7320ebb-08b3-4406-b1ec-b4927d3e280b",
    name: "Any",
    publisher: "Microsoft",
    version: "27.0.0.0",
  },
  {
    id: "5d86850b-0d76-4eca-bd7b-951ad998e997",
    name: "Tests-TestLibraries",
    publisher: "Microsoft",
    version: "27.0.0.0",
  },
];

/**
 * Add Test Toolkit dependencies to app.json if not already present.
 */
function ensureTestDependencies(appJson: AppJson): void {
  if (!appJson.dependencies) {
    appJson.dependencies = [];
  }

  for (const dep of TEST_TOOLKIT_DEPS) {
    const exists = appJson.dependencies.some((d) => d.id === dep.id);
    if (!exists) {
      appJson.dependencies.push(dep);
    }
  }
}

/**
 * Extend idRanges to include test codeunit range (80000-89999) if not present.
 */
function ensureTestCodeunitRange(appJson: AppJson): void {
  if (!appJson.idRanges) {
    appJson.idRanges = [];
  }
  const hasTestRange = appJson.idRanges.some(
    (r) => r.from <= 80001 && r.to >= 80001,
  );
  if (!hasTestRange) {
    appJson.idRanges.push({ from: 80000, to: 89999 });
  }
}

/**
 * Prepare app.json for test verification by adding dependencies and ID ranges.
 */
async function prepareAppJsonForTesting(
  sourceDir: string,
  targetDir: string,
): Promise<{ success: true } | { success: false; message: string }> {
  const appJsonPath = join(sourceDir, "app.json");
  try {
    const appJsonContent = await Deno.readTextFile(appJsonPath);
    const appJson = JSON.parse(appJsonContent) as AppJson;

    ensureTestDependencies(appJson);
    ensureTestCodeunitRange(appJson);

    await Deno.writeTextFile(
      join(targetDir, "app.json"),
      JSON.stringify(appJson, null, 2),
    );
    return { success: true };
  } catch {
    return { success: false, message: `No app.json found in ${sourceDir}` };
  }
}

/**
 * Copy all .al files from source to target directory (excluding test files).
 */
async function copyAlFilesToDir(
  sourceDir: string,
  targetDir: string,
): Promise<void> {
  for await (const entry of Deno.readDir(sourceDir)) {
    if (entry.isFile && entry.name.endsWith(".al")) {
      const content = await Deno.readTextFile(join(sourceDir, entry.name));
      await Deno.writeTextFile(join(targetDir, entry.name), content);
    }
  }
}

/**
 * Copy test file to target directory.
 */
async function copyTestFile(
  testFilePath: string,
  targetDir: string,
): Promise<{ success: true } | { success: false; message: string }> {
  try {
    const testContent = await Deno.readTextFile(testFilePath);
    const testFileName = basename(testFilePath);
    await Deno.writeTextFile(join(targetDir, testFileName), testContent);
    return { success: true };
  } catch {
    return { success: false, message: `Test file not found: ${testFilePath}` };
  }
}

// =============================================================================
// Tool Handlers
// =============================================================================

async function handleAlCompile(params: {
  projectDir: string;
  containerName?: string;
}): Promise<{
  success: boolean;
  message: string;
  errors?: string[];
  warnings?: string[];
  artifactPath?: string;
}> {
  const containerName = params.containerName || DEFAULT_CONTAINER;

  try {
    // Check if projectDir has app.json
    const appJsonPath = join(params.projectDir, "app.json");
    try {
      await Deno.stat(appJsonPath);
    } catch {
      return {
        success: false,
        message:
          `No app.json found in ${params.projectDir}. Create an app.json manifest first.`,
      };
    }

    // Build ALProject (exclude test files from compilation)
    // Test files require Test Toolkit dependencies that the app may not have
    const project = await buildALProject(params.projectDir, false);

    // Compile
    const result = await containerProvider.compileProject(
      containerName,
      project,
    );

    if (result.success) {
      const response: {
        success: boolean;
        message: string;
        errors?: string[];
        warnings?: string[];
        artifactPath?: string;
      } = {
        success: true,
        message: `Compilation successful! Duration: ${result.duration}ms`,
        warnings: result.warnings.map(
          (w) => `${w.file}(${w.line},${w.column}): ${w.code} - ${w.message}`,
        ),
      };
      if (result.artifactPath) {
        response.artifactPath = result.artifactPath;
      }
      return response;
    } else {
      return {
        success: false,
        message: "Compilation failed with errors",
        errors: result.errors.map(
          (e) => `${e.file}(${e.line},${e.column}): ${e.code} - ${e.message}`,
        ),
        warnings: result.warnings.map(
          (w) => `${w.file}(${w.line},${w.column}): ${w.code} - ${w.message}`,
        ),
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Compilation error: ${errorMessage}`,
    };
  }
}

async function handleAlTest(params: {
  projectDir: string;
  containerName?: string;
}): Promise<{
  success: boolean;
  message: string;
  totalTests?: number;
  passed?: number;
  failed?: number;
  failures?: string[];
}> {
  const containerName = params.containerName || DEFAULT_CONTAINER;

  try {
    // Check if projectDir has app.json
    const appJsonPath = join(params.projectDir, "app.json");
    try {
      await Deno.stat(appJsonPath);
    } catch {
      return {
        success: false,
        message:
          `No app.json found in ${params.projectDir}. Create an app.json manifest first.`,
      };
    }

    // Build ALProject
    const project = await buildALProject(params.projectDir);

    // Run tests
    const result = await containerProvider.runTests(containerName, project);

    if (result.success) {
      return {
        success: true,
        message:
          `All tests passed! (${result.passedTests}/${result.totalTests})`,
        totalTests: result.totalTests,
        passed: result.passedTests,
        failed: result.failedTests,
      };
    } else {
      const failures = result.results
        .filter((r) => !r.passed)
        .map((r) => `${r.name}: ${r.error || "Failed"}`);

      return {
        success: false,
        message:
          `Tests failed: ${result.failedTests} of ${result.totalTests} tests failed`,
        totalTests: result.totalTests,
        passed: result.passedTests,
        failed: result.failedTests,
        failures,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Test execution error: ${errorMessage}`,
    };
  }
}

async function handleContainerStatus(params: {
  containerName?: string;
}): Promise<{ status: string; healthy: boolean; message: string }> {
  const containerName = params.containerName || DEFAULT_CONTAINER;

  try {
    const status = await containerProvider.status(containerName);
    const healthy = status.health === "healthy";
    return {
      status: status.health,
      healthy,
      message: healthy
        ? `Container ${containerName} is running and healthy`
        : `Container ${containerName} is ${status.health} (running: ${status.isRunning})`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      status: "error",
      healthy: false,
      message: `Failed to get container status: ${errorMessage}`,
    };
  }
}

interface VerifyResult {
  success: boolean;
  message: string;
  totalTests?: number;
  passed?: number;
  failed?: number;
  failures?: string[];
  compileErrors?: string[];
}

/**
 * Verify agent code by running tests in an isolated directory.
 * This prevents the agent from seeing or modifying test files.
 */
async function handleAlVerify(params: {
  projectDir: string;
  testFile: string;
  containerName?: string;
}): Promise<VerifyResult> {
  const containerName = params.containerName || DEFAULT_CONTAINER;

  try {
    // Create isolated verification directory
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    const verifyDir = join(
      params.projectDir,
      "..",
      `verify-${timestamp}-${random}`,
    );
    await ensureDir(verifyDir);

    // Prepare app.json with test dependencies
    const appJsonResult = await prepareAppJsonForTesting(
      params.projectDir,
      verifyDir,
    );
    if (!appJsonResult.success) {
      return { success: false, message: appJsonResult.message };
    }

    // Copy source files and test file
    await copyAlFilesToDir(params.projectDir, verifyDir);
    const testFileResult = await copyTestFile(params.testFile, verifyDir);
    if (!testFileResult.success) {
      return { success: false, message: testFileResult.message };
    }

    // Build and compile
    const project = await buildALProject(verifyDir, true);
    const compileResult = await containerProvider.compileProject(
      containerName,
      project,
    );
    if (!compileResult.success) {
      return {
        success: false,
        message: "Verification compilation failed",
        compileErrors: compileResult.errors.map(
          (e) => `${e.file}(${e.line},${e.column}): ${e.code} - ${e.message}`,
        ),
      };
    }

    // Run tests and return result
    const testResult = await containerProvider.runTests(containerName, project);
    if (testResult.success) {
      return {
        success: true,
        message:
          `All tests passed! (${testResult.passedTests}/${testResult.totalTests})`,
        totalTests: testResult.totalTests,
        passed: testResult.passedTests,
        failed: testResult.failedTests,
      };
    }

    return {
      success: false,
      message:
        `Tests failed: ${testResult.failedTests} of ${testResult.totalTests} tests failed`,
      totalTests: testResult.totalTests,
      passed: testResult.passedTests,
      failed: testResult.failedTests,
      failures: testResult.results
        .filter((r) => !r.passed)
        .map((r) => `${r.name}: ${r.error || "Failed"}`),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, message: `Verification error: ${errorMessage}` };
  }
}

// =============================================================================
// MCP Protocol Helpers
// =============================================================================

function buildErrorResponse(
  id: string | number,
  code: number,
  message: string,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function wrapToolResult(id: string | number, result: unknown): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    result: {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    },
  };
}

/** Map of tool names to their handlers */
const TOOL_HANDLERS: Record<
  string,
  (args: Record<string, unknown>) => Promise<unknown>
> = {
  al_compile: (args) =>
    handleAlCompile(args as { projectDir: string; containerName?: string }),
  al_test: (args) =>
    handleAlTest(args as { projectDir: string; containerName?: string }),
  al_container_status: (args) =>
    handleContainerStatus(args as { containerName?: string }),
  al_verify: (args) =>
    handleAlVerify(
      args as { projectDir: string; testFile: string; containerName?: string },
    ),
};

async function dispatchToolCall(
  id: string | number,
  params: unknown,
): Promise<JsonRpcResponse> {
  const { name: toolName, arguments: toolArgs } = params as {
    name: string;
    arguments: Record<string, unknown>;
  };

  const handler = TOOL_HANDLERS[toolName];
  if (!handler) {
    return buildErrorResponse(id, -32601, `Unknown tool: ${toolName}`);
  }

  const result = await handler(toolArgs);
  return wrapToolResult(id, result);
}

// =============================================================================
// MCP Protocol Handler
// =============================================================================

async function handleRequest(
  request: JsonRpcRequest,
): Promise<JsonRpcResponse | null> {
  const { id, method, params } = request;

  try {
    switch (method) {
      case "initialize":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "al-tools-server", version: "1.0.0" },
          },
        };

      case "notifications/initialized":
        return null;

      case "tools/list":
        return { jsonrpc: "2.0", id, result: { tools: TOOLS } };

      case "tools/call":
        return await dispatchToolCall(id, params);

      default:
        return buildErrorResponse(id, -32601, `Method not found: ${method}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return buildErrorResponse(id, -32603, `Internal error: ${errorMessage}`);
  }
}

// =============================================================================
// Main Entry Point - stdio transport
// =============================================================================

async function main() {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  let buffer = "";

  // Read from stdin
  for await (const chunk of Deno.stdin.readable) {
    buffer += decoder.decode(chunk);

    // Process complete messages (newline-delimited JSON)
    let newlineIndex;
    while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);

      if (!line) continue;

      try {
        const request = JSON.parse(line) as JsonRpcRequest;
        const response = await handleRequest(request);

        // Only write response if not null (notifications don't get responses)
        if (response !== null) {
          const responseJson = JSON.stringify(response) + "\n";
          await Deno.stdout.write(encoder.encode(responseJson));
        }
      } catch (error) {
        // Parse error
        const errorResponse: JsonRpcResponse = {
          jsonrpc: "2.0",
          id: 0,
          error: {
            code: -32700,
            message: `Parse error: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        };
        await Deno.stdout.write(
          encoder.encode(JSON.stringify(errorResponse) + "\n"),
        );
      }
    }
  }
}

// Run if executed directly
if (import.meta.main) {
  main();
}
