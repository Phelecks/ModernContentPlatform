# YouTube Publishing Integration — Architecture

## Overview

Modules 15 and 16 of the daily editorial workflow handle YouTube video
uploading and video reference linking. After the daily video is rendered
(module 06d) and all editorial content is published to GitHub (module 09),
the YouTube upload module uploads the video to YouTube using the YouTube
Data API v3, and the video reference module writes the returned video ID
back into `video.json` on GitHub so the frontend can embed it.

This document covers:

1. Pipeline position
2. Prerequisites and gating
3. YouTube credentials setup
4. Upload flow (module 15)
5. Video reference update flow (module 16)
6. video.json content model
7. Publish logging
8. Frontend embed flow
9. Retry and error behaviour
10. Environment variables
11. Verification checklist

---

## Pipeline Position

Modules 15 and 16 run after all social publishing modules and are the final
steps in the daily editorial pipeline:

```
10 Update D1 State
  ├─ → Process Topics (loop)
  └─ → 11 Generate Meta Social
         └─ 12 Publish Meta Daily
               └─ 15 YouTube Upload        ← this module
                     └─ 16 Update Video Reference  ← this module
```

Both modules are **non-blocking**. If YouTube upload fails or is skipped,
the daily editorial pipeline has already published all text and metadata
content to GitHub. The video upload is an additive enhancement.

---

## Prerequisites and Gating

Module 15 checks the following before attempting an upload:

| Check | Required value | Skip reason |
|-------|----------------|-------------|
| `ENABLE_YOUTUBE_UPLOAD` | `'true'` | Feature toggle is off |
| `render_video_asset.status` | `'completed'` | Video render did not complete |
| `render_video_asset.video_url` | Non-empty string | No video file available |
| `youtube_metadata.title` | Non-empty string | No title for the upload |
| `youtube_metadata.description` | Non-empty string | No description for the upload |

When any prerequisite is not met, the module skips gracefully and logs the
skip reason. No error is raised.

---

## YouTube Credentials Setup

### 1. Create a Google Cloud project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (e.g. `modern-content-platform`)
3. Enable the **YouTube Data API v3**

### 2. Create OAuth 2.0 credentials

1. Navigate to **APIs & Services → Credentials**
2. Click **Create Credentials → OAuth 2.0 Client ID**
3. Set application type to **Web application**
4. Add the n8n OAuth callback URL as an authorized redirect URI:
   `https://your-n8n-host/rest/oauth2-credential/callback`
5. Copy the **Client ID** and **Client Secret**

### 3. Configure in n8n

1. In n8n, go to **Credentials → New Credential → OAuth2 API**
2. Name: `YouTubeOAuth2`
3. Set:
   - **Authorization URL**: `https://accounts.google.com/o/oauth2/v2/auth`
   - **Access Token URL**: `https://oauth2.googleapis.com/token`
   - **Client ID**: from step 2
   - **Client Secret**: from step 2
   - **Scope**: `https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube`
4. Click **Connect** and authorize with the YouTube channel account
5. The credential is now available for the upload workflow

### 4. Set n8n Variables

| Variable | Value | Purpose |
|----------|-------|---------|
| `ENABLE_YOUTUBE_UPLOAD` | `true` | Feature toggle |
| `YOUTUBE_DEFAULT_VISIBILITY` | `public` | Default video visibility |
| `YOUTUBE_CATEGORY_ID` | `25` | YouTube category (25 = News & Politics) |
| `DAILY_YOUTUBE_UPLOAD_WORKFLOW_ID` | (workflow ID) | n8n workflow ID for module 15 |
| `DAILY_UPDATE_VIDEO_REFERENCE_WORKFLOW_ID` | (workflow ID) | n8n workflow ID for module 16 |

---

## Upload Flow — Module 15

### Step-by-step

1. **Check Upload Prerequisites** — Validates feature toggle, render status,
   and metadata availability. Skips if prerequisites are not met.

2. **Download Rendered Video** — Downloads the rendered MP4 from
   `render_video_asset.video_url` (Shotstack/Creatomate output URL).

3. **Initiate YouTube Resumable Upload** — Sends metadata (title, description,
   tags, category, visibility) to the YouTube Data API v3 resumable upload
   endpoint. Receives an upload URI in the `Location` header.

4. **Upload Video to YouTube** — PUTs the video binary to the resumable
   upload URI. The API returns the full video resource on completion.

