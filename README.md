# Modern Content Platform

An AI-powered multi-topic intelligence and publishing platform that monitors live events, classifies and scores them, delivers intraday alerts, and produces a daily editorial output per topic — including summaries, video scripts, and website pages.

---

## What This Platform Does

Modern Content Platform tracks signals across multiple topics, processes them with AI, and produces two parallel outputs:

1. **Intraday alerts** — real-time events detected, scored, and delivered to Telegram, Discord, and the website timeline.
2. **Daily editorial publishing** — a structured end-of-day summary, video script, and website page published per topic every day.

Supported topics include: **crypto, finance, economy, health, AI, energy, technology**, with the model designed to support additional topics over time.

---

## Two Core Flows

### 1. Intraday Alert Flow

Monitors news, data, and signals throughout the day.

```
Source signals
  → n8n intraday workflows
    → AI classification and scoring
      → D1 alert storage
        → Telegram and Discord delivery
          → Meta / X / Discord story delivery (high-priority alerts)
            → Website timeline display
```

Key characteristics:
- Events are ingested, normalized, deduplicated, clustered, and scored by AI.
- Source trust tier and trust score influence AI confidence and alert thresholds.
- Structured alert records are written to Cloudflare D1 via internal write API endpoints.
- Alerts are delivered to Telegram and Discord immediately.
- High-importance alerts can also trigger Meta (Instagram/Facebook) and social story delivery.
- The Vue frontend reads alerts via thin Pages Functions APIs and displays them on the topic timeline.

### 2. Daily Editorial Flow

Runs once per day per topic to produce final editorial output.

```
D1 daily state + stored alerts
  → n8n daily workflow
    → AI summarization, article, expectation check, tomorrow outlook
      → Video script + image generation + narration → video render
        → YouTube metadata generation
          → Output validation
            → Structured JSON + Markdown written to GitHub
              → D1 state update
                → Meta social post (Instagram / Facebook)
                  → Social content post (X / Telegram / Discord)
                    → Cloudflare Pages redeploy
                      → Topic/day page live on the website
```

Key characteristics:
- Final content is structured, validated, and stored in GitHub — not in D1.
- D1 tracks publish state, readiness, and navigation metadata.
- The Vue frontend renders the topic/day page from GitHub-sourced content served at deploy time.
- YouTube video metadata is stored alongside the editorial content.
- Social publishing to Meta, X, Telegram, and Discord is non-blocking and runs after GitHub publishing.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Sources: News APIs, RSS, X accounts/queries, webhooks, social  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  n8n (self-hosted)                                              │
│  Intraday (11 modules):                                         │
│    ingest → normalize → deduplicate → cluster → classify        │
│    → decide → D1 persist → Telegram → Discord                   │
│    → Meta story → social story                                  │
│  Daily (14 modules):                                            │
│    aggregate → summarize → article → expectation check          │
│    → tomorrow outlook → video script → images → narration       │
│    → render → YouTube metadata → validate → GitHub publish      │
│    → D1 update → Meta social → social channels                  │
└────────┬──────────────────────────────────────┬────────────────┘
         │                                      │
         ▼                                      ▼
┌──────────────────┐                 ┌────────────────────────────┐
│  Cloudflare D1   │                 │  GitHub (this repo)        │
│  - alerts        │                 │  content/{topic}/{date}/   │
│  - event_clusters│                 │  - article.md              │
│  - daily_status  │                 │  - summary.json            │
│  - publish_jobs  │                 │  - metadata.json           │
│  - workflow_logs │                 │  - video.json              │
│  - sources       │                 └──────────────┬─────────────┘
│  - openai_usage_log          │                   │
│  - meta_social_publish_log   │                   │
│  - social_publish_log        │                   │
└────────┬─────────┘                                │
         │                                          │
         ▼                                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  Cloudflare Pages + Pages Functions                             │
