# rules Command

The `rules` command converts model shortcomings JSON files into markdown rules files that can help guide LLM code generation. This is useful for creating model-specific guidance that helps LLMs avoid known mistakes when generating AL code.

## Synopsis

```bash
centralgauge rules <input> [options]
```

## Purpose

During benchmark evaluation, CentralGauge tracks common mistakes that each model makes. These are stored in JSON files in the `model-shortcomings/` directory. The `rules` command transforms this data into human-readable markdown rules that can be:

- Added to `.claude/rules/` for Claude Code guidance
- Included in system prompts for other LLM tools
- Used as reference documentation for AL code patterns
- Shared across teams to improve code generation quality

## Arguments

| Argument | Description                            |
| -------- | -------------------------------------- |
| `input`  | Path to a model shortcomings JSON file |

## Options

| Option              | Type   | Default          | Description                                           |
| ------------------- | ------ | ---------------- | ----------------------------------------------------- |
| `-o, --output`      | string | {input}.rules.md | Override the output file path                         |
| `--min-occurrences` | number | 1                | Only include shortcomings with at least N occurrences |

## Input Format

The input JSON file must follow the `ModelShortcomingsFile` format:

```json
{
  "model": "gpt-5.2-2025-12-11",
  "lastUpdated": "2025-12-29T10:07:51.020Z",
  "shortcomings": [
    {
      "concept": "json-typed-getter-methods",
      "alConcept": "json-handling",
      "description": "The model failed to use correct JSON getter patterns...",
      "correctPattern": "procedure ParseData(Json: JsonObject)...",
      "incorrectPattern": "// Incorrect usage of GetText() directly...",
      "errorCodes": ["AL0133", "AL0132"],
      "affectedTasks": ["CG-AL-H014", "CG-AL-M020"],
      "firstSeen": "2025-12-28T23:45:01.770Z",
      "occurrences": 4
    }
  ]
}
```

### Input Fields

| Field                             | Type     | Description                                                          |
| --------------------------------- | -------- | -------------------------------------------------------------------- |
| `model`                           | string   | Model identifier                                                     |
| `lastUpdated`                     | string   | ISO 8601 timestamp                                                   |
| `shortcomings[].concept`          | string   | Short slug describing the issue                                      |
| `shortcomings[].alConcept`        | string   | AL category for grouping (e.g., "json-handling", "table-definition") |
| `shortcomings[].description`      | string   | Detailed explanation of the issue                                    |
| `shortcomings[].correctPattern`   | string   | Example of correct AL code                                           |
| `shortcomings[].incorrectPattern` | string   | Example of incorrect pattern the model used                          |
| `shortcomings[].errorCodes`       | string[] | AL compiler error codes                                              |
| `shortcomings[].affectedTasks`    | string[] | Task IDs where this issue occurred                                   |
| `shortcomings[].occurrences`      | number   | How many times this issue was seen                                   |

## Output Format

The generated markdown file includes:

1. **Header** - Model name and generation date
2. **Table of Contents** - Links to each category
3. **Rules by Category** - Grouped by `alConcept`
4. **Individual Rules** - Title, error codes, description, incorrect/correct patterns

### Example Output

````markdown
# AL Code Generation Rules for gpt-5.2-2025-12-11

> Auto-generated from benchmark shortcomings on 12/29/2025.
> 8 rules covering 5 categories.

## Categories

- [Json Handling](#json-handling) (2 rules)
- [Table Definition](#table-definition) (3 rules)
- [Query Definition](#query-definition) (2 rules)
- [Codeunit Self Reference](#codeunit-self-reference) (1 rules)

## Json Handling {#json-handling}

### Json Typed Getter Methods

**Error codes**: AL0133, AL0132, AL0134

The model failed to generate valid JSON getter patterns...

**Incorrect:**

```al
// Direct GetText() call that doesn't exist
Name := CustomerJson.GetText('name');
```
````

**Correct:**

```al
if CustomerJson.Get('name', JToken) then begin
    JValue := JToken.AsValue();
    Name := JValue.AsText();
end;
```

---

````
## Examples

### Basic Usage

Generate rules file next to the input JSON:

```bash
centralgauge rules model-shortcomings/gpt-5.2-2025-12-11.json
````

Output: `model-shortcomings/gpt-5.2-2025-12-11.rules.md`

### Custom Output Path

Place rules in Claude Code's rules directory:

```bash
centralgauge rules model-shortcomings/gpt-5.2.json -o .claude/rules/gpt-5.2.md
```

### Filter by Frequency

Only include issues that occurred 2 or more times (more likely to be systematic):

```bash
centralgauge rules model-shortcomings/claude-opus.json --min-occurrences 2
```

### Generate Rules for All Models

```bash
for f in model-shortcomings/*.json; do
  centralgauge rules "$f" --min-occurrences 2
done
```

## Workflow Integration

### Using with Claude Code

1. Generate rules from benchmark shortcomings:
   ```bash
   centralgauge rules model-shortcomings/claude-sonnet-4-5.json \
     -o .claude/rules/al-patterns.md
   ```

2. Claude Code automatically picks up rules from `.claude/rules/`

3. Rules help the model avoid known AL syntax mistakes

### Using with Knowledge Bank

Generated rules can be injected directly into benchmarks via the knowledge bank feature:

1. Generate rules from benchmark shortcomings:
   ```bash
   centralgauge rules model-shortcomings/gpt-5.json
   ```

2. Run a guided benchmark with the generated rules:
   ```bash
   centralgauge bench --llms gpt-5 --knowledge model-shortcomings/gpt-5.rules.md
   ```

3. Compare guided vs unguided performance in reports

The guided run is automatically labeled with "(guided)" suffix for easy comparison.

### Continuous Improvement Cycle

1. **Run benchmarks** to identify model weaknesses:
   ```bash
   centralgauge bench --llms sonnet --tasks "tasks/**/*.yml"
   ```

2. **Analyze failures** to update shortcomings:
   ```bash
   centralgauge verify debug/ --mode shortcomings-only
   ```

3. **Generate updated rules**:
   ```bash
   centralgauge rules model-shortcomings/claude-sonnet-4.json \
     -o .claude/rules/al-sonnet.md
   ```

4. **Re-run benchmarks** with knowledge injection:
   ```bash
   centralgauge bench --llms sonnet --knowledge model-shortcomings/claude-sonnet-4.rules.md
   ```

5. **Compare results** to measure improvement

## Source Files

| File                            | Purpose                           |
| ------------------------------- | --------------------------------- |
| `src/rules/generator.ts`        | Core markdown generation logic    |
| `src/rules/mod.ts`              | Module barrel export              |
| `cli/commands/rules-command.ts` | CLI command handler               |
| `src/verify/types.ts`           | Type definitions for shortcomings |

## Exit Codes

| Code | Description                                 |
| ---- | ------------------------------------------- |
| 0    | Success                                     |
| 1    | Error (invalid input, file not found, etc.) |

## See Also

- [bench Command](./bench.md) - Run benchmarks with knowledge bank injection
- [verify Command](./commands.md#verify) - Analyze failures and update shortcomings
- [Running Benchmarks - Knowledge Bank](../guides/running-benchmarks.md#knowledge-bank-injection) - Detailed guide
- [Understanding Results](../guides/understanding-results.md) - Interpret benchmark output
