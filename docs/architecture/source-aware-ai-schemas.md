# Source-Aware AI Output Schemas

## Overview

All AI output schemas in `schemas/ai/` support structured source references. This ensures the AI layer always works with explicit source attribution instead of generating unsupported claims.

Source references are part of the AI output contract. Downstream consumers (n8n workflows, D1 persistence, frontend rendering) can rely on a consistent source reference structure across all output types.

## Source Reference Structure

All source references follow a consistent shape:

```json
{
  "source_name": "CoinDesk RSS",
  "source_url": "https://www.coindesk.com/markets/...",
  "source_type": "rss",
  "source_role": "primary"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `source_name` | string | Yes | Human-readable name of the source |
| `source_url` | string \| null | No | URL of the source item |
| `source_type` | string \| null | No | Technical category: `rss`, `api`, `social`, `webhook`, `x_account`, `x_query` |
| `source_role` | string \| null | No | Role of the source: `primary`, `confirmation`, `data`, `commentary`, `official` |

Not all schemas include every field. Simpler schemas (expectation checks, tomorrow outlook) use a minimal `{ source_name, source_url }` shape to keep outputs practical.

## Schema-by-Schema Reference

### alert_classification.json

| Field | Description |
|-------|-------------|
| `primary_source` | Object with the primary source used for classification. Populated from the input item context. |
| `supporting_sources` | Array (max 5) of sources that corroborate or add context. |
| `source_confidence_note` | How source quality or corroboration influenced the `confidence_score`. |

The AI classifier receives trust_tier and trust_score from the normalized item. The `source_confidence_note` field captures how these factors affected confidence.

### timeline_entry.json

| Field | Description |
|-------|-------------|
| `source_attribution` | Display-ready attribution string (e.g. "via CoinDesk", "Source: BLS"). |
| `source_url` | Link-through URL for the primary source. |

Timeline entries are rendered on the frontend. The `source_attribution` string is ready for display without further processing.

### daily_summary.json

| Field | Description |
|-------|-------------|
| `key_events[].sources` | Per-event source list (max 5 per event). |
| `sources` | Top-level aggregated source list for the entire summary (max 10). |
| `source_confidence_note` | How source diversity and quality affect confidence in the summary. |

Section-level source refs allow the frontend and editorial review to trace each key event back to its original sources.

### expectation_check.json

| Field | Description |
|-------|-------------|
| `expectations_checked[].source` | Source that substantiates each outcome assessment. |

Each expectation outcome links to the source that confirms whether the expectation was met, missed, or partially met.

### tomorrow_outlook.json

| Field | Description |
|-------|-------------|
| `key_watchpoints[].source` | Source supporting each watchpoint. |
| `scheduled_events[].source` | Source for scheduled event information. |

Forward-looking watchpoints reference the sources from which they were derived.

### video_script.json

| Field | Description |
|-------|-------------|
| `segments[].sources` | Sources referenced in each video segment (max 5 per segment). |

Video segments reference the sources used for their spoken content. This supports both editorial review and potential on-screen attribution.

### youtube_metadata.json

No source fields added. YouTube metadata (title, description, tags) does not require structured source references.

## Source Roles

| Role | When to use |
|------|-------------|
| `primary` | The main source for a claim or event |
| `confirmation` | Independent source confirming the primary |
| `data` | Structured data source (API, dataset) providing factual numbers |
| `commentary` | Analysis or opinion adding context |
| `official` | Government, regulator, or institutional primary source |

## Source-Aware Confidence Logic

The `confidence_score` in alert classification and the `source_confidence_note` in summaries implement source-aware confidence:

1. **Trust tier influence**: T1 (official) and T2 (wire) sources produce higher confidence than T3 (specialist) or T4 (social) sources.
2. **Corroboration**: Multiple independent sources on the same event increase confidence.
3. **Source type diversity**: A claim confirmed by both a news outlet and a data API is more reliable than one confirmed by two similar news outlets.

The `source_confidence_note` field captures this reasoning in plain text for editorial review.

## Backward Compatibility

All new source fields are optional (nullable or have no `required` constraint at the schema level). Existing workflows that do not yet populate source references will continue to produce valid outputs with null or absent source fields.

## Validation Notes for Workflows

### Intraday flow (n8n modules 05–09)

- Module 05 (AI classification): Should populate `primary_source` from the input normalized item's `source_name`, `source_url`, and `source_type`. Should populate `supporting_sources` when the AI identifies corroborating sources. Should populate `source_confidence_note` explaining trust-tier influence on confidence.
- Module 06 (timeline formatting): Should populate `source_attribution` from the classified alert's `source_name` and `source_url` from its `primary_source` or the item's existing source fields.
- Module 07 (D1 persistence): Source fields are stored in `metadata_json` alongside existing fields.

### Daily flow (n8n modules 01–10)

- Module 01 (aggregate): Already includes `source_url` and `source_name` on alert records from D1.
- Modules 02–07 (AI generation): Should populate source arrays on generated outputs, drawing from the alert-level source data in the aggregate context.
- Module 08 (validation): Should verify that `sources` arrays, when present, contain at least a `source_name` for each entry.
- Module 09 (GitHub publish): Source data is included in the published JSON and can be rendered on topic/day pages.
