# Trust Scoring and Confirmation Rules

## Overview

This document defines the trust scoring model and confirmation rules that
determine how different source types influence alert confidence, publication
behavior, and summary wording. It is the single reference for trust-related
logic across the platform.

The trust model ensures the platform does not treat all sources equally and
handles low-trust signal sources safely. It supports alert workflows, AI
prompts, summary generation, and UI confidence display.

---

## Base Trust Scores by Source Type

Each source in the D1 `sources` table carries a `trust_tier` (coarse
classification) and a `trust_score` (0–100 numeric score for finer ranking).

| Trust tier | Name | Base trust score | Source examples |
|-----------|------|-----------------|-----------------|
| **T1** | Official | 90 | Government releases, central bank statements, regulatory filings, WHO/CDC/FDA advisories, on-chain data APIs |
| **T2** | Wire / Newswire | 75 | Reuters, AP, Bloomberg, Financial Times, BBC |
| **T3** | Specialist news | 50 | CoinDesk, Ars Technica, STAT News, S&P Global |
| **T4** | Signal / Social | 25 | X accounts, X keyword searches, Reddit, Telegram, Hacker News |

Trust scores are numeric (0–100). The trust tier is the coarse classification;
the trust score enables ordering within the same tier.

---

## Confidence Adjustment Rules

### Base confidence from trust tier

When the AI classification step (module 05) scores an item, the source's
trust tier should influence the `confidence_score`:

| Source trust tier | Confidence adjustment | Rationale |
|------------------|----------------------|-----------|
| T1 (Official) | No reduction | Ground truth. Highest inherent reliability. |
| T2 (Wire) | No reduction | Strong editorial standards. Near-primary trust. |
| T3 (Specialist) | Reduce by 5–10 points | Good domain depth but narrower editorial oversight. |
| T4 (Signal/Social) | Reduce by ≥ 20 points | Unverified. High noise. May indicate breaking events but cannot be treated as fact. |
| Unknown (null tier) | Reduce by ≥ 25 points | No registry match. Treat as less reliable than T4. |

These adjustments apply to the AI model's self-assessed confidence. The AI
prompt instructs the model to factor in the source tier when setting
`confidence_score`.

### Source combination confidence boosts

When multiple independent sources report the same event, confidence increases.
The boost depends on the trust tiers of the confirming sources:

| Combination | Confidence boost | Example |
|------------|-----------------|---------|
| T4 confirmed by T1 | +30 points (up to 95 max) | X account reports event → official agency confirms |
| T4 confirmed by T2 | +25 points (up to 90 max) | X keyword search flags story → Reuters covers it |
| T4 confirmed by T3 | +15 points (up to 80 max) | X account posts claim → specialist outlet reports |
| T3 confirmed by T1 | +15 points (up to 95 max) | CoinDesk reports → SEC filing confirms |
| T3 confirmed by T2 | +10 points (up to 90 max) | Specialist outlet → wire service covers |
| T3 confirmed by T3 | +5 points (up to 80 max) | Two independent specialist outlets report same event |
| T4 confirmed by T4 | +5 points (up to 60 max) | Two social signals converge — still low trust |

**Rules:**
- Boosts apply only when the confirming source is independent (different
  `source_slug`).
- Maximum `confidence_score` after boosts is 100.
- Boosts are calculated in the AI classification step or in a post-classification
  enrichment step when clustering detects multi-source convergence.

---

## Alert Publication Rules

### Per-topic T4 severity caps

T4 (Signal/Social) sources, including X accounts and X keyword searches, are
subject to per-topic severity caps. An alert sourced solely from T4 cannot
exceed the topic's severity cap regardless of the AI's raw assessment.

| Topic | T4 allowed? | T4 severity cap | T4 can trigger alert independently? | Confirmation required? |
|-------|:-----------:|:---------------:|:-----------------------------------:|:---------------------:|
| crypto | Yes | 60 | Yes (capped) | No (below cap) |
| ai | Yes | 50 | Yes (capped) | Recommended above 40 |
| finance | Watch only | 30 | No — watch flag only | Yes (always) |
| economy | Excluded | — | No — T4 excluded entirely | — |
| health | Excluded | — | No — T4 excluded entirely | — |
| energy | Yes | 50 | Confirmation only | Yes (geopolitical events) |

### Publication decision matrix

The alert decision module (module 06) uses these rules in addition to the
global thresholds (`ALERT_IMPORTANCE_THRESHOLD`, `ALERT_SEVERITY_THRESHOLD`,
`ALERT_CONFIDENCE_THRESHOLD`):

