# Code Style Guide

This guide documents the coding conventions used in CentralGauge.

## TypeScript

### Strict Mode

The project uses strict TypeScript settings:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitReturns": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true
  }
}
```

### Type Annotations

Always annotate function return types and complex parameters:

```typescript
// Good
function calculateScore(results: TestResult[]): number {
  return results.filter((r) => r.passed).length / results.length;
}

// Avoid - missing return type
function calculateScore(results: TestResult[]) {
  return results.filter((r) => r.passed).length / results.length;
}
```

### Optional Properties

Use `undefined` explicitly for optional properties:

```typescript
// Good
interface Config {
  name: string;
  timeout?: number | undefined;
}

// Avoid
interface Config {
  name: string;
  timeout?: number;
}
```

### Type Guards

Use discriminated unions with type guards:

```typescript
type Result =
  | { success: true; data: string }
  | { success: false; error: Error };

function isSuccess(r: Result): r is { success: true; data: string } {
  return r.success === true;
}
```

## Imports

### Import Order

```typescript
// 1. Standard library
import { assertEquals } from "@std/assert";
import { parse } from "@std/yaml";

// 2. Type imports from project
import type { LLMConfig, LLMResponse } from "../../src/llm/types.ts";

// 3. Implementation imports from project
import { LLMAdapterRegistry } from "../../src/llm/registry.ts";

// 4. Relative imports
import { helper } from "./utils.ts";
```

### Barrel Exports

Each module has a `mod.ts` with explicit exports:

```typescript
// src/llm/mod.ts

// Types first
export type { LLMAdapter, LLMConfig, LLMResponse } from "./types.ts";

// Then implementations
export { LLMAdapterRegistry } from "./registry.ts";
export { AnthropicAdapter } from "./anthropic-adapter.ts";
```

### Extension-Full Paths

Always include `.ts` extension:

```typescript
// Good
import { helper } from "./utils.ts";

// Bad
import { helper } from "./utils";
```

## Naming

### Files

- Use kebab-case for files: `llm-adapter.ts`, `code-extractor.ts`
- Use `.test.ts` suffix for tests: `registry.test.ts`
- Use `mod.ts` for barrel exports

### Classes and Interfaces

- PascalCase for classes and interfaces
- Descriptive suffixes: `Adapter`, `Provider`, `Registry`, `Config`

```typescript
class AnthropicAdapter {}
interface LLMConfig {}
class ContainerProviderRegistry {}
```

### Functions and Variables

- camelCase for functions and variables
- Verb prefixes for functions: `create`, `get`, `load`, `parse`

```typescript
function createAdapter() {}
function loadTaskManifest() {}
const defaultConfig = {};
```

### Constants

- UPPER_SNAKE_CASE for true constants
- camelCase for configuration objects

```typescript
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_RETRIES = 3;

const defaultConfig = {
  timeout: DEFAULT_TIMEOUT_MS,
  retries: MAX_RETRIES,
};
```

## Console Output

### Colored Output

Use `@std/fmt/colors` with tag prefixes:

```typescript
import * as colors from "@std/fmt/colors";

// Good
console.log(colors.green("[OK]"), "Task completed");
console.log(colors.red("[FAIL]"), "Task failed");
console.log(colors.yellow("[WARN]"), "Warning message");
console.log(colors.blue("[Info]"), "Information");

// Avoid emojis
console.log("✅ Task completed"); // Don't do this
```

### Structured Logging

Use helpers from `cli/helpers/logging.ts`:

```typescript
import { log } from "../helpers/mod.ts";

log.task(`Starting ${taskId}`);
log.llm(model, "Generating code...");
log.compile(model, "success");
log.success("Benchmark complete");
log.fail("Task failed");
```

## Error Handling

### Error Hierarchy

Use the structured error hierarchy:

```typescript
import {
  CentralGaugeError,
  LLMProviderError,
  TaskExecutionError,
} from "../src/errors.ts";

// Good - specific error with context
throw new TaskExecutionError(
  `Compilation failed for ${taskId}`,
  taskId,
  attemptNumber,
  { errors: compilationErrors },
);

// Avoid - generic error
throw new Error("Compilation failed");
```

### Error Checking

```typescript
import { getRetryDelay, isRetryableError } from "../src/errors.ts";

try {
  await operation();
} catch (error) {
  if (error instanceof LLMProviderError && isRetryableError(error)) {
    const delay = getRetryDelay(error, 1000);
    await sleep(delay);
    // Retry
  } else {
    throw error;
  }
}
```

## Async Code

### Async/Await

Always use async/await over raw promises:

```typescript
// Good
async function loadManifest(path: string): Promise<TaskManifest> {
  const content = await Deno.readTextFile(path);
  return parseYaml(content) as TaskManifest;
}

