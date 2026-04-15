-- Migration: 0006_alerts_trust_columns.sql
-- Description: Add trust_tier and trust_score columns to the alerts table
-- Depends on: 0005_source_attribution.sql
--
-- Adds:
--   trust_tier  — propagated trust classification from the source registry
--                 ('T1' | 'T2' | 'T3' | 'T4'). Null for alerts ingested
--                 before this migration or from unconfigured sources.
--   trust_score — numeric trust score (0–100) from the source registry.
--                 Null when trust_tier is null.
--
-- These columns allow the daily aggregation pipeline to read trust context
-- directly from alert rows, enabling trust-aware prompt construction without
-- joining back to the sources table.

ALTER TABLE alerts ADD COLUMN trust_tier  TEXT;

ALTER TABLE alerts ADD COLUMN trust_score INTEGER;

CREATE INDEX IF NOT EXISTS idx_alerts_trust_tier
  ON alerts (trust_tier);
