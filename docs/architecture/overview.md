# Architecture Overview

CentralGauge is designed with a layered architecture that separates concerns and enables extensibility.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              CLI Layer                                   │
│                    (Cliffy Command Framework)                           │
│   ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐     │
│   │  bench  │  │ report  │  │ config  │  │  stats  │  │ verify  │     │
│   └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘     │
└────────│────────────│────────────│────────────│────────────│───────────┘
         │            │            │            │            │
         ▼            ▼            ▼            ▼            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Core Library (src/)                            │
│                                                                          │
│   ┌───────────────┐  ┌───────────────┐  ┌───────────────┐              │
│   │   Parallel    │  │     Tasks     │  │    Agents     │              │
│   │  Orchestrator │  │   Executor    │  │   Executor    │              │
│   └───────┬───────┘  └───────┬───────┘  └───────┬───────┘              │
│           │                  │                  │                       │
│           ▼                  ▼                  ▼                       │
│   ┌───────────────────────────────────────────────────────────┐        │
│   │                      Registries                            │        │
│   │  ┌────────────────┐         ┌────────────────────┐        │        │
│   │  │  LLM Adapter   │         │ Container Provider │        │        │
│   │  │   Registry     │         │     Registry       │        │        │
│   │  └───────┬────────┘         └─────────┬──────────┘        │        │
│   └──────────│────────────────────────────│───────────────────┘        │
│              │                            │                             │
└──────────────│────────────────────────────│─────────────────────────────┘
               │                            │
               ▼                            ▼
┌──────────────────────────┐    ┌──────────────────────────┐
│     LLM Providers        │    │    BC Container          │
│  ┌────────┐ ┌────────┐   │    │  ┌─────────────────┐     │
│  │OpenAI  │ │Anthropic│  │    │  │ bccontainerhelper│    │
│  └────────┘ └────────┘   │    │  └─────────────────┘     │
│  ┌────────┐ ┌────────┐   │    │  ┌─────────────────┐     │
│  │Gemini  │ │OpenRouter│ │    │  │   Docker API    │     │
│  └────────┘ └────────┘   │    │  └─────────────────┘     │
└──────────────────────────┘    └──────────────────────────┘
```

## Layer Responsibilities

### CLI Layer (`cli/`)

The CLI layer handles user interaction:

- **Command parsing** - Uses Cliffy Command framework
- **Input validation** - Validates arguments and options
- **Output formatting** - Formats results for display
- **TUI** - Terminal UI for progress visualization

Key components:
- `cli/centralgauge.ts` - Main entry point
- `cli/commands/` - Individual command implementations
- `cli/helpers/` - Shared utilities (logging, formatting)
- `cli/tui/` - Terminal UI components

### Core Library (`src/`)

The core library contains business logic:

#### Task Execution (`src/tasks/`)

- `loader.ts` - Loads and validates YAML manifests
- `transformer.ts` - Transforms manifests to execution contexts
- `executor-v2.ts` - Executes individual tasks

#### LLM Integration (`src/llm/`)

- `registry.ts` - Adapter registration and pooling
- `types.ts` - Core interfaces (LLMAdapter, LLMResponse)
- Provider adapters: `anthropic-adapter.ts`, `openai-adapter.ts`, etc.
- `code-extractor.ts` - Extracts AL code from responses

#### Container Management (`src/container/`)

- `registry.ts` - Provider registration and auto-detection
- `types.ts` - Core interfaces (ContainerProvider)
- `bc-container-provider.ts` - bccontainerhelper integration
- `docker-container-provider.ts` - Direct Docker API

#### Parallel Execution (`src/parallel/`)

- `orchestrator.ts` - Coordinates parallel benchmark runs
- `llm-work-pool.ts` - Manages LLM request queuing
- `compile-queue.ts` - Serializes compilation requests
- `rate-limiter.ts` - Provider rate limiting

#### Agent System (`src/agents/`)

- `executor.ts` - Executes autonomous agents
- `registry.ts` - Agent configuration management
- `loader.ts` - Loads agent YAML configs
- `types.ts` - Agent interfaces

#### Configuration (`src/config/`)

- `config.ts` - Configuration loading and merging

## Data Flow

### LLM Benchmark Flow

```
1. CLI parses arguments
   │
   ▼
2. Load task manifests from YAML
   │
   ▼
3. Transform to execution contexts
   │
   ▼
4. Orchestrator schedules work items
   │
   ├──────────────────────────────┐
   ▼                              ▼
5. LLM Work Pool             6. Compile Queue
   - Rate limiting               - Sequential execution
   - Request batching            - Container management
   │                              │
   ▼                              ▼
7. LLM Adapter generates    8. Container compiles
   │                              │
   ▼                              ▼
