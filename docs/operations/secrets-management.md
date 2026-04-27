# Secrets and Environment Variables — Management Guide

This document is the canonical inventory of all secrets, API keys, and
environment variables used across the platform. It covers required and
optional variables, environment-specific usage, rotation guidance,
missing-secret behavior, and secure storage locations.

For per-component setup instructions, see the linked documentation in each
section.

---

## Quick reference — what must be configured per environment

| Environment | Minimum required secrets | Where stored |
|---|---|---|
| **Local** | `OPENAI_API_KEY` (or `GOOGLE_API_KEY`), `WRITE_API_KEY` | `.env`, `.dev.vars` |
| **Staging** | All production secrets with staging-scoped values | n8n env + credential store, Cloudflare Pages settings (preview) |
| **Production** | All secrets listed as required below | n8n env + credential store, Cloudflare Pages settings (production) |

---

## Secret inventory

### 1. Cloudflare — account and API access

| Variable | Required | Environments | Description |
|---|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Yes (deploy + n8n) | Local, Staging, Production | Cloudflare account identifier |
| `CLOUDFLARE_API_TOKEN` | Yes (deploy + n8n) | Local, Staging, Production | Cloudflare API token for D1 and Pages operations |
| `CLOUDFLARE_D1_DATABASE_ID` | Yes | Local, Staging, Production | Production D1 database identifier |
| `CLOUDFLARE_D1_STAGING_DATABASE_ID` | Staging only | Local, Staging | Staging D1 database identifier |
| `CLOUDFLARE_PAGES_PROJECT_NAME` | Deploy only | Production | Pages project name (default: `modern-content-platform`) |

**Local notes:**
- When running Wrangler locally after `wrangler login`, the Cloudflare account
  ID and API token are provided by the Wrangler session — you do not need them
  in `.env` for local Wrangler commands.
- They are required in `.env` only when running n8n locally (Docker Compose
  passes them to the container for D1 REST API calls).

**Rotation guidance:**
- Cloudflare API tokens can be rotated in the Cloudflare dashboard under
  **My Profile → API Tokens**. Create a new token, update all environments,
  then revoke the old token.
- Use **scoped tokens** — staging should use a token scoped only to the staging
  D1 database; production should use a separate token scoped to the production
  database.

**Missing-secret behavior:**
- Missing `CLOUDFLARE_ACCOUNT_ID` or `CLOUDFLARE_API_TOKEN` causes Wrangler CLI
  commands and n8n D1 HTTP Request nodes to fail immediately.
- Missing `CLOUDFLARE_D1_DATABASE_ID` causes n8n workflows to fail when
  attempting D1 reads or writes.

---

### 2. Internal write API

| Variable | Required | Environments | Description |
|---|---|---|---|
| `WRITE_API_KEY` | Yes | Local (`.dev.vars`), Staging, Production | Shared secret for `POST /api/internal/*` endpoints |

**How to generate:**

```bash
openssl rand -hex 32
```

**Local notes:**
- Set in `.dev.vars` (Wrangler local secrets file) for local Pages Functions
  development.
- Also set in `.env` and forwarded to the n8n container so n8n can authenticate
  against the local Pages Functions.

**Staging / Production notes:**
- Set as an encrypted environment variable in the Cloudflare Pages dashboard
  under **Settings → Environment variables** for the appropriate environment
  (Preview for staging, Production for production).
- Also set in the n8n instance environment or n8n Settings → Variables as
  `WRITE_API_KEY`.

**Rotation guidance:**
- Generate a new value with `openssl rand -hex 32`.
- Update both Cloudflare Pages (encrypted env var) and n8n simultaneously.
- After updating, verify with a test write to
  `POST /api/internal/workflow-logs`.

**Missing-secret behavior:**
- All `POST /api/internal/*` endpoints return `401 Unauthorized` when the
  `X-Write-Key` header is missing or does not match.
- n8n workflows that write to D1 via the internal API will fail at the HTTP
  Request node.

---

### 3. GitHub — publishing

