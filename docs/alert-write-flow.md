# Alert Write Flow — n8n to Cloudflare D1

> **See also:** [D1 Write Path](d1-write-path.md) for the recommended
> centralized write approach using internal API endpoints. The flow described
> below documents the direct Cloudflare REST API write path used by the
> smoke test and n8n module 07.

This document describes the alert payload contract, the write-flow path from
n8n to Cloudflare D1, how to run the local smoke test, and how to verify the
result on the website timeline.

---

## Overview

The intraday alert pipeline writes three D1 rows per alert event:

```
n8n smoke test / module 07
        │
        ├─ UPSERT  event_clusters  (cluster_label + topic + date)
        ├─ INSERT  alerts          (headline, scores, timestamps, …)
        └─ UPSERT  daily_status    (alert_count, cluster_count, page_state)
```

After the three writes succeed, the alert is immediately queryable through
the timeline API at `/api/timeline/:topicSlug/:dateKey` and visible on the
topic/day page at `/:topicSlug/:dateKey`.

---

## Alert Payload Contract

The canonical alert contract is defined in
`workflows/contracts/intraday_classified_alert.json`.
The table below summarises every field and its D1 mapping.

| Field | Type | Required | D1 Column | Notes |
|---|---|---|---|---|
| `item_id` | string | ✅ | `metadata_json.item_id` | Deterministic hash from source; used for dedup in module 03 |
| `topic_slug` | string (enum) | ✅ | `alerts.topic_slug` | One of: `crypto finance economy health ai energy technology` |
| `secondary_topics` | string[] | — | `metadata_json.secondary_topics` | Up to 2 additional topics |
| `headline` | string ≤ 250 chars | ✅ | `alerts.headline` | May be lightly edited by AI |
| `summary_text` | string ≤ 500 chars | ✅ | `alerts.summary_text` | One–two sentence timeline summary |
| `source_url` | string (URI) \| null | — | `alerts.source_url` | Canonical item URL |
| `source_name` | string | ✅ | `alerts.source_name` | Human-readable source label |
| `severity_score` | integer 0–100 | ✅ | `alerts.severity_score` | Urgency / disruption score |
| `importance_score` | integer 0–100 | ✅ | `alerts.importance_score` | Audience relevance score |
| `confidence_score` | integer 0–100 | ✅ | `alerts.confidence_score` | AI classification confidence |
| `send_alert` | boolean | ✅ | — | AI recommendation; overridden by thresholds in module 06 |
| `alert_reason` | string \| null | — | `metadata_json.alert_reason` | Short AI explanation |
| `event_at` | ISO-8601 UTC string | ✅ | `alerts.event_at` | Best-available event timestamp |
| `cluster_label` | string ≤ 100 chars \| null | ✅ | `event_clusters.cluster_label` | Short label for the event cluster; if null in the contract, module 07 falls back to `topic_slug` before writing because `event_clusters.cluster_label` is NOT NULL |
| `date_key` | YYYY-MM-DD string | derived | `alerts.date_key` | Derived from `event_at`; not in base contract but added by the pipeline |

The `status` column in `alerts` is always set to `'active'` on insert.
The `delivered_telegram` and `delivered_discord` columns are always `0` on
insert and updated after delivery by modules 08 and 09.

---

## Write-Flow Steps (Module 07 / Smoke Test)

### Step 1 — Upsert Event Cluster

```sql
INSERT INTO event_clusters
  (topic_slug, date_key, cluster_label, alert_count, importance_score)
VALUES (?, ?, ?, 1, ?)
ON CONFLICT(topic_slug, date_key, cluster_label)
DO UPDATE SET
  alert_count      = alert_count + 1,
  importance_score = MAX(importance_score, excluded.importance_score),
  updated_at       = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
RETURNING id
```

The returned `id` becomes the `cluster_id` on the alert row.

> **Prerequisite:** This ON CONFLICT clause requires the unique constraint
> added by migration `0002_event_clusters_unique.sql`.

### Step 2 — Insert Alert Row

```sql
INSERT INTO alerts (
  topic_slug, date_key, cluster_id,
  headline, summary_text, source_url, source_name,
  severity_score, importance_score, confidence_score,
  status, delivered_telegram, delivered_discord,
  event_at, metadata_json
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, 0, ?,
  json_object(
    'item_id',          ?,
    'secondary_topics', json(?),
    'alert_reason',     ?
  )
)
RETURNING id
```

### Step 3 — Upsert Daily Status

```sql
INSERT INTO daily_status
  (topic_slug, date_key, page_state, alert_count, cluster_count)
VALUES (?, ?, 'ready', 1, 1)
ON CONFLICT (topic_slug, date_key)
DO UPDATE SET
  alert_count   = alert_count + 1,
  cluster_count = (
    SELECT COUNT(DISTINCT id) FROM event_clusters
    WHERE topic_slug = excluded.topic_slug AND date_key = excluded.date_key
  ),
  updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
```

---

## Running the Smoke Test Locally

### Prerequisites

| Requirement | Notes |
|---|---|
| Docker Desktop (or Docker + Compose v2) | To run local n8n |
| Cloudflare account with D1 enabled | Free tier is sufficient |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |
| `CLOUDFLARE_API_TOKEN` | Token with **D1:Edit** permission on the target database |
| `CLOUDFLARE_D1_DATABASE_ID` | Run `wrangler d1 create modern-content-platform-db` and copy the ID |

### Step 1 — Start local n8n

```bash
# From the repository root
cp .env.example .env
# Fill in CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, CLOUDFLARE_D1_DATABASE_ID

docker compose -f n8n/docker-compose.yml --env-file .env up -d
```

n8n opens at **http://localhost:5678**.

### Step 2 — Configure the CloudflareD1Api credential

