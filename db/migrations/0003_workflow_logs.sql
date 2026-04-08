-- Migration: 0003_workflow_logs.sql
-- Description: Add workflow_logs table for observability and failure tracking
-- Tables: workflow_logs
-- Applied to: Cloudflare D1
-- Depends on: 0001_init.sql

-- ============================================================
-- workflow_logs
-- One row per workflow execution event.
-- Written by n8n workflows (via the failure_notifier and orchestrators)
-- through POST /api/internal/workflow-logs.
--
-- Captures:
--   - workflow failures (event_type = 'error')
--   - retry attempts   (event_type = 'retry')
--   - successful runs  (event_type = 'completed')
--   - informational checkpoints (event_type = 'info' | 'warning')
--
-- topic_slug and date_key are nullable because some workflows
-- (e.g. intraday ingestion) do not operate on a single topic/day.
-- ============================================================
CREATE TABLE IF NOT EXISTS workflow_logs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_name  TEXT    NOT NULL,              -- e.g. 'Daily — Orchestrator'
  execution_id   TEXT,                          -- n8n execution ID for cross-referencing
  topic_slug     TEXT,                          -- nullable: set when topic-specific
  date_key       TEXT,                          -- YYYY-MM-DD, nullable
  event_type     TEXT    NOT NULL DEFAULT 'info',
                                                -- info | warning | error | retry | completed
  module_name    TEXT,                          -- which node/step failed or completed
  error_message  TEXT,                          -- short error description
  error_details  TEXT,                          -- full stack trace or extended diagnostics
  metadata_json  TEXT,                          -- arbitrary structured context
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Latest events per workflow (primary debugging query)
CREATE INDEX IF NOT EXISTS idx_workflow_logs_workflow_created
  ON workflow_logs (workflow_name, created_at DESC);

-- All errors and retries across all workflows (failure dashboard)
CREATE INDEX IF NOT EXISTS idx_workflow_logs_event_type_created
  ON workflow_logs (event_type, created_at DESC);

-- Logs for a specific topic/day (per-topic debugging)
CREATE INDEX IF NOT EXISTS idx_workflow_logs_topic_date_created
  ON workflow_logs (topic_slug, date_key, created_at DESC);
