# OpenAI Cost Controls and Usage Guardrails

## Overview

OpenAI is usage-based. Cost depends on:

- how many items reach the AI classification step (call volume)
- how many AI calls are made per editorial cycle (task count)
- how many tokens are sent in the prompt (prompt size)
- how many tokens the model generates (completion size)
- how many retries occur on failures (retry multiplier)

This document defines the v1 cost control strategy, per-task guardrails,
and monitoring approach for Finance + Crypto and all supported topics.

---

## Cost control strategy

### 1. Tier-based model selection

Every AI task is assigned to one of two model tiers:

| Tier | n8n variable | Default model | Used for |
|------|-------------|--------------|---------|
| Fast | `AI_MODEL_FAST` | `gpt-4o-mini` | High-volume or short-output tasks |
| Standard | `AI_MODEL_STANDARD` | `gpt-4o` | Editorial and analytical tasks |

**Fast tier** tasks (alertClassification, timelineFormatting, youtubeMetadata) run
on `gpt-4o-mini` to keep per-item cost low. These tasks run at intraday frequency
or have short, structured outputs.

**Standard tier** tasks (dailySummary, articleGeneration, expectationCheck,
tomorrowOutlook, videoScript) run on `gpt-4o` once per topic per day.

Never upgrade intraday classification to the standard tier — volume makes it
cost-prohibitive.

### 2. Pre-filtering before AI

The intraday workflow applies a pre-filter step **before** any items reach the AI
classification node. The `Pre-filter Items` Code node in
`workflows/n8n/intraday/05_ai_classification.json`:

- **Drops items with no useful content**: items whose headline and body together
  total fewer than `minContentLength` (10) characters are discarded. Nothing to
  classify means no API call is made.
- **Caps batch size**: at most `maxItemsPerBatch` (30) items per execution are
  sent to AI. Excess items are dropped silently. The cap is overridable at
  runtime via the `AI_MAX_ITEMS_PER_BATCH` n8n variable.

This pre-filter is the primary cost lever for the intraday flow. With a 15-minute
ingestion cycle and up to 30 items per run, the worst-case is 30 × 96 = 2 880
classification calls per day across all sources. The cap ensures no single
runaway ingestion cycle sends an unbounded number of items to AI.

### 3. Token budget caps

Every OpenAI node sets `maxTokens` to a hard ceiling. The AI cannot return more
completion tokens than this limit, regardless of prompt instructions.

| Task | maxTokens | Rationale |
|------|-----------|-----------|
| `alertClassification` | 400 | Compact structured JSON; all fields bounded by schema |
| `timelineFormatting` | 300 | Short JSON; headline + summary only |
| `dailySummary` | 1 000 | Medium JSON; overview + key_events bounded |
| `articleGeneration` | 1 500 | Longest output; Markdown article 400–800 words |
| `expectationCheck` | 700 | Medium JSON; 2–4 expectations + surprise events |
| `tomorrowOutlook` | 700 | Medium JSON; 2–5 watchpoints + summary |
| `videoScript` | 1 500 | Multi-segment JSON; longest editorial output |
| `youtubeMetadata` | 800 | Short JSON; title + description + tags |

These caps are documented in `OPENAI_COST_CONTROLS.maxTokens` in
`app/src/utils/openaiConfig.js` and mirrored in `config/openai-cost-controls.json`.

### 4. Prompt size discipline

Prompts are kept compact by:

- **Top-N alert slicing**: `daily/02_generate_summary.json` sends at most the top
  20 alerts to the AI prompt (`.slice(0, 20)`). The remaining alerts are
  aggregated into cluster summaries rather than sent verbatim.
- **Text truncation in prompts**: alert `summary_text` is truncated to 150 chars
  before being inserted into the prompt context to avoid bloated prompts from
  long source summaries.
- **Structured context objects**: prompts receive compact context strings
  (importance score + headline + truncated summary) rather than full alert JSON.

### 5. Retry limits

