# v1 Source Strategy — Modern Content Platform

## Overview

This document defines the source strategy for each v1 topic. It describes which
source categories to use, how to prioritise them, how much trust to assign each
source class, and any topic-specific rules that govern when signal or social
sources may be used directly versus when they require confirmation from a
higher-trust source.

The platform supports six source types (as defined in
`workflows/contracts/intraday_source_item.json`):

| Source type | Description |
|-------------|-------------|
| `rss`       | News RSS / Atom feeds |
| `api`       | Structured data APIs (market data, official statistics) |
| `social`    | Social / signal sources (Telegram channels, Reddit) |
| `webhook`   | Push-based event feeds |
| `x_account` | X (Twitter) account monitoring — fetches recent posts from a specific user |
| `x_query`   | X (Twitter) keyword/hashtag search — fetches recent posts matching a query |

Active v1 topics: `crypto`, `finance`, `economy`, `health`, `ai`, `energy`.

---

## Trust Model by Source Class

The following hierarchy applies platform-wide. Topic-specific rules may tighten
but never loosen this baseline.

| Trust tier | Source class | Description | May trigger alert alone? |
|-----------|--------------|-------------|--------------------------|
| **T1 — Official** | Government releases, central bank statements, regulatory filings, WHO / CDC / FDA advisories, peer-reviewed publications | Primary ground truth. Highest confidence. Slowest publication cycle. | Yes |
| **T2 — Wire / Newswire** | Reuters, AP, Bloomberg, Financial Times, BBC | Strong editorial standards. Fast. Near-primary trust. | Yes |
| **T3 — Specialist news** | Topic-specific outlets with established editorial record (e.g. CoinDesk for crypto, STAT News for health) | Good domain depth. Can trigger alerts but should note source tier in classification. | Yes (with tier noted) |
| **T4 — Signal / Social** | X / Twitter accounts, Reddit communities, Telegram channels, aggregators (e.g. Hacker News) | Fast but unverified. High noise. May indicate breaking events before official sources. | Only with constraints (see per-topic rules) |

### Global rules for T4 (signal / social) sources

These rules apply to all T4 sources, including `x_account`, `x_query`, and
generic `social` sources:

- A T4 item alone **must not** produce a `severity_score` above 60 (on the
  0–100 scale used by the intraday pipeline contracts).
- A T4 item may raise an alert at lower severity to flag a potential event.
- If a T4 signal is confirmed by a T1–T3 source within one ingestion cycle
  (≤ 15 minutes), the alert severity can be re-evaluated against the confirming
  source tier.
- Topics that explicitly disallow direct T4 triggering must filter social sources
  out of the alert decision step (module 06).

### X-specific trust rules

X sources (`x_account` and `x_query`) are always classified as T4 with a
default `trust_score` of 25. The following additional rules apply:

- **Confidence reduction:** When X is the only source for an event, the AI
  classification step (module 05) should reduce `confidence_score` by at least
  20 points compared to the same event from a T1–T3 source.
- **Severity cap enforcement:** Module 06 (alert decision) must enforce the
  per-topic T4 severity cap (see per-topic tables below).
- **Account vs. query distinction:** `x_account` sources monitoring known
  official accounts (e.g. `@OpenAI`, `@IEA`) may be treated with slightly
  higher confidence than `x_query` keyword searches, but both remain T4.
- **Metadata requirements:** X sources must carry `x_user_id` (for accounts)
  or `search_query` (for queries) in `metadata_json` to enable auditing.

---

## Per-Topic Source Strategy

### 1. Crypto (`crypto`)

**Lean:** Data and specialist news first; social signals permitted with constraints.

Crypto markets move faster than any editorial cycle. On-chain data, exchange
APIs, and dedicated crypto news outlets are the most reliable and timely sources.
Social signals (X, Telegram) are legitimately fast for breaking moves and
project announcements, so they are allowed with a reduced severity cap.

