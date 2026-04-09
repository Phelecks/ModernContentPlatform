# v1 X Source Lists and Trust Rules

## Overview

This document defines the concrete X (Twitter) source lists, trust rules, and
operational guidance for each v1 topic. It is the single reference for which X
signals to monitor, how to treat them, and when they may contribute to alerts.

X monitoring uses two source types (defined in
`workflows/contracts/intraday_source_item.json`):

| Source type | Description |
|-------------|-------------|
| `x_account` | Monitors recent posts from a specific X user account |
| `x_query`   | Searches recent posts matching a keyword/hashtag query |

Both types are always classified as **T4 (Signal / Social)** with a default
`trust_score` of **25**.

Machine-readable source configs are in `config/sources/`. D1 seed data is in
`db/seeds/sources.sql`. The trust model is detailed in `docs/source-strategy.md`.

---

## Global X Trust Rules

These rules apply to all X sources across every topic.

| Rule | Detail |
|------|--------|
| Trust tier | T4 (Signal / Social) — always |
| Default trust score | 25 (on 0–100 scale) |
| Confidence reduction | When X is the sole source for an event, AI classification (module 05) must reduce `confidence_score` by ≥ 20 points vs. the same event from a T1–T3 source |
| Severity cap | T4 items alone must not produce `severity_score` above the per-topic cap (see per-topic tables below) |
| Confirmation upgrade | If a T4 signal is confirmed by a T1–T3 source within one ingestion cycle (≤ 15 min), alert severity may be re-evaluated using the confirming source tier |
| Metadata requirements | `x_account` sources must carry `x_user_id` in `metadata_json`; `x_query` sources must carry `search_query` in `metadata_json` |
| Account vs. query trust | `x_account` monitoring known official accounts (e.g. `@OpenAI`, `@IEA`) may be treated with slightly higher confidence than `x_query` keyword searches, but both remain T4 |

---

## Per-Topic X Source Lists

### Crypto

Crypto permits X with the most latitude. On-chain whale alerts and exchange
announcements surface on X before any editorial outlet.

**Alert eligibility:** X posts **can trigger alerts directly**, capped at
severity 60. No confirmation required for alerts at or below the cap.

| Source slug | Source name | Type | Tracked target | Poll interval | Severity cap | Status |
|-------------|------------|------|----------------|---------------|-------------|--------|
| `x-account-whale-alert` | Whale Alert (X) | `x_account` | `@whale_alert` | 5 min | 60 | Disabled (`is_active: 0`) |
| `x-account-cz-binance` | CZ Binance (X) | `x_account` | `@caborea` | 10 min | 60 | Disabled (`is_active: 0`) |
| `x-query-btc-breakout` | X Search: BTC Breakout | `x_query` | `(#Bitcoin OR #BTC) (breakout OR ATH OR crash) -is:retweet lang:en` | 10 min | 60 | Disabled (`is_active: 0`) |

**Tracked hashtags** (included in query patterns above):
`#Bitcoin`, `#BTC`

**Why these sources:**
- **Whale Alert** posts large on-chain transfers in real time; these are
  verifiable on-chain data published via X.
- **CZ (Binance founder)** posts occasionally move markets; his account is
  a fast indicator of exchange-related news.
- **BTC breakout query** captures crowd sentiment around major price moves,
  useful as a signal even when not sufficient to trigger a high-severity alert.

---

### AI

AI permits X for tracking official lab announcements and model launches.
Community researchers post on X before papers are formally published.

**Alert eligibility:** X posts **can trigger alerts directly**, capped at
severity 50. Confirmation by a T1–T3 source is recommended for severity > 40.

| Source slug | Source name | Type | Tracked target | Poll interval | Severity cap | Status |
|-------------|------------|------|----------------|---------------|-------------|--------|
| `x-account-openai` | OpenAI (X) | `x_account` | `@OpenAI` | 10 min | 50 | Disabled (`is_active: 0`) |
| `x-account-anthropic` | Anthropic (X) | `x_account` | `@AnthropicAI` | 10 min | 50 | Disabled (`is_active: 0`) |
| `x-query-ai-launch` | X Search: AI Model Launch | `x_query` | `(#GPT OR #LLM OR #AI) (launched OR released OR announced) -is:retweet lang:en` | 10 min | 50 | Disabled (`is_active: 0`) |

**Tracked hashtags** (included in query patterns above):
`#GPT`, `#LLM`, `#AI`