| Condition | Action |
|-----------|--------|
| T1/T2 source, passes global thresholds | Publish immediately |
| T3 source, passes global thresholds | Publish immediately (with tier noted) |
| T4 source, below topic severity cap, passes global thresholds | Publish with reduced severity |
| T4 source, above topic severity cap | Cap severity to topic limit; re-evaluate thresholds |
| T4 source, confirmation required by topic rules | Hold as `pending_confirmation`; publish only if confirmed within one ingestion cycle (≤ 15 min) |
| T4 source, topic excludes T4 (economy, health) | Reject — do not publish |
| Unknown source (null tier) | Treat as T4 with strictest rules; cap severity at 30 |

### Confirmation workflow

When an alert requires confirmation:

1. Module 06 marks the alert with `confirmation_status: 'pending'` in
   `metadata_json`.
2. The alert is persisted to D1 with `status: 'pending_confirmation'`.
3. On the next ingestion cycle, module 04 (clustering) checks if a T1–T3
   source has reported the same event cluster.
4. If confirmed, the alert's severity is re-evaluated using the confirming
   source's trust tier, `confirmation_status` is set to `'confirmed'`, and
   the alert proceeds to delivery.
5. If not confirmed within the configured window (default: 15 minutes),
   the alert remains at reduced severity and is either:
   - delivered at the capped severity (for topics that allow T4 alerts), or
   - archived with `status: 'unconfirmed'` (for topics requiring confirmation).

---

## Handling of Unconfirmed X/Social Signals

### X-specific rules

All X sources (`x_account` and `x_query`) are classified as T4 with a default
`trust_score` of 25. Additional rules:

| Rule | Detail |
|------|--------|
| Confidence reduction | When X is the sole source, reduce `confidence_score` by ≥ 20 points |
| Severity cap | Apply per-topic T4 severity cap (see table above) |
| Account vs. query | `x_account` monitoring known official accounts may receive +5 confidence vs. `x_query`, but both remain T4 |
| Metadata audit | X sources must carry `x_user_id` or `search_query` in `metadata_json` |

### Unconfirmed signal handling

| Signal state | Behavior |
|-------------|----------|
| Single T4 source, no confirmation | Publish at capped severity with hedged wording |
| Single T4 source, topic requires confirmation | Hold for one cycle; archive if unconfirmed |
| Multiple T4 sources converge | Small confidence boost (+5); still capped at topic severity limit |
| T4 confirmed by T1–T3 within cycle | Re-evaluate at confirming source tier; remove severity cap |

---

## Wording Guidance for Low-Confidence Cases

When `confidence_score` is below the thresholds defined here, AI prompts and
summary generation should apply hedged wording to avoid presenting unverified
claims as confirmed facts.

### Confidence thresholds for wording

| Confidence range | Wording style | Example prefixes |
|-----------------|--------------|-----------------|
| 80–100 | Factual, direct | "Bitcoin surged past…", "The Fed announced…" |
| 60–79 | Attributed, cautious | "According to [source]…", "[Source] reports that…" |
| 40–59 | Hedged, conditional | "Unconfirmed reports suggest…", "Social media signals indicate…" |
| 0–39 | Strongly hedged, flagged | "Unverified claim circulating on social media…", "⚠️ Low-confidence signal:" |

### AI prompt instructions for wording

The AI classification and summary generation prompts should include:

```
When confidence_score is below 60:
- Do NOT present the claim as established fact.
- Attribute the information to the specific source.
- Use hedging language: "reports suggest", "according to", "unconfirmed".

When confidence_score is below 40:
- Explicitly flag the item as unverified.
- Prefix the summary with a warning indicator.
- Do NOT recommend send_alert = true unless importance_score is very high (≥ 80).
```

### UI confidence display

When rendering alerts on the frontend timeline:

| Confidence range | Visual indicator | Display behavior |
|-----------------|-----------------|-----------------|
| 80–100 | No special indicator | Standard alert display |
| 60–79 | Source attribution shown prominently | Show source badge with tier |
| 40–59 | "Unconfirmed" badge | Show amber/warning source badge |
| 0–39 | "Unverified" badge with warning | Show red/danger source badge; consider collapsing by default |

---

## Source-Combination Examples

### Example 1: T4 → T2 confirmation (crypto)

1. **14:28 UTC** — Whale Alert (X, T4) posts: "🚨 1,500 BTC transferred to Binance"
   - AI classification: severity 45, importance 55, confidence 40
   - Module 06: severity within crypto T4 cap (60) → approved at severity 45
   - Alert delivered with hedged wording: "Social media signals indicate a large BTC transfer to Binance"

2. **14:35 UTC** — Reuters (T2) reports: "Large Bitcoin transfer detected as institutional activity rises"
   - Clustering matches same event cluster
   - Confirmation detected: T4 → T2 confirmation
   - Confidence boosted by +25 → confidence 65
   - Severity re-evaluated at T2 level → severity 60
   - Alert updated with factual wording: "Reuters reports a large Bitcoin transfer amid rising institutional activity"

