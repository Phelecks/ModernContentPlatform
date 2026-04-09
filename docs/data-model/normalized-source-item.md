# Normalized Source Item — Data Model

## Overview

The **normalized source item** is the canonical internal format that every
ingested record must take before it is passed to deduplication, AI
classification, alert creation, or daily summary generation.

All source adapters — regardless of type (RSS news, official RSS, structured
data API, academic/research RSS, X account monitoring, X keyword search,
webhook, or generic social feed) — must produce items in this shape at the end
of normalization module 02.

**Contract file:** `workflows/contracts/intraday_normalized_item.json`

---

## Design Principles

- **One shape for all sources.** Downstream stages (deduplication, clustering,
  AI, persistence) must never branch on source-type-specific fields.
- **Deterministic identity.** `item_id` is always `SHA-256(source_name + ":" + source_id)`,
  enabling idempotent deduplication without database round-trips for every item.
- **Trust propagated, not assumed.** `trust_tier` and `trust_score` come from the
  D1 `sources` registry. When a source is not registered, both fields are `null`
  and the AI classifier applies default confidence reduction.
- **Author preserved.** The `author` field carries journalist bylines, X handles,
  or researcher names when available. The AI uses it to calibrate trust.
- **Topic candidates are hints, not decisions.** Lightweight keyword matching
  pre-populates `topic_candidates`. The AI classification step (module 05) makes
  the final topic assignment.

---

## Field Reference

### Required fields

