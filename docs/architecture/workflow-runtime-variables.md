# Workflow Runtime Variables — Reference

## Overview

Modern Content Platform daily workflows support two key runtime selections that
control which AI provider is used and how the daily video asset is produced:

| Variable | What it controls | Default |
|----------|-----------------|---------|
| `AI_PROVIDER` | Which AI backend runs all generation steps | `openai` |
| `MEDIA_MODE` | Which media pipeline branch runs after script generation | `image_video` |

Both variables are set in **n8n Settings → Variables** and take effect
immediately on the next workflow execution without any code changes.

The orchestrator resolves and validates these values once at the start of each
per-topic run (in the **Build Topic Context** node) and injects them into the
run context. Every downstream sub-workflow reads `ai_provider` and `media_mode`
from the context — not from `$vars` directly — so a single consistent config
governs the entire run.

---

## AI Provider (`AI_PROVIDER`)

### Supported values

| Value | Description | API key required |
|-------|-------------|-----------------|
| `openai` | OpenAI API (default) | `OPENAI_API_KEY` credential |
| `google` | Google Gemini / Imagen / Cloud TTS APIs | `GOOGLE_API_KEY` credential |

### Default

`openai` — used whenever `AI_PROVIDER` is not set or is an empty string.

### What it affects

All AI generation steps read `ai_provider` from the run context:

| Step | Node | OpenAI | Google |
|------|------|--------|--------|
| 02 Daily Summary | `02_generate_summary.json` | `gpt-4o` | `gemini-2.5-pro` |
| 03 Article | `03_generate_article.json` | `gpt-4o` | `gemini-2.5-pro` |
| 04 Expectation Check | `04_generate_expectation_check.json` | `gpt-4o` | `gemini-2.5-pro` |
| 05 Tomorrow Outlook | `05_generate_tomorrow_outlook.json` | `gpt-4o` | `gemini-2.5-pro` |
| 06 Video Script | `06_generate_video_script.json` | `gpt-4o` | `gemini-2.5-pro` |
| 07 YouTube Metadata | `07_generate_youtube_metadata.json` | `gpt-4o-mini` | `gemini-2.5-flash` |
| 06b Image Generation | `06b_generate_images.json` | `gpt-image-1` (DALL-E) | `imagen-3.0-generate-001` |
| 06c Narration (TTS) | `06c_generate_narration.json` | `gpt-4o-mini-tts` / `alloy` voice | `en-US-Chirp3-HD-Aoede` |

Model names can be overridden per-task via the `OPENAI_MODEL_*` and
`GOOGLE_MODEL_*` n8n variables. See `docs/architecture/ai-provider.md` for
the full model override reference.

### Structured output handling

- **OpenAI**: JSON-output tasks use `response_format: json_object`.
- **Google**: JSON-output tasks use prompt-enforced JSON + deterministic
  validator fallback (`prompt_and_validate`).

Both paths pass through the same validators and produce the same output
contracts.

### Fallback behavior

There is no automatic fallback between providers. If `AI_PROVIDER=google` and
a Google API call fails, the step retries (3 attempts) and then the workflow
fails with an error. The failure notifier workflow is triggered automatically.

---

## Media Mode (`MEDIA_MODE`)

### Supported values

| Value | Description | Available in v1 |
|-------|-------------|----------------|
| `image_video` | Still images + TTS narration assembled into video | ✅ Yes (default) |
| `full_video` | Native AI-generated video | ❌ No — reserved for future use |

### Default

`image_video` — used whenever `MEDIA_MODE` is not set or is an empty string.
This is the safe, cost-effective default for all v1 deployments.

### Pipeline branch by mode

```
06 Video Script
 │
 └─ Build Topic Context validates media_mode + ai_provider
     │
     ▼
 Check Media Mode ──[image_video]──► 06b Generate Images
                                           │
                                     06c Generate Narration (TTS)
                                           │
                                     06d Render Video
                                           │
                   [full_video] ──► (fails validation — not available in v1)
                                           │
                                     ─────┴───────────────────────────────►
                                                                    07 YouTube Metadata
```

### `image_video` mode — workflow steps

| Step | Module | Provider path |
|------|--------|--------------|
| Image generation | `06b_generate_images.json` | OpenAI DALL-E 3 / Google Imagen 3 |
| TTS narration | `06c_generate_narration.json` | OpenAI TTS / Google Cloud TTS |
| Render + captions | `06d_render_video.json` | Shotstack / Creatomate / none |

