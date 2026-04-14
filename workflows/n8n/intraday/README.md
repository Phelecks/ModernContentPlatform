# Intraday Alert Workflows

This directory contains the v1 n8n workflow files for the live alert pipeline.

## How it works

The orchestrator runs every 15 minutes and chains nine modules in sequence.
Each module is a standalone sub-workflow that receives a JSON payload and
returns a JSON payload. Persistence always completes before delivery.

```
Schedule → Ingestion → Normalization → Deduplication → Clustering
         → AI Classification → Alert Decision → D1 Persistence
         → Telegram Delivery (parallel)
         → Discord Delivery  (parallel)
```

## Files

| File | Module | Purpose |
|------|--------|---------|
| `00_local_alert_smoke_test.json` | Smoke Test | **Local dev only.** Manual trigger, mock payload, D1 write + read-back verify. No external dependencies. |
| `orchestrator.json` | Orchestrator | Schedule trigger + module chain |
| `01_source_ingestion.json` | 01 | Fetch raw items from RSS, API, NewsAPI, and X sources; routes each source config through its dedicated adapter |
| `02_normalization.json` | 02 | Normalize to internal format, compute item_id |
| `03_deduplication.json` | 03 | Drop items already in D1 (last 24 h) |
| `04_clustering.json` | 04 | Keyword-based event clustering |
| `05_ai_classification.json` | 05 | AI topic, score, and summary generation |
| `06_alert_decision.json` | 06 | Apply importance/severity thresholds |
| `07_d1_persistence.json` | 07 | Write clusters, alerts, and daily_status to D1 |
| `08_telegram_delivery.json` | 08 | Send approved alerts to Telegram |
| `09_discord_delivery.json` | 09 | Send approved alerts to Discord |

The shared `failure_notifier.json` lives in `../shared/` and is set as the
`errorWorkflow` in every module's settings.

## Import order

### Smoke test only (quickest path to verify the write path)

1. Import `00_local_alert_smoke_test.json`.
2. Set the `CF_ACCOUNT_ID` and `CF_D1_DATABASE_ID` variables.
3. Configure the `CloudflareD1Api` credential (HTTP Header Auth, `Authorization: Bearer <token>`).
4. Click **Execute workflow**.

See `docs/alert-write-flow.md` for the full step-by-step guide.

### Full intraday pipeline

1. Import `../shared/failure_notifier.json` first and note its workflow ID.
2. Import modules `01` through `09` and note each workflow ID.
3. Import `orchestrator.json` last.
4. Set the workflow ID variables (see below) in n8n Settings → Variables.
5. Set the credential and environment variables (see below).
6. Activate the orchestrator.

## Required n8n variables

Set these in **Settings → Variables** in your n8n instance.

