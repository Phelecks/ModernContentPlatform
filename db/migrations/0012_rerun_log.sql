-- Migration: 0012_rerun_log.sql
-- Adds a tracking table for operator-initiated rerun and recovery attempts.
-- Records every rerun attempt so operators have visibility into retry history,
-- idempotency can be enforced, and failures can be diagnosed.

CREATE TABLE IF NOT EXISTS rerun_log (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,

  -- What is being rerun
  rerun_type        TEXT    NOT NULL CHECK (rerun_type IN (
                              'daily_publish', 'social_publish',
                              'youtube_upload', 'alert_delivery',
                              'intraday_workflow')),
  topic_slug        TEXT    NOT NULL,
  date_key          TEXT    NOT NULL,

  -- Link to original failed record
  source_table      TEXT    NOT NULL,             -- e.g. 'publish_jobs', 'social_publish_log'
  source_id         INTEGER,                      -- ID of the failed row being retried

  -- Rerun outcome
  status            TEXT    NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'running', 'success', 'failed', 'skipped')),
  attempt           INTEGER NOT NULL DEFAULT 1,
  triggered_by      TEXT    NOT NULL DEFAULT 'operator',  -- 'operator' | 'schedule' | 'auto'
  workflow_run_id   TEXT,                         -- n8n execution ID for traceability

  -- Error tracking
  error_message     TEXT,

  -- Timestamps
  created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Index for querying reruns by type and status
CREATE INDEX IF NOT EXISTS idx_rerun_log_type_status
  ON rerun_log (rerun_type, status, created_at DESC);

-- Index for querying reruns by topic/date
CREATE INDEX IF NOT EXISTS idx_rerun_log_topic_date
  ON rerun_log (topic_slug, date_key, created_at DESC);

-- Index for finding recent reruns for the same source record (idempotency check)
CREATE INDEX IF NOT EXISTS idx_rerun_log_source
  ON rerun_log (source_table, source_id, created_at DESC);
