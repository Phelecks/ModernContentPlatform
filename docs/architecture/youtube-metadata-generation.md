# YouTube Metadata Generation — Workflow Integration Guide

## Overview

Module 07 of the daily editorial workflow generates YouTube publishing metadata
for each active topic/day. It takes the validated structured summary and video
script intro as inputs, calls OpenAI with a structured JSON prompt, and produces
a `youtube_metadata` object that is included in the final published `video.json`
file on GitHub.

This document covers:

1. Where module 07 fits in the daily pipeline
2. Input requirements
3. AI prompt design and output contract
4. Parse and validation logic
5. Output schema and field constraints
6. Integration with downstream modules
7. Fixture examples

---

## Pipeline Position

Module 07 runs after module 06 (Video Script) and before module 08
(Validate Outputs):

```
06 Video Script
  └─ + video_script{}
        │
        ▼
07 YouTube Metadata      ← this module
  └─ + youtube_metadata{}
        │
        ▼
08 Validate Outputs
  └─ validated=true
```

The orchestrator calls module 07 as an `Execute Workflow` node, passing the
full accumulated context object (topic_slug, date_key, summary, video_script,
and all earlier outputs).

---

## Input Requirements

Module 07 requires the following fields on its input context:

| Field | Type | Source |
|-------|------|--------|
| `topic_slug` | string | Orchestrator |
| `date_key` | string (YYYY-MM-DD) | Orchestrator |
| `summary.headline` | string | Module 02 |
| `summary.overview` | string | Module 02 |
| `summary.sentiment` | string | Module 02 |
| `summary.key_events[]` | array | Module 02 |
| `summary.key_events[].title` | string | Module 02 |
| `video_script.intro` | string | Module 06 |

Only `video_script.intro` (first 200 chars) is used from the video script —
as a signal for the description hook. No structural dependency on the full
script object exists.

---

## AI Prompt Design

### Model

`gpt-4o-mini` via `$vars.AI_MODEL_FAST` (fallback: `'gpt-4o-mini'`).

YouTube metadata is short structured output with low analytical complexity.
`gpt-4o-mini` is the correct tier: cost-effective, fast, and sufficient for
SEO-optimised title/description/tag generation.

Temperature `0.2` — low to keep output deterministic and platform-consistent
across reruns.

Max tokens: `800` — sufficient for title (≤100 chars), description (≤5000
chars), and up to 15 tags.

### System prompt intent

The system prompt instructs the model to:

- Return a JSON object matching the `youtube_metadata` schema exactly
- Lead the title with the most compelling event of the day
- Include the topic name and date in the title (e.g. `"Jan 15 2025"`)
- Open the description with a 1–2 sentence hook, then bullet key topics, then a CTA
- Generate 8–15 tags mixing broad topic terms with specific event terms
- Always set `category` to `"News & Politics"` and `visibility` to `"public"`

### User prompt

The user message provides:

- Topic slug and date key
- Video headline and overview from the summary
- Sentiment
- Key event titles (numbered list)
- First 200 characters of the video script intro (for description hook alignment)

---

## Output Contract

The AI must return a JSON object conforming to `schemas/ai/youtube_metadata.json`.

### Required fields

| Field | Type | Constraints |
|-------|------|-------------|
| `title` | string | 10–100 chars, no clickbait, includes topic and date |
| `description` | string | 100–5000 chars, plain text, no HTML |
| `tags` | array of strings | 5–15 items, each 2–100 chars |

### Optional fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `category` | string | `"News & Politics"` | YouTube category name |
| `visibility` | enum | `"public"` | `public`, `unlisted`, or `private` |

### Title guidelines

- Lead with the single most compelling development of the day
- Include the topic name (e.g. `"Crypto"`, `"Finance"`)
- Include the date in human-readable form (e.g. `"Jan 15 2025"`)
- Max 100 characters — strict YouTube limit
- No clickbait or misleading framing

### Description guidelines

- Open with a 1–2 sentence hook grounded in the day's headline
- Bullet the 4–6 main topics covered in the video
- Close with a subscribe call-to-action
- 150–300 words is the recommended sweet spot
- Plain text only — no HTML, no markdown

### Tag guidelines

- 8–15 tags is optimal for YouTube SEO
- Mix broad terms (e.g. `"crypto"`, `"finance news"`) with specific event terms
  (e.g. `"bitcoin etf"`, `"fomc minutes"`)
- All tags lowercase
- Each tag max 100 characters

---

## Parse and Validation Logic

The **Parse and Validate YouTube Metadata** Code node (module 07, node 3):

1. Extracts `message.content` from the OpenAI response
2. Strips any accidental markdown code fences
3. Parses the JSON — throws on parse failure
4. Validates required fields: `title` (≥10 chars), `description` (≥100 chars),
   `tags` (≥5 items)
5. Normalises and clamps all fields:
   - `title` → `.slice(0, 100)`
   - `description` → `.slice(0, 5000)`
   - `tags` → max 15, each `.slice(0, 100).toLowerCase().trim()`, min 2 chars after trim
   - `category` → defaults to `"News & Politics"` if absent
   - `visibility` → defaults to `"public"` if absent or invalid

