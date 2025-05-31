#!/usr/bin/env -S deno run --allow-all

import { parseArgs } from "@std/cli/parse-args";
import { exists } from "@std/fs";
import { expandGlob } from "@std/fs";
import type { BenchmarkOptions } from "../types/index.ts";
import { ContainerProviderRegistry } from "../src/container/registry.ts";
import { ALProjectManager } from "../src/compiler/al-project.ts";
import { LLMAdapterRegistry } from "../src/llm/registry.ts";
import { DefaultTaskExecutor, loadTaskManifest } from "../src/tasks/executor.ts";
import type { ContainerConfig } from "../src/container/types.ts";
import type { TaskExecutionConfig } from "../src/tasks/types.ts";

const VERSION = "0.1.0";

/**
 * Parse provider and model from prefixed format: "provider/model"
 * Returns { provider, model } or falls back to pattern detection for backwards compatibility
 */
function parseProviderAndModel(modelSpec: string): { provider: string; model: string } {
  // Check for provider/model format
  if (modelSpec.includes("/")) {
    const [provider, ...modelParts] = modelSpec.split("/");
    const model = modelParts.join("/"); // Handle models with slashes like "models/gemini-pro"
    
    // Validate provider
    const validProviders = ["openai", "anthropic", "gemini", "azure-openai", "local", "mock"];
    if (validProviders.includes(provider)) {
      return { provider, model };
    } else {
      console.warn(`⚠️  Unknown provider: ${provider}, using mock adapter`);
      return { provider: "mock", model: modelSpec };
    }
  }
  
  // Backwards compatibility: detect provider from model name patterns
  console.warn(`⚠️  Using pattern detection for model: ${modelSpec}. Consider using provider/model format.`);
  
  let provider: string;
  
  // OpenAI models
  if (modelSpec.startsWith("gpt-") || modelSpec.startsWith("o1-") || modelSpec.startsWith("o3-")) {
    provider = "openai";
  }
  // Anthropic Claude models
  else if (modelSpec.startsWith("claude-")) {
    provider = "anthropic";
  }
  // Google Gemini models
  else if (modelSpec.startsWith("gemini-") || modelSpec.startsWith("models/gemini-")) {
    provider = "gemini";
  }
  // Azure OpenAI (usually with deployment name)
  else if (modelSpec.includes("azure") || process.env.AZURE_OPENAI_ENDPOINT) {
    provider = "azure-openai";
  }
  // Local models (Ollama, etc.)
  else if (modelSpec.startsWith("llama") || modelSpec.startsWith("codellama") || 
           modelSpec.startsWith("mistral") || modelSpec.startsWith("qwen") ||
           process.env.OLLAMA_HOST || process.env.LOCAL_LLM_ENDPOINT) {
    provider = "local";
  }
  // Default to mock for unknown models
  else {
    console.warn(`⚠️  Unknown model format: ${modelSpec}, using mock adapter`);
    provider = "mock";
  }
  
  return { provider, model: modelSpec };
}

