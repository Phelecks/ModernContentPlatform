# Fixtures

Deterministic sample datasets for local development, workflow testing, and integration tests.

Fixtures are stable, versioned JSON files that represent realistic platform data at each stage of the processing pipeline. They can be used as-is by n8n workflows, CI tests, local reset scripts, and integration test helpers.

---

## Directory structure

```
fixtures/
  source-events/          Raw items fetched from external sources (matches intraday_source_item schema)
  normalized-items/       Items after normalization (matches intraday_normalized_item schema)
  classified-alerts/      AI-classified alert sets per topic/day (matches intraday_classified_alert schema)
  daily-summaries/        AI-generated daily summary outputs per topic/day (matches daily_summary schema)
  page-states/            Day-status API response snapshots for each page_state scenario
```

---

## Naming convention

All fixture files use the pattern:

```
{topic}-{YYYY-MM-DD}-{scenario_or_short_name}.json
```

For sets that contain all alerts for a topic/day, the scenario suffix is omitted:

```
{topic}-{YYYY-MM-DD}.json
```

| Segment | Description |
|---|---|
| `{topic}` | Stable topic slug: `crypto`, `finance`, `economy`, `health`, `ai`, `energy`, `technology` |
| `{YYYY-MM-DD}` | Date key using the canonical `date_key` format |
| `{scenario}` | Short descriptor: `published`, `ready`, `pending`, `btc-etf-inflows`, `fed-minutes`, etc. |

---

## Files

### source-events/

Raw payloads as they arrive from external sources, before any normalization. Match the `intraday_source_item` contract (`workflows/contracts/intraday_source_item.json`).

| File | Topic | Scenario |
|---|---|---|
| `crypto-2025-01-15-btc-etf-inflows.json` | crypto | Spot Bitcoin ETF inflow story |
| `finance-2025-01-15-fed-minutes.json` | finance | FOMC minutes release |
| `ai-2025-01-15-open-weight-model.json` | ai | 70B open-weight model release |

### normalized-items/

Items after the normalization stage: HTML stripped, headline cleaned, topic candidates identified, `item_id` computed. Match the `intraday_normalized_item` contract (`workflows/contracts/intraday_normalized_item.json`).

| File | Topic | Scenario |
|---|---|---|
| `crypto-2025-01-15-btc-etf-inflows.json` | crypto | ETF inflow story normalized |
| `finance-2025-01-15-fed-minutes.json` | finance | Fed minutes normalized |
| `ai-2025-01-15-open-weight-model.json` | ai | Model release normalized |

### classified-alerts/

Arrays of AI-classified alerts for a full topic/day. Each object matches the `intraday_classified_alert` contract (`workflows/contracts/intraday_classified_alert.json`) and includes scores, `send_alert`, and `cluster_label`.

| File | Topic | Alerts |
|---|---|---|
| `crypto-2025-01-15.json` | crypto | 3 alerts — Bitcoin ETF Inflows cluster |
| `finance-2025-01-15.json` | finance | 3 alerts — Fed Rate Decision cluster |
| `ai-2025-01-15.json` | ai | 3 alerts — Open-Source Model Release cluster |

### daily-summaries/

Structured AI output for the daily summary step. Match the `daily_summary` AI schema (`schemas/ai/daily_summary.json`). These represent the summary payload validated and published by the daily editorial workflow.

| File | Topic | Sentiment | topic_score |
|---|---|---|---|
| `crypto-2025-01-15.json` | crypto | bullish | 78 |
| `finance-2025-01-15.json` | finance | bearish | 85 |

### page-states/

Snapshots of the `GET /api/day-status/:topicSlug/:dateKey` response for common page state scenarios. Match the `api/day-status` schema (`schemas/api/day-status.json`).

| File | Topic | page_state | article | video |
|---|---|---|---|---|
| `crypto-2025-01-15-published.json` | crypto | `published` | ✓ | ✓ |
| `finance-2025-01-15-published.json` | finance | `published` | ✓ | ✗ |
| `ai-2025-01-15-ready.json` | ai | `ready` | ✗ | ✗ |
| `crypto-2025-01-16-pending.json` | crypto | `pending` | ✗ | ✗ |

---

## Usage

### In integration tests

Import fixtures via the `@fixtures` alias (configured in `app/vitest.config.js`) or use the pre-built helper:

```js
import {
  CRYPTO_PUBLISHED_STATUS,
  FINANCE_PUBLISHED_STATUS,
  AI_READY_STATUS,
  CRYPTO_PENDING_STATUS,
  CRYPTO_CLASSIFIED_ALERTS,
  CRYPTO_DAILY_SUMMARY
} from './helpers/fixtures.js'
```

Or import JSON directly:

```js
import cryptoPublished from '@fixtures/page-states/crypto-2025-01-15-published.json'
import cryptoAlerts from '@fixtures/classified-alerts/crypto-2025-01-15.json'
```

See `app/src/__tests__/integration/helpers/fixtures.js` for the full set of named exports.

### In local development (seeding D1)

The `db/seeds/sample_alerts.sql` file seeds the same data as these fixtures into a local D1 database:

```bash
wrangler d1 execute modern-content-platform-db --file=db/seeds/topics.sql --local
wrangler d1 execute modern-content-platform-db --file=db/seeds/sample_alerts.sql --local
```

Use `scripts/local-reset.sh` to wipe and reseed from scratch.

### In n8n workflow testing

Use source-event fixtures as manual trigger payloads to test the intraday ingestion pipeline:

1. Open the workflow you want to test in the local n8n instance
2. Use **Manual Trigger** or **Edit Fields** node with the fixture JSON as input
3. Start with `source-events/` for module 01, `normalized-items/` for modules 02–04, and `classified-alerts/` for modules 05–09

---

## Design notes

- All fixture data uses the canonical sample date **2025-01-15** for consistency with `db/seeds/sample_alerts.sql` and the integration test seed in `app/src/__tests__/integration/helpers/mockD1.js`.
- `item_id` values in `normalized-items/` and `classified-alerts/` are deterministic hex strings (fixed, not computed at runtime) so fixtures remain stable across runs.
- Fixtures do not contain credentials, tokens, or real external URLs — all `source_url` values point to `example.com`.
- Adding a new topic or date: follow the naming convention and add a corresponding row to the seed SQL if D1 seeding is needed.