// Avoid
function loadManifest(path: string): Promise<TaskManifest> {
  return Deno.readTextFile(path).then((content) =>
    parseYaml(content) as TaskManifest
  );
}
```

### Async Generators

When using async generators with return values:

```typescript
// Don't use for await...of if you need the return value
async function processGenerator<Y, R>(gen: AsyncGenerator<Y, R>): Promise<R> {
  let result = await gen.next();
  while (!result.done) {
    console.log("Yield:", result.value);
    result = await gen.next();
  }
  return result.value; // Return value captured correctly
}
```

## Functions

### Function Length

Keep functions under 50 lines. Extract helpers:

```typescript
// Good - extracted helpers
async function runBenchmark(options: Options): Promise<Results> {
  const tasks = await loadTasks(options.taskPatterns);
  const models = resolveModels(options.models);
  const results = await executeAll(tasks, models);
  return formatResults(results);
}

// Avoid - monolithic function
async function runBenchmark(options: Options): Promise<Results> {
  // 200 lines of logic...
}
```

### Pure Functions

Prefer pure functions where possible:

```typescript
// Good - pure function
function calculateScore(results: TestResult[]): number {
  return results.filter((r) => r.passed).length / results.length;
}

// Avoid - side effects
function calculateScore(results: TestResult[]): number {
  console.log("Calculating..."); // Side effect
  globalState.lastScore = score; // Side effect
  return score;
}
```

## Classes

### Single Responsibility

Each class should have one primary responsibility:

```typescript
// Good - focused class
class CodeExtractor {
  extract(response: string): string {}
  detectLanguage(code: string): "al" | "diff" {}
}

// Avoid - multiple responsibilities
class TaskProcessor {
  loadTask() {}
  compileCode() {}
  runTests() {}
  formatResults() {}
  sendNotification() {}
}
```

### Dependency Injection

Use constructor injection for dependencies:

```typescript
// Good
class TaskExecutor {
  constructor(
    private llmAdapter: LLMAdapter,
    private containerProvider: ContainerProvider,
  ) {}
}

// Avoid - hard-coded dependencies
class TaskExecutor {
  private llmAdapter = new AnthropicAdapter();
}
```

## Documentation

### JSDoc Comments

Use JSDoc for public APIs:

````typescript
/**
 * Loads a task manifest from a YAML file
 *
 * @param path - Path to the YAML file
 * @returns Parsed task manifest
 * @throws {ValidationError} If the manifest is invalid
 *
 * @example
 * ```typescript
 * const manifest = await loadTaskManifest("tasks/easy/CG-AL-E001.yml");
 * ```
 */
export async function loadTaskManifest(path: string): Promise<TaskManifest> {
  // ...
}
````

### Inline Comments

Use comments for complex logic:

```typescript
// Calculate weighted score:
// - First attempt success: 1.0
// - Second attempt success: 0.8 (penalty for retry)
// - Failed: 0.0
const score = attempt === 1 ? 1.0 : attempt === 2 ? 0.8 : 0.0;
```

## Formatting

### Deno Formatter

Use `deno fmt` with project settings:

```json
{
  "fmt": {
    "useTabs": false,
    "lineWidth": 80,
    "indentWidth": 2,
    "semiColons": true,
    "singleQuote": false,
    "proseWrap": "preserve"
  }
}
```

### Run Before Commit

```bash
deno fmt
deno lint
deno check cli/centralgauge.ts
```

## Testing Style

### Test Names

Use descriptive test names:

```typescript
// Good
Deno.test("LLMAdapter generates AL code when given valid prompt", async () => {});
Deno.test("LLMAdapter throws LLMProviderError when API key is missing", async () => {});

// Avoid
Deno.test("test1", async () => {});
Deno.test("adapter", async () => {});
```

### Test Structure

```typescript
Deno.test("FeatureName", async (t) => {
  // Setup (if needed)
  const mockEnv = new MockEnv();

  try {
    await t.step("handles normal case", async () => {
      // Arrange
      const input = "valid";

      // Act
      const result = await process(input);

      // Assert
      assertEquals(result.success, true);
    });

    await t.step("handles edge case", async () => {
      // ...
    });
  } finally {
    // Cleanup
    mockEnv.restore();
  }
});
```

## File Organization

### Module Structure

```
src/feature/
├── mod.ts           # Barrel exports
├── types.ts         # Interfaces and types
├── registry.ts      # Registry class
├── provider-a.ts    # Implementation A
└── provider-b.ts    # Implementation B
```

### Test Structure

```
tests/
├── unit/
│   └── feature/
│       ├── registry.test.ts
│       └── provider-a.test.ts
├── integration/
│   └── feature-real.test.ts
└── utils/
    └── test-helpers.ts
```

## Next Steps

- [Development Setup](./development.md) - Environment setup
- [Testing Patterns](./testing.md) - Test writing guide
- [Architecture](../architecture/overview.md) - System design