| Variable | Description | Required for |
|---------|-------------|-------------|
| `CF_ACCOUNT_ID` | Cloudflare account ID | Smoke test + modules 03, 07, 08, 09 |
| `CF_D1_DATABASE_ID` | D1 database ID | Smoke test + modules 03, 07, 08, 09 |
| `LOCAL_SITE_URL` | Local site base URL (default: `http://localhost:8788`) | Smoke test (URL output only) |
| `FAILURE_NOTIFIER_WORKFLOW_ID` | Workflow ID of `failure_notifier.json` | Full pipeline |
| `INTRADAY_INGESTION_WORKFLOW_ID` | Workflow ID of `01_source_ingestion.json` | Full pipeline |
| `INTRADAY_NORMALIZATION_WORKFLOW_ID` | Workflow ID of `02_normalization.json` | Full pipeline |
| `INTRADAY_DEDUPLICATION_WORKFLOW_ID` | Workflow ID of `03_deduplication.json` | Full pipeline |
| `INTRADAY_CLUSTERING_WORKFLOW_ID` | Workflow ID of `04_clustering.json` | Full pipeline |
| `INTRADAY_AI_CLASSIFICATION_WORKFLOW_ID` | Workflow ID of `05_ai_classification.json` | Full pipeline |
| `INTRADAY_ALERT_DECISION_WORKFLOW_ID` | Workflow ID of `06_alert_decision.json` | Full pipeline |
| `INTRADAY_D1_PERSISTENCE_WORKFLOW_ID` | Workflow ID of `07_d1_persistence.json` | Full pipeline |
| `INTRADAY_TELEGRAM_WORKFLOW_ID` | Workflow ID of `08_telegram_delivery.json` | Full pipeline |
| `INTRADAY_DISCORD_WORKFLOW_ID` | Workflow ID of `09_discord_delivery.json` | Full pipeline |
| `ALERT_IMPORTANCE_THRESHOLD` | Minimum importance score to send (default: `60`) | Full pipeline |
| `ALERT_SEVERITY_THRESHOLD` | Minimum severity score to send (default: `50`) | Full pipeline |
| `ALERT_CONFIDENCE_THRESHOLD` | Minimum AI confidence to send (default: `40`) | Full pipeline |
| `AI_MODEL_FAST` | OpenAI model for classification (default: `gpt-4o-mini`) | Module 05 |
| `TELEGRAM_CHAT_ID` | Target Telegram chat or channel ID | Full pipeline |
| `DISCORD_WEBHOOK_URL` | Discord incoming webhook URL | Full pipeline |
| `FAILURE_ALERT_CHANNEL` | Telegram chat ID for failure notifications | Full pipeline |
| `INTRADAY_SOURCES_JSON` | JSON array of source configs (see below) | Full pipeline |
| `NEWS_API_KEY` | NewsAPI.org API key — store in this variable and reference from the `NewsApiCredential` HTTP Header Auth credential | NewsAPI sources only |

## Source adapter pattern

Module 01 routes each source config item through a dedicated adapter based on
its `type` field.  See [`adapters/README.md`](adapters/README.md) for the
adapter pattern and instructions on adding new provider adapters.

## Source configuration

`INTRADAY_SOURCES_JSON` is a JSON array of source objects.  
When the variable is empty or omitted the workflow falls back to a default set
of public RSS/API sources for local development.  **These defaults contain no X
or NewsAPI sources and will cause a `PROVIDER_CONFIG_ERROR`.  For production use
you must set `INTRADAY_SOURCES_JSON` explicitly with at least one X source
(`type: x_account` or `type: x_query`) or one NewsAPI source (`type: newsapi`).**

```json
[
  { "name": "CoinDesk RSS",    "type": "rss", "url": "https://www.coindesk.com/arc/outboundfeeds/rss/" },
  { "name": "Reuters Finance", "type": "rss", "url": "https://feeds.reuters.com/reuters/businessNews" },
  { "name": "Ars Technica",    "type": "rss", "url": "https://feeds.arstechnica.com/arstechnica/index" },
  { "name": "Hacker News",     "type": "api", "url": "https://hacker-news.firebaseio.com/v0/topstories.json" }
]
```

### Source-provider selection (required)

Module 01 (`Build Source List`) enforces source-provider validation before
any fetches run.  Two managed provider types are recognised:

| Provider | Source types | Credential needed |
|----------|-------------|-------------------|
| **X** | `x_account`, `x_query` | `X Bearer Token` HTTP Header Auth credential |
| **NewsAPI** | `newsapi` | `NEWS_API_KEY` n8n variable |

Provider mode is resolved automatically from the contents of `INTRADAY_SOURCES_JSON`:

| State | Result |
|-------|--------|
| X sources present, no NewsAPI sources | `x_only` — only X and non-provider sources fetched |
| NewsAPI sources present, no X sources | `newsapi_only` — only NewsAPI and non-provider sources fetched |
| Both present | `hybrid` — all sources fetched |
| Neither present | **Workflow fails** with `PROVIDER_CONFIG_ERROR` |

Non-provider source types (`rss`, `api`, `webhook`, `social`) are always
included and do not count toward the provider-presence check.  The error
state only triggers when the source list contains **no X and no NewsAPI
sources**.

The resolved mode is logged at the start of each run:
```
[source-ingestion] provider_mode=x_only active_sources=3
```

