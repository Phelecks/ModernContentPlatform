# Media Asset Lifecycle

This document defines how generated media assets — images, narration audio, rendered videos, captions, and social media derivatives — are stored, named, versioned, and cleaned up across the Modern Content Platform.

It complements:

- [`docs/image-video-pipeline.md`](../image-video-pipeline.md) — pipeline stages and asset contracts
- [`docs/architecture/full-video-mode.md`](../architecture/full-video-mode.md) — reserved future media mode
- [`docs/operations/rerun-recovery.md`](./rerun-recovery.md) — how reruns interact with assets

The goal is predictable, sustainable media handling as daily output volume grows across topics.

---

## 1. Asset taxonomy

The platform produces three classes of media asset, each with a different lifecycle.

| Class | Examples | Binary committed to GitHub? | Canonical store |
|-------|----------|-----------------------------|-----------------|
| **Manifest** | `images.json`, `narration.json`, `render.json`, `video.json`, captions SRT inside `render.json` | ✅ Yes (small JSON, no binaries) | GitHub repo |
| **Temporary** | OpenAI image URL (≈1h), Google Imagen `b64_json` blob, TTS `audio_b64` blob, render provider input bundles | ❌ No | n8n workflow context only |
| **Final binary** | Rendered MP4 (uploaded to YouTube), social PNG/MP4 derivatives | ❌ No | YouTube + render provider CDN; not in GitHub |

The platform deliberately keeps **only manifests** in GitHub. Binary media lives in the systems best suited to host it (YouTube for the canonical video, the render provider for short-term MP4 access, and the n8n workflow context for in-flight blobs).

---

## 2. Storage locations by environment

| Asset | Local dev | Staging | Production |
|-------|-----------|---------|------------|
| Manifests (`images.json`, `narration.json`, `render.json`, `video.json`) | GitHub feature branch under `content/topics/{topic_slug}/{date_key}/` | GitHub branch `staging` (preview) | GitHub branch `main` (production) |
| Image binaries (OpenAI URL / Google `b64_json`) | n8n run memory only; expires when the workflow completes | Same | Same |
| Narration audio (`audio_b64`) | n8n run memory only | Same | Same |
| Rendered MP4 (Shotstack / Creatomate) | Provider-hosted CDN URL with provider-specific TTL (Shotstack: 24h on free, longer on paid plans; Creatomate: 30d default) | Same | Same — but YouTube becomes the canonical store as soon as upload succeeds |
| Captions (SRT) | Inline in `render.json` (manifest) | Same | Same |
| YouTube-hosted MP4 + captions | n/a (no upload from local) | Staging YouTube channel (or skipped) | Production YouTube channel |
| Social derivatives (Meta image/Story, X media) | Generated on-the-fly per post; not persisted | Same | Same |

Pages Functions, the Vue frontend, and Cloudflare D1 **do not store media binaries**. D1 stores only references and state (publish job status, social publish log rows, YouTube `video_id` references after upload).

---

## 3. Naming and path conventions

### 3.1 GitHub manifests

All daily editorial manifests live under a deterministic path:

```
content/topics/{topic_slug}/{date_key}/{file}
```

- `topic_slug` — stable lowercase slug (e.g. `crypto`, `finance`).
- `date_key` — `YYYY-MM-DD` in UTC.
- `{file}` — fixed filename per asset class:

| File | Required | Source |
|------|----------|--------|
| `summary.json` | always | `02_generate_summary` |
| `article.md` | always | `02_generate_summary` |
| `metadata.json` | always | `09_publish_to_github` |
| `video.json` | always | `06_generate_video_script` (+ `16_update_video_reference` after YouTube upload) |
| `images.json` | image_video mode | `06b_generate_images` (manifest only — no `url` or `b64_json`) |
| `narration.json` | image_video mode | `06c_generate_narration` (manifest only — no `audio_b64`) |
| `render.json` | image_video mode | `06d_render_video` (includes `captions_srt` inline) |

Filenames are **stable**. Reruns overwrite in place; they never produce `summary.v2.json` or similar variants. History is provided by Git.

### 3.2 In-flight asset identifiers

Inside the workflow context, assets carry deterministic provenance fields used by downstream steps and observability:

- `provider` — `openai` | `google` | `shotstack` | `creatomate`
- `model` — provider model identifier (e.g. `gpt-image-1`, `imagen-3.0-generate-001`, `gpt-4o-mini-tts`)
- `generated_at` — ISO 8601 UTC timestamp from the producing step
- `index` — image position (0-based) within the daily image batch
- `render_job_id` — the render provider's job id; used for status polling and operator audit

