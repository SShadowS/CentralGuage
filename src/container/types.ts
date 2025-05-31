export interface ContainerConfig {
  name: string;
  bcVersion: string;
  memoryLimit: string;
  acceptEula: boolean;
  includeAL: boolean;
  includeTestToolkit: boolean;
}

export interface CompilationResult {
  success: boolean;
  errors: CompilationError[];
  warnings: CompilationWarning[];
  output: string;
  duration: number; // milliseconds
  artifactPath?: string; // Path to compiled app file
}

export interface CompilationError {
  code: string;
  message: string;
  file: string;
  line: number;
  column: number;
  severity: "error" | "warning" | "info";
}

export interface CompilationWarning extends CompilationError {
  severity: "warning";
}

export interface TestResult {
  success: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  duration: number; // milliseconds
  results: TestCaseResult[];
  output: string;
}

export interface TestCaseResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

export interface ContainerStatus {
  name: string;
  isRunning: boolean;
  bcVersion?: string;
  uptime?: number;
  health: "healthy" | "unhealthy" | "starting" | "stopped";
}

export interface ALProject {
  path: string;
  appJson: object;
  sourceFiles: string[];
  testFiles: string[];
}