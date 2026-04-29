# Rerun and Recovery Operations Guide

This document describes how operators can safely rerun failed workflows and recover from publishing failures.

## Overview

The platform provides dedicated rerun workflows for each failure type. All reruns are:
- **Tracked** in the `rerun_log` D1 table for visibility and audit
- **Idempotent** where possible — reruns check current state before acting
- **Operator-triggered** via n8n webhook endpoints
- **Logged** with the shared failure notifier if the rerun itself fails

## Supported Recovery Actions

| Failure Type | Rerun Workflow | Trigger |
|---|---|---|
| Failed daily publish | `rerun_daily_publish` | Webhook: `POST /webhook/rerun-daily-publish` |
| Failed social publish | `rerun_social_publish` | Webhook: `POST /webhook/rerun-social-publish` |
| Failed YouTube upload | `rerun_youtube_upload` | Webhook: `POST /webhook/rerun-youtube-upload` |
| Failed alert delivery | `rerun_failed_alerts` | Webhook: `POST /webhook/rerun-failed-alerts` |
| Undelivered alerts (auto) | `12_delivery_retry` | Scheduled every 30 minutes |

## How to Trigger a Rerun

### 1. Failed Daily Publish

When a daily editorial publish fails (visible in operator dashboard as a failed `publish_jobs` entry):

```bash
curl -X POST https://your-n8n.example.com/webhook/rerun-daily-publish \
  -H "Content-Type: application/json" \
  -d '{"topic_slug": "crypto", "date_key": "2025-01-15"}'
```

**What happens:**
1. Creates a `rerun_log` entry with status `running`
2. Checks for a failed `publish_jobs` record for the topic/date
3. If found, creates a new publish job with `triggered_by: 'retry'` and incremented attempt number
4. Executes the daily orchestrator workflow
5. Updates `rerun_log` with final status (`success` or `failed`)

**Idempotency:** The daily orchestrator already checks for existing successful jobs and skips topics that have already been published. If a rerun is triggered for a topic/date that has already succeeded, the orchestrator skips it.

### 2. Failed Social Publish

When social media publishing fails (X, Telegram, or Discord daily posts):

```bash
curl -X POST https://your-n8n.example.com/webhook/rerun-social-publish \
  -H "Content-Type: application/json" \
  -d '{"topic_slug": "finance", "date_key": "2025-01-15"}'
```

Optionally filter by platform:
```bash
curl -X POST https://your-n8n.example.com/webhook/rerun-social-publish \
  -H "Content-Type: application/json" \
  -d '{"topic_slug": "finance", "date_key": "2025-01-15", "platform": "telegram"}'
```

**Idempotency:** Each social publish attempt creates a new `social_publish_log` row. The platform APIs check for existing successful posts before sending duplicates.

### 3. Failed YouTube Upload

When a YouTube video upload fails:

```bash
curl -X POST https://your-n8n.example.com/webhook/rerun-youtube-upload \
  -H "Content-Type: application/json" \
  -d '{"topic_slug": "ai", "date_key": "2025-01-15"}'
```

**Idempotency:** The YouTube upload workflow checks `youtube_publish_log` for existing successful uploads. If a video was already published for the topic/date, the rerun is skipped.

### 4. Failed Alert Delivery

When intraday alerts are persisted in D1 but fail to deliver to Telegram/Discord:

```bash
curl -X POST https://your-n8n.example.com/webhook/rerun-failed-alerts \
  -H "Content-Type: application/json" \
  -d '{"topic_slug": "crypto", "date_key": "2025-01-15"}'
```

Optionally target specific alerts:
```bash
curl -X POST https://your-n8n.example.com/webhook/rerun-failed-alerts \
  -H "Content-Type: application/json" \
  -d '{"topic_slug": "crypto", "date_key": "2025-01-15", "alert_ids": [42, 43, 44]}'
```

**Idempotency:** The delivery retry queries only alerts where `delivered_telegram = 0` or `delivered_discord = 0`. Alerts that have already been delivered are not re-sent.

## Automatic Recovery

