# Task Categories

Tasks are categorized by difficulty: **Easy**, **Medium**, and **Hard**. This guide explains what makes a task fit each category and provides guidelines for creating new tasks.

## Easy Tasks (CG-AL-E###)

Easy tasks test basic AL syntax and simple object creation. A model with foundational AL knowledge should pass these.

### Characteristics

- Single object creation
- Standard patterns with minimal complexity
- Basic syntax knowledge required
- Few or no edge cases
- Clear, unambiguous requirements

### Examples

| Task Type            | Description                       |
| -------------------- | --------------------------------- |
| Simple table         | 3-4 fields with basic types       |
| Basic enum           | 3-5 values with captions          |
| Simple page          | Card or List for existing table   |
| Basic codeunit       | One procedure with simple logic   |
| Interface definition | 2-3 method signatures             |
| Simple extension     | Add 1-2 fields to existing object |

### Sample Easy Task

```yaml
id: CG-AL-E001
description: >-
  Create a simple AL table called "Product Category" with ID 70000.

  Fields:
  - Code (Code[20], primary key)
  - Description (Text[100])
  - Active (Boolean, default true)
  - Created Date (Date)

  Include proper captions and data classification.
```

### What Makes It Easy

- Single object (one table)
- Standard field types
- No complex validation
- No triggers beyond defaults
- No relationships to other objects

## Medium Tasks (CG-AL-M###)

Medium tasks require understanding of multiple AL concepts and often involve object interactions.

### Characteristics

- Multiple related objects
- Complex validation logic
- Triggers with business rules
- Error handling requirements
- Cross-object interactions
- API pages with CRUD operations

### Examples

| Task Type                | Description                         |
| ------------------------ | ----------------------------------- |
| API page                 | Full CRUD with proper configuration |
| Multi-object             | Table + Page + Codeunit together    |
| Interface implementation | Implement a defined interface       |
| Complex validation       | Multiple triggers with rules        |
| State machines           | Status transitions with validation  |
| Integration              | HTTP calls, JSON handling           |

### Sample Medium Task

```yaml
id: CG-AL-M001
description: >-
  Create an API page called "Customer API" with ID 70500.

  Source: Customer table
  Entity: customer
  EntitySet: customers
  API Version: v2.0

  Expose fields:
  - no (Code field)
  - name
  - address
  - city
  - country

  Include proper OData settings for CRUD operations.
  Handle InsertAllowed, ModifyAllowed, DeleteAllowed.
```

### What Makes It Medium

- Multiple configuration options
- Must understand API page conventions
- Requires OData knowledge
- Multiple fields with proper mapping
- CRUD operation handling

## Hard Tasks (CG-AL-H###)

Hard tasks test advanced AL patterns, edge cases, and deep platform knowledge.

### Characteristics

- Complex conditional logic with many branches
- Multiple interacting rules
- Precise mathematical calculations
- Boundary condition handling
- Country/region-specific logic
- Performance-sensitive operations
- Advanced patterns (DI, events, etc.)
- Platform-specific quirks

### Examples

| Task Type             | Description                     |
| --------------------- | ------------------------------- |
| Tax calculator        | Tiered rates by country/product |
| Currency conversion   | Rounding rules and edge cases   |
| FlowField/CalcFormula | Complex aggregations            |
| RecordRef operations  | Dynamic field access            |
| Event patterns        | Integration and business events |
| Enum ordinal traps    | Testing AL-specific gotchas     |

### Sample Hard Task

```yaml
id: CG-AL-H001
description: >-
  Create a codeunit called "Tax Calculator" with ID 70100.

  Implement:
  CalculateTax(Amount: Decimal; CountryCode: Code[2]; ProductType: Enum "CG Product Type"): Decimal

  Tax rules by country:
  - US: 0% for amounts < 100, 7% for 100-999, 10% for >= 1000
  - CA: Flat 13%
  - DE: 19% standard, 7% for Food, 0% for Books
  - UK: 20% standard, 0% for Food and Books
  - Other: 0%

  Return the calculated tax amount (not the total).
  Negative amounts should return 0.
```

### What Makes It Hard

- Multiple country-specific rules
- Product type variations
- Tiered rate thresholds
- Boundary conditions
- Edge case handling (negative amounts)
- Many code paths to test

## AL-Specific Knowledge Tests

Some tasks specifically test whether models understand AL quirks:

### Interface IDs

```yaml
# Tests that model knows interfaces don't have numeric IDs
description: >-
  Create an interface called "Payment Processor"...
```

If model adds `interface 70000 "Payment Processor"`, it fails.

### FlowField Syntax

```yaml
# Tests CalcFormula knowledge
description: >-
  Create a FlowField "Total Amount" using CalcFormula = sum(...)
```

### Enum Ordinal Traps

```yaml
# Tests understanding of enum value assignment
description: >-
  Create an enum where values are NOT consecutive...
```

### Record Modification Patterns

```yaml
# Tests Modify vs direct assignment
description: >-
  Implement OnValidate trigger that updates related fields...
```

## Difficulty Assessment Criteria

When creating a new task, score it on these factors:

| Factor         | Easy    | Medium       | Hard     |
| -------------- | ------- | ------------ | -------- |
| Object count   | 1       | 2-3          | 3+       |
| Code paths     | 1-2     | 3-5          | 6+       |
| Edge cases     | 0-1     | 2-4          | 5+       |
| AL concepts    | Basic   | Intermediate | Advanced |
| BC knowledge   | Minimal | Moderate     | Deep     |
| Business logic | Simple  | Moderate     | Complex  |

### Scoring Guide

- **Easy**: Score 1 in most categories
- **Medium**: Score 2-3 in most categories
- **Hard**: Score 3+ in most categories

## Creating Balanced Task Sets

A good benchmark should include:

### Breadth (Object Types)

- Tables
- Pages (Card, List, API)
- Codeunits
- Reports
- Enums
- Interfaces
- Extensions
- XMLports
- Queries

### Depth (Difficulty Spread)

| Difficulty | Percentage |
| ---------- | ---------- |
| Easy       | 30-40%     |
| Medium     | 40-50%     |
| Hard       | 20-30%     |

### Coverage (AL Concepts)

- Field types and properties
- Keys and indexes
- Triggers (OnInsert, OnValidate, etc.)
- FlowFields and CalcFormulas
- TableRelations
- Page controls and actions
- Report layouts
- Error handling
- Events and subscribers

## Avoiding Common Mistakes

### Too Much Guidance

```yaml
# BAD - Tells model what to do
description: >-
  Create an interface (note: interfaces don't have IDs in AL)...

# GOOD - Tests model's knowledge
description: >-
  Create an interface called "Payment Processor"...
```

### Ambiguous Requirements

```yaml
# BAD - Unclear what fields to include
description: >-
  Create a customer table with some fields...

# GOOD - Specific requirements
description: >-
  Create a customer table with:
  - No. (Code[20], primary key)
  - Name (Text[100])
```

### Untestable Requirements

```yaml
# BAD - Subjective
description: >-
  Create a well-structured page...

# GOOD - Testable
description: >-
  Create a page with fields in a "General" group...
```

## Next Steps

- [Task Format](./task-format.md) - YAML structure
- [Writing Tests](./writing-tests.md) - Create test codeunits
- [Running Benchmarks](../guides/running-benchmarks.md) - Execute benchmarks
