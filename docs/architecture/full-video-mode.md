# Full-Video Generation Mode — Design and Implementation Guide

## Overview

`MEDIA_MODE=full_video` is a **non-default, optional media mode** reserved for
future use. It defines the expected pipeline behaviour, provider requirements,
asset contracts, and workflow branching for producing a fully AI-generated video
from the daily editorial content.

This mode is **not available in v1**. No currently supported provider (OpenAI,
Google) offers native full-video generation in the v1 configuration. The mode is
fully defined so it can be enabled cleanly when a compatible provider becomes
available, without disrupting the default `image_video` pipeline.

---

## Why full-video is not the default v1 path

The default v1 media strategy is `MEDIA_MODE=image_video`. This decision is
deliberate:

| Dimension | `image_video` (v1 default) | `full_video` (future) |
|---|---|---|
| Provider availability | OpenAI (gpt-image-1, TTS) and Google (Imagen, TTS) — supported today | Requires a provider with native video generation — not available in v1 |
| Cost per daily run | ~$0.05–$0.20 (1 image + TTS narration + render) | Estimated $1–$10+ per minute of AI-generated video — significantly higher |
| Reliability | Stable provider APIs with known failure modes and fallbacks | Early-stage APIs with higher latency, rate limits, and quality variance |
| Output quality | Consistent visual style with photorealistic images; known render quality | Quality and consistency depend heavily on provider maturity |
| Pipeline complexity | Three discrete steps (image generation, TTS, render) with independent fallbacks | Single integrated step with fewer recovery options on failure |
| Time to first run | Works today with existing credentials | Requires a new provider integration and API key |

Choosing `image_video` as the v1 default keeps the daily pipeline reliable,
affordable, and fast to deploy, while preserving a clean path to full-video when
providers mature.

---

## Mode definition

In `app/src/utils/mediaMode.js` and `config/media-mode.json`:

```json
"full_video": {
  "description": "Full AI-generated video. Requires a provider with native video generation capability. Not yet supported by any v1 provider. Reserved for future use.",
  "workflowSteps": ["06_video_script", "06_full_video_generation"],
  "requiredCapabilities": ["fullVideoGeneration"],
  "available": false
}
```

`available: false` marks the mode as reserved for future use in v1, but it is
not, by itself, the current startup enforcement mechanism. In the current v1
implementation, `full_video` is rejected because it requires the
`fullVideoGeneration` capability, and no supported provider advertises that
capability. This still causes the pipeline to fail loudly with a clear
`MEDIA_MODE_CONFIG_ERROR` during media-mode validation, rather than silently
producing incomplete output.

---

## Provider requirements

A provider must have `fullVideoGeneration: true` in
`MEDIA_PROVIDER_CAPABILITIES` (in `mediaMode.js`) to be compatible with this mode.

**v1 provider status:**

| Provider | imageGeneration | tts | fullVideoGeneration |
|---|---|---|---|
| `openai` | ✅ | ✅ | ❌ not available in v1 |
| `google` | ✅ | ✅ | ❌ not available in v1 |

**Minimum requirements for a full-video capable provider:**

1. Accepts a scene-level prompt or a structured script as input
2. Returns a video URL (synchronously or via async job polling)
3. Supports output resolutions of at least 1280×720 (HD)
4. Produces videos of at least 60 seconds duration
5. Exposes a job ID for async polling or a webhook for completion notification
6. Has a stable REST API compatible with n8n HTTP Request or native nodes

**How to add a new provider:**

1. Add the provider slug to `MEDIA_PROVIDER_CAPABILITIES` in `mediaMode.js`:
   ```js
   new_provider: {
     imageGeneration: false,
     tts: false,
     fullVideoGeneration: true,
   }
   ```
2. Mirror the change in `config/media-mode.json` under `providerCapabilities`.
3. Implement the generation call in the `Full Video Generation` Code node inside
   `workflows/n8n/daily/06_full_video_generation.json`.
4. Add the provider slug to `FULL_VIDEO_CAPABLE_PROVIDERS` in that workflow.
5. Set `AI_PROVIDER=new_provider` and `MEDIA_MODE=full_video` in n8n variables.

---

## Workflow branching

The daily orchestrator branches on `MEDIA_MODE` after the video script step:

```
06 Generate Video Script
 │
 └─ Check Media Mode
       │
       ├─[image_video]─► 06b Generate Images
       │                       │
       │                 06c Generate Narration
       │                       │
       │                 06d Render Video
       │                       │
       └─[full_video]──► 06  Full Video Generation   ← this mode
                               │
                         07 Generate YouTube Metadata
```

When `MEDIA_MODE=full_video`, steps `06b`, `06c`, and `06d` are skipped entirely.
The `full_video_generation_asset` produced by step `06` replaces the combined
output of those three steps.

