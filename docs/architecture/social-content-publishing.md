# Social Content Publishing — X, Telegram, Discord

This document covers the architecture, configuration, and operational guidance
for reusing shared social content contracts across X, Telegram, and Discord in
Modern Content Platform.

## Overview

The platform publishes two types of content through X, Telegram, and Discord:

1. **Daily digest posts** — generated from the completed daily summary, published
   once per topic per day after the main editorial pipeline finishes.
2. **Alert/story posts** — generated from high-priority intraday alerts,
   published per-alert when social story delivery is enabled.

Social publishing is **non-blocking**. If any social channel fails, the core
summary generation, GitHub publishing, Meta publishing, and D1 state update are
not affected. Each platform is isolated so one failure does not block the others.

---

## Shared content contract

All social content for X, Telegram, and Discord uses the same AI output that
Meta publishing uses. The platform-independent fields (`post_caption`, `hashtags`,
`image_prompt`, `story_caption`, `cta`) are generated once and reused across all
distribution channels.

The `social_content_asset` contract
([`workflows/contracts/social_content_asset.json`](../../workflows/contracts/social_content_asset.json))
holds:

- Platform-independent AI output (same schema as `meta_social_post`)
- Per-platform formatted payloads (`x.post_text`, `telegram.message_html`,
  `discord.embed`)
- Per-platform enable flags
- Alert-specific formatted content for each platform

Platform-specific formatting (character limits, HTML markup, embed structure) is
applied at the asset-building step, not at the AI generation step.

### Content reuse flow

```
AI generates social_content_post
        │
        ├──► Meta formatting   (existing: Instagram/Facebook)
        ├──► X formatting      (new: post text, optional thread)
        ├──► Telegram formatting (new: HTML digest/alert message)
        └──► Discord formatting  (new: embed object)
```

---

## Architecture

### Daily editorial flow — modules 13 and 14

```
10 Update D1 State ──────────────────────────────┐
      │                                           │ (parallel, non-blocking)
      ▼                                           ├──► 11 Generate Meta Social
Process Topics (next)                             │        │
                                                  │    12 Publish Meta Daily
                                                  │
                                                  └──► 13 Generate Social Content
                                                           │
                                                       14 Publish Social Channels
```

**Module 13 — Generate Social Content** (`workflows/n8n/daily/13_generate_social_content.json`):
- Reads `ENABLE_SOCIAL_X`, `ENABLE_SOCIAL_TELEGRAM`, `ENABLE_SOCIAL_DISCORD`.
- If all are disabled, stops cleanly without error.
- Reuses AI output from module 11 (Meta) when available.
- Falls back to building content from the daily summary context.
- Applies platform-specific formatting to produce a `social_content_asset`.

**Module 14 — Publish Social Channels** (`workflows/n8n/daily/14_publish_social_channels.json`):
- Receives the `social_content_asset` from module 13.
- Expands to per-platform publish tasks (X, Telegram, Discord).
- Calls each platform's API with retry (3 attempts, 5 s backoff).
- Writes each publish result to `social_publish_log` in D1 (non-blocking).

### Intraday alert flow — module 11

```
Has Approved Alerts?
      │
      ├──► 08 Telegram Delivery     (existing raw alert delivery)
      ├──► 09 Discord Delivery      (existing raw alert delivery)
      ├──► 10 Meta Story Delivery   (existing, parallel, non-blocking)
      └──► 11 Social Story Delivery (new, parallel, non-blocking)
```

**Module 11 — Social Story Delivery** (`workflows/n8n/intraday/11_social_story_delivery.json`):
- Filters alerts with `importance_score >= SOCIAL_ALERT_STORY_THRESHOLD` (default 80).
- Only runs when at least one social channel is enabled.
- Formats each eligible alert as a `social_content_asset`.
- Dispatches to X, Telegram, and/or Discord.
- Writes each result to `social_publish_log` in D1 (non-blocking).

---

## Configuration

### n8n Variables

Set these in **n8n Settings → Variables**:

| Variable | Description | Default |
|---|---|---|
| `ENABLE_SOCIAL_X` | Enable X publishing | `false` |
| `ENABLE_SOCIAL_X_THREADS` | Enable X thread-style multi-post | `false` |
| `ENABLE_SOCIAL_TELEGRAM` | Enable Telegram digest/story publishing | `false` |
| `ENABLE_SOCIAL_DISCORD` | Enable Discord digest/story publishing | `false` |
| `SOCIAL_X_BEARER_TOKEN` | X API v2 Bearer Token | — |
| `SOCIAL_TELEGRAM_BOT_TOKEN` | Telegram Bot API token (falls back to `TELEGRAM_BOT_TOKEN`) | — |
| `SOCIAL_TELEGRAM_CHAT_ID` | Telegram chat ID (falls back to `TELEGRAM_CHAT_ID`) | — |
| `SOCIAL_DISCORD_WEBHOOK_URL` | Discord webhook URL (falls back to `DISCORD_WEBHOOK_URL`) | — |
| `SOCIAL_ALERT_STORY_THRESHOLD` | Min importance_score for story eligibility (falls back to `META_ALERT_STORY_THRESHOLD`) | `80` |
| `DAILY_GENERATE_SOCIAL_CONTENT_WORKFLOW_ID` | n8n ID of module 13 | — |
| `DAILY_PUBLISH_SOCIAL_CHANNELS_WORKFLOW_ID` | n8n ID of module 14 | — |
| `INTRADAY_SOCIAL_STORY_WORKFLOW_ID` | n8n ID of intraday module 11 | — |

### Static config file

