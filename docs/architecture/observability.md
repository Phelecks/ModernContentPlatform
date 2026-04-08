# Observability — Architecture

## Overview

The platform uses a practical v1 observability layer that captures workflow
execution events, failure details, and retry visibility in Cloudflare D1.
All workflow-driven observability flows through a single internal write
endpoint, keeping the system simple and auditable.

---

## Design Principles

- **Persistent failure records** — every workflow failure is written to D1 so
  it survives beyond n8n's execution history retention window.
- **Structured logs** — events carry typed fields (workflow name, execution ID,
  module, error message) rather than free-form text blobs.
- **Non-blocking** — observability writes use `continueOnFail: true` so that a
  logging failure never blocks the primary workflow path.
- **Single write path** — all logs go through `POST /api/internal/workflow-logs`
  using the same X-Write-Key authentication as other internal endpoints.
- **Separation of concerns** — failure handling lives in the shared failure
  notifier, not duplicated across every module.

---

## What Gets Logged

| Event | event_type | Where written |
|---|---|---|
| Any workflow failure | `error` | Failure Notifier → `workflow_logs` |
| Daily pipeline success | `completed` | `10 Update D1 State` → `workflow_logs` |
| Stale running publish_job | `failed` (publish_jobs) | Failure Notifier → `publish_jobs` |
| Manual retry trigger | `retry` | n8n manual via `workflow-logs` endpoint |

---

## D1 Tables Used

### `workflow_logs`

One row per observable event from any workflow execution.

```
id             — auto-increment primary key
workflow_name  — e.g. 'Daily — Orchestrator'
execution_id   — n8n execution ID for cross-referencing
topic_slug     — nullable; set for topic-scoped events
date_key       — nullable; set for date-scoped events
event_type     — info | warning | error | retry | completed
module_name    — which n8n node/sub-workflow triggered the event
error_message  — short error description
error_details  — full stack trace or extended diagnostics
metadata_json  — arbitrary structured context (JSON string)
created_at     — ISO-8601 timestamp
```

### `publish_jobs`

Already used for daily editorial lifecycle tracking. The failure notifier
updates any stuck `running` jobs to `failed` when a daily workflow fails,
ensuring this table always reflects the true final state.

```
status         — pending | running | success | failed | retrying
error_message  — error text written by the failure notifier
completed_at   — set on both success and failure
```

---

## Failure Notifier Flow

The shared failure notifier (`workflows/n8n/shared/failure_notifier.json`)
is called whenever any orchestrator workflow fails via n8n's `errorWorkflow`
setting. It performs four steps in parallel after formatting the error:

```
Error Trigger
    │
    ▼
Format Failure Message
    │
    ├──→ Send Failure Alert (Telegram)
    │
    └──→ Write Failure Log to D1  (/api/internal/workflow-logs)
              │
              ▼
         Is Daily Workflow?
              │
         (yes) ▼
         Find Running Jobs  (query publish_jobs WHERE status='running')
              │
              ▼
         Extract Running Jobs
              │
              ▼
         Mark Jobs Failed  (UPDATE publish_jobs SET status='failed')
```

Key properties:
- The D1 write and the publish_job update both use `continueOnFail: true`
  so a Telegram API failure never causes the log to be missed, and vice versa.
- The publish_job cleanup queries for `status = 'running'` and only updates
  jobs that are still running, preventing double-updates on reruns.
- Non-daily workflows (e.g. intraday) skip the publish_job cleanup branch.

---

## Completion Logging

When a daily pipeline completes successfully, `10 Update D1 State` writes a
`completed` event to `workflow_logs` after confirming both D1 writes. This
provides a positive signal that distinguishes a successful run from a run
that simply had no failure — useful when n8n execution history is unavailable
(e.g. after rotation or in a staging environment).

---

## Internal Endpoint

```
POST /api/internal/workflow-logs
```

Authentication: `X-Write-Key` header (same `WRITE_API_KEY` environment variable
used by other internal endpoints).

