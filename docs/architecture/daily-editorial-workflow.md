# Daily Editorial Workflow — Architecture

## Overview

The daily editorial workflow runs on a schedule (23:30 UTC) and generates one
complete editorial package per active topic per day. It aggregates all intraday
alerts, uses AI to generate structured content, validates every output, publishes
final content to GitHub, and updates operational state in D1.

The workflow is **modular**. The orchestrator loops over all active topics and
calls each module in sequence. Each module has a single responsibility and an
explicit input/output contract. No module publishes directly without passing
through the validation gate.

---

## Module Map

```
[Schedule Trigger — 23:30 UTC]
        │
        ▼
┌──────────────────────┐
│  Fetch Active Topics │  Query D1 topics table for all is_active=1 rows
└──────────┬───────────┘
           │  topic_slug[]
           ▼
┌──────────────────────┐
│  Process Topics      │  SplitInBatches(1) — one topic at a time
│  (loop)              │
└──────────┬───────────┘
           │  topic_slug
           ▼
┌──────────────────────┐
│  Build Topic Context │  Add date_key = today (UTC, YYYY-MM-DD)
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  Check Existing Job  │  Query publish_jobs for today — skip if status='success'
└──────────┬───────────┘
           │
      ┌────┴────┐
      │ success │  → Skip Topic (NoOp) → back to loop
      └────┬────┘
           │ not success
           ▼
┌──────────────────────┐
│  Create Publish Job  │  INSERT publish_jobs (status='running', attempt+1)
└──────────┬───────────┘
           │  publish_job_id
           ▼
┌──────────────────────┐
│  01 Aggregate Alerts │  Fetch all alerts + clusters for topic/date from D1
└──────────┬───────────┘
           │  daily_aggregate_context
           ▼
┌──────────────────────┐
│  02 Generate Summary │  AI → structured daily summary JSON
└──────────┬───────────┘
           │  + summary{}
           ▼
┌──────────────────────┐
│  03 Generate Article │  AI → full Markdown article
└──────────┬───────────┘
           │  + article_md
           ▼
┌──────────────────────┐
│  04 Expectation Check│  AI → structured expectation check JSON
└──────────┬───────────┘
           │  + expectation_check{}
           ▼
┌──────────────────────┐
│  05 Tomorrow Outlook │  AI → tomorrow watchpoints + scheduled events
└──────────┬───────────┘
           │  + tomorrow_outlook{}
           ▼
┌──────────────────────┐
│  06 Video Script     │  AI → spoken-word video script
└──────────┬───────────┘
           │  + video_script{}
           ▼
┌──────────────────────┐
│  07 YouTube Metadata │  AI → YouTube title, description, tags
└──────────┬───────────┘
           │  + youtube_metadata{}
           ▼
┌──────────────────────┐
│  08 Validate Outputs │  All fields checked; throws on any failure
└──────────┬───────────┘
           │  validated=true (daily_generation_output)
           ▼
┌──────────────────────┐
│  09 Publish to GitHub│  Write 4 files; GET+PUT per file for safe upsert
└──────────┬───────────┘
           │  + github_commit_sha
           ▼
┌──────────────────────┐
│  10 Update D1 State  │  UPDATE daily_status + publish_jobs in parallel
└──────────┬───────────┘
           │
           └──────────────────────────────────► back to Process Topics loop
```

---

## Module Responsibilities

