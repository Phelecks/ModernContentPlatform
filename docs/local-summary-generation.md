# Local Daily Summary Generation

This document describes how to run the local daily summary generation flow end-to-end.
It is the local equivalent of the full n8n daily editorial workflow and lets you prove
the editorial path — from alert data to final content — without requiring any production
integrations.

---

## Purpose

The local generation flow validates that:

- a topic/day with existing alert data can be processed into a complete content package
- the generated `summary.json` and `article.md` are written to the correct content paths
- the `daily_status` row in local D1 is updated so the frontend transitions from placeholder state to final summary state

This flow is repeatable and safe to run multiple times for iterative local testing.

---

## Prerequisites

1. **Node.js 20 LTS or later** installed
2. **Wrangler CLI ≥ 3** installed (`npm install -g wrangler`)
3. Local D1 initialised with seed data:

   ```bash
   bash scripts/local-reset.sh
   ```

   This applies all D1 migrations and seeds topics + sample alerts for
   `crypto`, `finance`, and `ai` on `2025-01-15`.

---

## Running the script

```bash
node scripts/generate-daily-summary.js --topic <topic_slug> --date <YYYY-MM-DD>
```

### Example — AI topic, January 15 2025

```bash
node scripts/generate-daily-summary.js --topic ai --date 2025-01-15
```

Expected output:

```
========================================================
  Modern Content Platform — Local Summary Generation
========================================================
  Topic : ai
  Date  : 2025-01-15

Step 1/5  Loading topic metadata from D1…
          Topic: AI
Step 2/5  Loading alerts and clusters from D1…
          Alerts  : 3
          Clusters: 1
Step 3/5  Generating summary and article…
          Headline  : AI: Open-Source Model Release
          Sentiment : mixed
          Score     : 71/100
          Key events: 3
Step 4/5  Writing content files…
  ✔  Written: content/topics/ai/2025-01-15/summary.json
  ✔  Written: content/topics/ai/2025-01-15/article.md
  ✔  Written: content/topics/ai/2025-01-15/metadata.json
Step 5/5  Updating daily_status in local D1…
          daily_status updated: page_state=ready, article_available=1, summary_available=1

Done. Summary generation complete.
```

---

## What the script does

| Step | Action |
|------|--------|
| 1 | Reads topic metadata from the local D1 `topics` table |
| 2 | Reads active alerts and event clusters from local D1 for the given topic/date |
| 3 | Generates a structured `summary.json` conforming to `schemas/ai/daily_summary.json` and a Markdown `article.md` |
| 4 | Writes `summary.json`, `article.md`, and `metadata.json` to `content/topics/{topicSlug}/{dateKey}/` |
| 5 | Updates the `daily_status` row: `summary_available=1`, `article_available=1`, `page_state='ready'` |

In production the generation step (step 3) is replaced by an AI prompt call via n8n.
Locally the script uses deterministic mock logic derived from the alert and cluster data.

---

## Output files

After running the script, three files are written:

```
content/topics/{topicSlug}/{dateKey}/
  summary.json    ← structured daily summary (schemas/ai/daily_summary.json)
  article.md      ← full Markdown article
  metadata.json   ← publish metadata (page_state, paths, generated_at)
```

### summary.json shape

```json
{
  "topic_slug": "ai",
  "date_key": "2025-01-15",
  "headline": "AI: Open-Source Model Release",
  "overview": "...",
  "key_events": [
    { "title": "...", "significance": "...", "importance_score": 78 }
  ],
  "market_context": null,
  "sentiment": "mixed",
  "topic_score": 71,
  "generated_at": "2025-01-15T23:30:00Z"
}
```

See `schemas/ai/daily_summary.json` for the full schema definition.

---

## Frontend state transition

Once the script completes, the topic/day page transitions:

| Before | After |
|--------|-------|
| `page_state = 'pending'` or `'ready'` with no article | `page_state = 'ready'`, `article_available = 1` |
| `SummaryPlaceholder` shown | `SummarySection` shown with article content |
| Banner: "Live — summary pending end of day" | Banner: "Summary ready — publishing soon" |

### Verifying locally

1. Start the dev server (requires `wrangler pages dev`):

   ```bash
   cd app && npm run dev
   ```

2. Open the page:

   ```
   http://localhost:5173/topics/ai/2025-01-15
   ```

3. The page should now display the generated article and a **"Summary ready — publishing soon"** banner instead of the placeholder.

### Verifying the D1 state update

```bash
npx wrangler d1 execute modern-content-platform-db --local \
  --command "SELECT page_state, summary_available, article_available FROM daily_status WHERE topic_slug='ai' AND date_key='2025-01-15'"
```

---

## Sample generated output

A pre-generated example for `ai/2025-01-15` is committed at:

```
content/topics/ai/2025-01-15/summary.json
content/topics/ai/2025-01-15/article.md
content/topics/ai/2025-01-15/metadata.json
```

This serves as a reference for the expected output shape and as a static fixture
for the frontend and integration tests.

---

## Running for other topics

The script works for any topic that has alert data in local D1.
After running `scripts/local-reset.sh`, the following topic/date combinations are seeded:

| Topic | Date |
|-------|------|
| crypto | 2025-01-15 |
| finance | 2025-01-15 |
| ai | 2025-01-15 |

Example — crypto:

```bash
node scripts/generate-daily-summary.js --topic crypto --date 2025-01-15
```

---

## Repeatability

Re-running the script for the same topic/date:

- **Overwrites** existing content files in `content/topics/{topicSlug}/{dateKey}/`
- **Updates** the `daily_status` row in-place (safe upsert)

There is no need to reset D1 between runs unless you want to restart from a clean state.

---

## Relationship to the n8n production workflow

This local script mirrors the function of the n8n daily editorial workflow:

| n8n Module | Local script equivalent |
|------------|------------------------|
| `01_aggregate_alerts.json` | Steps 1–2: loads alerts + clusters from D1 |
| `02_generate_summary.json` | Step 3: generates `summary.json` (mock, no AI call) |
| `03_generate_article.json` | Step 3: generates `article.md` (templated, no AI call) |
| `08_validate_outputs.json` | Not implemented locally: script writes generated outputs without explicit schema validation |
| `10_update_d1_state.json` | Step 5: updates `daily_status` row |

The production workflow also generates video scripts, YouTube metadata, and pushes
content to GitHub via the publish pipeline. The local script omits these steps to keep
the local path simple and dependency-free.

---

## Integration tests

The acceptance criteria for the generated content and frontend state transition are
covered by:

```
app/src/__tests__/integration/content.daily-summary.test.js
```

Run them with:

```bash
cd app && npm run test:run
```