Required payload fields:

| Field | Type | Notes |
|---|---|---|
| `workflow_name` | string | Required. Human-readable workflow name. |
| `event_type` | string | `info \| warning \| error \| retry \| completed` |
| `execution_id` | string\|null | n8n execution ID |
| `topic_slug` | string\|null | Topic if event is topic-scoped |
| `date_key` | string\|null | YYYY-MM-DD if event is date-scoped |
| `module_name` | string\|null | Node or sub-workflow name |
| `error_message` | string\|null | Short error description |
| `error_details` | string\|null | Full stack trace or diagnostics |
| `metadata_json` | string\|null | Serialised JSON with extra context |

Response on success: `HTTP 201` with `{ id, workflow_name, event_type }`.

See `schemas/workflow/write_workflow_log.json` for the full JSON Schema.

---

## n8n Variables Required

Add the following n8n workflow variables to support the observability layer:

| Variable | Description |
|---|---|
| `PAGES_BASE_URL` | Base URL of the Cloudflare Pages deployment (e.g. `https://your-site.pages.dev`) |
| `WRITE_API_KEY` | Value of the `WRITE_API_KEY` Cloudflare Pages secret |
| `FAILURE_ALERT_CHANNEL` | Telegram chat ID for failure alerts |
| `FAILURE_NOTIFIER_WORKFLOW_ID` | n8n workflow ID of `Shared — Failure Notifier` |

---

## Querying Workflow Logs

### Recent failures (last 24 hours)

```sql
SELECT workflow_name, module_name, error_message, created_at
FROM workflow_logs
WHERE event_type = 'error'
ORDER BY created_at DESC
LIMIT 50;
```

### Failures for a specific topic/day

```sql
SELECT workflow_name, event_type, module_name, error_message, created_at
FROM workflow_logs
WHERE topic_slug = 'crypto'
  AND date_key = '2025-01-15'
ORDER BY created_at DESC;
```

### Publish jobs with failures

```sql
SELECT pj.topic_slug, pj.date_key, pj.attempt, pj.error_message,
       pj.started_at, pj.completed_at
FROM publish_jobs pj
WHERE pj.status = 'failed'
ORDER BY pj.created_at DESC
LIMIT 20;
```

### Correlate a workflow_log with its publish_job

```sql
SELECT wl.workflow_name, wl.error_message, wl.created_at,
       pj.attempt, pj.status, pj.error_message AS job_error
FROM workflow_logs wl
JOIN publish_jobs pj
  ON pj.topic_slug = wl.topic_slug
 AND pj.date_key = wl.date_key
WHERE wl.event_type = 'error'
  AND wl.topic_slug IS NOT NULL
ORDER BY wl.created_at DESC;
```

---

## Local Development

When running locally with `wrangler pages dev`, the `WRITE_API_KEY` environment
variable must be set and the D1 binding must be configured (see `wrangler.toml`).
The migration `0003_workflow_logs.sql` must be applied before the endpoint is
usable:

```bash
npx wrangler d1 execute modern-content-platform-db \
  --local --file db/migrations/0003_workflow_logs.sql
```

To verify the endpoint works locally:

```bash
curl -X POST http://localhost:8788/api/internal/workflow-logs \
  -H "Content-Type: application/json" \
  -H "X-Write-Key: <your-write-key>" \
  -d '{
    "workflow_name": "Test",
    "event_type": "info",
    "module_name": "local-test"
  }'
```

---

## Future Improvements (v2+)

- **Read API** — expose `GET /api/internal/workflow-logs` for a simple admin UI
  or monitoring dashboard.
- **Alerting thresholds** — trigger an alert after N consecutive failures for
  the same topic/day.
- **Intraday retry logging** — add explicit `retry` log entries in the intraday
  D1 persistence module when alert writes fail.
- **Structured error codes** — add an `error_code` column to `workflow_logs`
  for machine-readable failure classification.
