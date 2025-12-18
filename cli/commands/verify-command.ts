/**
 * Verify command for analyzing failing tasks and proposing fixes
 * @module cli/commands/verify
 */

import { Command } from "@cliffy/command";
import { Select } from "@cliffy/prompt";
import * as colors from "@std/fmt/colors";
import {
  createVerifyOrchestrator,
  findSessions,
  isFixableResult,
  parseDebugDir,
  type VerifyOptions,
} from "../../src/verify/mod.ts";

async function handleVerify(
  options: {
    session?: string;
    task?: string;
    filter: string;
    dryRun: boolean;
    parallel: number;
    model: string;
    shortcomingsDir: string;
    shortcomingsOnly: boolean;
    fixesOnly: boolean;
  },
  debugDir?: string,
): Promise<void> {
  const dir = debugDir || "debug";

  // Validate mutually exclusive options
  if (options.shortcomingsOnly && options.fixesOnly) {
    console.error(
      colors.red(
        "[ERROR] --shortcomings-only and --fixes-only are mutually exclusive",
      ),
    );
    Deno.exit(1);
  }

  // Determine mode
  const mode = options.shortcomingsOnly
    ? "shortcomings-only"
    : options.fixesOnly
    ? "fixes-only"
    : "all";

  console.log(colors.gray(`[INFO] Analyzing debug output in: ${dir}`));

  // Find session
  let sessionId = options.session;
  if (!sessionId) {
    const sessions = await findSessions(dir);
    if (sessions.length === 0) {
      console.error(colors.red("[ERROR] No sessions found in debug directory"));
      Deno.exit(1);
    } else if (sessions.length === 1) {
      sessionId = sessions[0]!.sessionId;
    } else {
      // Sort by session ID (timestamp) descending - most recent first
      sessions.sort((a, b) => parseInt(b.sessionId) - parseInt(a.sessionId));

      const choices = sessions.map((s) => {
        const date = new Date(parseInt(s.sessionId));
        const hasCompilation = s.compilationLogPath ? "compile" : "";
        const hasTests = s.testLogPath ? "test" : "";
        const logs = [hasCompilation, hasTests].filter(Boolean).join(", ");
        return {
          name: `${s.sessionId} (${date.toLocaleString()}) [${logs}]`,
          value: s.sessionId,
        };
      });

      sessionId = await Select.prompt({
        message: "Select session to analyze:",
        options: choices,
      });
    }
  }

  console.log(colors.gray(`[INFO] Using session: ${sessionId}`));

  // Parse debug directory for failing tasks
  let failingTasks;
  try {
    failingTasks = await parseDebugDir(dir, sessionId);
  } catch (error) {
    console.error(
      colors.red(`[ERROR] Failed to parse debug directory: ${error}`),
    );
    Deno.exit(1);
  }

  // Filter by task ID if specified
  if (options.task) {
    failingTasks = failingTasks.filter((t) => t.taskId === options.task);
  }

  // Filter by failure type
  if (options.filter !== "all") {
    const filterType = options.filter === "compile" ? "compilation" : "test";
    failingTasks = failingTasks.filter((t) => t.failureType === filterType);
  }

  if (failingTasks.length === 0) {
    console.log(colors.green("[OK] No failing tasks found!"));
    return;
  }

  console.log(
    colors.gray(`[INFO] Found ${failingTasks.length} failing task(s)`),
  );
  console.log();

  // Create verify options
  const verifyOptions: VerifyOptions = {
    debugDir: dir,
    session: sessionId,
    task: options.task,
    filter: options.filter as "compile" | "test" | "all",
    dryRun: options.dryRun,
    parallel: options.parallel,
    model: options.model,
    shortcomingsDir: options.shortcomingsDir,
    mode,
  };

  // Create orchestrator
  const orchestrator = createVerifyOrchestrator(verifyOptions);

  // Subscribe to events
  orchestrator.on((event) => {
    switch (event.type) {
      case "analyzing":
        console.log(
          colors.cyan(`[ANALYZE] ${event.taskId} (${event.model})`),
        );
        break;
      case "analysis_complete":
        if (isFixableResult(event.result)) {
          console.log(
            colors.yellow(
              `[FIXABLE] ${event.result.category} in ${event.result.fix.filePath}`,
            ),
          );
          console.log(`  ${event.result.description}`);
        } else {
          console.log(
            colors.blue(
              `[MODEL GAP] ${event.result.concept}`,
            ),
          );
          console.log(`  ${event.result.description.slice(0, 100)}...`);
        }
        break;
      case "fix_applied":
        if (event.success) {
          console.log(colors.green(`[OK] Applied fix to ${event.taskId}`));
        } else {
          console.log(
            colors.red(`[FAIL] Could not apply fix to ${event.taskId}`),
          );
        }
        break;
      case "fix_skipped":
        console.log(colors.gray(`[SKIP] Skipped fix for ${event.taskId}`));
        break;
      case "shortcoming_logged":
        console.log(
          colors.gray(
            `  Logged to: ${options.shortcomingsDir}/${event.model}.json`,
          ),
        );
        break;
      case "error":
        console.error(colors.red(`[ERROR] ${event.taskId}: ${event.error}`));
        break;
    }
  });

  // Run verification
  const summary = await orchestrator.runVerification(
    failingTasks,
    verifyOptions,
  );

  // Print summary
  console.log();
  console.log(colors.bold("=== Summary ==="));
  console.log(`Analyzed: ${summary.totalAnalyzed}`);
  console.log(`Fixes applied: ${summary.fixesApplied}`);
  console.log(`Fixes skipped: ${summary.fixesSkipped}`);

  if (summary.modelShortcomings.size > 0) {
    console.log("Model shortcomings logged:");
    for (const [model, count] of summary.modelShortcomings) {
      console.log(`  - ${model}: ${count} gaps`);
    }
  }

  if (summary.errors.length > 0) {
    console.log(colors.red(`\nErrors: ${summary.errors.length}`));
    for (const error of summary.errors.slice(0, 5)) {
      console.log(colors.red(`  - ${error}`));
    }
    if (summary.errors.length > 5) {
      console.log(colors.gray(`  ... and ${summary.errors.length - 5} more`));
    }
  }
}

