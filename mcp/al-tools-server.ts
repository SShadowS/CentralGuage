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

import { basename, dirname, fromFileUrl, join } from "@std/path";
import { ensureDir } from "@std/fs";
import { parse as parseYaml } from "@std/yaml";

/** Get the CentralGauge project root from the script location */
function getProjectRoot(): string {
  const scriptPath = fromFileUrl(import.meta.url);
  // Script is at mcp/al-tools-server.ts, so project root is one level up
  return dirname(dirname(scriptPath));
}
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

/** Log timing for performance analysis - writes to both stderr and a log file */
function logTiming(label: string, startTime: number): void {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const message = `[TIMING] ${label}: ${elapsed}s`;
  console.error(message);
  // Also append to timing log file for visibility
  try {
    Deno.writeTextFileSync("timing.log", message + "\n", { append: true });
  } catch {
    // Ignore file write errors
  }
}

/**
 * Cache for compiled prereq apps to avoid recompiling on every al_verify_task call.
 * Key: taskId, Value: array of compiled prereq app paths
 */
const prereqCache = new Map<
  string,
  Array<{
    path: string;
    appJson: AppJson;
    compiledAppPath: string;
  }>
>();

/**
 * Cache for published prereq apps to avoid republishing on every al_verify_task call.
 * Key: "containerName:appId", Value: true (published)
 * Prereqs never change during a run, so once published they stay published.
 */