function printHelp(): void {
  console.log(`
CentralGauge v${VERSION}
LLM benchmark for Microsoft Dynamics 365 Business Central AL code

USAGE:
    centralgauge <COMMAND> [OPTIONS]

COMMANDS:
    bench       Run benchmark evaluation
    report      Generate HTML report from results
    container   Manage Business Central containers
    compile     Compile AL project in container
    test        Run AL tests in container
    models      List supported models and test parsing
    help        Show this help message

EXAMPLES:
    centralgauge bench --llms openai/gpt-4o,anthropic/claude-3-5-sonnet-20241022 --tasks tasks/*.yml --attempts 2
    centralgauge bench --llms gemini/gemini-1.5-pro,local/llama3.2:latest --tasks tasks/easy/*.yml
    centralgauge bench --llms openai/o3-high,anthropic/sonnet-4-think-8k --attempts 1
    centralgauge report results/ --html --output reports/
    centralgauge container setup --name test-bc --provider mock
    centralgauge compile fixtures/al/simple-codeunit --container test-bc

MODEL SPECIFICATION FORMAT:
    Use provider/model format for explicit control:
    
    OpenAI:        openai/gpt-4o, openai/gpt-4o-mini, openai/o3-high, openai/o1-preview
    Anthropic:     anthropic/claude-3-5-sonnet-20241022, anthropic/sonnet-4-think-8k
    Google Gemini: gemini/gemini-1.5-pro, gemini/gemini-1.5-flash, gemini/gemini-1.0-pro
    Azure OpenAI:  azure-openai/my-gpt4-deployment, azure-openai/gpt-35-turbo-prod
    Local/Ollama:  local/llama3.2:latest, local/codellama:13b, local/qwen2.5-coder:latest
    Mock Testing:  mock/any-model-name
    
    Legacy format (auto-detection) is supported but deprecated.

ENVIRONMENT VARIABLES:
    OPENAI_API_KEY          - OpenAI API key
    ANTHROPIC_API_KEY       - Anthropic API key  
    GOOGLE_API_KEY          - Google Gemini API key
    AZURE_OPENAI_API_KEY    - Azure OpenAI API key
    AZURE_OPENAI_ENDPOINT   - Azure OpenAI endpoint URL
    OLLAMA_HOST             - Ollama server URL (default: http://localhost:11434)
    LOCAL_LLM_ENDPOINT      - Custom local LLM endpoint
    
For more help on a specific command, use:
    centralgauge <COMMAND> --help
`);
}

function printBenchHelp(): void {
  console.log(`
Run benchmark evaluation

USAGE:
    centralgauge bench [OPTIONS]

OPTIONS:
    --llms <MODELS>        Comma-separated list of LLM models
    --tasks <PATTERN>      Task files pattern (default: tasks/*.yml)
    --attempts <NUM>       Number of attempts per task (default: 2)
    --output <DIR>         Output directory (default: results/)
    --temperature <NUM>    LLM temperature (default: 0.1)
    --max-tokens <NUM>     Maximum tokens per request (default: 4000)
    --help                 Show this help message

EXAMPLES:
    centralgauge bench --llms openai/gpt-4o --tasks tasks/easy/*.yml
    centralgauge bench --llms openai/gpt-4o,anthropic/claude-3-5-sonnet-20241022 --attempts 1
    centralgauge bench --llms gemini/gemini-1.5-pro,local/llama3.2:latest --tasks tasks/medium/*.yml
`);
}

function printReportHelp(): void {
  console.log(`
Generate HTML report from benchmark results

USAGE:
    centralgauge report <RESULTS_DIR> [OPTIONS]

OPTIONS:
    --html                 Generate HTML report
    --output <DIR>         Output directory (default: reports/)
    --help                 Show this help message

EXAMPLES:
    centralgauge report results/ --html
    centralgauge report results/ --html --output public/
`);
}

function printContainerHelp(): void {
  console.log(`
Manage Business Central containers

USAGE:
    centralgauge container <SUBCOMMAND> [OPTIONS]

SUBCOMMANDS:
    setup       Create and setup a new container
    start       Start an existing container
    stop        Stop a running container
    remove      Remove a container
    status      Show container status
    list        List available providers

OPTIONS:
    --name <NAME>          Container name
    --provider <PROVIDER>  Container provider (mock, bccontainer)
    --bc-version <VER>     Business Central version (default: 24.0)
    --memory <SIZE>        Memory limit (default: 8G)
    --help                 Show this help message

EXAMPLES:
    centralgauge container setup --name test-bc --provider mock
    centralgauge container status --name test-bc
    centralgauge container list
`);
}

function printCompileHelp(): void {
  console.log(`
Compile AL project in container

USAGE:
    centralgauge compile <PROJECT_PATH> [OPTIONS]

OPTIONS:
    --container <NAME>     Container name (required)
    --output <DIR>         Output directory for compilation results
    --help                 Show this help message

EXAMPLES:
    centralgauge compile fixtures/al/simple-codeunit --container test-bc
    centralgauge compile /path/to/project --container my-bc --output results/
`);
}

