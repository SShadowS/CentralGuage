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
- 🎛️ **Model agnostic** - Works with OpenAI, Azure OpenAI, and local LLMs
- ⚡ **Fast & deterministic** - Consistent results across identical runs

## 🚀 Quick Start

```bash
# Install Deno (if not already installed)
curl -fsSL https://deno.land/x/install/install.sh | sh

# Clone and run benchmark
git clone https://github.com/your-org/centralgauge.git
cd centralgauge

# Run your first benchmark
deno task bench --llms gpt-4o --tasks tasks/sample-task.yml

# Generate HTML report
deno task report results/ --html
```

## 📋 Commands

```bash
# Development
deno task lint        # Lint code
deno task fmt         # Format code  
deno task test        # Run tests

# Benchmarking
deno task bench --llms gpt-4o,claude-3-sonnet --tasks tasks/*.yml
deno task report results/ --html --output reports/
```

## 🏗️ Project Status

**Phase 0: Inception** ✅ *Complete*
- [x] Project scaffolding
- [x] CLI interface
- [x] Type definitions

**Phase 1: Container Layer** 🚧 *In Progress*
- [ ] BC container automation
- [ ] AL compilation pipeline

**Phase 2: Core Engine** 📋 *Planned*
- [ ] LLM adapters
- [ ] Two-pass evaluation loop

## 🤝 Contributing

We welcome contributions! Check out our [development roadmap](PLAN.md) and submit a PR.

## 📄 License

MIT © [Your Name](https://github.com/your-org)