Every AI node is configured with `retryOnFail: true`, `maxTries: 3`, and a
5-second wait between attempts. This allows the platform to recover from transient
rate-limit (429) and network errors without human intervention, while limiting the
maximum retry multiplier to 3× per item.

After all retries are exhausted n8n triggers the `failure_notifier` workflow,
which sends a Telegram alert. Failures are also written to `workflow_logs` in D1.

The canonical `maxRetries` value (2 retries = 3 total attempts) is exported from
`OPENAI_COST_CONTROLS.maxRetries` in `app/src/utils/openaiConfig.js`.

### 6. Output length enforcement

Validation Code nodes after each AI call enforce maximum string lengths via
`.slice()` before writing to D1 or GitHub. These post-output limits prevent
unexpectedly long AI responses from inflating storage or downstream rendering.

The canonical per-field limits are documented in `OPENAI_COST_CONTROLS.outputLimits`.

---

## Per-task guardrail summary

| Task | Workflow | Model tier | maxTokens | Pre-filter | Retries |
|------|----------|-----------|-----------|-----------|---------|
| alertClassification | `intraday/05` | Fast | 400 | ✓ (batch cap + content length) | 3 |
| timelineFormatting | `intraday/05` | Fast | 300 | ✓ (same as classification) | 3 |
| dailySummary | `daily/02` | Standard | 1 000 | top-20 alerts in prompt | 3 |
| articleGeneration | `daily/03` | Standard | 1 500 | uses validated summary input | 3 |
| expectationCheck | `daily/04` | Standard | 700 | uses validated summary input | 3 |
| tomorrowOutlook | `daily/05` | Standard | 700 | uses validated summary input | 3 |
| videoScript | `daily/06` | Standard | 1 500 | uses validated summary input | 3 |
| youtubeMetadata | `daily/07` | Fast | 800 | short prompt from summary | 3 |

---

## Usage monitoring

### openai_usage_log table

> **Status: schema only — not yet wired.** The `0007_openai_usage_log.sql`
> migration creates the table structure, but no workflow step or Pages Function
> endpoint currently writes to `openai_usage_log`. The existing
> `POST /api/internal/workflow-logs` endpoint writes to `workflow_logs`, not
> this table. A dedicated write endpoint (e.g.
> `POST /api/internal/openai-usage-log`) is required before the monitoring
> queries below will return data.

Once wired, the `openai_usage_log` table provides per-call usage tracking:

```sql
SELECT task, model, SUM(total_tokens) AS total_tokens, COUNT(*) AS call_count
FROM openai_usage_log
WHERE date_key = '2025-01-15'
GROUP BY task, model
ORDER BY total_tokens DESC;
```

Fields captured per call:

| Field | Description |
|-------|-------------|
| `task` | Task key (alertClassification, dailySummary, etc.) |
| `model` | Model used (e.g. gpt-4o-mini) |
| `workflow_name` | n8n workflow display name |
| `execution_id` | n8n execution ID for cross-referencing |
| `topic_slug` | Topic when task is topic-specific |
| `date_key` | YYYY-MM-DD when task is date-specific |
| `prompt_tokens` | Tokens in the prompt |
| `completion_tokens` | Tokens in the completion |
| `total_tokens` | prompt + completion |
| `status` | ok / error / retry |
| `error_code` | OpenAI error code on failure |

### Suggested monitoring queries

**Daily token spend by task:**
```sql
SELECT task, model,
       SUM(prompt_tokens) AS prompt_tokens,
       SUM(completion_tokens) AS completion_tokens,
       SUM(total_tokens) AS total_tokens,
       COUNT(*) AS call_count
FROM openai_usage_log
WHERE date(created_at) = date('now')
GROUP BY task, model
ORDER BY total_tokens DESC;
```

**Call volume per hour (intraday pattern):**
```sql
SELECT strftime('%Y-%m-%dT%H:00Z', created_at) AS hour,
       COUNT(*) AS calls,
       SUM(total_tokens) AS tokens
FROM openai_usage_log
WHERE task = 'alertClassification'
  AND date(created_at) = date('now')
GROUP BY hour
ORDER BY hour;
```