const publishedPrereqCache = new Set<string>();

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
        target: {
          type: "string",
          enum: ["Cloud", "OnPrem"],
          description:
            "App target. Use 'OnPrem' for features like HttpClient, NavApp. Default: Cloud.",
        },
      },
      required: ["projectDir", "testFile"],
    },
  },
  {
    name: "al_verify_task",
    description: "Compile AL code and run tests for a benchmark task. " +
      "Looks up the test file by task ID, so the agent cannot read or modify tests. " +
      "Returns test results with pass/fail status and error messages.",
    inputSchema: {
      type: "object",
      properties: {
        projectDir: {
          type: "string",
          description:
            "Directory containing AL files and app.json. Must be an absolute path.",
        },
        taskId: {
          type: "string",
          description: "Task ID (e.g., 'CG-AL-E007') to look up the test file.",
        },
        containerName: {
          type: "string",
          description:
            `Name of the BC container to use. Default: ${DEFAULT_CONTAINER}`,
        },
        target: {
          type: "string",
          enum: ["Cloud", "OnPrem"],
          description:
            "App target. Use 'OnPrem' for features like HttpClient, NavApp. Default: Cloud.",
        },
      },
      required: ["projectDir", "taskId"],
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
 * Extract task ID from a test file path.
 * e.g., "tests/al/easy/CG-AL-E002.Test.al" -> "CG-AL-E002"
 */
function extractTaskIdFromTestPath(testFilePath: string): string | null {
  const fileName = basename(testFilePath);
  const match = fileName.match(/^(CG-AL-[A-Z]\d+)/);
  return match?.[1] ?? null;
}

/**
 * Extract project root from a test file path.
 * Looks for the "tests/al/" marker in the path and returns the parent.
 */
function extractProjectRoot(testFilePath: string): string {
  const normalized = testFilePath.replace(/\\/g, "/");
  const testsAlIndex = normalized.indexOf("tests/al/");
  if (testsAlIndex > 0) {
    return normalized.substring(0, testsAlIndex);
  }
  return Deno.cwd();
}

/**
 * Find prereq app directory for a given task ID.
 * Checks for tests/al/dependencies/{task-id}/ directory.
 */
async function findPrereqApp(
  taskId: string,
  projectRoot: string,
): Promise<{ path: string; appJson: AppJson } | null> {
  // Resolve path relative to project root
  const prereqDir = join(
    projectRoot,
    "tests",
    "al",
    "dependencies",
    taskId,
  );

  try {
    const stat = await Deno.stat(prereqDir);
    if (!stat.isDirectory) return null;

    // Check for app.json
    const appJsonPath = join(prereqDir, "app.json");
    const appJsonContent = await Deno.readTextFile(appJsonPath);
    const appJson = JSON.parse(appJsonContent) as AppJson;

    return { path: prereqDir, appJson };
  } catch {
    return null;
  }
}

/**
 * Find prereq app by its app ID (used for resolving dependencies).
 */
async function findPrereqAppById(
  appId: string,
  projectRoot: string,
): Promise<{ path: string; appJson: AppJson } | null> {
  const depsDir = join(projectRoot, "tests", "al", "dependencies");

  try {
    for await (const entry of Deno.readDir(depsDir)) {
      if (!entry.isDirectory) continue;

      const appJsonPath = join(depsDir, entry.name, "app.json");
      try {
        const content = await Deno.readTextFile(appJsonPath);
        const appJson = JSON.parse(content) as AppJson;
        if (appJson["id"] === appId) {
          return { path: join(depsDir, entry.name), appJson };
        }
      } catch {
        continue;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Find all prereq apps needed for a task, in dependency order.
 * Returns array with dependencies first, then the main prereq.
 */
async function findAllPrereqApps(
  taskId: string,
  projectRoot: string,
): Promise<Array<{ path: string; appJson: AppJson }>> {
  const result: Array<{ path: string; appJson: AppJson }> = [];
  const visited = new Set<string>();

  async function collectDeps(
    prereq: { path: string; appJson: AppJson },
  ): Promise<void> {
    const appId = prereq.appJson["id"] as string;
    if (visited.has(appId)) return;
    visited.add(appId);

    // First, process dependencies
    const deps = prereq.appJson.dependencies || [];
    for (const dep of deps) {
      // Check if this dependency is one of our prereq apps
      const depPrereq = await findPrereqAppById(dep.id, projectRoot);
      if (depPrereq) {
        await collectDeps(depPrereq);
      }
    }

    // Then add this prereq
    result.push(prereq);
  }

  const mainPrereq = await findPrereqApp(taskId, projectRoot);
  if (mainPrereq) {
    await collectDeps(mainPrereq);
  }

  return result;
}

/**
 * Add prereq app as dependency to app.json.
 */
function ensurePrereqDependency(
  appJson: AppJson,
  prereqAppJson: AppJson,
): void {
  if (!appJson.dependencies) {
    appJson.dependencies = [];
  }

  const prereqId = prereqAppJson["id"] as string;
  const exists = appJson.dependencies.some((d) => d.id === prereqId);
  if (!exists) {
    appJson.dependencies.push({
      id: prereqId,
      name: prereqAppJson["name"] as string,
      publisher: prereqAppJson["publisher"] as string,
      version: prereqAppJson["version"] as string,
    });
  }
}

/**
 * Prepare app.json for test verification by adding dependencies and ID ranges.
 */
// Fixed UUID for benchmark apps - enables ForceSync to update in place
// This eliminates the need for PRECLEAN step (~13s savings per test run)
const BENCHMARK_APP_ID = "00000000-cafe-0000-0000-be4c00decade";

async function prepareAppJsonForTesting(
  sourceDir: string,
  targetDir: string,
  prereqAppJson?: AppJson,
  appTarget?: "Cloud" | "OnPrem",
): Promise<{ success: true } | { success: false; message: string }> {
  const appJsonPath = join(sourceDir, "app.json");
  try {
    const appJsonContent = await Deno.readTextFile(appJsonPath);
    const appJson = JSON.parse(appJsonContent) as AppJson;

    // Force fixed app ID for ForceSync optimization
    appJson["id"] = BENCHMARK_APP_ID;

    // Add prereq dependency if provided
    if (prereqAppJson) {
      ensurePrereqDependency(appJson, prereqAppJson);
    }

    // Set target if provided (OnPrem required for HttpClient, NavApp, etc.)
    if (appTarget) {
      appJson["target"] = appTarget;
    }

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
 * Load testCodeunitId from task YAML for targeted test execution.
 * Returns undefined if task YAML not found or doesn't have testCodeunitId.
 */
async function loadTestCodeunitId(
  taskId: string,
  projectRoot: string,
): Promise<number | undefined> {
  // Parse difficulty from task ID (e.g., CG-AL-E007 -> E -> easy)
  const match = taskId.match(/^CG-AL-([EMH])\d+$/);
  if (!match) return undefined;

  const difficultyCode = match[1] as "E" | "M" | "H";
  const difficultyMap: Record<"E" | "M" | "H", string> = {
    E: "easy",
    M: "medium",
    H: "hard",
  };
  const difficulty = difficultyMap[difficultyCode];

  // Find task YAML file (pattern: tasks/{difficulty}/CG-AL-{ID}-*.yml)
  const tasksDir = join(projectRoot, "tasks", difficulty);
  try {
    for await (const entry of Deno.readDir(tasksDir)) {
      if (
        entry.isFile && entry.name.startsWith(taskId) &&
        entry.name.endsWith(".yml")
      ) {
        const yamlPath = join(tasksDir, entry.name);
        const content = await Deno.readTextFile(yamlPath);
        const manifest = parseYaml(content) as {
          expected?: { testCodeunitId?: number };
        };
        return manifest.expected?.testCodeunitId;
      }
    }
  } catch {
    // Directory doesn't exist or read error
  }
  return undefined;
}

/**
 * Load target from task YAML metadata for OnPrem features.
 * Returns undefined if task YAML not found or doesn't have metadata.target.
 */
async function loadTaskTarget(
  taskId: string,
  projectRoot: string,
): Promise<"Cloud" | "OnPrem" | undefined> {
  // Parse difficulty from task ID (e.g., CG-AL-M022 -> M -> medium)
  const match = taskId.match(/^CG-AL-([EMH])\d+$/);
  if (!match) return undefined;

  const difficultyCode = match[1] as "E" | "M" | "H";
  const difficultyMap: Record<"E" | "M" | "H", string> = {
    E: "easy",
    M: "medium",
    H: "hard",
  };
  const difficulty = difficultyMap[difficultyCode];

  // Find task YAML file (pattern: tasks/{difficulty}/CG-AL-{ID}-*.yml)
  const tasksDir = join(projectRoot, "tasks", difficulty);
  try {
    for await (const entry of Deno.readDir(tasksDir)) {
      if (
        entry.isFile && entry.name.startsWith(taskId) &&
        entry.name.endsWith(".yml")
      ) {
        const yamlPath = join(tasksDir, entry.name);
        const content = await Deno.readTextFile(yamlPath);
        const manifest = parseYaml(content) as {
          metadata?: { target?: "Cloud" | "OnPrem" };
        };
        return manifest.metadata?.target;
      }
    }
  } catch {
    // Directory doesn't exist or read error
  }
  return undefined;
}

/**
 * Resolve test file path from task ID.
 * Maps task ID prefixes to difficulty folders:
 * - E = easy (e.g., CG-AL-E007 -> tests/al/easy/CG-AL-E007.Test.al)
 * - M = medium
 * - H = hard
 */
async function resolveTestFileFromTaskId(
  taskId: string,
  projectRoot: string,
): Promise<
  { success: true; testFile: string } | { success: false; error: string }
> {
  // Parse the difficulty from task ID (e.g., CG-AL-E007 -> E -> easy)
  const match = taskId.match(/^CG-AL-([EMH])\d+$/);
  if (!match) {
    return {
      success: false,
      error:
        `Invalid task ID format: ${taskId}. Expected format like 'CG-AL-E007'`,
    };
  }

  const difficultyCode = match[1] as "E" | "M" | "H";
  const difficultyMap: Record<"E" | "M" | "H", string> = {
    E: "easy",
    M: "medium",
    H: "hard",
  };
  const difficulty = difficultyMap[difficultyCode];

  // Build the test file path
  const testFilePath = join(
    projectRoot,
    "tests",
    "al",
    difficulty,
    `${taskId}.Test.al`,
  );

  // Check if the file exists
  try {
    const stat = await Deno.stat(testFilePath);
    if (stat.isFile) {
      return { success: true, testFile: testFilePath };
    }
    return {
      success: false,
      error: `Test file is not a regular file: ${testFilePath}`,
    };
  } catch {
    return { success: false, error: `Test file not found: ${testFilePath}` };
  }
}

/**
 * Handle al_verify_task - compile and run tests using task ID to look up test file.
 * This prevents the agent from seeing or reading the test file directly.
 */
async function handleAlVerifyTask(params: {
  projectDir: string;
  taskId: string;
  containerName?: string;
  target?: "Cloud" | "OnPrem";
}): Promise<VerifyResult> {
  // Resolve the test file from the task ID
  // Use script location to find project root, not CWD (which may be agent workspace)
  const projectRoot = getProjectRoot();
  const resolution = await resolveTestFileFromTaskId(
    params.taskId,
    projectRoot,
  );

  if (!resolution.success) {
    return { success: false, message: resolution.error };
  }

  // Load testCodeunitId from task YAML for targeted test execution
  const testCodeunitId = await loadTestCodeunitId(params.taskId, projectRoot);

  // Load target from task YAML if not explicitly provided
  const target = params.target ??
    await loadTaskTarget(params.taskId, projectRoot);

  // Delegate to handleAlVerify with the resolved test file path
  const verifyParams: {
    projectDir: string;
    testFile: string;
    containerName?: string;
    target?: "Cloud" | "OnPrem";
    testCodeunitId?: number;
  } = {
    projectDir: params.projectDir,
    testFile: resolution.testFile,
  };
  if (params.containerName !== undefined) {
    verifyParams.containerName = params.containerName;
  }
  if (target !== undefined) {
    verifyParams.target = target;
  }
  if (testCodeunitId !== undefined) {
    verifyParams.testCodeunitId = testCodeunitId;
  }
  return handleAlVerify(verifyParams);
}

/**
 * Verify agent code by running tests in an isolated directory.
 * This prevents the agent from seeing or modifying test files.
 */
async function handleAlVerify(params: {
  projectDir: string;
  testFile: string;
  containerName?: string;
  target?: "Cloud" | "OnPrem";
  testCodeunitId?: number;
}): Promise<VerifyResult> {
  const containerName = params.containerName || DEFAULT_CONTAINER;
  const totalStart = Date.now();

  try {
    // 1. Check for prereq apps based on task ID (handles dependency chains)
    const prereqStart = Date.now();
    const taskId = extractTaskIdFromTestPath(params.testFile);
    const projectRoot = extractProjectRoot(params.testFile);
    let prereqApps: Array<{
      path: string;
      appJson: AppJson;
      compiledAppPath: string;
    }> = [];

    if (taskId) {
      // Check cache first to avoid recompiling prereqs on every call
      const cachedPrereqs = prereqCache.get(taskId);
      if (cachedPrereqs) {
        console.error(`[DEBUG] Using cached prereqs for ${taskId}`);
        prereqApps = cachedPrereqs;
      } else {
        // Find all prereqs in dependency order
        const allPrereqs = await findAllPrereqApps(taskId, projectRoot);
        console.error(
          `[DEBUG] Found ${allPrereqs.length} prereq(s) for ${taskId} in ${projectRoot}`,
        );

        for (const prereq of allPrereqs) {
          // Compile each prereq in order
          const prereqProject = await buildALProject(prereq.path, false);
          const prereqCompileResult = await containerProvider.compileProject(
            containerName,
            prereqProject,
          );
          if (!prereqCompileResult.success) {
            return {
              success: false,
              message: `Prereq app compilation failed for ${
                prereq.appJson["name"]
              }`,
              compileErrors: prereqCompileResult.errors.map(
                (e) =>
                  `${e.file}(${e.line},${e.column}): ${e.code} - ${e.message}`,
              ),
            };
          }
          if (prereqCompileResult.artifactPath) {
            prereqApps.push({
              path: prereq.path,
              appJson: prereq.appJson,
              compiledAppPath: prereqCompileResult.artifactPath,
            });
          }
        }

        // Cache the compiled prereqs for future calls
        if (prereqApps.length > 0) {
          prereqCache.set(taskId, prereqApps);
          console.error(
            `[DEBUG] Cached ${prereqApps.length} prereq(s) for ${taskId}`,
          );
        }
      }
    }
    logTiming("Prereq resolution", prereqStart);

    // 2. Create isolated verification directory and copy files
    const setupStart = Date.now();
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    const verifyDir = join(
      params.projectDir,
      "..",
      `verify-${timestamp}-${random}`,
    );
    await ensureDir(verifyDir);

    // Prepare app.json with test dependencies (and prereq dependencies if exist)
    // Only add the last prereq as direct dependency - it will chain to others
    const lastPrereq = prereqApps[prereqApps.length - 1];
    const mainPrereqAppJson = lastPrereq?.appJson;
    const appJsonResult = await prepareAppJsonForTesting(
      params.projectDir,
      verifyDir,
      mainPrereqAppJson,
      params.target,
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
    logTiming("Setup & copy files", setupStart);

    // 3. Build and compile
    const compileStart = Date.now();
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
    logTiming("Compile project", compileStart);

    // 4. Publish prereq apps in order before running tests (only if not already published)
    const publishStart = Date.now();
    for (const prereqApp of prereqApps) {
      if (prereqApp.compiledAppPath) {
        const appId = prereqApp.appJson["id"] as string;
        const cacheKey = `${containerName}:${appId}`;
        if (!publishedPrereqCache.has(cacheKey)) {
          console.error(
            `[DEBUG] Publishing prereq ${appId} to ${containerName}`,
          );
          await containerProvider.publishApp(
            containerName,
            prereqApp.compiledAppPath,
          );
          publishedPrereqCache.add(cacheKey);
        } else {
          console.error(`[DEBUG] Prereq ${appId} already published, skipping`);
        }
      }
    }
    logTiming("Publish prereqs", publishStart);

    // 5. Run tests
    const testStart = Date.now();
    const testResult = await containerProvider.runTests(
      containerName,
      project,
      compileResult.artifactPath,
      params.testCodeunitId,
    );
    logTiming("Run tests", testStart);
    logTiming("TOTAL", totalStart);

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
      args as {
        projectDir: string;
        testFile: string;
        containerName?: string;
        target?: "Cloud" | "OnPrem";
      },
    ),
  al_verify_task: (args) =>
    handleAlVerifyTask(
      args as {
        projectDir: string;
        taskId: string;
        containerName?: string;
        target?: "Cloud" | "OnPrem";
      },
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

// Export for testing
export { loadTaskTarget, loadTestCodeunitId };
