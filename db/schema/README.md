# D1 Schema Reference

This directory contains the canonical schema reference for the Cloudflare D1 database.

---

## v1 Table Overview

| Table | Purpose |
|---|---|
| `topics` | Canonical list of platform topics |
| `alerts` | Individual intraday alert records |
| `event_clusters` | AI-generated clusters grouping related alerts |
| `daily_status` | Per-topic per-day page readiness and navigation state |
| `publish_jobs` | Daily editorial publish workflow lifecycle tracking |

---

## Design Choices

### Identifiers
- `topic_slug` (e.g. `crypto`, `finance`) is the stable cross-table identifier. It is human-readable, URL-safe, and does not change.
- `date_key` uses `YYYY-MM-DD` format consistently across all tables.
- All tables use an integer `id` primary key with `AUTOINCREMENT` for simplicity.

### Timestamps
- All operational tables carry `created_at` and `updated_at` stored as ISO-8601 text (`YYYY-MM-DDTHH:MM:SSZ`).
- D1 does not have a native datetime type; text ISO-8601 is the standard pattern.

### Status fields
- `alerts.status` — `active | archived | suppressed`
- `daily_status.page_state` — `pending | ready | published | error`
- `publish_jobs.status` — `pending | running | success | failed | retrying`

### Navigation
- `daily_status.prev_date_key` and `next_date_key` store pre-computed navigation links.
- This avoids expensive `LAG`/`LEAD` queries at request time in the Pages Functions API.

### Extensibility
- Every table includes a `metadata_json` TEXT column for schema-safe extensibility without requiring new migrations for minor additions.

### D1 Responsibility Boundary
- D1 stores **operational state** — alerts, status, publish tracking, navigation.
- D1 does **not** store the final long-form editorial article body in v1. That lives in GitHub under `content/{topic_slug}/{date_key}/article.md`.
- The `article_available` flag in `daily_status` indicates whether the GitHub-backed article exists, as reported by the publish workflow.

---

## Index Strategy

Indexes are optimized for the following read patterns:

| Query | Index |
|---|---|
| Timeline: alerts for topic on a day | `idx_alerts_topic_date_event` |
| Global alert feed | `idx_alerts_date_event` |
| Day status for topic/date | `idx_daily_status_topic_date` |
| Latest days per topic (homepage) | `idx_daily_status_topic_state` |
| Latest published days (global) | `idx_daily_status_state_date` |
| Publish job status lookup | `idx_publish_jobs_topic_date` |
| Failed/pending job queue | `idx_publish_jobs_status` |
| Cluster alert membership | `idx_alerts_cluster` |
| Alert delivery retry | `idx_alerts_delivery` |
| Topic listing | `idx_topics_active_sort` |

---

## Migration History

| File | Description |
|---|---|
| `migrations/0001_init.sql` | Initial v1 schema: topics, alerts, event_clusters, daily_status, publish_jobs |
