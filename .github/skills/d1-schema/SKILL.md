---
name: d1-schema
description: Use this skill for Cloudflare D1 schema design, migrations, indexes, query design, and topic/date timeline data modeling.
---

# D1 Schema Skill

This skill helps design and maintain the Cloudflare D1 database layer for Modern Content Platform.

## Use this skill when

Use this skill for tasks such as:
- creating or updating D1 table schemas
- writing migration-safe SQL
- adding indexes
- defining primary and foreign key patterns
- designing query patterns for topic/day pages
- improving timeline query performance
- designing publish state and status tables
- reviewing schema changes for simplicity and maintainability

## Platform context

Modern Content Platform is a multi-topic AI intelligence and publishing platform.

It supports topics such as:
- crypto
- finance
- economy
- health
- AI
- energy
- technology

The platform has two parallel flows:

1. Intraday alert flow
- important events are detected and classified
- alerts are stored in Cloudflare D1
- alerts are shown on the website as a timeline
- alerts may also be sent to Telegram and Discord

2. Daily editorial flow
- one summary per topic per day is generated
- one video per topic per day may be generated
- final editorial content is published through GitHub
- Cloudflare Pages deploys the final website

## Architectural boundaries

Cloudflare D1 is the canonical store for:
- alerts
- timeline records
- event clusters
- daily status
- publish status
- navigation metadata
- workflow state
- operational state

Cloudflare D1 is not the canonical source for:
- final long-form editorial article content in v1
- frontend presentation logic
- AI prompt definitions

GitHub is the canonical source for final daily editorial content.

## Data modeling rules

Prefer these conventions:
- `topic_slug` as the stable topic identifier
- `date_key` in `YYYY-MM-DD` format
- `created_at` and `updated_at` on operational tables
- explicit `status` or `page_state` fields
- integer scoring fields such as `severity_score`, `importance_score`, `confidence_score`
- `metadata_json` for extensibility
- one row per topic/day in status tables
- deterministic field names across tables

## Recommended v1 tables

The preferred v1 schema includes:
- `topics`
- `alerts`
- `daily_status`
- `publish_jobs`
- `event_clusters`

Optional later:
- `source_items`
- `alert_delivery_logs`
- `summary_index`
- `topic_aliases`

## SQL design rules

When generating SQL:
- prefer migration-safe changes
- keep schema simple
- add indexes for likely read paths
- avoid unnecessary normalization in v1
- avoid overly generic tables when specific tables are clearer
- recommend one strongest design first
- note tradeoffs briefly
- generate copy-paste-ready SQL

## Query design priorities

Optimize for:
- timeline by topic/date
- latest topic days
- previous/next day navigation
- daily page readiness
- homepage topic cards
- latest alerts by topic
- publish status lookup

## Output style

When responding with schema work:
1. state the recommendation
2. explain why
3. provide the SQL
4. provide indexes
5. provide example queries if useful
6. mention tradeoffs only if they matter

## Avoid

Avoid:
- storing final article body only in D1 in v1
- vague field names
- mixing operational state with presentation concerns
- giant all-purpose tables if clearer separate tables are better
- frontend-derived publish logic when a status table is better

## Preferred outcome

The final output should be:
- practical
- migration-safe
- readable
- scalable for multiple topics
- aligned with Cloudflare D1 + Pages + n8n + GitHub