# Source Provider Modes — Configuration Guide

## Overview

The intraday pipeline supports two managed signal providers:

| Provider | Source types | Environment flag | Required API key |
|----------|-------------|-----------------|-----------------|
| **X (Twitter)** | `x_account`, `x_query` | `ENABLE_X` | `X_BEARER_TOKEN` |
| **NewsAPI** | `newsapi` | `ENABLE_NEWSAPI` | `NEWS_API_KEY` |

Non-provider source types (`rss`, `api`, `webhook`, `social`) are always
active regardless of provider flags and do not count toward provider
configuration.

---

## Supported Modes

### `x_only` — X sources only

```
ENABLE_X=true
ENABLE_NEWSAPI=false
X_BEARER_TOKEN=<your-x-bearer-token>
```

- X sources (`x_account`, `x_query`) are fetched.
- NewsAPI sources are excluded even if present in `INTRADAY_SOURCES_JSON`.
- All non-provider sources (`rss`, `api`, `webhook`, `social`) are included.
- `X_BEARER_TOKEN` is required and validated at startup.

**Use when:** X API credentials are available but you are not yet subscribed
to NewsAPI, or you want to isolate X signal for testing.

---

### `newsapi_only` — NewsAPI sources only

```
ENABLE_X=false
ENABLE_NEWSAPI=true
NEWS_API_KEY=<your-newsapi-key>
```

- NewsAPI sources are fetched.
- X sources are excluded even if present in `INTRADAY_SOURCES_JSON`.
- All non-provider sources (`rss`, `api`, `webhook`, `social`) are included.
- `NEWS_API_KEY` is required and validated at startup.

**Use when:** You have a NewsAPI subscription but have not yet configured X
API credentials, or you want to exclude social signals for a specific topic
area.

---

### `hybrid` — Both providers active

```
ENABLE_X=true
ENABLE_NEWSAPI=true
X_BEARER_TOKEN=<your-x-bearer-token>
NEWS_API_KEY=<your-newsapi-key>
```

- Both X sources and NewsAPI sources are fetched.
- All non-provider sources are included.
- Both `X_BEARER_TOKEN` and `NEWS_API_KEY` are required and validated.

**Use when:** Both credentials are configured and you want full signal
coverage across all source types.

---

## Configuration Variables

Set these as **n8n workflow variables** in the intraday workflow.  They
correspond to the entries documented in `.env.example`.

| Variable | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `ENABLE_X` | `'true'` / `'false'` | No | (inferred) | Enable X provider |
| `ENABLE_NEWSAPI` | `'true'` / `'false'` | No | (inferred) | Enable NewsAPI provider |
| `X_BEARER_TOKEN` | string | When `ENABLE_X=true` | — | X API v2 bearer token |
| `NEWS_API_KEY` | string | When `ENABLE_NEWSAPI=true` | — | NewsAPI API key |
| `INTRADAY_SOURCES_JSON` | JSON string | Yes | (defaults) | Source config array |

### Flag format

Provider flags accept the string `'true'` or `'false'` (case-insensitive).
The empty string and any other value are treated as `false`.

```
ENABLE_X=true      # X provider enabled
ENABLE_X=false     # X provider disabled
ENABLE_X=TRUE      # also valid (case-insensitive)
ENABLE_X=          # treated as false
```

---

## Validation Rules

The intraday pipeline validates provider configuration at the start of every
run.  Invalid configurations fail immediately with a `PROVIDER_CONFIG_ERROR`
before any source fetching occurs.

| Condition | Error |
|-----------|-------|
| `ENABLE_X=false` **and** `ENABLE_NEWSAPI=false` | `PROVIDER_CONFIG_ERROR: No source providers are enabled` |
| `ENABLE_X=true` **and** `X_BEARER_TOKEN` is missing or empty | `PROVIDER_CONFIG_ERROR: Missing required API keys — X_BEARER_TOKEN` |
| `ENABLE_NEWSAPI=true` **and** `NEWS_API_KEY` is missing or empty | `PROVIDER_CONFIG_ERROR: Missing required API keys — NEWS_API_KEY` |

### Ordering

1. No-provider check runs **before** API key validation so the operator
   receives the most actionable error first.
2. API key validation collects **all** missing keys and reports them together,
   so a hybrid configuration with both keys missing surfaces both errors at
   once.

---

## Backward Compatibility — Inferred Mode

When neither `ENABLE_X` nor `ENABLE_NEWSAPI` is set (both variables are absent
or empty), the pipeline falls back to inferring provider presence from the
source types present in `INTRADAY_SOURCES_JSON`:

- Sources with type `x_account` or `x_query` → X is inferred as present.
- Sources with type `newsapi` → NewsAPI is inferred as present.
- If neither type is found → `PROVIDER_CONFIG_ERROR`.

This preserves compatibility with existing deployments that have not yet
added the explicit flags.

**Recommendation:** Set explicit flags for all new and existing deployments.
Explicit flags are safer because they catch credential problems at startup
rather than allowing requests to fail silently at fetch time.

---

## Implementation References

The validation logic is implemented in two places that are kept in sync:

| Location | Purpose |
|----------|---------|
| `app/src/utils/sourceConfig.js` | JavaScript utility — used in tests and as the canonical reference implementation |
| `workflows/n8n/intraday/01_source_ingestion.json` (Build Source List node) | n8n Code node — inline copy of the same logic, runs at workflow start |

The source-presence detection used in the fallback path is implemented in
`app/src/utils/sourceProviders.js`.

---

## Related Documentation

- Source strategy and per-topic source lists: [`docs/source-strategy.md`](source-strategy.md)
- X source lists and trust rules: [`docs/x-source-rules.md`](x-source-rules.md)
- Intraday workflow architecture: [`docs/architecture/intraday-workflow.md`](architecture/intraday-workflow.md)
- Trust scoring model: [`docs/architecture/trust-scoring.md`](architecture/trust-scoring.md)
- Environment variable reference: [`.env.example`](../.env.example)
