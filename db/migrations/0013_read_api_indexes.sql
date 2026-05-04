-- Migration: 0013_read_api_indexes.sql
-- Description: Replace timeline index to include status column for read API optimization
-- Applied to: Cloudflare D1
-- Depends on: 0001_init.sql

-- ============================================================
-- Optimized timeline read: replaces idx_alerts_topic_date_event to include
-- the status column, avoiding post-index filtering on status = 'active'.
-- Covers the primary query pattern:
--   WHERE topic_slug = ? AND date_key = ? AND status = 'active'
--   ORDER BY event_at DESC
-- ============================================================
DROP INDEX IF EXISTS idx_alerts_topic_date_event;

CREATE INDEX IF NOT EXISTS idx_alerts_topic_date_status_event
  ON alerts (topic_slug, date_key, status, event_at DESC);
