# Intraday Alert Workflows

This directory contains the v1 n8n workflow files for the live alert pipeline.

## How it works

The orchestrator runs every 15 minutes and chains ten modules in sequence.
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
| `orchestrator.json` | Orchestrator | Schedule trigger + module chain |
| `01_source_ingestion.json` | 01 | Fetch raw items from RSS and API sources |
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

1. Import `../shared/failure_notifier.json` first and note its workflow ID.
2. Import modules `01` through `09` and note each workflow ID.
3. Import `orchestrator.json` last.
4. Set the workflow ID variables (see below) in n8n Settings → Variables.
5. Set the credential and environment variables (see below).
6. Activate the orchestrator.

## Required n8n variables

Set these in **Settings → Variables** in your n8n instance.

| Variable | Description |
|---------|-------------|
| `FAILURE_NOTIFIER_WORKFLOW_ID` | Workflow ID of `failure_notifier.json` |
| `INTRADAY_INGESTION_WORKFLOW_ID` | Workflow ID of `01_source_ingestion.json` |
| `INTRADAY_NORMALIZATION_WORKFLOW_ID` | Workflow ID of `02_normalization.json` |
| `INTRADAY_DEDUPLICATION_WORKFLOW_ID` | Workflow ID of `03_deduplication.json` |
| `INTRADAY_CLUSTERING_WORKFLOW_ID` | Workflow ID of `04_clustering.json` |
| `INTRADAY_AI_CLASSIFICATION_WORKFLOW_ID` | Workflow ID of `05_ai_classification.json` |
| `INTRADAY_ALERT_DECISION_WORKFLOW_ID` | Workflow ID of `06_alert_decision.json` |
| `INTRADAY_D1_PERSISTENCE_WORKFLOW_ID` | Workflow ID of `07_d1_persistence.json` |
| `INTRADAY_TELEGRAM_WORKFLOW_ID` | Workflow ID of `08_telegram_delivery.json` |
| `INTRADAY_DISCORD_WORKFLOW_ID` | Workflow ID of `09_discord_delivery.json` |
| `CF_ACCOUNT_ID` | Cloudflare account ID |
| `CF_D1_DATABASE_ID` | D1 database ID |
| `ALERT_IMPORTANCE_THRESHOLD` | Minimum importance score to send (default: `60`) |
| `ALERT_SEVERITY_THRESHOLD` | Minimum severity score to send (default: `50`) |
| `ALERT_CONFIDENCE_THRESHOLD` | Minimum AI confidence to send (default: `40`) |
| `TELEGRAM_CHAT_ID` | Target Telegram chat or channel ID |
| `DISCORD_WEBHOOK_URL` | Discord incoming webhook URL |
| `FAILURE_ALERT_CHANNEL` | Telegram chat ID for failure notifications |
| `INTRADAY_SOURCES_JSON` | JSON array of source configs (see below) |

## Source configuration

`INTRADAY_SOURCES_JSON` is a JSON array of source objects.  
When empty or omitted, the default public RSS sources are used.

```json
[
  { "name": "CoinDesk RSS",    "type": "rss", "url": "https://www.coindesk.com/arc/outboundfeeds/rss/" },
  { "name": "Reuters Finance", "type": "rss", "url": "https://feeds.reuters.com/reuters/businessNews" },
  { "name": "Ars Technica",    "type": "rss", "url": "https://feeds.arstechnica.com/arstechnica/index" },
  { "name": "Hacker News",     "type": "api", "url": "https://hacker-news.firebaseio.com/v0/topstories.json" }
]
```

## Required n8n credentials

| Credential name | Type | Used by |
|----------------|------|--------|
| `CloudflareD1Api` | HTTP Header Auth | Modules 03, 07, 08, 09 |
| `OpenAiApi` | OpenAI API | Module 05 |
| `TelegramBotApi` | Telegram Bot API | Modules 08, shared notifier |

For `CloudflareD1Api` set the header:
- Header name: `Authorization`
- Header value: `Bearer <your-cloudflare-api-token>`

The API token needs the **D1:Edit** permission for the target database.

## Retry behaviour

| Failure point | Retries | Back-off |
|--------------|---------|---------|
| Source HTTP fetch | 3 | 2 s between attempts |
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
