# Implementation Roadmap — Modern Content Platform v1

## Overview

This document defines the recommended build order for Modern Content Platform v1.
It is dependency-aware, architecture-first, and scoped to deliver a working
intraday alert flow and daily editorial flow before adding enhancements.

Each phase lists its prerequisites, concrete deliverables, and risks.
Phases within the same group may overlap once their direct dependencies are met.

---

## What is already built

The following assets are committed to this repository and ready to use.
They do **not** need to be re-implemented; they need to be wired and deployed.

| Asset | Location | Status |
|---|---|---|
| D1 schema — tables, indexes, constraints | `db/migrations/` | ✅ Ready |
| Topic seed data | `db/seeds/seed_topics.sql` | ✅ Ready |
| Pages Functions — topics, timeline, day-status, navigation | `functions/` | ✅ Ready |
| Vue frontend — pages, components, router, services | `app/src/` | ✅ Ready |
| n8n intraday workflow modules (01–09 + orchestrator) | `workflows/n8n/intraday/` | ✅ Ready |
| n8n daily workflow modules (01–10 + orchestrator) | `workflows/n8n/daily/` | ✅ Ready |
| AI schemas — all 7 output shapes | `schemas/ai/` | ✅ Ready |
| Workflow contracts — intraday and daily | `workflows/contracts/` | ✅ Ready |
| Architecture docs — intraday and daily flows | `docs/architecture/` | ✅ Ready |
| Wrangler config (placeholder database ID) | `wrangler.toml` | ⚠️ Needs real ID |

---

## Recommended build order

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5
                                    ↓
                               Phase 6 → Phase 7 → Phase 8
                                                        ↓
                                                    Phase 9
```

Phase 6 depends on Phase 4 (the daily workflow requires at least one day of intraday alerts in D1).  
Phase 5 depends on Phase 4. Phase 7 depends on Phase 6. Phase 8 depends on Phase 6.  
Phase 9 (end-to-end) depends on all prior phases.

---

## Phase 1 — Cloudflare Infrastructure

**Goal:** Provision all Cloudflare resources and confirm the deployment pipeline works.

**Depends on:** Nothing (first phase).

### Deliverables

- [ ] Cloudflare D1 database created (`modern-content-platform-db`)
- [ ] `wrangler.toml` updated with the real `database_id`
- [ ] D1 migrations applied in order:
  - `0001_init.sql`
  - `0002_event_clusters_unique.sql`
- [ ] Topic seed data loaded (`db/seeds/seed_topics.sql`)
- [ ] Cloudflare Pages project created and connected to this GitHub repository
- [ ] Pages build settings confirmed:
  - Build command: `npm run build` (from `app/`)
  - Build output directory: `app/dist`
- [ ] Wrangler CLI authenticated and confirmed working
- [ ] D1 binding `DB` confirmed available to Pages Functions

### How to apply migrations

```bash
# Apply to remote D1
npx wrangler d1 execute modern-content-platform-db --remote --file db/migrations/0001_init.sql
npx wrangler d1 execute modern-content-platform-db --remote --file db/migrations/0002_event_clusters_unique.sql

