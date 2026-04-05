-- Migration: 0001_init.sql
-- Description: Initial v1 schema for Modern Content Platform
-- Tables: topics, alerts, event_clusters, daily_status, publish_jobs
-- Applied to: Cloudflare D1

-- ============================================================
-- topics
-- Canonical list of supported topics.
-- One row per topic_slug. Stable reference for foreign keys.
-- ============================================================
CREATE TABLE IF NOT EXISTS topics (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_slug     TEXT    NOT NULL UNIQUE,       -- e.g. 'crypto', 'finance', 'health'
  display_name   TEXT    NOT NULL,              -- e.g. 'Crypto', 'Finance', 'Health'
  description    TEXT,
  is_active      INTEGER NOT NULL DEFAULT 1,    -- 1 = active, 0 = disabled
  sort_order     INTEGER NOT NULL DEFAULT 0,    -- controls homepage display order
  metadata_json  TEXT,
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_topics_active_sort
  ON topics (is_active, sort_order);

-- ============================================================
-- event_clusters
-- Groups of related alerts that share a common narrative.
-- Created by the AI clustering step in the intraday workflow.
-- ============================================================
CREATE TABLE IF NOT EXISTS event_clusters (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_slug       TEXT    NOT NULL,
  date_key         TEXT    NOT NULL,            -- YYYY-MM-DD
  cluster_label    TEXT    NOT NULL,            -- short AI-generated label
  summary_text     TEXT,                        -- AI-generated cluster summary
  alert_count      INTEGER NOT NULL DEFAULT 0,
  importance_score INTEGER NOT NULL DEFAULT 0,  -- 0–100
  metadata_json    TEXT,
  created_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_event_clusters_topic_date
  ON event_clusters (topic_slug, date_key);

CREATE INDEX IF NOT EXISTS idx_event_clusters_date
  ON event_clusters (date_key);

-- ============================================================
-- alerts
-- Individual alert records written by the intraday workflow.
-- Each alert belongs to one topic and optionally one cluster.
-- ============================================================
CREATE TABLE IF NOT EXISTS alerts (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_slug         TEXT    NOT NULL,
  date_key           TEXT    NOT NULL,          -- YYYY-MM-DD derived from event_at
  cluster_id         INTEGER,                   -- FK → event_clusters.id (nullable)
  headline           TEXT    NOT NULL,
  summary_text       TEXT,
  source_url         TEXT,
  source_name        TEXT,
  severity_score     INTEGER NOT NULL DEFAULT 0, -- 0–100
  importance_score   INTEGER NOT NULL DEFAULT 0, -- 0–100
  confidence_score   INTEGER NOT NULL DEFAULT 0, -- 0–100
  status             TEXT    NOT NULL DEFAULT 'active',
                                                 -- active | archived | suppressed
  delivered_telegram INTEGER NOT NULL DEFAULT 0, -- 0 | 1
  delivered_discord  INTEGER NOT NULL DEFAULT 0, -- 0 | 1
  event_at           TEXT    NOT NULL,           -- ISO-8601 event timestamp
  metadata_json      TEXT,
  created_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),

  FOREIGN KEY (cluster_id) REFERENCES event_clusters (id)
);

-- Primary timeline read: alerts for a topic on a given day, newest first
CREATE INDEX IF NOT EXISTS idx_alerts_topic_date_event
  ON alerts (topic_slug, date_key, event_at DESC);

-- Latest alerts across all topics for homepage / global feed
CREATE INDEX IF NOT EXISTS idx_alerts_date_event
  ON alerts (date_key, event_at DESC);

-- Cluster membership lookup
CREATE INDEX IF NOT EXISTS idx_alerts_cluster
  ON alerts (cluster_id);

-- Delivery status checks (for retry logic in n8n)
CREATE INDEX IF NOT EXISTS idx_alerts_delivery
  ON alerts (delivered_telegram, delivered_discord, status);

-- ============================================================
-- daily_status
-- One row per (topic_slug, date_key).
-- Tracks readiness, page state, and navigation metadata.
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_status (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_slug            TEXT    NOT NULL,
  date_key              TEXT    NOT NULL,        -- YYYY-MM-DD
  page_state            TEXT    NOT NULL DEFAULT 'pending',
                                                 -- pending | ready | published | error
  alert_count           INTEGER NOT NULL DEFAULT 0,
  cluster_count         INTEGER NOT NULL DEFAULT 0,
  summary_available     INTEGER NOT NULL DEFAULT 0, -- 0 | 1
  video_available       INTEGER NOT NULL DEFAULT 0, -- 0 | 1
  article_available     INTEGER NOT NULL DEFAULT 0, -- 0 | 1
  prev_date_key         TEXT,                    -- YYYY-MM-DD previous day with content
  next_date_key         TEXT,                    -- YYYY-MM-DD next day with content
  published_at          TEXT,                    -- ISO-8601 when page was published
  metadata_json         TEXT,
  created_at            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),

  UNIQUE (topic_slug, date_key)
);

-- Page readiness lookup (day-status API)
CREATE INDEX IF NOT EXISTS idx_daily_status_topic_date
  ON daily_status (topic_slug, date_key);

-- Latest days per topic (homepage topic cards)
CREATE INDEX IF NOT EXISTS idx_daily_status_topic_state
  ON daily_status (topic_slug, page_state, date_key DESC);

-- Global latest published days
CREATE INDEX IF NOT EXISTS idx_daily_status_state_date
  ON daily_status (page_state, date_key DESC);

-- ============================================================
-- publish_jobs
-- One row per publish attempt for a topic/day page.
-- Tracks the full lifecycle of the daily editorial publish workflow.
-- ============================================================
CREATE TABLE IF NOT EXISTS publish_jobs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_slug      TEXT    NOT NULL,
  date_key        TEXT    NOT NULL,             -- YYYY-MM-DD
  status          TEXT    NOT NULL DEFAULT 'pending',
                                                -- pending | running | success | failed | retrying
  attempt         INTEGER NOT NULL DEFAULT 1,
  triggered_by    TEXT,                         -- 'schedule' | 'manual' | 'retry'
  workflow_run_id TEXT,                         -- n8n execution ID for traceability
  started_at      TEXT,
  completed_at    TEXT,
  error_message   TEXT,
  metadata_json   TEXT,
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Current job status for a topic/day (most recent attempt)
CREATE INDEX IF NOT EXISTS idx_publish_jobs_topic_date
  ON publish_jobs (topic_slug, date_key, created_at DESC);

-- Failed/pending jobs for retry queue
CREATE INDEX IF NOT EXISTS idx_publish_jobs_status
  ON publish_jobs (status, date_key DESC);
