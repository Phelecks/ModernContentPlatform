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

Currently routes media tasks — image generation (step 06b) and TTS narration
(step 06c) — to Google Imagen and Google Cloud TTS. Text generation tasks
(daily summary, article, classification, and all other n8n workflow steps) are
wired to the `OpenAiApi` credential in the current workflow JSON; Google
text-task routing is planned for a future workflow update.

Default model split:

| Model tier | Default model | Tasks | Current state |
|---|---|---|---|
| **Standard** | `gemini-2.5-pro` | Daily summary, article generation, expectation check, tomorrow outlook, video script | ⚠️ Planned — not yet wired in workflows |
| **Fast** | `gemini-2.5-flash` | Alert classification, timeline formatting, YouTube metadata | ⚠️ Planned — not yet wired in workflows |
| **Image** | `imagen-3.0-generate-001` | Daily image generation (image_video mode) | ✅ Active — wired in 06b |
| **TTS** | `en-US-Chirp3-HD-Aoede` | Narration audio (image_video mode) | ✅ Active — wired in 06c |

**Required n8n credential for media tasks:** Create an HTTP Query Auth
credential in n8n. Name it exactly `GoogleApiKey`. Set the query parameter name
to `key` and the value to your Google API key. This credential is used only by
the media workflows (step 06b image generation, step 06c narration). Text
generation tasks use the `OpenAiApi` credential regardless of `AI_PROVIDER` in
v1.

> Setting `AI_PROVIDER=google` activates Google for image and TTS media steps
> today. Switching text tasks to Google requires updating the n8n workflow JSON
> nodes (02–07 and the intraday classification step) to reference a Google
> credential and model — the config layer already supports this.

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

| Internal task | OpenAI | Google | Notes |
|---|---|---|---|
| `alertClassification` | ✅ active | ⚠️ planned | Current workflow node uses OpenAI |
| `timelineFormatting` | ✅ active | ⚠️ planned | Current workflow node uses OpenAI |
| `dailySummary` | ✅ active | ⚠️ planned | Current workflow node uses OpenAI |
| `articleGeneration` | ✅ active | ⚠️ planned | Current workflow node uses OpenAI |
| `expectationCheck` | ✅ active | ⚠️ planned | Current workflow node uses OpenAI |
| `tomorrowOutlook` | ✅ active | ⚠️ planned | Current workflow node uses OpenAI |
| `videoScript` | ✅ active | ⚠️ planned | Current workflow node uses OpenAI |
| `youtubeMetadata` | ✅ active | ⚠️ planned | Current workflow node uses OpenAI |
| `imageGeneration` | ✅ active | ✅ active | Both providers wired in 06b |
| `tts` | ✅ active | ✅ active | Both providers wired in 06c |
| `fullVideoGeneration` | 🚫 | 🚫 | No v1 provider supports this |

> ⚠️ Planned = the config layer (`openaiConfig.js`, `mediaMode.js`) defines the provider/model
> defaults, but the current n8n workflow JSON nodes for text tasks still use `OpenAiApi`.
> Activating Google for text tasks requires updating those workflow nodes to reference a
> Google credential and read the `GOOGLE_MODEL_*` variables.

---

## Required environment variables

There are three distinct places where configuration values must be set.
Mixing them up is the most common setup mistake.

### 1. Container environment (root `.env`, injected by docker-compose)

These variables are read by `n8n/docker-compose.yml` and injected into the n8n
container at startup. They are **not** n8n workflow variables and are **not**
referenced as `$vars.*` in any workflow. Their primary role is to populate n8n
credentials and pass build-time settings to the container.

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | When using OpenAI | Used to configure the `OpenAiApi` credential inside n8n |
| `GOOGLE_API_KEY` | When using Google media tasks | Used to configure the `GoogleApiKey` credential inside n8n |
| `AI_PROVIDER` | No (default: `openai`) | Passed as container env; also set as an n8n variable (see below) |
| `MEDIA_MODE` | No (default: `image_video`) | Passed as container env; also set as an n8n variable |

Set these in your root `.env` file (copy from `.env.example`). See `n8n/README.md` for the
full list of variables passed to the container.

### 2. n8n credentials (n8n UI — Credentials section)

n8n credentials store API keys securely. The workflows reference them by name
and type — not via `$vars.*`. You must create these in the n8n UI after the
container starts.

| Credential name | Type | Value | Used by |
|---|---|---|---|
| `OpenAiApi` | OpenAI API | Your `OPENAI_API_KEY` | All text tasks (02–07, intraday 05) and OpenAI media tasks (06b, 06c) |
| `GoogleApiKey` | HTTP Query Auth | Query param: `key` = your `GOOGLE_API_KEY` | Google media tasks (06b image generation, 06c narration) only |

