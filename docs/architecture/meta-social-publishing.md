# Meta Social Publishing

This document covers the architecture, configuration, and operational guidance for
Meta (Instagram and Facebook) social content publishing in Modern Content Platform.

## Overview

The platform publishes two types of content to Meta platforms:

1. **Daily feed posts** — generated from the completed daily summary, published
   once per topic per day after the main editorial pipeline finishes.
2. **Story-style posts** — generated from high-priority intraday alerts,
   published per-alert when stories are enabled.

Meta publishing is **non-blocking**. If the Meta publishing step fails, the core
summary generation, GitHub publishing, and D1 state update are not affected.

---

## Architecture

### Shared contract

All Meta content uses a shared `meta_social_asset` contract
([`workflows/contracts/meta_social_asset.json`](../../workflows/contracts/meta_social_asset.json)).
This contract holds:

- Platform-independent AI output (`post_caption`, `hashtags`, `image_prompt`,
  `story_caption`, `story_background_hint`, `cta`)
- Per-platform formatted payloads (`instagram.caption`, `facebook.caption`)
- Per-platform enable flags and story toggle state

Platform-specific formatting (caption length limits, hashtag structure) is applied
at the asset-building step, not at the AI generation step.

### Daily editorial flow — modules 11 and 12

```
08 Validate Outputs
      │
09 Publish to GitHub
      │
10 Update D1 State ──────────────────────────┐
      │                                       │ (parallel, non-blocking)
      ▼                                       ▼
Process Topics (next)           11 Generate Meta Social
                                      │
                                12 Publish Meta Daily
```

**Module 11 — Generate Meta Social** (`workflows/n8n/daily/11_generate_meta_social.json`):
- Reads `ENABLE_META_INSTAGRAM` and `ENABLE_META_FACEBOOK` from n8n variables.
- If both are disabled, stops cleanly without error.
- Builds an AI prompt from the daily summary output.
- Calls the AI model (fast tier, `gpt-4o-mini`) to generate a `meta_social_post`.
- Validates and parses the AI output.
- Applies platform-specific formatting to produce a `meta_social_asset`.

**Module 12 — Publish Meta Daily** (`workflows/n8n/daily/12_publish_meta_daily.json`):
- Receives the `meta_social_asset` from module 11.
- Expands to per-platform, per-post-type tasks (feed and/or story).
- Calls Meta Graph API with retry (3 attempts, 5 s backoff).
- Handles Instagram's two-step publish flow (create container → publish container).
- Writes each publish result to `meta_social_publish_log` in D1 (non-blocking).

### Intraday alert flow — module 10

```
Has Approved Alerts?
      │
      ├──► 08 Telegram Delivery
      ├──► 09 Discord Delivery
      └──► 10 Meta Story Delivery  (parallel, non-blocking)
```

**Module 10 — Meta Story Delivery** (`workflows/n8n/intraday/10_meta_story_delivery.json`):
- Filters alerts to those with `importance_score >= META_ALERT_STORY_THRESHOLD` (default 80).
- Only runs when at least one Meta story platform is enabled.
- Formats each eligible alert as a story-style asset.
- Dispatches to Instagram and/or Facebook story endpoints.
- Writes each result to `meta_social_publish_log` in D1 (non-blocking).

---

## Configuration

### n8n Variables

Set these in **n8n Settings → Variables**:

| Variable | Description | Default |
|---|---|---|
| `ENABLE_META_INSTAGRAM` | Enable Instagram publishing | `false` |
| `ENABLE_META_FACEBOOK` | Enable Facebook publishing | `false` |
| `ENABLE_META_INSTAGRAM_STORIES` | Enable Instagram story posts | `false` |
| `ENABLE_META_FACEBOOK_STORIES` | Enable Facebook story posts | `false` |
| `META_INSTAGRAM_USER_ID` | Instagram professional account user ID | — |
| `META_INSTAGRAM_TOKEN` | Instagram Graph API access token | — |
| `META_FACEBOOK_PAGE_ID` | Facebook Page ID | — |
| `META_FACEBOOK_PAGE_TOKEN` | Facebook Page Access Token | — |
| `META_ALERT_STORY_THRESHOLD` | Min importance_score for story eligibility | `80` |
| `DAILY_GENERATE_META_SOCIAL_WORKFLOW_ID` | n8n ID of module 11 | — |
| `DAILY_PUBLISH_META_WORKFLOW_ID` | n8n ID of module 12 | — |
| `INTRADAY_META_STORY_WORKFLOW_ID` | n8n ID of intraday module 10 | — |

### Static config file

[`config/meta-publishing.json`](../../config/meta-publishing.json) contains:
- Default caption length limits per platform
- Topic-level base hashtags
- Alert story threshold
- Retry settings
- Account requirement notes

---

## Account and token requirements

### Instagram