These fields are also persisted in the GitHub manifests so the binary that lived only in n8n memory remains traceable.

### 3.3 Render provider artifacts

When the render provider (Shotstack/Creatomate) returns an MP4 URL, that URL is captured in `render.json` as `video_url`. The URL is provider-hosted and **must be treated as ephemeral** (see §6). The canonical post-render store is YouTube, and the YouTube `video_id` is written to `video.json` by `16_update_video_reference`.

### 3.4 YouTube assets

- Each daily run produces at most one YouTube video per topic/date.
- Title, description, tags, and SRT captions are sourced from `youtube_metadata` and `render.json:captions_srt`.
- YouTube's `video_id` is the canonical reference — it is the only video identifier kept in any data store other than YouTube itself.

### 3.5 Social derivatives

Social images and short videos (Meta, X, Telegram, Discord) are derived from the same daily run. They are:

- **Not** persisted as separate files in GitHub.
- **Not** stored in D1.
- Either re-derived from manifests at post time, or uploaded directly to the social platform whose API then becomes the canonical store.
- Logged in `meta_social_publish_log` / `social_publish_log` with the platform-side post id.

---

## 4. Temporary vs final assets

The classification below determines who is responsible for cleanup and how long an asset is expected to be addressable.

### Temporary

| Asset | Lifetime | Held by |
|-------|----------|---------|
| OpenAI image URL | ~1 hour after generation | Provider |
| Google Imagen `b64_json` | n8n workflow context | n8n run |
| TTS `audio_b64` | n8n workflow context | n8n run |
| Render input bundle | duration of the render job | Render provider |
| Render output URL (`video_url`) | provider TTL (Shotstack ≥24h, Creatomate ~30d) | Render provider |

Temporary assets must be **consumed within the same daily run**. Any consumer (rendering, YouTube upload) that needs them later is required to capture a durable copy first (e.g. download MP4 then upload to YouTube).

### Final

| Asset | Canonical store | Retention |
|-------|-----------------|-----------|
| `summary.json`, `article.md`, `metadata.json`, `video.json`, `images.json`, `narration.json`, `render.json` | GitHub (`main` branch) | Indefinite (Git history) |
| Rendered MP4 | YouTube | YouTube channel retention policy |
| YouTube captions (SRT) | YouTube + GitHub `render.json` | Indefinite |
| Social posts | Each social platform | Platform retention |

Final assets must always be reachable via the manifests committed to GitHub, plus the YouTube `video_id` written back to `video.json`.

---

## 5. Versioning rules

The platform uses **immutable date-keyed paths** plus **mutable file content**:

- Path is keyed by `(topic_slug, date_key)`. The combination is the version key.
- File content is replaced in place by reruns. Each rerun produces a Git commit on the editorial branch (e.g. `daily(crypto): summary for 2025-01-15`), so prior content is recoverable from Git history.
- There is **no** `summary.v2.json`, no `_rev` suffix, no date-time-stamped variants. This keeps frontend routes (`/{topic}/{date}`) deterministic and avoids stale-file accumulation.
- The `youtube_video_id` in `video.json` is **append-only** in practice: once a successful YouTube upload has occurred for a day, the orchestrator does not re-upload; reruns of the publish step preserve the existing id (see [`16_update_video_reference.json`](../../workflows/n8n/daily/16_update_video_reference.json)).
- D1 rows (`publish_jobs`, `rerun_log`, `social_publish_log`, `meta_social_publish_log`, `openai_usage_log`) are append-only with `attempt` numbers and timestamps; they form the audit trail for asset versions.

---

## 6. Cleanup policy

| Layer | Cleanup action | Frequency |
|-------|----------------|-----------|
| n8n workflow context | Automatic — context discarded when the run ends. No `b64_json` or `audio_b64` is persisted to disk. | Every run |
| Render provider (Shotstack / Creatomate) | Provider-managed retention (24h–30d). The platform does **not** rely on it beyond the same-day YouTube upload window. | Provider TTL |
| GitHub | No deletion in v1. Daily manifests accumulate with Git history. | Never (v1) |
| YouTube | Manual via channel admin for takedowns or compliance. | Ad hoc |
| D1 logs (`openai_usage_log`, `social_publish_log`, `meta_social_publish_log`, `rerun_log`) | Retained per [`docs/operations/secrets-management.md`](./secrets-management.md) and observability rollups. v1: keep ≥90 days. | TBD via separate cleanup job |
| Local dev | `scripts/local-reset.sh` resets D1; n8n local runs hold no media after completion. | On demand |