All three steps are **non-blocking**. If any step fails, the pipeline continues
and publishes text content to GitHub. Failures are recorded in the `*_warnings`
fields of the generation output.

### `full_video` mode

Not available in v1. No provider currently supports native full-video
generation. Setting `MEDIA_MODE=full_video` causes the **Build Topic Context**
node to throw `MEDIA_MODE_CONFIG_ERROR` and abort the run immediately.

---

## Provider–mode compatibility matrix

| `AI_PROVIDER` | `MEDIA_MODE=image_video` | `MEDIA_MODE=full_video` |
|---------------|--------------------------|-------------------------|
| `openai`      | ✅ Compatible (default)   | ❌ fullVideoGeneration not supported |
| `google`      | ✅ Compatible             | ❌ fullVideoGeneration not supported |

---

## Invalid combinations

Any invalid or incompatible combination fails immediately at **Build Topic
Context** with a clear error message prefixed `MEDIA_MODE_CONFIG_ERROR:`.

| Condition | Error message |
|-----------|--------------|
| Unknown `MEDIA_MODE` value | `MEDIA_MODE_CONFIG_ERROR: Invalid MEDIA_MODE "<value>". Supported values: image_video, full_video.` |
| Unknown `AI_PROVIDER` value | `MEDIA_MODE_CONFIG_ERROR: Unknown AI_PROVIDER "<value>". Supported values: openai, google.` |
| Incompatible mode + provider | `MEDIA_MODE_CONFIG_ERROR: Media mode "<mode>" is not compatible with provider "<provider>". Required capabilities: … Missing: …` |

The run fails at the very start of the per-topic loop — before any API calls or
D1 writes — so no partial data is produced and the error is easy to diagnose.

---

## Render provider (`RENDER_PROVIDER`)

The render provider is a separate variable that controls which video render
service is called in step 06d. It is independent of `AI_PROVIDER`.

| Value | Description |
|-------|-------------|
| `shotstack` | Shotstack REST API (image slideshow + audio + SRT captions → MP4) |
| `creatomate` | Creatomate REST API (template-based render → MP4) |
| _(not set)_ | No render call; assets are packaged but video is not rendered |

When `RENDER_PROVIDER` is not set or is an empty string, step 06d skips the
render API call and records a warning. The pipeline continues and publishes
text content to GitHub normally. This is the safe default for environments
where render credentials are not yet configured.

---

## All runtime variables — quick reference

Set the following in **n8n Settings → Variables**:

### Required for operation

| Variable | Default | Description |
|----------|---------|-------------|
| `CF_ACCOUNT_ID` | — | Cloudflare account ID (D1 REST API) |
| `CF_D1_DATABASE_ID` | — | D1 database ID |
| `GITHUB_REPO_OWNER` | — | GitHub owner for content publishing |
| `GITHUB_REPO_NAME` | `ModernContentPlatform` | GitHub repository name |
| `GITHUB_CONTENT_BRANCH` | `main` | Branch to publish content to |

### AI provider

| Variable | Default | Description |
|----------|---------|-------------|
| `AI_PROVIDER` | `openai` | Active AI provider: `openai` or `google` |
| `OPENAI_MODEL_DAILY_SUMMARY` | `gpt-4o` | Override OpenAI model for daily summary |
| `OPENAI_MODEL_ARTICLE_GENERATION` | `gpt-4o` | Override OpenAI model for article |
| `OPENAI_MODEL_ALERT_CLASSIFICATION` | `gpt-4o-mini` | Override OpenAI model for classification |
| `OPENAI_MODEL_IMAGE_GENERATION` | `gpt-image-1` | Override OpenAI image model |
| `OPENAI_MODEL_TTS` | `gpt-4o-mini-tts` | Override OpenAI TTS model |
| `GOOGLE_MODEL_DAILY_SUMMARY` | `gemini-2.5-pro` | Override Google model for daily summary |
| `GOOGLE_MODEL_IMAGE_GENERATION` | `imagen-3.0-generate-001` | Override Google image model |
| `GOOGLE_MODEL_TTS` | `en-US-Chirp3-HD-Aoede` | Override Google TTS model/voice |

### Media mode

