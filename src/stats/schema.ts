/**
 * SQLite schema definitions for stats persistence
 */

/**
 * Schema version for migrations
 */
export const SCHEMA_VERSION = 1;

/**
 * SQL statements to create the schema
 */
export const CREATE_SCHEMA = `
-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Benchmark runs (one per invocation)
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT UNIQUE NOT NULL,
  executed_at TEXT NOT NULL,
  config_hash TEXT NOT NULL,
  task_set_hash TEXT NOT NULL,
  total_tasks INTEGER NOT NULL,
  total_models INTEGER NOT NULL,
  total_cost REAL NOT NULL,
  total_tokens INTEGER NOT NULL,
  total_duration_ms INTEGER NOT NULL,
  pass_rate_1 REAL NOT NULL,
  pass_rate_2 REAL NOT NULL,
  overall_pass_rate REAL NOT NULL,
  average_score REAL NOT NULL,
  metadata_json TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Individual task execution results
CREATE TABLE IF NOT EXISTS results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  task_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  model TEXT NOT NULL,
  provider TEXT NOT NULL,
  success INTEGER NOT NULL,
  final_score REAL NOT NULL,
  passed_attempt INTEGER NOT NULL,
  total_tokens INTEGER NOT NULL,
  prompt_tokens INTEGER NOT NULL,
  completion_tokens INTEGER NOT NULL,
  total_cost REAL NOT NULL,
  total_duration_ms INTEGER NOT NULL,
  variant_config_json TEXT,
  result_json TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(run_id, task_id, variant_id)
);

-- Per-attempt details
CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  result_id INTEGER NOT NULL REFERENCES results(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL,
  success INTEGER NOT NULL,
  score REAL NOT NULL,
  tokens_used INTEGER NOT NULL,
  cost REAL NOT NULL,
  duration_ms INTEGER NOT NULL,
  compile_success INTEGER,
  test_success INTEGER,
  failure_reasons_json TEXT,
  UNIQUE(result_id, attempt_number)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_runs_executed_at ON runs(executed_at);
CREATE INDEX IF NOT EXISTS idx_runs_config_hash ON runs(config_hash);
CREATE INDEX IF NOT EXISTS idx_runs_task_set_hash ON runs(task_set_hash);

CREATE INDEX IF NOT EXISTS idx_results_run_id ON results(run_id);
CREATE INDEX IF NOT EXISTS idx_results_task_id ON results(task_id);
CREATE INDEX IF NOT EXISTS idx_results_variant_id ON results(variant_id);
CREATE INDEX IF NOT EXISTS idx_results_provider ON results(provider);
CREATE INDEX IF NOT EXISTS idx_results_success ON results(success);

CREATE INDEX IF NOT EXISTS idx_attempts_result_id ON attempts(result_id);
`;

/**
 * Views for common queries
 */
export const CREATE_VIEWS = `
-- Latest result per task/model combination
CREATE VIEW IF NOT EXISTS latest_results AS
SELECT r.*
FROM results r
INNER JOIN (
  SELECT task_id, variant_id, MAX(created_at) as max_created
  FROM results
  GROUP BY task_id, variant_id
) latest ON r.task_id = latest.task_id
        AND r.variant_id = latest.variant_id
        AND r.created_at = latest.max_created;

-- Model performance summary (all time)
CREATE VIEW IF NOT EXISTS model_performance AS
SELECT
  variant_id,
  provider,
  model,
  COUNT(*) as total_executions,
  SUM(success) as total_passed,
  ROUND(AVG(CAST(success AS REAL)) * 100, 1) as pass_rate,
  ROUND(AVG(final_score), 1) as avg_score,
  SUM(total_cost) as total_cost,
  SUM(total_tokens) as total_tokens
FROM results
GROUP BY variant_id, provider, model;
`;

/**
 * SQL to drop all tables (for testing/reset)
 */
export const DROP_SCHEMA = `
DROP VIEW IF EXISTS model_performance;
DROP VIEW IF EXISTS latest_results;
DROP TABLE IF EXISTS attempts;
DROP TABLE IF EXISTS results;
DROP TABLE IF EXISTS runs;
DROP TABLE IF EXISTS schema_version;
`;

/**
 * Migrations for schema upgrades
 */
export const MIGRATIONS: Record<number, string> = {
  // Version 1 is the initial schema (created above)
  // Future migrations will go here:
  // 2: "ALTER TABLE runs ADD COLUMN new_field TEXT;",
};
