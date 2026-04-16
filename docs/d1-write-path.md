# D1 Write Path — Architecture and Usage

This document describes the safe, centralized write path that all workflows
use to persist data into Cloudflare D1.

---

## Overview

All workflow-driven writes to D1 go through authenticated internal API
endpoints hosted as Cloudflare Pages Functions. This ensures:

- **One write path** — no duplicated SQL across workflows or scripts.
- **Consistent validation** — every payload is validated before touching D1.
- **Centralized logic** — write SQL lives in `functions/lib/writers.js`.
- **Authentication** — writes require an `X-Write-Key` header.
- **Local compatibility** — works with `wrangler pages dev` for development.

```
n8n workflow
    │
    ▼
POST /api/internal/{resource}
    │  X-Write-Key: <secret>
    │  Content-Type: application/json
    │
    ├─ authenticate (lib/auth.js)
    ├─ validate payload (lib/validate.js)
    ├─ execute write (lib/writers.js)
    │
    ▼
Cloudflare D1
```

---

## Endpoints

### POST /api/internal/alerts

Creates an alert record along with its event cluster and daily_status updates.
Performs three coordinated writes per call:

1. **Upsert event_clusters** — creates or increments the cluster.
2. **Insert alerts** — adds the alert row.
3. **Upsert daily_status** — increments alert_count and recalculates cluster_count.

All three statements are executed in a single `db.batch()` call for
transactional guarantees — if any statement fails, all writes are rolled back.
The alert insert uses a subquery to resolve the cluster_id from the
event_clusters row upserted in statement 1.

**Request:**
```json
{
  "topic_slug": "crypto",
  "date_key": "2025-01-15",
  "headline": "Bitcoin Hits New ATH",
  "summary_text": "Bitcoin surged past $120K.",
  "source_name": "CoinDesk RSS",
  "source_url": "https://example.com/btc-ath",
  "severity_score": 72,
  "importance_score": 88,
  "confidence_score": 95,
  "event_at": "2025-01-15T14:32:00Z",
  "cluster_label": "Bitcoin price rally",
  "alert_reason": "New all-time high.",
  "secondary_topics": ["finance"],
  "item_id": "abc123"
}
```

**Response (201):**
```json
{
  "alert_id": 42,
  "cluster_id": 7,
  "topic_slug": "crypto",
  "date_key": "2025-01-15"
}
```

Schema: `schemas/workflow/write_alert.json`

---

### POST /api/internal/daily-status

Upserts page readiness and content availability for a topic/day.

**Request:**
```json
{
  "topic_slug": "crypto",
  "date_key": "2025-01-15",
  "page_state": "published",
  "alert_count": 5,
  "cluster_count": 2,
  "summary_available": 1,
  "video_available": 0,
  "article_available": 1
}
```

**Response (200):**
```json
{
  "topic_slug": "crypto",
  "date_key": "2025-01-15",
  "page_state": "published",
  "success": true
}
```

Schema: `schemas/workflow/write_daily_status.json`

---

### POST /api/internal/publish-jobs

Creates a new publish job or updates an existing one.

**Create request:**
```json
{
  "topic_slug": "crypto",
  "date_key": "2025-01-15",
  "status": "pending",
  "triggered_by": "schedule",
  "workflow_run_id": "exec-12345"
}
```

**Create response (201):**
```json
{
  "id": 1,
  "topic_slug": "crypto",
  "date_key": "2025-01-15",
  "status": "pending"
}
```

**Update request** (include `id`):
```json
{
  "id": 1,
  "status": "success",
  "topic_slug": "crypto",
  "date_key": "2025-01-15"
}
```

**Update response (200):**
```json
{
  "id": 1,
  "topic_slug": "crypto",
  "date_key": "2025-01-15",
  "status": "success",
  "success": true
}
```

Schema: `schemas/workflow/write_publish_job.json`

---

### POST /api/internal/openai-usage-log

Creates one `openai_usage_log` row for each OpenAI task attempt.

Use this endpoint from n8n immediately after each OpenAI node (success and failure paths)
to capture:
- task + model
- success/failure status
- retry count
- token usage
- optional cost and latency estimates

**Request:**
```json
{
  "task": "dailySummary",
  "model": "gpt-4o",
  "workflow_name": "Daily — 02 Generate Summary",
  "execution_id": "199248",
  "topic_slug": "finance",
  "date_key": "2026-04-16",
  "prompt_tokens": 1420,
  "completion_tokens": 680,
  "total_tokens": 2100,
  "status": "ok",
  "retry_count": 0,
  "request_latency_ms": 3420,
  "estimated_cost_usd": 0.0184
}
```

**Response (201):**
```json
{
  "id": 101,
  "task": "dailySummary",
  "model": "gpt-4o",
  "status": "ok"
}
```

Schema: `schemas/workflow/write_openai_usage_log.json`

---

## Authentication

All internal write endpoints require the `X-Write-Key` header:

```
X-Write-Key: <your-write-api-key>
```

The value must match the `WRITE_API_KEY` secret configured in the Pages
Functions environment. If the header is missing or incorrect, the endpoint
returns 401 or 403 respectively.

