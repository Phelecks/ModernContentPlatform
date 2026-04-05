-- Migration: 0002_event_clusters_unique.sql
-- Description: Add UNIQUE constraint on event_clusters(topic_slug, date_key, cluster_label)
-- Required by: intraday workflow module 07 (D1 Persistence) cluster upsert logic
--
-- Without this constraint, INSERT ... ON CONFLICT(topic_slug, date_key, cluster_label)
-- would never match a conflict and would create duplicate cluster rows on every run.
--
-- Applied to: Cloudflare D1
-- Depends on: 0001_init.sql

-- SQLite / D1 does not support ADD CONSTRAINT on existing tables.
-- The standard migration path is:
--   1. Create a new table with the constraint.
--   2. Copy existing rows.
--   3. Drop the old table.
--   4. Rename the new table.
--
-- This migration uses that approach so it is safe to apply to a database
-- that already has data in event_clusters.

CREATE TABLE IF NOT EXISTS event_clusters_new (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_slug       TEXT    NOT NULL,
  date_key         TEXT    NOT NULL,            -- YYYY-MM-DD
  cluster_label    TEXT    NOT NULL,            -- short AI-generated label
  summary_text     TEXT,                        -- AI-generated cluster summary
  alert_count      INTEGER NOT NULL DEFAULT 0,
  importance_score INTEGER NOT NULL DEFAULT 0,  -- 0–100
  metadata_json    TEXT,
  created_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),

  UNIQUE (topic_slug, date_key, cluster_label)
);

-- Copy existing rows; on conflict keep the row with the highest importance_score
INSERT OR IGNORE INTO event_clusters_new
  (id, topic_slug, date_key, cluster_label, summary_text, alert_count, importance_score, metadata_json, created_at, updated_at)
SELECT id, topic_slug, date_key, cluster_label, summary_text, alert_count, importance_score, metadata_json, created_at, updated_at
FROM event_clusters
ORDER BY importance_score DESC;

DROP TABLE event_clusters;

ALTER TABLE event_clusters_new RENAME TO event_clusters;

-- Recreate indexes (dropped with the original table)
CREATE INDEX IF NOT EXISTS idx_event_clusters_topic_date
  ON event_clusters (topic_slug, date_key);

CREATE INDEX IF NOT EXISTS idx_event_clusters_date
  ON event_clusters (date_key);
