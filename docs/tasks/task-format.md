# Task Format

Tasks are defined in YAML files that describe what AL code the LLM should generate and how to verify it.

## Task File Location

Tasks are organized by difficulty:

```
tasks/
├── easy/                    # Basic AL syntax
│   └── CG-AL-E001-basic-table.yml
├── medium/                  # Multi-object, business logic
│   └── CG-AL-M001-api-page-crud.yml
└── hard/                    # Advanced patterns, edge cases
    └── CG-AL-H001-tax-calculator.yml
```

## YAML Schema

### Minimal Task

```yaml
id: CG-AL-E001
prompt_template: code-gen.md
fix_template: bugfix.md
max_attempts: 2
description: >-
  Create a simple AL table called "Product Category" with ID 70000.
expected:
  compile: true
  testApp: tests/al/easy/CG-AL-E001.Test.al
metrics:
  - compile_pass
  - tests_pass
  - pass_attempt
```

### Full Task Schema

```yaml
# Unique task identifier
# Format: CG-AL-{E|M|H}{###}
id: CG-AL-E001

# Prompt template for code generation (relative to templates/)
prompt_template: code-gen.md

# Prompt template for fix attempts (relative to templates/)
fix_template: bugfix.md

# Maximum attempts allowed (usually 2)
max_attempts: 2

# Task description - what the LLM should generate
description: >-
  Create a simple AL table called "Product Category" with ID 70000.

  The table should have the following fields:
  - Code (Code[20], primary key)
  - Description (Text[100])
  - Active (Boolean, default true)
  - Created Date (Date)

  Include proper captions and data classification.

# Expected outcomes for evaluation
expected:
  # Whether the code should compile successfully
  compile: true

  # Path to test file (relative to project root)
  testApp: tests/al/easy/CG-AL-E001.Test.al

  # Test codeunit ID (optional, speeds up test execution)
  testCodeunitId: 80001

  # Patterns that must appear in generated code
  mustContain:
    - "table 70000"
    - '"Product Category"'

  # Patterns that must NOT appear
  mustNotContain:
    - "// TODO"

# Metrics to collect
metrics:
  - compile_pass      # Did it compile?
  - tests_pass        # Did tests pass?
  - pass_attempt      # Which attempt passed?

# Optional metadata
metadata:
  difficulty: easy          # easy | medium | hard
  category: table           # Object type being tested
  tags:                     # For filtering
    - basic-syntax
    - table-definition
  estimatedTokens: 500      # Expected token usage
  target: Cloud             # Cloud | OnPrem (for HttpClient, etc.)

# Task-specific prompt injections (optional)
prompts:
  injections:
    anthropic:
      generation:
        suffix: "\nRemember to include DataClassification."
```

## Field Reference

### id

Unique identifier following the pattern `CG-AL-{difficulty}{number}`:

- `E` = Easy (001-999)
- `M` = Medium (001-999)
- `H` = Hard (001-999)

```yaml
id: CG-AL-E001    # Easy task 001
id: CG-AL-M015    # Medium task 015
id: CG-AL-H003    # Hard task 003
```

### prompt_template / fix_template

References to prompt templates in the `templates/` directory:

```yaml
prompt_template: code-gen.md     # For first attempt
fix_template: bugfix.md          # For retry after errors
```

Default templates:
- `code-gen.md` - Standard code generation prompt
- `bugfix.md` - Error fix prompt with compilation errors

### max_attempts

Maximum number of generation attempts:

```yaml
max_attempts: 2    # First try + one retry (default)
max_attempts: 1    # Single attempt only
max_attempts: 3    # First try + two retries
```

### description

The task description is the core of the prompt. It should:

- Clearly specify what to create
- Include exact names and IDs
- Define field types and constraints
- Specify expected behaviors
- NOT include hints or guidance

**Good description:**

```yaml
description: >-
  Create a table called "Product Category" with ID 70000.

  Fields:
  - Code (Code[20], primary key)
  - Description (Text[100])
  - Active (Boolean, default true)
```

**Bad description (includes guidance):**

```yaml
description: >-
  Create a table called "Product Category" with ID 70000.
  Note: Remember to use InitValue for default values.
  Hint: Active should default to true.
```

### expected

Defines success criteria:

```yaml
expected:
  # Compilation requirement
  compile: true

  # Test file path (optional - omit for compile-only tasks)
  testApp: tests/al/easy/CG-AL-E001.Test.al

  # Test codeunit ID (optional, improves performance)
  testCodeunitId: 80001

  # Required patterns (optional)
  mustContain:
    - "table 70000"
    - "TableRelation"

  # Forbidden patterns (optional)
  mustNotContain:
    - "// TODO"
    - "NotImplemented"
```

