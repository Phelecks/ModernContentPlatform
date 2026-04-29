# Finance & Crypto Source Readiness — Production Launch

## Overview

This document records the finalized source coverage for the Finance and Crypto
topics ahead of the v1 production rollout. Sources are intentionally selected
and prioritized based on the trust model in `docs/source-strategy.md`.

---

## Finance — Production Source List

### Active Sources (7)

| # | Source | Type | Trust Tier | Poll Interval | Priority | Notes |
|---|--------|------|-----------|---------------|----------|-------|
| 1 | SEC EDGAR RSS | rss | T1 | 30 min | 90 | Official regulatory filings. **Note:** feed uses Atom format (`<entry>` elements); module 01 RSS parser must be extended to handle Atom before items are ingested. |
| 2 | Federal Reserve News RSS | rss | T1 | 30 min | 90 | Official central bank statements |
| 3 | U.S. Treasury Press Releases RSS | rss | T1 | 30 min | 85 | Official government fiscal policy |
| 4 | Reuters Business RSS | rss | T2 | 15 min | 80 | Wire service — fast, reliable |
| 5 | CNBC Finance RSS | rss | T2 | 15 min | 75 | Major financial news network |
| 6 | Yahoo Finance RSS | rss | T3 | 15 min | 60 | Broad market coverage |
| 7 | MarketWatch RSS | rss | T3 | 15 min | 55 | Market commentary and news |

### Inactive / Pending Sources (3)

| # | Source | Type | Trust Tier | Reason Inactive |
|---|--------|------|-----------|-----------------|
| 1 | Financial Times RSS | rss | T2 | May require authentication; validate access |
| 2 | X Search: Fed Decision | x_query | T4 | Pending X API credentials |
| 3 | X Search: Earnings Season | x_query | T4 | Pending X API credentials |

### Excluded (noisy / low-value for v1)

| Source | Reason |
|--------|--------|
| Seeking Alpha | High noise, user-generated, inconsistent quality |
| Motley Fool | Promotional tone, low signal-to-noise |
| Benzinga | Aggregator with high volume of low-importance items |
| Reddit r/wallstreetbets | Extremely noisy, meme-driven, T4 excluded for finance |
| StockTwits | Social signal — finance T4 rules prohibit independent triggering |

### Provider Mode

- **Primary mode:** RSS-only (no provider flags needed)
- **X sources:** Watch-only when enabled; severity capped at 30
- **NewsAPI:** Not configured for finance topic in v1

### Trust & Polling Review

- The poll intervals in this section reflect the intended cadence stored in D1
  seed/config metadata. Actual polling depends on how often the intraday
  workflow is scheduled or run for the relevant finance topic/source group.
- T1 sources (SEC, Fed, Treasury) are configured for a 30 min target cadence
  — official releases are infrequent but high-importance, so this setting is
  intended to be sufficient.
- T2 sources (Reuters, CNBC) are configured for a 15 min target cadence —
  wire services publish frequently, and this setting is intended to provide
  timely coverage without excessive API load.
- T3 sources (Yahoo Finance, MarketWatch) are configured for a 15 min target
  cadence — aligned with wire-source configuration for consistent ingestion
  planning.
- T4 X sources are watch-only; they cannot trigger alerts independently per
  finance source strategy rules.

---

## Crypto — Production Source List

### Active Sources (6)

| # | Source | Type | Trust Tier | Poll Interval | Priority | Notes |
|---|--------|------|-----------|---------------|----------|-------|
| 1 | Reuters Crypto RSS | rss | T2 | 15 min | 80 | Wire service — general tech/crypto |
| 2 | CoinDesk RSS | rss | T3 | 10 min | 70 | Leading crypto specialist outlet |
| 3 | Decrypt RSS | rss | T3 | 10 min | 65 | Established crypto news |
| 4 | The Block RSS | rss | T3 | 10 min | 65 | Institutional crypto coverage |
| 5 | CoinTelegraph RSS | rss | T3 | 10 min | 60 | Broad crypto news coverage |
| 6 | Bitcoin Magazine RSS | rss | T3 | 15 min | 55 | Bitcoin-focused specialist |

### Inactive / Pending Sources (8)

