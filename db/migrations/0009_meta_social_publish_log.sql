-- Migration: 0009_meta_social_publish_log.sql
-- Adds a tracking table for Meta (Instagram/Facebook) social publishing attempts.
-- Records every publish attempt per asset so failures can be observed and retried.
-- Non-blocking: failure to write here should not halt the publishing workflow.

CREATE TABLE IF NOT EXISTS meta_social_publish_log (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Content identification
  topic_slug        TEXT    NOT NULL,
  date_key          TEXT    NOT NULL,
  asset_type        TEXT    NOT NULL CHECK (asset_type IN ('daily_post', 'story')),
  source_type       TEXT    NOT NULL CHECK (source_type IN ('daily_summary', 'alert')),
  source_id         TEXT,                         -- alert item_id or NULL for daily_summary

  -- Platform routing
  platform          TEXT    NOT NULL CHECK (platform IN ('instagram', 'facebook')),
  post_type         TEXT    NOT NULL CHECK (post_type IN ('feed', 'story')),

  -- Publish outcome
  status            TEXT    NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'published', 'failed', 'skipped')),
  platform_post_id  TEXT,                         -- ID returned by Meta Graph API on success
  attempt           INTEGER NOT NULL DEFAULT 1,

  -- Error tracking
  error_message     TEXT,

  -- Timestamps
  created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Index for querying by topic/date to check publish state before re-attempting
CREATE INDEX IF NOT EXISTS idx_meta_social_publish_log_topic_date
  ON meta_social_publish_log (topic_slug, date_key);

-- Index for querying recent failures for operational monitoring
CREATE INDEX IF NOT EXISTS idx_meta_social_publish_log_status
  ON meta_social_publish_log (status, created_at);
