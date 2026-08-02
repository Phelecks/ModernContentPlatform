-- Migration: 0015_ai_invocations.sql
-- Description: Provider-neutral AI runtime telemetry for the Cloudflare Worker
-- Tables: ai_invocations
--
-- This table is additive. openai_usage_log remains read-only during the
-- compatibility window and can be removed in a later, explicit migration.

CREATE TABLE IF NOT EXISTS ai_invocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL UNIQUE,
  task TEXT NOT NULL,
  environment TEXT NOT NULL,
  execution_id TEXT,
  topic_slug TEXT,
  date_key TEXT,
  provider TEXT,
  model TEXT,
  prompt_version TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  gateway_log_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('ok', 'error')),
  fallback_used INTEGER NOT NULL DEFAULT 0 CHECK (fallback_used IN (0, 1)),
  cache_status TEXT,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  estimated_cost_usd REAL,
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_ai_invocations_task_created
  ON ai_invocations (task, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_invocations_status_created
  ON ai_invocations (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_invocations_topic_date
  ON ai_invocations (topic_slug, date_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_invocations_gateway_log
  ON ai_invocations (gateway_log_id);
