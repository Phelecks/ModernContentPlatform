# Alert Classification Flow — Architecture

## Overview

Module 05 (`05_ai_classification.json`) uses OpenAI to classify incoming
normalized source items into structured alert objects. It is the AI backbone
of the intraday pipeline, converting raw news/data signals into scored,
topic-tagged, and summary-enriched outputs ready for the alert decision step.

The flow is designed to:
- classify every non-duplicate, clustered item with a single OpenAI call
- return structured JSON that matches `schemas/ai/alert_classification.json`
- propagate source trust context to calibrate confidence scores
- extract supporting sources and compute source domain for rich attribution
- fall back gracefully when the AI returns malformed output

---

## Position in the pipeline

```
04 Clustering  →  [05 AI Classification]  →  06 Alert Decision
```

**Input contract:** `workflows/contracts/intraday_normalized_item.json`
(clustered items array; `is_duplicate: false` items only)

**Output contract:** `workflows/contracts/intraday_classified_alert.json`
(classified alerts array; consumed by module 06–09)

---

## Workflow nodes

| Node | Type | Purpose |
|------|------|---------|
| Execute Workflow Trigger | Trigger | Accepts `{ items: [] }` from orchestrator |
| Expand Items | Code | Expands items array into per-item stream |
| Classify with AI | OpenAI | Sends classification prompt; returns JSON |
| Parse and Validate AI Output | Code | Parses AI JSON, validates, extracts fields |
| Collect Output | Code | Re-collects items into `{ items: [] }` |

---

## OpenAI prompt

### System prompt role

The system prompt positions the model as a financial and technology news
classifier and instructs it to return a single JSON object matching the
`alert_classification` schema. Key instructions in the system prompt:

1. **Topic assignment** — assign one primary `topic_slug` and up to two
   `secondary_topics` from the canonical topic list:
   `crypto | finance | economy | health | ai | energy | technology`

2. **Score generation** — produce three integer scores (0–100):
   - `importance_score` — how broadly relevant the event is to the primary
     topic audience (`0` = noise, `100` = must-know)
   - `severity_score` — how urgent or disruptive the event is (`0` = no
     impact, `100` = extreme disruption)
   - `confidence_score` — model's confidence in the classification, adjusted
     for source trust tier

3. **Alert recommendation** — `send_alert: true` when
   `importance_score >= 60` AND `severity_score >= 50`

4. **Headline and summary generation** — a clean factual `headline` (max 250
   chars) and a 1–2 sentence `summary_text` (max 500 chars) suitable for the
   timeline. Hedged wording applies when `confidence_score < 60`.

5. **Source trust rules** — the system prompt encodes the full trust-tier
   confidence adjustment rules:
   - T1/T2: no reduction
   - T3: reduce by 5–10 points
   - T4: reduce by ≥ 20 points
   - Unknown: reduce by ≥ 25 points
   
   When confidence is below 40, `send_alert` must be `false` unless
   `importance_score >= 80`.

6. **`source_confidence_note`** — a brief explanation (max 300 chars) of how
   the source tier influenced the confidence score.

7. **`cluster_label`** — a short cluster label (max 100 chars) or `null`.
   Uses the existing cluster hint if provided by module 04.

### User prompt context

The user prompt passes per-item context to the model:

```
Headline: <item headline>
Body: <item body or "(no body)">
Source: <source_name>
Source type: <source_type or "unknown">
Author: <author or "(unknown)">
Source URL: <source_url or "(none)">
Trust tier: <trust_tier or "unknown"> (T1=Official, T2=Wire, T3=Specialist, T4=Signal/Social)
Trust score: <trust_score or "N/A"> (0-100, higher=more trusted)
Topic candidates from keyword matching: <topic_candidates list or "none">
Existing cluster hint: <cluster_label or "none">
Published at: <published_at>
```

The `author` and `source_url` fields are new additions that improve source
attribution context for the model, particularly for X/social sources where
author identity is relevant to trust assessment.

### Model configuration

| Setting | Value |
|---------|-------|
| Model | `$vars.AI_MODEL_FAST` (default `gpt-4o-mini`) |
| Temperature | `0.1` |
| Max tokens | `400` |
| Response format | `json_object` |
| Retry on fail | Yes — 3 attempts, 5 s between tries |

---

## Output processing

The Parse and Validate AI Output node:

1. **Strips markdown code fences** from the raw API response, then parses JSON.
2. **Falls back to a zero-score object** when JSON parsing fails, with
   `send_alert: false` and an explanatory `alert_reason`.