# Seed topics
npx wrangler d1 execute modern-content-platform-db --remote --file db/seeds/seed_topics.sql
```

### Risks

| Risk | Mitigation |
|---|---|
| D1 database ID not set in `wrangler.toml` | Update `database_id` in `wrangler.toml` before any Pages deploy |
| Migration applied out of order | Always apply `0001` before `0002`; check with `SELECT name FROM sqlite_master WHERE type='table'` |
| Pages build fails before D1 binding is set | Set the D1 binding in Pages project settings before first deploy |

---

## Phase 2 — Frontend Baseline Deployment

**Goal:** Confirm the Vue frontend builds, deploys, and renders correctly.

**Depends on:** Phase 1 (Pages project and D1 binding must exist).

### Deliverables

- [ ] Frontend builds without errors (`npm run build` from `app/`)
- [ ] Deployed to Cloudflare Pages via GitHub push
- [ ] Homepage loads and renders the topic grid (real topics from D1 via `/api/topics`)
- [ ] SPA routing works for all defined routes (`_redirects` file is deployed)
- [ ] 404 page renders for unknown routes
- [ ] Topic page and topic/day page render placeholder state when no data exists

### How to verify locally

```bash
cd app
npm install
npm run dev
# Visit http://localhost:5173 — topics will appear once the D1 binding is available
# For local dev, VITE_API_BASE can point to a wrangler dev instance
```

### Risks

| Risk | Mitigation |
|---|---|
| Topics API returns empty before seed is loaded | Apply seed in Phase 1 before testing Phase 2 |
| `_redirects` not deployed | Confirm `app/public/_redirects` is in the build output |
| Pages Functions not found | Confirm `functions/` directory is at the repo root, not inside `app/` |

---

## Phase 3 — Pages Functions API Validation

**Goal:** Verify all four thin API endpoints return correct data from D1.

**Depends on:** Phase 1 (D1 with seed data), Phase 2 (deployment working).

### Deliverables

- [ ] `GET /api/topics` — returns seeded topic list
- [ ] `GET /api/day-status/:topicSlug/:dateKey` — returns correct page state for known and unknown dates
- [ ] `GET /api/timeline/:topicSlug/:dateKey` — returns empty list when no alerts exist; returns alert list when alerts exist
- [ ] `GET /api/navigation/:topicSlug/:dateKey` — returns `null` prev/next when no adjacent days exist
- [ ] Error responses return correct `{ error }` shape and status codes
- [ ] D1 binding `DB` confirmed working in Pages Functions context

### Verification steps

```bash
# After deploy, test each endpoint
curl https://<your-pages-domain>/api/topics
curl https://<your-pages-domain>/api/day-status/crypto/2025-01-01
curl https://<your-pages-domain>/api/timeline/crypto/2025-01-01
curl https://<your-pages-domain>/api/navigation/crypto/2025-01-01
```

### Risks

| Risk | Mitigation |
|---|---|
| D1 binding missing in Pages Functions | Add `DB` binding in Cloudflare Pages project settings → Functions tab |
| Incorrect `params` shape in dynamic routes | Confirm route file names match `[topicSlug]` and `[dateKey]` pattern |
| CORS errors from frontend | `jsonResponse` helper includes `Content-Type: application/json`; add CORS headers if frontend is on a different origin |

---

## Phase 4 — Intraday Alert Pipeline

**Goal:** Run a complete intraday cycle — from source ingestion through D1 persistence and alert delivery.

**Depends on:** Phase 1 (D1 must exist), Phase 3 (APIs confirmed working).

### Deliverables

- [ ] n8n instance deployed (self-hosted)
- [ ] `failure_notifier.json` imported and noted workflow ID
- [ ] Intraday modules 01–09 imported and noted workflow IDs
- [ ] Intraday `orchestrator.json` imported
- [ ] n8n credentials configured:
  - `CloudflareD1Api` — HTTP header auth with Cloudflare API token (D1:Edit permission)
  - `OpenAiApi` — OpenAI API key
  - `TelegramBotApi` — Telegram bot token
- [ ] n8n variables set (see `workflows/n8n/intraday/README.md` for full list):
  - All `*_WORKFLOW_ID` variables pointing to imported workflows
  - `CF_ACCOUNT_ID`, `CF_D1_DATABASE_ID`
  - `ALERT_IMPORTANCE_THRESHOLD`, `ALERT_SEVERITY_THRESHOLD`, `ALERT_CONFIDENCE_THRESHOLD`
  - `TELEGRAM_CHAT_ID`, `DISCORD_WEBHOOK_URL`
  - `FAILURE_ALERT_CHANNEL`
  - `INTRADAY_SOURCES_JSON` (optional — default public RSS sources used if omitted)
- [ ] Orchestrator activated on 15-minute schedule
- [ ] Verified: alerts written to D1 `alerts` table after first run
- [ ] Verified: clusters written to D1 `event_clusters` table
- [ ] Verified: `daily_status` row created/updated
- [ ] Verified: Telegram delivery successful
- [ ] Verified: Discord delivery successful

### Import order (mandatory)

1. `workflows/n8n/shared/failure_notifier.json`
2. `workflows/n8n/intraday/01_source_ingestion.json` through `09_discord_delivery.json`
3. `workflows/n8n/intraday/orchestrator.json`

Set all `*_WORKFLOW_ID` variables after import, before activating the orchestrator.

### Risks

| Risk | Mitigation |
|---|---|
| AI API rate limits or cost overruns | Set `ALERT_CONFIDENCE_THRESHOLD` high (70+) during initial testing; monitor API usage |
| Duplicate alerts on first run | Deduplication module (03) uses D1 lookback — first run will have no prior state; monitor for duplicates |
| Telegram bot not in target channel | Add the bot to the channel and confirm `TELEGRAM_CHAT_ID` is correct before activating |
| D1 REST API token permissions | Token must have D1:Edit permission for the specific database; read-only tokens will cause silent failures |
| n8n variable not set | Orchestrator will fail on first execution; check n8n execution logs before activating schedule |

---

## Phase 5 — Frontend Live Timeline Verification

**Goal:** Confirm the Vue frontend correctly renders live intraday alerts from D1.

**Depends on:** Phase 4 (at least one intraday cycle must have written alerts to D1).

### Deliverables

- [ ] Topic page renders latest day with alert count
- [ ] Topic/day page renders `AlertTimeline` with real alerts from D1
- [ ] Timeline pagination works (`has_more` flag, `before` cursor)
- [ ] Placeholder state renders correctly when no alerts exist for a date
- [ ] `PageStateBanner` reflects correct `page_state` from `daily_status`
- [ ] Date navigator links to adjacent days (prev/next)
- [ ] Severity badges and scores display correctly on timeline items

### Risks

| Risk | Mitigation |
|---|---|
| Timeline API returns empty due to `status != 'active'` | Confirm intraday module 07 writes `status = 'active'` (default in schema) |
| Date key mismatch (timezone) | Confirm `date_key` in D1 matches the date in the URL; intraday module 07 derives `date_key` from `event_at` using UTC |
| Frontend shows stale data | `Cache-Control: no-store` is set on all API responses; no additional caching to clear |

---

## Phase 6 — Daily Editorial Pipeline

**Goal:** Run a complete daily editorial cycle — from alert aggregation through GitHub publishing and D1 state update.

**Depends on:** Phase 4 (D1 must have at least one day of alerts for the target topic).

### Deliverables

- [ ] Daily modules 01–10 imported and noted workflow IDs
- [ ] Daily `orchestrator.json` imported
- [ ] n8n variables set (see daily orchestrator for full list):
  - All `DAILY_*_WORKFLOW_ID` variables
  - `CF_ACCOUNT_ID`, `CF_D1_DATABASE_ID`
  - `CF_API_TOKEN` (Cloudflare API token with D1:Edit permission — used by module 01 when marking a publish job as failed on the no-alerts path)
  - `GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME`, `GITHUB_CONTENT_BRANCH`
  - `GITHUB_TOKEN` (fine-grained personal access token with `contents:write` on this repo)
  - `CLOUDFLARE_PAGES_DEPLOY_HOOK` (optional — webhook URL to trigger redeploy)
- [ ] n8n credential added:
  - `GithubApi` — personal access token with `contents:write`
- [ ] Orchestrator activated on 23:30 UTC schedule (or triggered manually for testing)
- [ ] Verified: `content/topics/{topic_slug}/{date_key}/summary.json` written to GitHub
- [ ] Verified: `content/topics/{topic_slug}/{date_key}/article.md` written to GitHub
- [ ] Verified: `content/topics/{topic_slug}/{date_key}/metadata.json` written to GitHub
- [ ] Verified: `content/topics/{topic_slug}/{date_key}/video.json` written to GitHub (even without YouTube in v1)
- [ ] Verified: D1 `daily_status` row updated to `page_state = 'published'`
- [ ] Verified: D1 `publish_jobs` row updated to `status = 'success'`
- [ ] Verified: Cloudflare Pages redeployed (if deploy hook is configured)

### Import order (mandatory)

1. Daily modules `01` through `10` (if not already imported via shared failure_notifier)
2. `workflows/n8n/daily/orchestrator.json`

Set all `DAILY_*_WORKFLOW_ID` variables before activating.

### Risks

| Risk | Mitigation |
|---|---|
| No alerts in D1 for the target day | Run Phase 4 for at least one full day before testing Phase 6 |
| GitHub token lacks write access | Use a fine-grained token scoped to `contents:write` on this repository only |
| AI output fails schema validation | Module 08 validates all AI outputs; inspect n8n execution logs if the workflow stops at module 08 |
| Daily orchestrator runs before intraday data is complete | Schedule daily at 23:30 UTC, well after intraday cycle completes |
| Redeploy hook not configured | Pages will redeploy on the next GitHub push anyway; the hook is optional for v1 |

---

## Phase 7 — Frontend Full Topic/Day Page Verification

**Goal:** Confirm the Vue frontend renders complete topic/day pages from GitHub-published content.

**Depends on:** Phase 6 (at least one day of published content must exist in `content/`).

### Deliverables

- [ ] Topic/day page renders `SummarySection` with `summary.json` content
- [ ] Topic/day page renders `VideoEmbed` with YouTube metadata from `video.json`
- [ ] Topic/day page renders `article.md` content (via `content.js` service)
- [ ] Expectation check section renders when available
- [ ] Tomorrow outlook section renders when available
- [ ] `page_state = 'published'` banner disappears or shows correct published state
- [ ] Date navigator prev/next links work between published days
- [ ] Placeholder state (`SummaryPlaceholder`) renders for days where editorial is not yet published

### Risks

| Risk | Mitigation |
|---|---|
| `content.js` service fails to fetch GitHub-backed files | Confirm the content fetch URL is correct for the Pages deployment domain |
| `video.json` has no YouTube ID (pre-YouTube integration) | `VideoEmbed` component should handle null/empty video gracefully; test this case |
| `summary.json` shape mismatch | Validate `summary.json` output against `schemas/ai/daily_summary.json` in module 08 before publishing |

---

## Phase 8 — YouTube Integration

**Goal:** Wire YouTube video publishing into the daily workflow and surface it on the frontend.

**Depends on:** Phase 6 (daily editorial pipeline must be working).  
YouTube integration is a **v1 enhancement** — the platform is fully functional without it.

### Deliverables

- [ ] YouTube channel created or confirmed
- [ ] YouTube Data API v3 project and OAuth credentials created
- [ ] n8n credential added: `YoutubeOAuth2Api`
- [ ] Daily module 07 (`07_generate_youtube_metadata.json`) confirmed writing metadata to `video.json`
- [ ] YouTube upload step added to daily workflow (post-module 08, pre-module 09)
- [ ] `video.json` updated to include `youtube_video_id` after successful upload
- [ ] `VideoEmbed` component confirmed rendering YouTube embed from `video.json`
- [ ] Tested: full cycle produces a live YouTube video linked from the topic/day page

### Risks

| Risk | Mitigation |
|---|---|
| YouTube API quota (10,000 units/day) | One video upload costs ~1,600 units; 7 topics/day = ~11,200 units — request quota increase early |
| OAuth token expiry | Use refresh token; set up token refresh in n8n credential |
| Video upload fails but metadata is already written | Design idempotency: check for existing `youtube_video_id` in `video.json` before re-uploading |

---

## Phase 9 — End-to-End Verification

**Goal:** Confirm all components work together for at least one topic through a full daily cycle.

**Depends on:** Phases 1–7 complete (Phase 8 optional).

### Deliverables

- [ ] Full intraday cycle verified: source → D1 → Telegram → Discord → frontend timeline
- [ ] Full daily cycle verified: D1 alerts → AI generation → GitHub publish → Pages redeploy → topic/day page live
- [ ] Multi-topic verified: at least two topics running the intraday pipeline simultaneously
- [ ] Date navigation verified: at least two adjacent days available for a topic
- [ ] Failure notifier verified: trigger a deliberate failure and confirm Telegram alert is received
- [ ] All Pages Functions confirmed returning correct data for published days

### Risks

| Risk | Mitigation |
|---|---|
| Multi-topic AI costs | Monitor OpenAI usage after enabling multiple topics simultaneously |
| Race condition between intraday D1 write and daily aggregate | Daily runs at 23:30 UTC; final intraday cycle at latest 23:15 UTC — no overlap expected |
| GitHub API rate limits on publish | Each daily publish writes 4 files; rate limit is 5,000 requests/hour — no risk for v1 |

---

## v2 Enhancements (out of scope for v1)

These items are deliberately deferred. They add reliability and scale but are
not required for a working v1.

| Item | Why deferred |
|---|---|
| Delivery retry workflow for undelivered Telegram/Discord alerts | Alerts are recoverable from D1; no data loss risk in v1 |
| Workflow monitoring dashboard | n8n execution logs are sufficient for v1 |
| Rerun and recovery runbooks | Document after experiencing actual failure modes |
| Source signal expansion (beyond default RSS/API sources) | Default sources cover v1 signal volume |
| Multi-language support | Requires AI prompt changes and content model additions |
| Advanced AI clustering and deduplication | Keyword-based clustering (module 04) is sufficient for v1 |
| Summary index table in D1 | GitHub-backed `summary.json` is the canonical source; D1 index is an optimisation |
| Alert delivery logs table | `delivered_telegram` / `delivered_discord` flags on `alerts` are sufficient for v1 |
| Performance and caching improvements | Add only after real traffic data shows a need |

---

## Summary: v1 phase sequence

| Phase | Goal | Key dependency | Risk level |
|---|---|---|---|
| 1 — Cloudflare Infrastructure | D1 + Pages provisioned | None | Low |
| 2 — Frontend Baseline | Frontend deploys and renders | Phase 1 | Low |
| 3 — Pages Functions Validation | APIs return real D1 data | Phase 1, 2 | Low |
| 4 — Intraday Alert Pipeline | Alerts flow from source to D1 and delivery | Phase 1, 3 | Medium |
| 5 — Frontend Live Timeline | Frontend renders live alerts | Phase 4 | Low |
| 6 — Daily Editorial Pipeline | Content generated, published to GitHub | Phase 4 | Medium |
| 7 — Frontend Full Topic/Day Page | Full page renders from published content | Phase 6 | Low |
| 8 — YouTube Integration | Video published and embedded | Phase 6 | Medium |
| 9 — End-to-End Verification | Full cycle confirmed for all active topics | Phases 1–7 | Low |

---

## Best next step

**Start with Phase 1.**

Everything else depends on Cloudflare D1 being provisioned, migrated, and seeded,
and on Cloudflare Pages being connected to this repository. Both are environment
setup tasks that take under an hour and unlock all subsequent phases.

Once Phase 1 is done, Phases 2 and 3 can proceed in parallel and are low-risk
since the frontend code and Pages Functions are already implemented and ready to deploy.