The orchestrator currently treats the `full_video` branch as a no-op that routes
directly to step 07 (YouTube Metadata), consistent with `available: false`. When
a capable provider is added, the orchestrator branch must be updated to call
`06_full_video_generation` as an Execute Workflow node.

---

## Expected asset contracts

### `full_video_generation_asset` — `schemas/ai/full_video_generation_asset.json`

Produced by `06_full_video_generation.json`. Contains:

| Field | Type | Description |
|---|---|---|
| `topic_slug` | string | Topic this video belongs to |
| `date_key` | string | YYYY-MM-DD date key |
| `status` | `completed` \| `pending` \| `failed` | Generation status |
| `provider` | string | Provider slug (e.g. `new_provider`) |
| `model` | string \| null | Model identifier |
| `generation_job_id` | string \| null | Async job ID for polling |
| `video_url` | string \| null | URL of the generated MP4 |
| `duration_seconds` | number \| null | Total video duration |
| `resolution` | string \| null | Output resolution (e.g. `1280x720`) |
| `captions_srt` | string \| null | SRT subtitle content (always generated from script) |
| `captions_format` | `srt` \| `none` | Caption format |
| `scene_count` | integer \| null | Number of scenes (maps to script segments) |
| `prompt_tokens` | integer \| null | Token count for cost tracking |
| `generated_at` | string | ISO 8601 creation timestamp |
| `warning` | string \| null | Warning message on failure or caveat |

### GitHub content layout (when full_video mode is active)

For each daily run, these files are committed to
`content/topics/{topic}/{date}/`:

| File | Contents |
|---|---|
| `summary.json` | Daily summary, expectation check, tomorrow outlook (unchanged) |
| `article.md` | Full written article in Markdown (unchanged) |
| `metadata.json` | Metrics, sentiment, topic score (unchanged) |
| `video.json` | Video script + YouTube metadata (unchanged) |
| `full_video.json` | Full video generation manifest (replaces `images.json`, `narration.json`, `render.json`) |

`full_video.json` contains the `full_video_generation_asset` object. Binary
video data is never committed to GitHub — only the `video_url` and metadata.

### Comparison with `image_video` assets

| Asset | `image_video` mode | `full_video` mode |
|---|---|---|
| Images | `images.json` (manifest + prompts) | Not used |
| Narration audio | `narration.json` (metadata only) | Not used |
| Render manifest | `render.json` (SRT + render job) | Not used |
| Full video | Not used | `full_video.json` (video URL + metadata) |
| Captions | SRT from `render.json` | SRT from `full_video.json` |

---

## Cost and capability caveats

### Cost

Full AI video generation is substantially more expensive than the image-based
approach:

| Cost component | `image_video` (estimate) | `full_video` (estimate) |
|---|---|---|
| Image generation | $0.04–$0.08 per image | Not applicable |
| TTS narration | $0.01–$0.03 per run | Not applicable |
| Video render | $0.02–$0.10 per render | Not applicable |
| Full video generation | Not applicable | $1–$10+ per minute of output |
| **Total per daily run** | **~$0.07–$0.21** | **~$2–$30+** |

At 7 topics/day, full-video mode could cost $14–$210+ per day compared to
~$0.50–$1.50 for `image_video`. Cost controls and quotas must be in place before
enabling this mode in production.

### Capability caveats

- **Async generation**: Full video generation typically takes 1–5 minutes per
  video. The workflow must handle async job polling or webhook callbacks. The
  `generation_job_id` field supports this pattern.
- **Quality variance**: Early AI video generation APIs produce inconsistent
  quality, especially for talking-head or data-driven content. Expect higher
  rejection rates during provider evaluation.
- **Content policy**: Video generation providers apply their own content policies
  independently of image generation. Test carefully with financial and news content
  before committing to a provider.
- **Rate limits**: Video generation quotas are typically much lower than image or
  TTS quotas. Multi-topic daily runs may exhaust quotas quickly.
- **Output format**: Confirm the provider produces standard MP4 at 1280×720 or
  higher before integrating. Some providers output proprietary formats that
  require transcoding.

---

## Compatibility notes

- The `full_video` mode is fully defined in `mediaMode.js` and validated by
  `parseMediaModeConfig`. Setting `MEDIA_MODE=full_video` with any v1 provider
  throws a clear `MEDIA_MODE_CONFIG_ERROR` at orchestrator startup.
- The `full_video` mode does not affect the intraday alert pipeline in any way.
- The `full_video` mode does not affect the Vue frontend. The `VideoEmbed`
  component reads `video.json` for a YouTube video ID and is provider-agnostic.
- The `full_video` mode does not change the editorial content committed to
  GitHub (`summary.json`, `article.md`, `metadata.json`, `video.json`).