│  Read APIs:  topics, timeline, day-status, navigation, sources  │
│  Write APIs: alerts, daily-status, publish-jobs, sources,       │
│              workflow-logs, openai-usage-log,                   │
│              meta-social-publish-log, social-publish-log        │
│  Vue frontend: topic pages, homepage, timeline, placeholders     │
└────────┬────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Delivery                                                       │
│  - Website (Cloudflare Pages)                                   │
│  - Telegram (intraday alerts + daily digests)                   │
│  - Discord  (intraday alerts + daily digests)                   │
│  - Meta: Instagram + Facebook (daily posts + alert stories)     │
│  - X (daily posts)                                              │
│  - YouTube (daily video)                                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Technology Roles

| Technology | Role |
|---|---|
| **Vue.js** | Frontend rendering — topic pages, homepage, timeline UI, placeholder states, source attribution display |
| **Cloudflare Pages** | Static hosting and auto-deploy on GitHub push |
| **Cloudflare Pages Functions** | Thin read APIs over D1 (timeline, day status, navigation, topics, sources) and authenticated write APIs for n8n workflow outputs |
| **Cloudflare D1** | Live operational data — alerts, clusters, daily status, publish jobs, workflow logs, source registry, `openai_usage_log`, `meta_social_publish_log`, and `social_publish_log` |
| **GitHub** | Canonical store for final editorial content — summaries, articles, video metadata |
| **n8n** | Orchestration — ingestion, normalization, clustering, classification, summarization, publishing, social delivery |
| **AI** | Classification, summarization, timeline phrasing, video scripts, image generation, narration (TTS), YouTube metadata, tomorrow outlooks |
| **Telegram / Discord** | Intraday alert delivery and daily digest publishing |
| **Meta (Instagram / Facebook)** | Daily feed posts and high-importance alert stories |
| **X** | Daily editorial posts |
| **YouTube** | Daily video publishing; metadata referenced in editorial content |

---

## Repository Structure