### Delivery Retry (Intraday)

The `12_delivery_retry` workflow runs every 30 minutes and automatically retries delivery for alerts that:
- Are in `active` status
- Have `delivered_telegram = 0` or `delivered_discord = 0`
- Were created within the last 24 hours
- Have not exceeded 5 failed attempts on the same platform

No operator action is required for this recovery path.

## Operational Safeguards

### Pre-rerun Checks

All rerun workflows perform these checks before executing:

1. **Failed record exists** — The workflow queries D1 to verify a failed record exists for the specified topic/date. If none is found, the rerun is skipped and logged as such.

2. **Attempt counting** — Each rerun increments the attempt counter. The original failure's attempt number is read and the retry uses `attempt + 1`.

3. **Rerun logging** — Every rerun attempt is recorded in the `rerun_log` table with status tracking from `pending` → `running` → `success`/`failed`/`skipped`.

### Safe Rerun Rules

| Rule | Description |
|---|---|
| No duplicate publishes | Daily orchestrator skips topics that already have a successful publish job |
| No duplicate deliveries | Alert delivery checks `delivered_*` flags before sending |
| No duplicate uploads | YouTube upload checks for existing successful uploads |
| Attempt cap | Delivery retry stops after 5 failed attempts per alert/platform |
| Stale job detection | The daily orchestrator allows reruns for jobs older than 2 hours even if still marked as `running` |
| Failure notification | All rerun workflows use the shared failure notifier for error alerting |

### Monitoring Reruns

Rerun history is visible in the operator dashboard via the `recent_reruns` field in the `GET /api/internal/operator-dashboard` response.

You can also query the `rerun_log` table directly:

```sql
-- Recent reruns
SELECT * FROM rerun_log ORDER BY created_at DESC LIMIT 20;

-- Failed reruns for a specific type
SELECT * FROM rerun_log
WHERE rerun_type = 'daily_publish' AND status = 'failed'
ORDER BY created_at DESC;

-- Rerun history for a specific topic/date
SELECT * FROM rerun_log
WHERE topic_slug = 'crypto' AND date_key = '2025-01-15'
ORDER BY created_at DESC;
```

## Rerun Log API

### Create a rerun log entry

```
POST /api/internal/rerun-log
X-Write-Key: <WRITE_API_KEY>
Content-Type: application/json

{
  "rerun_type": "daily_publish",
  "topic_slug": "crypto",
  "date_key": "2025-01-15",
  "source_table": "publish_jobs",
  "source_id": 42,
  "status": "running",
  "triggered_by": "operator",
  "workflow_run_id": "exec-abc-123"
}
```

### Update a rerun log entry

```
POST /api/internal/rerun-log
X-Write-Key: <WRITE_API_KEY>
Content-Type: application/json

{
  "id": 1,
  "status": "success"
}
```

## Troubleshooting

### Rerun completes but publish still shows failed

Check the `publish_jobs` table for the latest job status. A rerun creates a new publish job — the original failed job is not modified. Look for the most recent job:

```sql
SELECT * FROM publish_jobs
WHERE topic_slug = 'crypto' AND date_key = '2025-01-15'
ORDER BY created_at DESC LIMIT 3;
```

### Alerts still undelivered after rerun

1. Check if the Telegram/Discord bot credentials are valid
2. Check the `social_publish_log` for error messages
3. Check if the alert has exceeded the 5-attempt retry cap
4. Check the `workflow_logs` for errors from the delivery modules

### YouTube upload keeps failing

1. Check YouTube API quota status
2. Check that the video file exists at the expected storage path
3. Check `youtube_publish_log` for specific error messages
4. Verify YouTube API credentials in n8n

## Architecture

```
Operator triggers rerun via webhook
  → n8n rerun workflow starts
    → Logs rerun_log entry (status: running)
    → Queries D1 for failed records
    → Validates a retry is safe
    → Executes the underlying module workflow
    → Updates rerun_log (status: success/failed/skipped)
    → On error: shared failure_notifier sends alert
```

All rerun workflows follow this pattern for consistency and traceability.
