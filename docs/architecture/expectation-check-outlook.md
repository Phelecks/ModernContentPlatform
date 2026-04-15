# Expectation Check and Tomorrow Outlook — Architecture

## Overview

Two AI-powered tasks run as part of the daily editorial workflow to provide
structured context around what happened today and what may matter tomorrow:

- **Expectation check** — compares the day's actual events against prior
  market and topic expectations; highlights surprises and scores alignment
- **Tomorrow outlook** — produces forward-looking watchpoints and known
  scheduled catalysts; provides a grounded outlook summary and a risk level

Both tasks run after the daily summary is generated and before outputs are
validated and published to GitHub. They are topic-agnostic by design and work
across all supported topics (crypto, finance, economy, health, AI, energy,
technology).

---

## Workflow position

```
02 Generate Summary
        │
        ▼
03 Generate Article
        │
        ▼
04 Expectation Check   ← this task
        │
        ▼
05 Tomorrow Outlook    ← this task
        │
        ▼
06–07 Video Script / YouTube Metadata
        │
        ▼
08 Validate Outputs
        │
        ▼
09 Publish to GitHub   → summary.json includes expectation_check + tomorrow_outlook
```

Both outputs are embedded in `content/topics/{topic}/{date}/summary.json`
alongside the daily summary, and are available to the Vue frontend for
rendering on the topic/day page.

---

## Module definitions

### 04 — Generate Expectation Check

| Property | Value |
|----------|-------|
| Workflow | `workflows/n8n/daily/04_generate_expectation_check.json` |
| Trigger | Execute Workflow (called by orchestrator) |
| Input | Full context from previous modules — includes `topic_slug`, `date_key`, `summary` object |
| AI model | `$vars.AI_MODEL_STANDARD` (default: `gpt-4o`) |
| Temperature | 0.2 |
| Output format | `json_object` |
| Max tokens | 700 |
| Retries | 3 attempts, 5s wait |
| Output field | `expectation_check` merged into context |

**What it does:**
- Infers 2–4 prior expectations that a reasonable observer would have had for
  the topic on the given date, based on common knowledge
- Checks each expectation against the actual day's events from the summary
- Classifies each as `met`, `missed`, or `partial`
- Lists 0–3 surprise events that were not anticipated
- Assigns an `alignment_score` (0–100) indicating how well the day aligned
  with expectations
- Optionally adds an `analyst_note` synthesising the findings
- Where a source from the input supports an outcome assessment, the AI
  populates the `source` field; otherwise `null`

**Editorial safety:**
The system prompt instructs the AI to use hedged language (`appears to have`,
`suggests`, `may indicate`) and to base all claims on the provided summary
and sources only. The AI must not introduce information not present in the
input.

---

### 05 — Generate Tomorrow Outlook

| Property | Value |
|----------|-------|
| Workflow | `workflows/n8n/daily/05_generate_tomorrow_outlook.json` |
| Trigger | Execute Workflow (called by orchestrator) |
| Input | Full context including `topic_slug`, `date_key`, `summary` object with key events |
| AI model | `$vars.AI_MODEL_STANDARD` (default: `gpt-4o`) |
| Temperature | 0.2 |
| Output format | `json_object` |
| Max tokens | 700 |
| Retries | 3 attempts, 5s wait |
| Output field | `tomorrow_outlook` merged into context |

**What it does:**
- Produces 2–5 concrete watchpoints for tomorrow, grounded in today's developments
- Lists 0–5 known scheduled events (macro releases, Fed speeches, corporate
  events) with time hints and expected impact levels
- Generates a 2–4 sentence forward-looking summary with hedged, grounded language
- Assigns a `risk_level` (`low`, `medium`, `high`) based on the day's backdrop
  and tomorrow's scheduled catalysts
- Where a source from the input supports a watchpoint or scheduled event, the
  AI populates the `source` field; otherwise `null`

**Editorial safety:**
The prompt explicitly instructs the AI to use hedged language (`may`, `could`,
`suggests`) and to avoid asserting predictions as certainties. Scheduled events
must only be included when the AI is confident they are real and grounded in
the input context.

---

## Output schemas

| Schema | Location |
|--------|----------|
| Expectation check | `schemas/ai/expectation_check.json` |
| Tomorrow outlook | `schemas/ai/tomorrow_outlook.json` |

### Expectation check schema summary

```json
{
  "expectations_checked": [
    {
      "expectation": "string (10–200 chars)",
      "outcome": "met | missed | partial",
      "note": "string (max 300 chars) | null",
      "source": { "source_name": "string", "source_url": "URL | null" } | null
    }
  ],
  "surprise_events": ["string (10–200 chars)"],
  "alignment_score": 0–100,
  "analyst_note": "string (max 400 chars) | null"
}
```