```text
.
├── app/              # Vue frontend application
│   ├── src/
│   │   ├── components/   # Reusable UI components
│   │   │   ├── AlertTimeline.vue       # Timeline list with load-more pagination
│   │   │   ├── AlertTimelineItem.vue   # Single alert row with severity badge
│   │   │   ├── DateNavigator.vue       # Prev/next day navigation
│   │   │   ├── PageStateBanner.vue     # Page state indicator banner
│   │   │   ├── SourceBadge.vue         # Source type label badge
│   │   │   ├── SourceList.vue          # Summary source attribution list
│   │   │   ├── SummaryPlaceholder.vue  # Placeholder before editorial is ready
│   │   │   ├── SummarySection.vue      # Daily summary text with markdown
│   │   │   ├── TopicCard.vue           # Topic card for homepage grid
│   │   │   ├── TopicDayHeader.vue      # Topic/day page header
│   │   │   ├── TopicGrid.vue           # Responsive topic card grid
│   │   │   └── VideoEmbed.vue          # YouTube video embed
│   │   ├── layouts/      # Shared page layouts (DefaultLayout)
│   │   ├── pages/        # Route-level page views
│   │   │   ├── HomePage.vue            # Topic grid homepage
│   │   │   ├── NotFoundPage.vue        # 404 page
│   │   │   ├── TopicDayPage.vue        # Topic + date editorial page
│   │   │   └── TopicPage.vue           # Topic redirect to latest day
│   │   ├── router/       # Vue Router route definitions
│   │   ├── services/     # Frontend data access helpers (api.js, content.js)
│   │   ├── styles/       # Global styles
│   │   └── utils/        # Frontend utilities
│   │       ├── date.js              # Date formatting and helpers
│   │       ├── mediaMode.js         # Media mode validation (image_video / full_video)
│   │       ├── metaSocialFormat.js  # Meta (Instagram/Facebook) caption formatting
│   │       ├── normalizeItem.js     # Source item normalization for ingestion
│   │       ├── openaiConfig.js      # AI provider config and per-task model resolution
│   │       ├── socialFormat.js      # X / Telegram / Discord post formatting
│   │       ├── sourceConfig.js      # Source registry config helpers
│   │       ├── sourceProviders.js   # Provider mode selection (hybrid/X-only/NewsAPI-only)
│   │       ├── sourceTrust.js       # Trust tier scoring and confirmation rules
│   │       ├── url.js               # URL safety validation
│   │       └── validateAiOutput.js  # Per-task AI output validation
│   └── public/           # Static assets (_redirects for SPA routing)
│
├── functions/        # Cloudflare Pages Functions
│   ├── api/
│   │   ├── timeline/[topicSlug]/[dateKey].js     # GET — alert timeline
│   │   ├── day-status/[topicSlug]/[dateKey].js   # GET — page state and flags
│   │   ├── navigation/[topicSlug]/[dateKey].js   # GET — prev/next day keys
│   │   ├── topics/index.js                       # GET — active topic listing
│   │   ├── sources/index.js                      # GET — source registry
│   │   └── internal/                             # POST — authenticated write endpoints
│   │       ├── alerts.js                         # Write alerts + cluster upsert + daily_status update
│   │       ├── daily-status.js                   # Upsert daily_status rows
│   │       ├── publish-jobs.js                   # Create and update publish jobs
│   │       ├── sources.js                        # Register sources in the source registry
│   │       ├── workflow-logs.js                  # Write workflow execution events
│   │       ├── openai-usage-log.js               # Record per-task OpenAI usage
│   │       ├── meta-social-publish-log.js        # Log Meta publishing attempts
│   │       └── social-publish-log.js             # Log X/Telegram/Discord publish attempts
│   └── lib/
│       ├── auth.js       # X-Write-Key authentication for internal endpoints
│       ├── db.js         # D1 query helpers and response builders
│       ├── validate.js   # Payload validation for write endpoints
│       └── writers.js    # Centralized D1 write functions (SQL + parameter binding)
│
├── content/          # GitHub-backed editorial content (final output)
│   └── topics/
│       └── {topic_slug}/
│           └── {date_key}/
│               ├── article.md       # Final article text (Markdown)
│               ├── summary.json     # Structured daily summary
│               ├── metadata.json    # Publish metadata and page state
│               └── video.json       # YouTube embed and metadata
│
├── db/               # Cloudflare D1 database assets
│   ├── migrations/       # Migration-safe SQL (apply in filename order)
│   │   ├── 0001_init.sql                      # topics, alerts, event_clusters, daily_status, publish_jobs
│   │   ├── 0002_event_clusters_unique.sql     # UNIQUE constraint for cluster upserts
│   │   ├── 0003_workflow_logs.sql             # Observability — workflow execution events
│   │   ├── 0004_source_registry.sql           # Source registry (sources table)
│   │   ├── 0005_source_attribution.sql        # Source attribution columns on alerts
│   │   ├── 0006_alerts_trust_columns.sql      # trust_tier and trust_score on alerts
│   │   ├── 0007_openai_usage_log.sql          # Per-task AI call monitoring
│   │   ├── 0008_openai_usage_observability.sql # Retry/cost/diagnostic fields on openai_usage_log
│   │   ├── 0009_meta_social_publish_log.sql   # Meta (Instagram/Facebook) publish tracking
│   │   └── 0010_social_publish_log.sql        # X/Telegram/Discord publish tracking
│   ├── schema/           # Canonical schema reference documentation
│   ├── queries/          # Reusable read query examples
│   └── seeds/            # Local and test seed data (topics, sources, sample alerts)
│
├── workflows/        # n8n orchestration assets
│   ├── contracts/        # Workflow stage input/output data contracts
│   │   ├── intraday_source_item.json
│   │   ├── intraday_normalized_item.json
│   │   ├── intraday_classified_alert.json
│   │   ├── intraday_delivery_payload.json
│   │   ├── daily_aggregate_context.json
│   │   ├── daily_generation_output.json
│   │   ├── meta_social_asset.json
│   │   ├── social_content_asset.json
│   │   └── workflow_runtime_config.json
│   ├── n8n/intraday/     # Intraday alert modules (01–11 + orchestrator)
│   ├── n8n/daily/        # Daily editorial modules (01–14 + orchestrator)
│   └── n8n/shared/       # Shared modules (failure_notifier)
│
├── schemas/          # Shared JSON schemas across systems
│   ├── api/              # Pages Functions response contracts (topics, timeline, day-status, navigation)
│   ├── ai/               # AI output shapes (classification, summary, video script, YouTube metadata,
│   │                     #   image asset, narration asset, render asset, full video, Meta social post,
│   │                     #   expectation check, tomorrow outlook, timeline entry)
│   ├── content/          # Editorial and published content contracts shared across generation and rendering
│   └── workflow/         # Workflow write payload contracts (alerts, daily status, publish jobs,
│                         #   sources, workflow logs, openai_usage_log, meta_social_publish_log, social_publish_log)
│
├── config/           # Operator configuration files
│   ├── sources/          # Per-topic source definitions (JSON arrays for INTRADAY_SOURCES_JSON)
│   │   ├── ai.json
│   │   ├── crypto.json
│   │   ├── economy.json
│   │   ├── energy.json
│   │   ├── finance.json
│   │   └── health.json
│   ├── examples/         # Example .env files for common deployment configurations
│   ├── media-mode.json         # Media pipeline mode definitions (image_video / full_video)
│   ├── meta-publishing.json    # Meta (Instagram/Facebook) platform config and limits
│   ├── openai-cost-controls.json  # Per-task token caps and batch size limits
│   ├── social-publishing.json  # X/Telegram/Discord platform config and formatting
│   └── trust-rules.json        # Source trust tier definitions and scoring rules
│
├── fixtures/         # Test fixtures used by the integration test suite
│   ├── classified-alerts/     # Sample classified alert outputs per topic
│   ├── daily-summaries/       # Sample daily summary JSON
│   ├── normalized-items/      # Sample normalized source items (all source types)
│   ├── source-events/         # Sample raw source events (all source types)
│   ├── video-scripts/         # Sample video script outputs
│   ├── youtube-metadata/      # Sample YouTube metadata outputs
│   ├── page-states/           # Sample D1 page state fixtures (pending/ready/published)
│   ├── provider-configs/      # Sample AI provider config fixtures
│   ├── ai-provider-configs/   # AI provider environment fixture variations
│   ├── media-mode/            # Media mode fixture variations
│   ├── meta-social/           # Sample Meta social post outputs
│   └── social-content/        # Sample X/Telegram/Discord social content outputs
│
├── n8n/              # Local n8n Docker environment
│   ├── docker-compose.yml  # Runs n8n locally on http://localhost:5678
│   └── README.md           # Local n8n setup guide
│
├── docs/             # Architecture and operational documentation
│   ├── architecture/     # System design decisions
│   │   ├── intraday-workflow.md
│   │   ├── daily-editorial-workflow.md
│   │   ├── alert-classification-flow.md
│   │   ├── trust-scoring.md
│   │   ├── observability.md
│   │   ├── openai-cost-controls.md
│   │   ├── ai-provider.md
│   │   ├── video-script-generation.md
│   │   ├── full-video-mode.md
│   │   ├── youtube-metadata-generation.md
│   │   ├── expectation-check-outlook.md
│   │   ├── meta-social-publishing.md
│   │   ├── social-content-publishing.md
│   │   ├── source-aware-prompting.md
│   │   ├── source-aware-ai-schemas.md
│   │   └── workflow-runtime-variables.md
│   ├── data-model/       # D1 and content model references
│   │   ├── normalized-source-item.md
│   │   └── source-registry.md
│   ├── operations/       # Operational procedures (placeholder)
│   ├── runbooks/         # Incident and rerun guidance (placeholder)
│   ├── local-development.md       # Full local setup guide
│   ├── local-summary-generation.md # Local editorial pipeline walkthrough
│   ├── staging-environment.md     # Staging environment strategy
│   ├── integration-testing.md     # Test suite overview and how to run
│   ├── source-strategy.md         # Source trust model and per-topic strategy
│   ├── source-provider-modes.md   # X / NewsAPI provider mode selection
│   ├── ai-provider-media-modes.md # AI provider and media mode combinations
│   ├── alert-write-flow.md        # Alert write pipeline documentation
│   ├── d1-write-path.md           # D1 write path and internal API reference
│   ├── read-path-verification.md  # Read API verification guide
│   ├── image-video-pipeline.md    # Image/video generation pipeline
│   ├── daily-summary-source-attribution.md
│   ├── video-script-source-attribution.md
│   ├── x-source-rules.md
│   └── roadmap.md
│
├── scripts/          # Utility scripts for local development
│   ├── local-reset.sh              # Reset local D1, apply all migrations, reseed data
│   └── generate-daily-summary.js  # Generate a local editorial summary for a topic/date
│
└── .github/          # Copilot prompts, agents, skills, and GitHub automation
    ├── copilot-instructions.md
    ├── agents/           # Agent definitions and supporting configuration
    ├── prompts/          # Reusable Copilot prompt files
    ├── skills/           # Custom Copilot agent skills (d1-schema, n8n-workflows, vue-topic-pages)
    └── workflows/        # GitHub Actions CI
```

