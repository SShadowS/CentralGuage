#!/usr/bin/env -S deno run --allow-all
/**
 * Compare two Claude Code agent configurations on the same task.
 *
 * Usage:
 *   deno run --allow-all test-configs/compare-configs.ts
 *   deno run --allow-all test-configs/compare-configs.ts --prompt "Create a table..."
 *   deno run --allow-all test-configs/compare-configs.ts --task tasks/easy/CG-AL-E001-basic-table.yml
 */

import { parseArgs } from "jsr:@std/cli@1.0.9/parse-args";
import { parse as parseYaml } from "jsr:@std/yaml@1.0.5";
import * as colors from "jsr:@std/fmt@1.0.5/colors";
import { resolve } from "jsr:@std/path@1.0.8";

interface TestResult {
  config: string;
  success: boolean;
  output: string;
  cost_usd: number;
  duration_ms: number;
  num_turns: number;
  tools_used: string[];
  error: string | undefined;
}

interface TaskYaml {
  id: string;
  description: string;
}

// Default test prompt if none provided
const DEFAULT_PROMPT = `Create an AL table with the following requirements:
- Table ID: 50100
- Table name: "Test Item"
- Fields:
  - No. (Code[20], primary key)
  - Description (Text[100])
  - Unit Price (Decimal)
  - Quantity (Integer)
  - Active (Boolean, default true)

Return only the AL code, no explanations.`;