- `expectations_checked`: 0–5 items
- `surprise_events`: 0–5 items
- `alignment_score`: 0 = completely unexpected day; 100 = day went exactly as anticipated
- `analyst_note`: optional synthesis paragraph; `null` when not needed

### Tomorrow outlook schema summary

```json
{
  "key_watchpoints": [
    {
      "title": "string (5–100 chars)",
      "description": "string (20–300 chars)",
      "source": { "source_name": "string", "source_url": "URL | null" } | null
    }
  ],
  "scheduled_events": [
    {
      "title": "string (5–150 chars)",
      "time_hint": "string (max 50 chars) | null",
      "impact": "high | medium | low",
      "source": { "source_name": "string", "source_url": "URL | null" } | null
    }
  ],
  "outlook_summary": "string (50–600 chars)",
  "risk_level": "low | medium | high"
}
```

- `key_watchpoints`: 1–5 items (required non-empty)
- `scheduled_events`: 0–5 items
- `outlook_summary`: 2–4 sentence forward-looking narrative
- `risk_level`: overall perceived uncertainty for tomorrow

---

## Source-aware framing

Both tasks support optional source references at the item level. When the daily
summary includes `key_events[].sources`, those source names are passed to the AI
in the user prompt. The AI can then reference them when populating the `source`
field on individual expectation outcomes and watchpoints.

Source fields follow the same minimal shape used by other daily AI schemas:

```json
{
  "source_name": "Reuters Markets",
  "source_url": "https://..."
}
```

Sources are optional (`null` when no specific source applies). The AI is
instructed not to fabricate source names or URLs.

---

## Validation

### JavaScript validator (`validateAiOutput.js`)

```js
import {
  validateExpectationCheck,
  validateTomorrowOutlook,
  parseAndValidateExpectationCheck,
  parseAndValidateTomorrowOutlook,
} from '@/utils/validateAiOutput.js'
```

Both validators:
- Accept a parsed object and return `{ ok: boolean, errors: string[] }`
- Never throw — callers handle validation failures
- Validate optional source fields when present (checks `source_name` is a
  non-empty string, `source_url` is HTTP/HTTPS when not null)

The `parseAndValidate*` wrappers parse the raw AI string and then validate.
They throw `AI_PARSE_ERROR` or `AI_VALIDATION_ERROR` on failure.

### n8n validation gate (module 08)

Module 08 (`08_validate_outputs.json`) checks both objects as part of the
full pre-publish validation pass. It verifies:
- Required fields are present (`expectations_checked`, `surprise_events`,
  `alignment_score`, `key_watchpoints`, `outlook_summary`, `risk_level`)
- Source names are non-empty strings when source objects are present
- Throws on any failure to prevent invalid content from reaching GitHub

---

## GitHub publishing

Both outputs are merged into `summary.json` by module 09:

```json
{
  "topic_slug": "finance",
  "date_key": "2025-01-16",
  "generated_at": "...",
  "headline": "...",
  "overview": "...",
  "key_events": [...],
  "sentiment": "bearish",
  "topic_score": 58,
  "expectation_check": { ... },
  "tomorrow_outlook": { ... }
}
```

File path: `content/topics/{topic_slug}/{date_key}/summary.json`

The `expectation_check` and `tomorrow_outlook` objects are available to the
Vue frontend via the content API.

---

## Example outputs

### Expectation check — Finance

```json
{
  "expectations_checked": [
    {
      "expectation": "US CPI to print close to the 2.9% consensus estimate",
      "outcome": "missed",
      "note": "CPI came in at 3.1%, above the 2.9% consensus, suggesting disinflation may be stalling at the margin.",
      "source": {
        "source_name": "Bureau of Labor Statistics",
        "source_url": "https://www.bls.gov/cpi/"
      }
    },
    {
      "expectation": "Equity markets to hold gains ahead of the CPI release",
      "outcome": "partial",
      "note": "Markets traded cautiously in the morning session and sold off modestly after the print, though losses appeared contained.",
      "source": {
        "source_name": "Reuters Markets",
        "source_url": null
      }
    },
    {
      "expectation": "Fed officials to reiterate a data-dependent stance",
      "outcome": "met",
      "note": "Two Fed speakers maintained their cautious tone, with no surprise pivot signals.",
      "source": null
    }
  ],
  "surprise_events": [
    "Services inflation re-accelerated to 4.4%, well above the prior month's reading, catching many analysts off guard.",
    "The US dollar surged 0.8% intraday — an unusually sharp move for a single CPI release."
  ],
  "alignment_score": 42,
  "analyst_note": "The above-consensus CPI print introduced meaningful uncertainty around the Fed's rate path. While equity resilience suggests markets may be pricing a transitory effect, the services re-acceleration could warrant caution in the near term."
}
```

### Tomorrow outlook — Finance

