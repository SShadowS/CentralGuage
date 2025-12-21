/**
 * Agent Types for CentralGauge
 *
 * Defines configuration and result interfaces for Claude Agent SDK integration.
 * Agents run autonomously until success or resource limits, unlike LLM adapters
 * which make single API calls.
 */

import type { TokenUsage } from "../llm/types.ts";

// =============================================================================
// Agent Configuration Types
// =============================================================================

/**
 * System prompt configuration - either custom string or Claude Code preset
 */
export type SystemPromptConfig =
  | string // Fully custom system prompt
  | {
    preset: "claude_code"; // Use Claude Code's built-in system prompt
    append?: string; // Optional text to append
  };

/**
 * MCP server configuration for additional tools
 */
export interface MCPServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

/**
 * Execution limits for agent runs
 */
export interface AgentLimits {
  /** Maximum compilation attempts before giving up */
  maxCompileAttempts?: number;
  /** Overall timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Complete agent configuration as loaded from YAML
 */
export interface AgentConfig {
  /** Unique agent identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Description of what this agent does */
  description?: string;

  /** Model to use (preset alias or provider/model) */
  model: string;

  /** Maximum conversation turns */
  maxTurns: number;

  /** Maximum total tokens across all turns */
  maxTokens?: number;

  // Claude Code features
  /** Project directory with CLAUDE.md, skills, .mcp.json */
  workingDir?: string;

  /** What settings to load: 'user' (~/.claude/) and/or 'project' (workingDir) */
  settingSources?: ("user" | "project")[];

  /** Tools the agent can use (include 'Skill' for skills) */
  allowedTools: string[];

  /** Additional MCP servers (merged with defaults) */
  mcpServers?: Record<string, MCPServerConfig>;

  /** System prompt configuration */
  systemPrompt?: SystemPromptConfig;

  /** Execution limits */
  limits?: AgentLimits;

  /** Parent agent to inherit from */
  extends?: string;

  /** Tags for filtering/grouping */
  tags?: string[];
}

// =============================================================================
// Agent Execution Types
// =============================================================================

/**
 * Record of a single tool call during execution
 */
export interface ToolCallRecord {
  /** Tool name (e.g., "Read", "mcp__centralgauge__compile") */
  name: string;
  /** Tool input arguments */
  input: Record<string, unknown>;
  /** Tool output/result */
  output?: string;
  /** Duration in milliseconds */
  duration: number;
  /** Whether the tool call succeeded */
  success: boolean;
}

/**
 * Metrics for a single agent turn
 */
export interface AgentTurn {
  /** Turn number (1-indexed) */
  turnNumber: number;
  /** Tool calls made during this turn */
  toolCalls: ToolCallRecord[];
  /** Token usage for this turn */
  tokenUsage: TokenUsage;
  /** Duration in milliseconds */
  duration: number;
}

/**
 * Aggregated cost metrics across all agent turns
 */
export interface AgentCostMetrics {
  /** Total number of turns */
  turns: number;
  /** Total prompt tokens */
  promptTokens: number;
  /** Total completion tokens */
  completionTokens: number;
  /** Total tokens (prompt + completion) */
  totalTokens: number;
  /** Estimated cost in USD */
  estimatedCost: number;
  /** Number of compilation attempts */
  compileAttempts: number;
  /** Number of test runs */
  testRuns: number;
}

/**
 * Why the agent execution terminated
 */
export type TerminationReason =
  | "success" // Task completed successfully
  | "max_turns" // Reached maximum turns limit
  | "max_tokens" // Reached token budget limit
  | "max_compile_attempts" // Reached compilation attempt limit
  | "test_failure" // Tests failed during verification
  | "timeout" // Execution timed out
  | "error"; // Unrecoverable error occurred

/**
 * Result of executing a single task with an agent
 */
export interface AgentExecutionResult {
  /** Task ID that was executed */
  taskId: string;

  /** Agent ID that executed the task */
  agentId: string;

  /** Unique execution identifier */
  executionId: string;

  /** Whether the task was completed successfully */
  success: boolean;

  /** Final generated code (if successful) */
  finalCode?: string;

  /** Detailed per-turn information */
  turns: AgentTurn[];

  /** Aggregated metrics */
  metrics: AgentCostMetrics;

  /** Why execution terminated */
  terminationReason: TerminationReason;

  /** Total duration in milliseconds */
  duration: number;

  /** When execution started */
  executedAt: Date;
}

// =============================================================================
// Agent Execution Options
// =============================================================================

/**
 * Options for executing an agent on a task
 */
export interface AgentExecutionOptions {
  /** Project directory for task execution */
  projectDir: string;

  /** BC container name to use */
  containerName: string;

  /** Container provider to use */
  containerProvider: string;

  /** Enable debug logging */
  debug?: boolean;

  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
}

// =============================================================================
// Agent Registry Types
// =============================================================================

/**
 * Agent configuration with resolved inheritance
 */
export interface ResolvedAgentConfig extends AgentConfig {
  /** Chain of extended configs (for debugging) */
  _inheritanceChain?: string[];
}

/**
 * Validation result for agent configuration
 */
export interface AgentValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