9. Code extractor parses    10. Container runs tests
   │                              │
   └──────────────────────────────┘
                │
                ▼
11. Result aggregation
                │
                ▼
12. Output (JSON, console, reports)
```

### Agent Benchmark Flow

```
1. CLI parses arguments
   │
   ▼
2. Load agent configuration
   │
   ▼
3. Load task manifest
   │
   ▼
4. Agent executor starts
   │
   ├───────────────────────────────┐
   │                               │
   ▼                               ▼
5. MCP Server               6. Agent Container (sandbox)
   - AL Tools                   - Claude Code CLI
   - Compile/Test               - Workspace mapping
   │                               │
   └───────────────────────────────┘
                │
                ▼
7. Iterative loop:
   - Agent generates code
   - MCP tools compile
   - Agent reads errors
   - Agent fixes code
   - Repeat until success/limit
                │
                ▼
8. Result capture
                │
                ▼
9. Output
```

## Key Interfaces

### TaskManifest

Defines a benchmark task:

```typescript
interface TaskManifest {
  id: string;
  description: string;
  prompt_template: string;
  fix_template: string;
  max_attempts: number;
  expected: {
    compile: boolean;
    testApp?: string;
    testCodeunitId?: number;
    mustContain?: string[];
    mustNotContain?: string[];
  };
  metrics: string[];
}
```

### LLMAdapter

Interface for LLM providers:

```typescript
interface LLMAdapter {
  readonly name: string;
  readonly supportedModels: string[];

  configure(config: LLMConfig): void;
  generateCode(request: LLMRequest, context: GenerationContext): Promise<CodeGenerationResult>;
  generateFix(code: string, errors: string[], request: LLMRequest, context: GenerationContext): Promise<CodeGenerationResult>;
  validateConfig(config: LLMConfig): string[];
  estimateCost(promptTokens: number, completionTokens: number): number;
  isHealthy(): Promise<boolean>;
}
```

### ContainerProvider

Interface for BC containers:

```typescript
interface ContainerProvider {
  readonly name: string;

  setup(config: ContainerConfig): Promise<void>;
  start(name: string): Promise<void>;
  stop(name: string): Promise<void>;
  remove(name: string): Promise<void>;
  compile(name: string, projectPath: string): Promise<CompilationResult>;
  runTests(name: string, extensionId: string): Promise<TestResult>;
  status(name: string): Promise<ContainerStatus>;
  isHealthy(name: string): Promise<boolean>;
}
```

## Design Patterns

### Registry Pattern

Both LLM adapters and container providers use the registry pattern:

```typescript
class Registry {
  private static providers = new Map<string, () => Provider>();

  static register(name: string, factory: () => Provider): void;
  static create(name: string): Provider;
  static list(): string[];
  static isAvailable(name: string): boolean;
}
```

Benefits:
- Pluggable providers
- Late binding
- Easy testing with mocks

### Adapter Pool

LLM adapters are pooled for parallel execution:

```typescript
// Acquire from pool
const adapter = LLMAdapterRegistry.acquire("anthropic", config);
try {
  await adapter.generateCode(request, context);
} finally {
  // Return to pool
  LLMAdapterRegistry.release(adapter);
}
```

### Discriminated Unions

Results use discriminated unions for type safety:

```typescript
type Result = SuccessResult | FailureResult;

function isSuccess(r: Result): r is SuccessResult {
  return r.outcome === "success";
}
```

### Configuration Hierarchy

Configuration loads from multiple sources:

1. CLI arguments (highest priority)
2. Environment variables
3. Local config file
4. Home directory config
5. Built-in defaults (lowest priority)

## Module Organization

### Barrel Exports

Each module has a `mod.ts` that exports public interface:

```typescript
// src/llm/mod.ts
export type { LLMConfig, LLMAdapter, LLMResponse } from "./types.ts";
export { LLMAdapterRegistry } from "./registry.ts";
export { AnthropicAdapter } from "./anthropic-adapter.ts";
```

### Import Order

```typescript
// 1. Standard library
import { assertEquals } from "@std/assert";

// 2. Type imports from project
import type { LLMConfig } from "../llm/types.ts";

// 3. Implementation imports
import { LLMAdapterRegistry } from "../llm/registry.ts";

// 4. Relative imports
import { helper } from "./utils.ts";
```

## Error Handling

Errors form a hierarchy with structured context:

```typescript
class CentralGaugeError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {}
}

class TaskExecutionError extends CentralGaugeError { }
class LLMProviderError extends CentralGaugeError { }
class ContainerError extends CentralGaugeError { }
```

See [Error Handling](./error-handling.md) for details.

## Next Steps

- [LLM Adapters](./llm-adapters.md) - Provider integrations
- [Container Providers](./containers.md) - Container management
- [Agent System](./agents.md) - Autonomous execution