5. **Extract Video ID** — Parses `response.id` as the YouTube video ID.

6. **Log Upload Result** — Writes to `youtube_publish_log` in D1 via the
   internal API endpoint for operational monitoring.

7. **Write Workflow Log** — Writes a workflow log entry for observability.

### YouTube Data API v3 — Resumable Upload Protocol

The upload uses the [resumable upload protocol](https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol):

1. **POST** to `https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`
   with JSON metadata → returns upload URI in `Location` header
2. **PUT** the video binary to the upload URI → returns the video resource

This is more reliable than simple upload for files larger than 5 MB.

---

## Video Reference Update — Module 16

### Step-by-step

1. **Check Video ID Available** — If `youtube_video_id` is null (upload was
   skipped or failed), skip the update.

2. **Get Existing video.json** — Fetch the current `video.json` from GitHub
   to get its SHA (needed for update).

3. **Build Updated video.json** — Parse the existing content, inject
   `video_id` and `youtube_video_id`, re-serialize.

4. **Write Updated video.json** — PUT to GitHub Contents API with the updated
   content and existing SHA.

5. **Write Workflow Log** — Log the update result.

---

## video.json Content Model

Module 16 updates whatever `video.json` shape already exists on GitHub by
injecting `video_id` and `youtube_video_id`. The file shape depends on how
it was originally published:

**Minimal shape** (legacy or manually created files):

```json
{
  "video_id": "dQw4w9WgXcQ",
  "title": "Crypto Daily — January 15, 2025: Bitcoin ETF Inflows Drive Broad Rally",
  "published_at": "2025-01-15T22:00:00Z"
}
```

**Full shape** (written by module 09 for new daily runs):

```json
{
  "topic_slug": "crypto",
  "date_key": "2025-01-15",
  "title": "Bitcoin Breaks $50K on Record ETF Inflows | Crypto Daily Briefing Jan 15 2025",
  "video_id": "dQw4w9WgXcQ",
  "script": { "..." : "..." },
  "youtube_metadata": {
    "title": "...",
    "description": "...",
    "tags": ["..."],
    "category": "News & Politics",
    "visibility": "public"
  },
  "youtube_video_id": "dQw4w9WgXcQ",
  "generated_at": "2025-01-15T23:30:00.000Z"
}
```

Module 16 only writes `video_id` and `youtube_video_id` — all other fields
are preserved from the existing file. The table below describes the full
shape written by module 09; `video_id`/`youtube_video_id` are null at
module 09 publish time and populated later by module 16.

| Field | When populated | By module |
|-------|----------------|-----------|
| `title` | At publish time | 09 |
| `script` | At publish time | 09 |
| `youtube_metadata` | At publish time | 09 |
| `video_id` | After YouTube upload (null before) | 16 |
| `youtube_video_id` | After YouTube upload (null before) | 16 |
| `generated_at` | At publish time | 09 |
| `published_at` | At publish time (minimal shape) | manual / legacy |

---

## Publish Logging

### youtube_publish_log table (D1)

Every upload attempt is recorded in the `youtube_publish_log` table:

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER | Auto-increment primary key |
| `topic_slug` | TEXT | Topic identifier |
| `date_key` | TEXT | Date in YYYY-MM-DD format |
| `status` | TEXT | `pending`, `uploading`, `published`, `failed`, `skipped` |
| `youtube_video_id` | TEXT | YouTube video ID on success |
| `visibility` | TEXT | `public`, `unlisted`, `private` |
| `attempt` | INTEGER | Attempt number (1-based) |
| `error_message` | TEXT | Error details on failure |
| `created_at` | TEXT | ISO timestamp |
| `updated_at` | TEXT | ISO timestamp |

### Write endpoint

`POST /api/internal/youtube-publish-log`

Authentication: `X-Write-Key` header.

### Workflow logs

Both modules also write to `workflow_logs` via the existing
`POST /api/internal/workflow-logs` endpoint with:
- `module_name`: `'15 YouTube Upload'` or `'16 Update Video Reference'`
- `event_type`: `'completed'`, `'info'` (skip), or `'failure'`
- `metadata_json`: includes `youtube_video_id`, status, skip reason, or error

---

## Frontend Embed Flow

The `VideoEmbed` component reads `video_id` from `video.json`:

```vue
<VideoEmbed :videoId="video.video_id" :title="video.title" />
```

This renders a YouTube iframe embed:
```
https://www.youtube.com/embed/{video_id}
```

