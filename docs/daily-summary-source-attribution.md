# Daily Summary Source Attribution — Frontend Rendering Guide

## Overview

Daily summaries support structured source attribution at two levels:

1. **Section-level sources** — per key event source references in `key_events[].sources`
2. **Article-level sources** — aggregated source list in `sources` with a `source_confidence_note`

Both are defined in `schemas/ai/daily_summary.json` and present in published `summary.json` files.

---

## Content Model

### Source reference shape

```json
{
  "source_name": "CoinDesk",
  "source_url": "https://www.coindesk.com/...",
  "source_role": "primary"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `source_name` | string | Yes | Human-readable source name |
| `source_url` | string \| null | No | URL to the source item |
| `source_role` | string \| null | No | `primary`, `confirmation`, `data`, `commentary`, `official` |

### Summary JSON with source fields

```json
{
  "headline": "...",
  "overview": "...",
  "key_events": [
    {
      "title": "...",
      "significance": "...",
      "importance_score": 82,
      "sources": [
        { "source_name": "CoinDesk", "source_url": "https://...", "source_role": "primary" },
        { "source_name": "CoinGecko API", "source_url": null, "source_role": "data" }
      ]
    }
  ],
  "sources": [
    { "source_name": "CoinDesk", "source_url": "https://...", "source_role": "primary" },
    { "source_name": "Bloomberg", "source_url": "https://...", "source_role": "confirmation" },
    { "source_name": "CoinGecko API", "source_url": null, "source_role": "data" }
  ],
  "source_confidence_note": "High confidence: multiple outlets corroborated by data APIs."
}
```

---

## v1 Presentation Style — Recommendation

For v1 the recommended presentation is a **bottom-of-page "Sources" block** rendered by the `SourceList` component. This approach:

- is clean and non-intrusive — does not disrupt the article reading flow
- is editorially familiar — similar to bibliography or footnote sections
- is simple to implement — one component, one data binding
- is compatible with later expansion into richer source UX (inline chips, hover cards)

### Visual structure

```
┌────────────────────────────────────────────────┐
│  Daily Summary heading                         │
│  Article markdown content...                   │
│                                                │
│  ┌──────────────────────────────────────────┐  │
│  │  SOURCES                                 │  │
│  │  ┌─────────┐ ┌───────────┐ ┌──────────┐ │  │
│  │  │CoinDesk │ │ Bloomberg │ │CoinGecko │ │  │
│  │  │ primary │ │confirm.   │ │  data    │ │  │
│  │  └─────────┘ └───────────┘ └──────────┘ │  │
│  │                                          │  │
│  │  High confidence: multiple outlets...    │  │
│  └──────────────────────────────────────────┘  │
└────────────────────────────────────────────────┘
```

---

## Component: `SourceList.vue`

Location: `app/src/components/SourceList.vue`

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `sources` | `Array` | `null` | Array of source objects |
| `confidenceNote` | `String` | `null` | Optional confidence note |

### Behavior

- Renders nothing when `sources` is null or empty
- Renders source chips as inline items with flex-wrap
- Sources with `source_url` render as external links (`target="_blank"`)
- Sources without `source_url` render as plain text
- `source_role` is shown as a small muted label next to the source name
- `confidenceNote` is rendered as an italic footnote below the source chips

### Usage in `TopicDayPage.vue`

```vue
<SourceList
  v-if="summaryData && Array.isArray(summaryData.sources) && summaryData.sources.length > 0"
  :sources="summaryData.sources"
  :confidence-note="summaryData.source_confidence_note"
/>
```

The page loads `summary.json` via `fetchSummary()` when `summary_available` is set, and passes the source data to the `SourceList` component.

---

## Data flow

```
summary.json (GitHub)
  → fetchSummary() (content service)
    → summaryData ref (TopicDayPage)
      → SourceList component (renders sources + confidence note)
```

---

## Future expansion (v2+)

The current model supports later evolution into:

| Enhancement | How the model supports it |
|-------------|--------------------------|
| Inline source chips per key event | `key_events[].sources` is already populated |
| Hover cards with source details | `source_url` and `source_role` provide link + context |
| Source trust indicators | `source_role` enables role-based styling (official = green badge) |
| Source-aware confidence bar | `source_confidence_note` could be parsed or replaced with a score |
| Source grouping by role | `source_role` enables grouping by primary, confirmation, data, etc. |

No schema changes are needed for these enhancements — only frontend rendering changes.

---

## Backward compatibility

All source fields are optional in the schema:

- `key_events[].sources` — can be null or absent
- `sources` — can be null or absent
- `source_confidence_note` — can be null or absent

Summaries without sources continue to render correctly. The `SourceList` component renders nothing when sources is null or empty.
