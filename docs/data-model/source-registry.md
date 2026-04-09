# Source Registry — Data Model

## Overview

The source registry is a D1 table (`sources`) that provides a structured,
queryable catalog of all known content sources used by the platform for
ingestion and attribution.

It replaces the static JSON files in `config/sources/` as the canonical
runtime source of truth, while those JSON files remain useful as
bootstrap/seed data and operator reference.

---

## Table: `sources`

**Migration:** `db/migrations/0004_source_registry.sql`
**Seed data:** `db/seeds/sources.sql`

| Column | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | auto | AUTOINCREMENT | Primary key |
| `source_slug` | TEXT | yes | — | Stable unique identifier (e.g. `coindesk-rss`, `x-crypto-whale`) |
| `source_name` | TEXT | yes | — | Human-readable label (e.g. `CoinDesk RSS`, `WHO News RSS`) |
| `topic_slug` | TEXT | yes | — | Primary topic association (e.g. `crypto`, `health`, `ai`) |
| `source_type` | TEXT | yes | — | Source category: `rss`, `api`, `social`, `webhook` |
| `trust_tier` | TEXT | yes | `T3` | Trust classification: `T1` (Official), `T2` (Wire), `T3` (Specialist), `T4` (Signal/Social) |
| `trust_score` | INTEGER | yes | `50` | Numeric trust score (0–100). Higher = more trusted |
| `priority_weight` | INTEGER | yes | `50` | Ingestion priority (0–100). Higher = polled/used first |
| `url` | TEXT | no | NULL | Feed URL, API endpoint, or profile URL |
| `is_active` | INTEGER | yes | `1` | Active flag: `1` = active, `0` = disabled |
| `poll_interval_minutes` | INTEGER | yes | `15` | How often to poll this source (ignored for push sources) |
| `ingestion_method` | TEXT | yes | `poll` | How items are collected: `poll`, `push`, `manual` |
| `metadata_json` | TEXT | no | NULL | Flexible JSON for future extensions (notes, credentials ref, parser config) |
| `created_at` | TEXT | yes | now | ISO-8601 creation timestamp |
| `updated_at` | TEXT | yes | now | ISO-8601 last-update timestamp |

---

## Source Types

| Type | Description | Examples |
|------|-------------|---------|
| `rss` | RSS/Atom feed | CoinDesk, Reuters, WHO, CDC, SEC EDGAR |
| `api` | Structured data API | CoinGecko, FRED, Hacker News Firebase |
| `social` | Social/signal account (generic) | Telegram channels, Reddit |
| `webhook` | Push-based event feed | Exchange announcement webhooks |
| `x_account` | X (Twitter) account monitoring | Whale Alert, OpenAI, IEA official accounts |
| `x_query` | X (Twitter) keyword/hashtag search | BTC breakout search, AI model launch search |

---

## Trust Tiers

| Tier | Name | Trust Score | Description |
|------|------|-------------|-------------|
| `T1` | Official | 90 | Government, central bank, regulatory, WHO/CDC/FDA, peer-reviewed |
| `T2` | Wire / Newswire | 75 | Reuters, AP, Bloomberg, FT, BBC |
| `T3` | Specialist news | 50 | Topic-specific outlets (CoinDesk, STAT News, Ars Technica) |
| `T4` | Signal / Social | 25 | X accounts, Reddit, Telegram, aggregators |

Trust scores are numeric (0–100) to allow finer-grained ranking within tiers.
The trust tier is the coarse classification; the trust score enables ordering
within the same tier.

---

## Ingestion Methods

| Method | Description |
|--------|-------------|
| `poll` | Platform actively fetches from the source on a schedule (default) |
| `push` | Source pushes items to a webhook endpoint |
| `manual` | Items are added manually (e.g. operator paste, one-off research) |

---

## Indexes

| Index | Columns | Purpose |
|-------|---------|---------|
| `idx_sources_topic_active` | `(topic_slug, is_active, priority_weight DESC)` | Primary ingestion query: active sources for a topic, ordered by priority |
| `idx_sources_type_active` | `(source_type, is_active)` | Filter by source type (e.g. all active RSS sources) |
| `idx_sources_trust_tier` | `(trust_tier, is_active)` | Trust tier audit queries |

---

## How the Registry Is Used

### Intraday Workflow — Module 01 (Source Ingestion)

Module 01 reads the active source list for each topic:

```sql
SELECT source_slug, source_name, source_type, trust_tier,
       trust_score, priority_weight, url,
       poll_interval_minutes, ingestion_method, metadata_json
FROM sources
WHERE topic_slug = ? AND is_active = 1
ORDER BY priority_weight DESC
```

Each source row provides the URL to fetch, the type (to select the right parser),
and trust metadata to propagate downstream.

### Intraday Workflow — Module 05 (AI Classification)

When trust-tier-aware classification is enabled, the `trust_tier` and
`trust_score` from the source registry are passed to the AI classification
prompt. This allows the classifier to:
- Note the source tier in its reasoning
- Reduce `confidence_score` for lower-tier sources
- Flag health/economy items from T3+ sources for review

