# Agent Configuration Testing

Compare different Claude Code agent configurations to find the best setup for AL code generation.

## Quick Start

### Using the Benchmark CLI (Recommended)

```bash
# Compare config-a vs config-b on all tasks
deno task bench --agents config-a,config-b

# Compare on specific tasks
deno task bench --agents config-a,config-b --tasks "tasks/easy/*.yml"

# With debug output
deno task bench --agents config-a,config-b --tasks "tasks/easy/CG-AL-E001*.yml" --debug
```

### Using the Standalone Script

```bash
# Run default comparison (single prompt)
deno run --allow-all test-configs/compare-configs.ts

# Test with a benchmark task
deno run --allow-all test-configs/compare-configs.ts --task tasks/easy/CG-AL-E001-basic-table.yml
```

## Directory Structure

Each config folder is a self-contained Claude Code project:

```
test-configs/
├── config-a/                    # Minimal guidance setup
│   ├── CLAUDE.md                # System prompt instructions
│   ├── .mcp.json                # MCP server definitions
│   └── .claude/
│       ├── settings.local.json  # Permissions
│       ├── skills/              # Reference knowledge
│       └── rules/               # Coding rules
│
├── config-b/                    # Detailed guidance setup
│   └── ...                      # Same structure
│
└── compare-configs.ts           # Test runner script
```

## Creating a New Config

1. Copy an existing config:
   ```bash
   cp -r test-configs/config-a test-configs/config-c
   ```

2. Modify the files you want to test:
   - `CLAUDE.md` - Main instructions
   - `.claude/skills/*.md` - Reference knowledge (auto-loaded when relevant)
   - `.claude/rules/*.md` - Always-active coding rules
   - `.claude/settings.local.json` - Permissions and MCP servers

3. Run comparison:
   ```bash
   deno run --allow-all test-configs/compare-configs.ts \
     --config-a test-configs/config-a \
     --config-b test-configs/config-c
   ```

## File Types

| File                          | Loading              | Purpose               |
| ----------------------------- | -------------------- | --------------------- |
| `CLAUDE.md`                   | Always               | System prompt context |
| `.claude/skills/*.md`         | Auto (context-based) | Reference docs        |
| `.claude/rules/*.md`          | Always               | Coding guidelines     |
| `.claude/settings.local.json` | Always               | Permissions           |
| `.mcp.json`                   | On startup           | External tools        |

## Compare Script Options

```bash
deno run --allow-all test-configs/compare-configs.ts [options]

Options:
  --prompt <text>     Custom prompt to test
  --task <path>       Load prompt from task YAML file
  --model <id>        Model (default: claude-sonnet-4-5-20250929)
  --config-a <path>   First config (default: test-configs/config-a)
  --config-b <path>   Second config (default: test-configs/config-b)
```

## Agent Configuration Files

The benchmark uses agent YAML files in `agents/` that reference these config directories:

```yaml
# agents/config-a.yml
id: config-a
name: "Config A (Minimal)"
extends: default
workingDir: test-configs/config-a # Points to Claude Code config

# agents/config-b.yml
id: config-b
name: "Config B (Detailed)"
extends: default
workingDir: test-configs/config-b # Points to Claude Code config
```

The `workingDir` tells the agent SDK to load CLAUDE.md, skills, and rules from that directory.

## Example Experiments

### Test: Does more guidance help?

- **config-a**: Minimal CLAUDE.md, no skills
- **config-b**: Detailed CLAUDE.md with AL patterns and skills

```bash
deno task bench --agents config-a,config-b --tasks "tasks/easy/*.yml"
```

### Test: Do code examples help?

- **config-a**: Text descriptions only
- **config-b**: Full AL code snippets in skills

### Test: MCP tools impact

- **config-a**: No MCP servers
- **config-b**: tree-sitter-mcp for code analysis

## Expected Output

```
============================================================
AGENT BENCHMARK RESULTS
============================================================

Summary:
------------------------------------------------------------
Agent                | Pass   | Fail   | Cost       | Turns
------------------------------------------------------------
config-a             | 3      | 2      | $0.0523    | 45
config-b             | 4      | 1      | $0.0687    | 38
------------------------------------------------------------

Comparison:
  Winner: config-b (80% vs 60%)
  Cost difference: +$0.0164 (config-b vs config-a)

  Total duration: 2m 34s
  Results: 10
  Saved: results/agent-benchmark-1234567890.json
```
