# Image-Based Daily Video Pipeline — v1 Default

## Overview

The image-based video pipeline is the **default v1 media strategy** for Modern Content Platform daily videos.

It is cheaper and more reliable than full AI-generated video, and it produces upload-ready MP4 files with captions suitable for YouTube.

The pipeline is activated automatically when `MEDIA_MODE=image_video` (the default).

---

## Pipeline stages

The media pipeline runs as part of the daily editorial flow, after the core summary and script generation steps.

```
06  Generate Video Script
 │
 └─ Check Media Mode ──[image_video]──► 06b Generate Images
                                              │
                                        06c Generate Narration
                                              │
                                        06d Render Video
                                              │
                        [other mode] ──► 07  Generate YouTube Metadata
```

### Stage details

| Step | Module | Input | Output | Provider |
|------|--------|-------|--------|----------|
| Script generation | `06_generate_video_script.json` | Daily summary | `video_script` (structured JSON) | OpenAI / Google |
| Image generation | `06b_generate_images.json` | Summary + topic style hint | `image_assets` | OpenAI DALL-E / Google Imagen |
| Narration (TTS) | `06c_generate_narration.json` | `video_script` text (intro + segments + outro concatenated) | `narration_asset` (base64 MP3) | OpenAI TTS / Google TTS |
| Render & captions | `06d_render_video.json` | Images + narration + `video_script` | `render_video_asset` (render manifest + SRT captions) | Shotstack / Creatomate |

All media stages are **non-blocking**. If a stage fails, the daily editorial pipeline continues and publishes text content to GitHub. Failed or missing assets are recorded in the `*_warnings` fields of the generation output.

---

## Asset contracts

### `image_assets` — `schemas/ai/image_generation_asset.json`

Produced by `06b_generate_images.json`. Contains:
- `images[]` — array of generated images (up to 4)
- `image_count` — number of images generated
- `provider` — `openai` or `google`
- `model` — model used (e.g. `gpt-image-1`, `imagen-3.0-generate-001`)

Each image has either a temporary `url` (OpenAI) or inline `b64_json` (Google).

> The `url` and `b64_json` fields are available in the workflow context but are **not** committed to GitHub. The `images.json` manifest in GitHub contains only metadata (prompt, provider, model, format).

### `narration_asset` — `schemas/ai/narration_asset.json`

Produced by `06c_generate_narration.json`. Contains:
- `audio_b64` — base64-encoded MP3 audio of the narration
- `provider` — `openai` or `google`
- `model` — model used (e.g. `gpt-4o-mini-tts`, `en-US-Chirp3-HD-Aoede`)
- `voice` — voice name used
- `char_count` — character count of input text

> The `audio_b64` field is available in the workflow context (used by the render step) but is **not** committed to GitHub. The `narration.json` manifest in GitHub contains only metadata.

### `render_video_asset` — `schemas/ai/render_video_asset.json`

Produced by `06d_render_video.json`. Contains:
- `status` — `completed`, `pending`, or `failed`
- `render_provider` — `shotstack`, `creatomate`, or `none`
- `render_job_id` — job ID from the render provider
- `video_url` — URL of the rendered MP4 (when `status=completed`)
- `captions_srt` — SRT subtitle file content (always generated from the script)
- `captions_format` — `srt` or `none`
- `duration_seconds` — total video duration
- `has_narration` — whether narration audio was included
- `image_count` — number of images used

---

## Caption generation

Captions are generated **automatically** from the video script inside `06d_render_video.json` (no external API call required). The generation algorithm:

1. Splits each script segment's spoken text into \~8-word lines
2. Assigns cumulative SRT timecodes based on declared `duration_seconds` and a 2.5 words/second narration pace
3. Covers intro, all segments, and outro

The resulting SRT file is:
- Included in the `render_video_asset` for the render provider
- Committed to GitHub in `render.json` for YouTube upload and accessibility use

---

## Render providers

The render step submits the assembled assets (images + audio + captions) to an external render service that produces an MP4.

### Shotstack (recommended v1)

Set `RENDER_PROVIDER=shotstack` and configure `SHOTSTACK_API_KEY` in n8n credentials.

- Accepts image clips, audio tracks, and HTML caption overlays
- Outputs MP4 at 1280×720, 25fps
- Returns a job ID immediately; video URL becomes available via webhook or polling

### Creatomate

Set `RENDER_PROVIDER=creatomate` and configure `CREATOMATE_API_KEY` in n8n credentials.

- Template-based rendering
- Requires `CREATOMATE_TEMPLATE_ID` to be set
- Returns render status and URL in the response

### Fallback (no provider)

When `RENDER_PROVIDER` is not set, the pipeline still runs. The `render_video_asset` will have:
- `status: "failed"`
- `render_provider: "none"`
- `captions_srt` populated (captions are always generated)
- A descriptive `warning` message explaining what to configure

This allows the pipeline to run end-to-end without render credentials while still producing captions and asset manifests.

---

## GitHub content layout

For each daily run, the following files are committed to `content/topics/{topic}/{date}/`:

