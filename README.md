# 🎯 CentralGauge

> **Modern LLM benchmark for Microsoft Dynamics 365 Business Central AL code**

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Deno](https://img.shields.io/badge/Deno-000000?style=flat-square&logo=deno&logoColor=white)](https://deno.land/)
[![MIT License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

CentralGauge evaluates large language models on their ability to generate, debug, and refactor **AL code** for Business Central. Get repeatable, two-attempt benchmarks with automated compilation and testing in isolated BC containers.

## ✨ Features

- 🚀 **Two-pass evaluation** - Models get a second chance to fix compilation errors
- 🐳 **Containerized testing** - Isolated Business Central environments via Docker
- 📊 **Rich reporting** - JSON data + beautiful HTML reports
- 🎛️ **Model agnostic** - Works with OpenAI, Anthropic, Google, Azure, and local LLMs
- 🔬 **Model variants** - Compare same model with different temperatures/prompts
- ⚡ **Fast & deterministic** - Consistent results across identical runs

## 🚀 Quick Start

```bash
# Install Deno (if not already installed)
curl -fsSL https://deno.land/x/install/install.sh | sh

# Clone and run benchmark
git clone https://github.com/your-org/centralgauge.git
cd centralgauge

# Run your first benchmark (using mock LLM for demo)
deno run --allow-all cli/centralgauge.ts bench --llms mock-gpt-4 --tasks tasks/sample-task.yml --attempts 2

# Generate HTML report (coming soon)
deno task report results/ --html
```

## 📋 Commands

```bash
# Development
deno task lint        # Lint code
deno task fmt         # Format code  
deno task test        # Run tests

# Benchmarking (NEW: Simple aliases!)
deno task bench --llms sonnet,gpt-4o --tasks tasks/easy/*.yml  # Use aliases
deno task bench --llms flagship --tasks tasks/*.yml            # Use groups
deno task bench --llms coding,budget --attempts 2              # Mix & match

# Traditional syntax still works
deno task bench --llms openai/gpt-4o,anthropic/claude-3-5-sonnet-20241022

# Configuration
deno run --allow-all cli/centralgauge.ts config init           # Create config file
deno run --allow-all cli/centralgauge.ts models               # List all models
deno run --allow-all cli/centralgauge.ts models flagship      # Test model resolution

# HTML Reports
deno task report results/ --html --output reports/
```

## 🔬 Model Variants

Compare the same model with different configurations using the `@` syntax:

```bash
# Compare different temperatures
deno task bench --llms "sonnet@temp=0.1,sonnet@temp=0.5,sonnet@temp=0.9"

# Override multiple parameters
deno task bench --llms "gpt-4o@temp=0.2,maxTokens=8000"

# Compare different thinking budgets (for reasoning models)
deno task bench --llms "claude-4.5@thinking=10000,claude-4.5@thinking=50000"
deno task bench --llms "o3@reasoning=5000,o3@reasoning=20000"

# Use named profiles from config
deno task bench --llms "sonnet@profile=conservative,sonnet@profile=creative"
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

## 🤝 Contributing

We welcome contributions! Feel free to open issues or submit a PR.

## 📄 License

MIT © [SShadowS](https://github.com/SShadowS)
