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
| `ai.json` | AI | Ars Technica, Hacker News API, OpenAI blog, MIT Technology Review |
| `crypto.json` | Crypto | CoinGecko API (placeholder), CoinDesk RSS, Reuters crypto RSS |
| `economy.json` | Economy | BLS RSS, Federal Reserve FRED API, Reuters general news RSS |
| `energy.json` | Energy | IEA RSS, EIA RSS, Reuters general news RSS |
| `finance.json` | Finance | Reuters business RSS, SEC EDGAR RSS, Federal Reserve RSS |
| `health.json` | Health | WHO RSS, CDC RSS, Reuters health RSS |

---

## Source object schema

Each object in these arrays matches the source configuration shape expected by
module 01:

```json
{
  "name":       "Human-readable source label",
  "type":       "rss | api | social | webhook | placeholder",
  "url":        "https://...",
  "topic_slug": "crypto | ai | finance | economy | health | energy",
  "trust_tier": "T1 | T2 | T3 | T4",
  "notes":      "(optional) operator notes"
}
```

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
| All others | None (public) | — |
