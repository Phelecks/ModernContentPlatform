# Source Configs — `config/sources/`

This directory contains per-topic source configuration files for the v1 intraday
ingestion pipeline.

Each file is a JSON array of source objects compatible with the `INTRADAY_SOURCES_JSON`
n8n variable consumed by
[`workflows/n8n/intraday/01_source_ingestion.json`](../../workflows/n8n/intraday/01_source_ingestion.json).

See [`docs/source-strategy.md`](../../docs/source-strategy.md) for the full
source strategy, trust model, and per-topic usage rules.

---

## Files

| File | Topic | Sources |
|------|-------|---------|
| `ai.json` | AI | Ars Technica, Hacker News API, OpenAI blog, MIT Technology Review, OpenAI X account, Anthropic X account, AI launch X query |
| `crypto.json` | Crypto | CoinGecko API (placeholder), CoinDesk RSS, Reuters crypto RSS, Whale Alert X account, CZ Binance X account, BTC breakout X query |
| `economy.json` | Economy | BLS RSS, Federal Reserve FRED API, Reuters general news RSS |
| `energy.json` | Energy | IEA RSS, EIA RSS, Reuters general news RSS, IEA X account |
| `finance.json` | Finance | Reuters business RSS, SEC EDGAR RSS, Federal Reserve RSS, Fed decision X query |
| `health.json` | Health | WHO RSS, CDC RSS, Reuters health RSS |

---

## Source object schema

Each object in these arrays matches the source configuration shape expected by
module 01:

```json
{
  "name":       "Human-readable source label",
  "type":       "rss | api | social | webhook | x_account | x_query | placeholder",
  "url":        "https://...",
  "topic_slug": "crypto | ai | finance | economy | health | energy",
  "trust_tier": "T1 | T2 | T3 | T4",
  "notes":      "(optional) operator notes",
  "x_user_id":  "(optional, x_account only) X username",
  "search_query": "(optional, x_query only) X search query string",
  "poll_interval_minutes": "(optional, X sources) recommended poll interval",
  "severity_cap": "(optional, X sources) maximum severity_score for this source",
  "confirmation_required": "(optional, X sources) whether T1–T3 confirmation is required",
  "can_trigger_alert": "(optional, X sources) whether posts can trigger alerts directly"
}
```

The X-specific fields (`poll_interval_minutes`, `severity_cap`,
`confirmation_required`, `can_trigger_alert`) are operational metadata defined
in `docs/x-source-rules.md`. They are not consumed directly by module 01 but
serve as operator reference and should be mapped to D1 `metadata_json` when
seeding the source registry.

The `topic_slug` and `trust_tier` fields are extensions beyond the base module 01
contract. Module 01 only requires `name`, `type`, and `url`. Treat these
additional fields as source-configuration metadata: they are useful for topic
management and future workflow extensions, but they are not guaranteed to be
available downstream unless ingestion/normalization explicitly preserves them.

---

## How to wire into n8n

1. Decide which topics to run. Combine the relevant per-topic arrays into one
   flat array (topics can be mixed or kept separate with per-topic orchestrator
   runs).
2. Serialise the combined array to a JSON string.
3. Set the n8n variable `INTRADAY_SOURCES_JSON` to that string.

**Example — combine all v1 topics:**

```bash
node -e "
const topics = ['ai','crypto','economy','energy','finance','health'];
const sources = topics.flatMap(t => require('./config/sources/' + t + '.json'));
console.log(JSON.stringify(sources));
"
```

Paste the output into the `INTRADAY_SOURCES_JSON` n8n variable.

---

## Credentials required

| Source | Credential type | Notes |
|--------|----------------|-------|
| Federal Reserve FRED API | Query param `api_key` | Module 01 uses the URL verbatim; operators must replace `REPLACE_WITH_FRED_API_KEY` in `economy.json` with a real key, or update the workflow to inject the key from an n8n credential |
| X sources (`x_account`, `x_query`) | Bearer token (`Authorization: Bearer`) | Requires an X API v2 bearer token configured as an n8n HTTP Header Auth credential named "X Bearer Token". These source configs do not include an `is_active` flag, so any X sources included in `INTRADAY_SOURCES_JSON` will be passed to module 01. Omit X sources from `INTRADAY_SOURCES_JSON` until credentials are configured, or add explicit filtering in the workflow before enabling them. The D1 seed data (`db/seeds/sources.sql`) does set `is_active: 0` for X sources |
| All others | None (public) | — |
