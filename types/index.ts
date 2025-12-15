/**
 * CentralGauge Public API Types
 *
 * This module re-exports types from internal modules to provide a clean public API.
 * Import from here for external usage; internal code should import from source modules.
 */

// =============================================================================
// Task Types (from src/tasks/interfaces.ts)
// =============================================================================
export type {
  ExecutionAttempt,
  TaskExecutionContext,
  TaskExecutionRequest,
  TaskExecutionResult,
  TaskManifest,
  TaskType,
  TaskValidationResult,
} from "../src/tasks/interfaces.ts";

// =============================================================================
// LLM Types (from src/llm/types.ts)
// =============================================================================
export type {
  CodeGenerationResult,
  GenerationContext,
  LLMAdapter,
  LLMConfig,
  LLMRequest,
  LLMResponse,
  TokenUsage,
} from "../src/llm/types.ts";

// =============================================================================
// Container Types (from src/container/types.ts)
// =============================================================================
export type {
  ALProject,
  CompilationError,
  CompilationResult,
  CompilationWarning,
  ContainerConfig,
  ContainerStatus,
  TestCaseResult,
  TestResult,
} from "../src/container/types.ts";

// =============================================================================
// Container Provider Interface (from src/container/interface.ts)
// =============================================================================
export type { ContainerProvider } from "../src/container/interface.ts";

// =============================================================================
// Legacy Types (for backward compatibility)
// These are deprecated and will be removed in a future version
// =============================================================================

/**
 * @deprecated Use TaskExecutionResult instead
 */
export interface BenchmarkResult {
  task: string;
  model: string;
  attempts: AttemptResult[];
  pass_attempt: number;
  aggregate_score: number;
}

/**
 * @deprecated Use ExecutionAttempt instead
 */
export interface AttemptResult {
  pass: boolean;
  compileErrors: number;
  tokens: number;
  ms: number;
}

// =============================================================================
// CLI Options (specific to CLI, not re-exported from elsewhere)
// =============================================================================
export interface BenchmarkOptions {
  llms: string[];
  tasks: string[];
  attempts: number;
  outputDir: string;
  temperature?: number;
  maxTokens?: number;
  debug?: boolean;
  debugOutputDir?: string;
  debugLogLevel?: "basic" | "detailed" | "verbose";
}

// =============================================================================
// Legacy Executor Types (for backward compatibility with DefaultTaskExecutor)
// =============================================================================
export type {
  AttemptResult as LegacyAttemptResult,
  BenchmarkProgress,
  LegacyTaskExecutionResult,
  TaskExecutionConfig,
  TaskExecutor,
} from "../src/tasks/interfaces.ts";
