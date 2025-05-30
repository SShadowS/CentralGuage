# Task Manifests

This directory contains YAML task manifests that define the benchmark scenarios for CentralGauge.

## Task Structure

Each task consists of:

- A YAML manifest file (`.yml`) defining the task parameters
- AL code fixtures and expected outputs
- Test files (`.altest`) for validation

## Manifest Format

```yaml
id: CG-AL-001
prompt_template: code-gen.md
fix_template: bugfix.md
max_attempts: 2
description: >-
  Create an API page that exposes the Customer table with basic CRUD operations
expected:
  compile: true
  testApp: /tests/CG001.altest
metrics:
  - compile_pass
  - tests_pass
  - pass_attempt
```

## Adding New Tasks

1. Create a new `.yml` file with a unique `CG-AL-XXX` identifier
2. Write a clear, specific description of the coding task
3. Create corresponding test files if needed
4. Update this index when adding new categories

## Categories (Planned)

- `easy/` - Basic AL syntax and simple object creation
- `medium/` - API pages, complex business logic, integrations
- `hard/` - Performance optimization, upgrade scenarios, advanced patterns
