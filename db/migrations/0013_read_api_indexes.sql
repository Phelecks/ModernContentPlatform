-- Migration: 0013_read_api_indexes.sql
-- Description: Add composite indexes to optimize read API query patterns
-- Applied to: Cloudflare D1
-- Depends on: 0001_init.sql

-- ============================================================
-- Optimized timeline read: includes status in the index to avoid
-- filtering rows that don't match status = 'active' after index scan.
-- Covers the primary query pattern:
--   WHERE topic_slug = ? AND date_key = ? AND status = 'active'
--   ORDER BY event_at DESC
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_alerts_topic_date_status_event
  ON alerts (topic_slug, date_key, status, event_at DESC);

-- ============================================================
-- Optimized daily_status navigation lookup.
-- Covers the navigation and day-status API query patterns:
--   WHERE topic_slug = ? AND date_key = ?
-- The UNIQUE constraint on (topic_slug, date_key) already provides
-- this, but an explicit index ensures optimal lookup when the
-- unique constraint is not used as primary access path.
-- ============================================================
-- (Covered by existing UNIQUE constraint — no additional index needed)

-- ============================================================
-- Sources endpoint: optimize filtered reads.
-- Covers:
--   WHERE is_active = 1 AND topic_slug = ?
--   ORDER BY topic_slug ASC, priority_weight DESC
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_sources_active_topic_priority
  ON sources (is_active, topic_slug, priority_weight DESC);
