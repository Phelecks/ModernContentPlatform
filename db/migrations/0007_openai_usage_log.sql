-- Migration: 0007_openai_usage_log.sql
-- Description: Add openai_usage_log table for per-task AI call monitoring
-- Tables: openai_usage_log
-- Applied to: Cloudflare D1
-- Depends on: 0001_init.sql

-- ============================================================
-- openai_usage_log
-- One row per OpenAI API call made by an n8n workflow node.
-- Written by n8n workflows (after each AI call) via the
-- POST /api/internal/workflow-logs endpoint or a dedicated
-- Code node, using metadata_json on workflow_logs as the
-- carrier until a dedicated endpoint is wired.
--
-- Used for:
--   - monitoring token spend per task and model
--   - tracking daily/weekly call volumes
--   - alerting when daily_call_budgets are exceeded
--   - identifying cost anomalies early
--
-- topic_slug and date_key are nullable because some tasks
-- (e.g. alertClassification) do not always map to one topic/day.
-- ============================================================
CREATE TABLE IF NOT EXISTS openai_usage_log (
  id                  INTEGER  PRIMARY KEY AUTOINCREMENT,
  task                TEXT     NOT NULL,
                                -- alertClassification | timelineFormatting |
                                -- dailySummary | articleGeneration |
                                -- expectationCheck | tomorrowOutlook |
                                -- videoScript | youtubeMetadata
  model               TEXT     NOT NULL,           -- e.g. 'gpt-4o-mini', 'gpt-4o'
  workflow_name       TEXT,                         -- n8n workflow display name
  execution_id        TEXT,                         -- n8n execution ID for tracing
  topic_slug          TEXT,                         -- nullable: set when topic-specific
  date_key            TEXT,                         -- YYYY-MM-DD, nullable
  prompt_tokens       INTEGER  NOT NULL DEFAULT 0,
  completion_tokens   INTEGER  NOT NULL DEFAULT 0,
  total_tokens        INTEGER  NOT NULL DEFAULT 0,
  status              TEXT     NOT NULL DEFAULT 'ok',
                                -- ok | error | retry
  error_code          TEXT,                         -- OpenAI error code if status='error'
  created_at          TEXT     NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Token usage by task over time (cost analysis per task)
CREATE INDEX IF NOT EXISTS idx_openai_usage_task_created
  ON openai_usage_log (task, created_at DESC);

-- Token usage by model (compare cost across models)
CREATE INDEX IF NOT EXISTS idx_openai_usage_model_created
  ON openai_usage_log (model, created_at DESC);

-- Per-topic-day usage (daily cost attribution)
CREATE INDEX IF NOT EXISTS idx_openai_usage_topic_date
  ON openai_usage_log (topic_slug, date_key, created_at DESC);

-- Failed calls (error monitoring and retry audit)
CREATE INDEX IF NOT EXISTS idx_openai_usage_status_created
  ON openai_usage_log (status, created_at DESC);