3. **Validates and coerces** required fields:
   - `topic_slug` is coerced to the first `topic_candidates` entry or
     `'technology'` when invalid.
   - Scores are clamped to `[0, 100]` and rounded to integers.
   - `secondary_topics` are filtered to the valid topic list (max 2).
   - `send_alert` defaults to `false` when not a boolean.
4. **Extracts `source_domain`** from `source_url` using the URL API (hostname
   only, HTTP/HTTPS schemes only; `null` on failure or non-HTTP scheme).
5. **Validates and normalises `supporting_sources`** from the AI output:
   - Only HTTP/HTTPS `source_url` values are accepted; others are `null`.
   - `source_type` is validated against the canonical source type list.
   - `source_role` is validated against `confirmation | data | commentary | official`.
   - At most 5 supporting sources are kept.
   - Invalid entries are silently dropped; the result is `null` when no
     valid entries remain.
6. **Propagates source fields** from the normalized item (not from AI
   output): `source_url`, `source_name`, `source_type`, `trust_tier`,
   `trust_score`.

The final output per item includes all fields required by
`intraday_classified_alert.json`:

```
item_id, topic_slug, secondary_topics, headline, summary_text,
source_url, source_name, source_type, source_domain, supporting_sources,
trust_tier, trust_score, severity_score, importance_score, confidence_score,
send_alert, alert_reason, event_at, cluster_label, source_confidence_note
```

---

## Finance and Crypto scenarios

### Finance — Fed rate signal (T1 source)

**Input (normalized item):**
```json
{
  "item_id": "f2b3c4d5...",
  "source_name": "Federal Reserve RSS",
  "source_type": "rss",
  "source_url": "https://www.federalreserve.gov/newsevents/pressreleases/monetary20250115a.htm",
  "headline": "FOMC Minutes: Officials See No Urgency to Cut Rates in Q1 2025",
  "body": "Minutes from the December FOMC meeting showed officials broadly agreed there was no reason to lower the federal funds rate until inflation data showed sustained progress toward the 2% target.",
  "author": null,
  "topic_candidates": ["finance", "economy"],
  "trust_tier": "T1",
  "trust_score": 90,
  "published_at": "2025-01-15T19:00:00Z"
}
```

**Expected AI output:**
```json
{
  "topic_slug": "finance",
  "secondary_topics": ["economy"],
  "headline": "Fed Minutes: No Rush to Cut Rates in Q1 2025",
  "summary_text": "Minutes from the December FOMC meeting show Federal Reserve officials broadly agreed there was no urgency to lower the federal funds rate until inflation data showed sustained progress toward the 2% target.",
  "severity_score": 70,
  "importance_score": 90,
  "confidence_score": 95,
  "send_alert": true,
  "alert_reason": "Official FOMC minutes directly setting rate expectations is a high-importance event for finance audiences.",
  "cluster_label": "Fed Rate Decision",
  "source_confidence_note": "T1 official source — no confidence reduction applied.",
  "supporting_sources": null
}
```

**Expected classified alert output:**
```json
{
  "item_id": "f2b3c4d5...",
  "topic_slug": "finance",
  "secondary_topics": ["economy"],
  "headline": "Fed Minutes: No Rush to Cut Rates in Q1 2025",
  "summary_text": "Minutes from the December FOMC meeting show Federal Reserve officials broadly agreed there was no urgency to lower the federal funds rate until inflation data showed sustained progress toward the 2% target.",
  "source_url": "https://www.federalreserve.gov/newsevents/pressreleases/monetary20250115a.htm",
  "source_name": "Federal Reserve RSS",
  "source_type": "rss",
  "source_domain": "www.federalreserve.gov",
  "supporting_sources": null,
  "trust_tier": "T1",
  "trust_score": 90,
  "severity_score": 70,
  "importance_score": 90,
  "confidence_score": 95,
  "send_alert": true,
  "alert_reason": "Official FOMC minutes directly setting rate expectations is a high-importance event for finance audiences.",
  "event_at": "2025-01-15T19:00:00Z",
  "cluster_label": "Fed Rate Decision",
  "source_confidence_note": "T1 official source — no confidence reduction applied."
}
```

---

### Finance — T4 social signal (watch-only, confirmation required)

**Input (normalized item):**
```json
{
  "item_id": "a1b2c3d4...",
  "source_name": "X Search: Fed Decision",
  "source_type": "x_query",
  "source_url": "https://x.com/search?q=fed+rate+decision",
  "headline": "Social chatter surges around FOMC rate hint",
  "body": null,
  "author": null,
  "topic_candidates": ["finance"],
  "trust_tier": "T4",
  "trust_score": 25,
  "published_at": "2025-01-15T13:00:00Z"
}
```