| Priority | Source type | Examples |
|----------|-------------|---------|
| 1 | `api` — market data | CoinGecko API, CoinMarketCap API |
| 2 | `rss` — specialist news | CoinDesk, Decrypt, The Block, Bitcoin Magazine |
| 3 | `rss` — wire / newswire | Reuters crypto section |
| 4 | `social` — signal | X crypto accounts, Telegram project channels |

**Trust rules:**
- T1–T3 sources may trigger alerts at any severity.
- T4 social sources are **permitted** with a severity cap of **60**.
- On-chain data APIs are treated as T1 equivalents for price and volume signals.
- Exchange announcements via official RSS or webhook are treated as T2.

**v1 scope:** Start with CoinGecko API + CoinDesk RSS + Reuters RSS. X account
monitoring (`x_account`) and keyword search (`x_query`) sources are defined
but disabled (`is_active: 0`) pending X API credential configuration.

---

### 2. AI (`ai`)

**Lean:** Specialist news and community signals; official announcements treated
as T1 equivalents.

AI developments are often announced first on developer platforms, research
pre-print servers, and company blogs. Community aggregators (Hacker News,
Reddit r/MachineLearning) surface relevant signals quickly. Social (X) is
useful for tracking researcher commentary but must be treated as T4.

| Priority | Source type | Examples |
|----------|-------------|---------|
| 1 | `rss` — official / company | OpenAI blog, Google DeepMind blog, Anthropic news |
| 2 | `rss` — research | arXiv cs.AI/cs.LG RSS, Papers With Code |
| 3 | `rss` — specialist news | Ars Technica AI, MIT Technology Review, VentureBeat AI |
| 4 | `api` — community | Hacker News Firebase API |
| 5 | `social` — signal | X AI researcher accounts, Reddit r/MachineLearning |

**Trust rules:**
- Official company blog RSS feeds are treated as T2 (not T1) because they are
  promotional; they must be confirmed against a wire source before maximum
  severity is assigned.
- T4 social sources are **permitted** with a severity cap of **50**.
- Research pre-prints (arXiv) are T3; claims must not be amplified as confirmed
  results.

**v1 scope:** Start with Ars Technica RSS + Hacker News API + OpenAI/Anthropic
blog RSS. X account monitoring (`x_account`) and keyword search (`x_query`)
sources are defined but disabled (`is_active: 0`) pending X API credential
configuration.

---

### 3. Finance (`finance`)

**Lean:** Official releases and wire services; social signals only for
confirmation, not primary triggering.

Financial alerts can move markets. Official sources (SEC EDGAR, Federal Reserve,
central banks) and wire services provide the authoritative signal. Social sources
are noisy and potentially manipulative; they must not trigger high-severity
alerts alone.

| Priority | Source type | Examples |
|----------|-------------|---------|
| 1 | `api` / `rss` — official | SEC EDGAR RSS, Federal Reserve news RSS, ECB press releases |
| 2 | `rss` — wire / newswire | Reuters business, AP Finance, Bloomberg RSS |
| 3 | `rss` — specialist news | Financial Times, Wall Street Journal, Barron's |
| 4 | `social` — signal | X financial accounts (confirmation only) |

**Trust rules:**
- T1–T3 sources may trigger alerts at any severity.
- T4 social sources are **not** permitted to trigger alerts independently.
  They may only be used to raise a low-priority watch flag (severity ≤ 30)
  that must be confirmed by a T1–T3 source before escalation.
- Earnings, Fed decisions, and regulatory filings are exclusively T1/T2 events.

**v1 scope:** Start with Reuters business RSS + SEC EDGAR RSS + Federal Reserve
RSS. X keyword search (`x_query`) is defined for watch-only monitoring but
disabled (`is_active: 0`) pending X API credential configuration.

---

### 4. Economy (`economy`)

**Lean:** Official data releases only; social sources excluded entirely.