### Responsibility boundaries

| Directory | Owns |
|---|---|
| `app/` | Frontend rendering, route composition, utility logic, and integration test suite |
| `functions/` | Thin read APIs over D1 and authenticated write APIs for workflow outputs |
| `content/` | Final published editorial artifacts |
| `db/` | D1 schema design and migration history |
| `workflows/` | n8n orchestration assets and data contracts |
| `schemas/` | Shared structured contracts between systems |
| `config/` | Operator configuration for sources, trust rules, media modes, social platforms |
| `fixtures/` | Test fixtures for the integration test suite |
| `n8n/` | Local n8n Docker development environment |
| `docs/` | Architecture and operational documentation |
| `scripts/` | Local and CI utility scripts |

---

## D1 Schema Overview

Ten migrations are applied in order to build the full schema:

| Migration | Tables / Changes |
|---|---|
| `0001_init.sql` | `topics`, `alerts`, `event_clusters`, `daily_status`, `publish_jobs` |
| `0002_event_clusters_unique.sql` | UNIQUE constraint on `event_clusters(topic_slug, date_key, cluster_label)` |
| `0003_workflow_logs.sql` | `workflow_logs` — observability and failure tracking |
| `0004_source_registry.sql` | `sources` — source registry for ingestion and attribution |
| `0005_source_attribution.sql` | Source attribution columns on `alerts` (`source_type`, `source_domain`, etc.) |
| `0006_alerts_trust_columns.sql` | `trust_tier`, `trust_score` columns on `alerts` |
| `0007_openai_usage_log.sql` | `openai_usage_log` — per-task AI call monitoring |
| `0008_openai_usage_observability.sql` | Retry/cost/diagnostic fields on `openai_usage_log` |
| `0009_meta_social_publish_log.sql` | `meta_social_publish_log` — Meta publish attempt tracking |
| `0010_social_publish_log.sql` | `social_publish_log` — X/Telegram/Discord publish tracking |