async function runWithConfig(
  configPath: string,
  prompt: string,
  model: string,
): Promise<TestResult> {
  const configName = configPath.split("/").pop() || configPath;
  const absolutePath = resolve(configPath);

  console.log(colors.cyan(`\n[$${configName}] Starting test...`));
  console.log(colors.gray(`  CWD: ${absolutePath}`));

  const toolsUsed: string[] = [];
  let output = "";
  let result: TestResult = {
    config: configName,
    success: false,
    output: "",
    cost_usd: 0,
    duration_ms: 0,
    num_turns: 0,
    tools_used: [],
    error: undefined,
  };

  try {
    // Dynamic import of Claude Agent SDK
    const { query } = await import("@anthropic-ai/claude-agent-sdk");

    const q = query({
      prompt: prompt,
      options: {
        model: model,
        cwd: absolutePath,
        settingSources: ["project"] as ("user" | "project" | "local")[],
        permissionMode: "bypassPermissions" as const,
        allowDangerouslySkipPermissions: true,
        maxTurns: 10,
        maxBudgetUsd: 0.50,
      },
    });

    for await (const msg of q) {
      if (msg.type === "system" && msg.subtype === "init") {
        console.log(colors.gray(`  Model: ${msg.model}`));
        console.log(colors.gray(`  Permission mode: ${msg.permissionMode}`));
        console.log(
          colors.gray(`  Tools: ${msg.tools?.length || 0} available`),
        );
      }

      if (msg.type === "assistant" && msg.message) {
        for (const block of msg.message.content) {
          if (block.type === "text" && block.text) {
            output += block.text;
          }
          if (block.type === "tool_use" && block.name) {
            if (!toolsUsed.includes(block.name)) {
              toolsUsed.push(block.name);
            }
            console.log(colors.yellow(`  [Tool] ${block.name}`));
          }
        }
      }

      if (msg.type === "result") {
        const isError = msg.subtype !== "success";
        result = {
          config: configName,
          success: !isError,
          output: output,
          cost_usd: msg.total_cost_usd || 0,
          duration_ms: msg.duration_ms || 0,
          num_turns: msg.num_turns || 0,
          tools_used: toolsUsed,
          error: isError ? msg.subtype : undefined,
        };

        const statusColor = result.success ? colors.green : colors.red;
        console.log(statusColor(`  [${msg.subtype}] Done`));
        console.log(colors.gray(`  Cost: $${result.cost_usd.toFixed(4)}`));
        console.log(colors.gray(`  Duration: ${result.duration_ms}ms`));
        console.log(colors.gray(`  Turns: ${result.num_turns}`));
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(colors.red(`  [ERROR] ${errorMsg}`));
    result.error = errorMsg;
  }

  return result;
}

function compareResults(results: TestResult[]): void {
  console.log(colors.bold("\n" + "=".repeat(60)));
  console.log(colors.bold("COMPARISON RESULTS"));
  console.log("=".repeat(60));

  // Summary table
  console.log("\n" + colors.bold("Summary:"));
  console.log("-".repeat(60));
  console.log(
    `${"Config".padEnd(12)} | ${"Success".padEnd(8)} | ${"Cost".padEnd(10)} | ${
      "Time".padEnd(10)
    } | Turns`,
  );
  console.log("-".repeat(60));

  for (const r of results) {
    const successStr = r.success ? colors.green("Yes") : colors.red("No");
    const costStr = `$${r.cost_usd.toFixed(4)}`;
    const timeStr = `${r.duration_ms}ms`;
    console.log(
      `${r.config.padEnd(12)} | ${successStr.padEnd(17)} | ${
        costStr.padEnd(10)
      } | ${timeStr.padEnd(10)} | ${r.num_turns}`,
    );
  }
  console.log("-".repeat(60));

  // Tools comparison
  console.log("\n" + colors.bold("Tools Used:"));
  for (const r of results) {
    console.log(`  ${r.config}: ${r.tools_used.join(", ") || "(none)"}`);
  }

  // Cost comparison
  if (results.length === 2 && results[0] && results[1]) {
    const a = results[0];
    const b = results[1];
    const costDiff = b.cost_usd - a.cost_usd;
    const costPct = a.cost_usd > 0
      ? ((costDiff / a.cost_usd) * 100).toFixed(1)
      : "N/A";
    const timeDiff = b.duration_ms - a.duration_ms;

    console.log("\n" + colors.bold("Differences (B vs A):"));
    console.log(
      `  Cost: ${costDiff >= 0 ? "+" : ""}$${
        costDiff.toFixed(4)
      } (${costPct}%)`,
    );
    console.log(`  Time: ${timeDiff >= 0 ? "+" : ""}${timeDiff}ms`);
  }

  // Output comparison
  console.log("\n" + colors.bold("Outputs:"));
  for (const r of results) {
    console.log(colors.cyan(`\n--- ${r.config} ---`));
    if (r.error) {
      console.log(colors.red(`Error: ${r.error}`));
    } else {
      // Truncate long outputs
      const maxLen = 2000;
      const output = r.output.length > maxLen
        ? r.output.substring(0, maxLen) + "\n... (truncated)"
        : r.output;
      console.log(output || "(no output)");
    }
  }
}

async function main() {
  const args = parseArgs(Deno.args, {
    string: ["prompt", "task", "model", "config-a", "config-b"],
    boolean: ["help"],
    default: {
      model: "claude-sonnet-4-5-20250929",
      "config-a": "test-configs/config-a",
      "config-b": "test-configs/config-b",
    },
  });

  if (args.help) {
    console.log(`
${colors.bold("Compare Claude Code Agent Configurations")}

Usage:
  deno run --allow-all test-configs/compare-configs.ts [options]

Options:
  --prompt <text>     Custom prompt to test (default: AL table creation)
  --task <path>       Load prompt from a task YAML file
  --model <id>        Model to use (default: claude-sonnet-4-5-20250929)
  --config-a <path>   Path to config A (default: test-configs/config-a)
  --config-b <path>   Path to config B (default: test-configs/config-b)
  --help              Show this help message

Examples:
  # Default test
  deno run --allow-all test-configs/compare-configs.ts

  # Custom prompt
  deno run --allow-all test-configs/compare-configs.ts --prompt "Create an AL enum..."

  # Use task file
  deno run --allow-all test-configs/compare-configs.ts --task tasks/easy/CG-AL-E001-basic-table.yml
`);
    Deno.exit(0);
  }

  // Determine prompt
  let prompt = args.prompt || DEFAULT_PROMPT;

  if (args.task) {
    try {
      const taskContent = await Deno.readTextFile(args.task);
      const task = parseYaml(taskContent) as TaskYaml;
      prompt = task.description;
      console.log(colors.cyan(`Loaded task: ${task.id}`));
    } catch (error) {
      console.error(colors.red(`Failed to load task: ${error}`));
      Deno.exit(1);
    }
  }

  console.log(colors.bold("Claude Code Agent Configuration Comparison"));
  console.log("=".repeat(60));
  console.log(colors.gray(`Model: ${args.model}`));
  console.log(colors.gray(`Config A: ${args["config-a"]}`));
  console.log(colors.gray(`Config B: ${args["config-b"]}`));
  console.log(
    colors.gray(
      `\nPrompt:\n${prompt.substring(0, 200)}${
        prompt.length > 200 ? "..." : ""
      }`,
    ),
  );

  // Run both configs
  const results: TestResult[] = [];

  results.push(await runWithConfig(args["config-a"], prompt, args.model));
  results.push(await runWithConfig(args["config-b"], prompt, args.model));

  // Compare results
  compareResults(results);

  // Exit with error if any failed
  const allSuccess = results.every((r) => r.success);
  Deno.exit(allSuccess ? 0 : 1);
}

main();
