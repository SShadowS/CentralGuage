#!/usr/bin/env -S deno run --allow-all

import { Command } from "@cliffy/command";
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
  else if (modelSpec.includes("azure") || Deno.env.get("AZURE_OPENAI_ENDPOINT")) {
    provider = "azure-openai";
  }
  // Local models (Ollama, etc.)
  else if (modelSpec.startsWith("llama") || modelSpec.startsWith("codellama") || 
           modelSpec.startsWith("mistral") || modelSpec.startsWith("qwen") ||
           Deno.env.get("OLLAMA_HOST") || Deno.env.get("LOCAL_LLM_ENDPOINT")) {
    provider = "local";
  }
  // Default to mock for unknown models
  else {
    console.warn(`⚠️  Unknown model format: ${modelSpec}, using mock adapter`);
    provider = "mock";
  }
  
  return { provider, model: modelSpec };
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

async function handleContainerSetup(name: string, provider: string, bcVersion?: string, memory?: string): Promise<void> {
  const containerProvider = ContainerProviderRegistry.create(provider);
  const config: ContainerConfig = {
    name,
    bcVersion: bcVersion || "24.0",
    memoryLimit: memory || "8G",
    acceptEula: true,
    includeAL: true,
    includeTestToolkit: true,
  };
  
  await containerProvider.setup(config);
}

async function handleContainerControl(action: string, name: string): Promise<void> {
  const provider = ContainerProviderRegistry.create("mock");
  
  switch (action) {
    case "start":
      await provider.start(name);
      break;
    case "stop":
      await provider.stop(name);
      break;
    case "remove":
      await provider.remove(name);
      break;
    case "status":
      const status = await provider.status(name);
      console.log(`📋 Container Status: ${status.name}`);
      console.log(`   Running: ${status.isRunning ? "✅" : "❌"}`);
      console.log(`   Health: ${status.health}`);
      if (status.bcVersion) console.log(`   BC Version: ${status.bcVersion}`);
      if (status.uptime) console.log(`   Uptime: ${status.uptime}s`);
      break;
  }
}

function handleModelsList(testSpecs?: string[]): void {
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

async function handleCompile(projectPath: string, containerName: string, outputDir?: string): Promise<void> {
  if (!await exists(projectPath)) {
    console.error(`❌ Error: Project path does not exist: ${projectPath}`);
    Deno.exit(1);
  }
  
  try {
    const project = await ALProjectManager.loadProject(projectPath);
    const provider = ContainerProviderRegistry.create("mock");
    
    console.log(`🔨 Compiling AL project: ${ALProjectManager.getProjectInfo(project)}`);
    
    const result = await provider.compileProject(containerName, project);
    
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

async function handleTest(projectPath: string, containerName: string, outputDir?: string): Promise<void> {
  if (!await exists(projectPath)) {
    console.error(`❌ Error: Project path does not exist: ${projectPath}`);
    Deno.exit(1);
  }
  
  try {
    const project = await ALProjectManager.loadProject(projectPath);
    const provider = ContainerProviderRegistry.create("mock");
    
    console.log(`🧪 Running tests for: ${ALProjectManager.getProjectInfo(project)}`);
    
    const result = await provider.runTests(containerName, project);
    
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

// Create the main CLI application
const cli = new Command()
  .name("centralgauge")
  .version(VERSION)
  .description("LLM benchmark for Microsoft Dynamics 365 Business Central AL code")
  .globalOption("-v, --verbose", "Enable verbose output")
  .example(
    "Basic benchmark",
    "centralgauge bench --llms openai/gpt-4o --tasks tasks/*.yml"
  )
  .example(
    "Multi-provider comparison", 
    "centralgauge bench --llms openai/gpt-4o,anthropic/claude-3-5-sonnet-20241022 --attempts 2"
  )
  .example(
    "Generate HTML report",
    "centralgauge report results/ --html --output reports/"
  );

// Benchmark command
cli.command("bench", "Run benchmark evaluation")
  .option("-l, --llms <models...>", "LLM models to test (provider/model format)", { required: true })
  .option("-t, --tasks <patterns...>", "Task file patterns", { default: ["tasks/*.yml"] })
  .option("-a, --attempts <number>", "Number of attempts per task", { default: 2 })
  .option("-o, --output <dir>", "Output directory", { default: "results/" })
  .option("--temperature <number>", "LLM temperature", { default: 0.1 })
  .option("--max-tokens <number>", "Maximum tokens per request", { default: 4000 })
  .action(async (options) => {
    const benchOptions: BenchmarkOptions = {
      llms: options.llms,
      tasks: options.tasks,
      attempts: options.attempts,
      outputDir: options.output,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
    };
    await runBenchmark(benchOptions);
  });

// Report command
cli.command("report <results-dir>", "Generate HTML report from benchmark results")
  .option("--html", "Generate HTML report", { default: false })
  .option("-o, --output <dir>", "Output directory", { default: "reports/" })
  .action(async (options, resultsDir: string) => {
    if (!await exists(resultsDir)) {
      console.error(`❌ Error: Results directory '${resultsDir}' does not exist`);
      Deno.exit(1);
    }
    await generateReport(resultsDir, options.output, options.html);
  });

// Container command with subcommands
const containerCmd = cli.command("container", "Manage Business Central containers");

containerCmd.command("setup", "Create and setup a new container")
  .option("-n, --name <name>", "Container name", { required: true })
  .option("-p, --provider <provider>", "Container provider", { required: true })
  .option("--bc-version <version>", "Business Central version", { default: "24.0" })
  .option("--memory <size>", "Memory limit", { default: "8G" })
  .action(async (options) => {
    await handleContainerSetup(options.name, options.provider, options.bcVersion, options.memory);
  });

containerCmd.command("start <name>", "Start an existing container")
  .action(async (options, name: string) => {
    await handleContainerControl("start", name);
  });

containerCmd.command("stop <name>", "Stop a running container")
  .action(async (options, name: string) => {
    await handleContainerControl("stop", name);
  });

containerCmd.command("remove <name>", "Remove a container")
  .action(async (options, name: string) => {
    await handleContainerControl("remove", name);
  });

containerCmd.command("status <name>", "Show container status")
  .action(async (options, name: string) => {
    await handleContainerControl("status", name);
  });

containerCmd.command("list", "List available providers")
  .action(() => {
    const providers = ContainerProviderRegistry.list();
    console.log("📋 Available Container Providers:");
    for (const provider of providers) {
      console.log(`   - ${provider}`);
    }
  });

// Compile command
cli.command("compile <project-path>", "Compile AL project in container")
  .option("-c, --container <name>", "Container name", { required: true })
  .option("-o, --output <dir>", "Output directory for compilation results")
  .action(async (options, projectPath: string) => {
    await handleCompile(projectPath, options.container, options.output);
  });

// Test command  
cli.command("test <project-path>", "Run AL tests in container")
  .option("-c, --container <name>", "Container name", { required: true })
  .option("-o, --output <dir>", "Output directory for test results")
  .action(async (options, projectPath: string) => {
    await handleTest(projectPath, options.container, options.output);
  });

// Models command
cli.command("models [...specs]", "List supported models and test parsing")
  .action((options, ...specs: string[]) => {
    handleModelsList(specs.length > 0 ? specs : undefined);
  });

// Parse and execute
if (import.meta.main) {
  await cli.parse(Deno.args);
}