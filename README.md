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
          → Website timeline display
```

Key characteristics:
- Events are ingested, deduplicated, clustered, and scored by AI.
- Structured alert records are written to Cloudflare D1.
- Alerts are delivered to Telegram and Discord immediately.
- The Vue frontend reads alerts via a thin Pages Functions API and displays them on the topic timeline.

### 2. Daily Editorial Flow

Runs once per day per topic to produce final editorial output.

```
D1 daily state + stored alerts
  → n8n daily workflow
    → AI summarization and video script generation
      → Structured JSON + Markdown written to GitHub
        → Cloudflare Pages redeploy
          → Topic/day page live on the website
```

Key characteristics:
- Final content is structured, validated, and stored in GitHub — not in D1.
- D1 tracks publish state, readiness, and navigation metadata.
- The Vue frontend renders the topic/day page from GitHub-sourced content served at deploy time.
- YouTube video metadata is stored alongside the editorial content.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Sources: News APIs, market data, social signals, RSS           │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  n8n (self-hosted)                                              │
│  Intraday workflows:  ingest → deduplicate → classify → score   │
│  Daily workflows:     aggregate → summarize → script → publish  │
└────────┬──────────────────────────────────────┬────────────────┘
         │                                      │
         ▼                                      ▼
┌──────────────────┐                 ┌────────────────────────────┐
│  Cloudflare D1   │                 │  GitHub (this repo)        │
│  - alerts        │                 │  content/{topic}/{date}/   │
│  - timeline      │                 │  - article.md              │
│  - daily status  │                 │  - summary.json            │
│  - publish state │                 │  - metadata.json           │
│  - nav metadata  │                 │  - video.json              │
└────────┬─────────┘                 └──────────────┬─────────────┘
         │                                          │
         ▼                                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  Cloudflare Pages + Pages Functions                             │
│  - Vue frontend renders topic pages, homepage, timeline         │
│  - Pages Functions provide thin read APIs over D1               │
└────────┬────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Delivery                                                       │
│  - Website (Cloudflare Pages)                                   │
│  - Telegram alerts                                              │
│  - Discord alerts                                               │
│  - YouTube (daily video)                                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Technology Roles

| Technology | Role |
|---|---|
| **Vue.js** | Frontend rendering — topic pages, homepage, timeline UI, placeholder states |
| **Cloudflare Pages** | Static hosting and auto-deploy on GitHub push |
| **Cloudflare Pages Functions** | Thin read APIs over D1 (timeline, day status, navigation, topics) |
| **Cloudflare D1** | Live operational data — alerts, daily status, publish state, navigation metadata |
| **GitHub** | Canonical store for final editorial content — summaries, articles, video metadata |
| **n8n** | Orchestration — ingestion, classification, summarization, publishing, delivery |
| **AI** | Classification, summarization, timeline phrasing, video script generation, outlooks |
| **Telegram / Discord** | Intraday alert delivery |
| **YouTube** | Daily video publishing; metadata referenced in editorial content |

---

## Repository Structure

```text
.
├── app/              # Vue frontend application
│   ├── src/
│   │   ├── components/   # Reusable UI components
│   │   ├── layouts/      # Shared page layouts
│   │   ├── pages/        # Route-level page views
│   │   ├── router/       # Route definitions
│   │   ├── services/     # Frontend data access helpers
│   │   ├── styles/       # Global styles
│   │   └── utils/        # Frontend utilities
│   └── public/           # Static assets
│
├── functions/        # Cloudflare Pages Functions (thin read APIs)
│   ├── api/timeline/     # Live alert timeline reads
│   ├── api/day-status/   # Topic/day readiness and publish state
│   ├── api/navigation/   # Previous and next day navigation
│   ├── api/topics/       # Topic metadata and listing
│   └── lib/              # Shared function helpers
│
├── content/          # GitHub-backed editorial content (final output)
│   └── topics/
│       └── {topic_slug}/
│           └── {date_key}/
│               ├── article.md       # Final article text
│               ├── summary.json     # Structured daily summary
│               ├── metadata.json    # Publish metadata
│               └── video.json       # YouTube embed and metadata
│
├── db/               # Cloudflare D1 database assets
│   ├── migrations/       # Migration-safe SQL changes
│   ├── schema/           # Canonical schema references
│   ├── queries/          # Reusable read query examples
│   └── seeds/            # Local and test seed data
│
├── workflows/        # n8n orchestration assets
│   ├── contracts/        # Workflow stage input/output contracts
│   ├── n8n/intraday/     # Live alert workflows
│   ├── n8n/daily/        # End-of-day summary and publishing workflows
│   └── n8n/shared/       # Reusable workflow modules
│
├── schemas/          # Shared JSON schemas across systems
│   ├── api/              # Pages Functions response contracts
│   ├── content/          # Editorial content shape definitions
│   ├── ai/               # AI output shape definitions
│   └── workflow/         # Workflow step payload contracts
│
├── docs/             # Architecture and operational documentation
│   ├── architecture/     # System design decisions
│   ├── data-model/       # D1 and content model references
│   ├── operations/       # Operational procedures
│   └── runbooks/         # Incident and rerun guidance
│
├── scripts/          # Utility scripts for local and CI tasks
│
└── .github/          # Copilot prompts, agents, skills, and GitHub automation
    ├── copilot-instructions.md
    ├── agents/           # Agent definitions and supporting configuration
    ├── prompts/          # Reusable Copilot prompt files
    └── skills/           # Custom Copilot agent skills