The selection logic is implemented in `app/src/utils/sourceProviders.js` and
mirrored in the `Build Source List` node for testability.

### X source configuration

X sources use `type: "x_account"` or `type: "x_query"` and carry source-specific
metadata in `metadata_json`:

```json
[
  {
    "name": "Whale Alert (X)",
    "type": "x_account",
    "url": "https://x.com/whale_alert",
    "metadata_json": "{\"x_user_id\":\"whale_alert\",\"monitor_type\":\"account\"}"
  },
  {
    "name": "X Search: BTC Breakout",
    "type": "x_query",
    "url": "https://api.twitter.com/2/tweets/search/recent",
    "metadata_json": "{\"search_query\":\"(#Bitcoin OR #BTC) (breakout OR ATH) -is:retweet lang:en\",\"monitor_type\":\"query\",\"max_results\":20}"
  }
]
```

X sources require an n8n HTTP Header Auth credential named "X Bearer Token"
with a valid X API v2 bearer token. See `config/sources/README.md` for details.

### NewsAPI source configuration

NewsAPI sources use `type: "newsapi"` and are fetched as generic API sources
(routed through `Fetch API Source` → `Parse API Items`):

```json
[
  {
    "name": "NewsAPI Top Headlines",
    "type": "newsapi",
    "url": "https://newsapi.org/v2/top-headlines?language=en&pageSize=20",
    "metadata_json": "{\"category\":\"technology\"}"
  }
]
```

Authenticate using an n8n HTTP Header Auth credential named `NewsApiCredential`
with header name `X-Api-Key` and your NewsAPI.org key as the value.  Store the
key in the `NEWS_API_KEY` n8n variable and reference it from the credential —
do **not** embed API keys in the URL, as they can be leaked via logs, monitoring,
and proxy or referrer headers.  NewsAPI sources are classified as T3 (Specialist
news) by default.

## Required n8n credentials

| Credential name | Type | Used by |
|----------------|------|--------|
| `CloudflareD1Api` | HTTP Header Auth | Modules 03, 07, 08, 09 |
| `OpenAiApi` | OpenAI API | Module 05 |
| `TelegramBotApi` | Telegram Bot API | Modules 08, shared notifier |
| `X Bearer Token` | HTTP Header Auth | Module 01 (X sources only) |
| `NewsApiCredential` | HTTP Header Auth | Module 01 (NewsAPI sources only) |

For `CloudflareD1Api` set the header:
- Header name: `Authorization`
- Header value: `Bearer <your-cloudflare-api-token>`

The API token needs the **D1:Edit** permission for the target database.

## Retry behaviour

| Failure point | Retries | Back-off |
|--------------|---------|---------|
| Source HTTP fetch | 3 | 2 s between attempts |
| X API fetch | 3 | 5 s between attempts |
| D1 REST write | 3 | 2 s between attempts |
| AI API call | 3 | 5 s between attempts |
| Telegram send | 3 | 3 s between attempts |
| Discord send | 3 | 3 s between attempts |
| Failure notifier | 2 | 5 s between attempts |

After all retries are exhausted n8n triggers the `failure_notifier` workflow.

Alerts that have been written to D1 but not yet delivered can be recovered
by querying the `alerts` table for rows where `delivered_telegram = 0` or
`delivered_discord = 0` and reprocessing them via a separate delivery retry
workflow (not included in v1 — add in v1.1 as needed).

## Contract files

| File | Description |
|------|-------------|
| `workflows/contracts/intraday_source_item.json` | Raw source item schema |
| `workflows/contracts/intraday_normalized_item.json` | Normalized item schema |
| `workflows/contracts/intraday_classified_alert.json` | AI-classified alert schema |
| `workflows/contracts/intraday_delivery_payload.json` | Approved delivery payload schema |
| `schemas/ai/alert_classification.json` | AI output validation schema |

## Architecture reference

See `docs/architecture/intraday-workflow.md` for the full architecture doc
including the module map, D1 write points, idempotency strategy, and
multi-topic classification design.
