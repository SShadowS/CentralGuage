/**
 * Agent Module Exports
 *
 * Provides Claude Agent SDK integration for CentralGauge benchmarking.
 */

// Types
export type {
  AgentConfig,
  AgentCostMetrics,
  AgentExecutionOptions,
  AgentExecutionResult,
  AgentLimits,
  AgentTurn,
  AgentValidationResult,
  MCPServerConfig,
  ResolvedAgentConfig,
  SystemPromptConfig,
  TerminationReason,
  ToolCallRecord,
} from "./types.ts";

// Registry
export { AgentRegistry } from "./registry.ts";

// Loader
export {
  getAgentDisplayName,
  getAgentIdFromPath,
  loadAgentConfig,
  loadAgentConfigs,
  resolveAgentInheritance,
  validateAgentConfig,
} from "./loader.ts";

// Executor
export { AgentTaskExecutor } from "./executor.ts";

// Cost Tracker
export { CostTracker } from "./cost-tracker.ts";