**Expected AI output (with trust reduction):**
```json
{
  "topic_slug": "finance",
  "secondary_topics": [],
  "headline": "Social Media Signals Surge Around Possible FOMC Rate Hint",
  "summary_text": "Unconfirmed social media activity suggests increased discussion around a possible Federal Reserve rate signal. Reports are unverified and sourced solely from X keyword monitoring.",
  "severity_score": 50,
  "importance_score": 65,
  "confidence_score": 30,
  "send_alert": false,
  "alert_reason": "T4 source with confidence below threshold; finance topic requires confirmation before alerting.",
  "cluster_label": "Fed Rate Decision",
  "source_confidence_note": "T4 signal source — confidence reduced by 25 points vs T1/T2; hedged wording applied.",
  "supporting_sources": null
}
```

> **Note:** Module 06 (alert decision) evaluates the raw `severity_score` (50)
> against the finance T4 severity cap (30). The item enters
> `pending_confirmation` queue. If a T1/T2 source confirms within 15 minutes,
> the alert is promoted. See `docs/architecture/trust-scoring.md` for details.

---

### Crypto — specialist outlet with data corroboration (T3 + API)

**Input (normalized item):**
```json
{
  "item_id": "c1a2b3d4...",
  "source_name": "CoinDesk RSS",
  "source_type": "rss",
  "source_url": "https://www.coindesk.com/markets/2025/01/15/bitcoin-hits-new-ath/",
  "headline": "Bitcoin Hits New All-Time High Above $120K",
  "body": "Bitcoin surged past $120,000 on Wednesday, setting a new all-time high as institutional demand continued to rise. Spot ETF inflows contributed to the move.",
  "author": "Omkar Godbole",
  "topic_candidates": ["crypto", "finance"],
  "trust_tier": "T3",
  "trust_score": 50,
  "published_at": "2025-01-15T14:32:00Z"
}
```

**Expected AI output:**
```json
{
  "topic_slug": "crypto",
  "secondary_topics": ["finance"],
  "headline": "Bitcoin Hits New All-Time High Above $120K",
  "summary_text": "Bitcoin surged past $120,000 on Wednesday, setting a new all-time high as institutional demand and record spot ETF inflows drove the move, according to CoinDesk.",
  "severity_score": 72,
  "importance_score": 88,
  "confidence_score": 87,
  "send_alert": true,
  "alert_reason": "New all-time high is a high-importance milestone for the crypto audience.",
  "cluster_label": "Bitcoin price rally",
  "source_confidence_note": "T3 specialist source — confidence reduced by 8 points; attribution wording added to summary.",
  "supporting_sources": [
    {
      "source_name": "CoinGecko API",
      "source_url": "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
      "source_type": "api",
      "source_role": "data"
    }
  ]
}
```

**Expected classified alert output:**
```json
{
  "item_id": "c1a2b3d4...",
  "topic_slug": "crypto",
  "secondary_topics": ["finance"],
  "headline": "Bitcoin Hits New All-Time High Above $120K",
  "summary_text": "Bitcoin surged past $120,000 on Wednesday, setting a new all-time high as institutional demand and record spot ETF inflows drove the move, according to CoinDesk.",
  "source_url": "https://www.coindesk.com/markets/2025/01/15/bitcoin-hits-new-ath/",
  "source_name": "CoinDesk RSS",
  "source_type": "rss",
  "source_domain": "www.coindesk.com",
  "supporting_sources": [
    {
      "source_name": "CoinGecko API",
      "source_url": "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
      "source_type": "api",
      "source_role": "data"
    }
  ],
  "trust_tier": "T3",
  "trust_score": 50,
  "severity_score": 72,
  "importance_score": 88,
  "confidence_score": 87,
  "send_alert": true,
  "alert_reason": "New all-time high is a high-importance milestone for the crypto audience.",
  "event_at": "2025-01-15T14:32:00Z",
  "cluster_label": "Bitcoin price rally",
  "source_confidence_note": "T3 specialist source — confidence reduced by 8 points; attribution wording added to summary."
}
```

---

### Crypto — X/social signal (T4, below threshold)

**Input (normalized item):**
```json
{
  "item_id": "e0f1a2b3...",
  "source_name": "Whale Alert (X)",
  "source_type": "x_account",
  "source_url": "https://x.com/i/status/1879012345678901234",
  "headline": "🚨 1,500 #BTC (183,200,000 USD) transferred from unknown wallet to #Binance",
  "body": null,
  "author": "@whale_alert",
  "topic_candidates": ["crypto"],
  "trust_tier": "T4",
  "trust_score": 25,
  "published_at": "2025-01-15T14:28:00Z"
}
```