### metrics

Metrics to track for this task:

```yaml
metrics:
  - compile_pass      # Boolean: compilation succeeded
  - tests_pass        # Boolean: all tests passed
  - pass_attempt      # Integer: which attempt succeeded (0=none)
```

### metadata

Optional task metadata:

```yaml
metadata:
  # Difficulty classification
  difficulty: easy    # easy | medium | hard

  # Primary AL object type
  category: table     # table | page | codeunit | report | etc.

  # Tags for filtering
  tags:
    - basic-syntax
    - flowfield
    - api

  # Expected token usage
  estimatedTokens: 500

  # Target platform (for OnPrem-only features)
  target: Cloud       # Cloud | OnPrem
```

### prompts

Task-specific prompt injections:

```yaml
prompts:
  enabled: true
  injections:
    # Provider-specific
    anthropic:
      generation:
        suffix: "\nBe concise."
    openai:
      generation:
        prefix: "Important: "

    # All providers
    default:
      generation:
        systemPrompt: "You are an AL expert."
```

## ID Ranges

Objects in generated code and tests should use specific ID ranges:

| Range | Purpose |
|-------|---------|
| 50000-59999 | Standard Business Central |
| 69000-69999 | Prereq app objects |
| 70000-79999 | Generated code (benchmark tasks) |
| 80000-89999 | Test codeunits |

## Test File Naming

Test files follow the pattern:

```
tests/al/{difficulty}/CG-AL-{ID}.Test.al
```

Example:
```
tests/al/easy/CG-AL-E001.Test.al
tests/al/medium/CG-AL-M005.Test.al
```

## Example Tasks

### Simple Table Task

```yaml
id: CG-AL-E001
prompt_template: code-gen.md
fix_template: bugfix.md
max_attempts: 2
description: >-
  Create a simple AL table called "Product Category" with ID 70000.

  Fields:
  - Code (Code[20], primary key)
  - Description (Text[100])
  - Active (Boolean, default true)
  - Created Date (Date)

  Include proper captions and data classification.
expected:
  compile: true
  testApp: tests/al/easy/CG-AL-E001.Test.al
  testCodeunitId: 80001
metrics:
  - compile_pass
  - tests_pass
  - pass_attempt
metadata:
  difficulty: easy
  category: table
```

### Complex Codeunit Task

```yaml
id: CG-AL-H001
prompt_template: code-gen.md
fix_template: bugfix.md
max_attempts: 2
description: >-
  Create a codeunit called "Tax Calculator" with ID 70100.

  Implement a procedure:
  CalculateTax(Amount: Decimal; CountryCode: Code[2]; ProductType: Enum "CG Product Type"): Decimal

  Tax rules by country:
  - US: 0% for amounts < 100, 7% for 100-999, 10% for >= 1000
  - CA: Flat 13%
  - DE: 19% standard, 7% for Food, 0% for Books
  - UK: 20% standard, 0% for Food and Books
  - Other: 0%

  Return the calculated tax amount (not the total).
  Negative amounts should return 0.
expected:
  compile: true
  testApp: tests/al/hard/CG-AL-H001.Test.al
  testCodeunitId: 80200
metrics:
  - compile_pass
  - tests_pass
  - pass_attempt
metadata:
  difficulty: hard
  category: codeunit
  tags:
    - business-logic
    - calculations
    - edge-cases
```

### Compile-Only Task

For tasks that don't need runtime testing:

```yaml
id: CG-AL-E003
prompt_template: code-gen.md
fix_template: bugfix.md
max_attempts: 2
description: >-
  Create an enum called "Order Status" with ID 70050.

  Values:
  - Draft (0)
  - Released (1)
  - Shipped (2)
  - Completed (3)
  - Cancelled (4)

  Set Extensible = true and include proper captions.
expected:
  compile: true
  # No testApp - compile-only
metrics:
  - compile_pass
  - pass_attempt
metadata:
  difficulty: easy
  category: enum
```

## Validation

Validate task files before use:

```bash
deno run --allow-all cli/centralgauge.ts validate-tasks tasks/
```

This checks:
- YAML syntax
- Required fields present
- ID format correct
- Test file exists
- No duplicate IDs

## Next Steps

- [Writing Tests](./writing-tests.md) - Create test codeunits
- [Task Categories](./categories.md) - Difficulty guidelines
- [Running Benchmarks](../guides/running-benchmarks.md) - Execute tasks
