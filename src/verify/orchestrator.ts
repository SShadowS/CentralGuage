/**
 * Orchestrator for parallel verification of failing tasks
 * Coordinates analysis, fix application, and shortcomings tracking
 */

import * as colors from "@std/fmt/colors";
import type {
  AnalysisResult,
  FailingTask,
  SuggestedFix,
  VerificationSummary,
  VerifyEvent,
  VerifyEventListener,
  VerifyMode,
  VerifyOptions,
} from "./types.ts";
import { isFixableResult, isModelShortcomingResult } from "./types.ts";
import { type AnalyzerConfig, FailureAnalyzer } from "./analyzer.ts";
import { ShortcomingsTracker } from "./shortcomings-tracker.ts";
import { applyFix, generateDiffPreview } from "./fix-applicator.ts";

/**
 * User response to a fix prompt
 */
export type FixPromptResponse = "apply" | "skip" | "quit";

/**
 * Interactive prompt callback type
 */
export type InteractivePromptFn = (
  result: AnalysisResult,
  fix: SuggestedFix,
  diffPreview: string,
) => Promise<FixPromptResponse>;

/**
 * Orchestrator configuration
 */
export interface OrchestratorConfig {
  /** Maximum parallel analysis tasks */
  maxParallel: number;
  /** Analyzer configuration */
  analyzerConfig: Partial<AnalyzerConfig>;
  /** Directory for shortcomings files */
  shortcomingsDir: string;
  /** Dry run mode - don't apply fixes */
  dryRun: boolean;
  /** Interactive callback for fix prompts */
  interactivePrompt?: InteractivePromptFn;
  /** Mode: run both, shortcomings only, or fixes only */
  mode: VerifyMode;
}

/**
 * Default orchestrator configuration
 */
const DEFAULT_CONFIG: OrchestratorConfig = {
  maxParallel: 1, // Sequential by default for interactive mode
  analyzerConfig: {},
  shortcomingsDir: "model-shortcomings",
  dryRun: false,
  mode: "all",
};

/**
 * Verify orchestrator for coordinating parallel analysis
 */
export class VerifyOrchestrator {
  private config: OrchestratorConfig;
  private listeners: VerifyEventListener[] = [];
  private analyzer: FailureAnalyzer;
  private shortcomingsTracker: ShortcomingsTracker;
  private shouldQuit = false;

  constructor(config?: Partial<OrchestratorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.analyzer = new FailureAnalyzer(this.config.analyzerConfig);
    this.shortcomingsTracker = new ShortcomingsTracker(
      this.config.shortcomingsDir,
    );
  }

