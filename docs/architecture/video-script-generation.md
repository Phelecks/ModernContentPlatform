# Video Script Generation — Workflow Integration Guide

## Overview

Module 06 of the daily editorial workflow generates a spoken-word video script
for each active topic/day. It takes the validated structured summary and
tomorrow's outlook as inputs, calls OpenAI with a structured JSON prompt, and
produces a `video_script` object that is included in the final published
`video.json` file on GitHub.

This document covers:

1. Where module 06 fits in the daily pipeline
2. Input requirements
3. AI prompt design and output contract
4. Parse and validation logic
5. Output schema and source attribution
6. Integration with downstream modules
7. Fixture examples

---

## Pipeline Position

Module 06 runs after module 05 (Tomorrow Outlook) and before module 07
(YouTube Metadata):

```
05 Tomorrow Outlook
  └─ + tomorrow_outlook{}
        │
        ▼
06 Video Script          ← this module
  └─ + video_script{}
        │
        ▼
07 YouTube Metadata
  └─ + youtube_metadata{}
```

The orchestrator calls module 06 as an `Execute Workflow` node, passing the
full accumulated context object (topic_slug, date_key, summary, tomorrow_outlook,
and all earlier outputs).

---

## Input Requirements

Module 06 requires the following fields on its input context:

| Field | Type | Source |
|-------|------|--------|
| `topic_slug` | string | Orchestrator |
| `date_key` | string (YYYY-MM-DD) | Orchestrator |
| `summary.headline` | string | Module 02 |
| `summary.overview` | string | Module 02 |
| `summary.key_events[]` | array | Module 02 |
| `summary.key_events[].title` | string | Module 02 |
| `summary.key_events[].significance` | string | Module 02 |
| `summary.key_events[].sources[]` | array \| null | Module 02 |
| `tomorrow_outlook.key_watchpoints[0].title` | string | Module 05 |
| `tomorrow_outlook.key_watchpoints[0].description` | string | Module 05 |
| `tomorrow_outlook.risk_level` | string | Module 05 |

Source attribution flows from `summary.key_events[].sources` into the AI user
prompt so each segment can be grounded in its originating sources. See
`docs/video-script-source-attribution.md` for the full source flow diagram.

---

## AI Prompt Design

### Model

`gpt-4o` via `$vars.AI_MODEL_STANDARD` (fallback: `'gpt-4o'`).

Temperature `0.4` — slightly higher than summary generation to allow natural
variation in spoken phrasing while keeping factual content stable.

Max tokens: `1500` — sufficient for a 2–5 minute video script.

### System prompt intent

The system prompt instructs the model to:

- Produce a JSON object matching the `video_script` schema exactly
- Write in spoken-word style (conversational, no jargon without explanation)
- Map each segment to its originating key events and sources
- Never read source URLs or source names verbatim in the spoken text
- Use the outro to summarise the day and reference tomorrow's top watchpoint

### User prompt

The user message provides:

- Topic slug and date key
- Headline and overview from the summary
- Key events list with per-event source names (when available)
- Tomorrow's top watchpoint title and description
- Tomorrow's risk level

---

## Output Contract

The AI must return a JSON object conforming to `schemas/ai/video_script.json`.

### Required fields

| Field | Type | Constraints |
|-------|------|-------------|
| `intro` | string | 30–500 chars |
| `segments` | array | 2–5 items |
| `segments[].title` | string | 3–100 chars (internal use) |
| `segments[].script` | string | 50–1500 chars (spoken text) |
| `segments[].duration_seconds` | integer | 15–120 |
| `outro` | string | 30–400 chars |
| `total_duration_seconds` | integer | 60–600 |

### Optional fields

| Field | Type | Description |
|-------|------|-------------|
| `segments[].sources` | array \| null | Source grounding for each segment |
| `call_to_action` | string \| null | Subscribe/engagement prompt |

### Source role set

Video segments use a simplified role set compared to the written summary:

| Role | When to use |
|------|-------------|
| `primary` | Main source for the segment's claim |
| `data` | Data API or structured data source |
| `commentary` | Analysis or opinion adding context |

---

## Parse and Validation Logic

The **Parse and Validate Video Script** Code node (module 06, node 3):

1. Extracts `message.content` from the OpenAI response
2. Strips any accidental markdown code fences
3. Parses the JSON — throws on parse failure
4. Validates required fields: `intro` (≥30 chars), `segments` (≥2 items), `outro` (≥30 chars)
5. Estimates `total_duration_seconds` from segment durations if missing
6. Normalises and clamps all fields:
   - `intro` → `.slice(0, 500)`
   - `outro` → `.slice(0, 400)`
   - `total_duration_seconds` → clamped to 60–600
   - `segments` → max 5, each `script` clamped to 1500 chars
   - `segments[].sources` → normalised via `normalizeSources()`, max 5 per segment
   - `call_to_action` → `.slice(0, 200)` or null

