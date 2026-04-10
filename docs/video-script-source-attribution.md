# Video Script Source Attribution — Guide

## Overview

The video/script pipeline is source-aware. Source references are preserved
through the workflow and available for editorial review, but they are not
spoken aloud in the final video output.

This document covers:

1. What source information flows through the video pipeline
2. What should and should not appear in the final video
3. How the written summary and video pipelines stay aligned
4. The `segments[].sources` field and how to use it

---

## Source Flow Through the Pipeline

```
01 Aggregate Alerts
  └─ alerts[].source_name, alerts[].source_url (from D1)
        │
        ▼
02 Generate Summary
  └─ summary.key_events[].sources   ← per-event source references
  └─ summary.sources                ← aggregated top-level source list
  └─ summary.source_confidence_note ← editorial confidence note
        │
        ▼
06 Generate Video Script
  └─ Receives summary.key_events[].sources in AI prompt
  └─ video_script.segments[].sources ← per-segment source grounding
        │
        ▼
08 Validate Outputs
  └─ Confirms source_name present on all source entries (when present)
        │
        ▼
09 Publish to GitHub
  └─ video.json includes video_script.segments[].sources
  └─ summary.json includes summary.sources + source_confidence_note
```

Source data originates in the intraday alert records (`source_name`,
`source_url` on each alert). Module 01 carries these fields through
the aggregate context. Module 02 uses them when constructing the
per-event and top-level source lists in the summary. Module 06
receives the source-annotated summary as input.

---

## Source Reference Shape

```json
{
  "source_name": "CoinDesk RSS",
  "source_url": "https://www.coindesk.com/markets/2025-01-15/...",
  "source_role": "primary"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `source_name` | string | Yes | Human-readable name of the source |
| `source_url` | string \| null | No | URL to the source item |
| `source_role` | string \| null | No | Role: `primary`, `data`, `commentary` (video segments use a simplified set) |

Video segments use a simplified source role set: `primary`, `data`, `commentary`.
The full written summary uses the wider set: `primary`, `confirmation`, `data`,
`commentary`, `official`.

---

## What Source Information Appears in the Final Video

### What IS included (editorial layer only)

| Location | Field | Purpose |
|----------|-------|---------|
| `video_script.segments[].sources` | Per-segment source grounding | Editorial review, future on-screen attribution |
| `summary.sources` | Aggregated source list | Frontend `SourceList` rendering |
| `summary.source_confidence_note` | Confidence summary | Editorial quality check |

These fields are stored in the published `video.json` and `summary.json` files
and are available for editorial review and frontend rendering.

### What is NOT spoken in the video

Source URLs, raw domain names, and source attribution strings should **not**
appear verbatim in the spoken script text. The AI prompt explicitly instructs:

> Do NOT read out source URLs or source names verbatim in the spoken script —
> sources are for editorial grounding only.

This rule keeps the spoken delivery natural and audience-appropriate. A narrator
can naturally reference "according to analysts" or "data from CoinGecko" where
editorially appropriate, but full URLs and source name lists are not spoken.

### Potential v2 on-screen attribution

`segments[].sources` supports a future on-screen lower-third or end-card
attribution overlay. The source data is available in `video.json` for a future
video rendering pipeline to consume without changing the script schema.

---

## Alignment Between Written and Video Pipelines

| Written pipeline | Video pipeline | Alignment |
|-----------------|----------------|-----------|
| `summary.key_events[].title` | `video_script.segments[].title` | Segment titles map to key events |
| `summary.key_events[].significance` | `video_script.segments[].script` | Spoken content derives from significance |
| `summary.key_events[].sources` | `video_script.segments[].sources` | Source grounding is shared |
| `summary.sources` | Not duplicated in `video_script` | Top-level sources stay in summary only |
| `summary.source_confidence_note` | Not duplicated in `video_script` | Confidence note stays in summary only |
| `tomorrow_outlook.key_watchpoints[0]` | `video_script.outro` | Outro references the top watchpoint |

Module 06 receives the complete, validated summary output from module 02 as
its input. This guarantees that:

- the video script is always generated from the same source-aware summary
- key event ordering is consistent between the written and video outputs
- source references carried into the video segments trace directly back to
  the sources in the written summary

---

## Editorial Review Use Cases

The source data in `video.json` enables several editorial review workflows:

1. **Pre-publish spot check** — verify that each segment is backed by at
   least one named source before the video goes live.

2. **Confidence-gated publishing** — a future gate could block video publishing
   when `source_confidence_note` indicates low confidence (e.g. single unverified
   source for a high-importance event).

3. **On-screen attribution overlay** — a future video rendering module can read
   `segments[].sources` to generate lower-third text cards without manual entry.

4. **Consistency audit** — compare `summary.key_events[].sources` with
   `video_script.segments[].sources` to confirm the video is grounded in the
   same sources as the written content.

---

## Backward Compatibility

All source fields are optional:

- `video_script.segments[].sources` — can be null or absent per segment
- `summary.sources` — can be null or absent
- `summary.key_events[].sources` — can be null or absent per event
- `summary.source_confidence_note` — can be null

Days with no source data continue to generate valid scripts. Module 08
validation only checks that `source_name` is present on any source entry
that does exist — it does not require sources to be populated.

---

## Schema References

| Schema | Source fields |
|--------|--------------|
| `schemas/ai/daily_summary.json` | `key_events[].sources`, `sources`, `source_confidence_note` |
| `schemas/ai/video_script.json` | `segments[].sources` |
| `schemas/ai/youtube_metadata.json` | None — intentionally excluded |

YouTube metadata does not include source fields. The YouTube title, description,
and tags are publishing metadata and do not require structured source references.

See `docs/architecture/source-aware-ai-schemas.md` for the full cross-schema
source reference guide.