| File | Always? | Contents |
|------|---------|----------|
| `summary.json` | ✅ | Daily summary, expectation check, tomorrow outlook |
| `article.md` | ✅ | Full written article in Markdown |
| `metadata.json` | ✅ | Metrics, sentiment, topic score |
| `video.json` | ✅ | Video script + YouTube metadata |
| `images.json` | image_video mode only | Image generation manifest (no binary data) |
| `narration.json` | image_video mode only | Narration metadata (no audio binary) |
| `render.json` | image_video mode only | Render manifest including SRT captions |

---

## n8n environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MEDIA_MODE` | No | `image_video` | Media output mode. `image_video` (default) or `full_video` (v2, not yet supported). |
| `AI_PROVIDER` | No | `openai` | AI provider for image and TTS generation. `openai` or `google`. |
| `RENDER_PROVIDER` | No | — | Render service provider. `shotstack` or `creatomate`. Omit to skip rendering. |
| `SHOTSTACK_API_KEY` | Shotstack only | — | API key for Shotstack. |
| `CREATOMATE_API_KEY` | Creatomate only | — | API key for Creatomate. |
| `CREATOMATE_TEMPLATE_ID` | Creatomate only | — | Template ID for Creatomate renders. |
| `AI_IMAGE_COUNT` | No | `1` | Number of images to generate per daily run (1–4). |
| `OPENAI_MODEL_IMAGE_GENERATION` | No | `gpt-image-1` | OpenAI image model override. |
| `GOOGLE_MODEL_IMAGE_GENERATION` | No | `imagen-3.0-generate-001` | Google image model override. |
| `OPENAI_MODEL_TTS` | No | `gpt-4o-mini-tts` | OpenAI TTS model override. |
| `GOOGLE_MODEL_TTS` | No | `en-US-Chirp3-HD-Aoede` | Google TTS model override. |
| `DAILY_GENERATE_IMAGES_WORKFLOW_ID` | Yes | — | n8n workflow ID for `06b_generate_images`. |
| `DAILY_GENERATE_NARRATION_WORKFLOW_ID` | Yes | — | n8n workflow ID for `06c_generate_narration`. |
| `DAILY_RENDER_VIDEO_WORKFLOW_ID` | Yes | — | n8n workflow ID for `06d_render_video`. |

---

## Output suitability for YouTube upload

The `render_video_asset` is designed to be upload-ready:

- **Video**: MP4 at 1280×720 (HD), 25fps — meets YouTube minimum requirements
- **Duration**: driven by the script's `total_duration_seconds` (60–600 seconds)
- **Captions**: SRT format, compatible with YouTube's closed caption upload
- **Title and description**: available in `youtube_metadata` (from `07_generate_youtube_metadata.json`)

### Recommended upload flow

1. Check `render_video_asset.status === 'completed'`
2. Download `render_video_asset.video_url`
3. Use `youtube_metadata.title`, `.description`, and `.tags` for the upload
4. Upload `render_video_asset.captions_srt` as a SRT caption track

---

## Fallback handling

The pipeline is designed to degrade gracefully:

| Failure | Effect | Pipeline outcome |
|---------|--------|-----------------|
| Image generation fails | `image_assets` is null; warning recorded | Pipeline continues |
| Narration generation fails | `narration_asset` is null; warning recorded | Render runs without audio (silent video or skipped) |
| Render provider not configured | `render_video_asset.status = failed`; captions still generated | Pipeline continues |
| Render provider API error | `render_video_asset.status = failed`; warning recorded | Pipeline continues |
| All media steps fail | Text content still published to GitHub | Partial success |

Non-blocking failures in media steps are surfaced through:
- `image_asset_warnings` in the generation output
- `narration_asset_warnings` in the generation output
- `render_video_asset_warnings` in the generation output
- The `warning` field on each individual asset

---

## Provider abstraction

The pipeline is designed for provider interchangeability:

- **Image providers**: `openai` (DALL-E / gpt-image-1) and `google` (Imagen) share the same `image_generation_asset` output schema. Switch by setting `AI_PROVIDER`.
- **TTS providers**: `openai` and `google` share the same `narration_asset` output schema. Switch by setting `AI_PROVIDER`.
- **Render providers**: `shotstack` and `creatomate` produce the same `render_video_asset` output schema. Switch by setting `RENDER_PROVIDER`.

Adding a new provider requires:
1. Adding a route branch in the relevant workflow (`06b`, `06c`, or `06d`)
2. Updating the provider capability flags in `mediaMode.js`

---

## Related files

| File | Purpose |
|------|---------|
| `app/src/utils/mediaMode.js` | Media mode constants, provider capability flags, config parsing |
| `schemas/ai/image_generation_asset.json` | Image asset output schema |
| `schemas/ai/narration_asset.json` | Narration asset output schema |
| `schemas/ai/render_video_asset.json` | Render video asset output schema |
| `schemas/ai/video_script.json` | Video script AI output schema |
| `workflows/contracts/daily_generation_output.json` | Full daily generation output contract |
| `workflows/n8n/daily/06_generate_video_script.json` | Script generation module |
| `workflows/n8n/daily/06b_generate_images.json` | Image generation module |
| `workflows/n8n/daily/06c_generate_narration.json` | TTS narration module |
| `workflows/n8n/daily/06d_render_video.json` | Render & caption export module |
| `workflows/n8n/daily/orchestrator.json` | Daily orchestrator (wires the pipeline together) |
