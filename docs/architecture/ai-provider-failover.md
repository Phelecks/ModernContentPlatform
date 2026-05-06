# AI Provider Failover and Task Fallback Strategy

## Overview

This document defines the failover behavior between OpenAI and Google for all
supported AI tasks. The goal is to improve platform resilience when one provider
is temporarily unavailable or degraded.

The failover system builds on the existing provider abstraction layer
(`app/src/utils/openaiConfig.js`) and adds:

- preferred provider per task
- fallback provider rules
- retry behavior across providers
- schema compatibility checks
- cost guardrails during failover
- logging of provider-switch events

---

## Design Principles

1. **Same-provider retries first** — n8n nodes retry 3 times (retryOnFail +
   maxTries) on the primary provider before any cross-provider failover.
2. **Cross-provider failover is opt-in per task** — each task explicitly
   declares whether failover is safe and allowed.
3. **Schema compatibility is a hard gate** — failover is blocked if the
   fallback provider cannot produce output that passes the same validator.
4. **Cost guardrails prevent runaway spend** — each task has a
   `costMultiplierLimit` that caps how much more expensive the fallback
   provider can be relative to the primary.
5. **Credentials must exist** — failover only attempts the fallback provider
   if valid API credentials are available in the environment.
6. **Every failover event is logged** — structured log entries track when,
   why, and whether cross-provider failover occurred.

---

## Task Fallback Matrix

| Task | Primary | Fallback | Failover Allowed | Schema Compatible | Cost Limit |
|------|---------|----------|------------------|-------------------|------------|
| alertClassification | openai | google | ✅ | ✅ | 2.0× |
| timelineFormatting | openai | google | ✅ | ✅ | 2.0× |
| dailySummary | openai | google | ✅ | ✅ | 2.0× |
| articleGeneration | openai | google | ✅ | ✅ | 2.0× |
| expectationCheck | openai | google | ✅ | ✅ | 2.0× |
| tomorrowOutlook | openai | google | ✅ | ✅ | 2.0× |
| videoScript | openai | google | ✅ | ✅ | 2.0× |
| youtubeMetadata | openai | google | ✅ | ✅ | 2.0× |
| imageGeneration | openai | google | ✅ | ✅ | 3.0× |
| tts | openai | google | ✅ | ✅ | 3.0× |

**Notes:**
- The "Primary" column shows the default preferred provider. The global
  `AI_PROVIDER` variable overrides this — if `AI_PROVIDER=google`, then
  Google becomes the primary and OpenAI becomes the fallback.
- Binary tasks (imageGeneration, tts) have a higher cost multiplier limit
  because pricing models differ significantly between providers.
- All text-generation tasks share the same validators (validateAiOutput.js),
  making schema compatibility guaranteed across providers.

---

## Runtime Behavior

### Sequence of operations

```
1. Workflow starts task execution
2. resolveTaskProviderWithFailover(env, task) resolves:
   - primary provider + model + credentials
   - failover eligibility + fallback provider + model + credentials
   - settings (max attempts, cooldown)
   - cost guardrails
3. n8n executes the AI call on the PRIMARY provider
4. n8n retries on same provider (up to maxTries: 3)
5. IF all same-provider retries exhausted AND failover.allowed === true:
   a. Wait cooldownMs (2000ms default)
   b. Execute the same task on the FALLBACK provider
   c. If fallback succeeds → use result, log failover event
   d. If fallback fails → task fails, log failover event with success: false
6. Failure notifier triggers if all attempts exhausted
```

### Failover eligibility checks

Before attempting cross-provider failover, the system verifies:

1. **Config exists** — `TASK_FAILOVER_CONFIG[task]` is defined
2. **Failover enabled** — `allowFailover: true`
3. **Schema compatible** — `schemaCompatible: true`
4. **Valid fallback** — fallback provider is in `VALID_PROVIDERS`
5. **Task supported** — `AI_TASK_CONTRACTS[task].providers[fallback].supported`
6. **Credentials available** — fallback provider's API key is present in env

If any check fails, failover is blocked and the reason is reported in the
eligibility result.

---

## Cost Guardrails

Each task defines a `costMultiplierLimit` that prevents failover to a provider
that would be significantly more expensive:

| Tier | Tasks | Limit | Rationale |
|------|-------|-------|-----------|
| Text (fast) | alertClassification, timelineFormatting, youtubeMetadata | 2.0× | High volume; cost matters |
| Text (standard) | dailySummary, articleGeneration, expectationCheck, tomorrowOutlook, videoScript | 2.0× | Runs once per topic/day; moderate cost tolerance |
| Binary | imageGeneration, tts | 3.0× | Different pricing models; higher tolerance acceptable |

