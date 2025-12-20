/**
 * Agent Cost Tracker
 *
 * Tracks token usage, tool calls, and costs across agent execution turns.
 * Aggregates metrics from Claude Agent SDK message streams.
 */

import type { TokenUsage } from "../llm/types.ts";
import type { AgentCostMetrics, AgentTurn, ToolCallRecord } from "./types.ts";

/**
 * Default cost per 1K tokens (fallback when model costs unknown)
 */
const DEFAULT_COSTS = {
  input: 0.003, // $3/MTok
  output: 0.015, // $15/MTok
};

/**
 * Model-specific costs per 1K tokens
 */
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-5-20250929": { input: 0.003, output: 0.015 },
  "claude-opus-4-5-20251101": { input: 0.015, output: 0.075 },
  "claude-haiku-3-5-20250514": { input: 0.0008, output: 0.004 },
};

/**
 * Tracks costs and metrics during agent execution
 */
export class CostTracker {
  private _turns: AgentTurn[] = [];
  private _currentTurn: Partial<AgentTurn> | null = null;
  private _promptTokens = 0;
  private _completionTokens = 0;
  private _compileAttempts = 0;
  private _testRuns = 0;
  private _model = "";
  private _startTime = Date.now();

  constructor(model?: string) {
    this._model = model ?? "";
  }

  /**
   * Get current turn count
   */
  get turns(): number {
    return this._turns.length;
  }

  /**
   * Get total tokens used
   */
  get totalTokens(): number {
    return this._promptTokens + this._completionTokens;
  }

  /**
   * Start a new turn
   */
  startTurn(): void {
    // Finalize previous turn if exists
    if (this._currentTurn) {
      this.endTurn();
    }

    this._currentTurn = {
      turnNumber: this._turns.length + 1,
      toolCalls: [],
      tokenUsage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
      duration: 0,
    };
  }

  /**
   * End the current turn
   */
  endTurn(): void {
    if (this._currentTurn) {
      const turn = this._currentTurn as AgentTurn;
      turn.duration = Date.now() - this._startTime;
      this._turns.push(turn);
      this._currentTurn = null;
    }
  }

  /**
   * Record token usage from an assistant message
   */
  recordTokenUsage(usage: Partial<TokenUsage>): void {
    if (usage.promptTokens) {
      this._promptTokens += usage.promptTokens;
      if (this._currentTurn?.tokenUsage) {
        this._currentTurn.tokenUsage.promptTokens += usage.promptTokens;
      }
    }
    if (usage.completionTokens) {
      this._completionTokens += usage.completionTokens;
      if (this._currentTurn?.tokenUsage) {
        this._currentTurn.tokenUsage.completionTokens += usage.completionTokens;
      }
    }
    if (this._currentTurn?.tokenUsage) {
      this._currentTurn.tokenUsage.totalTokens =
        (this._currentTurn.tokenUsage.promptTokens ?? 0) +
        (this._currentTurn.tokenUsage.completionTokens ?? 0);
    }
  }

  /**
   * Record a tool call
   */
  recordToolCall(record: ToolCallRecord): void {
    if (this._currentTurn?.toolCalls) {
      this._currentTurn.toolCalls.push(record);
    }

    // Track special tools
    if (
      record.name === "mcp__centralgauge__compile" ||
      record.name === "compile_al"
    ) {
      this._compileAttempts++;
    }
    if (
      record.name === "mcp__centralgauge__test" || record.name === "run_tests"
    ) {
      this._testRuns++;
    }
  }

  /**
   * Record a compile attempt (shorthand)
   */
  recordCompileAttempt(): void {
    this._compileAttempts++;
  }

  /**
   * Record a test run (shorthand)
   */
  recordTestRun(): void {
    this._testRuns++;
  }

  /**
   * Estimate cost based on token usage
   */
  private estimateCost(): number {
    const costs = MODEL_COSTS[this._model] ?? DEFAULT_COSTS;
    return (
      (this._promptTokens / 1000) * costs.input +
      (this._completionTokens / 1000) * costs.output
    );
  }

  /**
   * Get aggregated metrics
   */
  getMetrics(): AgentCostMetrics {
    return {
      turns: this._turns.length,
      promptTokens: this._promptTokens,
      completionTokens: this._completionTokens,
      totalTokens: this._promptTokens + this._completionTokens,
      estimatedCost: this.estimateCost(),
      compileAttempts: this._compileAttempts,
      testRuns: this._testRuns,
    };
  }

  /**
   * Get detailed turn information
   */
  getTurns(): AgentTurn[] {
    return [...this._turns];
  }

  /**
   * Get total duration in milliseconds
   */
  getDuration(): number {
    return Date.now() - this._startTime;
  }

  /**
   * Check if compile attempt limit is reached
   */
  isCompileLimitReached(limit: number): boolean {
    return this._compileAttempts >= limit;
  }

  /**
   * Reset tracker for a new execution
   */
  reset(): void {
    this._turns = [];
    this._currentTurn = null;
    this._promptTokens = 0;
    this._completionTokens = 0;
    this._compileAttempts = 0;
    this._testRuns = 0;
    this._startTime = Date.now();
  }
}