> Both credentials must be named **exactly** as shown. Credential names are
> referenced by name in the workflow JSON.

### 3. n8n workflow variables (n8n Settings → Variables)

These are set in **n8n Settings → Variables** and are read by workflows as
`$vars.VARIABLE_NAME`. They control runtime behavior — provider selection,
model tier, source providers, and which sub-workflow IDs to call.

**Core runtime variables:**

| Variable | Required | Default | Description |
|---|---|---|---|
| `AI_PROVIDER` | No | `openai` | Active AI provider for media tasks. `openai` or `google`. Currently affects 06b/06c only. |
| `AI_MODEL_STANDARD` | Yes | — | Model for daily editorial tasks. Set to `gpt-4o` (OpenAI) or `gemini-2.5-pro` (Google). |
| `AI_MODEL_FAST` | Yes | — | Model for high-volume tasks. Set to `gpt-4o-mini` (OpenAI) or `gemini-2.5-flash` (Google). |
| `MEDIA_MODE` | No | `image_video` | Media generation mode. `image_video` or `full_video` (reserved). |
| `RENDER_PROVIDER` | No | — | Render service: `shotstack` or `creatomate`. Omit to skip rendering. |
| `ENABLE_X` | No | `false` | Enable X (Twitter) signal provider. |
| `ENABLE_NEWSAPI` | No | `false` | Enable NewsAPI signal provider. |
| `NEWS_API_KEY` | When `ENABLE_NEWSAPI=true` | — | NewsAPI key. |
| `X_BEARER_TOKEN` | When `ENABLE_X=true` | — | X API v2 bearer token. |

**n8n sub-workflow ID variables:**

The daily orchestrator calls each sub-workflow by ID read from `$vars.*`. These
must be set in n8n variables after importing the workflow JSON files into n8n.
They are required for any orchestrator run — including local development runs
with `MEDIA_MODE=image_video`.

| Variable | Required for | Description |
|---|---|---|
| `DAILY_AGGREGATE_WORKFLOW_ID` | Daily orchestrator | n8n ID for `01_aggregate_alerts` |
| `DAILY_SUMMARY_WORKFLOW_ID` | Daily orchestrator | n8n ID for `02_generate_summary` |
| `DAILY_ARTICLE_WORKFLOW_ID` | Daily orchestrator | n8n ID for `03_generate_article` |
| `DAILY_EXPECTATION_CHECK_WORKFLOW_ID` | Daily orchestrator | n8n ID for `04_generate_expectation_check` |
| `DAILY_TOMORROW_OUTLOOK_WORKFLOW_ID` | Daily orchestrator | n8n ID for `05_generate_tomorrow_outlook` |
| `DAILY_VIDEO_SCRIPT_WORKFLOW_ID` | Daily orchestrator | n8n ID for `06_generate_video_script` |
| `DAILY_GENERATE_IMAGES_WORKFLOW_ID` | `image_video` mode | n8n ID for `06b_generate_images` |
| `DAILY_GENERATE_NARRATION_WORKFLOW_ID` | `image_video` mode | n8n ID for `06c_generate_narration` |
| `DAILY_RENDER_VIDEO_WORKFLOW_ID` | `image_video` mode | n8n ID for `06d_render_video` |
| `DAILY_YOUTUBE_METADATA_WORKFLOW_ID` | Daily orchestrator | n8n ID for `07_generate_youtube_metadata` |
| `DAILY_VALIDATE_OUTPUTS_WORKFLOW_ID` | Daily orchestrator | n8n ID for `08_validate_outputs` |
| `DAILY_PUBLISH_GITHUB_WORKFLOW_ID` | Daily orchestrator | n8n ID for `09_publish_to_github` |
| `DAILY_UPDATE_D1_WORKFLOW_ID` | Daily orchestrator | n8n ID for `10_update_d1_state` |
| `INTRADAY_INGESTION_WORKFLOW_ID` | Intraday orchestrator | n8n ID for `01_source_ingestion` |
| `INTRADAY_AI_CLASSIFICATION_WORKFLOW_ID` | Intraday orchestrator | n8n ID for `05_ai_classification` |
| *(other `INTRADAY_*` IDs)* | Intraday orchestrator | See `workflows/n8n/intraday/orchestrator.json` |
| `FAILURE_NOTIFIER_WORKFLOW_ID` | Both orchestrators | n8n ID for `shared/failure_notifier` |

> The workflow IDs are assigned by n8n when you import workflows and can only
> be read from the n8n UI after import. Fill in these variables as part of the
> post-import setup step.

**Render provider variables** (set as n8n variables when using a render service):

