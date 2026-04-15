# Source-Aware Prompting for OpenAI Content Tasks

## Overview

All OpenAI content tasks in this platform receive explicit source context as
part of their input. Prompts are designed to keep generated outputs grounded
in known, attributed sources rather than unsupported free-form claims.

This document covers:
- the source input contract for each AI task
- how trust tiers influence prompt wording and confidence
- safe handling rules for low-trust and uncertain source combinations
- per-task examples

---

## Source Input Contract

### Intraday — Alert Classification (module 05)

Each item passed to the classifier carries:

| Field | Type | Purpose |
|-------|------|---------|
| `source_name` | string | Human-readable source label |
| `source_type` | string | Technical category (rss, api, x_account, …) |
| `source_url` | string \| null | Canonical item URL |
| `trust_tier` | T1 \| T2 \| T3 \| T4 \| null | Source trust classification |
| `trust_score` | integer 0–100 \| null | Numeric trust score |
| `published_at` | ISO-8601 | Event timestamp |

The prompt instructs the AI to:
- adjust `confidence_score` downward based on trust tier
- use hedged wording in `summary_text` for T4/unknown sources
- populate `primary_source` from the input item context
- populate `supporting_sources` with up to 5 corroborating sources
- explain trust impact in `source_confidence_note`

### Daily — Summary Generation (module 02)

Each alert entry in the prompt includes:

```
[importance=88] Bitcoin Hits $120K — surged past $120,000... [source: CoinDesk RSS] [trust: T3/50]
```

A source quality note is also prepended to the prompt:

```
Source trust distribution: T1×2, T3×8, T4×3 (T1=Official, T2=Wire, T3=Specialist, T4=Signal/Social)
```

The AI uses this to calibrate summary wording and `source_confidence_note`.

### Daily — Article Generation (module 03)

The user prompt includes:

- key event sources (names only, not URLs)
- `source_confidence_note` from the upstream summary

The system prompt instructs the AI to:
- attribute claims naturally in prose when sources are named
- use hedged language when `source_confidence_note` indicates low-trust inputs
- never present T4/social-signal claims as established facts

### Daily — Expectation Check (module 04) and Tomorrow Outlook (module 05)

Both prompts include:

- key event sources (names) inline with each event
- `source_confidence_note` from the daily summary

These tasks produce source references in their output (e.g.
`expectations_checked[].source`, `key_watchpoints[].source`), which are
populated from the corroborating sources named in the input.

### Daily — Video Script (module 06)

The user prompt includes:

- key event sources inline
- `source_confidence_note` from the daily summary

The system prompt instructs the AI to:
- apply trust-appropriate spoken language per source tier
- use `segments[].sources` to record editorial grounding
- never read out source URLs verbatim in spoken content

---

## Trust Tier Handling Rules

These rules are shared across all AI tasks. Each task's system prompt
includes the relevant subset.

| Trust tier | Prompt wording guideline |
|------------|--------------------------|
| **T1 — Official** | Assert facts directly: *"The Federal Reserve confirmed…"* |
| **T2 — Wire** | Assert normally with natural attribution: *"Reuters reported…"* |
| **T3 — Specialist** | Include normally with optional attribution: *"According to CoinDesk…"* |
| **T4 — Signal/Social** | Use hedged wording: *"Reports suggest…", "Social signals indicate…", "According to unconfirmed sources…"* |
| **Unknown (null)** | Treat as T4. Use hedged wording. |

### Confidence adjustments (alert classification only)

| Trust tier | Confidence adjustment |
|------------|-----------------------|
| T1 | No reduction |
| T2 | No reduction |
| T3 | Reduce by 5–10 points |
| T4 | Reduce by ≥ 20 points |
| Unknown | Reduce by ≥ 25 points |

---

## Safe Handling of Uncertain Source Combinations

### All T4 / unknown sources

When all or most alerts come from T4 or unknown sources:

- Use conservative, hedged language throughout the summary overview
- Set `source_confidence_note` to explain the reduced confidence
- Do not issue high-confidence claims or strong directional statements
- `confidence_score` should reflect the reduced certainty (alert classification)

**Example `source_confidence_note`:**
> "Summary based primarily on social signals and unverified sources (T4). Claims should be treated as indicative rather than confirmed."

### Mixed trust tiers (T4 confirmed by T1/T2)

When a T4 claim is corroborated by a T1 or T2 source:

- Confidence may be raised toward the corroborating source's level
- The confirming source should be referenced as the attribution anchor
- `source_confidence_note` should document the corroboration

**Example:**
> "Initial signal from social sources was confirmed by Reuters (T2). Confidence raised accordingly."

### Single-source events

When only one source covers a topic:

- Note single-source dependency in `source_confidence_note`
- Use hedged language unless the sole source is T1 or T2
- Do not assert as widely confirmed fact