### Example 2: T4 watch-only (finance)

1. **13:00 UTC** — X Search: Fed Decision (T4) detects chatter about FOMC rate hint
   - AI classification: severity 50, importance 70, confidence 35
   - Module 06: finance T4 severity cap is 30, confirmation required
   - Severity capped to 30, alert held with `status: 'pending_confirmation'`

2. **13:12 UTC** — Federal Reserve RSS (T1) publishes official statement
   - Clustering matches same event
   - Confirmation detected: T4 → T1 confirmation
   - Confidence boosted by +30 → confidence 65
   - Severity re-evaluated at T1 level → severity 75
   - Alert published with factual wording: "The Federal Reserve has signaled a potential rate adjustment"

### Example 3: T4 excluded (health)

1. **10:00 UTC** — X keyword search detects health claim
   - Module 06: health excludes T4 entirely
   - Alert rejected — not persisted, not delivered
   - No alert or summary generated from this source

### Example 4: T3 + T3 corroboration (ai)

1. **09:00 UTC** — Ars Technica (T3) reports new AI model release
   - AI classification: severity 55, importance 72, confidence 70
   - Module 06: passes all thresholds → approved

2. **09:10 UTC** — MIT Technology Review (T3) independently reports same release
   - Clustering matches same event
   - T3 + T3 corroboration: confidence boost +5 → confidence 75
   - Alert updated; stronger wording permitted

### Example 5: Unknown source

1. **11:00 UTC** — Item from unregistered source (null trust tier)
   - AI classification: confidence reduced by ≥ 25 points
   - Module 06: treated as T4 with strictest rules; severity capped at 30
   - If topic allows T4 and alert passes thresholds after cap, publish with heavy hedging
   - If topic excludes T4, reject

---

## Implementation Guidance

### Module 05 — AI Classification

The AI classification prompt receives `trust_tier` and `trust_score` from the
normalized item. The prompt should:

1. **Acknowledge the source tier** in its reasoning.
2. **Reduce `confidence_score`** according to the tier adjustment table above.
3. **Set `source_confidence_note`** explaining how source quality influenced
   the score.
4. **Apply hedged wording** in `summary_text` when confidence is low.

The trust context is passed in the user prompt:

```
Source: {{ source_name }}
Source type: {{ source_type || 'unknown' }}
Trust tier: {{ trust_tier || 'unknown' }}
Trust score: {{ trust_score || 'N/A' }}
```

### Module 06 — Alert Decision

Module 06 applies trust-aware rules after the AI classification:

1. **Read topic-specific T4 rules** from `config/trust-rules.json` or n8n
   variables.
2. **Enforce severity cap** for T4 sources based on the topic.
3. **Set confirmation status** when the topic requires confirmation for T4.
4. **Reject T4 items** for topics that exclude T4 (economy, health).
5. **Apply stricter thresholds** for unknown-tier sources.

### Daily Summary Generation

When generating daily summaries:

1. **Weight source contributions** by `trust_score` when ranking key events.
2. **Note source diversity** in `source_confidence_note` — summaries backed
   by multiple trust tiers are more reliable.
3. **Apply hedged wording** for events sourced only from T4 signals.
4. **Exclude or downweight** events that remained unconfirmed T4 signals
   throughout the day.

### Frontend Display

1. **SourceBadge component** should reflect trust tier with appropriate
   color coding (e.g., green for T1/T2, amber for T3, red for T4).
2. **Confidence indicators** should follow the UI confidence display table
   above.
3. **Unconfirmed alerts** should show a visual distinction (e.g., dashed
   border, "Unconfirmed" label).

---

## Machine-Readable Configuration

The trust rules are codified in `config/trust-rules.json` for use by n8n
workflows and validation logic. The config file contains:

- Base trust scores per tier
- Per-topic T4 policy (allowed, severity cap, confirmation requirements)
- Confidence adjustment rules
- Wording threshold definitions

See `config/trust-rules.json` for the complete machine-readable specification.

---

## Cross-References

- Source strategy and per-topic rules: `docs/source-strategy.md`
- X source lists and trust rules: `docs/x-source-rules.md`
- Source registry data model: `docs/data-model/source-registry.md`
- AI classification schema: `schemas/ai/alert_classification.json`
- Classified alert contract: `workflows/contracts/intraday_classified_alert.json`
- Source item contract: `workflows/contracts/intraday_source_item.json`
- Machine-readable trust config: `config/trust-rules.json`
- Module 05 workflow: `workflows/n8n/intraday/05_ai_classification.json`
- Module 06 workflow: `workflows/n8n/intraday/06_alert_decision.json`