| Variable | Required | Default | Description |
|---|---|---|---|
| `SHOTSTACK_API_KEY` | When `RENDER_PROVIDER=shotstack` | — | Shotstack API key |
| `CREATOMATE_API_KEY` | When `RENDER_PROVIDER=creatomate` | — | Creatomate API key |
| `CREATOMATE_TEMPLATE_ID` | When `RENDER_PROVIDER=creatomate` | — | Creatomate template ID |
| `AI_IMAGE_COUNT` | No | `1` | Images per daily run (1–4) |

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

**Config validation** runs at workflow startup. An incompatible
`MEDIA_MODE`/`AI_PROVIDER` combination (e.g. `full_video` with any v1 provider)
throws `MEDIA_MODE_CONFIG_ERROR` and stops the pipeline. An invalid source
provider configuration (e.g. both X and NewsAPI disabled, or a required API key
missing) throws `PROVIDER_CONFIG_ERROR`. Missing n8n credentials (e.g. `OpenAiApi`
not created) cause errors at execution time when the first affected workflow node
runs.

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

Configuration is split across three places. Each example below shows all three
sections — copy what applies to your environment.

Complete, copy-ready files for common v1 setups live in
[`config/examples/`](../config/examples/).

---

### Local development — OpenAI + NewsAPI (recommended)

Suitable for: local frontend development, Pages Functions testing, daily
workflow smoke tests. No X API credentials required.

**1. Root `.env` (docker-compose container env)**

```bash
# .env — injected into n8n container at startup
OPENAI_API_KEY=sk-your-openai-key
AI_PROVIDER=openai
MEDIA_MODE=image_video
NEWS_API_KEY=your-newsapi-key
```

**2. n8n Credentials UI** (once after starting n8n for the first time)

```
Name:    OpenAiApi
Type:    OpenAI API
API Key: (paste OPENAI_API_KEY value)
```

**3. n8n Settings → Variables** (workflow runtime values)

```bash
# AI
AI_PROVIDER=openai
AI_MODEL_STANDARD=gpt-4o
AI_MODEL_FAST=gpt-4o-mini

# Media mode
MEDIA_MODE=image_video
# RENDER_PROVIDER not set — render step skipped; images and narration still run

# Source providers
ENABLE_X=false
ENABLE_NEWSAPI=true
NEWS_API_KEY=your-newsapi-key

# Sub-workflow IDs (fill in after importing workflows into n8n)
DAILY_AGGREGATE_WORKFLOW_ID=<id-01>
DAILY_SUMMARY_WORKFLOW_ID=<id-02>
DAILY_ARTICLE_WORKFLOW_ID=<id-03>
DAILY_EXPECTATION_CHECK_WORKFLOW_ID=<id-04>
DAILY_TOMORROW_OUTLOOK_WORKFLOW_ID=<id-05>
DAILY_VIDEO_SCRIPT_WORKFLOW_ID=<id-06>
DAILY_GENERATE_IMAGES_WORKFLOW_ID=<id-06b>
DAILY_GENERATE_NARRATION_WORKFLOW_ID=<id-06c>
DAILY_RENDER_VIDEO_WORKFLOW_ID=<id-06d>
DAILY_YOUTUBE_METADATA_WORKFLOW_ID=<id-07>
DAILY_VALIDATE_OUTPUTS_WORKFLOW_ID=<id-08>
DAILY_PUBLISH_GITHUB_WORKFLOW_ID=<id-09>
DAILY_UPDATE_D1_WORKFLOW_ID=<id-10>
FAILURE_NOTIFIER_WORKFLOW_ID=<id-failure-notifier>
```

**4. Cloudflare `.dev.vars`** (Pages Functions local secrets)

```bash
WRITE_API_KEY=local-dev-key
```

---

### Local development — Google + NewsAPI

Suitable for: testing the Google media task path locally. Requires a Google API key.
Note: text tasks (daily summary, article, etc.) still use `OpenAiApi` in the current
workflow JSON even when `AI_PROVIDER=google`. The `OpenAiApi` credential must also
be present.

**1. Root `.env`**

```bash
OPENAI_API_KEY=sk-your-openai-key   # still required — text tasks use OpenAiApi
GOOGLE_API_KEY=your-google-api-key
AI_PROVIDER=google
MEDIA_MODE=image_video
NEWS_API_KEY=your-newsapi-key
```

**2. n8n Credentials UI**

```
Name:    OpenAiApi        Type: OpenAI API      API Key: (OPENAI_API_KEY)
Name:    GoogleApiKey     Type: HTTP Query Auth  Parameter: key   Value: (GOOGLE_API_KEY)
```

**3. n8n Settings → Variables**

```bash
AI_PROVIDER=google
AI_MODEL_STANDARD=gemini-2.5-pro
AI_MODEL_FAST=gemini-2.5-flash
MEDIA_MODE=image_video
# RENDER_PROVIDER not set — render step skipped
ENABLE_X=false
ENABLE_NEWSAPI=true
NEWS_API_KEY=your-newsapi-key
# Sub-workflow IDs — same set as OpenAI example above
```

