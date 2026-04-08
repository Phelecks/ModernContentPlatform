-- Migration: 0004_source_registry.sql
-- Description: Add sources table for source registry (ingestion and attribution)
-- Tables: sources
-- Applied to: Cloudflare D1
-- Depends on: 0001_init.sql

-- ============================================================
-- sources
-- Registry of known sources for ingestion and attribution.
-- One row per source. Each source belongs to one primary topic.
--
-- Supports:
--   - news publishers (RSS feeds)
--   - official institutions (government, central banks)
--   - data providers (APIs)
--   - social / signal accounts (X, Telegram, Reddit)
--   - research sources (arXiv, journals)
--   - company blogs and webhooks
--
-- Used by:
--   - n8n intraday module 01 (source ingestion) to read active sources
--   - n8n module 05 (AI classification) for trust-tier-aware scoring
--   - alert attribution (source_name in alerts traces back to sources)
--   - frontend source attribution display
-- ============================================================
CREATE TABLE IF NOT EXISTS sources (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  source_slug           TEXT    NOT NULL UNIQUE,       -- stable identifier, e.g. 'coindesk-rss'
  source_name           TEXT    NOT NULL,              -- human-readable, e.g. 'CoinDesk RSS'
  topic_slug            TEXT    NOT NULL,              -- primary topic association
  source_type           TEXT    NOT NULL,              -- 'rss' | 'api' | 'social' | 'webhook'
  trust_tier            TEXT    NOT NULL DEFAULT 'T3', -- 'T1' | 'T2' | 'T3' | 'T4'
  trust_score           INTEGER NOT NULL DEFAULT 50,   -- 0–100 numeric trust score
  priority_weight       INTEGER NOT NULL DEFAULT 50,   -- 0–100, higher = polled/used first
  url                   TEXT,                           -- feed URL, API endpoint, or profile URL
  is_active             INTEGER NOT NULL DEFAULT 1,    -- 1 = active, 0 = disabled
  poll_interval_minutes INTEGER NOT NULL DEFAULT 15,   -- how often to poll (ignored for push)
  ingestion_method      TEXT    NOT NULL DEFAULT 'poll', -- 'poll' | 'push' | 'manual'
  metadata_json         TEXT,                           -- flexible extension field
  created_at            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Active sources per topic (primary ingestion query)
CREATE INDEX IF NOT EXISTS idx_sources_topic_active
  ON sources (topic_slug, is_active, priority_weight DESC);

-- Source type filtering (e.g. all active RSS sources)
CREATE INDEX IF NOT EXISTS idx_sources_type_active
  ON sources (source_type, is_active);

-- Trust tier lookup (e.g. find all T1 sources)
CREATE INDEX IF NOT EXISTS idx_sources_trust_tier
  ON sources (trust_tier, is_active);
