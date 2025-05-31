import type { BenchmarkResult, TaskManifest } from "../../types/index.ts";
import type { LLMResponse } from "../llm/types.ts";
import type { CompilationResult, TestResult } from "../container/types.ts";

export interface TaskExecutionConfig {
  taskManifest: TaskManifest;
  llmModel: string;
  llmProvider: string;
  containerProvider: string;
  containerName: string;
  templateDir: string;
  outputDir: string;
  maxAttempts: number;
  temperature: number;
  maxTokens: number;
}

export interface AttemptResult {
  attempt: number;
  llmResponse: LLMResponse;
  generatedCode: string;
  compilationResult: CompilationResult;
  testResult?: TestResult;
  passed: boolean;
  score: number;
}

export interface TaskExecutionResult {
  taskId: string;
  model: string;
  attempts: AttemptResult[];
  finalResult: "pass" | "fail";
  passAttempt: number; // 0 = never passed, 1 = first attempt, 2 = second attempt
  totalDuration: number;
  aggregateScore: number;
  metadata: {
    templateUsed: string;
    fixTemplateUsed?: string;
    totalTokens: number;
    totalCost: number;
    executionTime: Date;
  };
}

export interface BenchmarkProgress {
  totalTasks: number;
  completedTasks: number;
  currentTask?: string;
  currentModel?: string;
  errors: string[];
  estimatedTimeRemaining?: number;
}

export interface TaskExecutor {
  executeTask(config: TaskExecutionConfig): Promise<TaskExecutionResult>;
  validateTask(manifest: TaskManifest): Promise<string[]>;
}