**Why these sources:**
- **OpenAI** and **Anthropic** official accounts announce model releases,
  capability updates, and safety research directly on X, often before blog
  posts.
- **AI launch query** captures community discussion around model launches
  from any lab; useful for detecting releases from labs not yet tracked by
  account.

---

### Finance

Finance restricts X to watch-only monitoring. Financial misinformation on X
is common, and false signals can move markets. X must not trigger high-severity
alerts independently.

**Alert eligibility:** X posts **cannot trigger alerts independently**. X may
only raise a low-priority watch flag (severity ≤ 30) that must be confirmed by
a T1–T3 source before escalation.

| Source slug | Source name | Type | Tracked target | Poll interval | Severity cap | Status |
|-------------|------------|------|----------------|---------------|-------------|--------|
| `x-query-fed-decision` | X Search: Fed Decision | `x_query` | `(Federal Reserve OR #FOMC) (rate OR decision OR cut OR hike) -is:retweet lang:en` | 15 min | 30 | Disabled (`is_active: 0`) |

**Tracked hashtags** (included in query patterns above):
`#FOMC`

**Why this source:**
- **Fed decision query** captures early chatter around FOMC announcements.
  Useful as a watch signal only — the official Federal Reserve RSS and wire
  services are always the authoritative source.

**Why no `x_account` sources:**
- No individual finance X accounts meet the reliability threshold for v1.
  Official institutions (SEC, Fed) publish via RSS/API, not X, as their
  primary channel. Adding finance X accounts is deferred to v2 after
  evaluating account reliability.

---

### Energy

Energy permits X for official agency account monitoring only. Geopolitical
disruption signals on X are fast but must be held at low severity until
confirmed.

**Alert eligibility:** X posts **can trigger alerts** for confirmation only,
capped at severity 50. Geopolitical disruption signals from X must be held at
low severity until confirmed by a T2 or T3 wire source.

| Source slug | Source name | Type | Tracked target | Poll interval | Severity cap | Status |
|-------------|------------|------|----------------|---------------|-------------|--------|
| `x-account-iea` | IEA (X) | `x_account` | `@IEA` | 15 min | 50 | Disabled (`is_active: 0`) |

**Why this source:**
- **IEA (International Energy Agency)** posts policy updates, report releases,
  and energy market commentary. As an official intergovernmental organization,
  their X account has higher inherent reliability than typical T4 sources,
  but it remains classified as T4 per platform rules.

**Why no `x_query` sources:**
- Energy keyword searches produce high noise (generic terms like "oil" and
  "gas" match too broadly). Query-based monitoring is deferred to v2 with
  more refined query patterns.

---

### Economy — Excluded

Economy **does not use X sources**. Economic data is published by statistical
agencies on predetermined schedules. Social sources add no value and high risk
for economic alerts. T4 sources are excluded entirely from economy ingestion.

### Health — Excluded

Health **does not use X sources**. Health misinformation is high-risk. The
platform must only amplify information traceable to official health agencies,
peer-reviewed literature, or established newswires. T4 sources are excluded
entirely from health ingestion.

---

## Summary Table

| Topic | X source types | Accounts | Queries | Can trigger alert? | Confirmation required? | Severity cap | Default trust score |
|-------|---------------|----------|---------|-------------------|----------------------|-------------|-------------------|
| crypto | `x_account`, `x_query` | 2 | 1 | Yes (capped) | No (below cap) | 60 | 25 |
| ai | `x_account`, `x_query` | 2 | 1 | Yes (capped) | Recommended > 40 | 50 | 25 |
| finance | `x_query` only | 0 | 1 | Watch-only | Yes (always) | 30 | 25 |
| energy | `x_account` only | 1 | 0 | Confirmation only | Yes (geopolitical) | 50 | 25 |
| economy | ❌ excluded | 0 | 0 | — | — | — | — |
| health | ❌ excluded | 0 | 0 | — | — | — | — |

---

## v1 Scope Recommendation

### What to enable first

All X sources are disabled (`is_active: 0`) pending X API credential
configuration. When credentials are available, enable sources in this order:

1. **Crypto `x_account` — Whale Alert** — highest signal-to-noise ratio;
   on-chain transfer data is objectively verifiable.
2. **AI `x_account` — OpenAI, Anthropic** — official lab accounts with
   high relevance and low noise.
3. **Crypto `x_query` — BTC Breakout** — useful crowd sentiment signal,
   but higher noise than account monitoring.
