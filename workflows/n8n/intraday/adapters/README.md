# Source Adapter Pattern — Implementation Guide

This document describes the pluggable source adapter architecture used in
module 01 (`01_source_ingestion.json`).  Follow this guide when adding a new
source provider to the intraday pipeline.

---

## Overview

Each managed source provider has its own dedicated adapter chain inside module
01.  Every adapter is responsible for:

1. Detecting whether an incoming source config item belongs to its provider.
2. Fetching the raw data from that provider's API.
3. Parsing the raw response into the shared `intraday_source_item` contract.

All adapter outputs feed into a single merge chain that produces one unified
stream of `intraday_source_item` objects, which flows into module 02
(normalization).

---

## Current adapters

| Adapter | Source types | Nodes |
|---------|-------------|-------|
| RSS | `rss` | Is RSS? → Fetch RSS Feed → Parse RSS Items |
| X (Twitter) | `x_account`, `x_query` | Is X Source? → Build X API Request → Fetch X API → Parse X Items |
| NewsAPI | `newsapi` | Is NewsAPI? → Fetch NewsAPI → Parse NewsAPI Items |
| Generic API | `api`, `webhook`, `social` | (fallthrough) → Fetch API Source → Parse API Items |

---

## Adapter routing logic

The routing in module 01 follows a branching chain of IF nodes:

```
Build Source List (one item per enabled source config)
  │
  ├─[Is RSS? = true]──────────────────────────────────────► RSS adapter
  │
  └─[Is RSS? = false]
       │
       ├─[Is X Source? = true]──────────────────────────► X adapter
       │
       └─[Is X Source? = false]
            │
            ├─[Is NewsAPI? = true]──────────────────────► NewsAPI adapter
            │
            └─[Is NewsAPI? = false]──────────────────────► Generic API adapter
```

All adapters merge their output before passing it to module 02:

```
RSS items ──────────────────────┐
Generic API items ──────────────┤ Merge RSS and API
                                │
                                ├─► Merge With NewsAPI
NewsAPI items ──────────────────┘
                                │
                                ├─► Merge All Items ──► Collect Output
X items ────────────────────────┘
```

---

## Shared output contract

Every adapter **must** produce items that conform to the
`intraday_source_item` contract:

```
workflows/contracts/intraday_source_item.json
```

Required fields:
- `source_id`   — unique identifier from the originating source
- `source_name` — human-readable source label
- `source_type` — one of: `rss`, `api`, `social`, `webhook`, `x_account`, `x_query`, `newsapi`, or the new provider's type
- `title`       — raw headline or text
- `fetched_at`  — ISO-8601 UTC fetch timestamp

Optional but strongly recommended:
- `source_slug`  — stable registry identifier for deduplication
- `source_url`   — canonical URL to the original item
- `body`         — raw description or body text
- `author`       — byline or account handle
- `published_at` — ISO-8601 publication timestamp
- `trust_tier`   — `T1`–`T4` from source config
- `trust_score`  — integer 0–100 from source config
- `raw_json`     — original response payload for debugging

---

## Activation logic

Module 01's `Build Source List` node controls which sources are active.

Provider activation is governed by:
- `ENABLE_X=true|false` workflow variable — enable/disable X sources
- `ENABLE_NEWSAPI=true|false` workflow variable — enable/disable NewsAPI sources
- Non-provider sources (`rss`, `api`, `webhook`, `social`) are always active

When neither flag is set, the pipeline infers provider presence from the
source types in `INTRADAY_SOURCES_JSON` (backward-compatible behaviour).

The JavaScript utility at `app/src/utils/sourceConfig.js` mirrors this logic
and is used in unit tests.

See `docs/source-provider-modes.md` for the full configuration reference.

---

## How to add a new provider adapter

### Step 1 — Define the source type