**Expected AI output:**
```json
{
  "topic_slug": "crypto",
  "secondary_topics": [],
  "headline": "Large BTC Transfer to Binance Flagged by Whale Alert",
  "summary_text": "Social media signals indicate a transfer of approximately 1,500 BTC (around $183M) from an unknown wallet to Binance, according to the @whale_alert account on X. The move is unconfirmed.",
  "severity_score": 45,
  "importance_score": 55,
  "confidence_score": 38,
  "send_alert": false,
  "alert_reason": "T4 source with low confidence; significance below threshold without confirmation.",
  "cluster_label": null,
  "source_confidence_note": "T4 X account source — confidence reduced by 22 points; hedged wording and source attribution applied.",
  "supporting_sources": null
}
```

> **Note:** `send_alert` is `false` because `confidence_score < 40` and
> `importance_score < 80`. Module 06 will evaluate the item against per-topic
> T4 rules (crypto T4 severity cap is 60; this item is within cap).

---

## Integration notes

### Flow position

Module 05 is called by the orchestrator after module 04 (clustering) and
before module 06 (alert decision). It receives a `{ items: [] }` payload and
returns a `{ items: [] }` payload of classified alerts.

### Error handling

- **AI parse failure:** The node catches JSON parse errors and returns a
  zero-score fallback object with `send_alert: false`. The item is not
  discarded — it flows into module 06 where it will fail the importance and
  severity thresholds and be excluded from delivery naturally.
- **OpenAI API failure:** The node is configured with `retryOnFail: true`,
  3 attempts, 5 s between tries. If all retries fail, the workflow error
  handler (`failure_notifier`) is invoked.

### Source attribution propagation

Source fields (`source_url`, `source_name`, `source_type`, `trust_tier`,
`trust_score`) are always taken from the **normalized item**, not from the
AI output. This ensures source provenance is never fabricated by the model.

The AI output contributes:
- `topic_slug`, `secondary_topics` — classification decisions
- `headline`, `summary_text` — refined editorial text
- `severity_score`, `importance_score`, `confidence_score` — scoring
- `send_alert`, `alert_reason` — alert recommendation
- `cluster_label` — event cluster association
- `source_confidence_note` — trust-calibration explanation
- `supporting_sources` — optional corroborating source references (validated)

### `source_domain` extraction

The `source_domain` field is derived from `source_url` in the Parse and
Validate node using the standard URL API. Only `http://` and `https://`
scheme URLs yield a domain; all other cases produce `null`. This field is
used by the frontend's `SourceBadge` component and the `AlertTimelineItem`
component for display.

### `supporting_sources` validation

The `supporting_sources` array from the AI output is validated before
inclusion in the classified alert:

- Non-HTTP/HTTPS `source_url` values are set to `null`.
- `source_type` must be one of: `rss | api | social | webhook | x_account | x_query`.
- `source_role` must be one of: `confirmation | data | commentary | official | null`.
- Invalid entries are silently dropped; at most 5 entries are kept.
- The field is `null` when the AI provides no valid supporting sources.

### Model selection

The workflow reads the model from `$vars.AI_MODEL_FAST` (n8n variable) with a
hard-coded fallback of `gpt-4o-mini`. To use a different model, update the
`AI_MODEL_FAST` variable in n8n Settings → Variables. No workflow JSON edits
are needed.

Per-task model overrides (`OPENAI_MODEL_ALERT_CLASSIFICATION`) are also
available via environment variables and the `parseOpenAIConfig` utility — see
`app/src/utils/openaiConfig.js` and `docs/architecture/ai-provider.md`.

---

## Cross-references

- AI classification schema: `schemas/ai/alert_classification.json`
- Classified alert contract: `workflows/contracts/intraday_classified_alert.json`
- Normalized item contract: `workflows/contracts/intraday_normalized_item.json`
- Module 05 workflow: `workflows/n8n/intraday/05_ai_classification.json`
- Module 06 workflow: `workflows/n8n/intraday/06_alert_decision.json`
- Trust scoring rules: `docs/architecture/trust-scoring.md`
- AI provider setup: `docs/architecture/ai-provider.md`
- AI output validation utility: `app/src/utils/validateAiOutput.js`
- OpenAI config utility: `app/src/utils/openaiConfig.js`
- Finance classified alert fixture: `fixtures/classified-alerts/finance-2025-01-15.json`
- Crypto classified alert fixture: `fixtures/classified-alerts/crypto-2025-01-15.json`