| Variable | Required | Environments | Description |
|---|---|---|---|
| `GITHUB_TOKEN` | Yes (n8n) | Staging, Production | Personal access token with repo write access |
| `GITHUB_REPO_OWNER` | Yes (n8n) | All | GitHub org or username |
| `GITHUB_REPO_NAME` | Yes (n8n) | All | Repository name (default: `ModernContentPlatform`) |
| `GITHUB_CONTENT_BRANCH` | Staging only | Staging n8n | Target branch for content publishing (`staging` in staging, `main` in production) |

**Local notes:**
- Not needed for local frontend or Pages Functions development.
- Required in `.env` only when testing the n8n daily editorial publish
  workflow locally.

**Staging notes:**
- Set `GITHUB_CONTENT_BRANCH=staging` in the staging n8n instance so daily
  editorial content is published to the `staging` branch.

**Token scope:**
- Minimum required: `repo` (full control of private repositories) or
  `public_repo` if the repository is public.
- The token must be able to create and update files via the GitHub Contents API.

**Rotation guidance:**
- Create a new fine-grained personal access token in GitHub Settings →
  Developer Settings → Personal access tokens.
- Update the n8n credential or environment variable.
- Revoke the old token.
- Recommended rotation interval: **90 days**.

**Missing-secret behavior:**
- The daily editorial workflow (module 09 — Publish to GitHub) fails when
  `GITHUB_TOKEN` is missing or invalid.
- Content is not published to GitHub, but D1 state updates and alert delivery
  are unaffected.

---

### 4. AI services

| Variable | Required | Environments | Description |
|---|---|---|---|
| `AI_PROVIDER` | No | All | Active provider: `openai` (default) or `google` |
| `OPENAI_API_KEY` | Yes when `AI_PROVIDER=openai` | All | OpenAI API key |
| `GOOGLE_API_KEY` | Yes when `AI_PROVIDER=google` | All | Google API key (Gemini, Imagen, Cloud TTS) |

**n8n credential setup:**
- OpenAI: create an **OpenAI API** credential named `OpenAiApi` in n8n and
  paste the API key.
- Google: create a **Google API Key** credential named `GoogleApiKey` in n8n.

**Model configuration (n8n Settings → Variables):**

| Variable | Default | Tier | Description |
|---|---|---|---|
| `AI_MODEL_STANDARD` | `gpt-4o` | Standard | Editorial tasks: summary, article, expectation check, outlook, script |
| `AI_MODEL_FAST` | `gpt-4o-mini` | Fast | Classification, timeline formatting, YouTube metadata |

Per-task model overrides (optional — set only when a specific task needs a
different model than its tier):

| Variable | Default | Task |
|---|---|---|
| `OPENAI_MODEL_ALERT_CLASSIFICATION` | `gpt-4o-mini` | Alert classification |
| `OPENAI_MODEL_TIMELINE_FORMATTING` | `gpt-4o-mini` | Timeline entry formatting |
| `OPENAI_MODEL_DAILY_SUMMARY` | `gpt-4o` | Daily summary generation |
| `OPENAI_MODEL_ARTICLE_GENERATION` | `gpt-4o` | Article generation |
| `OPENAI_MODEL_EXPECTATION_CHECK` | `gpt-4o` | Expectation check |
| `OPENAI_MODEL_TOMORROW_OUTLOOK` | `gpt-4o` | Tomorrow outlook |
| `OPENAI_MODEL_VIDEO_SCRIPT` | `gpt-4o` | Video script generation |
| `OPENAI_MODEL_YOUTUBE_METADATA` | `gpt-4o-mini` | YouTube metadata |
| `OPENAI_MODEL_IMAGE_GENERATION` | `gpt-image-1` | Image generation |
| `OPENAI_MODEL_TTS` | `gpt-4o-mini-tts` | Text-to-speech narration |

Google model overrides follow the same pattern with `GOOGLE_MODEL_*` prefix.
See [`docs/architecture/ai-provider.md`](../architecture/ai-provider.md) for
the full reference.