Economic data (GDP, CPI, employment, trade balance) is published by statistical
agencies on predetermined schedules. The authoritative source is always the
official release. Wire services are acceptable as T2 for commentary and context.
Social sources add no value and high risk for economic alerts.

| Priority | Source type | Examples |
|----------|-------------|---------|
| 1 | `api` / `rss` — official | BLS.gov, BEA.gov, Federal Reserve FRED API, Eurostat, IMF data API, World Bank API |
| 2 | `rss` — wire / newswire | Reuters economy, AP Economy |
| 3 | `rss` — specialist news | The Economist, Financial Times economy section |

**Trust rules:**
- Only T1 and T2 sources may trigger economy alerts.
- T3 specialist news may add context but **must not** be the sole source for
  an alert.
- T4 social sources are **excluded** entirely from economy ingestion.
- AI classification must flag any alert sourced from T3+ with reduced
  confidence; the alert decision module should apply a higher threshold
  (importance ≥ 75) for T3-only economy items.

**v1 scope:** Start with BLS RSS + Federal Reserve FRED API + Reuters economy
RSS. Add international data APIs (Eurostat, IMF) in a follow-on iteration.

---

### 5. Health (`health`)

**Lean:** Official health agencies first; social sources excluded entirely.

Health misinformation is high-risk. The platform must only amplify information
that traces back to official health agencies, peer-reviewed literature, or
established newswires. Social sources are explicitly excluded.

| Priority | Source type | Examples |
|----------|-------------|---------|
| 1 | `rss` / `api` — official | WHO RSS, CDC RSS, FDA news RSS, NIH news RSS, EMA (European Medicines Agency) |
| 2 | `rss` — peer-reviewed | The Lancet, NEJM, JAMA news releases |
| 3 | `rss` — wire / newswire | Reuters health, AP Health |
| 4 | `rss` — specialist news | STAT News, MedPage Today |

**Trust rules:**
- Only T1 and T2 sources may trigger health alerts at severity ≥ 70.
- T2 wire and T3 specialist news may trigger alerts at severity < 70.
- T4 social sources are **excluded** entirely from health ingestion.
- The AI classification prompt for health must be instructed to cite source
  tier and to flag speculative or unverified claims.
- Any alert referencing a disease outbreak, drug recall, or public health
  emergency **must** trace to a T1 official source before being published.

**v1 scope:** Start with WHO RSS + CDC RSS + Reuters health RSS. Add peer-reviewed
journal RSS feeds in a follow-on iteration.

---

### 6. Energy (`energy`)

**Lean:** Official agencies and market data first; limited social signals
permitted for price-move confirmation.

Energy combines policy (IEA, EIA, OPEC), commodity price data (oil, gas,
electricity), and geopolitical events. Official agency data and wire services are
primary. Social signals from X can surface geopolitical disruptions quickly but
must be capped.

| Priority | Source type | Examples |
|----------|-------------|---------|
| 1 | `api` / `rss` — official | IEA news RSS, U.S. EIA news RSS, OPEC press releases |
| 2 | `api` — market data | EIA petroleum prices API, Bloomberg commodity RSS |
| 3 | `rss` — wire / newswire | Reuters energy, AP Energy |
| 4 | `rss` — specialist news | S&P Global Commodity Insights, Oilprice.com |
| 5 | `social` — signal | X energy/geopolitical accounts (confirmation only) |

**Trust rules:**
- T1–T3 sources may trigger alerts at any severity.
- T4 social sources are **permitted** for confirmation only, with a severity
  cap of **50**.
- OPEC decisions and IEA reports are T1; the AI classification must assign
  high importance to these events.
- Geopolitical disruption signals sourced from T4 must be held at low severity
  until confirmed by a T2 or T3 wire source.

**v1 scope:** Start with IEA RSS + EIA RSS + Reuters energy RSS. X account
monitoring (`x_account`) for official accounts is defined but disabled
(`is_active: 0`) pending X API credential configuration.