Choose a unique `type` string for the new provider (e.g. `reddit`, `telegram_api`).
Add it to:
- `source_type` enum in `workflows/contracts/intraday_source_item.json`
- `classifySourceProvider` in `app/src/utils/sourceProviders.js` (if it
  needs a new activation flag)
- `SourceBadge.vue` display label map in the frontend

### Step 2 — Add an activation flag (if provider-managed)

If the new provider requires credentials and should be independently togglable:
1. Add `ENABLE_NEWPROVIDER=true|false` handling to the `Build Source List` node
   in `01_source_ingestion.json`.
2. Mirror the flag logic in `app/src/utils/sourceConfig.js`.
3. Add the required API key variable to the README's variable table.
4. Document the new mode in `docs/source-provider-modes.md`.

### Step 3 — Add the routing IF node

After the last existing IF node (currently "Is NewsAPI?"), add a new IF node:

```
Name:   Is <Provider>?
Type:   n8n-nodes-base.if
Check:  {{ $json.type }} equals "<new-type>"
True:   → Fetch <Provider>
False:  → (next IF node or Generic API adapter)
```

Position it in the branching chain before the Generic API fallthrough.

### Step 4 — Add Fetch and Parse nodes

Add two nodes for the new adapter:

**Fetch `<Provider>`** (HTTP Request node):
- URL from source config (`$json.url`) or a computed URL
- Authentication via the appropriate credential type
- Set `retryOnFail: true`, `maxTries: 3`, `waitBetweenTries: 2000`

**Parse `<Provider>` Items** (Code node):
- Read source metadata from the upstream IF node item
  (because the HTTP Request node replaces the item with the response body)
- Map each response record to the `intraday_source_item` shape
- Assign `source_type` to the new provider's type string
- Propagate `trust_tier` and `trust_score` from source config
- Return `[]` when the response is empty or malformed (never throw)

### Step 5 — Wire into the merge chain

Connect `Parse <Provider> Items` output into the appropriate merge node.

If the new adapter produces items that should merge before X items:
- Add a new `Merge With <Provider>` node (mode: append)
- Route `Merge With NewsAPI` output → `Merge With <Provider>` [0]
- Route `Parse <Provider> Items` output → `Merge With <Provider>` [1]
- Route `Merge With <Provider>` output → `Merge All Items` [0]

### Step 6 — Add fixtures and tests

1. Create `fixtures/source-events/<topic>-<date>-<provider>.json`
2. Create `fixtures/normalized-items/<topic>-<date>-<provider>.json`
   (compute `item_id` with SHA-256(`source_name:source_id`))
3. Export both from `app/src/__tests__/integration/helpers/fixtures.js`
4. Add a `describe('normalizeItem — <Provider> item', ...)` block to
   `app/src/__tests__/integration/workflow.source-ingestion.test.js`
5. Include the new source event in `ALL_SOURCE_EVENTS` for contract coverage

### Step 7 — Update documentation

- Add the new credential to the README credentials table
- Add the new variable to the README variables table
- Update `docs/source-provider-modes.md` if a new mode is introduced

---

## Non-provider sources (Generic API adapter)

Sources with type `api`, `webhook`, or `social` fall through all IF nodes and
are handled by the Generic API adapter (`Fetch API Source` → `Parse API Items`).

This adapter provides basic support for arbitrary HTTP endpoints that return
JSON.  If a specific API has a non-standard response shape, add a named
adapter for it instead of extending the generic parser.

---

## Related files

| File | Purpose |
|------|---------|
| `workflows/n8n/intraday/01_source_ingestion.json` | Module 01 workflow |
| `workflows/contracts/intraday_source_item.json` | Shared output contract |
| `app/src/utils/sourceProviders.js` | Provider classification and filtering |
| `app/src/utils/sourceConfig.js` | Provider flag parsing and validation |
| `docs/source-provider-modes.md` | Provider mode configuration guide |
| `docs/x-source-rules.md` | X-specific trust and severity rules |
| `config/sources/` | Per-topic source configuration files |
