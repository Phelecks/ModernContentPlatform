# AI Provider Modes and Media Generation Modes

This document is the practical reference for configuring AI providers and media
generation modes in Modern Content Platform. It is the recommended starting
point for new contributors and for anyone setting up a local, staging, or
production environment.

For deeper detail on individual topics, see the related documentation links at
the end of this page.

---

## Quick-start: recommended v1 setup

For Finance + Crypto in v1 production:

| Setting | Value |
|---|---|
| `AI_PROVIDER` | `openai` |
| `MEDIA_MODE` | `image_video` |
| `ENABLE_NEWSAPI` | `true` |
| `ENABLE_X` | `false` (add later when X API credentials are ready) |

This combination is fully supported today, has predictable costs, and requires
only an OpenAI API key and a NewsAPI key.

See [example configuration](#example-configurations) below for the full env
block you can copy into `.dev.vars` or n8n variables.

---

## AI providers

Two AI providers are supported in v1.

| Provider | `AI_PROVIDER` value | API key variable | Status |
|---|---|---|---|
| **OpenAI** | `openai` | `OPENAI_API_KEY` | ✅ First-class v1 provider |
| **Google** | `google` | `GOOGLE_API_KEY` | ✅ First-class v1 provider |

**Default:** `openai` when `AI_PROVIDER` is not set.

### OpenAI

Uses the OpenAI Chat Completions API for all text tasks and the Images API
(`gpt-image-1`) and TTS API (`gpt-4o-mini-tts`) for media tasks.

Default model split:

| Model tier | Default model | Tasks |
|---|---|---|
| **Standard** | `gpt-4o` | Daily summary, article generation, expectation check, tomorrow outlook, video script |
| **Fast** | `gpt-4o-mini` | Alert classification, timeline formatting, YouTube metadata |
| **Image** | `gpt-image-1` | Daily image generation (image_video mode) |
| **TTS** | `gpt-4o-mini-tts` | Narration audio (image_video mode) |

**Required n8n credential:** Create one credential with type **OpenAI API**,
name it exactly `OpenAiApi`, and paste in your `OPENAI_API_KEY`.

### Google

Uses the Google Generative Language API (Gemini) for all text tasks and
Google Imagen + Google Cloud TTS for media tasks.

Default model split:

| Model tier | Default model | Tasks |
|---|---|---|
| **Standard** | `gemini-2.5-pro` | Daily summary, article generation, expectation check, tomorrow outlook, video script |
| **Fast** | `gemini-2.5-flash` | Alert classification, timeline formatting, YouTube metadata |
| **Image** | `imagen-3.0-generate-001` | Daily image generation (image_video mode) |
| **TTS** | `en-US-Chirp3-HD-Aoede` | Narration audio (image_video mode) |

**Required n8n credential:** Create a Google API credential in n8n and set
`GOOGLE_API_KEY` in your environment.

---

## Media generation modes

Two media modes are defined. Only `image_video` is active in v1.

| Mode | `MEDIA_MODE` value | Status | Cost tier |
|---|---|---|---|
| **Image-based video** | `image_video` | ✅ Default v1 mode | ~$0.07–$0.21 per topic/day |
| **Full AI video** | `full_video` | 🚫 Reserved for future use | ~$2–$30+ per topic/day |

**Default:** `image_video` when `MEDIA_MODE` is not set.

### `image_video` — default

Generates still images via the AI provider's image model, produces a TTS
narration from the video script, and assembles them into an MP4 using a
render service (Shotstack or Creatomate).

Pipeline steps after video script generation:

```
06b Generate Images      — OpenAI gpt-image-1 or Google Imagen
06c Generate Narration   — OpenAI TTS or Google Cloud TTS
06d Render Video         — Shotstack or Creatomate (external service)
```

This is the recommended v1 strategy. It is reliable, affordable, and works
today with both supported AI providers.

### `full_video` — future

Full AI-generated video from a single provider call. No v1 provider (OpenAI or
Google) supports this capability yet. Setting `MEDIA_MODE=full_video` fails
validation with a clear `MEDIA_MODE_CONFIG_ERROR` rather than producing
incomplete output silently.

This mode is fully defined in the codebase so it can be enabled cleanly when
a compatible provider becomes available.

---

## Supported combinations

All supported `AI_PROVIDER` + `MEDIA_MODE` combinations:

| AI provider | Media mode | Supported? | Notes |
|---|---|---|---|
| `openai` | `image_video` | ✅ Yes | **Recommended v1** |
| `google` | `image_video` | ✅ Yes | Fully supported alternative |
| `openai` | `full_video` | 🚫 No | OpenAI has no native video generation API in v1 |
| `google` | `full_video` | 🚫 No | Google has no native video generation API in v1 |

### Provider/task support matrix

| Internal task | OpenAI | Google |
|---|---|---|
| `alertClassification` | ✅ | ✅ |
| `timelineFormatting` | ✅ | ✅ |
| `dailySummary` | ✅ | ✅ |
| `articleGeneration` | ✅ | ✅ |
| `expectationCheck` | ✅ | ✅ |
| `tomorrowOutlook` | ✅ | ✅ |
| `videoScript` | ✅ | ✅ |
| `youtubeMetadata` | ✅ | ✅ |
| `imageGeneration` | ✅ | ✅ |
| `tts` | ✅ | ✅ |
| `fullVideoGeneration` | 🚫 | 🚫 |

---

## Required environment variables

### Core variables

Set these in `.dev.vars` (local) or as n8n workflow variables (all environments).

| Variable | Required | Default | Description |
|---|---|---|---|
| `AI_PROVIDER` | No | `openai` | Active AI provider. `openai` or `google`. |
| `OPENAI_API_KEY` | When `AI_PROVIDER=openai` | — | OpenAI API key. |
| `GOOGLE_API_KEY` | When `AI_PROVIDER=google` | — | Google API key. |
| `MEDIA_MODE` | No | `image_video` | Media generation mode. `image_video` or `full_video`. |
| `RENDER_PROVIDER` | No (required for video renders) | — | Render service. `shotstack` or `creatomate`. Omit to skip rendering. |
| `ENABLE_X` | No | `false` | Enable X (Twitter) signal provider. |
| `ENABLE_NEWSAPI` | No | `false` | Enable NewsAPI signal provider. |
| `X_BEARER_TOKEN` | When `ENABLE_X=true` | — | X API v2 bearer token. |
| `NEWS_API_KEY` | When `ENABLE_NEWSAPI=true` | — | NewsAPI key. |

### n8n model-tier variables

Set these in **n8n Settings → Variables**. They control the active model for all
tasks in each tier without requiring workflow JSON changes.

| Variable | Recommended value | Description |
|---|---|---|
| `AI_MODEL_STANDARD` | `gpt-4o` | Model for daily editorial tasks (OpenAI default). |
| `AI_MODEL_FAST` | `gpt-4o-mini` | Model for high-volume and short-output tasks (OpenAI default). |

> These are the variables the current n8n workflow JSON reads. The
> `OPENAI_MODEL_*` and `GOOGLE_MODEL_*` variables in `.env.example` document
> the intended per-task split and serve as the source of truth for future
> per-task workflow wiring. Changing only those variables does not affect
> current workflow behaviour unless you wire them into the workflow nodes.

### Media pipeline variables

Required when using `MEDIA_MODE=image_video` with a render provider:

| Variable | Required | Default | Description |
|---|---|---|---|
| `SHOTSTACK_API_KEY` | Shotstack only | — | Shotstack API key |
| `CREATOMATE_API_KEY` | Creatomate only | — | Creatomate API key |
| `CREATOMATE_TEMPLATE_ID` | Creatomate only | — | Creatomate render template ID |
| `AI_IMAGE_COUNT` | No | `1` | Number of images per daily run (1–4) |
| `DAILY_GENERATE_IMAGES_WORKFLOW_ID` | Yes | — | n8n workflow ID for `06b_generate_images` |
| `DAILY_GENERATE_NARRATION_WORKFLOW_ID` | Yes | — | n8n workflow ID for `06c_generate_narration` |
| `DAILY_RENDER_VIDEO_WORKFLOW_ID` | Yes | — | n8n workflow ID for `06d_render_video` |

---

## Default behavior

When no AI or media variables are set:

| Setting | Effective default |
|---|---|
| `AI_PROVIDER` | `openai` |
| `MEDIA_MODE` | `image_video` |
| OpenAI standard-tier tasks | `gpt-4o` (via `AI_MODEL_STANDARD=gpt-4o` in n8n) |
| OpenAI fast-tier tasks | `gpt-4o-mini` (via `AI_MODEL_FAST=gpt-4o-mini` in n8n) |
| Image generation model | `gpt-image-1` |
| TTS model | `gpt-4o-mini-tts` |
| TTS voice | `alloy` |
| Source providers | Neither X nor NewsAPI — set at least one explicitly |

**Config validation** runs at workflow startup. An invalid combination (missing
API key, unknown provider, incompatible media mode) throws a clear, named error
(`AI_PROVIDER_CONFIG_ERROR` or `MEDIA_MODE_CONFIG_ERROR`) and stops the pipeline
before any API calls are made.

---

## Cost guidance

### Per-topic per-day estimate (v1, `image_video` mode)

| Cost component | OpenAI estimate | Google estimate |
|---|---|---|
| Daily editorial tasks (5 × gpt-4o calls) | ~$0.05–$0.15 | ~$0.03–$0.10 |
| Image generation (1 image, gpt-image-1 / Imagen) | ~$0.04–$0.08 | ~$0.01–$0.04 |
| TTS narration (~1 000 characters) | ~$0.01–$0.02 | ~$0.01–$0.02 |
| Render (Shotstack / Creatomate) | ~$0.02–$0.10 | ~$0.02–$0.10 |
| Intraday classification (96 runs/day × up to 30 items) | ~$0.10–$0.30 | ~$0.05–$0.15 |
| **Total per topic per day** | **~$0.22–$0.65** | **~$0.12–$0.41** |

For 2 active topics (Finance + Crypto): **~$0.44–$1.30/day with OpenAI** or
**~$0.24–$0.82/day with Google**.

> These are estimates only. Actual costs depend on prompt size, output length,
> retry frequency, and exact model pricing. Check the provider pricing pages for
> the latest rates.

### Cost controls

- Intraday classification is capped at **30 items per execution** via
  `AI_MAX_ITEMS_PER_BATCH` (overridable in n8n variables).
- A pre-filter drops items with fewer than 10 characters of combined headline
  and body before any AI call is made.
- All OpenAI nodes set a hard `maxTokens` ceiling per task (400–1 500 tokens).
- Keep `AI_MODEL_FAST` on the fast tier (`gpt-4o-mini` / `gemini-2.5-flash`).
  Upgrading intraday classification to the standard tier multiplies cost by
  ~10–20× for that step.

For the full cost control strategy, see
[`docs/architecture/openai-cost-controls.md`](architecture/openai-cost-controls.md).

---

## Example configurations

Each example shows the variables to set. Copy the block relevant to your
environment into `.dev.vars` (for local Wrangler/Pages dev) or into n8n
**Settings → Variables** (for workflow execution).

Complete, copy-ready env files for common v1 setups live in
[`config/examples/`](../config/examples/).

---

### Local development — OpenAI + NewsAPI (recommended)

Suitable for: local frontend development, Pages Functions testing, daily
workflow smoke tests. No X API credentials required.

```bash
# .dev.vars (local Wrangler secrets)
WRITE_API_KEY=local-dev-key

# n8n Settings → Variables (or docker-compose .env for the n8n container)
AI_PROVIDER=openai
OPENAI_API_KEY=sk-your-openai-key
AI_MODEL_STANDARD=gpt-4o
AI_MODEL_FAST=gpt-4o-mini

MEDIA_MODE=image_video
# RENDER_PROVIDER not set — skips render step; still generates images and narration

ENABLE_X=false
ENABLE_NEWSAPI=true
NEWS_API_KEY=your-newsapi-key
```

---

### Local development — Google + NewsAPI

Suitable for: testing the Google provider path locally. Requires a Google API key.

```bash
# n8n Settings → Variables (or docker-compose .env)
AI_PROVIDER=google
GOOGLE_API_KEY=your-google-api-key
AI_MODEL_STANDARD=gemini-2.5-pro
AI_MODEL_FAST=gemini-2.5-flash

MEDIA_MODE=image_video
# RENDER_PROVIDER not set — skips render step

ENABLE_X=false
ENABLE_NEWSAPI=true
NEWS_API_KEY=your-newsapi-key
```

---

### Production — OpenAI + NewsAPI + Shotstack (Finance + Crypto v1)

Suitable for: production daily pipeline for Finance and Crypto topics.

```bash
# n8n Settings → Variables
AI_PROVIDER=openai
OPENAI_API_KEY=sk-your-openai-key
AI_MODEL_STANDARD=gpt-4o
AI_MODEL_FAST=gpt-4o-mini

MEDIA_MODE=image_video
RENDER_PROVIDER=shotstack
SHOTSTACK_API_KEY=your-shotstack-key
AI_IMAGE_COUNT=1

ENABLE_X=false
ENABLE_NEWSAPI=true
NEWS_API_KEY=your-newsapi-key

GITHUB_TOKEN=your-github-pat
GITHUB_REPO_OWNER=your-org
GITHUB_REPO_NAME=ModernContentPlatform

TELEGRAM_BOT_TOKEN=your-telegram-bot-token
TELEGRAM_CHAT_ID=your-chat-id
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/your-webhook-url

# Workflow IDs (set after importing workflows into n8n)
DAILY_GENERATE_IMAGES_WORKFLOW_ID=<n8n-workflow-id-06b>
DAILY_GENERATE_NARRATION_WORKFLOW_ID=<n8n-workflow-id-06c>
DAILY_RENDER_VIDEO_WORKFLOW_ID=<n8n-workflow-id-06d>
```

---

### Production — Google + NewsAPI + Shotstack

Same as the OpenAI production setup but with the Google provider:

```bash
AI_PROVIDER=google
GOOGLE_API_KEY=your-google-api-key
AI_MODEL_STANDARD=gemini-2.5-pro
AI_MODEL_FAST=gemini-2.5-flash

MEDIA_MODE=image_video
RENDER_PROVIDER=shotstack
SHOTSTACK_API_KEY=your-shotstack-key
AI_IMAGE_COUNT=1

ENABLE_X=false
ENABLE_NEWSAPI=true
NEWS_API_KEY=your-newsapi-key
# ... (same GitHub, Telegram, Discord, workflow ID variables as above)
```

---

### Production — OpenAI + Hybrid sources (X + NewsAPI)

Add X signal coverage when X API credentials are available:

```bash
AI_PROVIDER=openai
OPENAI_API_KEY=sk-your-openai-key
AI_MODEL_STANDARD=gpt-4o
AI_MODEL_FAST=gpt-4o-mini

MEDIA_MODE=image_video
RENDER_PROVIDER=shotstack
SHOTSTACK_API_KEY=your-shotstack-key

ENABLE_X=true
X_BEARER_TOKEN=your-x-bearer-token
ENABLE_NEWSAPI=true
NEWS_API_KEY=your-newsapi-key
# ... (same GitHub, Telegram, Discord, workflow ID variables)
```

---

## Choosing a provider

| Consideration | Choose OpenAI | Choose Google |
|---|---|---|
| Familiarity | More widely documented | Requires Google Cloud setup |
| Cost at low volume | Comparable | Slightly cheaper at low volume |
| JSON output reliability | json_object mode (native API enforcement) | prompt-and-validate approach in v1 |
| Image quality | DALL-E 3 / gpt-image-1 — consistent | Imagen — high quality, less controllable style |
| TTS voice selection | alloy, echo, fable, onyx, nova, shimmer | Chirp3-HD voices (wide language range) |
| Recommended for v1 | ✅ Yes | ✅ Yes — fully supported alternative |

Both providers use the same structured-output contracts and validation layer.
Switching between providers only requires changing `AI_PROVIDER` and the
matching API key. No workflow JSON changes are needed.

---

## Switching providers

To switch AI provider at runtime:

1. Change `AI_PROVIDER` in n8n **Settings → Variables** to `openai` or `google`.
2. Ensure the matching API key is set (`OPENAI_API_KEY` or `GOOGLE_API_KEY`).
3. Update `AI_MODEL_STANDARD` and `AI_MODEL_FAST` to the correct model names for
   the new provider.
4. No workflow JSON changes are required.

The next workflow execution picks up the new provider automatically. Switching
mid-day is safe — the new provider applies from the next run onwards.

---

## Related documentation

| Document | Coverage |
|---|---|
| [`docs/architecture/ai-provider.md`](architecture/ai-provider.md) | Full AI provider architecture, credential setup, structured output contracts, retry behavior, per-task model overrides |
| [`docs/architecture/openai-cost-controls.md`](architecture/openai-cost-controls.md) | Per-task token budgets, pre-filtering, monitoring queries, model override guidance |
| [`docs/image-video-pipeline.md`](image-video-pipeline.md) | Image-based video pipeline stages, asset contracts, render providers, GitHub content layout |
| [`docs/architecture/full-video-mode.md`](architecture/full-video-mode.md) | Full-video mode design, provider requirements, implementation plan for when a capable provider is available |
| [`docs/source-provider-modes.md`](source-provider-modes.md) | Source provider configuration (X, NewsAPI, hybrid) |
| [`docs/local-development.md`](local-development.md) | Local environment setup, `.dev.vars`, Wrangler commands |
| [`config/examples/`](../config/examples/) | Copy-ready env files for common v1 setups |
| [`.env.example`](../.env.example) | Full annotated environment variable reference |
