# Editorial Quality Checks (08b)

## Overview

The daily publishing pipeline already enforces **structural** validation at
module `08_validate_outputs` — every AI output is parsed and matched against
its JSON schema (see `schemas/ai/`).  Schema validation tells us *"is the JSON
shape correct?"*.

Module `08b_editorial_quality_check` adds an **editorial** quality gate that
runs after schema validation and before GitHub publishing.  It answers a
different question: *"is this content actually publishable?"*.

The two layers are intentionally independent:

| Layer | Module | Question | On failure |
|-------|--------|----------|------------|
| Structural | `08_validate_outputs` | Is the JSON shape correct? | Throws — pipeline fails |
| Editorial  | `08b_editorial_quality_check` | Is the content publishable? | Throws on **blocks**; attaches **warnings** otherwise |

The editorial layer **complements** the structural layer.  A payload may be
schema-valid but still unfit to publish (e.g. a 3-character headline, an
article with no source attribution, a YouTube title that does not mention the
topic).

---

## Pipeline placement

```
07 YouTube Metadata
        │
        ▼
08 Validate Outputs           — schema/shape checks; throws on missing fields
        │
        ▼
08b Editorial Quality Check   — editorial rules; throws on block-level issues,
        │                       attaches `editorial_quality_warnings`
        ▼
09 Publish to GitHub          — only ever runs on a clean editorial check
        │
        ▼
10 Update D1 State
```

The orchestrator wires `08b` between `08` and `09`.  It is invoked via
`$vars.DAILY_EDITORIAL_QUALITY_CHECK_WORKFLOW_ID` using the same
`Execute Workflow` pattern as every other daily module.

---

## Severity model

Every check resolves to one of two tiers.

### `blocks` — publish-blocking

The presence of even one block causes `08b` to **throw** and the orchestrator's
shared failure notifier (configured via `FAILURE_NOTIFIER_WORKFLOW_ID`) takes
over.  GitHub is never written for a blocked context.

### `warnings` — advisory only

Warnings are non-blocking.  They are collected into
`ctx.editorial_quality_warnings` (an array, or `null` if none).  The field is
forwarded into the publish context and written downstream so operators can
review near-misses without blocking the daily cadence.

This split intentionally mirrors how the optional media checks in
`08_validate_outputs` already separate `errors` from `*_warnings` arrays.

---

## Rule catalog

All thresholds are defined in `EDITORIAL_QUALITY_THRESHOLDS` inside
`app/src/utils/editorialQualityCheck.js` (defaults shown below).  Callers may
override any threshold via `runEditorialQualityChecks(ctx, { thresholds })` —
useful in CI dry-runs or per-topic tuning later.

### Block rules

| Rule | Condition | Default threshold |
|------|-----------|-------------------|
| Weak title — summary | `summary.headline` shorter than threshold | 20 chars |
| Weak summary | `summary.overview` shorter than threshold | 200 chars |
| Low-information — events | `summary.key_events.length` below threshold | 2 events |
| Low-information — article | `article_md` shorter than threshold | 500 chars |
| Low-information — paragraphs | `article_md` paragraph count below threshold | 3 paragraphs |
| Missing source attribution | No named source across `summary.sources`, `summary.key_events[].sources`, or `video_script.segments[].sources` | n/a |
| Inconsistent metadata — YT title | `youtube_metadata.title` shorter than threshold | 20 chars |
| Inconsistent metadata — YT description | `youtube_metadata.description` shorter than threshold | 200 chars |
| Inconsistent metadata — YT missing | `youtube_metadata` object missing | n/a |
| Overly confident unsupported language | A confident phrase (e.g. "guaranteed", "cannot fail", "sure thing") appears in summary/article/outlook **and** zero sources include a `source_url` | phrase set in `CONFIDENT_PHRASES` |

### Warning rules

| Rule | Condition |
|------|-----------|
| All-caps headline | `summary.headline` letters are all uppercase |
| Short overview | Overview between block and warn thresholds (200–350 chars) |
| Short article | Article between block and warn thresholds (500–800 chars) |
| Per-event sources missing | Any `summary.key_events[i]` has no `sources` |
| No source URLs | Named sources exist but none provide a `source_url` |
| All-caps YT title | `youtube_metadata.title` letters are all uppercase |
| Topic mismatch in YT title | `youtube_metadata.title` does not include `topic_slug` |
| Sparse YT tags | Fewer than 8 tags |
| Duplicate YT tags | Case-insensitive duplicates present |
| Thin tomorrow outlook | `tomorrow_outlook.outlook_summary` under 100 chars |
| Suspicious alignment score | `expectation_check.alignment_score` is exactly 0 or 100 |
| Confident language with sources | A confident phrase appears, but at least one source has a `source_url` (downgraded from block) |

The "confident language" rule deliberately couples severity to source
attribution: confident phrasing is acceptable when traceable to a cited URL,
but unacceptable when nothing in the payload supports it.

---

## Workflow integration

The n8n workflow (`workflows/n8n/daily/08b_editorial_quality_check.json`) is a
single Code node mirroring the canonical logic from
`app/src/utils/editorialQualityCheck.js`.  Keeping the rules duplicated inline
in the workflow follows the same convention used by other daily Code nodes
(such as `08_validate_outputs`) — it keeps the workflow self-contained and
copy-paste-importable into n8n without runtime dependencies on app code.

The shared utility remains the source of truth and is unit-tested
(`app/src/__tests__/utils/editorialQualityCheck.test.js`).  Any rule change
should be made there first and then mirrored into the workflow Code node.

### Output shape

On success the node returns the original context plus:

```json
{
  "editorial_quality_checked": true,
  "editorial_quality_warnings": ["…"] // or null when there are none
}
```

On failure the node throws:

```
Editorial quality block for crypto/2026-05-07 (2 block(s)):
- weak title: summary.headline shorter than 20 chars
- low-information: article_md shorter than 500 chars
```

The orchestrator's `errorWorkflow` setting forwards the throw to the standard
failure notifier alongside every other module failure — no special handling
required.

---

## Operational guidance

- **Tune over time, not in v1.** Defaults reflect deliberately conservative
  thresholds.  If a topic legitimately produces shorter content than the
  defaults allow, prefer adjusting `EDITORIAL_QUALITY_THRESHOLDS` (with
  matching updates to the Code node) rather than weakening the contract.
- **Treat warnings as a backlog, not noise.** Recurring warnings on the same
  topic (e.g. consistently sparse YouTube tags) usually indicate a prompt
  issue worth fixing in the relevant generator workflow.
- **Block list is intentionally short.** Schema validation already covers most
  structural safety; this gate exists to catch only the obvious editorial
  failure modes (no sources, weak titles, low-info articles, unsupported
  confident claims).

---

## Files

| Path | Purpose |
|------|---------|
| `app/src/utils/editorialQualityCheck.js` | Canonical rule logic |
| `app/src/__tests__/utils/editorialQualityCheck.test.js` | Unit tests |
| `workflows/n8n/daily/08b_editorial_quality_check.json` | n8n Code-node workflow (mirrors utility) |
| `workflows/n8n/daily/orchestrator.json` | Wires `08b` between `08` and `09` |

## Related

- `docs/architecture/daily-editorial-workflow.md` — full daily pipeline overview
- `docs/architecture/source-aware-prompting.md` — why source attribution is enforced
- `docs/architecture/daily-summary-source-attribution.md` — schema-side source contract