  /**
   * Subscribe to verification events
   */
  on(listener: VerifyEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx !== -1) {
        this.listeners.splice(idx, 1);
      }
    };
  }

  /**
   * Emit an event to all listeners
   */
  private emit(event: VerifyEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("[ERROR] Event listener error:", error);
      }
    }
  }

  /**
   * Run verification on all failing tasks
   */
  async runVerification(
    failingTasks: FailingTask[],
    _options: VerifyOptions,
  ): Promise<VerificationSummary> {
    const summary: VerificationSummary = {
      totalAnalyzed: 0,
      fixableIssues: 0,
      fixesApplied: 0,
      fixesSkipped: 0,
      modelShortcomings: new Map(),
      errors: [],
    };

    this.shouldQuit = false;
    this.emit({ type: "started", totalTasks: failingTasks.length });

    // Process tasks with concurrency control
    const queue = [...failingTasks];
    const inProgress = new Set<Promise<void>>();

    while ((queue.length > 0 || inProgress.size > 0) && !this.shouldQuit) {
      // Fill up to maxParallel
      while (
        queue.length > 0 &&
        inProgress.size < this.config.maxParallel &&
        !this.shouldQuit
      ) {
        const task = queue.shift()!;
        const promise = this.processTask(task, summary).finally(() => {
          inProgress.delete(promise);
        });
        inProgress.add(promise);
      }

      // Wait for at least one to complete
      if (inProgress.size > 0) {
        await Promise.race(inProgress);
      }
    }

    // Save shortcomings
    await this.shortcomingsTracker.save();

    this.emit({ type: "complete", summary });
    return summary;
  }

  /**
   * Process a single task
   */
  private async processTask(
    task: FailingTask,
    summary: VerificationSummary,
  ): Promise<void> {
    this.emit({ type: "analyzing", taskId: task.taskId, model: task.model });

    try {
      const result = await this.analyzer.analyzeTask(task);
      summary.totalAnalyzed++;

      this.emit({ type: "analysis_complete", result });

      if (isFixableResult(result)) {
        summary.fixableIssues++;
        // In shortcomings-only mode, skip fixes
        if (this.config.mode !== "shortcomings-only") {
          await this.handleFixableResult(result, summary);
        } else {
          summary.fixesSkipped++;
          this.emit({ type: "fix_skipped", taskId: result.taskId });
        }
      } else if (isModelShortcomingResult(result)) {
        // In fixes-only mode, skip shortcomings
        if (this.config.mode !== "fixes-only") {
          await this.handleShortcoming(result, summary);
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      summary.errors.push(`${task.taskId}: ${errorMsg}`);
      this.emit({ type: "error", taskId: task.taskId, error: errorMsg });
    }
  }

  /**
   * Handle a fixable analysis result
   */
  private async handleFixableResult(
    result: AnalysisResult & { outcome: "fixable" },
    summary: VerificationSummary,
  ): Promise<void> {
    const fix = result.fix;
    this.emit({ type: "fix_proposed", taskId: result.taskId, fix });

    if (this.config.dryRun) {
      summary.fixesSkipped++;
      this.emit({ type: "fix_skipped", taskId: result.taskId });
      return;
    }

    // Generate diff preview
    const diffPreview = generateDiffPreview(fix);

    // Get user response via interactive prompt
    let response: FixPromptResponse = "skip";

    if (this.config.interactivePrompt) {
      response = await this.config.interactivePrompt(result, fix, diffPreview);
    }

    if (response === "quit") {
      this.shouldQuit = true;
      summary.fixesSkipped++;
      this.emit({ type: "fix_skipped", taskId: result.taskId });
      return;
    }

    if (response === "apply") {
      try {
        const success = await applyFix(fix);
        if (success) {
          summary.fixesApplied++;
          this.emit({
            type: "fix_applied",
            taskId: result.taskId,
            success: true,
          });
        } else {
          summary.fixesSkipped++;
          this.emit({
            type: "fix_applied",
            taskId: result.taskId,
            success: false,
          });
        }
      } catch (error) {
        summary.errors.push(
          `Failed to apply fix for ${result.taskId}: ${error}`,
        );
        summary.fixesSkipped++;
        this.emit({
          type: "fix_applied",
          taskId: result.taskId,
          success: false,
        });
      }
    } else {
      summary.fixesSkipped++;
      this.emit({ type: "fix_skipped", taskId: result.taskId });
    }
  }

  /**
   * Handle a model shortcoming result
   */
  private async handleShortcoming(
    result: AnalysisResult & { outcome: "model_shortcoming" },
    summary: VerificationSummary,
  ): Promise<void> {
    await this.shortcomingsTracker.addShortcoming(result.model, result);
    // Save immediately so we don't lose data if process is interrupted
    await this.shortcomingsTracker.saveModel(result.model);

    const currentCount = summary.modelShortcomings.get(result.model) || 0;
    summary.modelShortcomings.set(result.model, currentCount + 1);

    this.emit({
      type: "shortcoming_logged",
      taskId: result.taskId,
      model: result.model,
      concept: result.concept,
    });
  }

  /**
   * Get the shortcomings tracker for external access
   */
  getShortcomingsTracker(): ShortcomingsTracker {
    return this.shortcomingsTracker;
  }
}

/**
 * Default console-based interactive prompt
 */
export async function defaultInteractivePrompt(
  result: AnalysisResult,
  fix: SuggestedFix,
  diffPreview: string,
): Promise<FixPromptResponse> {
  if (!isFixableResult(result)) return "skip";

  console.log();
  console.log(colors.bold(`Task: ${result.taskId}`));
  console.log(colors.yellow(`Category: ${result.category}`));
  console.log(`Description: ${result.description}`);
  console.log();
  console.log(colors.cyan(`Suggested Fix (${fix.fileType}):`));
  console.log(fix.description);
  console.log();
  console.log(colors.gray("Diff preview:"));
  console.log(diffPreview);
  console.log();

  // Use Deno.stdin for interactive prompt
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  await Deno.stdout.write(
    encoder.encode(colors.bold("[A]pply, [S]kip, [Q]uit: ")),
  );

  const buf = new Uint8Array(1024);
  const n = await Deno.stdin.read(buf);
  if (n === null) return "skip";

  const input = decoder.decode(buf.subarray(0, n)).trim().toLowerCase();

  switch (input) {
    case "a":
    case "apply":
      return "apply";
    case "q":
    case "quit":
      return "quit";
    default:
      return "skip";
  }
}

/**
 * Create a verify orchestrator with default settings
 */
export function createVerifyOrchestrator(
  options: VerifyOptions,
): VerifyOrchestrator {
  const config: Partial<OrchestratorConfig> = {
    maxParallel: options.parallel,
    analyzerConfig: {
      model: options.model,
    },
    shortcomingsDir: options.shortcomingsDir,
    dryRun: options.dryRun,
    mode: options.mode,
  };

  // Only add interactivePrompt if not in dry-run mode and not in shortcomings-only mode
  if (!options.dryRun && options.mode !== "shortcomings-only") {
    config.interactivePrompt = defaultInteractivePrompt;
  }

  return new VerifyOrchestrator(config);
}