1. In n8n, go to **Settings → Credentials → Add credential**.
2. Choose **HTTP Header Auth**.
3. Name it exactly `CloudflareD1Api`.
4. Set:
   - **Header name**: `Authorization`
   - **Header value**: `Bearer <your-cloudflare-api-token>`
5. Save.

### Step 3 — Set required n8n variables

Go to **Settings → Variables** and add:

| Variable | Value |
|---|---|
| `CF_ACCOUNT_ID` | Your Cloudflare account ID |
| `CF_D1_DATABASE_ID` | Your D1 database ID |
| `LOCAL_SITE_URL` | `http://localhost:8788` (or your deployed Pages URL) |

`LOCAL_SITE_URL` is only used to build the verification URLs shown in the
final Log Result node — the smoke test does not make an HTTP call to the site.

### Step 4 — Apply migrations

The smoke test relies on the unique constraint added in migration
`0002_event_clusters_unique.sql`. Apply all migrations before running:

```bash
# Remote D1 (required for n8n REST API writes)
wrangler d1 migrations apply modern-content-platform-db
```

### Step 5 — Import the workflow

1. In n8n, go to **Workflows → Add workflow → Import from file**.
2. Select `workflows/n8n/intraday/00_local_alert_smoke_test.json`.
3. Click **Execute workflow** (the play button in the top-right).

### Step 6 — Check the result

The final **Log Result** node outputs a JSON summary:

```json
{
  "status": "SUCCESS",
  "message": "✅ Alert written to D1 and confirmed via read-back.",
  "alert_id": 42,
  "cluster_id": 7,
  "topic_slug": "crypto",
  "date_key": "2026-04-07",
  "headline": "[Smoke Test] Alert write-flow verification — 2026-04-07T...",
  "daily_status_ok": true,
  "d1_read_back_ok": true,
  "site_timeline_page": "http://localhost:8788/crypto/2026-04-07",
  "api_timeline_url": "http://localhost:8788/api/timeline/crypto/2026-04-07"
}
```

A `status` of `"SUCCESS"` means:
- The `event_clusters` row was upserted.
- The `alerts` row was inserted and D1 returned a valid row ID.
- The `daily_status` row was upserted.
- A read-back SELECT confirmed the alert row exists in D1.

---

## Verifying the Alert on the Site

The smoke test writes to the **remote Cloudflare D1** database. To see the
alert on the local site, start wrangler Pages dev **without** the `--local`
flag so it reads from the same remote D1:

```bash
# Build the Vue app first (one-time)
cd app && npm run build && cd ..

# Start wrangler against remote D1
wrangler pages dev app/dist --d1=DB
```

Then open the URL shown in `site_timeline_page` in your browser.

> **Tip:** The alert headline begins with `[Smoke Test]` so it is easy to
> identify in the timeline. Use the browser DevTools Network tab to inspect
> the `/api/timeline/crypto/<date_key>` response directly.

### Verifying via the timeline API

```bash
curl "http://localhost:8788/api/timeline/crypto/$(date +%Y-%m-%d)"
```

The response should include an `alerts` array containing the smoke test
headline.

---

## Customising the Smoke Test

To test a different topic, open the **Build Mock Alert** node and change
`topic_slug` to any supported value (`finance`, `ai`, `economy`, etc.).

The `crypto` topic is used as the default because it has the most sample data
and is the first topic in the `topics` seed. The target topic must exist as
an active row in the `topics` table for the timeline API to return results.

---

## Relationship to Module 07 (Production Write Path)

The smoke test intentionally mirrors the SQL and HTTP Request nodes in
`07_d1_persistence.json`. This makes it easy to confirm that any change to
the production persistence module still works by re-running the smoke test.

| Smoke test node | Module 07 equivalent |
|---|---|
| Upsert Event Cluster | Upsert Event Cluster |
| Extract Cluster ID | Extract Cluster ID |
| Insert Alert Row | Insert Alert Row |
| Extract Alert ID | Extract Alert ID |
| Upsert Daily Status | Upsert Daily Status |

The smoke test omits the sub-workflow trigger and the `Expand Alerts` fan-out
step because it always processes exactly one alert. It adds `Validate Payload`,
`Collect Write Results`, `Read Back Alert from D1`, and `Log Result` nodes
that are not present in module 07, to make the verification loop self-contained.

---

## Known Considerations

### Local SQLite D1 vs. Remote D1

Wrangler's `--local` flag creates a local SQLite file that is **not**
accessible via the Cloudflare REST API. Running `wrangler pages dev --local`
and the n8n smoke test will therefore use two different databases.

For end-to-end local testing, use `wrangler pages dev app/dist --d1=DB`
**without** `--local` (connects to remote Cloudflare D1) while n8n also
writes to the same remote D1. This is the recommended setup for verifying
the full write path.

### `crypto` topic must be seeded

The timeline API returns a 404 if the requested `topic_slug` does not exist
as an active row in the `topics` table. Seed the topics table before running
the smoke test:

```bash
wrangler d1 execute modern-content-platform-db --file=db/seeds/topics.sql
```

### Smoke test rows in production

The smoke test uses a `[Smoke Test]` headline prefix and sets `source_name`
to `'Smoke Test'`. Do not run the smoke test against a production D1 unless
you plan to clean up the inserted rows afterwards:

```bash
wrangler d1 execute modern-content-platform-db \
  --command "DELETE FROM alerts WHERE source_name = 'Smoke Test';"
```

### event_clusters unique constraint

The Upsert Event Cluster step uses `ON CONFLICT(topic_slug, date_key, cluster_label)`.
This requires migration `0002_event_clusters_unique.sql`. If the migration has
not been applied, the upsert will fail with a syntax error. Run
`wrangler d1 migrations apply modern-content-platform-db` to apply all
pending migrations.