export function registerVerifyCommand(cli: Command): void {
  cli.command("verify [debug-dir]", "Analyze failing tasks and propose fixes")
    .option(
      "-s, --session <id:string>",
      "Specific session ID (default: latest)",
    )
    .option("-t, --task <id:string>", "Analyze specific task ID only")
    .option("-f, --filter <type:string>", "Filter: compile, test, all", {
      default: "all",
    })
    .option("--dry-run", "Show fixes without applying", { default: false })
    .option(
      "--parallel <n:number>",
      "Max parallel analysis (default: 1 for interactive)",
      { default: 1 },
    )
    .option("--model <model:string>", "LLM for analysis", {
      default: "claude-sonnet-4-5-20250929",
    })
    .option(
      "--shortcomings-dir <dir:string>",
      "Dir for model shortcomings",
      { default: "model-shortcomings" },
    )
    .option(
      "--shortcomings-only",
      "Only track model shortcomings, skip fixes",
      { default: false },
    )
    .option(
      "--fixes-only",
      "Only apply fixes, skip shortcomings tracking",
      { default: false },
    )
    .example(
      "Analyze all failures",
      "centralgauge verify debug/",
    )
    .example(
      "Analyze specific session",
      "centralgauge verify debug/ --session 1765986258980",
    )
    .example(
      "Dry run (no changes)",
      "centralgauge verify debug/ --dry-run",
    )
    .example(
      "Filter by failure type",
      "centralgauge verify debug/ --filter compile",
    )
    .example(
      "Shortcomings only",
      "centralgauge verify debug/ --shortcomings-only",
    )
    .example(
      "Fixes only",
      "centralgauge verify debug/ --fixes-only",
    )
    .action(handleVerify);
}
