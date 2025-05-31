import type {
  ALProject,
  CompilationResult,
  ContainerConfig,
  ContainerStatus,
  TestResult,
} from "./types.ts";

export interface ContainerProvider {
  readonly name: string;
  readonly platform: "windows" | "linux" | "mock";

  // Container lifecycle
  setup(config: ContainerConfig): Promise<void>;
  start(containerName: string): Promise<void>;
  stop(containerName: string): Promise<void>;
  remove(containerName: string): Promise<void>;
  status(containerName: string): Promise<ContainerStatus>;

  // AL compilation operations
  compileProject(
    containerName: string,
    project: ALProject,
  ): Promise<CompilationResult>;
  runTests(
    containerName: string,
    project: ALProject,
  ): Promise<TestResult>;

  // File operations
  copyToContainer(
    containerName: string,
    localPath: string,
    containerPath: string,
  ): Promise<void>;
  copyFromContainer(
    containerName: string,
    containerPath: string,
    localPath: string,
  ): Promise<void>;

  // Utility operations
  executeCommand(
    containerName: string,
    command: string,
  ): Promise<{ output: string; exitCode: number }>;
  
  // Health checks
  isHealthy(containerName: string): Promise<boolean>;
}