**Error rate by task:**
```sql
SELECT task,
       COUNT(*) AS total,
       SUM(CASE WHEN status != 'ok' THEN 1 ELSE 0 END) AS errors,
       ROUND(100.0 * SUM(CASE WHEN status != 'ok' THEN 1 ELSE 0 END) / COUNT(*), 1) AS error_pct
FROM openai_usage_log
WHERE date(created_at) >= date('now', '-7 days')
GROUP BY task
ORDER BY error_pct DESC;
```

**Estimated cost (approximate at gpt-4o-mini rates):**
```sql
-- Adjust multipliers to current OpenAI pricing
SELECT task, model, SUM(total_tokens) AS tokens,
       ROUND(SUM(prompt_tokens) * 0.00000015 + SUM(completion_tokens) * 0.0000006, 4) AS est_usd
FROM openai_usage_log
WHERE date(created_at) >= date('now', '-30 days')
GROUP BY task, model
ORDER BY est_usd DESC;
```

### Soft daily call budgets

`config/openai-cost-controls.json` defines `dailyCallBudgets` as informational
soft limits for each task per topic per day. These are not enforced automatically
in v1. Use them as alerting thresholds in your monitoring dashboard.

| Task | Daily call budget (per topic) |
|------|-----------------------------|
| alertClassification | 200 |
| dailySummary | 10 |
| articleGeneration | 10 |
| expectationCheck | 10 |
| tomorrowOutlook | 10 |
| videoScript | 10 |
| youtubeMetadata | 10 |

To enforce a budget: add a check at the start of the relevant workflow that
queries `openai_usage_log` for today's call count and aborts if it exceeds
the budget for that task and topic.

---

## Configuration reference

### n8n variables to set

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AI_MODEL_FAST` | Yes | `gpt-4o-mini` | Fast-tier model for classification + metadata |
| `AI_MODEL_STANDARD` | Yes | `gpt-4o` | Standard-tier model for editorial generation |
| `AI_MAX_ITEMS_PER_BATCH` | No | `30` | Override the pre-filter batch cap at runtime |

### Config files

| File | Purpose |
|------|---------|
| `config/openai-cost-controls.json` | Canonical cost control values for n8n reference |
| `app/src/utils/openaiConfig.js` | `OPENAI_COST_CONTROLS` export for app and test use |

---

## Adjusting controls

**If costs are too high:**

1. Lower `AI_MAX_ITEMS_PER_BATCH` in n8n variables (e.g. 20 instead of 30).
2. Check that `AI_MODEL_FAST` is `gpt-4o-mini` — do not let intraday tasks run
   on the standard tier.
3. Reduce `maxTokens` in the relevant n8n OpenAI node (and update the config
   file to match).
4. Review whether daily tasks can be disabled for low-activity topics on
   low-volume days (topic_score threshold check in the orchestrator).

**If quality is too low:**

1. Check prompt first — quality problems are usually prompt problems, not
   model problems.
2. If the standard-tier model genuinely needs to be upgraded for a specific task,
   set the task-specific `OPENAI_MODEL_*` env var and wire it into the node.
3. Do not upgrade intraday classification to `gpt-4o` — use prompt improvements
   instead.

**If too many items are being dropped by the pre-filter:**

1. Raise `AI_MAX_ITEMS_PER_BATCH` (costs will increase proportionally).
2. Check upstream deduplication — if the same headlines are arriving repeatedly,
   fix deduplication rather than raising the cap.

---

## Architecture boundaries

| Layer | Cost control responsibility |
|-------|---------------------------|
| n8n | Enforces pre-filter, maxTokens, retries; writes usage_log |
| AI | Bounded by token caps and structured output schemas |
| D1 | Stores usage_log and workflow_logs for monitoring |
| GitHub | Stores validated editorial outputs; no AI involvement |
| Vue frontend | Renders stored outputs; never calls AI |
| Pages Functions | Read-only APIs; no AI involvement |

See also: [AI Provider architecture](./ai-provider.md)