In v1 there is **no scheduled deletion** of GitHub manifests. If GitHub volume becomes a concern (≫1 year of daily output across many topics), a future archival job can move old `content/topics/**` paths into a separate archive branch or repo. Until then, the simplicity of "everything ever published is in `main`" is preferred.

---

## 7. Rerender and replacement behaviour

Reruns are governed by `publish_jobs` state and the rerun workflows documented in [`rerun-recovery.md`](./rerun-recovery.md). The media-specific rules are:

1. **Idempotent path.** A rerun for `(topic_slug, date_key)` writes to the same paths under `content/topics/{topic_slug}/{date_key}/`. Existing files are overwritten; missing files are created.
2. **Non-blocking media steps.** If `06b`, `06c`, or `06d` failed previously, a rerun re-attempts them. If a rerun re-succeeds where a previous run failed, the manifest appears for the first time; this is treated as a normal additive change.
3. **YouTube guardrail.** Once `youtube_video_id` is set in `video.json`, the orchestrator skips re-uploading the rendered MP4. To force a new upload, an operator must clear `youtube_video_id` (manual edit + commit) before triggering the rerun. This protects against duplicate YouTube uploads on retry.
4. **Render provider guardrail.** A rerun submits a new render job; the previous `render_job_id` is overwritten in `render.json`. The previous provider-hosted MP4 will expire on its own provider TTL — no explicit cleanup is required.
5. **Captions are deterministic.** Captions SRT is regenerated from the script every time `06d` runs, so reruns always produce a consistent caption file regardless of the previous run state.
6. **Partial success preserved.** A rerun cannot delete a manifest that was already committed by a previous run unless that run wrote a new value. Operators wanting to remove an asset (e.g. an image manifest) must do so via a manual Git revert on the content branch.
7. **Social derivatives are not rerun automatically.** Triggering `rerun_social_publish` or `rerun_youtube_upload` re-uses the existing manifests and binaries; it does not regenerate images or narration. To regenerate media itself, the daily publish must be rerun first.

---

## 8. GitHub vs non-GitHub boundary

The boundary follows the platform's general responsibility split.

**GitHub stores:** manifests, captions SRT, article markdown, summary JSON, metadata JSON, video.json with `youtube_video_id`. Anything that is small, JSON or markdown, and that the frontend reads at build time.

**GitHub does not store:** image PNG/JPEG bytes, TTS audio bytes, rendered MP4 bytes, Shotstack/Creatomate render bundles. Anything binary, large, or with intrinsic provider TTL.

Consequence for the frontend:

- Vue components (`VideoEmbed`, day pages) consume `video.json:video_id` and embed the YouTube player. They never serve raw MP4 from GitHub.
- Topic/day pages can render `images.json` to display thumbnails by re-deriving from `youtube_metadata.thumbnail_url` (YouTube-served) or, in a future iteration, by hosting derivative thumbnails on Cloudflare Images. **Until that exists, the frontend must not assume any image binary is reachable from a GitHub-hosted URL.**

---

## 9. Operator quick reference

| I want to… | Do this |
|-----------|---------|
| Inspect what was published for a day | Open `content/topics/{topic}/{date}/` on `main` |
| See why an image was generated | Read `images.json` → `images[].prompt` |
| Re-run media for a failed day | Trigger `rerun_daily_publish` (see [rerun-recovery.md](./rerun-recovery.md)) |
| Force a new YouTube upload | Manually clear `youtube_video_id` in `video.json`, commit, then trigger rerun |
| Find a render job's MP4 | Open `render.json` → `video_url` (may have expired; YouTube is canonical) |
| Audit narration provider/voice for a day | Open `narration.json` → `provider`, `model`, `voice` |
| Remove a published asset | Manual `git revert` on the editorial branch — there is no automated deletion |

---

## 10. Out of scope for v1

The following are intentionally not addressed in this version and are tracked as future work:

- Long-term archival of `content/topics/**` to a separate repo or branch.
- Hosting binary image/audio derivatives on Cloudflare Images / R2 with frontend-served URLs.
- Per-asset retention policies in D1 logs (currently a single global ≥90 day window).
- Cross-version diffing of manifests beyond what Git already provides.
- Full-video mode lifecycle (covered separately in [`full-video-mode.md`](../architecture/full-video-mode.md) once a provider is selected).