**Example:**
> "Reported by a single specialist outlet (T3). No wire or official confirmation available."

---

## Per-Task Examples

### Alert Classification — T4 source input

**Input context:**
```
Source: Whale Alert (X)
Source type: x_account
Trust tier: T4
Trust score: 25
```

**Expected AI output (relevant fields):**
```json
{
  "confidence_score": 45,
  "summary_text": "Reports suggest a large Bitcoin transfer from an unknown wallet to Binance, according to on-chain monitoring account Whale Alert. This has not been independently confirmed.",
  "send_alert": false,
  "source_confidence_note": "T4 source (social/signal). Confidence reduced by 25 points. Claim unverified; hedged wording applied."
}
```

### Alert Classification — T1 source input

**Input context:**
```
Source: BLS News RSS
Source type: rss
Trust tier: T1
Trust score: 90
```

**Expected AI output (relevant fields):**
```json
{
  "confidence_score": 95,
  "summary_text": "The US Bureau of Labor Statistics reported that the Consumer Price Index rose 0.3% in December on a seasonally adjusted basis.",
  "send_alert": true,
  "source_confidence_note": "T1 official source. High confidence. No reduction applied."
}
```

### Daily Summary — mixed trust distribution

**Input source quality note:**
```
Source trust distribution: T1×1, T3×5, T4×3
```

**Expected AI output (relevant fields):**
```json
{
  "source_confidence_note": "Summary draws from a mix of specialist outlets (T3) and a single official source (T1). Three social/signal alerts (T4) are included with hedged language. Overall confidence is moderate.",
  "overview": "Bitcoin surged past $120,000 on Thursday according to CoinDesk and market data APIs, setting a new all-time high. Several social-signal sources reported large wallet movements, though these claims have not been independently confirmed. Institutional inflows were confirmed by official ETF filing data."
}
```

### Video Script — T4 source segment

**Spoken script guidance:**
```
Reports suggest — based on on-chain monitoring signals — that a large Bitcoin transfer may have occurred. This hasn't been confirmed by official sources yet, so treat it as an early indicator rather than a confirmed event.
```

---

## Output Fields That Carry Source Attribution

| Task | Output fields |
|------|---------------|
| Alert classification | `primary_source`, `supporting_sources`, `source_confidence_note` |
| Timeline entry | `source_attribution`, `source_url` |
| Daily summary | `key_events[].sources`, `sources`, `source_confidence_note` |
| Expectation check | `expectations_checked[].source` |
| Tomorrow outlook | `key_watchpoints[].source`, `scheduled_events[].source` |
| Video script | `segments[].sources` |
| YouTube metadata | *(none — publishing metadata only)* |

---

## Validation

Source-field enforcement is task-specific rather than uniform across all AI
output types.

**What is validated today:**

| Task | Validated source fields |
|------|------------------------|
| Alert classification (`validateAlertClassification`) | `supporting_sources[].source_name` (non-empty string); `supporting_sources[].source_url` (HTTP/HTTPS or null); `supporting_sources[].source_type` (enum or null); `supporting_sources[].source_role` (enum or null) |
| Timeline entry (`validateTimelineEntry`) | `source_url` (HTTP/HTTPS or null); `source_attribution` (string length) |
| Expectation check (`validateExpectationCheck`) | `expectations_checked[].source.source_name` (non-empty string); `expectations_checked[].source.source_url` (HTTP/HTTPS or null) |
| Tomorrow outlook (`validateTomorrowOutlook`) | `key_watchpoints[].source.source_name` (non-empty string); `key_watchpoints[].source.source_url` (HTTP/HTTPS or null); `scheduled_events[].source.source_name`; `scheduled_events[].source.source_url` |
| Daily summary (`validateDailySummary`) | Core text/score fields only — `key_events[].sources` and top-level `sources` are **not** validated in the local CI helper |
| Video script (`validateVideoScript`) | Core structural fields only — `segments[].sources` are **not** validated in the local CI helper |

The n8n workflow Parse and Validate Code nodes apply additional normalization
at runtime (e.g., dropping entries with empty `source_name`, coercing invalid
`source_url` values to null, capping array lengths), so invalid entries are
gracefully degraded rather than causing workflow failures.

`source_type` and `source_role` for daily summary and video script source
arrays are schema-documented fields but are not enforced in current local CI
or workflow gate validators.

---

## See Also

- `docs/architecture/trust-scoring.md` — trust tier definitions and confidence adjustment rules
- `docs/architecture/source-aware-ai-schemas.md` — schema-by-schema source field reference
- `schemas/ai/` — canonical JSON schemas for all AI task outputs
- `workflows/contracts/` — input/output contracts for each n8n workflow module
