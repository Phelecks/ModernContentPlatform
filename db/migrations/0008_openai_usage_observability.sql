-- Migration: 0008_openai_usage_observability.sql
-- Description: Extend openai_usage_log with retry/cost/diagnostic fields
-- Tables: openai_usage_log
-- Applied to: Cloudflare D1
-- Depends on: 0007_openai_usage_log.sql

ALTER TABLE openai_usage_log ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE openai_usage_log ADD COLUMN error_message TEXT;
ALTER TABLE openai_usage_log ADD COLUMN request_latency_ms INTEGER;
ALTER TABLE openai_usage_log ADD COLUMN estimated_cost_usd REAL;
ALTER TABLE openai_usage_log ADD COLUMN metadata_json TEXT;

CREATE INDEX IF NOT EXISTS idx_openai_usage_task_status_created
  ON openai_usage_log (task, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_openai_usage_retry_created
  ON openai_usage_log (retry_count, created_at DESC);
