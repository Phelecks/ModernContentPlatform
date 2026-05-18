-- 0014_summary_index.sql
--
-- Adds a summary_index table for optimized navigation and latest-day queries.
--
-- Purpose:
--   daily_status accumulates a row for every topic/date that has received any
--   intraday alert, including pending rows with no editorial content. This makes
--   "find the latest published/ready date for topic X" queries slower as the
--   table grows. summary_index is written only when summary_available = 1, so
--   it stays compact and serves as a fast index specifically for content-ready
--   days.
--
-- Primary read patterns:
--   1. Latest published/ready date for a topic (TopicPage redirect)
--      SELECT date_key FROM summary_index
--      WHERE topic_slug = ? AND page_state IN ('ready', 'published')
--      ORDER BY date_key DESC LIMIT 1
--
--   2. All published dates for a topic (calendar / navigation listing)
--      SELECT date_key FROM summary_index
--      WHERE topic_slug = ? AND page_state = 'published'
--      ORDER BY date_key DESC
--
-- Written by: POST /api/internal/daily-status when summary_available = 1.

CREATE TABLE IF NOT EXISTS summary_index (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_slug TEXT NOT NULL,
  date_key TEXT NOT NULL,
  page_state TEXT NOT NULL DEFAULT 'ready',
  summary_available INTEGER NOT NULL DEFAULT 0,
  video_available INTEGER NOT NULL DEFAULT 0,
  article_available INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE(topic_slug, date_key)
);

-- For the most common read: latest ready/published date per topic
CREATE INDEX IF NOT EXISTS idx_summary_index_topic_state_date
  ON summary_index(topic_slug, page_state, date_key DESC);

-- For direct single-row lookups by topic + date
CREATE INDEX IF NOT EXISTS idx_summary_index_topic_date
  ON summary_index(topic_slug, date_key);