The same validation logic is available in `app/src/utils/validateAiOutput.js`
as `validateVideoScript()` and `parseAndValidateVideoScript()` for basic
structural validation and parsing. The workflow node above remains the source
of truth for the full normalisation/clamping behaviour described in this
section.

---

## Integration with Downstream Modules

### Module 07 — YouTube Metadata

Module 07 receives the accumulated context including `video_script`. It uses
`video_script.intro.slice(0, 200)` as a signal for writing the YouTube video
description hook. No structural dependency on the full script — only the intro
field is referenced.

### Module 08 — Validate Outputs

Module 08 checks that:
- `video_script` is present and is an object
- `video_script.intro` is a non-empty string (≥30 chars)
- `video_script.segments` is an array with at least 2 items
- Each segment has `title`, `script`, and `duration_seconds`
- Any `sources` entries that are present have a non-empty `source_name`

### Module 09 — Publish to GitHub

Module 09 writes `video.json` to:

```
content/topics/{topic_slug}/{date_key}/video.json
```

The `video.json` file contains:

```json
{
  "topic_slug": "crypto",
  "date_key": "2025-01-15",
  "title": "Crypto Daily — January 15, 2025: ...",
  "video_id": null,
  "script": { ... },
  "youtube_metadata": { ... },
  "youtube_video_id": null,
  "generated_at": "2025-01-15T23:30:00.000Z"
}
```

Key field notes:
- `script` — the `video_script` object produced by module 06
- `title` — the YouTube title from `youtube_metadata.title` (null before module 07 runs)
- `video_id` and `youtube_video_id` — both null at publish time; a future YouTube upload module sets these after the video is uploaded
- `generated_at` — server-side ISO timestamp set by module 09 at write time

---

## Retry and Error Behaviour

| Failure | Behaviour |
|---------|-----------|
| OpenAI API failure | Retry 3×, 5 s back-off |
| JSON parse failure | Code node throws — workflow falls through to error handler |
| Validation failure | Code node throws — workflow falls through to error handler |
| All retries exhausted | `errorWorkflow` fires — Failure Notifier sends Telegram alert |

Module 06 does not update D1 state directly. If it fails, the `publish_jobs`
row remains in `running` state and is cleaned up by the stale-job cleanup
query described in `docs/architecture/daily-editorial-workflow.md`.

---

## Fixture Examples

### Crypto — January 15, 2025

Input context: Bitcoin ETF record inflows, Bitcoin touching $50,000,
Ethereum ETF parallel surge. Bullish sentiment, topic_score 78.

Fixture: `fixtures/video-scripts/crypto-2025-01-15.json`

Key characteristics:
- 3 segments covering ETF inflows, Bitcoin price level, and Ethereum parallel
- Each segment grounded in named sources from the daily summary
- Outro references the $50,000 level as tomorrow's key watchpoint
- `total_duration_seconds`: 185 (~3 minutes)

### Finance — January 15, 2025

Input context: FOMC minutes confirm no Q1 rate cuts, S&P 500 falls 1.2%,
US dollar index hits two-month high. Bearish sentiment, topic_score 85.

Fixture: `fixtures/video-scripts/finance-2025-01-15.json`

Key characteristics:
- 3 segments: Fed minutes message, equity reaction, dollar and yield moves
- Fed minutes segment references both the official Federal Reserve source and
  a wire service commentary source
- Outro references Fed speaker commentary as tomorrow's key risk
- `total_duration_seconds`: 200 (~3.3 minutes)

---

## Workflow File

```
workflows/n8n/daily/06_generate_video_script.json
```

Nodes:
1. **Execute Workflow Trigger** — receives accumulated daily context
2. **Generate Video Script with AI** — OpenAI Chat Completions (`json_object`)
3. **Parse and Validate Video Script** — Code node; normalises and validates output

---

## Related Files

| File | Purpose |
|------|---------|
| `workflows/n8n/daily/06_generate_video_script.json` | n8n workflow module |
| `schemas/ai/video_script.json` | JSON Schema for the AI output contract |
| `app/src/utils/validateAiOutput.js` | JS validation helpers (validateVideoScript, parseAndValidateVideoScript) |
| `docs/video-script-source-attribution.md` | Source attribution rules and pipeline diagram |
| `fixtures/video-scripts/crypto-2025-01-15.json` | Example Crypto video script |
| `fixtures/video-scripts/finance-2025-01-15.json` | Example Finance video script |
| `docs/architecture/daily-editorial-workflow.md` | Full daily workflow architecture |
