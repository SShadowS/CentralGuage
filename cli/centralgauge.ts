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
import { ModelPresetRegistry, MODEL_PRESETS, MODEL_GROUPS } from "../src/llm/model-presets.ts";
import { ConfigManager } from "../src/config/config.ts";

const VERSION = "0.1.0";

/**
 * Parse provider and model from various formats:
 * - Aliases: "sonnet", "gpt-4o", "haiku" 
 * - Groups: "flagship", "budget", "coding"
 * - Provider/model: "openai/gpt-4o", "anthropic/claude-3-5-sonnet-20241022"
 * - Legacy patterns: "gpt-4", "claude-3-sonnet" (with warnings)
 */
function parseProviderAndModel(modelSpec: string): { provider: string; model: string } {
  // First try to resolve through preset system (handles aliases, groups, and provider/model)
  const resolved = ModelPresetRegistry.resolve(modelSpec);
  
  if (resolved.length === 1 && resolved[0] !== modelSpec) {
    // Successfully resolved to a different spec, parse the resolved spec
    const resolvedSpec = resolved[0];
    if (resolvedSpec.includes("/")) {
      const [provider, ...modelParts] = resolvedSpec.split("/");
      const model = modelParts.join("/");
      
      // Validate provider
      const validProviders = ["openai", "anthropic", "gemini", "azure-openai", "local", "mock"];
      if (validProviders.includes(provider)) {
        return { provider, model };
      }
    }
  }
  
  // If not resolved or is already provider/model format, handle directly
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
  console.warn(`⚠️  Using pattern detection for model: ${modelSpec}. Consider using aliases or provider/model format.`);
  
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
    
    // Execute benchmark for each model (expanding groups if needed)
    const allResults = [];
    
    for (const llmModelSpec of options.llms) {
      console.log(`\n🤖 Running benchmark with model spec: ${llmModelSpec}`);
      
      // Resolve spec to actual models (handles groups, aliases, and provider/model)
      const resolvedSpecs = ModelPresetRegistry.resolve(llmModelSpec);
      
      for (const resolvedSpec of resolvedSpecs) {
        // Parse provider and model from resolved spec
        const { provider: llmProvider, model: llmModel } = parseProviderAndModel(resolvedSpec);
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
  
  // Show model presets (aliases)
  console.log("🏷️  Model Aliases (Short Names):");
  const presetsByCategory = ModelPresetRegistry.getPresetsByCategory();
  
  // Show flagship models first
  if (presetsByCategory.flagship) {
    console.log("   Flagship Models:");
    presetsByCategory.flagship.forEach(preset => {
      console.log(`   ${preset.alias.padEnd(12)} → ${preset.displayName} (${preset.costTier})`);
    });
  }
  
  // Show budget models
  if (presetsByCategory.budget) {
    console.log("\n   Budget Models:");
    presetsByCategory.budget.forEach(preset => {
      console.log(`   ${preset.alias.padEnd(12)} → ${preset.displayName} (${preset.costTier})`);
    });
  }
  
  // Show coding-specific models
  if (presetsByCategory.coding) {
    console.log("\n   Coding Models:");
    presetsByCategory.coding.forEach(preset => {
      console.log(`   ${preset.alias.padEnd(12)} → ${preset.displayName} (${preset.category.join(", ")})`);
    });
  }
  
  // Show model groups
  console.log("\n🎯 Model Groups:");
  const groups = MODEL_GROUPS;
  console.log("   flagship     → Top-tier models for best quality");
  console.log("   budget       → Cost-effective models for development"); 
  console.log("   coding       → Optimized for code generation tasks");
  console.log("   reasoning    → Advanced reasoning capabilities");
  console.log("   fast         → Optimized for speed");
  console.log("   quality      → Optimized for output quality");
  console.log("   comparison   → Recommended set for model comparison");
  console.log("   all          → Every available model");
  
  // Show cost tiers
  console.log("\n💰 Cost Tiers:");
  const costTiers = ModelPresetRegistry.getPresetsByCostTier();
  Object.entries(costTiers).forEach(([tier, presets]) => {
    if (presets.length > 0) {
      const aliases = presets.map(p => p.alias).join(", ");
      console.log(`   ${tier.padEnd(8)} → ${aliases}`);
    }
  });
  
  // Show providers for reference
  console.log("\n🔧 Available Providers:");
  const providers = LLMAdapterRegistry.list();
  providers.forEach(provider => {
    const supportedModels = LLMAdapterRegistry.getSupportedModels(provider);
    console.log(`   ${provider}: ${supportedModels.slice(0, 3).join(", ")}${supportedModels.length > 3 ? "..." : ""}`);
  });
  
  // Show usage examples
  console.log("\n📝 Usage Examples:");
  console.log("   # Use aliases (recommended)");
  console.log("   centralgauge bench --llms sonnet,gpt-4o");
  console.log("   \n   # Use groups for comparisons");
  console.log("   centralgauge bench --llms flagship");
  console.log("   \n   # Mix aliases and groups");
  console.log("   centralgauge bench --llms flagship,budget");
  console.log("   \n   # Traditional provider/model format still works");
  console.log("   centralgauge bench --llms openai/gpt-4o,anthropic/claude-3-5-sonnet-20241022");
  
  // Test parsing if specs provided
  if (testSpecs && testSpecs.length > 0) {
    console.log("\n🧪 Testing Model Spec Parsing:");
    testSpecs.forEach(spec => {
      try {
        const resolved = ModelPresetRegistry.resolve(spec);
        console.log(`   "${spec}" → resolves to:`);
        
        resolved.forEach(resolvedSpec => {
          const { provider, model } = parseProviderAndModel(resolvedSpec);
          console.log(`      ${provider}/${model}`);
          
          // Check if it's a known preset
          const preset = Object.values(MODEL_PRESETS).find(p => 
            `${p.provider}/${p.model}` === resolvedSpec
          );
          if (preset) {
            console.log(`        (${preset.displayName} - ${preset.description})`);
          }
        });
      } catch (error) {
        console.log(`   "${spec}" → ❌ ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }
  
  console.log("\n💡 Pro Tips:");
  console.log("   • Use aliases like 'sonnet' instead of 'anthropic/claude-3-5-sonnet-20241022'");
  console.log("   • Use groups like 'flagship' to test multiple top-tier models");
  console.log("   • Mix aliases, groups, and provider/model formats freely");
  console.log("   • Set ANTHROPIC_API_KEY, OPENAI_API_KEY etc. for API access");
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
    "Basic benchmark with aliases",
    "centralgauge bench --llms sonnet,gpt-4o --tasks tasks/*.yml"
  )
  .example(
    "Group-based comparison", 
    "centralgauge bench --llms flagship --attempts 2"
  )
  .example(
    "Mixed aliases and groups",
    "centralgauge bench --llms coding,budget --tasks tasks/easy/*.yml"
  )
  .example(
    "Traditional provider/model format",
    "centralgauge bench --llms openai/gpt-4o,anthropic/claude-3-5-sonnet-20241022"
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

// Config command with subcommands
const configCmd = cli.command("config", "Manage configuration");

configCmd.command("init", "Generate sample configuration file")
  .option("--global", "Create in home directory instead of current directory")
  .action(async (options) => {
    const configPath = options.global 
      ? `${Deno.env.get("HOME") || Deno.env.get("USERPROFILE")}/.centralgauge.yml`
      : ".centralgauge.yml";
    
    if (await exists(configPath)) {
      console.log(`⚠️  Configuration file already exists: ${configPath}`);
      console.log("Remove it first if you want to regenerate.");
      return;
    }
    
    const sampleConfig = ConfigManager.generateSampleConfig();
    await Deno.writeTextFile(configPath, sampleConfig);
    console.log(`✅ Created configuration file: ${configPath}`);
    console.log("Edit this file to customize your default settings.");
  });

configCmd.command("show", "Show current configuration")
  .action(async () => {
    const config = await ConfigManager.loadConfig();
    console.log("📋 Current Configuration:\n");
    console.log(JSON.stringify(config, null, 2));
  });

// Parse and execute
if (import.meta.main) {
  await cli.parse(Deno.args);
}