[`config/social-publishing.json`](../../config/social-publishing.json) contains:
- Platform enable/disable documentation
- Character limits per platform
- Topic-level base hashtags (shared with Meta)
- Alert story threshold
- Retry settings
- Account requirements

---

## Formatting rules

### X posts

- Post text: `{emoji} {caption body} + {hashtags}`, max **280 characters**.
- Hashtags: up to 5 inline hashtags at end of post.
- Body is truncated with `…` when total exceeds 280 characters.
- Optional thread support: when enabled, long captions are split into multiple
  280-char posts. Hashtags are appended to the last thread post.

### X alert posts

- Format: `{emoji} {headline}` + optional `\n\n{source_url}`.
- Total max: **280 characters**.
- Headline truncated with `…` when needed.

### Telegram daily digest

- HTML parse mode with Telegram-supported tags (`<b>`, `<i>`, `<a>`).
- Structure: `{emoji} <b>{Topic} Daily Briefing</b> — {date}\n\n{body}\n\n{cta}\n\n{hashtags}`.
- Total max: **4096 characters**.

### Telegram alert messages

- HTML format matching existing intraday Telegram delivery style.
- Includes importance bar, bold headline, summary text, and source link.
- Total max: **4096 characters**.

### Discord daily embed

- Embed with `title`, `description`, `color`, `fields`, `footer`, `timestamp`.
- Title: `{emoji} {Topic} Daily Briefing — {date}`, max **256 characters**.
- Description: caption body, max **4096 characters**.
- Color: topic-specific color code (same as existing Discord delivery).
- Fields: Topic (inline), CTA (when present).
- Footer: hashtag list.

### Discord alert embed

- Same embed structure as existing intraday Discord delivery (module 09).
- Fields: Topic, Importance, Severity (all inline).
- Footer: source name.
- URL: source link when available.

---

## D1 state tracking

Every social publish attempt is logged in `social_publish_log`
(migration: [`db/migrations/0010_social_publish_log.sql`](../../db/migrations/0010_social_publish_log.sql)).

Columns tracked per attempt:
- `topic_slug`, `date_key`, `asset_type`, `source_type`, `source_id`
- `platform` (`x`, `telegram`, or `discord`)
- `post_type` (`post`, `thread`, `digest`, `alert`, or `embed`)
- `status` (`pending`, `published`, `failed`, `skipped`)
- `platform_post_id` (platform-specific post ID on success)
- `error_message` (API error details on failure)
- `attempt` (retry count)

D1 write failures are **non-blocking** (`continueOnFail: true` on the D1 HTTP node).

---

## Retry and failure handling

| Step | Retry | Failure behaviour |
|---|---|---|
| Social content generation (module 13) | N/A (reuses existing AI output) | If the shared social asset is missing or invalid, the social branch fails and `errorWorkflow` is notified; the core pipeline remains unaffected |
| X API call (module 14 / intraday 11) | 3 attempts, 5 s backoff | HTTP/network failures may retry/fail the branch; non-2xx platform responses are handled in workflow code (`ignoreResponseCode: true`), marked as `failed`, and logged to D1; other platforms remain unaffected |
| Telegram API call (module 14 / intraday 11) | 3 attempts, 5 s backoff | Same as above |
| Discord webhook call (module 14 / intraday 11) | 3 attempts, 5 s backoff | Same as above |
| D1 log write (module 14 / intraday 11) | 3 attempts, 2 s backoff | `continueOnFail: true` — D1 logging failures are recorded but do not halt execution |

All modules run as **parallel branches** from the orchestrator, so failures do not
block the core editorial or alert pipeline. Each platform is dispatched independently
so one platform failure does not prevent delivery to other platforms.

---

## Schemas and contracts

- AI output: [`schemas/ai/meta_social_post.json`](../../schemas/ai/meta_social_post.json) (shared with Meta)
- Social content asset: [`workflows/contracts/social_content_asset.json`](../../workflows/contracts/social_content_asset.json)
- Publish log schema: [`schemas/workflow/write_social_publish_log.json`](../../schemas/workflow/write_social_publish_log.json)

---

## Testing

Unit tests for the JavaScript formatting utilities are in:
[`app/src/__tests__/integration/workflow.social-content.test.js`](../../app/src/__tests__/integration/workflow.social-content.test.js)

API endpoint tests are in:
[`app/src/__tests__/integration/api.internal.social-publish-log.test.js`](../../app/src/__tests__/integration/api.internal.social-publish-log.test.js)

Sample fixtures:
- [`fixtures/social-content/crypto-2025-01-15-daily-post.json`](../../fixtures/social-content/crypto-2025-01-15-daily-post.json)
- [`fixtures/social-content/crypto-2025-01-15-story.json`](../../fixtures/social-content/crypto-2025-01-15-story.json)

---

## Relationship to existing delivery modules

The existing intraday delivery modules (08 Telegram, 09 Discord) continue to
operate unchanged for raw alert delivery. The new social story delivery module
(11) operates in parallel and is designed for publishing high-priority alerts
through the shared social content contract. This separation means:

- Raw alert delivery (modules 08, 09) uses direct alert formatting
- Social story delivery (module 11) uses the shared `social_content_asset` contract
- Both can be enabled independently
- There is no dependency between them

---

## Next steps

- Wire X OAuth 2.0 token refresh for production use.
- Add X thread publishing support to module 14 (currently generates thread array
  but publishes only the first post).
- Add per-topic Telegram chat ID overrides for topic-specific channels.
- Add per-topic Discord webhook URL overrides for topic-specific channels.
- Expose `social_publish_log` via the operational dashboard.
- Add image attachment support for X and Telegram posts.
