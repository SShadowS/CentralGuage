/**
 * Container Module
 *
 * Provides container management for BC (Business Central) environments
 * including compilation and test execution.
 */

// Types
export type {
  ALProject,
  CompilationError,
  CompilationResult,
  CompilationWarning,
  ContainerConfig,
  ContainerCredentials,
  ContainerStatus,
  TestCaseResult,
  TestResult,
} from "./types.ts";

// Interface
export type { ContainerProvider } from "./interface.ts";

// Registry
export { ContainerProviderRegistry } from "./registry.ts";

// Providers
export { BcContainerProvider } from "./bc-container-provider.ts";
export { DockerContainerProvider } from "./docker-container-provider.ts";
export { MockContainerProvider } from "./mock-provider.ts";