---

## n8n Workflow Modules

### Intraday pipeline (11 modules + orchestrator)

| Module | Purpose |
|---|---|
| `01_source_ingestion` | Fetch events from RSS, APIs, webhooks, social, X accounts/queries |
| `02_normalization` | Normalize to a standard item shape; apply source trust tier |
| `03_deduplication` | Deduplicate against recent D1 alerts |
| `04_clustering` | Group items into event clusters |
| `05_ai_classification` | AI classifies and scores each item (importance, severity, confidence) |
| `06_alert_decision` | Apply thresholds; decide which items become alerts |
| `07_d1_persistence` | Write alerts and clusters to D1 via internal write API |
| `08_telegram_delivery` | Deliver alerts to Telegram |
| `09_discord_delivery` | Deliver alerts to Discord |
| `10_meta_story_delivery` | Deliver high-importance alerts as Meta stories |
| `11_social_story_delivery` | Deliver high-importance alerts to X/Telegram/Discord |

### Daily pipeline (14 modules + orchestrator)

| Module | Purpose |
|---|---|
| `01_aggregate_alerts` | Aggregate D1 alerts and clusters for the target topic/date |
| `02_generate_summary` | AI generates structured daily summary JSON |
| `03_generate_article` | AI generates full editorial article (Markdown) |
| `04_generate_expectation_check` | AI checks whether expectations from prior day were met |
| `05_generate_tomorrow_outlook` | AI generates tomorrow's key expectations |
| `06_generate_video_script` | AI generates video script from summary |
| `06b_generate_images` | AI generates still images for image_video mode |
| `06c_generate_narration` | AI generates TTS narration audio |
| `06d_render_video` | Assembles images and narration into final video |
| `06_full_video_generation` | Full AI-generated video (reserved for future use) |
| `07_generate_youtube_metadata` | AI generates YouTube title, description, tags |
| `08_validate_outputs` | Validates all AI outputs against JSON schemas |
| `09_publish_to_github` | Writes content files to GitHub (article.md, summary.json, metadata.json, video.json) |
| `10_update_d1_state` | Updates daily_status and publish_jobs in D1; writes workflow_log |
| `11_generate_meta_social` | AI generates Meta (Instagram/Facebook) social post content |
| `12_publish_meta_daily` | Publishes to Instagram and Facebook (non-blocking) |
| `13_generate_social_content` | Formats social content for X, Telegram, and Discord |
| `14_publish_social_channels` | Publishes to X, Telegram, and Discord (non-blocking) |

