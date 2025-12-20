/**
 * Agents CLI command
 *
 * Manage and run Claude Agent SDK-based agents for benchmark tasks.
 *
 * @module cli/commands/agents
 */

import { Command } from "@cliffy/command";
import * as colors from "@std/fmt/colors";
import { join } from "@std/path";
import { AgentRegistry } from "../../src/agents/registry.ts";
import { AgentTaskExecutor } from "../../src/agents/executor.ts";
import { getAgentDisplayName } from "../../src/agents/loader.ts";
import { loadTaskManifest } from "../../src/tasks/loader.ts";

/**
 * List all available agents
 */
async function handleAgentsList(): Promise<void> {
  // Load agents from default directory
  await AgentRegistry.load("agents");

  const agents = AgentRegistry.list();

  if (agents.length === 0) {
    console.log(colors.yellow("No agents found in agents/ directory."));
    console.log(
      "\nTo create an agent, add a YAML file to the agents/ directory.",
    );
    console.log("Example: agents/default.yml\n");
    console.log("See the documentation for agent configuration format.");
    return;
  }

  console.log(colors.bold("Available Agents:\n"));

  for (const id of agents) {
    const config = AgentRegistry.get(id);
    if (!config) continue;

    const name = getAgentDisplayName(config);
    const model = config.model;
    const tags = config.tags?.join(", ") || "";

    console.log(
      `  ${colors.green(id.padEnd(20))} ${name} (${colors.cyan(model)})`,
    );
    if (config.description) {
      console.log(`  ${"".padEnd(20)} ${colors.dim(config.description)}`);
    }
    if (tags) {
      console.log(`  ${"".padEnd(20)} ${colors.dim(`tags: ${tags}`)}`);
    }
    console.log();
  }

  // Show usage examples
  console.log(colors.bold("\nUsage Examples:"));
  console.log("  # Run a single task with an agent");
  console.log(
    colors.dim(
      "  centralgauge agents run --agent default --task tasks/easy/CG-AL-E001.yml",
    ),
  );
  console.log("\n  # Show agent configuration details");
  console.log(colors.dim("  centralgauge agents show default"));
  console.log("\n  # Validate agent configuration");
  console.log(colors.dim("  centralgauge agents validate default"));
}

/**
 * Show detailed agent configuration
 */
async function handleAgentsShow(agentId: string): Promise<void> {
  await AgentRegistry.load("agents");

  const config = AgentRegistry.get(agentId);
  if (!config) {
    console.log(colors.red(`Agent not found: ${agentId}`));
    console.log(
      `\nAvailable agents: ${AgentRegistry.list().join(", ") || "(none)"}`,
    );
    return;
  }

  console.log(colors.bold(`Agent: ${config.id}\n`));

  // Basic info
  console.log(colors.cyan("Basic Configuration:"));
  console.log(`  Name:        ${config.name}`);
  console.log(`  Model:       ${config.model}`);
  console.log(`  Max Turns:   ${config.maxTurns}`);
  if (config.maxTokens) {
    console.log(`  Max Tokens:  ${config.maxTokens.toLocaleString()}`);
  }
  if (config.description) {
    console.log(`  Description: ${config.description}`);
  }

  // Inheritance
  if (config._inheritanceChain && config._inheritanceChain.length > 1) {
    console.log(
      `  Extends:     ${config._inheritanceChain.slice(0, -1).join(" -> ")}`,
    );
  }

  // Tools
  console.log(colors.cyan("\nAllowed Tools:"));
  for (const tool of config.allowedTools) {
    console.log(`  - ${tool}`);
  }

  // Claude Code features
  if (config.settingSources) {
    console.log(colors.cyan("\nSetting Sources:"));
    for (const source of config.settingSources) {
      console.log(`  - ${source}`);
    }
  }
  if (config.workingDir) {
    console.log(`  Working Dir: ${config.workingDir}`);
  }

  // MCP Servers
  if (config.mcpServers && Object.keys(config.mcpServers).length > 0) {
    console.log(colors.cyan("\nMCP Servers:"));
    for (const [name, server] of Object.entries(config.mcpServers)) {
      console.log(
        `  ${name}: ${server.command} ${server.args?.join(" ") ?? ""}`,
      );
    }
  }

  // System prompt
  if (config.systemPrompt) {
    console.log(colors.cyan("\nSystem Prompt:"));
    if (typeof config.systemPrompt === "string") {
      // Show first 200 chars of custom prompt
      const preview = config.systemPrompt.slice(0, 200);
      console.log(
        `  ${colors.dim(preview)}${
          config.systemPrompt.length > 200 ? "..." : ""
        }`,
      );
    } else {
      console.log(`  Preset: ${config.systemPrompt.preset}`);
      if (config.systemPrompt.append) {
        const preview = config.systemPrompt.append.slice(0, 200);
        console.log(
          `  Append: ${colors.dim(preview)}${
            config.systemPrompt.append.length > 200 ? "..." : ""
          }`,
        );
      }
    }
  }

  // Limits
  if (config.limits) {
    console.log(colors.cyan("\nLimits:"));
    if (config.limits.maxCompileAttempts) {
      console.log(
        `  Max Compile Attempts: ${config.limits.maxCompileAttempts}`,
      );
    }
    if (config.limits.timeoutMs) {
      console.log(`  Timeout: ${config.limits.timeoutMs / 1000}s`);
    }
  }

  // Tags
  if (config.tags && config.tags.length > 0) {
    console.log(colors.cyan("\nTags:"));
    console.log(`  ${config.tags.join(", ")}`);
  }
}

