# Cloudflare AI Runtime

This document is the canonical contract and operating guide for AI execution in Modern Content Platform. n8n remains the orchestrator; the separately deployed `mcp-ai-runtime` Cloudflare Worker owns every prompt, model choice, inference request, output schema check, provider fallback, AI usage record, and generated-media object.

```text
n8n scheduler and workflow modules
  -> Cloudflare Access service-auth application
    -> mcp-ai-runtime Worker
      -> versioned task/prompt/schema registry
      -> AI Gateway (mcp-ai-staging or mcp-ai-production)
        -> Workers AI primary
        -> OpenAI Unified Billing fallback
      -> D1 ai_invocations (metadata only)
      -> R2 mcp-ai-assets-{environment} (temporary media)
  -> existing 08 validation, 08b editorial gate, publishing and delivery
```

Pages Functions remain thin D1 APIs. They do not select models or proxy arbitrary prompts. n8n may schedule, aggregate, branch, publish, and deliver, but it must not add new provider-specific AI nodes, endpoints, prompts, or response parsing.

## Task API

`POST /v1/tasks/{task}` accepts only the registered tasks:

`alertClassification`, `timelineFormatting`, `dailySummary`, `articleGeneration`, `expectationCheck`, `tomorrowOutlook`, `videoScript`, `youtubeMetadata`, `metaSocial`, `imageGeneration`, and `narration`.

```json
{
  "request_id": "execution-123-dailySummary-0",
  "execution_id": "123",
  "topic_slug": "crypto",
  "date_key": "2026-08-02",
  "input": {},
  "cache_mode": "reuse"
}
```

The Worker rejects unknown request properties and never accepts prompts, provider names, model names, token limits, Gateway routes, or schema overrides. Bodies are limited to 1 MB. Untrusted input is serialized between explicit prompt delimiters.

Successful responses contain `{ request_id, task, output, meta }`. `meta` includes provider, model, Gateway log ID, prompt/schema versions, cache eligibility, fallback state, latency, and usage. Because the Workers AI binding does not expose a reliable cache-hit response field, `cache_status` is `eligible` or `bypass`; use the correlated Gateway log for the observed hit or miss. Failures contain `{ request_id, code, message, retryable }`. Authentication/input/schema failures are non-retryable; rate limits, upstream `5xx`, and timeouts are retryable. Invalid primary output gets one cross-provider attempt before `AI_OUTPUT_INVALID`.

The implementation and deploy commands are in [`workers/ai-runtime/README.md`](../../workers/ai-runtime/README.md). Canonical output contracts remain under [`schemas/ai/`](../../schemas/ai/).

## Model and cache policy

| Tasks | Primary | Migration fallback | Cache |
|---|---|---|---|
| Classification, timeline, YouTube metadata, Meta social | `@cf/openai/gpt-oss-20b` | `openai/gpt-4o-mini` | Classification bypasses; repeatable daily metadata/social uses 24 h |
| Summary, article, expectation, outlook, video script | `@cf/openai/gpt-oss-120b` | `openai/gpt-4o` | 24 h content-hash cache unless refresh requested |
| Image | `@cf/black-forest-labs/flux-2-dev` | `openai/gpt-image-1.5` | Disabled |
| English narration | `@cf/deepgram/aura-2-en` | `openai/tts-1` | Disabled |

The image and narration fallback IDs use the closest current OpenAI models in Cloudflare's Unified Billing catalog. The legacy n8n branch continues to represent the old `gpt-image-1` and `gpt-4o-mini-tts` baseline during evaluation.

Routing policy is code in `workers/ai-runtime/src/policies.ts`; the account-level Gateway settings are declared in `config/cloudflare-ai-gateway-policy.json`. Dashboard-only model routing is not authoritative. Gateway-level retry policy is two total same-provider attempts with exponential backoff. The Worker performs at most one cross-provider fallback. n8n does not retry individual AI HTTP nodes, avoiding multiplicative retries.

Gateway metadata is limited to environment, task, topic, execution ID, and prompt version. Enable Gateway analytics while disabling prompt and response payload retention. Start safety guardrails in flag-only mode. After staging establishes a per-task daily baseline, configure a warning at 125% and blocking at 150%. Unified Billing adds a 5% credit purchase fee; use BYOK only after a measured cost comparison.

