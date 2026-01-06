# LLM Adapters

LLM adapters provide a unified interface to different LLM providers. Each adapter handles provider-specific authentication, request formatting, and response parsing.

## Adapter Registry

The `LLMAdapterRegistry` manages adapter creation and pooling:

```typescript
import { LLMAdapterRegistry } from "../src/llm/registry.ts";

// Create an adapter
const adapter = LLMAdapterRegistry.create("anthropic", {
  provider: "anthropic",
  model: "claude-sonnet-4-20250514",
  apiKey: Deno.env.get("ANTHROPIC_API_KEY"),
});

// List available adapters
const adapters = LLMAdapterRegistry.list();
// ["mock", "openai", "anthropic", "gemini", "azure-openai", "local", "openrouter"]
```

## Available Adapters

| Adapter | Provider | Models |
|---------|----------|--------|
| `anthropic` | Anthropic | Claude 4.5 Opus, Claude 4 Sonnet |
| `openai` | OpenAI | GPT-5, GPT-4o, o3, o1 |
| `gemini` | Google | Gemini 3 Pro, Gemini 2 Flash |
| `azure-openai` | Azure | Azure OpenAI deployments |
| `openrouter` | OpenRouter | 200+ models |
| `local` | Local | Ollama, vLLM, etc. |
| `mock` | Testing | Deterministic mock responses |

## Adapter Interface

All adapters implement the `LLMAdapter` interface:

```typescript
interface LLMAdapter {
  // Identification
  readonly name: string;
  readonly supportedModels: string[];

  // Configuration
  configure(config: LLMConfig): void;
  validateConfig(config: LLMConfig): string[];

  // Code generation
  generateCode(
    request: LLMRequest,
    context: GenerationContext
  ): Promise<CodeGenerationResult>;

  // Fix generation (for retry attempts)
  generateFix(
    originalCode: string,
    errors: string[],
    request: LLMRequest,
    context: GenerationContext
  ): Promise<CodeGenerationResult>;

  // Utilities
  estimateCost(promptTokens: number, completionTokens: number): number;
  isHealthy(): Promise<boolean>;
}
```

## Configuration

### LLMConfig

```typescript
interface LLMConfig {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;

  // Azure specific
  deploymentName?: string;
  apiVersion?: string;

  // OpenRouter specific
  siteUrl?: string;
  siteName?: string;

  // Extended thinking
  thinkingBudget?: number | string;
}
```

### Provider-Specific Configuration

#### Anthropic

```typescript
const config: LLMConfig = {
  provider: "anthropic",
  model: "claude-sonnet-4-20250514",
  apiKey: Deno.env.get("ANTHROPIC_API_KEY"),
  temperature: 0.1,
  maxTokens: 4000,
  thinkingBudget: 50000, // Extended thinking tokens
};
```

#### OpenAI

```typescript
const config: LLMConfig = {
  provider: "openai",
  model: "gpt-4o",
  apiKey: Deno.env.get("OPENAI_API_KEY"),
  temperature: 0.1,
  maxTokens: 4000,
};
```

#### Azure OpenAI

```typescript
const config: LLMConfig = {
  provider: "azure-openai",
  model: "gpt-4",
  apiKey: Deno.env.get("AZURE_OPENAI_API_KEY"),
  baseUrl: "https://your-resource.openai.azure.com/",
  deploymentName: "gpt-4-deployment",
  apiVersion: "2024-02-01",
};
```

#### OpenRouter

```typescript
const config: LLMConfig = {
  provider: "openrouter",
  model: "anthropic/claude-4.5-opus",
  apiKey: Deno.env.get("OPENROUTER_API_KEY"),
  siteUrl: "https://your-site.com",
  siteName: "Your App Name",
};
```

## Adapter Pooling

For parallel execution, adapters are pooled:

```typescript
// Acquire adapter (creates or reuses from pool)
const adapter = LLMAdapterRegistry.acquire("anthropic", config);

try {
  const result = await adapter.generateCode(request, context);
  return result;
} finally {
  // Return to pool for reuse
  LLMAdapterRegistry.release(adapter);
}
```

### Pool Management

```typescript
// Get pool statistics
const stats = LLMAdapterRegistry.getPoolStats();
// { total: 5, inUse: 2, available: 3, byProvider: Map }

// Configure pool limits
LLMAdapterRegistry.configurePool({
  maxSize: 50,        // Maximum pooled adapters
  maxIdleMs: 300000,  // 5 minute idle timeout
});

// Clear pool (for testing)
LLMAdapterRegistry.clearPool();
```

## Request/Response Types

### LLMRequest

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