When `video_id` is null (upload not yet completed), the component is not
rendered and a placeholder or the video script is shown instead.

---

## Retry and Error Behaviour

| Failure | Behaviour |
|---------|-----------|
| Video download failure | Retry 3×, 5 s backoff |
| YouTube API auth failure | Retry 3×, 5 s backoff; check OAuth2 token refresh |
| Upload initiation failure | Retry 3×, 5 s backoff |
| Upload transfer failure | Retry 3×, 10 s backoff |
| GitHub video.json update failure | Retry 3×, 3 s backoff |
| All retries exhausted | `errorWorkflow` fires — Failure Notifier sends alert |
| Feature toggle off | Graceful skip — no error, logged as 'info' |
| Render not completed | Graceful skip — no error, logged as 'info' |

### Quota management

YouTube Data API v3 has a default quota of **10,000 units/day**.
Each video upload costs **1,600 units**, allowing approximately 6 uploads
per day with the default quota.

If the platform runs more than 6 active topics, request a
[quota increase](https://support.google.com/youtube/contact/yt_api_form)
from Google.

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ENABLE_YOUTUBE_UPLOAD` | No | `false` | Feature toggle for YouTube uploads |
| `YOUTUBE_DEFAULT_VISIBILITY` | No | `public` | Default video visibility |
| `YOUTUBE_CATEGORY_ID` | No | `25` | YouTube category ID (25 = News & Politics) |
| `YOUTUBE_CLIENT_ID` | YouTube only | — | Google OAuth2 client ID |
| `YOUTUBE_CLIENT_SECRET` | YouTube only | — | Google OAuth2 client secret |
| `DAILY_YOUTUBE_UPLOAD_WORKFLOW_ID` | YouTube only | — | n8n workflow ID for module 15 |
| `DAILY_UPDATE_VIDEO_REFERENCE_WORKFLOW_ID` | YouTube only | — | n8n workflow ID for module 16 |

---

## Verification Checklist

After deploying the YouTube publishing integration:

- [ ] Confirm `ENABLE_YOUTUBE_UPLOAD=true` is set in n8n Variables
- [ ] Confirm YouTube OAuth2 credential is connected and authorized
- [ ] Confirm `DAILY_YOUTUBE_UPLOAD_WORKFLOW_ID` is set to module 15's ID
- [ ] Confirm `DAILY_UPDATE_VIDEO_REFERENCE_WORKFLOW_ID` is set to module 16's ID
- [ ] Run the daily editorial workflow for one topic manually
- [ ] Verify the video appears on YouTube with correct title, description, tags
- [ ] Verify `youtube_publish_log` has a `published` entry in D1
- [ ] Verify `video.json` on GitHub has `video_id` and `youtube_video_id` populated
- [ ] Verify the frontend topic/day page shows the embedded YouTube video
- [ ] Simulate a failure (e.g. invalid credentials) and verify:
  - `youtube_publish_log` has a `failed` entry with error message
  - `workflow_logs` has a failure entry
  - The Failure Notifier sends an alert
  - Editorial content (summary, article) is still published correctly

---

## Related Files

| File | Purpose |
|------|---------|
| `workflows/n8n/daily/15_youtube_upload.json` | YouTube upload workflow module |
| `workflows/n8n/daily/16_update_video_reference.json` | Video reference update workflow module |
| `workflows/n8n/daily/orchestrator.json` | Daily orchestrator (wires all modules) |
| `config/youtube-publishing.json` | YouTube publishing configuration |
| `schemas/workflow/write_youtube_publish_log.json` | YouTube publish log write payload schema |
| `schemas/ai/youtube_metadata.json` | YouTube metadata AI output schema |
| `db/migrations/0011_youtube_publish_log.sql` | D1 migration for upload tracking |
| `functions/api/internal/youtube-publish-log.js` | Pages Function write endpoint |
| `functions/lib/validate.js` | Payload validation (`validateYoutubePublishPayload`) |
| `functions/lib/writers.js` | D1 writer (`createYoutubePublishLog`) |
| `fixtures/youtube-publish/` | Fixture examples for YouTube publish log |
| `app/src/components/VideoEmbed.vue` | Frontend YouTube embed component |
| `content/topics/crypto/2025-01-15/video.json` | Example video.json with video_id |
| `docs/architecture/youtube-metadata-generation.md` | YouTube metadata generation guide |
| `docs/image-video-pipeline.md` | Image-based video pipeline documentation |