**Rotation guidance:**
- OpenAI: rotate in the [OpenAI dashboard](https://platform.openai.com/api-keys).
  Update the n8n `OpenAiApi` credential — no workflow JSON changes needed.
- Google: rotate in the [Google Cloud Console](https://console.cloud.google.com/).
  Update the n8n `GoogleApiKey` credential.
- Use **spending caps** on both providers. Staging should have a lower cap than
  production.

**Missing-secret behavior:**
- `parseAIProviderConfig()` throws `AI_PROVIDER_CONFIG_ERROR` when the
  provider-specific API key is missing.
- All AI workflow steps fail (classification, summary, article, etc.).
- Alert ingestion and D1 writes still succeed — only AI-dependent steps are
  affected.

---

### 5. Telegram — alert delivery

| Variable | Required | Environments | Description |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Yes (n8n) | All | Telegram Bot API token |
| `TELEGRAM_CHAT_ID` | Yes (n8n) | All | Target chat or channel ID |

**Environment isolation:**
- Local: use a personal test channel (optional — can be omitted if you are
  not testing delivery).
- Staging: use a dedicated staging channel with a distinct name.
- Production: use the production channel.

**Rotation guidance:**
- Revoke the token via [BotFather](https://t.me/BotFather) (`/revoke`),
  then create a new token (`/token`).
- Update the n8n environment variable and/or credential immediately.
- Recommended: rotate if the token is suspected of being compromised.

**Missing-secret behavior:**
- Telegram delivery nodes in n8n fail silently when configured with
  `continueOnFail` or fail the workflow step otherwise.
- Alerts are still written to D1 and delivered to other channels (Discord).

---

### 6. Discord — alert delivery

| Variable | Required | Environments | Description |
|---|---|---|---|
| `DISCORD_WEBHOOK_URL` | Yes (n8n) | All | Discord webhook URL for the target channel |

**Environment isolation:**
- Local: use a personal test webhook (optional).
- Staging: use a dedicated staging channel webhook.
- Production: use the production channel webhook.

**Rotation guidance:**
- Delete the webhook in Discord channel settings and create a new one.
- Update the n8n environment variable immediately.

**Missing-secret behavior:**
- Discord delivery nodes fail. Alerts are still written to D1 and delivered
  to Telegram.

---

### 7. Source providers — X and NewsAPI

| Variable | Required | Environments | Description |
|---|---|---|---|
| `ENABLE_X` | No | All | Enable X (Twitter) provider (`true`/`false`) |
| `ENABLE_NEWSAPI` | No | All | Enable NewsAPI provider (`true`/`false`) |
| `X_BEARER_TOKEN` | When `ENABLE_X=true` | All | X API v2 bearer token |
| `NEWS_API_KEY` | When `ENABLE_NEWSAPI=true` | All | NewsAPI API key |

**Validation rules:**
- At least one provider must be enabled. Both disabled →
  `PROVIDER_CONFIG_ERROR`.
- Enabling a provider without its API key →
  `PROVIDER_CONFIG_ERROR` listing the missing key(s).

**Rotation guidance:**
- X: generate a new bearer token in the
  [X Developer Portal](https://developer.twitter.com/). Update n8n env var.
- NewsAPI: generate a new key at [newsapi.org](https://newsapi.org/). Update
  n8n env var.

**Missing-secret behavior:**
- The intraday pipeline fails at startup with `PROVIDER_CONFIG_ERROR` before
  any source fetching occurs.

See [`docs/source-provider-modes.md`](../source-provider-modes.md) for the
full configuration guide.

---

### 8. YouTube — video publishing

| Variable | Required | Environments | Description |
|---|---|---|---|
| `ENABLE_YOUTUBE_UPLOAD` | No | n8n variable | Feature toggle (default: `false`) |
| `YOUTUBE_CLIENT_ID` | When YouTube enabled | Production n8n | Google OAuth 2.0 client ID |
| `YOUTUBE_CLIENT_SECRET` | When YouTube enabled | Production n8n | Google OAuth 2.0 client secret |
| `YOUTUBE_DEFAULT_VISIBILITY` | No | n8n variable | `public`, `unlisted`, or `private` (default: `public`) |
| `YOUTUBE_CATEGORY_ID` | No | n8n variable | YouTube category (default: `25` — News & Politics) |

**Environment isolation:**
- Local: YouTube upload is disabled by default. Not recommended for local
  testing due to risk of accidental public uploads.
- Staging: YouTube upload should remain disabled (`ENABLE_YOUTUBE_UPLOAD=false`).
- Production: enable when the YouTube channel and OAuth credentials are ready.

**Credential setup:**
- Create OAuth 2.0 credentials in the
  [Google Cloud Console](https://console.cloud.google.com/).
- Configure as an OAuth2 credential in n8n named `YouTubeOAuth2`.
- See [`docs/architecture/youtube-publishing.md`](../architecture/youtube-publishing.md)
  for the step-by-step guide.

**Rotation guidance:**
- Rotate the OAuth 2.0 client secret in Google Cloud Console.
- Update the n8n `YouTubeOAuth2` credential and re-authorize.

**Missing-secret behavior:**
- When `ENABLE_YOUTUBE_UPLOAD=false` (or unset), modules 15–16 skip gracefully
  with no error.
- When enabled but credentials are missing, the upload fails and the failure
  notifier is triggered. Core editorial content (summary, article) is still
  published.

---

### 9. Meta — Instagram and Facebook publishing

| Variable | Required | Environments | Description |
|---|---|---|---|
| `ENABLE_META_INSTAGRAM` | No | n8n variable | Enable Instagram publishing (default: `false`) |
| `ENABLE_META_FACEBOOK` | No | n8n variable | Enable Facebook publishing (default: `false`) |
| `ENABLE_META_INSTAGRAM_STORIES` | No | n8n variable | Enable Instagram stories (default: `false`) |
| `ENABLE_META_FACEBOOK_STORIES` | No | n8n variable | Enable Facebook stories (default: `false`) |
| `META_INSTAGRAM_USER_ID` | When Instagram enabled | n8n variable | Instagram professional account user ID |
| `META_INSTAGRAM_TOKEN` | When Instagram enabled | n8n variable | Instagram Graph API access token |
| `META_FACEBOOK_PAGE_ID` | When Facebook enabled | n8n variable | Facebook Page ID |
| `META_FACEBOOK_PAGE_TOKEN` | When Facebook enabled | n8n variable | Facebook Page Access Token |
| `META_ALERT_STORY_THRESHOLD` | No | n8n variable | Min importance_score for stories (default: `80`) |

**Token expiration:**
- Long-lived User Access Tokens expire in **60 days**.
- System User tokens (via Meta Business Suite) **do not expire** — recommended
  for production.
- Facebook Page tokens derived from System User tokens are non-expiring.

**Rotation guidance:**
- User tokens: refresh before the 60-day expiry via the Graph API token
  exchange endpoint.
- System User tokens: recreate in Meta Business Suite → Business Settings →
  System Users if compromised.

**Missing-secret behavior:**
- When both Instagram and Facebook are disabled, modules 11–12 skip cleanly.
- When enabled but tokens are missing or expired, the Meta publish step fails.
  The failure notifier is triggered but the core pipeline is unaffected.

See [`docs/architecture/meta-social-publishing.md`](../architecture/meta-social-publishing.md)
for the full setup guide.

---

### 10. Social channels — X, Telegram, Discord (digest/story publishing)

| Variable | Required | Environments | Description |
|---|---|---|---|
| `ENABLE_SOCIAL_X` | No | n8n variable | Enable X digest/story publishing (default: `false`) |
| `ENABLE_SOCIAL_TELEGRAM` | No | n8n variable | Enable Telegram digest/story publishing (default: `false`) |
| `ENABLE_SOCIAL_DISCORD` | No | n8n variable | Enable Discord digest/story publishing (default: `false`) |
| `SOCIAL_X_BEARER_TOKEN` | When social X enabled | n8n variable | X API v2 bearer token |
| `SOCIAL_TELEGRAM_BOT_TOKEN` | No | n8n variable | Falls back to `TELEGRAM_BOT_TOKEN` |
| `SOCIAL_TELEGRAM_CHAT_ID` | No | n8n variable | Falls back to `TELEGRAM_CHAT_ID` |
| `SOCIAL_DISCORD_WEBHOOK_URL` | No | n8n variable | Falls back to `DISCORD_WEBHOOK_URL` |

See [`docs/architecture/social-content-publishing.md`](../architecture/social-content-publishing.md)
for the full configuration reference.

---

### 11. Media pipeline — render providers

| Variable | Required | Environments | Description |
|---|---|---|---|
| `MEDIA_MODE` | No | n8n variable | `image_video` (default) or `full_video` |
| `RENDER_PROVIDER` | No | n8n variable | `shotstack`, `creatomate`, or unset (skip render) |
| `SHOTSTACK_API_KEY` | When `RENDER_PROVIDER=shotstack` | n8n env | Shotstack API key |
| `CREATOMATE_API_KEY` | When `RENDER_PROVIDER=creatomate` | n8n env | Creatomate API key |
| `CREATOMATE_TEMPLATE_ID` | When `RENDER_PROVIDER=creatomate` | n8n variable | Creatomate template ID |

**TTS voice configuration:**

| Variable | Default | Description |
|---|---|---|
| `OPENAI_TTS_VOICE` | `alloy` | OpenAI TTS voice |
| `GOOGLE_TTS_VOICE` | `en-US-Chirp3-HD-Aoede` | Google Cloud TTS voice |
| `AI_TTS_VOICE` | — | Shared override (provider-specific takes precedence) |
| `GOOGLE_TTS_LANGUAGE_CODE` | _(auto-derived from voice)_ | BCP-47 language code for Google TTS |

**Missing-secret behavior:**
- When `RENDER_PROVIDER` is unset, step 06d skips the render API call. Assets
  are packaged but no video file is produced. The pipeline continues and
  publishes text content normally.
- When `MEDIA_MODE=full_video`, the Build Topic Context node throws
  `MEDIA_MODE_CONFIG_ERROR` because no v1 provider supports this mode.

See [`docs/architecture/workflow-runtime-variables.md`](../architecture/workflow-runtime-variables.md)
and [`docs/image-video-pipeline.md`](../image-video-pipeline.md) for details.

---

### 12. n8n instance — server configuration

These variables configure the n8n server itself and are only relevant for
staging and production n8n deployments (not for local Docker development).

| Variable | Required | Environments | Description |
|---|---|---|---|
| `N8N_VERSION` | Yes | Staging, Production | Pinned n8n release version |
| `N8N_HOST` | Yes | Staging, Production | Public hostname |
| `N8N_PORT` | No | Staging, Production | Server port (default: `5678`) |
| `N8N_PROTOCOL` | No | Staging, Production | `https` for production |
| `WEBHOOK_URL` | Yes | Staging, Production | Public webhook base URL |
| `N8N_EDITOR_BASE_URL` | Yes | Staging, Production | Editor base URL |
| `N8N_ENCRYPTION_KEY` | Yes | Staging, Production | Encryption key for stored credentials |
| `GENERIC_TIMEZONE` | No | All | Timezone for cron schedules (default: `UTC`) |
| `POSTGRES_USER` | Yes | Staging, Production | PostgreSQL database username |
| `POSTGRES_PASSWORD` | Yes | Staging, Production | PostgreSQL database password |
| `POSTGRES_DB` | Yes | Staging, Production | PostgreSQL database name |
| `EXECUTIONS_DATA_MAX_AGE` | No | Staging, Production | Hours to keep execution data (default: `168`) |

**Critical: `N8N_ENCRYPTION_KEY`**
- Generate with `openssl rand -hex 32`.
- **Back up securely.** Losing this key makes all stored n8n credentials
  unrecoverable.
- Never rotate unless you are prepared to re-enter all credentials in n8n.

See [`docs/operations/n8n-deployment.md`](n8n-deployment.md) and
[`n8n/.env.production.example`](../../n8n/.env.production.example) for the
full deployment guide.

---

### 13. n8n workflow IDs — module references

These are set in **n8n Settings → Variables** after importing all workflow
modules. They are not secrets but are required for the orchestrator to call
sub-workflows.

| Variable | Points to |
|---|---|
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
| `DAILY_GENERATE_META_SOCIAL_WORKFLOW_ID` | `11_generate_meta_social` |
| `DAILY_PUBLISH_META_WORKFLOW_ID` | `12_publish_meta_daily` |
| `DAILY_GENERATE_SOCIAL_CONTENT_WORKFLOW_ID` | `13_generate_social_content` |
| `DAILY_PUBLISH_SOCIAL_CHANNELS_WORKFLOW_ID` | `14_publish_social_channels` |
| `DAILY_YOUTUBE_UPLOAD_WORKFLOW_ID` | `15_youtube_upload` |
| `DAILY_UPDATE_VIDEO_REFERENCE_WORKFLOW_ID` | `16_update_video_reference` |
| `FAILURE_NOTIFIER_WORKFLOW_ID` | Shared failure notifier |
| `INTRADAY_META_STORY_WORKFLOW_ID` | Intraday module 10 |
| `INTRADAY_SOCIAL_STORY_WORKFLOW_ID` | Intraday module 11 |

**Missing-secret behavior:**
- Missing workflow IDs cause the orchestrator to fail when attempting to call
  the referenced sub-workflow. The failure notifier is triggered.

---

### 14. Observability — failure alerting

| Variable | Required | Environments | Description |
|---|---|---|---|
| `PAGES_BASE_URL` | Yes (n8n) | Staging, Production | Base URL of the Cloudflare Pages deployment |
| `FAILURE_ALERT_CHANNEL` | Yes (n8n) | Staging, Production | Telegram chat ID for failure alerts |
| `FAILURE_NOTIFIER_WORKFLOW_ID` | Yes (n8n) | Staging, Production | n8n workflow ID of the shared failure notifier |

**Environment isolation:**
- Staging: `PAGES_BASE_URL` points to the staging preview URL.
  `FAILURE_ALERT_CHANNEL` points to a staging alert channel.
- Production: `PAGES_BASE_URL` points to the production URL.
  `FAILURE_ALERT_CHANNEL` points to the production alert channel.

---

### 15. Cloudflare Pages deploy hook (optional)

| Variable | Required | Environments | Description |
|---|---|---|---|
| `CLOUDFLARE_PAGES_DEPLOY_HOOK` | No | n8n variable | Webhook URL to trigger a Pages redeploy after content publishing |

**Setup:**
- Create a deploy hook in the Cloudflare dashboard under the Pages project →
  Settings → Builds & Deployments → Deploy hooks.
- Set the returned URL as an n8n variable.

---

## Environment-specific storage locations

| Environment | Secret store | Files | Notes |
|---|---|---|---|
| **Local** | `.env`, `.dev.vars` | Git-ignored in repository root | Never commit. `.env.example` is the template. |
| **Staging n8n** | n8n credential store + Docker env vars | Encrypted in n8n's PostgreSQL database | Use `n8n/.env.production.example` as template. |
| **Staging Pages** | Cloudflare dashboard → Pages → Settings → Environment variables (Preview) | — | Mark values as **Encrypted**. |
| **Production n8n** | n8n credential store + Docker env vars | Encrypted in n8n's PostgreSQL database | Use `n8n/.env.production.example` as template. |
| **Production Pages** | Cloudflare dashboard → Pages → Settings → Environment variables (Production) | — | Mark values as **Encrypted**. |
| **GitHub Actions** | Not currently used for secrets | — | CI workflow does not require any secrets (read-only build + test). |

---

## Environment comparison matrix

The table below summarizes which secrets are needed in each environment.
**R** = required, **O** = optional, **—** = not applicable.

| Secret | Local | Staging | Production |
|---|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | O¹ | R | R |
| `CLOUDFLARE_API_TOKEN` | O¹ | R (staging-scoped) | R (production-scoped) |
| `CLOUDFLARE_D1_DATABASE_ID` | O¹ | R (staging ID) | R (production ID) |
| `WRITE_API_KEY` | R² | R | R |
| `GITHUB_TOKEN` | O | R | R |
| `GITHUB_CONTENT_BRANCH` | — | R (`staging`) | — (`main` default) |
| `OPENAI_API_KEY` | R³ | R³ | R³ |
| `GOOGLE_API_KEY` | R⁴ | R⁴ | R⁴ |
| `TELEGRAM_BOT_TOKEN` | O | R | R |
| `TELEGRAM_CHAT_ID` | O | R (staging channel) | R (production channel) |
| `DISCORD_WEBHOOK_URL` | O | R (staging webhook) | R (production webhook) |
| `NEWS_API_KEY` | O | R⁵ | R⁵ |
| `X_BEARER_TOKEN` | O | O⁵ | O⁵ |
| `YOUTUBE_CLIENT_ID` | — | — | O⁶ |
| `YOUTUBE_CLIENT_SECRET` | — | — | O⁶ |
| `META_INSTAGRAM_TOKEN` | — | O | O |
| `META_FACEBOOK_PAGE_TOKEN` | — | O | O |
| `SHOTSTACK_API_KEY` | — | O | O |
| `CREATOMATE_API_KEY` | — | O | O |
| `N8N_ENCRYPTION_KEY` | — | R | R |
| `POSTGRES_PASSWORD` | — | R | R |

¹ Required only when running n8n locally with D1 HTTP Request nodes. Not
  needed for Wrangler local commands (uses `wrangler login` session).
² Set in `.dev.vars` for local Pages Functions.
³ Required when `AI_PROVIDER=openai` (default).
⁴ Required when `AI_PROVIDER=google`.
⁵ At least one source provider must be enabled with its corresponding key.
⁶ Required only when `ENABLE_YOUTUBE_UPLOAD=true`.

---

## Rotation schedule recommendations

| Secret class | Recommended interval | Notes |
|---|---|---|
| Cloudflare API tokens | **6 months** or on suspected compromise | Use scoped tokens per environment |
| `WRITE_API_KEY` | **6 months** | Coordinate Pages + n8n update simultaneously |
| `GITHUB_TOKEN` | **90 days** | Use fine-grained PATs with minimum required scope |
| `OPENAI_API_KEY` | On suspected compromise | Monitor usage via OpenAI dashboard |
| `GOOGLE_API_KEY` | On suspected compromise | Monitor usage via Google Cloud Console |
| `TELEGRAM_BOT_TOKEN` | On suspected compromise | Revoke via BotFather |
| `DISCORD_WEBHOOK_URL` | On suspected compromise | Delete and recreate webhook |
| `X_BEARER_TOKEN` | On suspected compromise | Regenerate in X Developer Portal |
| `NEWS_API_KEY` | On suspected compromise | Regenerate at newsapi.org |
| `YOUTUBE_CLIENT_SECRET` | **12 months** | Rotate in Google Cloud Console |
| `META_INSTAGRAM_TOKEN` | **60 days** (User token) or never (System User) | Use System User tokens in production |
| `META_FACEBOOK_PAGE_TOKEN` | Never (System User) or **60 days** (User token) | Use System User tokens in production |
| `N8N_ENCRYPTION_KEY` | **Never** (unless compromised) | Losing this key makes all n8n credentials unrecoverable |
| `POSTGRES_PASSWORD` | **12 months** | Coordinate with n8n restart |
| Render provider keys | On suspected compromise | Update n8n env var |

---

## Security best practices

1. **Never commit secrets to version control.** All secret files (`.env`,
   `.dev.vars`) are excluded by `.gitignore`. The promotion gate workflow
   (`.github/workflows/promote.yml`) scans for staging-specific config leaks.

2. **Use separate secrets per environment.** Staging and production must use
   different values for `WRITE_API_KEY`, delivery channel IDs, and ideally
   separate API tokens. This prevents staging workflows from accidentally
   writing to production data or channels.

3. **Use scoped Cloudflare API tokens.** Create one token scoped to the
   staging D1 database and a separate token scoped to the production D1
   database.

4. **Use spending caps on AI providers.** Set separate spending limits for
   staging (lower) and production (higher) to prevent budget overruns from
   testing.

5. **Use System User tokens for Meta.** Long-lived User Access Tokens expire
   in 60 days. System User tokens from Meta Business Suite do not expire and
   are recommended for unattended production publishing.

6. **Back up `N8N_ENCRYPTION_KEY` securely.** Store it in a password manager
   or secure vault. Losing it makes all stored n8n credentials unrecoverable.

7. **Mark Cloudflare Pages environment variables as encrypted.** When adding
   secrets in the Cloudflare Pages dashboard, always check the **Encrypt**
   option for sensitive values.

8. **Audit access regularly.** Review who has access to the Cloudflare
   dashboard, n8n instances, GitHub repository settings, and Meta Business
   Suite.

---

## Troubleshooting missing secrets

| Symptom | Likely cause | Fix |
|---|---|---|
| `401 Unauthorized` from internal API endpoints | `WRITE_API_KEY` mismatch between Pages and n8n | Verify the key matches in both Cloudflare Pages env vars and n8n env/variables |
| `AI_PROVIDER_CONFIG_ERROR` in n8n | Missing `OPENAI_API_KEY` or `GOOGLE_API_KEY` | Set the API key for the active provider in `.env` or n8n credential |
| `PROVIDER_CONFIG_ERROR` at intraday startup | Source provider enabled without its API key | Set `X_BEARER_TOKEN` and/or `NEWS_API_KEY` |
| `MEDIA_MODE_CONFIG_ERROR` | Invalid `MEDIA_MODE` or incompatible provider | Set `MEDIA_MODE=image_video` (only supported v1 mode) |
| n8n D1 writes fail silently | Missing or wrong `CLOUDFLARE_D1_DATABASE_ID` | Verify the database ID matches the target environment |
| Telegram alerts not delivered | Missing or invalid `TELEGRAM_BOT_TOKEN` | Verify the token and chat ID in n8n env |
| Discord alerts not delivered | Missing or invalid `DISCORD_WEBHOOK_URL` | Verify the webhook URL in n8n env |
| GitHub publish fails | Missing or expired `GITHUB_TOKEN` | Regenerate the PAT and update n8n |
| YouTube upload fails | Missing OAuth credentials or feature toggle off | Check `ENABLE_YOUTUBE_UPLOAD` and `YouTubeOAuth2` credential in n8n |
| Meta publish fails | Expired token or feature toggle off | Refresh the Meta token or use a System User token |
| n8n credentials unrecoverable after migration | `N8N_ENCRYPTION_KEY` changed or lost | Restore the key from backup; re-enter all credentials if lost |

---

## Related documentation

| Document | Contents |
|---|---|
| [`.env.example`](../../.env.example) | Environment variable template with annotations |
| [`n8n/.env.production.example`](../../n8n/.env.production.example) | n8n production/staging environment template |
| [`docs/local-development.md`](../local-development.md) | Local setup including `.dev.vars` and `.env` |
| [`docs/staging-environment.md`](../staging-environment.md) | Staging architecture and secret management |
| [`docs/operations/promotion-workflow.md`](promotion-workflow.md) | Environment-specific secrets in the promotion path |
| [`docs/operations/n8n-deployment.md`](n8n-deployment.md) | n8n credential and variable setup |
| [`docs/operations/cloudflare-pages-deployment.md`](cloudflare-pages-deployment.md) | Pages Functions secrets and D1 bindings |
| [`docs/architecture/ai-provider.md`](../architecture/ai-provider.md) | AI provider credentials and model configuration |
| [`docs/architecture/youtube-publishing.md`](../architecture/youtube-publishing.md) | YouTube OAuth setup |
| [`docs/architecture/meta-social-publishing.md`](../architecture/meta-social-publishing.md) | Meta token and account requirements |
| [`docs/architecture/social-content-publishing.md`](../architecture/social-content-publishing.md) | X, Telegram, Discord social publishing |
| [`docs/source-provider-modes.md`](../source-provider-modes.md) | Source provider API key requirements |
| [`docs/architecture/workflow-runtime-variables.md`](../architecture/workflow-runtime-variables.md) | Runtime variable reference |
| [`docs/architecture/observability.md`](../architecture/observability.md) | Observability variables |
