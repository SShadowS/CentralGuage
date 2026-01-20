# report Command

The `report` command generates reports from benchmark results.

## Synopsis

```bash
centralgauge report <input> [options]
```

## Arguments

| Argument | Description                                          |
| -------- | ---------------------------------------------------- |
| `input`  | Input directory or file containing benchmark results |

## Options

| Option     | Type    | Default | Description                          |
| ---------- | ------- | ------- | ------------------------------------ |
| `--html`   | boolean | false   | Generate HTML report                 |
| `--output` | string  | -       | Output directory for generated files |
| `--format` | string  | json    | Output format (json, csv)            |

## Examples

### Generate HTML Report

```bash
centralgauge report results/ --html --output reports/
```

This generates an interactive HTML report with:

- Model comparison charts
- Task-by-task breakdown
- Pass rate visualizations
- Cost analysis
- Score distributions

### Generate JSON Summary

```bash
centralgauge report results/ --format json
```

Outputs a consolidated JSON file with aggregated statistics.

### Generate CSV Export

```bash
centralgauge report results/ --format csv --output exports/
```

Exports results in CSV format for spreadsheet analysis.

## Report Contents

### HTML Report Sections

1. **Overview** - Summary statistics and key metrics
2. **Model Comparison** - Head-to-head model performance
3. **Task Results** - Per-task pass/fail breakdown
4. **Cost Analysis** - Token usage and estimated costs
5. **Performance Trends** - Score distributions and timing

### JSON Output Structure

```json
{
  "summary": {
    "totalTasks": 50,
    "totalModels": 3,
    "overallPassRate": 0.85,
    "totalCost": 2.34
  },
  "models": {
    "anthropic/claude-sonnet-4": {
      "passRate": 0.90,
      "avgScore": 0.92,
      "cost": 0.78
    }
  },
  "tasks": {
    "CG-AL-E001": {
      "passingModels": ["anthropic/claude-sonnet-4", "openai/gpt-4o"]
    }
  }
}
```

## Input Sources

The command accepts:

1. **Directory** - Scans for `benchmark-results-*.json` files
2. **Single file** - Processes a specific results file
3. **Glob pattern** - Matches multiple files

```bash
# Directory
centralgauge report results/

# Single file
centralgauge report results/benchmark-results-1704067200000.json

# Glob pattern
centralgauge report "results/benchmark-results-*.json"
```

## Multiple Runs

When multiple result files are found, the report:

- Shows latest results prominently
- Provides comparison across runs
- Tracks historical performance

## See Also

- [report-from-db](./commands.md#report-from-db) - Generate reports from database
- [Understanding Results](../guides/understanding-results.md) - Result interpretation
- [Running Benchmarks](../guides/running-benchmarks.md) - Generating results