```typescript
interface LLMResponse {
  content: string;
  model: string;
  usage: TokenUsage;
  duration: number;  // milliseconds
  finishReason: "stop" | "length" | "content_filter" | "error";
}

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost?: number;  // USD
}
```

### CodeGenerationResult

```typescript
interface CodeGenerationResult {
  code: string;
  language: "al" | "diff";
  response: LLMResponse;
  extractedFromDelimiters: boolean;
}
```

## Code Extraction

The `CodeExtractor` parses AL code from LLM responses:

```typescript
import { CodeExtractor } from "../src/llm/code-extractor.ts";

const result = CodeExtractor.extract(response.content);
// Returns: { code: "table 70000 ...", language: "al", ... }
```

Extraction rules:
1. Look for \`\`\`al code blocks
2. Fall back to \`\`\` generic code blocks
3. Fall back to full response content

## Streaming Support

Some adapters support streaming responses:

```typescript
interface StreamingLLMAdapter extends LLMAdapter {
  readonly supportsStreaming: boolean;

  generateCodeStream(
    request: LLMRequest,
    context: GenerationContext,
    options?: StreamOptions
  ): AsyncGenerator<StreamChunk, StreamResult>;
}

// Check if adapter supports streaming
if (isStreamingAdapter(adapter)) {
  for await (const chunk of adapter.generateCodeStream(request, context)) {
    console.log(chunk.text);
  }
}
```

## Extended Thinking / Reasoning

For reasoning models, configure thinking budget:

### Claude (Extended Thinking)

```typescript
const config: LLMConfig = {
  provider: "anthropic",
  model: "claude-opus-4-5-20251101",
  thinkingBudget: 50000,  // Token budget for thinking
};
```

### OpenAI (Reasoning Effort)

```typescript
const config: LLMConfig = {
  provider: "openai",
  model: "o3",
  thinkingBudget: "high",  // "low" | "medium" | "high"
};
```

## Creating Custom Adapters

To add a new provider:

### 1. Create Adapter Class

```typescript
// src/llm/my-adapter.ts
import type { LLMAdapter, LLMConfig, LLMRequest, LLMResponse } from "./types.ts";

export class MyAdapter implements LLMAdapter {
  readonly name = "my-provider";
  readonly supportedModels = ["model-a", "model-b"];

  private config?: LLMConfig;

  configure(config: LLMConfig): void {
    this.config = config;
  }

  async generateCode(request: LLMRequest, context: GenerationContext): Promise<CodeGenerationResult> {
    // Implementation
  }

  async generateFix(code: string, errors: string[], request: LLMRequest, context: GenerationContext): Promise<CodeGenerationResult> {
    // Implementation
  }

  validateConfig(config: LLMConfig): string[] {
    const errors: string[] = [];
    if (!config.apiKey) {
      errors.push("API key is required");
    }
    return errors;
  }

  estimateCost(promptTokens: number, completionTokens: number): number {
    // Pricing calculation
    return (promptTokens * 0.001 + completionTokens * 0.002) / 1000;
  }

  async isHealthy(): Promise<boolean> {
    // Health check
    return true;
  }
}
```

### 2. Register Adapter

```typescript
// src/llm/registry.ts
import { MyAdapter } from "./my-adapter.ts";

static {
  // ... existing registrations
  this.register("my-provider", () => new MyAdapter());
}
```

### 3. Add Tests

```typescript
// tests/unit/llm/my-adapter.test.ts
import { assertEquals } from "@std/assert";
import { MyAdapter } from "../../../src/llm/my-adapter.ts";

Deno.test("MyAdapter generates code", async () => {
  const adapter = new MyAdapter();
  adapter.configure({ provider: "my-provider", model: "model-a", apiKey: "test" });

  const result = await adapter.generateCode(request, context);
  assertEquals(result.language, "al");
});
```

## Error Handling

Adapters throw `LLMProviderError` for provider-specific errors:

```typescript
import { LLMProviderError, isRetryableError, getRetryDelay } from "../src/errors.ts";

try {
  const result = await adapter.generateCode(request, context);
} catch (error) {
  if (error instanceof LLMProviderError) {
    console.log(`Provider: ${error.provider}`);
    console.log(`Retryable: ${error.isRetryable}`);

    if (isRetryableError(error)) {
      const delay = getRetryDelay(error, 1000);
      await sleep(delay);
      // Retry
    }
  }
}
```

## Next Steps

- [Container Providers](./containers.md) - BC container integration
- [Architecture Overview](./overview.md) - System design
- [Running Benchmarks](../guides/running-benchmarks.md) - Usage guide