| # | Source | Type | Trust Tier | Reason Inactive |
|---|--------|------|-----------|-----------------|
| 1 | CoinGecko API | api | T1 | Parser mapping not yet implemented; will be highest-priority source once enabled |
| 2 | NewsAPI Crypto | newsapi | T3 | Requires NEWS_API_KEY subscription |
| 3 | Financial Times RSS | rss | T2 | May require authentication; validate access first |
| 4 | Whale Alert (X) | x_account | T4 | Pending X API credentials |
| 5 | CZ Binance (X) | x_account | T4 | Pending X API credentials |
| 6 | Vitalik Buterin (X) | x_account | T4 | Pending X API credentials |
| 7 | X Search: BTC Breakout | x_query | T4 | Pending X API credentials |
| 8 | X Search: ETH DeFi | x_query | T4 | Pending X API credentials |

### Excluded (noisy / low-value for v1)

| Source | Reason |
|--------|--------|
| Reddit r/cryptocurrency | High noise, meme content, requires careful filtering |
| Telegram pump groups | Manipulation risk, extremely noisy |
| YouTube crypto channels | Long-form, not suitable for intraday alerts |
| CryptoSlate | Lower quality, overlaps with CoinDesk/Decrypt |
| NewsBTC | Promotional tone, lower editorial standards |
| Santiment social feeds | Requires paid API, better suited for v2 analytics |

### Provider Mode

- **Primary mode:** RSS-only for v1 launch
- **X sources:** Enabled when credentials available; severity capped at 60
- **NewsAPI:** Available as supplemental source via `ENABLE_NEWSAPI=true`

### Trust & Polling Review

- The poll intervals in this section reflect the intended cadence stored in D1
  seed/config metadata. Actual polling depends on how often the intraday
  workflow is scheduled or run for the relevant crypto topic/source group.
- T2 source (Reuters) configured for a 15 min target cadence — provides
  editorial credibility.
- T3 specialist sources configured for a 10 min target cadence — crypto moves
  fast; shorter interval is intended to catch breaking news from specialist
  outlets sooner.
- T4 X sources (when enabled) configured for 5–10 min target cadence — social
  signals are time-sensitive but capped at severity 60.
- CoinGecko API will become the primary market data source once parser support
  lands; treated as T1 equivalent for price/volume signals.

---

## Readiness Checklist

- [x] Finance active source list defined (7 sources across T1–T3)
- [x] Crypto active source list defined (6 active RSS sources)
- [x] Trust tier assignments reviewed and documented
- [x] Poll intervals set per source category (intended cadence; actual depends on workflow schedule)
- [x] Priority weights assigned for ingestion ordering
- [x] Noisy/low-value sources explicitly excluded with reasoning
- [x] X sources configured in D1 seeds but excluded from config JSONs pending credentials
- [x] NewsAPI source configured in D1 seeds but excluded from config JSON pending API key
- [x] CoinGecko configured in D1 seeds but excluded from config JSON pending parser
- [x] FT RSS configured in D1 seeds but excluded from config JSON pending access validation
- [x] Provider mode documented per topic
- [x] Source configs updated in `config/sources/finance.json`
- [x] Source configs updated in `config/sources/crypto.json`
- [x] D1 seed data updated in `db/seeds/sources.sql`
- [x] README updated with new source counts
- [x] `newsapi` added to `VALID_SOURCE_TYPES` in `functions/lib/validate.js`
- [ ] SEC EDGAR Atom parser support added to module 01 (currently only `<item>` elements parsed)
- [ ] FT RSS access validated (may need authentication)
- [ ] CoinGecko parser mapping implemented (module 01)
- [ ] X API credentials configured in n8n (enables T4 sources)
- [ ] NewsAPI key provisioned (enables aggregated coverage)
- [ ] Production smoke test with live RSS feeds

---

## Post-Launch Expansion (v1.1)

Sources to consider adding after v1 is validated:

**Finance:**
- Bloomberg RSS (if publicly available)
- ECB press releases RSS
- Bank of England announcements
- Earnings calendar API integration

**Crypto:**
- CoinMarketCap API (alternative/supplement to CoinGecko)
- DeFi Llama API (TVL and protocol data)
- Etherscan gas/transaction alerts via webhook
- Binance announcements RSS
- Messari newsletter/API