/**
 * Validate agent configuration
 */
async function handleAgentsValidate(agentId: string): Promise<void> {
  await AgentRegistry.load("agents");

  const result = AgentRegistry.validate(agentId);

  console.log(colors.bold(`Validating agent: ${agentId}\n`));

  if (result.valid) {
    console.log(colors.green("[OK] Agent configuration is valid."));
  } else {
    console.log(colors.red("[FAIL] Agent configuration has errors:"));
    for (const error of result.errors) {
      console.log(colors.red(`  - ${error}`));
    }
  }

  if (result.warnings.length > 0) {
    console.log(colors.yellow("\nWarnings:"));
    for (const warning of result.warnings) {
      console.log(colors.yellow(`  - ${warning}`));
    }
  }
}

/**
 * Run a single task with an agent
 */
async function handleAgentsRun(options: {
  agent: string;
  task: string;
  container: string;
  projectDir?: string;
  verbose?: true | undefined;
}): Promise<void> {
  console.log(colors.bold("Agent Task Execution\n"));

  await AgentRegistry.load("agents");

  const config = AgentRegistry.get(options.agent);
  if (!config) {
    console.log(colors.red(`Agent not found: ${options.agent}`));
    console.log(
      `\nAvailable agents: ${AgentRegistry.list().join(", ") || "(none)"}`,
    );
    return;
  }

  // Load the task manifest
  let task;
  try {
    task = await loadTaskManifest(options.task);
  } catch (error) {
    console.log(
      colors.red(
        `Failed to load task: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ),
    );
    return;
  }

  console.log(`Agent:     ${config.name} (${config.id})`);
  console.log(`Model:     ${config.model}`);
  console.log(`Task:      ${task.id}`);
  console.log(`Container: ${options.container}`);

  // Resolve project directory - default to safe workspace under results/
  const projectDir = options.projectDir ??
    join(Deno.cwd(), "results", "agent-workspace", `${task.id}_${Date.now()}`);
  console.log(`Project:   ${projectDir}`);
  console.log();

  console.log(colors.cyan("[RUNNING]"), "Starting agent execution...\n");

  const startTime = Date.now();
  const executor = new AgentTaskExecutor();

  try {
    const result = await executor.execute(config, task, {
      projectDir,
      containerName: options.container,
      containerProvider: "bccontainer",
      debug: options.verbose ?? false,
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log();
    console.log(colors.bold("Execution Result:"));
    console.log("─".repeat(40));

    if (result.success) {
      console.log(colors.green("[SUCCESS]"), "Task completed successfully!");
    } else {
      console.log(
        colors.red("[FAILED]"),
        `Task failed (${result.terminationReason})`,
      );
    }

    console.log(`Duration:          ${duration}s`);
    console.log(`Turns:             ${result.metrics.turns}`);
    console.log(`Compile Attempts:  ${result.metrics.compileAttempts}`);
    console.log(`Test Runs:         ${result.metrics.testRuns}`);
    console.log(
      `Token Usage:       ${result.metrics.totalTokens.toLocaleString()} tokens`,
    );
    console.log(
      `Estimated Cost:    $${result.metrics.estimatedCost.toFixed(4)}`,
    );
    console.log(`Termination:       ${result.terminationReason}`);

    if (result.finalCode && options.verbose) {
      console.log();
      console.log(colors.bold("Generated Code:"));
      console.log("─".repeat(40));
      console.log(result.finalCode);
    }
  } catch (error) {
    console.log();
    console.log(
      colors.red("[ERROR]"),
      `Agent execution failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );

    if (options.verbose && error instanceof Error && error.stack) {
      console.log(colors.dim(error.stack));
    }
  }
}

/**
 * Register the agents command
 */
export function registerAgentsCommand(cli: Command): void {
  const agentsCmd = new Command()
    .description("Manage and run Claude Agent SDK-based agents")
    .action(() => {
      // Show help by default
      agentsCmd.showHelp();
    });

  // List subcommand
  agentsCmd
    .command("list", "List all available agents")
    .alias("ls")
    .action(handleAgentsList);

  // Show subcommand
  agentsCmd
    .command("show <agent:string>", "Show detailed agent configuration")
    .alias("info")
    .action((_options, agent) => handleAgentsShow(agent));

  // Validate subcommand
  agentsCmd
    .command("validate <agent:string>", "Validate agent configuration")
    .alias("check")
    .action((_options, agent) => handleAgentsValidate(agent));

  // Run subcommand
  agentsCmd
    .command("run", "Run a single task with an agent")
    .option("-a, --agent <agent:string>", "Agent configuration to use", {
      required: true,
    })
    .option("-t, --task <task:string>", "Task manifest file to run", {
      required: true,
    })
    .option("-c, --container <name:string>", "BC container name", {
      default: "Cronus27",
    })
    .option("-p, --project-dir <dir:string>", "Project directory for execution")
    .option("-v, --verbose", "Enable verbose output")
    .action(handleAgentsRun);

  cli.command("agents", agentsCmd);
}
