# Understanding Results

This guide explains how to interpret CentralGauge benchmark results, including metrics, scoring, and analysis techniques.

## Result Files

After a benchmark run, CentralGauge produces several output files:

```
results/
├── benchmark-results-1704067200000.json    # Detailed results
├── scores-1704067200000.txt                # Quick score summary
└── centralgauge.db                         # Historical database (optional)
```

## JSON Results Structure

The main results file contains:

```json
{
  "results": [...],           // Individual task results
  "stats": {...},             // Aggregate statistics
  "comparisons": [...],       // Task-by-task model comparisons
  "hashInfo": {...}           // Task set identification
}
```

### Individual Results

Each result entry contains:

```json
{
  "taskId": "CG-AL-E001",
  "executionId": "exec-123",
  "success": true,
  "finalScore": 1.0,
  "passedAttemptNumber": 1,
  "totalTokensUsed": 1234,
  "totalCost": 0.0056,
  "totalDuration": 12345,
  "context": {
    "llmProvider": "anthropic",
    "llmModel": "claude-sonnet-4-20250514",
    "variantId": "anthropic/claude-sonnet-4-20250514"
  },
  "attempts": [...]
}
```

### Attempt Details

Each attempt records:

```json
{
  "attemptNumber": 1,
  "success": true,
  "score": 1.0,
  "llmResponse": {
    "content": "...",
    "usage": {
      "promptTokens": 500,
      "completionTokens": 734,
      "totalTokens": 1234,
      "estimatedCost": 0.0056
    },
    "duration": 5000
  },
  "compilationResult": {
    "success": true,
    "errors": [],
    "warnings": [],
    "duration": 3000
  },
  "testResult": {
    "success": true,
    "totalTests": 4,
    "passedTests": 4,
    "failedTests": 0,
    "duration": 2000
  }
}
```

## Scoring System

### Score Calculation

Tasks are scored on a 0.0 to 1.0 scale:

| Outcome            | Score   | Description               |
| ------------------ | ------- | ------------------------- |
| Compilation failed | 0.0     | Code did not compile      |
| Compilation only   | 0.5     | Compiled but no tests ran |
| Partial tests      | 0.5-0.9 | Some tests passed         |
| All tests pass     | 1.0     | Full success              |

### Attempt Weighting

When a task passes on a later attempt, the score may be adjusted:

- Pass on attempt 1: Full score
- Pass on attempt 2: Score reflects need for retry

### Final Score

The `finalScore` reflects the best attempt outcome, while `passedAttemptNumber` indicates which attempt succeeded (0 if none).

## Key Metrics

### Pass Rates

```json
{
  "overallPassRate": 0.85, // 85% of tasks passed
  "passRate1": 0.70, // 70% passed on first attempt
  "passRate2": 0.15, // 15% passed on second attempt (after failing first)
  "passNum1": 7, // Count passed on attempt 1
  "passNum2": 2 // Count passed on attempt 2
}
```

### Token Usage

```json
{
  "totalTokens": 45678,
  "promptTokens": 23456,
  "completionTokens": 22222
}
```

### Cost

```json
{
  "totalCost": 0.2345 // USD
}
```

### Timing

```json
{
  "totalDuration": 120000, // Total wall-clock time (ms)
  "totalLLMDuration": 80000, // Time in LLM calls
  "totalCompileDuration": 25000, // Time compiling
  "totalTestDuration": 15000, // Time running tests
  "secondsPerTask": 12.5 // Average per task
}
```

## Per-Model Statistics

The `perModel` map contains statistics for each model variant:

```json
{
  "perModel": {
    "anthropic/claude-sonnet-4-20250514": {
      "tasksPassed": 8,
      "tasksFailed": 2,
      "passedOnAttempt1": 7,
      "passedOnAttempt2": 1,
      "avgScore": 0.85,
      "avgAttempts": 1.2,
      "tokens": 12345,
      "cost": 0.0567
    },
    "openai/gpt-4o": {
      "tasksPassed": 7,
      "tasksFailed": 3,
      ...
    }
  }
}
```