```json
{
  "key_watchpoints": [
    {
      "title": "Fed Chair Speech — Rate Guidance Tone",
      "description": "After a hotter-than-expected CPI print, Chair Powell's remarks tomorrow could move markets materially if he signals a shift in rate-cut timing.",
      "source": {
        "source_name": "Federal Reserve",
        "source_url": "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm"
      }
    },
    {
      "title": "US 10-Year Yield Direction",
      "description": "The 10-year yield rose sharply after the CPI beat. Whether it holds above 4.5% may influence equity valuations, particularly in rate-sensitive sectors.",
      "source": {
        "source_name": "Reuters Markets",
        "source_url": null
      }
    }
  ],
  "scheduled_events": [
    {
      "title": "Fed Chair Powell Speech",
      "time_hint": "10:00 ET",
      "impact": "high",
      "source": {
        "source_name": "Federal Reserve",
        "source_url": "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm"
      }
    },
    {
      "title": "US Retail Sales (December)",
      "time_hint": "08:30 ET",
      "impact": "medium",
      "source": null
    }
  ],
  "outlook_summary": "Markets may remain cautious ahead of the Fed Chair's speech, with the hotter CPI print raising questions about the pace of rate cuts. Treasury yields and the US dollar could see continued volatility. Retail sales data may offer additional clues on consumer resilience, though the primary focus is likely to remain on Fed communication.",
  "risk_level": "high"
}
```

### Expectation check — Crypto

```json
{
  "expectations_checked": [
    {
      "expectation": "Bitcoin would test resistance near $115K before moving higher",
      "outcome": "missed",
      "note": "Bitcoin broke through $115K with minimal resistance, suggesting stronger buying pressure than anticipated.",
      "source": {
        "source_name": "CoinGecko API",
        "source_url": "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd"
      }
    },
    {
      "expectation": "Spot ETF inflows to remain steady above $800M",
      "outcome": "met",
      "note": "Inflows reached $1.5B, exceeding the expectation by a wide margin.",
      "source": {
        "source_name": "Bloomberg",
        "source_url": "https://www.bloomberg.com/news/articles/2025-01-15/bitcoin-etf-inflows"
      }
    }
  ],
  "surprise_events": [
    "A major sovereign wealth fund disclosed a $2B Bitcoin allocation, which was not rumoured beforehand.",
    "Ethereum underperformed despite the bullish crypto environment, diverging from usual correlation."
  ],
  "alignment_score": 65,
  "analyst_note": "Today's session appears broadly in line with the bullish bias anticipated, though the magnitude of the move and the sovereign disclosure exceeded what most observers would have forecast."
}
```

### Tomorrow outlook — Crypto

```json
{
  "key_watchpoints": [
    {
      "title": "Bitcoin $120K Support Hold",
      "description": "After breaking above $120K, holding this level as support is critical for continued momentum. A failure to hold could trigger a pullback to $115K.",
      "source": {
        "source_name": "CoinDesk RSS",
        "source_url": "https://www.coindesk.com/markets/2025/01/15/bitcoin-hits-new-ath/"
      }
    },
    {
      "title": "Spot ETF Flow Continuation",
      "description": "Sustained inflows above $1B would confirm institutional conviction. A reversal below $500M could dampen sentiment.",
      "source": {
        "source_name": "Bloomberg",
        "source_url": "https://www.bloomberg.com/news/articles/2025-01-15/bitcoin-etf-inflows"
      }
    }
  ],
  "scheduled_events": [
    {
      "title": "FOMC Meeting Minutes Release",
      "time_hint": "14:00 ET",
      "impact": "high",
      "source": {
        "source_name": "Federal Reserve",
        "source_url": "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm"
      }
    }
  ],
  "outlook_summary": "Bitcoin enters Friday's session at all-time highs with strong momentum. The key risk tomorrow is macro: the FOMC minutes could introduce volatility if language around rate cuts shifts. ETF flows will be closely watched for any sign of profit-taking by institutional players.",
  "risk_level": "medium"
}
```

---

## Editorial safety guidelines

Both tasks are designed to be cautious and editorially safe:

| Principle | How it is enforced |
|-----------|-------------------|
| Avoid false certainty | System prompt requires hedged language (`may`, `could`, `suggests`, `appears to`) |
| Ground claims in input | Prompt instructs AI not to introduce information absent from the provided summary |
| No fabricated sources | Source fields are optional; AI sets them to `null` when no specific source applies |
| Conservative temperature | Temperature 0.2 reduces hallucination and narrative drift |
| Structural validation | Module 08 rejects any output that doesn't meet schema requirements before publishing |
| Re-run safety | Workflow is idempotent; re-running for the same topic/date produces a fresh but consistent output |

---

## Configuration

Both tasks use the `AI_MODEL_STANDARD` n8n variable (`gpt-4o` by default). The
`OPENAI_MODEL_EXPECTATION_CHECK` and `OPENAI_MODEL_TOMORROW_OUTLOOK` environment
variables are also available for per-task overrides (see
`docs/architecture/ai-provider.md`).
