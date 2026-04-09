-- Migration: 0005_source_attribution.sql
-- Description: Add structured source attribution columns to alerts table
-- Depends on: 0001_init.sql
--
-- Adds:
--   source_type  — type of the primary source (rss, api, social, etc.)
--   source_domain — domain extracted from source_url for display/grouping
--   source_metadata_json — JSON containing supporting sources and source role
--
-- These columns extend the existing source_name and source_url columns
-- to provide structured, traceable source attribution on every alert.

ALTER TABLE alerts ADD COLUMN source_type TEXT;

ALTER TABLE alerts ADD COLUMN source_domain TEXT;

ALTER TABLE alerts ADD COLUMN source_metadata_json TEXT;
