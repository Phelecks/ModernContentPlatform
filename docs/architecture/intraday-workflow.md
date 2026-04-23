# Intraday Alert Workflow — Architecture

## Overview

The intraday workflow runs on a schedule (every 15 minutes) and handles the
full lifecycle of a live alert: from raw source ingestion through AI
classification to D1 persistence and multi-channel delivery.

The workflow is **modular**. Each stage is a standalone n8n workflow invoked
by an orchestrator. Stages communicate through explicit JSON contracts.
Persistence is always completed **before** delivery so a delivery failure
never loses an alert.

---

## Module Map

```
[Schedule Trigger]
        │
        ▼
┌─────────────────────┐
│  01 Source Ingestion │  Fetch raw items from all configured sources
└──────────┬──────────┘
           │  raw source items[]
           ▼
┌─────────────────────┐
│  02 Normalization    │  Map every source item to the internal format
└──────────┬──────────┘
           │  normalized items[]
           ▼
┌─────────────────────┐
│  03 Deduplication    │  Drop items already seen (hash check via D1)
└──────────┬──────────┘
           │  new items[]
           ▼
┌─────────────────────┐
│  04 Clustering       │  Group new items into event clusters
└──────────┬──────────┘
           │  clustered items[]
           ▼
┌─────────────────────┐
│  05 AI Classification│  Score, classify, and summarise each item
└──────────┬──────────┘
           │  classified alerts[]
           ▼
┌─────────────────────┐
│  06 Alert Decision   │  Apply importance/severity thresholds
└──────────┬──────────┘
           │  approved alerts[]
           ▼
┌─────────────────────┐
│  07 D1 Persistence   │  Write alerts + clusters to D1, update daily_status
└──────────┬──────────┘
           │  persisted alerts[] (with D1 IDs)
           ▼
     ┌─────┴──────┐
     ▼            ▼
┌─────────┐  ┌──────────┐
│ 08 Tele │  │ 09 Disc  │  Deliver in parallel; mark delivered_* flags in D1
└────┬────┘  └────┬─────┘  Log each attempt to social_publish_log
     │            │
     └──────┬─────┘
            ▼
     ┌──────────────┐
     │ 12 Retry     │  Every 30 min: re-deliver alerts with delivered_* = 0
     └──────────────┘
```

---

## Module Responsibilities

| # | Module | Trigger | Key output |
|---|--------|---------|-----------|
| 01 | Source Ingestion | Execute Workflow | `source_item[]` |
| 02 | Normalization | Execute Workflow | `normalized_item[]` |
| 03 | Deduplication | Execute Workflow | `normalized_item[]` (new only) |
| 04 | Clustering | Execute Workflow | `clustered_item[]` |
| 05 | AI Classification | Execute Workflow | `classified_alert[]` |
| 06 | Alert Decision | Execute Workflow | `delivery_payload[]` |
| 07 | D1 Persistence | Execute Workflow | `persisted_alert[]` |
| 08 | Telegram Delivery | Execute Workflow | delivery result |
| 09 | Discord Delivery | Execute Workflow | delivery result |
| 12 | Delivery Retry | Schedule (30 min) | retry results |

A shared `failure_notifier` sub-workflow is used by every module to emit
structured error events to a monitoring channel.

---

## D1 Write Points

| Stage | Table(s) written | When |
|-------|-----------------|------|
| Deduplication | `alerts` (read) | Checks `item_id` in `metadata_json` |
| D1 Persistence | `event_clusters` | One row per cluster, upsert |
| D1 Persistence | `alerts` | One row per approved alert |
| D1 Persistence | `daily_status` | Upsert `alert_count`, `cluster_count` |
| Telegram Delivery | `alerts` | Sets `delivered_telegram = 1` |
| Discord Delivery | `alerts` | Sets `delivered_discord = 1` |
| Telegram Delivery | `social_publish_log` | Logs delivery attempt (success or failure) |
| Discord Delivery | `social_publish_log` | Logs delivery attempt (success or failure) |
| Delivery Retry | `alerts` | Re-triggers undelivered alerts within 24 hours |

