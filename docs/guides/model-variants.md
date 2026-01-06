# Model Variants

Model variants allow you to compare the same model with different configurations, enabling precise evaluation of how settings like temperature, token limits, and system prompts affect performance.

## Variant Syntax

Use the `@` symbol to specify variant parameters:

```bash
deno task bench --llms "model@param=value"
```

### Single Parameter

```bash
deno task bench --llms "opus@temp=0.5"
```

### Multiple Parameters

Separate parameters with semicolons:

```bash
deno task bench --llms "opus@temp=0.5;maxTokens=8000"
```

### Comparing Variants

```bash
deno task bench --llms "opus@temp=0.1,opus@temp=0.5,opus@temp=0.9"
```

## Supported Parameters

| Parameter | Aliases | Type | Description |
|-----------|---------|------|-------------|
| `temperature` | `temp` | number | Generation temperature (0.0-1.0) |
| `maxTokens` | `max_tokens`, `tokens` | number | Maximum response tokens |
| `systemPromptName` | `prompt`, `system_prompt` | string | Named prompt from config |
| `thinkingBudget` | `thinking`, `reasoning` | number | Extended thinking/reasoning budget |
| `timeout` | - | number | Request timeout in ms |
| `profile` | - | string | Named variant profile from config |

## Temperature Comparison

Temperature controls the randomness of model outputs:

```bash
# Compare different temperatures
deno task bench --llms "sonnet@temp=0.0,sonnet@temp=0.3,sonnet@temp=0.7,sonnet@temp=1.0"
```

| Temperature | Behavior |
|-------------|----------|
| 0.0 | Most deterministic, repeatable |
| 0.1-0.3 | Low variance, consistent code style |
| 0.5-0.7 | Balanced creativity and consistency |
| 0.8-1.0 | High variance, more creative |

For AL code generation, lower temperatures (0.1-0.3) typically produce more consistent results.

## Token Limits

Control maximum response length:

```bash
# Compare different token limits
deno task bench --llms "opus@tokens=4000,opus@tokens=8000,opus@tokens=16000"
```

Higher token limits allow for:
- More complete code
- Better comments and documentation
- More detailed error handling

But may also lead to:
- Higher costs
- More verbose unnecessary content
- Slower response times

## Extended Thinking / Reasoning

For reasoning-capable models, set a thinking budget:

### Claude (Extended Thinking)

```bash
# Claude with extended thinking
deno task bench --llms "opus@thinking=10000"
deno task bench --llms "opus@thinking=50000;tokens=20000"
```

### OpenAI (Reasoning Effort)

For o1/o3 models, the thinking budget maps to reasoning effort:

```bash
# OpenAI reasoning models
deno task bench --llms "o3@reasoning=5000"   # Low effort
deno task bench --llms "o3@reasoning=20000"  # Medium effort
deno task bench --llms "o3@reasoning=50000"  # High effort
```

### Comparing Reasoning Levels

```bash
deno task bench \
  --llms "opus@reasoning=10000,opus@reasoning=30000,opus@reasoning=50000,o3@reasoning=20000"
```

## System Prompts

Use named system prompts from configuration:

### Define in Configuration

```yaml
# .centralgauge.yml
systemPrompts:
  strict-al:
    content: |
      You are a strict AL code generator for Business Central.
      Only output valid AL code without explanations.

  detailed:
    content: |
      You are an AL code expert. Generate well-documented code
      with proper error handling and comments.
```

### Use in Benchmarks

```bash
deno task bench --llms "sonnet@prompt=strict-al,sonnet@prompt=detailed"
```

## Variant Profiles

Define complete variant configurations as reusable profiles:

### Define Profiles

```yaml
# .centralgauge.yml
variantProfiles:
  conservative:
    description: "Low temperature, standard tokens"
    config:
      temperature: 0.1
      maxTokens: 4000

  creative:
    description: "Higher temperature, more tokens"
    config:
      temperature: 0.7
      maxTokens: 8000

  reasoning:
    description: "Extended thinking for complex tasks"
    config:
      temperature: 0.2
      thinkingBudget: 50000
      maxTokens: 16000

  strict:
    description: "Strict output with custom prompt"
    config:
      temperature: 0.1
      maxTokens: 4000
      systemPromptName: strict-al
```

### Use Profiles

```bash
# Single profile
deno task bench --llms "opus@profile=conservative"

# Compare profiles
deno task bench --llms "opus@profile=conservative,opus@profile=creative,opus@profile=reasoning"

# Mix profiles and inline parameters
deno task bench --llms "opus@profile=conservative,opus@temp=0.5"
```

## Variant Identifiers

Each variant gets a unique identifier for results tracking:

```
provider/model@param1=value1;param2=value2
```

Examples:
- `anthropic/claude-opus-4-5-20251101@temp=0.5`
- `openai/gpt-4o@temp=0.1;tokens=8000`
- `anthropic/claude-opus-4-5-20251101@profile=reasoning`

These identifiers appear in results files and reports.

## Practical Examples

### Optimizing Temperature

Find the best temperature for a model:

```bash
deno task bench \
  --llms "sonnet@temp=0.1,sonnet@temp=0.2,sonnet@temp=0.3,sonnet@temp=0.4" \
  --tasks "tasks/**/*.yml" \
  --output results/temperature-sweep
```

### Comparing Reasoning Depth

Evaluate thinking budget impact:

```bash
deno task bench \
  --llms "opus@thinking=0,opus@thinking=10000,opus@thinking=30000,opus@thinking=50000" \
  --tasks "tasks/hard/*.yml" \
  --output results/reasoning-comparison
```

### Provider Comparison at Similar Settings

Compare providers with matched settings:

```bash
deno task bench \
  --llms "opus@temp=0.1;tokens=8000,gpt-5@temp=0.1;tokens=8000,gemini@temp=0.1;tokens=8000" \
  --tasks "tasks/**/*.yml"
```

### Custom System Prompt A/B Test

Test different prompting strategies:

```bash
deno task bench \
  --llms "sonnet@prompt=default,sonnet@prompt=strict-al,sonnet@prompt=detailed" \
  --tasks "tasks/medium/*.yml"
```

## Best Practices

### Start with Defaults

Begin with default settings to establish a baseline:

```bash
deno task bench --llms sonnet --tasks "tasks/**/*.yml"
```

### Vary One Parameter at a Time

When optimizing, change only one parameter:

```bash
# Good: isolate temperature effect
--llms "opus@temp=0.1,opus@temp=0.3,opus@temp=0.5"

# Less useful: multiple changes
--llms "opus@temp=0.1;tokens=4000,opus@temp=0.5;tokens=8000"
```

### Use Profiles for Reproducibility

Define profiles in config for consistent testing:

```yaml
variantProfiles:
  baseline:
    config:
      temperature: 0.1
      maxTokens: 4000
```

```bash
deno task bench --llms "opus@profile=baseline,gpt-5@profile=baseline"
```

### Track Results Over Time

Import results to track variant performance:

```bash
deno run --allow-all cli/centralgauge.ts stats-import results/
deno run --allow-all cli/centralgauge.ts stats-compare opus@temp=0.1 opus@temp=0.3
```

## Next Steps

- [Running Benchmarks](./running-benchmarks.md) - Full benchmark guide
- [Configuration](./configuration.md) - Define system prompts and profiles
- [Understanding Results](./understanding-results.md) - Analyze variant comparisons