- The workflow branch stub `06_full_video_generation.json` exists as a
  placeholder. It will fail gracefully with a `status: "failed"` asset and a
  warning if reached. This prevents silent data loss if the mode is accidentally
  activated before a provider is ready.
- Adding a new capable provider requires changes to **both** `mediaMode.js`/`config/media-mode.json`
  **and** the `Check Media Mode` Code node inside `orchestrator.json`. The
  orchestrator currently validates `MEDIA_MODE`/`AI_PROVIDER` with its own
  hard-coded provider lists (separate from `mediaMode.js`). When a new provider
  is added, update the `MEDIA_PROVIDER_CAPABILITIES` and
  `MODE_REQUIRED_CAPABILITIES` objects in that Code node to match (or refactor
  it to read from `config/media-mode.json` at runtime). Skipping this step
  means the orchestrator will still reject the new provider even after
  `mediaMode.js` is updated. The JS utility is the canonical source of truth for
  the definitions; `orchestrator.json` is the runtime enforcement point.

---

## Implementation plan (when enabling full_video)

Complete these steps in order when a capable provider becomes available:

1. **Provider evaluation** — Confirm the provider meets the minimum requirements
   (section above). Test a sample run manually before wiring into n8n.

2. **Add provider capability** — Add the provider slug to
   `MEDIA_PROVIDER_CAPABILITIES` in `mediaMode.js` and mirror in
   `config/media-mode.json`. Then update the `MEDIA_PROVIDER_CAPABILITIES` and
   `MODE_REQUIRED_CAPABILITIES` objects in the `Check Media Mode` Code node
   inside `orchestrator.json` to match — the orchestrator validates these at
   runtime independently of `mediaMode.js`.

3. **Implement generation call** — In `06_full_video_generation.json`, add the
   provider slug to `FULL_VIDEO_CAPABLE_PROVIDERS` and implement the API call
   after the guard block. The output must conform to
   `schemas/ai/full_video_generation_asset.json`.

4. **Handle async polling** — If the provider is async, implement a polling loop
   or a webhook sub-workflow. Store `generation_job_id` in D1 `publish_jobs` if
   polling spans orchestrator runs.

5. **Update orchestrator branch** — In `orchestrator.json`, update the
   `full_video` branch to call `06_full_video_generation` as an Execute Workflow
   node instead of routing directly to step 07.

6. **Update validation (module 08)** — Add `full_video_generation_asset` to the
   output validation checks in `08_validate_outputs.json`.

7. **Update GitHub publish (module 09)** — Add `full_video.json` to the files
   committed by `09_publish_to_github.json` when `MEDIA_MODE=full_video`.

8. **Test end-to-end** — Run a full daily cycle for one topic with
   `MEDIA_MODE=full_video` and confirm:
   - `full_video.json` is committed to GitHub
   - `video_url` is reachable and playable
   - Captions SRT is correct
   - YouTube metadata is generated
   - D1 status is updated correctly

9. **Set n8n variables** — Switch production to the new mode by setting
   `MEDIA_MODE=full_video` and `AI_PROVIDER=<new_provider>` in n8n variables.

---

## Failure handling

The `full_video` mode follows the same non-blocking failure policy as the
`image_video` media steps:

| Failure | Effect | Pipeline outcome |
|---|---|---|
| Provider capability check fails | `full_video_generation_asset.status = failed`; warning recorded | Pipeline continues to step 07 |
| Provider API error | `full_video_generation_asset.status = failed`; warning recorded | Pipeline continues to step 07 |
| Async job timeout | `full_video_generation_asset.status = pending`; warning recorded | Pipeline continues; video URL filled by a follow-up job |
| All media steps fail | Text content still published to GitHub | Partial success |

Captions are always generated from the video script regardless of video
generation status, ensuring accessibility content is always available.

---

## Related files

| File | Purpose |
|---|---|
| `app/src/utils/mediaMode.js` | Media mode constants, provider capability flags, config parsing |
| `config/media-mode.json` | n8n-readable mirror of mode definitions and provider capabilities |
| `schemas/ai/full_video_generation_asset.json` | Asset output contract for full-video generation |
| `workflows/n8n/daily/06_full_video_generation.json` | Workflow stub for full-video generation |
| `workflows/n8n/daily/orchestrator.json` | Daily orchestrator — contains the `Check Media Mode` branching node |
| `docs/image-video-pipeline.md` | Default v1 image-based pipeline design |
| `app/src/__tests__/utils/mediaMode.test.js` | Tests validating full_video mode constants, definitions, and error behaviour |
| `fixtures/media-mode/invalid-full-video-openai.json` | Fixture confirming full_video + openai throws MEDIA_MODE_CONFIG_ERROR |