---

## Summary Table

| Topic    | Official (T1) | Wire (T2) | Specialist (T3) | Social / Signal (T4) | T4 severity cap | X source types |
|----------|:---:|:---:|:---:|:---:|:---:|:---:|
| crypto   | ✅  | ✅  | ✅  | ✅ (capped)  | 60 | `x_account`, `x_query` |
| ai       | ✅  | ✅  | ✅  | ✅ (capped)  | 50 | `x_account`, `x_query` |
| finance  | ✅  | ✅  | ✅  | ⚠️ watch-only | 30 | `x_query` (watch-only) |
| economy  | ✅  | ✅  | ⚠️ context only | ❌ excluded | — | ❌ excluded |
| health   | ✅  | ✅  | ✅  | ❌ excluded | — | ❌ excluded |
| energy   | ✅  | ✅  | ✅  | ✅ (capped)  | 50 | `x_account` |

Legend: ✅ = may trigger alerts  ⚠️ = restricted use  ❌ = excluded from ingestion

---

## Source Usage Rules — Implementation Notes

### Module 01 — Source Ingestion

Each topic reads its source list from the `INTRADAY_SOURCES_JSON` n8n variable.
Per-topic JSON source configs are provided in `config/sources/` and can be
merged into a single array when configuring the variable.

### Module 05 — AI Classification

Module 05 currently receives `source_name` for classification, but it does not
yet receive or use `source_type` or source tier metadata such as `trust_tier`.
As a result, the classification prompt cannot currently:
- note the source tier (T1–T4) in its reasoning;
- reduce `confidence_score` based on tier alone; or
- flag health or economy items for manual review based on tier alone.

Tier-aware classification should be enabled in a later workflow update by
propagating `source_type` and `trust_tier` from Modules 01/02 into Module 05.

### Module 06 — Alert Decision

Module 06 currently applies only global thresholds (`ALERT_IMPORTANCE_THRESHOLD`,
`ALERT_SEVERITY_THRESHOLD`, `ALERT_CONFIDENCE_THRESHOLD`) and has no per-topic
or per-tier logic. The topic-specific policy below is **planned** and should be
implemented in a future workflow update:

| Topic   | T4 allowed | T4 max severity | Minimum importance for T3-only (economy) | X source types |
|---------|:---:|:---:|:---:|:---:|
| crypto  | Yes | 60  | — | `x_account`, `x_query` |
| ai      | Yes | 50  | — | `x_account`, `x_query` |
| finance | Watch only | 30  | — | `x_query` only |
| economy | No  | —   | 75 | None |
| health  | No  | —   | — | None |
| energy  | Yes | 50  | — | `x_account` |

---

## v1 Practical Scope

For v1, each topic launches with a minimal set of reliable sources. Social and
advanced API sources are added in later iterations once the core pipeline is
validated.

| Topic   | v1 starter sources |
|---------|--------------------|
| crypto  | CoinGecko API, CoinDesk RSS, Reuters crypto RSS, Whale Alert X account (disabled), CZ Binance X account (disabled), BTC breakout X query (disabled) |
| ai      | Ars Technica RSS, Hacker News API, OpenAI blog RSS, OpenAI X account (disabled), Anthropic X account (disabled), AI launch X query (disabled) |
| finance | Reuters business RSS, SEC EDGAR RSS, Federal Reserve RSS, Fed decision X query (disabled) |
| economy | BLS RSS, Federal Reserve FRED API, Reuters economy RSS |
| health  | WHO RSS, CDC RSS, Reuters health RSS |
| energy  | IEA RSS, EIA news RSS, Reuters energy RSS, IEA X account (disabled) |

Machine-readable source configs for these starter sets are in `config/sources/`.

For the detailed X source lists, trust rules, severity caps, confirmation
requirements, and operational polling guidance, see
[`docs/x-source-rules.md`](x-source-rules.md).