The same validation logic is available in `app/src/utils/validateAiOutput.js`
as `validateYoutubeMetadata()` and `parseAndValidateYoutubeMetadata()` for
basic structural validation and parsing. The workflow node above remains the
source of truth for the full normalisation/clamping behaviour described in
this section.

---

## Integration with Downstream Modules

### Module 08 — Validate Outputs

Module 08 checks that:
- `youtube_metadata` is present and is an object
- `youtube_metadata.title` is a non-empty string (≥10 chars)
- `youtube_metadata.description` is a non-empty string (≥100 chars)
- `youtube_metadata.tags` is an array with at least 5 items

### Module 09 — Publish to GitHub

Module 09 writes `video.json` to:

```
content/topics/{topic_slug}/{date_key}/video.json
```

The `video.json` file contains the full `youtube_metadata` object alongside
the video script and placeholder fields for the future YouTube upload pipeline:

```json
{
  "topic_slug": "crypto",
  "date_key": "2025-01-15",
  "title": "Bitcoin Breaks $50K on Record ETF Inflows | Crypto Daily Briefing Jan 15 2025",
  "video_id": null,
  "script": { ... },
  "youtube_metadata": {
    "title": "Bitcoin Breaks $50K on Record ETF Inflows | Crypto Daily Briefing Jan 15 2025",
    "description": "...",
    "tags": ["bitcoin", "crypto", ...],
    "category": "News & Politics",
    "visibility": "public"
  },
  "youtube_video_id": null,
  "generated_at": "2025-01-15T23:30:00.000Z"
}
```

Key field notes:
- `title` (top-level) — mirrors `youtube_metadata.title` for easy access by the
  frontend `VideoEmbed` component
- `video_id` and `youtube_video_id` — both null at publish time; a future YouTube
  upload module populates these after the video is uploaded to YouTube
- `youtube_metadata` — the full output from module 07, ready for direct use with
  the YouTube Data API

---

## Retry and Error Behaviour

| Failure | Behaviour |
|---------|-----------|
| OpenAI API failure | Retry 3×, 5 s back-off |
| JSON parse failure | Code node throws — workflow falls through to error handler |
| Validation failure (title/description/tags) | Code node throws — workflow falls through to error handler |
| All retries exhausted | `errorWorkflow` fires — Failure Notifier sends Telegram alert |

Module 07 does not update D1 state directly. If it fails, the `publish_jobs`
row remains in `running` state and is cleaned up by the stale-job cleanup
query described in `docs/architecture/daily-editorial-workflow.md`.

---

## Fixture Examples

Canonical fixture files live in `fixtures/youtube-metadata/`.

### Crypto — January 15, 2025

Input context: Bitcoin spot ETF record inflows, Bitcoin touching $50,000,
Ethereum ETF parallel surge. Bullish sentiment, topic_score 78.

Fixture: `fixtures/youtube-metadata/crypto-2025-01-15.json`

Key characteristics:
- Title leads with Bitcoin price milestone and record ETF inflows
- Description bullets the key events and watchpoints covered in the video
- Tags mix broad terms (`"bitcoin"`, `"crypto"`) with specific terms
  (`"spot bitcoin etf"`, `"btc $50k"`)
- Description closes with a subscribe CTA

### Finance — January 15, 2025

Input context: FOMC minutes confirm no Q1 rate cuts, S&P 500 falls 1.2%,
US dollar index hits two-month high. Bearish sentiment, topic_score 85.

Fixture: `fixtures/youtube-metadata/finance-2025-01-15.json`

Key characteristics:
- Title leads with the FOMC minutes message and the S&P decline
- Description bullets the key market moves covered in the video
- Tags combine policy terms (`"fomc minutes"`, `"federal reserve"`) with
  market terms (`"sp500"`, `"bond yields"`)
- Description closes with a subscribe CTA referencing the daily briefing cadence

---

## Workflow File

```
workflows/n8n/daily/07_generate_youtube_metadata.json
```

Nodes:
1. **Execute Workflow Trigger** — receives accumulated daily context
2. **Generate YouTube Metadata with AI** — OpenAI Chat Completions (`json_object`)
3. **Parse and Validate YouTube Metadata** — Code node; normalises and validates output

---

## Related Files

| File | Purpose |
|------|---------|
| `workflows/n8n/daily/07_generate_youtube_metadata.json` | n8n workflow module |
| `schemas/ai/youtube_metadata.json` | JSON Schema for the AI output contract |
| `app/src/utils/validateAiOutput.js` | JS validation helpers (`validateYoutubeMetadata`, `parseAndValidateYoutubeMetadata`) |
| `fixtures/youtube-metadata/crypto-2025-01-15.json` | Example Crypto YouTube metadata |
| `fixtures/youtube-metadata/finance-2025-01-15.json` | Example Finance YouTube metadata |
| `docs/architecture/daily-editorial-workflow.md` | Full daily workflow architecture |
| `docs/architecture/video-script-generation.md` | Video script generation integration guide |
