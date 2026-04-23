-- Migration: 0011_youtube_publish_log.sql
-- Adds a tracking table for YouTube video upload attempts.
-- Records every upload attempt per topic/date so failures can be observed,
-- retried, and the resulting video_id written back into video.json.
-- Non-blocking: failure to write here should not halt the publishing workflow.

CREATE TABLE IF NOT EXISTS youtube_publish_log (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Content identification
  topic_slug        TEXT    NOT NULL,
  date_key          TEXT    NOT NULL,

  -- YouTube upload outcome
  status            TEXT    NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'uploading', 'published', 'failed', 'skipped')),
  youtube_video_id  TEXT,                         -- YouTube video ID returned on success
  visibility        TEXT    CHECK (visibility IN ('public', 'unlisted', 'private')),
  attempt           INTEGER NOT NULL DEFAULT 1,

  -- Error tracking
  error_message     TEXT,

  -- Timestamps
  created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Index for querying by topic/date to check upload state before re-attempting
CREATE INDEX IF NOT EXISTS idx_youtube_publish_log_topic_date
  ON youtube_publish_log (topic_slug, date_key);

-- Index for querying recent failures for operational monitoring
CREATE INDEX IF NOT EXISTS idx_youtube_publish_log_status
  ON youtube_publish_log (status, created_at);