| Field | Type | Description |
|-------|------|-------------|
| `item_id` | `string` | Deterministic SHA-256 hex ID: `SHA-256(source_name + ":" + source_id)`. Used for deduplication across all sources. |
| `source_id` | `string` | Original identifier from the source (RSS guid, API record id, tweet id). |
| `source_name` | `string` | Human-readable source label (e.g. `"CoinDesk RSS"`, `"BLS News RSS"`). |
| `source_type` | `string` enum | Technical category. See [Source Types](#source-types) below. |
| `headline` | `string` | Cleaned, HTML-stripped headline. Max 250 characters. |
| `published_at` | `string` (ISO-8601) | Best-available event timestamp. Falls back to `fetched_at` when the source omits a publication date. |
| `fetched_at` | `string` (ISO-8601) | UTC timestamp when the item was fetched by module 01. |
| `is_duplicate` | `boolean` | Set to `true` by module 03 (deduplication). Items with `is_duplicate=true` are dropped before the AI call. |

### Optional fields

| Field | Type | Description |
|-------|------|-------------|
| `source_slug` | `string \| null` | Stable registry identifier (e.g. `"coindesk-rss"`). Propagated from the D1 `sources` table. `null` for unregistered sources. |
| `source_url` | `string \| null` | Canonical URL of the original item. `null` when unavailable (some API data items). |
| `body` | `string \| null` | Cleaned body text. HTML stripped. Max 2000 characters. `null` when the source provides no body. |
| `author` | `string \| null` | Journalist byline, X account handle (`@username`), or researcher name. `null` when not provided. |
| `topic_candidates` | `string[]` | 0–3 topic slugs from keyword pre-matching. Empty array is valid. |
| `trust_tier` | `"T1" \| "T2" \| "T3" \| "T4" \| null` | Trust classification from the source registry. See [Trust Tiers](#trust-tiers). `null` = unregistered. |
| `trust_score` | `integer (0–100) \| null` | Numeric trust score from the source registry. `null` = unregistered. |

---

## Source Types

The `source_type` field uses technical categories that map to the parsing path
in module 01 and the trust enforcement logic in modules 05–06.

| Value | Semantic role | Examples |
|-------|---------------|---------|
| `rss` | News, official announcements, research pre-prints distributed as RSS/Atom feeds | CoinDesk RSS, BLS news RSS, WHO RSS, arXiv cs.AI RSS |
| `api` | Structured data APIs: market data, official statistical data, community APIs | CoinGecko API, FRED API, Hacker News Firebase API |
| `webhook` | Push-based event feeds from exchange or partner systems | Exchange announcement webhooks |
| `x_account` | X (Twitter) account monitoring — fetches recent posts from a specific user | Whale Alert, OpenAI, IEA official accounts |
| `x_query` | X (Twitter) keyword/hashtag search — fetches recent posts matching a query | BTC breakout search, AI model launch search |
| `social` | Generic social/signal channels not covered by dedicated types | Telegram channels, Reddit communities |

> **Note on semantic categories:** The platform's source strategy uses
> conceptual categories (news, official, data, research, X/social). These map
> to `source_type` values as follows:
>
> | Semantic category | `source_type` value(s) |
> |---|---|
> | news | `rss` |
> | official | `rss`, `api` (official agency feeds and data APIs) |
> | data | `api` (market data, statistics APIs) |
> | research | `rss` (arXiv, journal RSS feeds) |
> | X / social | `x_account`, `x_query`, `social` |
> | other signals | `webhook`, `api` |

---

## Trust Tiers

Trust tiers are sourced from the D1 `sources` registry. They propagate from
module 01 through the normalized item and into the AI classification call.

| Tier | Name | Trust Score | Description |
|------|------|-------------|-------------|
| `T1` | Official | 90 | Government agencies, central banks, regulatory bodies, WHO/CDC/FDA, statistical offices |
| `T2` | Wire / Newswire | 75 | Reuters, AP, Bloomberg, FT, BBC |
| `T3` | Specialist | 50 | Topic-specific outlets (CoinDesk, STAT News, Ars Technica) and research pre-prints |
| `T4` | Signal / Social | 25 | X accounts, Reddit, Telegram, aggregators |
| `null` | Unregistered | — | Source not in the D1 registry; AI applies default confidence reduction |

Module 05 (AI Classification) uses `trust_tier` and `trust_score` to:
- Adjust `confidence_score` downward for T4 and unregistered sources.
- Flag health/economy items from T3+ sources for review.

Module 06 (Alert Decision) uses `trust_tier` to enforce per-topic severity caps
(see `docs/source-strategy.md`).

---

## Example Payloads

### news — RSS specialist outlet (crypto)

```json
{
  "item_id": "a3f8c2d14e7b9f01234567890abcdef1234567890abcdef1234567890abcdef12",
  "source_id": "https://www.coindesk.com/markets/2025/01/15/bitcoin-hits-new-ath/",
  "source_slug": "coindesk-rss",
  "source_name": "CoinDesk RSS",
  "source_type": "rss",
  "source_url": "https://www.coindesk.com/markets/2025/01/15/bitcoin-hits-new-ath/",
  "headline": "Bitcoin Hits New All-Time High Above $120K",
  "body": "Bitcoin surged past $120,000 on Wednesday, setting a new all-time high as institutional demand continued to rise.",
  "author": "Omkar Godbole",
  "topic_candidates": ["crypto", "finance"],
  "published_at": "2025-01-15T14:32:00Z",
  "fetched_at": "2025-01-15T14:45:00Z",
  "trust_tier": "T3",
  "trust_score": 50,
  "is_duplicate": false
}
```

### official — government data release (economy)

```json
{
  "item_id": "b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2",
  "source_id": "https://www.bls.gov/news.release/cpi.nr0.htm",
  "source_slug": "bls-rss",
  "source_name": "BLS News RSS",
  "source_type": "rss",
  "source_url": "https://www.bls.gov/news.release/cpi.nr0.htm",
  "headline": "Consumer Price Index — December 2024",
  "body": "The Consumer Price Index for All Urban Consumers rose 0.3 percent in December on a seasonally adjusted basis.",
  "author": null,
  "topic_candidates": ["economy", "finance"],
  "published_at": "2025-01-15T13:30:00Z",
  "fetched_at": "2025-01-15T13:32:00Z",
  "trust_tier": "T1",
  "trust_score": 90,
  "is_duplicate": false
}
```

### data — structured market data API (crypto)

```json
{
  "item_id": "c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5",
  "source_id": "coingecko-btc-2025-01-15T14:00:00Z",
  "source_slug": "coingecko-api",
  "source_name": "CoinGecko API",
  "source_type": "api",
  "source_url": "https://www.coingecko.com/en/coins/bitcoin",
  "headline": "Bitcoin price alert: $120,432 (+8.2% 24h)",
  "body": null,
  "author": null,
  "topic_candidates": ["crypto"],
  "published_at": "2025-01-15T14:00:00Z",
  "fetched_at": "2025-01-15T14:01:05Z",
  "trust_tier": "T1",
  "trust_score": 90,
  "is_duplicate": false
}
```

### research — academic pre-print RSS (ai)

```json
{
  "item_id": "d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8",
  "source_id": "https://arxiv.org/abs/2501.12345",
  "source_slug": "arxiv-cs-ai-rss",
  "source_name": "arXiv cs.AI RSS",
  "source_type": "rss",
  "source_url": "https://arxiv.org/abs/2501.12345",
  "headline": "Scaling Laws for Next-Token Prediction Beyond 1T Parameters",
  "body": "We present empirical scaling laws for autoregressive language models trained at scales beyond 1 trillion parameters.",
  "author": "Jane Smith, John Doe, et al.",
  "topic_candidates": ["ai", "technology"],
  "published_at": "2025-01-14T00:00:00Z",
  "fetched_at": "2025-01-15T06:00:00Z",
  "trust_tier": "T3",
  "trust_score": 50,
  "is_duplicate": false
}
```

### X/social — account monitoring (crypto, T4)

```json
{
  "item_id": "e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1",
  "source_id": "x-1879012345678901234",
  "source_slug": "x-account-whale-alert",
  "source_name": "Whale Alert (X)",
  "source_type": "x_account",
  "source_url": "https://x.com/i/status/1879012345678901234",
  "headline": "🚨 1,500 #BTC (183,200,000 USD) transferred from unknown wallet to #Binance",
  "body": null,
  "author": "@whale_alert",
  "topic_candidates": ["crypto"],
  "published_at": "2025-01-15T14:28:00Z",
  "fetched_at": "2025-01-15T14:30:00Z",
  "trust_tier": "T4",
  "trust_score": 25,
  "is_duplicate": false
}
```

---

## Pipeline Position

```
Module 01 — Source Ingestion
  Outputs: source_item[] (intraday_source_item contract)
        │
        ▼
Module 02 — Normalization  ◄── produces normalized_item[]
  Adds:  item_id (SHA-256 hash)
         headline (cleaned, max 250 chars)
         body (cleaned, max 2000 chars)
         author (propagated from source item)
         topic_candidates (keyword matching)
         published_at (with fetched_at fallback)
         trust_tier / trust_score (from source config)
         source_slug (from source config)
         is_duplicate = false (default)
        │
        ▼
Module 03 — Deduplication
  Sets:  is_duplicate = true on seen items
  Drops: duplicate items (is_duplicate=true)
        │
        ▼
Module 04 — Clustering
  Adds:  cluster_label to each item
        │
        ▼
Module 05 — AI Classification
  Uses:  headline, body, author, topic_candidates,
         trust_tier, trust_score, source_type
  Outputs: classified_alert[] (intraday_classified_alert contract)
```

---

## Implementation Guidance

### Module 01 — Source Ingestion

Each source parser (RSS, API, X) must emit `source_item` objects that include
the new fields. When reading sources from the D1 `sources` registry:

```sql
SELECT source_slug, source_name, source_type, trust_tier,
       trust_score, priority_weight, url,
       poll_interval_minutes, ingestion_method, metadata_json
FROM sources
WHERE topic_slug = ? AND is_active = 1
ORDER BY priority_weight DESC
```

Pass `source_slug`, `trust_tier`, and `trust_score` in the source config so the
parser nodes can stamp them onto each emitted item.

For RSS feeds, attempt to extract author from `dc:creator` or `<author>` tags
and include it in `author`. For X items, derive the author from the configured
`x_username` in `metadata_json` and format it as `@username`.

### Module 02 — Normalization

The `Normalize Item` node must:

1. Compute `item_id = SHA-256(source_name + ":" + source_id)`.
2. Strip HTML from `title` → `headline` (max 250 chars) and `body` (max 2000 chars).
3. Strip HTML from `author`, preserve `null` when absent.
4. Determine `published_at` using `item.published_at ?? item.fetched_at`.
5. Run keyword matching to populate `topic_candidates` (0–3 slugs).
6. Propagate `source_slug`, `trust_tier`, and `trust_score` verbatim from the
   incoming source item.
7. Set `is_duplicate = false`.

When `trust_tier` or `trust_score` are absent from the source item (e.g. for
unconfigured sources), pass `null` for both.

### Module 05 — AI Classification

Include `trust_tier`, `trust_score`, and `author` in the AI prompt context.
Instruct the model to:

- Reduce `confidence_score` by ≥ 20 points when `trust_tier` is `T4` or `null`.
- Flag health/economy items from T3 sources for human review.
- Use `author` as a secondary trust signal (e.g. a known official account boosts
  confidence; an unknown account reduces it).

### Module 06 — Alert Decision

Apply per-topic T4 severity caps from `docs/source-strategy.md` using the
`trust_tier` field on the classified alert (carried forward from the normalized
item via the classified alert contract).

### Deduplication (Module 03)

Deduplication checks `item_id` against D1. The field is deterministic, so the
same source item always produces the same `item_id` regardless of when it is
fetched. No additional fingerprinting is needed.

---

## Required vs Optional — Quick Summary

| Field | Required | Notes |
|-------|:--------:|-------|
| `item_id` | ✅ | Computed by module 02 |
| `source_id` | ✅ | From source adapter |
| `source_name` | ✅ | From source config |
| `source_type` | ✅ | From source config |
| `headline` | ✅ | From `title`, cleaned |
| `published_at` | ✅ | Falls back to `fetched_at` |
| `fetched_at` | ✅ | Set by module 01 |
| `is_duplicate` | ✅ | Set by module 03 |
| `source_slug` | optional | From D1 registry; `null` if unregistered |
| `source_url` | optional | `null` for some API data items |
| `body` | optional | `null` when source provides no body |
| `author` | optional | `null` when not provided by source |
| `topic_candidates` | optional | Empty array is valid |
| `trust_tier` | optional | `null` when source not in D1 registry |
| `trust_score` | optional | `null` when source not in D1 registry |

---

## Related Files

| File | Role |
|------|------|
| `workflows/contracts/intraday_source_item.json` | Raw item shape from any source adapter |
| `workflows/contracts/intraday_normalized_item.json` | This format — canonical internal shape |
| `workflows/contracts/intraday_classified_alert.json` | After AI classification |
| `workflows/contracts/intraday_delivery_payload.json` | Approved alert ready for delivery |
| `workflows/n8n/intraday/01_source_ingestion.json` | Module 01 — emits source_item objects |
| `workflows/n8n/intraday/02_normalization.json` | Module 02 — produces this format |
| `docs/data-model/source-registry.md` | D1 sources table (trust tier, source slug) |
| `docs/source-strategy.md` | Per-topic trust rules and T4 severity caps |
| `docs/architecture/intraday-workflow.md` | Full intraday pipeline architecture |
