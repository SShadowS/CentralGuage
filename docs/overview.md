# Overview

## What is CentralGauge?

CentralGauge is a comprehensive benchmark suite designed to evaluate how well large language models (LLMs) can generate, debug, and refactor code written in AL (Application Language), the programming language for Microsoft Dynamics 365 Business Central.

Unlike generic coding benchmarks, CentralGauge focuses specifically on the unique challenges of Business Central development:

- **Domain-specific syntax** - AL has unique constructs like tables, pages, reports, and codeunits
- **Platform conventions** - Business Central has strict naming conventions, captions, and data classification requirements
- **Integration patterns** - Real-world BC development involves events, interfaces, and extension patterns
- **Compilation verification** - Generated code must compile against the BC compiler
- **Runtime testing** - Code is executed against actual test codeunits in BC containers

## Key Features

### Two-Pass Evaluation

Models get a second chance to fix compilation errors, simulating real-world development workflows where developers iterate on code based on compiler feedback.

```
First Attempt ─────► Compile ─────► Pass ─────► Success!
                         │
                         ▼
                    Errors Found
                         │
                         ▼
Second Attempt ────► Compile ─────► Pass ─────► Success!
                         │
                         ▼
                       Fail
```

### Containerized Testing

All code is compiled and tested in isolated Business Central Docker containers, ensuring reproducible results and preventing test pollution.

### Parallel Execution

Run multiple models and tasks concurrently for faster benchmark completion. The orchestrator handles rate limiting, retries, and resource management.

### Model Agnostic

Works with any LLM provider:

| Provider | Models |
|----------|--------|
| Anthropic | Claude 4.5 Opus, Claude 4 Sonnet |
| OpenAI | GPT-5, GPT-4o, o3, o1 |
| Google | Gemini 3 Pro, Gemini 2 Flash |
| Azure | Azure OpenAI deployments |
| OpenRouter | 200+ models via unified API |
| Local | Ollama, vLLM, any OpenAI-compatible |

### Agent Benchmarking

Beyond single API calls, CentralGauge can benchmark autonomous agents (like Claude Code) that iteratively generate, compile, and fix code until success.

## How It Works

```
┌────────────────────────────────────────────────────────────────────┐
│                         CentralGauge CLI                            │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   Task Loader      Parallel Orchestrator      Result Aggregator    │
│       ▲                     │                        ▲              │
│       │                     ▼                        │              │
│   ┌───────────────────────────────────────────────────┐            │
│   │                  Task Executor                     │            │
│   │  ┌─────────────┐  ┌──────────────┐  ┌──────────┐ │            │
│   │  │ LLM Adapter │→│ Code Extractor│→│ Container │ │            │
│   │  └─────────────┘  └──────────────┘  │ Provider │ │            │
│   │                                      └──────────┘ │            │
│   └───────────────────────────────────────────────────┘            │
│                              │                                      │
└──────────────────────────────│──────────────────────────────────────┘
                               ▼
                    ┌───────────────────┐
                    │  BC Container     │
                    │  - AL Compiler    │
                    │  - Test Runner    │
                    └───────────────────┘
```

1. **Task Loading** - YAML task manifests define what the LLM should generate
2. **Prompt Generation** - Templates transform task descriptions into LLM prompts
3. **Code Generation** - LLM produces AL code based on the prompt
4. **Code Extraction** - Parser extracts AL code from model response
5. **Compilation** - BC container compiles the generated code
6. **Testing** - Optional test codeunits verify the code works correctly
7. **Scoring** - Results are aggregated into pass/fail metrics

## Use Cases

### Model Evaluation

Compare how different LLMs perform on BC-specific coding tasks:

```bash
deno task bench --llms opus,gpt-5,gemini-3-pro --tasks tasks/**/*.yml
```

### Model Comparison

Evaluate the same model with different configurations:

```bash
deno task bench --llms "opus@temp=0.1,opus@temp=0.5,opus@temp=0.9"
```

### Regression Testing

Track model performance over time with historical stats:

```bash
deno run --allow-all cli/centralgauge.ts stats-regression --threshold 10
```

### Agent Development

Test autonomous agents that can iterate on code:

```bash
deno task bench --agents my-agent --tasks tasks/easy/*.yml
```

## Technology Stack

| Component | Technology |
|-----------|------------|
| Runtime | Deno 1.44+ |
| Language | TypeScript 5 |
| CLI Framework | Cliffy Command |
| Containers | bccontainerhelper + Docker |
| Task Format | YAML 1.2 |
| Reports | JSON + HTML (SvelteKit) |
| Database | SQLite (for stats) |

## Project Structure

```
CentralGauge/
├── cli/                    # CLI commands and helpers
│   ├── commands/           # Individual command implementations
│   ├── helpers/            # Shared utilities
│   └── tui/                # Terminal UI components
├── src/                    # Core library
│   ├── llm/                # LLM adapters and registry
│   ├── container/          # Container providers
│   ├── tasks/              # Task execution
│   ├── parallel/           # Parallel orchestration
│   ├── agents/             # Agent system
│   └── config/             # Configuration management
├── tasks/                  # Task definitions
│   ├── easy/               # Basic AL tasks
│   ├── medium/             # Complex multi-object tasks
│   └── hard/               # Advanced patterns and edge cases
├── tests/                  # Test suite
│   ├── unit/               # Unit tests
│   ├── integration/        # Integration tests
│   └── al/                 # AL test codeunits
├── templates/              # Prompt templates
├── agents/                 # Agent configurations
└── docs/                   # Documentation
```

## Getting Started

See the [Installation Guide](./installation.md) to set up CentralGauge, or jump straight to the [Quick Start](./quick-start.md) if you already have Deno and Docker installed.