4. **Energy `x_account` — IEA** — low volume, high quality, but energy is
   a lower-priority v1 topic.
5. **AI `x_query` — AI Model Launch** — broader search, higher noise.
6. **Finance `x_query` — Fed Decision** — watch-only; enable last since it
   cannot trigger alerts independently.

### What to defer to v2

- Additional crypto accounts (exchange official accounts, project accounts)
- Additional AI accounts (Google DeepMind, Meta AI, Mistral)
- Finance `x_account` sources (no reliable accounts identified for v1)
- Energy `x_query` sources (query patterns too noisy for v1)
- Any X sources for economy or health (excluded by policy)
- Hashtag-only monitoring (currently embedded in query patterns)

### Scope constraints

- **v1 total X sources:** 8 (5 accounts + 3 queries)
- **v1 active X sources at launch:** 0 (all disabled until credentials ready)
- **Maximum X API calls per cycle:** depends on poll intervals; at full
  enablement with the intervals above, approximately 12–15 calls per 15-minute
  window across all topics.

---

## Operational Guidance

### Polling and Fetch Cadence

| Source type | Recommended interval | Rationale |
|-------------|---------------------|-----------|
| `x_account` (whale/signal) | 5 min | Fast-moving signal accounts; short poll interval catches time-sensitive events |
| `x_account` (official org) | 10–15 min | Official accounts post less frequently; longer interval reduces API usage |
| `x_query` | 10–15 min | Keyword searches return batches; 10–15 min is sufficient to catch trends without excessive API cost |

### X API Rate Limits

X API v2 recent search endpoint allows:
- **Basic tier:** 10 requests per 15 minutes, 10 tweets per request
- **Pro tier:** 300 requests per 15 minutes, 100 tweets per request

At Basic tier, the 8 v1 sources (5 accounts + 3 queries) fit within the
10-request limit if polled at staggered intervals. The `max_results` field in
`metadata_json` for query sources controls batch size (default: 10–20).

### Credential Configuration

X sources require an X API v2 bearer token configured as an n8n HTTP Header
Auth credential named **"X Bearer Token"**. Steps:

1. Obtain an X API bearer token from the X Developer Portal.
2. Create an n8n HTTP Header Auth credential with header `Authorization` and
   value `Bearer <token>`.
3. Name the credential **"X Bearer Token"**.
4. Update the relevant X source entries in D1 to `is_active = 1`.
5. Alternatively, include the X source objects in `INTRADAY_SOURCES_JSON` if
   using the static config approach.

### Monitoring and Alerts

When X sources are enabled:
- Monitor n8n workflow logs for X API errors (rate limits, auth failures).
- Track the ratio of X-sourced alerts to total alerts per topic; if X noise
  exceeds 30% of alerts for a topic, consider tightening the query or
  reducing poll frequency.
- Review X-sourced alerts weekly during the first month to validate
  signal quality and adjust severity caps if needed.

---

## Module Implementation Notes

### Module 01 — Source Ingestion

X sources are fetched using the X API v2 endpoints:
- `x_account`: `GET /2/users/:id/tweets` (user timeline)
- `x_query`: `GET /2/tweets/search/recent` (recent search)

The `metadata_json` field on each source provides the `x_user_id` or
`search_query` needed to construct the API request. Module 01 routes to the
correct parser based on `source_type`.

### Module 05 — AI Classification

When trust-tier-aware classification is enabled, the classifier receives
`source_type` and `trust_tier` from the source metadata. For X sources:
- The prompt should note that the source is T4 (social/signal).
- `confidence_score` should be reduced by ≥ 20 points.
- The classifier should not treat X-sourced claims as confirmed facts.

### Module 06 — Alert Decision

Module 06 must enforce per-topic T4 rules:
- Apply the topic-specific severity cap to any item where `source_type` is
  `x_account` or `x_query`.
- For finance, X items must be flagged as watch-only (severity ≤ 30) and
  require confirmation before escalation.
- For economy and health, X items must be filtered out entirely (these topics
  should never have active X sources, but the module should enforce this as a
  safety net).

---

## Cross-References

- Trust model and per-topic source strategy: `docs/source-strategy.md`
- Source registry data model: `docs/data-model/source-registry.md`
- Per-topic source configs (JSON): `config/sources/`
- D1 seed data: `db/seeds/sources.sql`
- Source item contract: `workflows/contracts/intraday_source_item.json`
- Source registry migration: `db/migrations/0004_source_registry.sql`
