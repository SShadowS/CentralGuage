# Outstanding Technical Debt Items

## Completed Items

| ID | Item | Status | Impact |
|----|------|--------|--------|
| TD-001 | Decompose `src/agents/executor.ts` | ✅ Done | 2,116 → 1,432 lines (-32%) |
| TD-002 | Add tests for `src/sandbox/windows-provider.ts` | ✅ Done | +830 test lines, 90% coverage |
| TD-003 | Extract LLM adapter base class | ✅ Done | ~1,500 lines consolidated |
| TD-004 | Consolidate prereq resolution | ✅ Done | ~170 lines consolidated |
| TD-009 | Extract constants | ✅ Done | 40+ magic numbers centralized |
| TD-013 | Remove deprecated model names | ✅ Done | Removed Claude 3, GPT-3.5 presets |
| TD-014 | Clean commented code in renderer.ts | ✅ Done | 3 lines removed |
| TD-015 | Add barrel exports to missing modules | ✅ Done | 7 mod.ts files added |
| TD-010 | Replace `any` types in adapters | ✅ Done | 5 instances → 0 |
| TD-006 | Remove legacy `src/tasks/executor.ts` | ✅ Done | -779 lines (executor + test) |
| TD-008 | Add tests for `src/stats/sqlite-storage.ts` | ✅ Done | +820 test lines, 87% branch coverage |
| TD-007 | Implement unified logger | ✅ Done | ~200 console calls → Logger, --log-level flag |
| TD-011 | Use domain-specific errors | ✅ Done | 26 → 0 generic `throw new Error()` |

## Phase 2: Decomposition (Remaining)

| ID | Item | Effort | Files Affected | Risk if Not Addressed |
|----|------|--------|----------------|----------------------|
| TD-005 | Decompose `cli/commands/bench-command.ts` (1,745 lines) | L | 1 file -> 3-4 modules | CLI changes risky, hard to test |

## Phase 3: Consolidation

| ID | Item | Effort | Files Affected | Risk if Not Addressed |
|----|------|--------|----------------|----------------------|
| TD-012 | Decompose `src/container/bc-container-provider.ts` (1,042 lines) | M | 1 file -> 2-3 modules | Container changes risky |

## Key Files Reference

**Large Files (Priority Decomposition)**:
- `cli/commands/bench-command.ts` (1,745 lines) - TD-005
- `cli/commands/report-command.ts` (1,131 lines)
- `src/container/bc-container-provider.ts` (1,042 lines) - TD-012
- `src/tasks/executor-v2.ts` (1,031 lines)

**Untested Critical Infrastructure**:
- *(none remaining)*

## Metrics

| Metric | Before | Current | Target |
|--------|--------|---------|--------|
| Test count | 358 | 410+ | 400+ ✅ |
| Files > 500 lines | 9 | 8 | 3 |
| `executor.ts` lines | 2,116 | 1,432 | ~400 |
| Direct console.log calls (src/) | 271 | 0 | 0 ✅ |
| Modules with mod.ts | 6 | 13 | 13 ✅ |
| Generic `throw new Error()` | 68 | 0 | 0 ✅ |