---

### Production — OpenAI + NewsAPI + Shotstack (Finance + Crypto v1)

Suitable for: production daily pipeline for Finance and Crypto topics.

**1. Root `.env`**

```bash
OPENAI_API_KEY=sk-your-openai-key
AI_PROVIDER=openai
MEDIA_MODE=image_video
RENDER_PROVIDER=shotstack
NEWS_API_KEY=your-newsapi-key
SHOTSTACK_API_KEY=your-shotstack-key
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/your-webhook-url
GITHUB_TOKEN=your-github-pat
GITHUB_REPO_OWNER=your-org
GITHUB_REPO_NAME=ModernContentPlatform
```

**2. n8n Credentials UI**

```
Name:    OpenAiApi    Type: OpenAI API    API Key: (OPENAI_API_KEY)
```

**3. n8n Settings → Variables**

```bash
AI_PROVIDER=openai
AI_MODEL_STANDARD=gpt-4o
AI_MODEL_FAST=gpt-4o-mini

MEDIA_MODE=image_video
RENDER_PROVIDER=shotstack
AI_IMAGE_COUNT=1

ENABLE_X=false
ENABLE_NEWSAPI=true
NEWS_API_KEY=your-newsapi-key

GITHUB_REPO_OWNER=your-org
GITHUB_REPO_NAME=ModernContentPlatform
TELEGRAM_CHAT_ID=your-chat-id
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/your-webhook-url
WRITE_API_KEY=your-strong-random-write-api-key

# Sub-workflow IDs (fill in after importing workflows)
DAILY_AGGREGATE_WORKFLOW_ID=<id-01>
DAILY_SUMMARY_WORKFLOW_ID=<id-02>
DAILY_ARTICLE_WORKFLOW_ID=<id-03>
DAILY_EXPECTATION_CHECK_WORKFLOW_ID=<id-04>
DAILY_TOMORROW_OUTLOOK_WORKFLOW_ID=<id-05>
DAILY_VIDEO_SCRIPT_WORKFLOW_ID=<id-06>
DAILY_GENERATE_IMAGES_WORKFLOW_ID=<id-06b>
DAILY_GENERATE_NARRATION_WORKFLOW_ID=<id-06c>
DAILY_RENDER_VIDEO_WORKFLOW_ID=<id-06d>
DAILY_YOUTUBE_METADATA_WORKFLOW_ID=<id-07>
DAILY_VALIDATE_OUTPUTS_WORKFLOW_ID=<id-08>
DAILY_PUBLISH_GITHUB_WORKFLOW_ID=<id-09>
DAILY_UPDATE_D1_WORKFLOW_ID=<id-10>
FAILURE_NOTIFIER_WORKFLOW_ID=<id-failure-notifier>
```

---

### Production — OpenAI + Hybrid sources (X + NewsAPI)

Add X signal coverage when X API credentials are available:

**1. Root `.env`** — same as production OpenAI setup above, plus:

```bash
# (same as production-openai setup)
```

**3. n8n Settings → Variables** — same as production OpenAI setup, with source vars changed:

```bash
ENABLE_X=true
ENABLE_NEWSAPI=true
NEWS_API_KEY=your-newsapi-key
X_BEARER_TOKEN=your-x-bearer-token
# ... (all other variables same as production OpenAI example)
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

Both providers share the same structured-output contracts and validation layer.
Switching the media pipeline between providers only requires changing
`AI_PROVIDER` and the `GoogleApiKey` credential. Switching text tasks to Google
additionally requires updating the n8n workflow JSON nodes (02–07, intraday 05).

---

## Switching providers

To switch AI provider at runtime:

1. Update `OPENAI_API_KEY` or `GOOGLE_API_KEY` in your root `.env` and restart
   the n8n container so the new key is available for credential setup.
2. Confirm the matching n8n credential exists (`OpenAiApi` for OpenAI text tasks,
   `GoogleApiKey` for Google media tasks).
3. Change `AI_PROVIDER` in n8n **Settings → Variables** to `openai` or `google`.
4. Update `AI_MODEL_STANDARD` and `AI_MODEL_FAST` in n8n variables to the
   correct model names for the new provider.

> **Note:** In v1, switching `AI_PROVIDER` activates the new provider for media
> tasks (06b/06c) only. Text tasks (02–07, intraday 05) continue to use
> `OpenAiApi` regardless of this setting. Full text-task provider switching
> requires updating the workflow JSON nodes.

The next workflow execution picks up the new provider for media tasks
automatically. Switching mid-day is safe for the media pipeline.

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
