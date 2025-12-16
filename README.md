# CentralGauge

> **Modern LLM benchmark for Microsoft Dynamics 365 Business Central AL code**

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Deno](https://img.shields.io/badge/Deno-000000?style=flat-square&logo=deno&logoColor=white)](https://deno.land/)
[![MIT License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

CentralGauge evaluates large language models on their ability to generate, debug, and refactor **AL code** for Business Central. Get repeatable, two-attempt benchmarks with automated compilation and testing in isolated BC containers.

<img width="711" height="1277" alt="image" src="https://github.com/user-attachments/assets/f8a8e564-6397-42be-af83-42fd812f4c9a" />

## Features

- **Two-pass evaluation** - Models get a second chance to fix compilation errors
- **Containerized testing** - Isolated Business Central environments via Docker
- **Parallel execution** - Run multiple models and tasks concurrently
- **Rich reporting** - JSON data + beautiful HTML reports
- **Model agnostic** - Works with OpenAI, Anthropic, Google, Azure, OpenRouter, and local LLMs
- **Model variants** - Compare same model with different temperatures/prompts
- **Debug logging** - Capture raw LLM requests/responses for analysis
- **Fast & deterministic** - Consistent results across identical runs

## Quick Start

```bash
# Install Deno (if not already installed)
curl -fsSL https://deno.land/x/install/install.sh | sh

# Clone and run benchmark
git clone https://github.com/SShadowS/CentralGuage.git
cd CentralGuage

# Run your first benchmark (using mock LLM for demo)
deno run --allow-all cli/centralgauge.ts bench --llms mock-gpt-4 --tasks tasks/sample-task.yml --attempts 2

# Generate HTML report
deno task report results/ --html
```

## Commands

```bash
# Development
deno task lint        # Lint code
deno task fmt         # Format code
deno task test        # Run tests

# Benchmarking with model aliases
deno task bench --llms opus,gpt-5.2 --tasks tasks/easy/*.yml   # Use aliases
deno task bench --llms flagship --tasks tasks/*.yml            # Use groups
deno task bench --llms coding,budget --attempts 2              # Mix & match

# Traditional provider/model syntax
deno task bench --llms openai/gpt-5.2,anthropic/claude-4.5-opus

# OpenRouter models (access 200+ models)
deno task bench --llms openrouter/anthropic/claude-4.5-opus
deno task bench --llms openrouter/google/gemini-3-pro-preview

# Reasoning models comparison (recommended for complex tasks)
deno task bench --llms "opus@reasoning=50000,gpt-5@reasoning=50000"

# Parallel execution (faster benchmarks)
deno task bench --llms opus,gpt-5.2 --tasks tasks/*.yml --parallel

# Configuration
deno run --allow-all cli/centralgauge.ts config init           # Create config file
deno run --allow-all cli/centralgauge.ts models               # List all models
deno run --allow-all cli/centralgauge.ts models flagship      # Test model resolution

# HTML Reports
deno task report results/ --html --output reports/
```

## Model Variants

Compare the same model with different configurations using the `@` syntax:

```bash
# Compare different temperatures
deno task bench --llms "opus@temp=0.1,opus@temp=0.5,opus@temp=0.9"

# Override multiple parameters
deno task bench --llms "gpt-5.2@temp=0.2,maxTokens=8000"

# Compare different thinking budgets (for reasoning models)
deno task bench --llms "opus@thinking=10000,opus@thinking=50000"
deno task bench --llms "o3@reasoning=5000,o3@reasoning=20000"

# Use named profiles from config
deno task bench --llms "opus@profile=conservative,opus@profile=creative"
```

### Supported Parameters

| Parameter          | Aliases                   | Description                              |
| ------------------ | ------------------------- | ---------------------------------------- |
| `temperature`      | `temp`                    | Generation temperature (0.0-1.0)         |
| `maxTokens`        | `max_tokens`, `tokens`    | Maximum response tokens                  |
| `systemPromptName` | `prompt`, `system_prompt` | Named prompt from config                 |
| `thinkingBudget`   | `thinking`, `reasoning`   | Extended thinking/reasoning token budget |
| `timeout`          | -                         | Request timeout in ms                    |

**Thinking Budget** is supported on:

- **Claude 4.5+**: Extended thinking token budget
- **OpenAI o1/o3**: Maps to reasoning effort
- **Gemini**: Thinking token budget for supported models

### Config File Profiles

Define reusable profiles in `.centralgauge.yml`:

```yaml
# Named system prompts
systemPrompts:
  strict-al:
    content: |
      You are a strict AL code generator for Business Central.
      Only output valid AL code without explanations.

# Named variant profiles
variantProfiles:
  conservative:
    description: "Low temperature for deterministic output"
    config:
      temperature: 0.1
      maxTokens: 4000
  creative:
    description: "Higher temperature for varied solutions"
    config:
      temperature: 0.8
      maxTokens: 8000
      systemPromptName: strict-al
  deep-thinking:
    description: "Extended reasoning for complex tasks"
    config:
      temperature: 0.2
      thinkingBudget: 50000
```

## Debug Logging

Enable debug logging to capture raw LLM requests and responses for analysis:

```bash
# Basic debug logging
deno task bench --llms opus --tasks tasks/*.yml --debug

# Verbose logging with raw responses
deno task bench --llms opus --tasks tasks/*.yml --debug-level verbose

# Custom output directory
deno task bench --llms opus --tasks tasks/*.yml --debug --debug-output-dir ./my-debug
```

Debug output includes:

- Request prompts and parameters
- Raw API responses
- Extracted code blocks
- Compilation results
- Timing information

## Supported Providers

| Provider       | Environment Variable   | Example                                |
| -------------- | ---------------------- | -------------------------------------- |
| OpenAI         | `OPENAI_API_KEY`       | `openai/gpt-5.2`                       |
| Anthropic      | `ANTHROPIC_API_KEY`    | `anthropic/claude-4.5-opus`            |
| Google Gemini  | `GOOGLE_API_KEY`       | `gemini/gemini-3-pro-preview`          |
| Azure OpenAI   | `AZURE_OPENAI_API_KEY` | `azure/gpt-5.2`                        |
| OpenRouter     | `OPENROUTER_API_KEY`   | `openrouter/anthropic/claude-4.5-opus` |
| Local (Ollama) | -                      | `local/codellama`                      |

## Contributing

We welcome contributions! Feel free to open issues or submit a PR.

## License

MIT © [SShadowS](https://github.com/SShadowS)
