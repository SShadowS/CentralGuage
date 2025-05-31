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

# Benchmarking
deno task bench --llms gpt-4o,claude-3-sonnet --tasks tasks/*.yml
deno task report results/ --html --output reports/
```

## 🏗️ Project Status

**Phase 0: Inception** ✅ *Complete*
- [x] Project scaffolding with Deno + TypeScript
- [x] CLI interface with full command support
- [x] Type definitions and project structure

**Phase 1: Container Layer** ✅ *Complete*
- [x] Mock container provider for development
- [x] AL compilation and error detection
- [x] Container lifecycle management

**Phase 2: Core Engine** ✅ *Complete*
- [x] LLM adapter system (Mock + OpenAI)
- [x] Template rendering with advanced features
- [x] Two-pass evaluation loop with error feedback
- [x] End-to-end task execution

**Phase 3: Core Task-set** ✅ *Complete*
- [x] 10 easy AL coding tasks
- [x] 10 medium complexity tasks

**Phase 4: HTML Reporter** ✅ *Complete*
- [x] SvelteKit static site generation
- [x] JSON data integration and visualization
- [x] Automated report building

**Phase 5: Multi-Provider LLM** ✅ *Complete*
- [x] OpenAI, Anthropic, Gemini adapters
- [x] Azure OpenAI and local model support
- [x] Provider/model format standardization

**Phase 6: Production Ready** 🚧 *Next*
- [ ] CI/CD pipeline with GitHub Actions
- [ ] Real Business Central container support
- [ ] Performance optimization and scaling

## 🤝 Contributing

We welcome contributions! Check out our [development roadmap](PLAN.md) and submit a PR.

## 📄 License

MIT © [Your Name](https://github.com/your-org)