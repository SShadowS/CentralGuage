export interface TaskManifest {
  id: string;
  prompt_template: string;
  fix_template: string;
  max_attempts: number;
  description: string;
  expected: {
    compile: boolean;
    testApp: string;
  };
  metrics: string[];
}

export interface BenchmarkResult {
  task: string;
  model: string;
  attempts: AttemptResult[];
  pass_attempt: number;
  aggregate_score: number;
}

export interface AttemptResult {
  pass: boolean;
  compileErrors: number;
  tokens: number;
  ms: number;
}

export interface LLMAdapter {
  name: string;
  generateCode(prompt: string, temperature?: number): Promise<string>;
  fixCode(code: string, error: string, template: string): Promise<string>;
}

export interface BenchmarkOptions {
  llms: string[];
  tasks: string[];
  attempts: number;
  outputDir: string;
  temperature?: number;
  maxTokens?: number;
}