function printTestHelp(): void {
  console.log(`
Run AL tests in container

USAGE:
    centralgauge test <PROJECT_PATH> [OPTIONS]

OPTIONS:
    --container <NAME>     Container name (required)
    --output <DIR>         Output directory for test results
    --help                 Show this help message

EXAMPLES:
    centralgauge test fixtures/al/simple-codeunit --container test-bc
    centralgauge test /path/to/project --container my-bc --output results/
`);
}

async function runBenchmark(options: BenchmarkOptions): Promise<void> {
  console.log("🚀 Starting CentralGauge benchmark...");
  console.log(`Models: ${options.llms.join(", ")}`);
  console.log(`Tasks: ${options.tasks.join(", ")}`);
  console.log(`Attempts: ${options.attempts}`);
  console.log(`Output: ${options.outputDir}`);

  try {
    // Ensure output directory exists
    await Deno.mkdir(options.outputDir, { recursive: true });
    
    // Load task manifests
    const taskManifests = [];
    for (const taskPattern of options.tasks) {
      for await (const entry of expandGlob(taskPattern)) {
        if (entry.isFile && entry.name.endsWith('.yml')) {
          console.log(`📋 Loading task: ${entry.path}`);
          const manifest = await loadTaskManifest(entry.path);
          taskManifests.push(manifest);
        }
      }
    }
    
    if (taskManifests.length === 0) {
      console.error("❌ No task manifests found matching patterns:", options.tasks);
      return;
    }
    
    console.log(`📋 Loaded ${taskManifests.length} task(s)`);
    
    // Setup container (using mock for now)
    const containerName = "centralgauge-benchmark";
    const containerProvider = ContainerProviderRegistry.create("mock");
    
    console.log("🐳 Setting up container...");
    await containerProvider.setup({
      name: containerName,
      bcVersion: "24.0",
      memoryLimit: "8G",
      acceptEula: true,
      includeAL: true,
      includeTestToolkit: true,
    });
    
    // Initialize task executor
    const executor = new DefaultTaskExecutor();
    
    // Execute benchmark for each model
    const allResults = [];
    
    for (const llmModelSpec of options.llms) {
      console.log(`\n🤖 Running benchmark with model spec: ${llmModelSpec}`);
      
      // Parse provider and model from spec
      const { provider: llmProvider, model: llmModel } = parseProviderAndModel(llmModelSpec);
      console.log(`🔧 Using provider: ${llmProvider} for model: ${llmModel}`);
      
      for (const manifest of taskManifests) {
        console.log(`\n📝 Executing task: ${manifest.id}`);
        
        const config: TaskExecutionConfig = {
          taskManifest: manifest,
          llmModel,
          llmProvider,
          containerProvider: "mock",
          containerName,
          templateDir: "templates",
          outputDir: options.outputDir,
          maxAttempts: options.attempts,
          temperature: options.temperature || 0.1,
          maxTokens: options.maxTokens || 4000,
        };
        
        try {
          const result = await executor.executeTask(config);
          allResults.push(result);
          
          console.log(`✨ Task ${manifest.id} completed: ${result.finalResult} (score: ${result.aggregateScore.toFixed(3)})`);
        } catch (error) {
          console.error(`❌ Task ${manifest.id} failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    
    // Save results
    const resultsFile = `${options.outputDir}/benchmark-results-${Date.now()}.json`;
    await Deno.writeTextFile(resultsFile, JSON.stringify(allResults, null, 2));
    
    // Print summary
    console.log(`\n📊 Benchmark Summary:`);
    console.log(`   Total tasks: ${allResults.length}`);
    console.log(`   Passed: ${allResults.filter(r => r.finalResult === "pass").length}`);
    console.log(`   Failed: ${allResults.filter(r => r.finalResult === "fail").length}`);
    console.log(`   Average score: ${(allResults.reduce((sum, r) => sum + r.aggregateScore, 0) / allResults.length).toFixed(3)}`);
    console.log(`   Results saved to: ${resultsFile}`);
    
    // Cleanup container
    await containerProvider.stop(containerName);
    await containerProvider.remove(containerName);
    
  } catch (error) {
    console.error(`❌ Benchmark failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

async function generateReport(
  resultsDir: string,
  outputDir: string,
  html: boolean,
): Promise<void> {
  console.log("📊 Generating report...");
  console.log(`Results: ${resultsDir}`);
  console.log(`Output: ${outputDir}`);
  console.log(`HTML: ${html}`);

  try {
    // Ensure output directory exists
    await Deno.mkdir(outputDir, { recursive: true });

    if (html) {
      console.log("🏗️  Building HTML report...");
      
      // Find all JSON result files in the results directory
      const jsonFiles = [];
      for await (const entry of expandGlob(`${resultsDir}/**/*.json`)) {
        if (entry.isFile && entry.name.endsWith('.json')) {
          jsonFiles.push(entry.path);
        }
      }
      
      if (jsonFiles.length === 0) {
        console.error("❌ No JSON result files found in results directory");
        return;
      }
      
      console.log(`📄 Found ${jsonFiles.length} result file(s)`);
      
      // Read and merge all result files
      const allResults = [];
      for (const jsonFile of jsonFiles) {
        try {
          const content = await Deno.readTextFile(jsonFile);
          const results = JSON.parse(content);
          if (Array.isArray(results)) {
            allResults.push(...results);
          } else {
            allResults.push(results);
          }
          console.log(`📋 Loaded results from ${jsonFile}`);
        } catch (error) {
          console.warn(`⚠️  Failed to parse ${jsonFile}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      
      // Create a data file for the SvelteKit app
      const dataFile = `reports/src/lib/data.ts`;
      const dataContent = `// Auto-generated benchmark data
export const benchmarkData = ${JSON.stringify(allResults, null, 2)};`;
      
      await Deno.writeTextFile(dataFile, dataContent);
      console.log("💾 Generated data file for HTML report");
      
      // Update the main page to load the data
      const pageFile = `reports/src/routes/+page.svelte`;
      const pageContent = await Deno.readTextFile(pageFile);
      
      // Replace the mock data loading with real data loading
      const updatedPageContent = pageContent.replace(
        '// This would typically load from uploaded files or a directory\n      // For now, we\'ll use mock data structure\n      loading = false;',
        `import { benchmarkData } from '$lib/data.js';
      loadResults(JSON.stringify(benchmarkData));
      loading = false;`
      );
      
      await Deno.writeTextFile(pageFile, updatedPageContent);
      console.log("🔄 Updated page to load benchmark data");
      
      // Build the static site
      console.log("🔨 Building static site...");
      const buildProcess = new Deno.Command("npm", {
        args: ["run", "build"],
        cwd: "reports",
        stdout: "piped",
        stderr: "piped",
      });
      
      const { code, stdout, stderr } = await buildProcess.output();
      
      if (code !== 0) {
        const errorText = new TextDecoder().decode(stderr);
        console.error("❌ Failed to build HTML report:");
        console.error(errorText);
        return;
      }
      
      // Copy built files to output directory
      console.log("📁 Copying built files to output directory...");
      
      // Remove existing output directory if it exists
      try {
        await Deno.remove(outputDir, { recursive: true });
      } catch {
        // Directory might not exist, ignore error
      }
      
      // Copy build directory to output
      const copyProcess = new Deno.Command("cp", {
        args: ["-r", "reports/build", outputDir],
        stdout: "piped",
        stderr: "piped",
      });
      
      const copyResult = await copyProcess.output();
      
      if (copyResult.code !== 0) {
        console.error("❌ Failed to copy built files");
        return;
      }
      
      // Clean up data file
      await Deno.remove(dataFile);
      
      // Restore original page file
      const originalPageContent = pageContent;
      await Deno.writeTextFile(pageFile, originalPageContent);
      
      console.log("✅ HTML report generated successfully!");
      console.log(`📂 Report available at: ${outputDir}/index.html`);
      console.log(`🌐 Open in browser: file://${Deno.cwd()}/${outputDir}/index.html`);
      
    } else {
      // Generate JSON summary report
      console.log("📄 Generating JSON summary...");
      
      // Find all JSON result files
      const jsonFiles = [];
      for await (const entry of expandGlob(`${resultsDir}/**/*.json`)) {
        if (entry.isFile && entry.name.endsWith('.json')) {
          jsonFiles.push(entry.path);
        }
      }
      
      const summary = {
        generatedAt: new Date().toISOString(),
        resultFiles: jsonFiles,
        totalFiles: jsonFiles.length,
      };
      
      await Deno.writeTextFile(`${outputDir}/summary.json`, JSON.stringify(summary, null, 2));
      console.log(`✅ Summary saved to: ${outputDir}/summary.json`);
    }
    
  } catch (error) {
    console.error(`❌ Report generation failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

async function handleContainerCommand(subcommand: string, args: any): Promise<void> {
  switch (subcommand) {
    case "setup": {
      if (!args.name || !args.provider) {
        console.error("❌ Error: --name and --provider are required for setup");
        Deno.exit(1);
      }
      
      const provider = ContainerProviderRegistry.create(args.provider);
      const config: ContainerConfig = {
        name: args.name,
        bcVersion: args["bc-version"] || "24.0",
        memoryLimit: args.memory || "8G",
        acceptEula: true,
        includeAL: true,
        includeTestToolkit: true,
      };
      
      await provider.setup(config);
      break;
    }
    
    case "start": {
      if (!args.name) {
        console.error("❌ Error: --name is required");
        Deno.exit(1);
      }
      
      const provider = ContainerProviderRegistry.create("mock");
      await provider.start(args.name);
      break;
    }
    
    case "stop": {
      if (!args.name) {
        console.error("❌ Error: --name is required");
        Deno.exit(1);
      }
      
      const provider = ContainerProviderRegistry.create("mock");
      await provider.stop(args.name);
      break;
    }
    
    case "remove": {
      if (!args.name) {
        console.error("❌ Error: --name is required");
        Deno.exit(1);
      }
      
      const provider = ContainerProviderRegistry.create("mock");
      await provider.remove(args.name);
      break;
    }
    
    case "status": {
      if (!args.name) {
        console.error("❌ Error: --name is required");
        Deno.exit(1);
      }
      
      const provider = ContainerProviderRegistry.create("mock");
      const status = await provider.status(args.name);
      
      console.log(`📋 Container Status: ${status.name}`);
      console.log(`   Running: ${status.isRunning ? "✅" : "❌"}`);
      console.log(`   Health: ${status.health}`);
      if (status.bcVersion) console.log(`   BC Version: ${status.bcVersion}`);
      if (status.uptime) console.log(`   Uptime: ${status.uptime}s`);
      break;
    }
    
    case "list": {
      const providers = ContainerProviderRegistry.list();
      console.log("📋 Available Container Providers:");
      for (const provider of providers) {
        console.log(`   - ${provider}`);
      }
      break;
    }
    
    default:
      console.error(`❌ Error: Unknown container subcommand: ${subcommand}`);
      printContainerHelp();
      Deno.exit(1);
  }
}

async function handleCompileCommand(projectPath: string, args: any): Promise<void> {
  if (!args.container) {
    console.error("❌ Error: --container is required");
    Deno.exit(1);
  }
  
  if (!await exists(projectPath)) {
    console.error(`❌ Error: Project path does not exist: ${projectPath}`);
    Deno.exit(1);
  }
  
  try {
    const project = await ALProjectManager.loadProject(projectPath);
    const provider = ContainerProviderRegistry.create("mock");
    
    console.log(`🔨 Compiling AL project: ${ALProjectManager.getProjectInfo(project)}`);
    
    const result = await provider.compileProject(args.container, project);
    
    if (result.success) {
      console.log("✅ Compilation succeeded!");
      if (result.warnings.length > 0) {
        console.log(`⚠️  ${result.warnings.length} warning(s):`);
        for (const warning of result.warnings) {
          console.log(`   ${warning.file}:${warning.line} - ${warning.message}`);
        }
      }
    } else {
      console.log("❌ Compilation failed!");
      console.log(`   ${result.errors.length} error(s):`);
      for (const error of result.errors) {
        console.log(`   ${error.file}:${error.line} - ${error.message}`);
      }
    }
    
    console.log(`⏱️  Duration: ${result.duration}ms`);
  } catch (error) {
    console.error(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    Deno.exit(1);
  }
}

async function handleTestCommand(projectPath: string, args: any): Promise<void> {
  if (!args.container) {
    console.error("❌ Error: --container is required");
    Deno.exit(1);
  }
  
  if (!await exists(projectPath)) {
    console.error(`❌ Error: Project path does not exist: ${projectPath}`);
    Deno.exit(1);
  }
  
  try {
    const project = await ALProjectManager.loadProject(projectPath);
    const provider = ContainerProviderRegistry.create("mock");
    
    console.log(`🧪 Running tests for: ${ALProjectManager.getProjectInfo(project)}`);
    
    const result = await provider.runTests(args.container, project);
    
    if (result.success) {
      console.log("✅ All tests passed!");
    } else {
      console.log("❌ Some tests failed!");
    }
    
    console.log(`   Total: ${result.totalTests}, Passed: ${result.passedTests}, Failed: ${result.failedTests}`);
    console.log(`⏱️  Duration: ${result.duration}ms`);
    
    if (result.failedTests > 0) {
      console.log("\n📋 Failed tests:");
      for (const test of result.results.filter(t => !t.passed)) {
        console.log(`   ❌ ${test.name}: ${test.error}`);
      }
    }
  } catch (error) {
    console.error(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    Deno.exit(1);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(Deno.args, {
    boolean: ["help", "html", "version"],
    string: ["llms", "tasks", "output", "temperature", "max-tokens", "attempts", "name", "provider", "bc-version", "memory", "container"],
    alias: {
      h: "help",
      v: "version",
      o: "output",
      t: "tasks",
    },
  });

  if (args.version) {
    console.log(`CentralGauge v${VERSION}`);
    return;
  }

  const command = args._[0] as string;

  if (!command || command === "help" || args.help) {
    if (command === "bench") {
      printBenchHelp();
    } else if (command === "report") {
      printReportHelp();
    } else if (command === "container") {
      printContainerHelp();
    } else if (command === "compile") {
      printCompileHelp();
    } else if (command === "test") {
      printTestHelp();
    } else if (command === "models") {
      console.log(`
List supported models and test provider/model parsing

USAGE:
    centralgauge models [MODEL_SPECS...]

EXAMPLES:
    centralgauge models                                    # List all providers
    centralgauge models openai/gpt-4o anthropic/sonnet-4-think-8k    # Test parsing
`);
    } else {
      printHelp();
    }
    return;
  }

  try {
    switch (command) {
      case "bench": {
        if (args.help) {
          printBenchHelp();
          return;
        }

        if (!args.llms) {
          console.error("❌ Error: --llms is required");
          console.log("Use --help for usage information");
          Deno.exit(1);
        }

        const options: BenchmarkOptions = {
          llms: args.llms.split(",").map((s) => s.trim()),
          tasks: args.tasks
            ? args.tasks.split(",").map((s) => s.trim())
            : ["tasks/*.yml"],
          attempts: args.attempts ? parseInt(args.attempts) : 2,
          outputDir: args.output || "results/",
          temperature: args.temperature ? parseFloat(args.temperature) : 0.1,
          maxTokens: args["max-tokens"] ? parseInt(args["max-tokens"]) : 4000,
        };

        await runBenchmark(options);
        break;
      }

      case "report": {
        if (args.help) {
          printReportHelp();
          return;
        }

        const resultsDir = args._[1] as string;
        if (!resultsDir) {
          console.error("❌ Error: Results directory is required");
          console.log("Use --help for usage information");
          Deno.exit(1);
        }

        if (!await exists(resultsDir)) {
          console.error(
            `❌ Error: Results directory '${resultsDir}' does not exist`,
          );
          Deno.exit(1);
        }

        const outputDir = args.output || "reports/";
        const html = args.html || false;

        await generateReport(resultsDir, outputDir, html);
        break;
      }

      case "container": {
        const subcommand = args._[1] as string;
        if (!subcommand || args.help) {
          printContainerHelp();
          return;
        }
        
        await handleContainerCommand(subcommand, args);
        break;
      }

      case "compile": {
        if (args.help) {
          printCompileHelp();
          return;
        }
        
        const projectPath = args._[1] as string;
        if (!projectPath) {
          console.error("❌ Error: Project path is required");
          console.log("Use --help for usage information");
          Deno.exit(1);
        }
        
        await handleCompileCommand(projectPath, args);
        break;
      }

      case "test": {
        if (args.help) {
          printTestHelp();
          return;
        }
        
        const projectPath = args._[1] as string;
        if (!projectPath) {
          console.error("❌ Error: Project path is required");
          console.log("Use --help for usage information");
          Deno.exit(1);
        }
        
        await handleTestCommand(projectPath, args);
        break;
      }

      case "models": {
        const testSpecs = args._.slice(1) as string[];
        handleModelsCommand(testSpecs.length > 0 ? testSpecs : undefined);
        break;
      }

      default:
        console.error(`❌ Error: Unknown command '${command}'`);
        console.log("Use --help for usage information");
        Deno.exit(1);
    }
  } catch (error) {
    console.error(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    Deno.exit(1);
  }
}

function handleModelsCommand(testSpecs?: string[]): void {
  console.log("📋 CentralGauge Model Support\n");
  
  // Show all available providers
  const providers = LLMAdapterRegistry.list();
  console.log("🔧 Available Providers:");
  providers.forEach(provider => {
    const supportedModels = LLMAdapterRegistry.getSupportedModels(provider);
    console.log(`   ${provider}: ${supportedModels.slice(0, 3).join(", ")}${supportedModels.length > 3 ? "..." : ""}`);
  });
  
  console.log("\n📝 Provider/Model Format Examples:");
  console.log("   openai/gpt-4o              → OpenAI GPT-4o");
  console.log("   anthropic/sonnet-4-think-8k → Anthropic Claude custom model");
  console.log("   gemini/gemini-1.5-pro      → Google Gemini 1.5 Pro");
  console.log("   azure-openai/my-deployment → Azure OpenAI custom deployment");
  console.log("   local/llama3.2:latest      → Local Ollama model");
  console.log("   mock/test-model            → Mock testing adapter");
  
  // Test parsing if specs provided
  if (testSpecs && testSpecs.length > 0) {
    console.log("\n🧪 Testing Model Spec Parsing:");
    testSpecs.forEach(spec => {
      try {
        const { provider, model } = parseProviderAndModel(spec);
        console.log(`   "${spec}" → provider: ${provider}, model: ${model}`);
        
        // Try to create adapter to test validation
        try {
          const adapter = LLMAdapterRegistry.create(provider);
          console.log(`      ✅ Provider "${provider}" available`);
          
          // Test if model would be accepted (without requiring API keys)
          const errors = adapter.validateConfig({ 
            provider, 
            model, 
            apiKey: "test-key" // Fake key for validation test
          } as any);
          
          if (errors.length === 0) {
            console.log(`      ✅ Model "${model}" would be accepted`);
          } else {
            console.log(`      ⚠️  Model validation: ${errors.join(", ")}`);
          }
        } catch (error) {
          console.log(`      ❌ Provider "${provider}" error: ${error instanceof Error ? error.message : String(error)}`);
        }
      } catch (error) {
        console.log(`   "${spec}" → ❌ ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }
  
  console.log("\n💡 Usage Tips:");
  console.log("   • Use provider/model format for explicit control");
  console.log("   • Legacy auto-detection still works but shows warnings");
  console.log("   • Custom model names are supported if they follow provider patterns");
  console.log("   • Set appropriate environment variables for API keys");
}

if (import.meta.main) {
  await main();
}