---

## Roadmap

See [`docs/roadmap.md`](docs/roadmap.md) for the full phase-by-phase implementation plan,
deliverables per phase, dependencies, risks, and the recommended best next step.

### v1 — Foundation (implemented)

- [x] Repository structure and boundary definitions
- [x] D1 schema: 10 migrations covering all tables, indexes, and constraints
- [x] Source registry: `sources` table, trust tiers (T1–T4), source attribution on alerts
- [x] Trust scoring: confidence adjustments, confirmation rules (`sourceTrust.js`)
- [x] Cloudflare Pages Functions — read APIs: timeline, day-status, navigation, topics, sources
- [x] Cloudflare Pages Functions — write APIs: alerts, daily-status, publish-jobs, sources, workflow-logs, openai-usage-log, meta-social-publish-log, social-publish-log
- [x] Authentication helper for write endpoints (X-Write-Key header)
- [x] Centralized D1 write helpers (`functions/lib/writers.js`)
- [x] Vue frontend: homepage, topic page, topic/day page, 404 page
- [x] Vue components: AlertTimeline, AlertTimelineItem, DateNavigator, PageStateBanner, SourceBadge, SourceList, SummaryPlaceholder, SummarySection, TopicCard, TopicDayHeader, TopicGrid, VideoEmbed
- [x] Vue utilities: date, url, mediaMode, openaiConfig, sourceTrust, sourceProviders, sourceConfig, normalizeItem, socialFormat, metaSocialFormat, validateAiOutput
- [x] n8n intraday workflow: 11 modules covering ingest → normalize → deduplicate → cluster → classify → decide → D1 → Telegram → Discord → Meta story → social story
- [x] n8n daily workflow: 14 modules covering aggregate → summarize → article → checks → video pipeline → YouTube metadata → validate → GitHub → D1 state → Meta social → social channels
- [x] n8n shared: failure_notifier module with Telegram alerting and stale job cleanup
- [x] n8n local development: Docker Compose environment (`n8n/`)
- [x] AI prompt schemas: classification, summarization, video script, image asset, narration, render, YouTube metadata, tomorrow outlook, expectation check, timeline entry, Meta social post
- [x] Workflow data contracts: source item, normalized item, classified alert, delivery payload, aggregate context, generation output, meta social asset, social content asset, runtime config
- [x] Content model: article.md, summary.json, metadata.json, video.json per topic/date
- [x] Media mode system: image_video (default) and full_video (reserved); provider capability validation
- [x] AI provider system: OpenAI and Google; per-task model selection; cost controls and token caps
- [x] Social publishing: Meta (Instagram/Facebook) daily posts and alert stories
- [x] Social publishing: X, Telegram, Discord daily digests and alert stories
- [x] Observability: workflow_logs, openai_usage_log, social publish logs in D1
- [x] Per-topic source configs (`config/sources/`) for all 6 v1 topics
- [x] Config files: media-mode.json, meta-publishing.json, openai-cost-controls.json, social-publishing.json, trust-rules.json
- [x] Integration test suite: Pages Functions (read + write), Vue pages and components, utilities, services, fixtures, workflow contracts
- [x] Local development scripts: `local-reset.sh` (reset D1 + reseed), `generate-daily-summary.js` (local editorial pipeline)
- [x] Local development environment: wrangler.toml, .env.example, VS Code config, full setup guide
- [x] Sample content: crypto, finance, ai topic/date content files
- [ ] Cloudflare D1 provisioned and migrations applied
- [ ] Cloudflare Pages connected to this repository
- [ ] n8n instance deployed and workflows configured
- [ ] Telegram and Discord alert delivery wired and tested
- [ ] YouTube video metadata integration
- [ ] End-to-end cycle verified for all active topics

