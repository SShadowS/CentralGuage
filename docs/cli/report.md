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

| Option            | Type    | Default           | Description                            |
| ----------------- | ------- | ----------------- | -------------------------------------- |
| `--html`          | boolean | false             | Generate HTML report                   |
| `-o, --output`    | string  | `reports-output/` | Output directory for generated files   |
| `--save-as`       | string  | -                 | Save file selection as a named dataset |
| `--add-to`        | string  | -                 | Add files to an existing dataset       |
| `--dataset`       | string  | -                 | Generate report from a saved dataset   |
| `--list-datasets` | boolean | false             | List all saved datasets                |

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

## Datasets

Datasets allow you to save and reuse file selections for report generation. This is useful when you have a specific set of result files you want to compare repeatedly.

### Creating a Dataset

Save your file selection when generating a report:

```bash
centralgauge report results/ --html --save-as january-comparison
```

This creates `results/datasets/january-comparison.yml` containing the selected files.

### Listing Datasets

View all saved datasets:

```bash
centralgauge report results/ --list-datasets
```

Output:

```
Datasets in results/datasets/:
  january-comparison    3 files   Updated: Jan 20, 2025
  february-run          5 files   Updated: Feb 1, 2025
```

### Using a Dataset

Generate a report from a saved dataset:

```bash
centralgauge report results/ --dataset january-comparison --html
```

The command shows a summary of files in the dataset and asks for confirmation before generating the report. Missing files are automatically skipped with a warning.

### Adding Files to a Dataset

Add new result files to an existing dataset:

```bash
centralgauge report results/ --add-to january-comparison --html
```

This shows only files not already in the dataset, lets you select which to add, updates the dataset, and generates a report with all files.

### Dataset Storage

Datasets are stored in `<results-dir>/datasets/` as YAML files:

```yaml
name: "january-comparison"
description: "January 2025 model comparison"
created: "2025-01-15T10:30:00Z"
updated: "2025-01-20T14:15:00Z"
files:
  - "llm-benchmark-2025-01-15-sonnet.json"
  - "agent-benchmark-2025-01-16.json"
```

File paths are stored relative to the results directory for portability.

## See Also

- [report-from-db](./commands.md#report-from-db) - Generate reports from database
- [Understanding Results](../guides/understanding-results.md) - Result interpretation
- [Running Benchmarks](../guides/running-benchmarks.md) - Generating results