| # | Module | Trigger | Key input | Key output |
|---|--------|---------|-----------|-----------|
| Orch | Orchestrator | Schedule (23:30 UTC) | — | topic/date dispatch |
| 01 | Aggregate Alerts | Execute Workflow | `{ topic_slug, date_key, publish_job_id }` | `daily_aggregate_context` |
| 02 | Generate Summary | Execute Workflow | aggregate context (with `source_name` per alert) | + `summary{}` (with `key_events[].sources`, `sources`, `source_confidence_note`) |
| 03 | Generate Article | Execute Workflow | context + summary | + `article_md` |
| 04 | Expectation Check | Execute Workflow | context + summary | + `expectation_check{}` |
| 05 | Tomorrow Outlook | Execute Workflow | context + summary | + `tomorrow_outlook{}` |
| 06 | Video Script | Execute Workflow | context + summary (source-aware) + tomorrow_outlook | + `video_script{}` (with `segments[].sources`) |
| 07 | YouTube Metadata | Execute Workflow | context + summary + video_script | + `youtube_metadata{}` |
| 08 | Validate Outputs | Execute Workflow | full generation payload | `daily_generation_output` (validated=true) |
| 09 | Publish to GitHub | Execute Workflow | validated generation output | + `github_commit_sha` |
| 10 | Update D1 State | Execute Workflow | publish result | final D1 state |

---

## GitHub Content Structure

Module 09 writes four files per topic/date to GitHub using the GitHub Contents API
(`PUT /repos/{owner}/{repo}/contents/{path}`). Each file is upserted safely:
the module first performs a `GET` to retrieve the existing file SHA (needed for
updates), then issues the `PUT`.

| File | Path | Content |
|------|------|---------|
| Structured summary | `content/topics/{topic_slug}/{date_key}/summary.json` | Daily summary + expectation check + tomorrow outlook |
| Full article | `content/topics/{topic_slug}/{date_key}/article.md` | Markdown article |
| Page metadata | `content/topics/{topic_slug}/{date_key}/metadata.json` | Alert count, sentiment, topic score, publish timestamp |
| Video data | `content/topics/{topic_slug}/{date_key}/video.json` | Video script + YouTube metadata + placeholder for `youtube_video_id` |

A GitHub push triggers a Cloudflare Pages deployment automatically, making the
published content live without any additional manual step.

---

## D1 Write Points

| Stage | Table | Operation | Fields written |
|-------|-------|-----------|----------------|
| Orchestrator — Create Publish Job | `publish_jobs` | INSERT | `status='running'`, `attempt`, `triggered_by`, `started_at`, `workflow_run_id` |
| Module 10 — Update daily_status | `daily_status` | UPSERT | `page_state='published'`, `summary_available=1`, `article_available=1`, `published_at` |
| Module 10 — Update publish_jobs | `publish_jobs` | UPDATE | `status='success'`, `completed_at`, `metadata_json.github_commit_sha` |

D1 writes use the **Cloudflare D1 REST API**:
`POST https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/d1/database/{DATABASE_ID}/query`

---

## State Transitions

### `publish_jobs.status`

```
(new row)
    │
    ▼
 running        ← Orchestrator creates the job at the start of the pipeline
    │
    ├── success ← Module 10 sets this after GitHub publish + D1 update
    │
    └── failed  ← Set by the cleanup/retry workflow when a 'running' job
                  exceeds the staleness threshold (e.g. 2 hours)
```

### `daily_status.page_state`

```
pending → ready → published
```

| Value | Meaning |
|-------|---------|
| `pending` | Day exists in D1 (alerts written) but no editorial content yet |
| `ready` | Enough alerts exist for summary generation (set by intraday workflow) |
| `published` | Editorial content written to GitHub and D1 updated by Module 10 |
| `error` | Manual override for days with unresolvable publishing failures |

---

## Retry Strategy

| Failure point | Retry behaviour |
|--------------|----------------|
| D1 REST query (topics, job check) | 3 retries, linear back-off (2 s) |
| D1 REST write (publish_jobs) | 3 retries, linear back-off (2 s) |
| AI API call (modules 02–07) | 3 retries, linear back-off (5 s) |
| GitHub API GET (SHA check) | Built into HTTP Request node (no retry — failure falls through to PUT) |
| GitHub API PUT (file write) | 3 retries, linear back-off (3 s) |
| D1 REST write (module 10) | 3 retries, linear back-off (2 s) |