## Task Comparisons

The `comparisons` array shows head-to-head results:

```json
{
  "comparisons": [
    {
      "taskId": "CG-AL-E001",
      "winner": "anthropic/claude-sonnet-4-20250514",
      "bestScore": 1.0,
      "passingModels": ["anthropic/claude-sonnet-4-20250514", "openai/gpt-4o"],
      "results": {
        "anthropic/claude-sonnet-4-20250514": {
          "score": 1.0,
          "attempt": 1,
          "duration": 5000
        },
        "openai/gpt-4o": {
          "score": 1.0,
          "attempt": 2,
          "duration": 8000
        }
      }
    }
  ]
}
```

### Winner Determination

1. Higher score wins
2. If scores tie, earlier attempt wins
3. If attempts tie, faster duration wins
4. If all equal, result is "TIE"

## Task Set Hash

The `hashInfo` helps identify comparable runs:

```json
{
  "hashInfo": {
    "taskSetHash": "c71a992f", // Unique hash of all tasks
    "testAppManifestHash": "abc123", // Hash of test app.json
    "totalFilesHashed": 25, // Number of files included
    "computedAt": "2025-01-05T10:00:00Z"
  }
}
```

Runs with the same `taskSetHash` tested identical task sets and are directly comparable.

## Score File Format

The quick score summary (`scores-*.txt`) provides:

```
# CentralGauge Benchmark Scores
# 2025-01-05T10:30:00.000Z

tasks: 10
models: anthropic/claude-sonnet-4-20250514, openai/gpt-4o
attempts: 2

# Aggregate Stats
pass_rate_1: 70.0%
pass_rate_2: 85.0%
avg_score: 0.82
total_cost: $0.2345

# Per-Model Scores
anthropic/claude-sonnet-4-20250514: pr1=80.0% pr2=90.0% score=0.88 cost=$0.1234
openai/gpt-4o: pr1=60.0% pr2=80.0% score=0.76 cost=$0.1111
```

## HTML Reports

Generate visual reports:

```bash
deno task report results/ --html --output reports/
```

Reports include:

- Model comparison charts
- Task-by-task breakdown
- Pass rate visualizations
- Cost analysis
- Score distributions

## Analyzing Results

### Identify Weak Areas

Find tasks where models struggle:

```bash
cat results/benchmark-results-*.json | jq '[.results[] | select(.success == false)] | group_by(.taskId) | map({task: .[0].taskId, failures: length})'
```

### Compare Model Strengths

See which models excel at specific task types:

```bash
cat results/benchmark-results-*.json | jq '.comparisons | group_by(.winner) | map({winner: .[0].winner, wins: length})'
```

### Track Cost Efficiency

Compare cost per successful task:

```bash
cat results/benchmark-results-*.json | jq '.stats.perModel | to_entries | map({model: .key, costPerPass: (.value.cost / .value.tasksPassed)})'
```

## Historical Analysis

Use the stats database for long-term analysis:

### Import Results

```bash
deno run --allow-all cli/centralgauge.ts stats-import results/
```

### View Run History

```bash
deno run --allow-all cli/centralgauge.ts stats-runs
```

### Compare Models Over Time

```bash
deno run --allow-all cli/centralgauge.ts stats-compare opus gpt-5
```

### Detect Regressions

```bash
deno run --allow-all cli/centralgauge.ts stats-regression --threshold 10
```

## Troubleshooting Results

### All Tasks Failed

Check:

1. Container is running: `docker ps`
2. API keys are set: `source .env && echo $ANTHROPIC_API_KEY`
3. Debug logs: Run with `--debug` flag

### Inconsistent Results

If the same model produces different results:

1. Check temperature setting (0.0 for deterministic)
2. Verify task set hash matches
3. Check for rate limiting or timeouts

### Missing Cost Data

Cost estimates require provider pricing data. Mock provider always shows $0.00.

## Next Steps

- [Running Benchmarks](./running-benchmarks.md) - Generate results
- [Configuration](./configuration.md) - Customize output
- [CLI Reference](../cli/commands.md) - All analysis commands