### Alert Attribution

The `alerts` table has `source_name` and `source_url` columns. When an alert
is written, the `source_name` maps back to `sources.source_name`, enabling
downstream attribution. The `source_slug` can be stored in `alerts.metadata_json`
for precise registry lookups.

### Daily Summary Workflow

The daily summary aggregation can reference the source registry to:
- List which sources contributed alerts for a topic/day
- Weight source contributions by `trust_score`
- Attribute key claims to specific trust tiers

### Frontend Display

The read endpoint `GET /api/sources?topic=crypto` returns active sources for
rendering source attribution on topic pages.

---

## API Endpoints

### Write: `POST /api/internal/sources`

Creates a new source in the registry.

**Authentication:** `X-Write-Key` header

**Required fields:** `source_slug`, `source_name`, `topic_slug`, `source_type`

**Optional fields:** `trust_tier`, `trust_score`, `priority_weight`, `url`,
`is_active`, `poll_interval_minutes`, `ingestion_method`, `metadata_json`

**Response (201):**
```json
{ "id": 1, "source_slug": "coindesk-rss", "source_name": "CoinDesk RSS", "topic_slug": "crypto" }
```

### Read: `GET /api/sources`

Returns all active sources, optionally filtered by topic.

**Query params:** `topic` (optional)

**Response:**
```json
[
  {
    "source_slug": "coindesk-rss",
    "source_name": "CoinDesk RSS",
    "topic_slug": "crypto",
    "source_type": "rss",
    "trust_tier": "T3",
    "trust_score": 50,
    "priority_weight": 70,
    "url": "https://www.coindesk.com/arc/outboundfeeds/rss/",
    "poll_interval_minutes": 15,
    "ingestion_method": "poll"
  }
]
```

---

## Representing X Sources

X (Twitter) sources use dedicated source types (`x_account` or `x_query`)
and `trust_tier: 'T4'`. This replaces the generic `social` type for X sources,
giving the ingestion pipeline first-class routing.

### X Account Monitoring (`x_account`)

Monitors recent posts from a specific X user:

```json
{
  "source_slug": "x-account-whale-alert",
  "source_name": "Whale Alert (X)",
  "topic_slug": "crypto",
  "source_type": "x_account",
  "trust_tier": "T4",
  "trust_score": 25,
  "priority_weight": 40,
  "url": "https://x.com/whale_alert",
  "ingestion_method": "poll",
  "metadata_json": "{\"x_user_id\": \"whale_alert\", \"monitor_type\": \"account\"}"
}
```

### X Keyword/Hashtag Search (`x_query`)

Searches recent posts matching a query string:

```json
{
  "source_slug": "x-query-btc-breakout",
  "source_name": "X Search: BTC Breakout",
  "topic_slug": "crypto",
  "source_type": "x_query",
  "trust_tier": "T4",
  "trust_score": 25,
  "priority_weight": 30,
  "url": "https://api.twitter.com/2/tweets/search/recent",
  "ingestion_method": "poll",
  "metadata_json": "{\"search_query\": \"(#Bitcoin OR #BTC) (breakout OR ATH OR crash) -is:retweet lang:en\", \"monitor_type\": \"query\", \"max_results\": 20}"
}
```

### Metadata fields for X sources

| Field | Type | Required for | Description |
|-------|------|-------------|-------------|
| `x_user_id` | string | `x_account` | X username (without @) |
| `search_query` | string | `x_query` | X recent search query string |
| `monitor_type` | string | both | `"account"` or `"query"` |
| `max_results` | integer | `x_query` | Max tweets per fetch (default: 10, max: 100) |

### Trust and confidence rules for X sources

- All X sources default to `trust_tier: 'T4'` and `trust_score: 25`
- Per-topic severity caps apply (see `docs/source-strategy.md`)
- When X is the sole source, `confidence_score` should be reduced by ≥20 points
- Topics that exclude T4 sources (economy, health) must not have active X sources

---

## Relationship to `config/sources/` JSON Files

The static JSON files in `config/sources/` remain as:
- Bootstrap/seed data for new D1 deployments (`db/seeds/sources.sql`)
- Human-readable reference for operators
- Version-controlled source configuration history

At runtime, the D1 `sources` table is the authoritative source list.
Changes to sources (activate, deactivate, update trust, add new) should be
made through the write API or direct D1 updates, not by editing JSON files.

---

## v1 Scope and Future Extensions

**v1 includes:**
- Source registry table with all fields above
- Seed data for 19 starter sources across 6 topics
- Read and write API endpoints
- Integration with existing trust tier model from `docs/source-strategy.md`

**Future extensions (via `metadata_json` or new columns):**
- `last_polled_at` — timestamp of last successful fetch
- `last_error` — last ingestion error message
- `item_count` — running count of items fetched
- `credentials_ref` — reference to n8n credential for authenticated sources
- `parser_config` — custom parser mapping for non-standard API responses
- Multi-topic sources (a source contributing to multiple topics)
- Source health monitoring and automatic deactivation