### v2 — Reliability and Scale

- [ ] Delivery retry workflow for undelivered Telegram/Discord alerts
- [ ] Workflow monitoring dashboard
- [ ] Rerun and recovery runbooks
- [ ] Source signal expansion
- [ ] Multi-language support
- [ ] Advanced AI clustering and deduplication
- [ ] Summary index table in D1 for faster navigation
- [ ] Performance and caching improvements

---

## Getting Started

### Prerequisites

- **Node.js** 20 LTS or later
- **Wrangler CLI** — `npm install -g wrangler`
- **Docker** — for local n8n development
- A **Cloudflare account** with Pages and D1 enabled (for remote operations)

### Quick local start

```bash
# 1. Install frontend dependencies
cd app && npm install && cd ..

# 2. Authenticate Wrangler (handles Cloudflare auth — no .env needed for CLI)
wrangler login

# 3. Reset local D1: apply all 10 migrations + seed topics and sample alerts
bash scripts/local-reset.sh

# 4a. Vue frontend only (hot-reload, no API)
cd app && npm run dev

# 4b. Full stack: frontend + Pages Functions + D1
cd app && npm run build && cd ..
wrangler pages dev app/dist --d1=DB
```

> **Note:** Wrangler does not automatically read `.env`. Use `wrangler login` for Cloudflare auth.
> For local Pages Functions secrets (e.g. the `WRITE_API_KEY` for internal endpoints), create a
> `.dev.vars` file (see [`docs/local-development.md`](docs/local-development.md) for details).
> Copy `.env.example` to `.env` only for services that need it (n8n, external tooling).

### Run tests

```bash
cd app

# All tests (unit + integration)
npm run test:run

# Integration tests only
npm run test:integration

# Watch mode (development)
npm run test
```

See [`docs/integration-testing.md`](docs/integration-testing.md) for the full test suite overview.

### Local editorial pipeline

After resetting local D1 with seed data, generate a local daily summary:

```bash
node scripts/generate-daily-summary.js --topic ai --date 2025-01-15
```

See [`docs/local-summary-generation.md`](docs/local-summary-generation.md) for details.

### Local n8n

```bash
# Copy environment variables
cp .env.example .env
# Fill in API keys as needed

# Start n8n (available at http://localhost:5678)
docker compose -f n8n/docker-compose.yml --env-file .env up -d
```

See [`n8n/README.md`](n8n/README.md) for the full local n8n setup guide.

### Deployment

See [`docs/roadmap.md`](docs/roadmap.md) for the phase-by-phase deployment guide, including
Cloudflare infrastructure provisioning, D1 migration steps, n8n workflow import order, and
required credentials and environment variables per phase.

---

## Contributing

This repository uses GitHub Copilot agent skills and prompt files in `.github/` to assist with architecture, schema design, workflow design, and frontend development.

See `.github/copilot-instructions.md` for platform conventions and guidance.

---

## License

See [LICENSE](LICENSE).