**Implementation:**
- The `costMultiplierLimit` is advisory in v1 — it is exposed in the
  `resolveTaskProviderWithFailover` response for the orchestration layer to
  enforce.
- n8n workflows can check `costGuardrail.multiplierLimit` and skip failover
  if the estimated cost ratio exceeds the limit.
- Actual cost tracking uses the existing `openai_usage_log` table.

---

## Observability

### Failover event logging

Every provider switch is logged via `createFailoverEvent()`:

```json
{
  "event_type": "provider_failover",
  "task": "dailySummary",
  "primary_provider": "openai",
  "fallback_provider": "google",
  "reason": "primary_failed",
  "success": true,
  "primary_attempts": 3,
  "latency_ms": 8500,
  "timestamp": "2026-05-06T06:00:00.000Z"
}
```

### Where events are recorded

| Destination | Method |
|-------------|--------|
| n8n execution log | Workflow execution data (automatic) |
| D1 openai_usage_log | POST /api/internal/openai-usage-log (existing endpoint) |
| Failure notifier | Telegram/Discord alert on failover failure |

### Monitoring queries

```sql
-- Count failover events in the last 24 hours
SELECT task, primary_provider, fallback_provider, success, COUNT(*) as count
FROM openai_usage_log
WHERE json_extract(metadata_json, '$.event_type') = 'provider_failover'
  AND created_at > datetime('now', '-1 day')
GROUP BY task, primary_provider, fallback_provider, success;

-- Average failover latency by task
SELECT task, AVG(json_extract(metadata_json, '$.latency_ms')) as avg_latency_ms
FROM openai_usage_log
WHERE json_extract(metadata_json, '$.event_type') = 'provider_failover'
  AND created_at > datetime('now', '-7 days')
GROUP BY task;
```

---

## Implementation Plan

### Phase 1 — Configuration layer (this PR)

- [x] `TASK_PREFERRED_PROVIDER` — per-task preferred provider map
- [x] `TASK_FAILOVER_CONFIG` — per-task failover rules
- [x] `FAILOVER_SETTINGS` — global failover behavior settings
- [x] `checkFailoverEligibility()` — eligibility checker
- [x] `createFailoverEvent()` — structured event builder
- [x] `resolveTaskProviderWithFailover()` — runtime resolution with failover metadata

### Phase 2 — n8n workflow wiring (follow-up)

- [ ] Add failover Code node to orchestrator after AI steps
- [ ] Wire `resolveTaskProviderWithFailover` output into AI node routing
- [ ] Add fallback provider credential to n8n
- [ ] Log failover events to D1 via existing usage-log endpoint

### Phase 3 — Cost enforcement (follow-up)

- [ ] Add estimated cost ratio calculation per provider/model pair
- [ ] Block failover when estimated ratio exceeds `costMultiplierLimit`
- [ ] Add daily failover cost budget cap

---

## Configuration Reference

### Environment variables

Both provider API keys should be set in the environment to enable failover:

| Variable | Required for failover |
|----------|----------------------|
| `OPENAI_API_KEY` | Yes (when Google is primary) |
| `GOOGLE_API_KEY` | Yes (when OpenAI is primary) |
| `AI_PROVIDER` | No (defaults to openai; determines primary) |

### Exported functions

| Function | Purpose |
|----------|---------|
| `checkFailoverEligibility(task, primaryProvider, env)` | Check if failover is allowed for a task |
| `createFailoverEvent(params)` | Create structured log entry for a failover event |
| `resolveTaskProviderWithFailover(env, task)` | Full resolution including failover metadata |

### Exported constants

| Constant | Purpose |
|----------|---------|
| `TASK_PREFERRED_PROVIDER` | Default preferred provider per task |
| `TASK_FAILOVER_CONFIG` | Per-task failover rules and guardrails |
| `FAILOVER_SETTINGS` | Global failover behavior settings |

---

## Tradeoffs

| Decision | Alternative | Why this way |
|----------|-------------|-------------|
| Advisory cost guardrails (not enforced in config layer) | Hard-block failover in config | Keeps config layer simple; enforcement in orchestration where actual costs are known |
| Single failover attempt (not multiple) | Retry fallback multiple times | Limits cascading failure risk; both providers likely degraded if primary fails 3× |
| 2s cooldown before failover | Immediate failover | Prevents rapid cascading when both providers have correlated outages |
| All tasks allow failover in v1 | Conservative subset only | Both providers produce validated output through same validators |

---

## Related Documentation

- [AI Provider Architecture](./ai-provider.md) — provider abstraction, task contracts, model defaults
- [OpenAI Cost Controls](./openai-cost-controls.md) — per-task cost guardrails and monitoring
- [Workflow Runtime Variables](./workflow-runtime-variables.md) — AI_PROVIDER and runtime config
- [Observability](./observability.md) — platform-wide observability approach
