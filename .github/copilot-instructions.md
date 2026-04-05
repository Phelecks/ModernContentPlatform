# Modern Content Platform — Copilot Instructions

You are working in Modern Content Platform.

This repository is an AI-powered multi-topic intelligence and publishing platform.

## Core platform model

The platform supports topics such as:
- crypto
- finance
- economy
- health
- AI
- energy
- technology
- other future topics

The platform has two parallel outputs:

1. Intraday alert flow
- monitors news, data, and signals
- classifies and scores important events
- sends alerts to Telegram and Discord
- stores timeline entries in Cloudflare D1
- exposes those alerts on the website timeline

2. Daily editorial flow
- generates one daily summary per topic
- generates one daily video per topic
- publishes one topic/date page on the website
- stores final editorial content in GitHub
- deploys via Cloudflare Pages

## Tech stack

- Vue.js frontend
- Cloudflare Pages hosting
- Cloudflare Pages Functions for thin APIs
- Cloudflare D1 for live data and operational state
- GitHub for source control and content publishing
- self-hosted n8n for orchestration
- AI for classification, summarization, extraction, ranking, and content generation
- YouTube for daily video publishing
- Telegram and Discord for intraday alerts

## Architecture principles

Prefer:
- simplicity
- modularity
- reliability
- maintainability
- clear separation of responsibilities
- reusable page templates
- structured AI outputs
- deterministic validation
- explicit state tracking

## Responsibility split

GitHub owns:
- final daily summary content
- structured summary JSON
- markdown or editorial content
- frontend source code
- deployment-triggered publishing

Cloudflare D1 owns:
- alerts
- timeline records
- daily status
- navigation metadata
- workflow state
- publish state

Vue frontend owns:
- rendering
- routes
- topic/day pages
- homepage
- placeholder state
- summary display
- video embed
- timeline UI

Pages Functions own:
- thin read APIs over D1
- timeline endpoint
- day status endpoint
- navigation endpoint
- topics endpoint

n8n owns:
- ingestion
- normalization
- deduplication
- clustering
- AI calls
- alert scoring
- D1 writes
- Telegram/Discord delivery
- daily summary workflow
- GitHub publishing workflow
- YouTube workflow

AI owns:
- classification
- summarization
- timeline phrasing
- expectation checks
- tomorrow outlooks
- video scripts
- metadata generation

AI does not own final publication without validation.

## Data conventions

Prefer:
- topic_slug as stable identifier
- date_key in YYYY-MM-DD format
- created_at and updated_at on operational tables
- metadata_json for flexible extensions
- explicit status fields
- structured JSON outputs from AI before rendering or publishing

## Coding guidance

When proposing changes:
- keep boundaries between GitHub, D1, Vue, Pages Functions, n8n, and AI clear
- avoid overengineering
- prefer copy-paste-ready outputs
- provide migration-safe SQL for D1
- prefer dynamic routes and reusable components over one-off pages
- prefer thin APIs over frontend direct database logic
- explain tradeoffs briefly and recommend one clear path

## Output preference

When asked for architecture or implementation help, structure responses as:
1. Recommendation
2. Why
3. Suggested architecture or workflow
4. Suggested schema, routes, or files
5. Tradeoffs
6. Best next step