| Variable | Default | Description |
|----------|---------|-------------|
| `MEDIA_MODE` | `image_video` | Active media strategy: `image_video` or `full_video` |
| `AI_IMAGE_COUNT` | `1` | Number of images to generate per run (max 4) |
| `OPENAI_TTS_VOICE` | `alloy` | OpenAI TTS voice name |
| `GOOGLE_TTS_VOICE` | `en-US-Chirp3-HD-Aoede` | Google TTS voice name |
| `AI_TTS_VOICE` | — | Shared TTS voice override (provider-specific takes precedence) |
| `GOOGLE_TTS_LANGUAGE_CODE` | _(derived from voice)_ | BCP-47 language code for Google TTS |

### Render provider

| Variable | Default | Description |
|----------|---------|-------------|
| `RENDER_PROVIDER` | _(none)_ | Video render service: `shotstack` or `creatomate` |
| `SHOTSTACK_API_KEY` | — | Shotstack API key (required when RENDER_PROVIDER=shotstack) |
| `CREATOMATE_API_KEY` | — | Creatomate API key (required when RENDER_PROVIDER=creatomate) |
| `CREATOMATE_TEMPLATE_ID` | — | Creatomate template ID for daily video |

### Module workflow IDs

Set after importing all module workflows into n8n.

| Variable | Points to |
|----------|-----------|
| `DAILY_AGGREGATE_WORKFLOW_ID` | `01_aggregate_alerts` |
| `DAILY_SUMMARY_WORKFLOW_ID` | `02_generate_summary` |
| `DAILY_ARTICLE_WORKFLOW_ID` | `03_generate_article` |
| `DAILY_EXPECTATION_CHECK_WORKFLOW_ID` | `04_generate_expectation_check` |
| `DAILY_TOMORROW_OUTLOOK_WORKFLOW_ID` | `05_generate_tomorrow_outlook` |
| `DAILY_VIDEO_SCRIPT_WORKFLOW_ID` | `06_generate_video_script` |
| `DAILY_YOUTUBE_METADATA_WORKFLOW_ID` | `07_generate_youtube_metadata` |
| `DAILY_VALIDATE_OUTPUTS_WORKFLOW_ID` | `08_validate_outputs` |
| `DAILY_PUBLISH_GITHUB_WORKFLOW_ID` | `09_publish_to_github` |
| `DAILY_UPDATE_D1_WORKFLOW_ID` | `10_update_d1_state` |
| `FAILURE_NOTIFIER_WORKFLOW_ID` | Shared failure notifier |

---

## Environment-specific notes

### Local development

```
AI_PROVIDER=openai        # or leave unset — defaults to openai
MEDIA_MODE=image_video    # or leave unset — defaults to image_video
RENDER_PROVIDER=          # leave unset — render is skipped, assets packaged only
```

- Leaving `AI_PROVIDER` and `MEDIA_MODE` unset is safe — defaults are applied automatically.
- Set `RENDER_PROVIDER` only when you have a Shotstack or Creatomate account and
  want to test the full video render path locally.
- Use `OPENAI_API_KEY` or `GOOGLE_API_KEY` credential in n8n depending on which
  provider you are testing.

### Staging

```
AI_PROVIDER=openai
MEDIA_MODE=image_video
RENDER_PROVIDER=none      # or shotstack if you have a staging API key
```

- Set both variables explicitly in staging so behavior is not environment-dependent.
- Use a separate OpenAI/Google key with a spending cap for staging.
- Test the Google provider path by setting `AI_PROVIDER=google` with a valid `GOOGLE_API_KEY`.

### Production

```
AI_PROVIDER=openai        # or google — set explicitly, never rely on defaults
MEDIA_MODE=image_video    # set explicitly
RENDER_PROVIDER=shotstack # or creatomate — set with corresponding API key
```

- Always set `AI_PROVIDER` and `MEDIA_MODE` explicitly in production.
- Rotate API keys via n8n credential update — no workflow JSON changes required.
- `MEDIA_MODE=full_video` must not be set in production until a compatible
  provider is available and the full-video pipeline is implemented.

---

## Source of truth

| Artifact | Purpose |
|----------|---------|
| `app/src/utils/mediaMode.js` | Canonical JS definitions for modes, capabilities, and `parseMediaModeConfig` |
| `app/src/utils/openaiConfig.js` | Canonical JS definitions for provider config, model defaults, and `parseAIProviderConfig` |
| `config/media-mode.json` | n8n-readable reference mirror of `mediaMode.js` |
| `workflows/contracts/workflow_runtime_config.json` | JSON Schema contract for the `ai_provider` and `media_mode` fields in the run context |
| `workflows/n8n/daily/orchestrator.json` | Build Topic Context node — single point of runtime config resolution and validation |
