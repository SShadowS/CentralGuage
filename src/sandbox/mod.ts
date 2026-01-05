/**
 * Sandbox Module
 *
 * Provides container-based sandboxing for running AI agents
 * in isolated, reproducible environments.
 */

// Types
export type {
  ExecResult,
  Sandbox,
  SandboxAgentOptions,
  SandboxAgentResult,
  SandboxConfig,
  SandboxProvider,
  SandboxStatus,
} from "./types.ts";

// Providers
export { WindowsSandboxProvider } from "./windows-provider.ts";

// Default image constants
export const DEFAULT_SANDBOX_IMAGE =
  "centralgauge/agent-sandbox:windows-latest";
export const DEFAULT_MCP_PORT = 3100;