After all retries are exhausted, the `errorWorkflow` (Shared — Failure Notifier)
fires and sends a Telegram alert. The `publish_jobs` row remains in `running`
state and must be cleaned up by the retry workflow (see below).

---

## Rerun and Retry Safety

### Idempotency guard

At the start of each topic's pipeline, the orchestrator queries `publish_jobs` for
the current `(topic_slug, date_key)`. The `should_skip` flag is set to `true` when:

- The most recent job has `status='success'` (already completed — no need to re-run), or
- The most recent job has `status='running'` and was started within the last 2 hours
  (a concurrent execution is likely still in progress).

Jobs with `status='running'` older than 2 hours are treated as stale and are
allowed to be superseded by a fresh attempt. This prevents phantom concurrent
runs while still allowing recovery from stuck executions without manual
intervention.

### date_key override

The orchestrator defaults `date_key` to today's UTC date. For backfills or
reruns of a specific past date, pass a `date_key` field (`YYYY-MM-DD`) as input
when triggering the orchestrator manually in n8n. The `Build Topic Context` node
validates the format and falls back to UTC today if absent or invalid.

### Manual rerun

To force a rerun for a specific topic/date (e.g. after a fix):

```sql
-- Mark the previous successful job as 'superseded' to allow a fresh run
UPDATE publish_jobs
SET    status = 'superseded'
WHERE  topic_slug = 'crypto'
  AND  date_key   = '2025-01-15'
  AND  status     = 'success';
```

Then trigger the orchestrator manually or run a targeted n8n execution with
`{ "topic_slug": "crypto", "date_key": "2025-01-15" }` as input to any
individual module for debugging.

### Stale job cleanup

A separate lightweight cleanup workflow (recommended, not included here) should
run every hour and mark `running` jobs older than 2 hours as `failed`:

```sql
UPDATE publish_jobs
SET    status        = 'failed',
       error_message = 'Exceeded staleness threshold — marked by cleanup job',
       updated_at    = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE  status    = 'running'
  AND  started_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-2 hours');
```

### Retry queue

Failed jobs can be retried by querying:

```sql
SELECT topic_slug, date_key, attempt, error_message
FROM   publish_jobs
WHERE  status IN ('failed', 'pending')
ORDER  BY date_key DESC, created_at ASC;
```

---

## AI Usage

| Module | Model | Temperature | Max tokens | Purpose |
|--------|-------|-------------|-----------|---------|
| 02 Generate Summary | gpt-4o | 0.2 | 1000 | Structured daily summary JSON |
| 03 Generate Article | gpt-4o | 0.3 | 1500 | Full Markdown article |
| 04 Expectation Check | gpt-4o | 0.2 | 700 | Structured expectation check JSON |
| 05 Tomorrow Outlook | gpt-4o | 0.2 | 700 | Structured tomorrow outlook JSON |
| 06 Video Script | gpt-4o | 0.4 | 1500 | Spoken-word video script JSON |
| 07 YouTube Metadata | gpt-4o-mini | 0.2 | 800 | YouTube title, description, tags JSON |

All AI modules:
- Return structured JSON (not free-form text)
- Have deterministic validation applied immediately after parsing
- Throw on parse failure or missing required fields (triggering retries)
- Do not publish anything directly — only Module 09 touches GitHub

---

## Contract Files

| File | Purpose |
|------|---------|
| `workflows/contracts/daily_aggregate_context.json` | Output of module 01; base input for all generation modules |
| `workflows/contracts/daily_generation_output.json` | Full validated package output by module 08; input to modules 09–10 |
| `schemas/ai/daily_summary.json` | Validated AI output schema for module 02 (includes `key_events[].sources`, `sources`, `source_confidence_note`) |
| `schemas/ai/expectation_check.json` | Validated AI output schema for module 04 |
| `schemas/ai/tomorrow_outlook.json` | Validated AI output schema for module 05 |
| `schemas/ai/video_script.json` | Validated AI output schema for module 06 (includes `segments[].sources`) |
| `schemas/ai/youtube_metadata.json` | Validated AI output schema for module 07 |
| `docs/video-script-source-attribution.md` | Source attribution rules for the video/script pipeline |