## Authentication and secrets

Create separate Access self-hosted applications and Service Auth policies for staging and production. Scope Access to the custom-domain path `/v1/tasks/*` (and any private health endpoint you add), not `/v1/assets/*`: render providers must be able to redeem the Worker-signed asset URL without possessing the n8n service token. The asset route remains protected by its short expiry and HMAC signature. Configure each Access application to read service tokens from the single `Authorization` header. In n8n, create an HTTP Header Auth credential named `McpAiRuntimeAccess`:

- Header name: `Authorization`
- Header value: `{"cf-access-client-id":"...","cf-access-client-secret":"..."}`

The credential must be environment-specific. Do not store this JSON in n8n Variables or `.env`. Set `AI_RUNTIME_URL` and `AI_RUNTIME` in n8n Settings -> Variables. Access validates the service token at the edge; the Worker also verifies the signed `Cf-Access-Jwt-Assertion`, issuer, and application AUD.

`ASSET_SIGNING_KEY` is a Worker secret. D1, R2, and Workers AI are accessed through bindings. Provider keys remain only in the legacy n8n credentials during the rollback window; the Cloudflare fallback uses Unified Billing and needs no provider key.

## Telemetry and media

Migration `0015_ai_invocations.sql` adds provider-neutral telemetry. It stores correlation IDs, task/provider/model, prompt/schema version, Gateway log ID, token/cost fields, latency, cache/fallback state, and error classification. Raw prompts and outputs are never stored there. `openai_usage_log` remains read-only during compatibility; the operator dashboard reads both tables.

Images and narration are written to environment-specific R2 buckets under `temporary/{topic}/{date}/{request}/...`. The Worker returns one-hour signed URLs through `/v1/assets/{key}`. Configure a seven-day R2 lifecycle rule for the `temporary/` prefix in both buckets. Workflows and schemas accept `provider: cloudflare` and `format: r2_url` while legacy fields remain nullable.

## Rollout and rollback

Set `AI_RUNTIME` at the orchestrator level:

- `legacy`: retained provider nodes are authoritative.
- `shadow`: the Worker runs first and its result is retained as `_ai_shadow`; the legacy result remains authoritative and publishable.
- `cloudflare`: only the Worker result enters existing validation and publishing modules.

`AI_RUNTIME` is the global default and instant rollback control. For staged task-group promotion, optional n8n Variables `AI_RUNTIME_FAST`, `AI_RUNTIME_EDITORIAL`, `AI_RUNTIME_IMAGE`, and `AI_RUNTIME_NARRATION` override it for their group. Remove or align all overrides before relying on a global value change; setting every override to `legacy` is the unambiguous emergency rollback.

Promote classification/metadata/social first, then daily editorial text, image, and narration. Each group runs through shadow, 10%, 50%, and 100% authoritative stages. Since the current workflow switch is environment-wide, percentage stages are implemented by running that percentage of topic schedules on an n8n instance configured with `AI_RUNTIME=cloudflare`; do not introduce random per-item publication decisions.

Advance only after the evaluation gates in the roadmap pass. Roll back immediately by setting `AI_RUNTIME=legacy`. Keep legacy credentials for 14 consecutive successful daily cycles after 100% cutover, then remove the legacy branches, credentials, old model variables, and writes to `openai_usage_log` in a separate change.

## Provisioning checklist

1. Replace all placeholder D1 IDs, R2 bucket names, Access values, Gateway IDs, and custom domains in `workers/ai-runtime/wrangler.jsonc`.
2. Create the two R2 buckets and apply a seven-day lifecycle to `temporary/`.
3. Create `mcp-ai-staging` and `mcp-ai-production` Gateways; configure retry, retention, metadata limits, ZDR for Unified Billing, initial guardrails, and later spend controls.
4. Apply D1 migrations in staging, then production.
5. Set `ASSET_SIGNING_KEY` with Wrangler for each environment and deploy the Worker.
6. Put each custom domain's `/v1/tasks/*` path behind its matching Access Service Auth application; leave `/v1/assets/*` reachable only through valid signed URLs.
7. Create the n8n credential and variables, import the updated workflows, and begin in `shadow`.
8. Run `npm run check` in `workers/ai-runtime`, the repository workflow boundary/link checks, and the full frontend/integration suite before promotion.
