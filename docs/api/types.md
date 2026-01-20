# Core Types Reference

This document provides a detailed reference for all core TypeScript types in CentralGauge.

## Task Types

### TaskManifest

Defines a benchmark task loaded from YAML.

```typescript
interface TaskManifest {
  /** Unique task identifier (e.g., "CG-AL-E001") */
  id: string;

  /** Human-readable task description */
  description: string;

  /** Path to prompt template (relative to templates/) */
  prompt_template: string;

  /** Path to fix template for retry attempts */
  fix_template: string;

  /** Maximum attempts allowed */
  max_attempts: number;

  /** Expected outcomes for evaluation */
  expected: {
    /** Whether code should compile successfully */
    compile: boolean;

    /** Test app path (optional) */
    testApp?: string;

    /** Test codeunit ID for targeted execution */
    testCodeunitId?: number;

    /** Patterns that must appear in generated code */
    mustContain?: string[];

    /** Patterns that must NOT appear */
    mustNotContain?: string[];
  };

  /** Metrics to collect */
  metrics: string[];

  /** Optional metadata */
  metadata?: {
    difficulty?: "easy" | "medium" | "hard";
    category?: string;
    tags?: string[];
    estimatedTokens?: number;
    target?: "Cloud" | "OnPrem";
  };
}
```

### TaskExecutionContext

Internal execution context with enriched data.

```typescript
interface TaskExecutionContext {
  manifest: TaskManifest;
  taskType: TaskType;
  alProjectPath: string;
  targetFile: string;
  instructions: string;

  llmProvider: string;
  llmModel: string;
  variantId: string;
  variantConfig?: VariantConfig;
  containerProvider: string;
  containerName: string;

  promptTemplatePath: string;
  fixTemplatePath: string;

  attemptLimit: number;
  timeout: number;
  temperature: number;
  maxTokens: number;

  outputDir: string;
  debugMode: boolean;

  expectedOutput: {
    type: "al_code" | "diff" | "test_code";
    validation: {
      mustCompile: boolean;
      mustPass?: boolean;
      mustContain?: string[];
      mustNotContain?: string[];
    };
  };

  metadata: {
    difficulty: "easy" | "medium" | "hard";
    category: string;
    tags: string[];
    estimatedTokens: number;
  };
}
```

### TaskExecutionResult

Final execution result.

```typescript
interface TaskExecutionResult {
  taskId: string;
  executionId: string;
  context: TaskExecutionContext;
  attempts: ExecutionAttempt[];
  success: boolean;
  finalCode?: string;
  finalScore: number;
  totalTokensUsed: number;
  totalCost: number;
  totalDuration: number;
  passedAttemptNumber: number;
  successRate: number;
  executedAt: Date;
  executedBy: string;
  environment: Record<string, string>;
}
```

### ExecutionAttempt

Result of a single attempt.

```typescript
interface ExecutionAttempt {
  attemptNumber: number;
  startTime: Date;
  endTime: Date;
  prompt: string;
  llmResponse: LLMResponse;
  extractedCode: string;
  codeLanguage: "al" | "diff";
  compilationResult?: CompilationResult;
  testResult?: TestResult;
  success: boolean;
  score: number;
  failureReasons: string[];
  tokensUsed: number;
  cost: number;
  duration: number;
  llmDuration?: number;
  compileDuration?: number;
  testDuration?: number;
}
```

## LLM Types

### LLMConfig

LLM provider configuration.

```typescript
interface LLMConfig {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;

  // Azure OpenAI specific
  deploymentName?: string;
  apiVersion?: string;

  // OpenRouter specific
  siteUrl?: string;
  siteName?: string;

  // Extended thinking / reasoning
  thinkingBudget?: number | string;

  // Continuation settings
  continuation?: ContinuationConfig;
}
```

### LLMRequest

Request to an LLM.

```typescript
interface LLMRequest {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
}
```

### LLMResponse

Response from an LLM.

```typescript
interface LLMResponse {
  content: string;
  model: string;
  usage: TokenUsage;
  duration: number;
  finishReason: "stop" | "length" | "content_filter" | "error";
}
```

### TokenUsage

Token usage statistics.

```typescript
interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost?: number;
}
```

### CodeGenerationResult

Result of code generation.

```typescript
interface CodeGenerationResult {
  code: string;
  language: "al" | "diff";
  response: LLMResponse;
  extractedFromDelimiters: boolean;
}
```

## Container Types

### ContainerConfig

Container configuration.

```typescript
interface ContainerConfig {
  name: string;
  bcVersion: string;
  memoryLimit: string;
  acceptEula: boolean;
  includeAL: boolean;
  includeTestToolkit: boolean;
  credentials?: ContainerCredentials;
}

interface ContainerCredentials {
  username: string;
  password: string;
}
```

### CompilationResult

Result of AL compilation.

```typescript
interface CompilationResult {
  success: boolean;
  errors: CompilationError[];
  warnings: CompilationWarning[];
  output: string;
  duration: number;
  artifactPath?: string;
}

interface CompilationError {
  code: string;
  message: string;
  file: string;
  line: number;
  column: number;
  severity: "error" | "warning" | "info";
}
```

### TestResult

Result of test execution.

```typescript
interface TestResult {
  success: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  duration: number;
  results: TestCaseResult[];
  output: string;
}

interface TestCaseResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}
```

### ContainerStatus

Container status information.