- Requires a **Professional account** (Business or Creator type).
- The account must be **linked to a Facebook Page**.
- Uses the **Instagram Graph API Content Publishing** endpoint.

Required permissions:
- `instagram_basic`
- `instagram_content_publish`
- `pages_read_engagement`

Token type: **User Access Token** (long-lived) or a **System User token** (non-expiring).

> ⚠️ Long-lived User Access Tokens expire in **60 days**. For production use,
> generate a System User token via Meta Business Suite → Business Settings →
> System Users, or implement token refresh logic.

Setup guide: <https://developers.facebook.com/docs/instagram-api/getting-started>

### Facebook

- Requires a **Facebook Page** with admin access.
- Uses the **Facebook Graph API Pages** endpoint.

Required permissions:
- `pages_manage_posts`
- `pages_read_engagement`

Token type: **Page Access Token** (long-lived, or non-expiring via System User).

> ⚠️ Page Access Tokens derived from long-lived User Tokens do not expire as
> long as the connected app remains authorised. Use a System User token for
> unattended production publishing.

Setup guide: <https://developers.facebook.com/docs/pages/getting-started>

---

## Formatting rules

### Instagram feed posts

- Caption body from AI output, CTA appended, hashtags appended.
- Total caption limit: **2200 characters**. Body is truncated if needed.
- Hashtag position: end of caption, after CTA.
- AI-generated hashtags merged with topic base hashtags (deduplicated, max 30).

### Facebook feed posts

- Same structure as Instagram (caption body + CTA + hashtags).
- Total caption limit: **63,206 characters** (rarely reached).
- Hashtags appended at end.

### Instagram/Facebook stories

- Short caption derived from alert headline (max 200 characters).
- Topic emoji prepended (🪙 crypto, 📈 finance, 🏦 economy, etc.).
- No hashtags in story caption.
- Image/background selection guided by `story_background_hint` from AI output.

---

## D1 state tracking

Every Meta publish attempt is logged in `meta_social_publish_log`
(migration: [`db/migrations/0009_meta_social_publish_log.sql`](../../db/migrations/0009_meta_social_publish_log.sql)).

Columns tracked per attempt:
- `topic_slug`, `date_key`, `asset_type`, `source_type`, `source_id`
- `platform` (`instagram` or `facebook`)
- `post_type` (`feed` or `story`)
- `status` (`pending`, `published`, `failed`, `skipped`)
- `platform_post_id` (Meta post ID on success)
- `error_message` (API error details on failure)
- `attempt` (retry count)

D1 write failures are **non-blocking** (`continueOnFail: true` on the D1 HTTP node).

---

## Retry and failure handling

| Step | Retry | Failure behaviour |
|---|---|---|
| AI generation (module 11) | 3 attempts, 5 s backoff | Throws → errorWorkflow notified, core pipeline unaffected |
| Meta Graph API call (module 12) | 3 attempts, 5 s backoff | Throws → errorWorkflow notified, D1 log records `failed` |
| Instagram container publish (module 12) | 3 attempts, 5 s backoff | Same as above |
| D1 log write (modules 11, 12, intraday 10) | 3 attempts, 2 s backoff | `continueOnFail: true` — logged but does not halt execution |
| Meta story API (intraday 10) | 3 attempts, 5 s backoff | Error captured in D1 log, execution continues |

Both modules 11/12 and intraday module 10 run as **parallel branches** from the
orchestrator, so failures do not block the core editorial or alert pipeline.

---

## Schemas

- AI output: [`schemas/ai/meta_social_post.json`](../../schemas/ai/meta_social_post.json)
- Workflow contract: [`workflows/contracts/meta_social_asset.json`](../../workflows/contracts/meta_social_asset.json)

---

## Testing

Unit tests for the JavaScript formatting utilities are in:
[`app/src/__tests__/integration/workflow.meta-social.test.js`](../../app/src/__tests__/integration/workflow.meta-social.test.js)

Fixture validation is in:
[`app/src/__tests__/integration/fixtures.test.js`](../../app/src/__tests__/integration/fixtures.test.js)

Sample fixtures:
- [`fixtures/meta-social/crypto-2025-01-15-daily-post.json`](../../fixtures/meta-social/crypto-2025-01-15-daily-post.json)
- [`fixtures/meta-social/crypto-2025-01-15-story.json`](../../fixtures/meta-social/crypto-2025-01-15-story.json)

---

## Next steps

- Wire `META_INSTAGRAM_TOKEN` refresh using a System User token to avoid 60-day expiry.
- Add image pipeline integration: pass `image_prompt` to image generation (module 06b)
  and attach the resulting image URL to the Meta container creation request.
- Add per-topic CTA overrides to `config/meta-publishing.json`.
- Expose `meta_social_publish_log` via a Pages Functions internal API endpoint for
  operational dashboards.