Writes use the **Cloudflare D1 REST API**:
`POST https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/d1/database/{DATABASE_ID}/query`

---

## Retry Strategy

| Failure point | Retry behaviour |
|--------------|----------------|
| Source HTTP fetch | 3 retries, exponential back-off (1 s → 4 s → 16 s) |
| AI API call | 3 retries, linear back-off (5 s) |
| D1 REST write | 3 retries, linear back-off (2 s) |
| Telegram delivery | 3 retries, linear back-off (3 s) |
| Discord delivery | 3 retries, linear back-off (3 s) |

After all retries are exhausted the `failure_notifier` sub-workflow fires.
Alerts that have been written to D1 but not yet delivered can be picked up
by a separate **delivery retry** workflow that queries:

```sql
SELECT id, topic_slug, headline, summary_text, source_url, severity_score, event_at
FROM   alerts
WHERE  status              = 'active'
  AND  (delivered_telegram = 0 OR delivered_discord = 0)
ORDER  BY event_at ASC
LIMIT  50;
```

---

## Idempotency and Deduplication

Every normalized item is assigned a deterministic `item_id`:

```
item_id = SHA-256( source_name + ":" + source_id )
```

The deduplication step queries D1 for existing `metadata_json->>'item_id'`
values within the last 24 hours. Items that already exist are dropped before
any AI call is made, preventing duplicate alerts and unnecessary API spend.

Cluster upserts use `(topic_slug, date_key, cluster_label)` as the conflict key
(`INSERT ... ON CONFLICT(topic_slug, date_key, cluster_label) DO UPDATE`).
This requires the UNIQUE constraint added in migration `0002_event_clusters_unique.sql`.
Alert inserts use the `item_id` guard for idempotency.

---

## Multi-topic Classification

The AI classification step asks the model to return **one primary topic** from
the active topic list and up to two secondary topics. The `topic_slug` stored
in the alert is always the primary topic. Secondary topics are captured in
`metadata_json`.

Active topics at v1: `crypto`, `finance`, `economy`, `health`, `ai`,
`energy`, `technology`.

---

## Contract Files

| File | Purpose |
|------|---------|
| `workflows/contracts/intraday_source_item.json` | Raw item shape from any source |
| `workflows/contracts/intraday_normalized_item.json` | After normalization |
| `workflows/contracts/intraday_classified_alert.json` | After AI classification |
| `workflows/contracts/intraday_delivery_payload.json` | Approved alert ready for delivery |
| `schemas/ai/alert_classification.json` | Validated AI output schema |

---

## Workflow Files

All n8n workflow JSON files live in `workflows/n8n/intraday/`.
Import them into your n8n instance in numeric order.
Set the required credentials and environment variables before activating the orchestrator.

### Required n8n credentials

| Credential name | Used by |
|----------------|--------|
| `CloudflareD1Api` | Modules 03, 07, 08, 09, 12 |
| `OpenAiApi` | Module 05 |
| `TelegramBotApi` | Modules 08, shared failure notifier |

### Required n8n environment variables

| Variable | Description |
|---------|-------------|
| `CF_ACCOUNT_ID` | Cloudflare account ID |
| `CF_D1_DATABASE_ID` | D1 database ID |
| `ALERT_IMPORTANCE_THRESHOLD` | Minimum importance score to send an alert (default: 60) |
| `ALERT_SEVERITY_THRESHOLD` | Minimum severity score to send an alert (default: 50) |
| `TELEGRAM_CHAT_ID` | Target Telegram chat/channel ID |
| `DISCORD_WEBHOOK_URL` | Discord incoming webhook URL (module 09 sends via HTTP Request; no named credential needed) |
| `FAILURE_ALERT_CHANNEL` | Telegram chat ID for failure notifications |
| `INTRADAY_TELEGRAM_WORKFLOW_ID` | n8n ID of module 08 (used by orchestrator and retry) |
| `INTRADAY_DISCORD_WORKFLOW_ID` | n8n ID of module 09 (used by orchestrator and retry) |