```typescript
interface ContainerStatus {
  name: string;
  isRunning: boolean;
  bcVersion?: string;
  uptime?: number;
  health: "healthy" | "unhealthy" | "starting" | "stopped";
}
```

## Agent Types

### AgentConfig

Agent configuration.

```typescript
interface AgentConfig {
  id: string;
  name: string;
  description?: string;
  model: string;
  maxTurns: number;
  maxTokens?: number;
  workingDir?: string;
  settingSources?: ("user" | "project")[];
  allowedTools: string[];
  mcpServers?: Record<string, MCPServerConfig>;
  systemPrompt?: SystemPromptConfig;
  promptTemplate?: "universal" | "legacy";
  toolNaming?: "generic" | "mcp";
  limits?: AgentLimits;
  sandbox?: SandboxModeConfig;
  extends?: string;
  tags?: string[];
}

interface AgentLimits {
  maxCompileAttempts?: number;
  timeoutMs?: number;
}

type SystemPromptConfig =
  | string
  | { preset: "claude_code"; append?: string };
```

### AgentExecutionResult

Result of agent execution.

```typescript
interface AgentExecutionResult {
  taskId: string;
  agentId: string;
  executionId: string;
  success: boolean;
  finalCode?: string;
  turns: AgentTurn[];
  metrics: AgentCostMetrics;
  terminationReason: TerminationReason;
  duration: number;
  executedAt: Date;
  testResult?: TestResult;
  resultSummary?: ParsedTaskResult;
  failureDetails?: DetailedFailureReason;
}

type TerminationReason =
  | "success"
  | "max_turns"
  | "max_tokens"
  | "max_compile_attempts"
  | "test_failure"
  | "timeout"
  | "error";
```

### AgentCostMetrics

Cost metrics for agent execution.

```typescript
interface AgentCostMetrics {
  turns: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  compileAttempts: number;
  testRuns: number;
}
```

## Configuration Types

### CentralGaugeConfig

Main configuration structure.

```typescript
interface CentralGaugeConfig {
  defaultModels?: {
    benchmark?: string[];
    development?: string[];
    comparison?: string[];
  };

  llm?: {
    temperature?: number;
    maxTokens?: number;
    timeout?: number;
  };

  benchmark?: {
    attempts?: number;
    outputDir?: string;
    templateDir?: string;
  };

  container?: {
    provider?: string;
    name?: string;
    bcVersion?: string;
    memoryLimit?: string;
    credentials?: {
      username?: string;
      password?: string;
    };
  };

  debug?: {
    enabled?: boolean;
    outputDir?: string;
    logLevel?: "basic" | "detailed" | "verbose";
  };

  systemPrompts?: Record<string, SystemPromptDefinition>;
  variantProfiles?: Record<string, VariantProfile>;
}
```

## Variant Types

### ModelVariant

Model with variant configuration.

```typescript
interface ModelVariant {
  provider: string;
  model: string;
  variantId: string;
  config?: VariantConfig;
}

interface VariantConfig {
  temperature?: number;
  maxTokens?: number;
  systemPromptName?: string;
  thinkingBudget?: number;
  timeout?: number;
  profile?: string;
}
```

## Error Types

### Error Hierarchy

```typescript
class CentralGaugeError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>,
  );
}

class TaskExecutionError extends CentralGaugeError {
  constructor(
    message: string,
    public readonly taskId: string,
    public readonly attemptNumber?: number,
    context?: Record<string, unknown>,
  );
}

class LLMProviderError extends CentralGaugeError {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly isRetryable: boolean,
    public readonly retryAfterMs?: number,
    context?: Record<string, unknown>,
  );
}

class ContainerError extends CentralGaugeError {
  constructor(
    message: string,
    public readonly containerName: string,
    public readonly operation:
      | "setup"
      | "start"
      | "stop"
      | "compile"
      | "test"
      | "health",
    context?: Record<string, unknown>,
  );
}
```

## Prompt Types

### CLIPromptOverrides

CLI options for prompt customization including knowledge bank.

```typescript
interface CLIPromptOverrides {
  /** System prompt override */
  systemPrompt?: string;

  /** Prefix override */
  prefix?: string;

  /** Suffix override */
  suffix?: string;

  /** Which stage these apply to (default: both) */
  stage?: InjectionStage | "both";

  /** Which provider these apply to (default: all) */
  provider?: string;

  /** Pre-loaded knowledge bank content to prepend to system prompt */
  knowledgeContent?: string;

  /** Custom run label for results/reports */
  runLabel?: string;
}

type InjectionStage = "generation" | "fix";
```

### KnowledgeLoadOptions

Options for loading knowledge files.

```typescript
interface KnowledgeLoadOptions {
  /** Specific files to load */
  files?: string[];

  /** Directory to load all .md files from */
  directory?: string;
}
```

### ResolvedPromptInjection

Result of resolving prompt injections from all config levels.

```typescript
interface ResolvedPromptInjection {
  /** Resolved system prompt */
  system?: string;

  /** Resolved prefix */
  prefix?: string;

  /** Resolved suffix */
  suffix?: string;
}
```

## See Also

- [API Index](./index.md) - Module overview
- [Architecture](../architecture/overview.md) - System design
- [LLM Adapters](../architecture/llm-adapters.md) - LLM integration
- [bench Command - Knowledge Bank](../cli/bench.md#knowledge-bank-options) - CLI usage
