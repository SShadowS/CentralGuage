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

import { join } from "@std/path";
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
          description: `Name of the BC container to use. Default: ${DEFAULT_CONTAINER}`,
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
          description: `Name of the BC container to use. Default: ${DEFAULT_CONTAINER}`,
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
          description: `Name of the BC container to check. Default: ${DEFAULT_CONTAINER}`,
        },
      },
    },
  },
];

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Build ALProject from a directory path
 */
async function buildALProject(projectDir: string): Promise<ALProject> {
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
      if (
        entry.name.toLowerCase().includes("test") ||
        entry.name.toLowerCase().includes(".test.")
      ) {
        testFiles.push(filePath);
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
        message: `No app.json found in ${params.projectDir}. Create an app.json manifest first.`,
      };
    }

    // Build ALProject
    const project = await buildALProject(params.projectDir);

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
        message: `No app.json found in ${params.projectDir}. Create an app.json manifest first.`,
      };
    }

    // Build ALProject
    const project = await buildALProject(params.projectDir);

    // Run tests
    const result = await containerProvider.runTests(containerName, project);

    if (result.success) {
      return {
        success: true,
        message: `All tests passed! (${result.passedTests}/${result.totalTests})`,
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
        message: `Tests failed: ${result.failedTests} of ${result.totalTests} tests failed`,
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
            capabilities: {
              tools: {},
            },
            serverInfo: {
              name: "al-tools-server",
              version: "1.0.0",
            },
          },
        };

      case "notifications/initialized":
        // Client acknowledged initialization - no response needed for notifications
        return null;

      case "tools/list":
        return {
          jsonrpc: "2.0",
          id,
          result: { tools: TOOLS },
        };

      case "tools/call": {
        const callParams = params as { name: string; arguments: unknown };
        const toolName = callParams.name;
        const toolArgs = callParams.arguments as Record<string, unknown>;

        let result: unknown;
        switch (toolName) {
          case "al_compile":
            result = await handleAlCompile(
              toolArgs as { projectDir: string; containerName?: string },
            );
            break;
          case "al_test":
            result = await handleAlTest(
              toolArgs as { projectDir: string; containerName?: string },
            );
            break;
          case "al_container_status":
            result = await handleContainerStatus(
              toolArgs as { containerName?: string },
            );
            break;
          default:
            return {
              jsonrpc: "2.0",
              id,
              error: {
                code: -32601,
                message: `Unknown tool: ${toolName}`,
              },
            };
        }

        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          },
        };
      }

      default:
        return {
          jsonrpc: "2.0",
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`,
          },
        };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32603,
        message: `Internal error: ${errorMessage}`,
      },
    };
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