---

## Workflow Files

All n8n workflow JSON files live in `workflows/n8n/daily/`.
Import them into your n8n instance. Set the required credentials and
environment variables before activating the orchestrator.

```
workflows/n8n/daily/
├── orchestrator.json
├── 01_aggregate_alerts.json
├── 02_generate_summary.json
├── 03_generate_article.json
├── 04_generate_expectation_check.json
├── 05_generate_tomorrow_outlook.json
├── 06_generate_video_script.json
├── 07_generate_youtube_metadata.json
├── 08_validate_outputs.json
├── 09_publish_to_github.json
└── 10_update_d1_state.json
```

---

## Required n8n Credentials

| Credential name | Used by |
|----------------|--------|
| `CloudflareD1Api` | Orchestrator, modules 01, 10 |
| `OpenAiApi` | Modules 02, 03, 04, 05, 06, 07 |
| `GitHubApi` | Module 09 |
| `TelegramBotApi` | Shared failure notifier |

---

## Required n8n Environment Variables

### Cloudflare D1

| Variable | Description |
|---------|-------------|
| `CF_ACCOUNT_ID` | Cloudflare account ID |
| `CF_D1_DATABASE_ID` | D1 database ID |

### GitHub

| Variable | Description |
|---------|-------------|
| `GITHUB_REPO_OWNER` | GitHub repository owner (user or org) |
| `GITHUB_REPO_NAME` | GitHub repository name |
| `GITHUB_CONTENT_BRANCH` | Branch to publish content to (default: `main`) |

### Daily Module Workflow IDs

Set after importing all module workflows into n8n.

| Variable | Points to |
|---------|-----------|
| `DAILY_AGGREGATE_WORKFLOW_ID` | `01_aggregate_alerts` workflow ID |
| `DAILY_SUMMARY_WORKFLOW_ID` | `02_generate_summary` workflow ID |
| `DAILY_ARTICLE_WORKFLOW_ID` | `03_generate_article` workflow ID |
| `DAILY_EXPECTATION_CHECK_WORKFLOW_ID` | `04_generate_expectation_check` workflow ID |
| `DAILY_TOMORROW_OUTLOOK_WORKFLOW_ID` | `05_generate_tomorrow_outlook` workflow ID |
| `DAILY_VIDEO_SCRIPT_WORKFLOW_ID` | `06_generate_video_script` workflow ID |
| `DAILY_YOUTUBE_METADATA_WORKFLOW_ID` | `07_generate_youtube_metadata` workflow ID |
| `DAILY_VALIDATE_OUTPUTS_WORKFLOW_ID` | `08_validate_outputs` workflow ID |
| `DAILY_PUBLISH_GITHUB_WORKFLOW_ID` | `09_publish_to_github` workflow ID |
| `DAILY_UPDATE_D1_WORKFLOW_ID` | `10_update_d1_state` workflow ID |
| `FAILURE_NOTIFIER_WORKFLOW_ID` | Shared failure notifier workflow ID |

---

## Future Extensions

The video pipeline is designed to extend naturally:

1. **Automated video generation**: A future module 11 can pick up the
   `video.json` file committed to GitHub and trigger a video rendering
   service (e.g. HeyGen, Synthesia, or a self-hosted pipeline).

2. **YouTube upload**: A future module 12 can upload the rendered video
   to YouTube using the YouTube Data API and populate the `youtube_video_id`
   field in `video.json` and `daily_status.video_available` in D1.

Both extensions can be added as additional `Execute Workflow` calls at the
end of the orchestrator chain without modifying any existing module.