### Setting the secret

**Local development** — create a `.dev.vars` file in the project root:

```
WRITE_API_KEY=your-local-dev-key
```

**Production** — set the secret in Cloudflare Pages:

```bash
wrangler pages secret put WRITE_API_KEY
```

**n8n** — configure the API key as an n8n credential or variable,
then include it as an HTTP header in workflow HTTP Request nodes.

---

## Payload Validation

Every write request is validated before any D1 write occurs.
Validation rules are defined in `functions/lib/validate.js` and match
the JSON schemas in `schemas/workflow/`.

Key validation rules:

| Field | Rule |
|---|---|
| `topic_slug` | Must be one of: crypto, finance, economy, health, ai, energy, technology |
| `date_key` | Must match YYYY-MM-DD format |
| `headline` | Non-empty, max 250 characters |
| `summary_text` | Non-empty, max 500 characters |
| `severity_score` | Integer, 0–100 |
| `importance_score` | Integer, 0–100 |
| `confidence_score` | Integer, 0–100 |
| `event_at` | Valid ISO-8601 date-time string |
| `cluster_label` | String (max 100 chars) or null — falls back to `topic_slug` |
| `page_state` | One of: pending, ready, published, error |
| `status` (publish_jobs) | One of: pending, running, success, failed, retrying |

Invalid payloads return HTTP 400 with a descriptive error message.

---

## Records That Use This Path

| Record | Endpoint | Written by |
|---|---|---|
| `event_clusters` | `POST /api/internal/alerts` | Intraday alert flow |
| `alerts` | `POST /api/internal/alerts` | Intraday alert flow |
| `daily_status` | `POST /api/internal/alerts` (incremental) | Intraday alert flow |
| `daily_status` | `POST /api/internal/daily-status` (full upsert) | Daily editorial flow |
| `publish_jobs` | `POST /api/internal/publish-jobs` | Daily editorial flow |
| `workflow_logs` | `POST /api/internal/workflow-logs` | Intraday + daily + shared workflows |
| `openai_usage_log` | `POST /api/internal/openai-usage-log` | Intraday + daily OpenAI task nodes |

---

## File Map

| File | Purpose |
|---|---|
| `functions/lib/auth.js` | API key authentication |
| `functions/lib/validate.js` | Payload validators |
| `functions/lib/writers.js` | Centralized D1 write SQL |
| `functions/api/internal/alerts.js` | Alert write endpoint |
| `functions/api/internal/daily-status.js` | Daily status write endpoint |
| `functions/api/internal/publish-jobs.js` | Publish job write endpoint |
| `functions/api/internal/workflow-logs.js` | Workflow execution log endpoint |
| `functions/api/internal/openai-usage-log.js` | OpenAI usage telemetry endpoint |
| `schemas/workflow/write_alert.json` | Alert payload schema |
| `schemas/workflow/write_daily_status.json` | Daily status payload schema |
| `schemas/workflow/write_publish_job.json` | Publish job payload schema |
| `schemas/workflow/write_workflow_log.json` | Workflow log payload schema |
| `schemas/workflow/write_openai_usage_log.json` | OpenAI usage payload schema |

---

## Using from n8n Workflows

Instead of embedding raw SQL in n8n HTTP Request nodes, workflows can call
the internal write endpoints:

```
HTTP Request node:
  Method: POST
  URL: {{ $vars.SITE_URL }}/api/internal/alerts
  Headers:
    X-Write-Key: {{ $vars.WRITE_API_KEY }}
    Content-Type: application/json
  Body: (the alert payload as JSON)
```

This approach:
- Eliminates SQL strings from workflow JSON files.
- Ensures validation is applied consistently.
- Makes it possible to add rate limiting, logging, or audit trails later.
- Works identically in local development and production.

---

## Local Development

1. Start wrangler Pages dev:
   ```bash
   cd app && npm run build && cd ..
   wrangler pages dev app/dist --d1=DB
   ```

2. Create `.dev.vars` with your write key:
   ```
   WRITE_API_KEY=dev-key-for-testing
   ```

3. Test the write endpoint:
   ```bash
   curl -X POST http://localhost:8788/api/internal/alerts \
     -H "Content-Type: application/json" \
     -H "X-Write-Key: dev-key-for-testing" \
     -d '{
       "topic_slug": "crypto",
       "date_key": "2025-01-15",
       "headline": "Test alert",
       "summary_text": "Testing the write path locally.",
       "source_name": "Manual Test",
       "severity_score": 50,
       "importance_score": 50,
       "confidence_score": 50,
       "event_at": "2025-01-15T12:00:00Z"
     }'
   ```

---

## Relationship to Existing Smoke Test

The existing `workflows/n8n/intraday/00_local_alert_smoke_test.json` writes
directly to D1 via the Cloudflare REST API. This is intentionally preserved
for backward compatibility and standalone smoke testing.

The internal write endpoints provide the **recommended** path for production
workflow writes. Both approaches use the same SQL logic and produce identical
D1 state.