```

### Responsibility boundaries

| Directory | Owns |
|---|---|
| `app/` | Frontend rendering and route composition |
| `functions/` | Thin read APIs over D1 |
| `content/` | Final published editorial artifacts |
| `db/` | D1 schema design and migration history |
| `workflows/` | n8n orchestration assets and contracts |
| `schemas/` | Shared structured contracts between systems |
| `docs/` | Architecture and operational documentation |
| `scripts/` | Local and CI utility scripts |

---

## Roadmap

See [`docs/roadmap.md`](docs/roadmap.md) for the full phase-by-phase implementation plan,
deliverables per phase, dependencies, risks, and the recommended best next step.

### v1 — Foundation

- [x] Repository structure and boundary definitions
- [x] D1 schema: alerts, daily status, publish state, navigation metadata
- [x] Cloudflare Pages Functions: timeline, day-status, navigation, topics APIs
- [x] Vue frontend: homepage, topic page, topic/day page, timeline component
- [x] n8n intraday workflow: ingest → deduplicate → classify → score → D1 → deliver
- [x] n8n daily workflow: aggregate → summarize → publish to GitHub → trigger redeploy
- [x] AI prompt schemas: classification, summarization, video script, tomorrow outlook
- [x] Content model: article.md, summary.json, metadata.json, video.json per topic/date
- [x] Local development environment: wrangler.toml, .env.example, VS Code config, setup guide
- [ ] Cloudflare D1 provisioned and migrations applied
- [ ] Cloudflare Pages connected to this repository
- [ ] n8n instance deployed and workflows configured
- [ ] Telegram and Discord alert delivery wired and tested
- [ ] YouTube video metadata integration
- [ ] End-to-end cycle verified for all active topics

### v2 — Reliability and Scale

- [ ] Workflow monitoring and alerting
- [ ] Rerun and recovery runbooks
- [ ] Source signal expansion
- [ ] Multi-language support
- [ ] Advanced AI clustering and deduplication
- [ ] Performance and caching improvements

---

## Getting Started

### Prerequisites

- **Node.js** 20 LTS or later
- **Wrangler CLI** — `npm install -g wrangler`
- A **Cloudflare account** with Pages and D1 enabled (for remote operations)

### Quick local start

```bash
# 1. Install frontend dependencies
cd app && npm install && cd ..

# 2. Authenticate Wrangler (handles Cloudflare auth — no .env needed for CLI)
wrangler login

# 3. Apply D1 migrations locally
wrangler d1 migrations apply modern-content-platform-db --local

# 4a. Vue frontend only (hot-reload, no API)
cd app && npm run dev

# 4b. Full stack: frontend + Pages Functions + D1
cd app && npm run build && cd ..
wrangler pages dev app/dist --d1=DB
```

> **Note:** Wrangler does not automatically read `.env`. Use `wrangler login` for Cloudflare auth.
> For local Pages Functions secrets (e.g. API keys used at runtime), create a `.dev.vars` file
> (see [`docs/local-development.md`](docs/local-development.md) for details).
> Copy `.env.example` to `.env` only for services that need it (n8n, external tooling).

See **[`docs/local-development.md`](docs/local-development.md)** for the full setup guide, VS Code configuration, and common commands reference.

### Deployment (placeholder)

Deployment configuration for Cloudflare Pages, D1 migrations, and n8n workflow imports will be documented here.

---

## Contributing

This repository uses GitHub Copilot agent skills and prompt files in `.github/` to assist with architecture, schema design, workflow design, and frontend development.

See `.github/copilot-instructions.md` for platform conventions and guidance.

---

## License

See [LICENSE](LICENSE).
