# TUI TODO List

Placeholder functionality and improvements needed for the TUI.

## Benchmark Screen (`cli/tui/screens/benchmark.ts`)

- [x] ~~**Show error message when no models selected**~~ ~~(line 228)~~
  - ~~Currently silently returns if user tries to start with no models~~
  - ~~Should display an error notification~~
  - Now shows "Please select at least one model" error

- [x] ~~**Parse actual progress events from benchmark output**~~ ~~(line 277)~~
  - ~~Currently just displays raw stdout chunks~~
  - ~~Should parse structured events from ParallelBenchmarkOrchestrator~~
  - ~~Display: task name, model, attempt, pass/fail status~~
  - Added `--json-events` flag to bench command for machine-readable output
  - TUI parses JSON events and displays: task, model, attempt, status, pass/fail counts

## Tasks Screen (`cli/tui/screens/tasks.ts`)

- [x] ~~**Show task preview**~~ ~~(line 139)~~
  - ~~When pressing Enter on a task, show YAML content~~
  - ~~Could use a modal/overlay or dedicated preview screen~~
  - ~~Display: description, test file, expected objects~~
  - Implemented using modal component in `cli/tui/components/modal.ts`

## Results Screen (`cli/tui/screens/results.ts`)

- [x] ~~**Run centralgauge report command**~~ ~~(line 197)~~
  - ~~Wire up to actual `centralgauge report` CLI action~~
  - ~~Show generation progress~~
  - ~~Open HTML report when complete (or show path)~~
  - Implemented in `cli/services/report-actions.ts`
  - Shows path to generated report via notification

- [x] ~~**Model comparison UI**~~ ~~(line 203-204)~~
  - ~~Allow selecting 2+ models from results~~
  - ~~Show side-by-side comparison (pass rates, costs, failures)~~
  - ~~Could integrate with `stats-compare` command~~
  - Implemented in `cli/tui/components/compare-modal.ts`
  - Uses `cli/services/compare-actions.ts` to wrap stats storage
  - Shows model selection, then comparison results in preview modal

## Container Screen (`cli/tui/screens/container.ts`)

- [x] ~~**Full health check**~~ ~~(line 216-218)~~
  - ~~Wire up to `centralgauge health` command~~
  - ~~Display: API key status, container connectivity, compiler access~~
  - ~~Show actionable fixes for any failures~~
  - Implemented in `cli/services/health-actions.ts`
  - Shows summary via notification (detailed view deferred to modal)

## Config Screen (`cli/tui/screens/config.ts`)

- [x] **Initialize config file** ~~(line 179-180)~~
  - ~~Wire up to `centralgauge config init` command~~
  - ~~Show success/failure message~~
  - ~~Refresh config display after creation~~
  - Implemented in `cli/services/config-actions.ts`

- [x] **Create .env template** ~~(line 184-185)~~
  - ~~Wire up to `centralgauge env create` command~~
  - ~~Show success/failure message~~
  - ~~Optionally open file in editor~~
  - Implemented in `cli/services/config-actions.ts`

## General Improvements

- [x] ~~Add modal/dialog component for confirmations and previews~~
  - Implemented in `cli/tui/components/modal.ts`
  - Supports: title, scrollable content, keyboard navigation, action buttons
  - Helper functions: `showModal()`, `showConfirm()`, `showPreview()`
- [x] ~~Add notification/toast component for success/error messages~~
  - Implemented in `cli/tui/components/notification.ts`
- [x] ~~Improve keyboard shortcuts consistency across screens~~
  - Implemented in `cli/tui/components/keyboard.ts`
  - All screens use `createKeyboardHandler()` for consistent shortcuts
  - Standard keys: b/Escape=back, q=quit, arrows/j/k=nav, Enter=select, r=refresh
- [x] ~~Add loading spinners for async operations~~
  - Implemented in `cli/tui/components/spinner.ts`
  - Integrated into health check and report generation
- [x] ~~Consider adding vim-style `/` search in task browser~~
  - Implemented in `cli/tui/components/search-input.ts`
  - Press `/` to enter search mode, type to filter tasks
  - Enter to confirm, Escape to cancel and clear filter
  - `n`/`N` to navigate between matches
  - Backspace to edit search query
