# Staging Environment Plan — Modern Content Platform

## Overview

This document defines the staging environment strategy for Modern Content Platform.
It covers the architecture, configuration, secret management, and promotion path
needed to safely test changes in a pre-production environment before going live.

The staging environment mirrors production as closely as possible while keeping
resources isolated so that bugs, bad data, or misconfigured workflows never affect
real users, channels, or published content.

---

## Three-environment model

| Environment | Purpose | Infrastructure |
|---|---|---|
| **Local** | Development and unit testing | Wrangler local D1 (SQLite), Vite dev server, Docker n8n |
| **Staging** | Pre-production integration testing | Cloudflare D1 (staging database), Cloudflare Pages (preview), staging n8n instance |
| **Production** | Live platform serving real users | Cloudflare D1 (production database), Cloudflare Pages (production), production n8n instance |

### Promotion flow

```
Local  ──►  Staging  ──►  Production
  │            │              │
  │  merge to  │   merge to   │
  │  staging   │   main       │
  │  branch    │   branch     │
  ▼            ▼              ▼
  local D1     staging D1     production D1
  localhost    preview URL    production URL
  local n8n    staging n8n    production n8n
```

---

## Staging architecture

### Branch strategy

| Branch | Environment | Auto-deploy |
|---|---|---|
| `main` | Production | Yes — Cloudflare Pages production deployment |
| `staging` | Staging | Yes — Cloudflare Pages preview deployment |
| Feature branches | Local only | No — developers run locally |

The `staging` branch is a long-lived integration branch. Feature branches are merged
into `staging` for pre-production testing, then `staging` is merged into `main` for
production release.

### Cloudflare Pages deployment

Cloudflare Pages supports **branch-based preview deployments** natively. Pushes to the
`staging` branch trigger a preview deployment at a stable preview URL such as:

```
https://staging.modern-content-platform.pages.dev
```

This preview deployment uses the same Pages project as production but runs from the
`staging` branch build output. No additional Pages project is needed.

Configure the Pages project in the Cloudflare dashboard:

| Setting | Value |
|---|---|
| Production branch | `main` |
| Preview branches | `staging` |
| Build command | `cd app && npm install && npm run build` |
| Build output directory | `app/dist` |

### D1 database binding per environment

Create a **separate D1 database** for staging. Never share the production database
with the staging environment.

```bash
# Create the staging database
wrangler d1 create modern-content-platform-db-staging
```

Use `wrangler.toml` environment overrides to bind the correct database per environment:

```toml
# wrangler.toml — production (default)
[[d1_databases]]
binding = "DB"
database_name = "modern-content-platform-db"
database_id = "YOUR_PRODUCTION_D1_DATABASE_ID"
migrations_dir = "db/migrations"

# Staging environment override
[env.staging]
[[env.staging.d1_databases]]
binding = "DB"
database_name = "modern-content-platform-db-staging"
database_id = "YOUR_STAGING_D1_DATABASE_ID"
migrations_dir = "db/migrations"
```

Apply migrations and seeds to the staging database:

```bash
# Apply migrations to staging D1
wrangler d1 migrations apply modern-content-platform-db-staging --remote

# Seed topics in staging
wrangler d1 execute modern-content-platform-db-staging --remote --file=db/seeds/topics.sql
```

### Pages Functions binding

Cloudflare Pages preview deployments can use **branch-specific D1 bindings**
configured in the Pages project settings under **Settings → Functions → D1 database
bindings**. Set the `DB` binding for the `staging` preview environment to point to
the staging D1 database.

| Binding | Production | Staging (preview) |
|---|---|---|
| `DB` | `modern-content-platform-db` | `modern-content-platform-db-staging` |

This ensures that Pages Functions in staging read from and write to the staging
database without any code changes.

---

## Component-level staging strategy

### Cloudflare D1

| Aspect | Strategy |
|---|---|
| Database | Separate `modern-content-platform-db-staging` instance |
| Schema | Same migrations applied in the same order as production |
| Seed data | Same `topics.sql` seed; optionally load `sample_alerts.sql` for testing |
| Data isolation | Staging D1 is completely independent — no shared state with production |
| Reset policy | Staging D1 can be wiped and re-migrated at any time without risk |

### Cloudflare Pages

| Aspect | Strategy |
|---|---|
| Deployment | Preview deployment from `staging` branch |
| URL | Stable preview URL (e.g. `staging.modern-content-platform.pages.dev`) |
| D1 binding | Points to staging D1 database |
| Secrets | Staging-specific secrets set in Pages project settings for preview |
| Build | Same build command as production (`cd app && npm install && npm run build`) |

### GitHub content publishing

The daily editorial workflow publishes content files to GitHub under
`content/topics/{topic_slug}/{date_key}/`. In staging, content should not pollute
the production content directory.

| Aspect | Strategy |
|---|---|
| Target branch | Staging n8n publishes to the `staging` branch |
| Content path | Same `content/topics/` path structure (no path prefix changes needed) |
| Isolation | Content published to `staging` branch never appears in `main` until merged |
| Review | Content in `staging` can be reviewed before promotion to `main` |

The staging n8n instance should be configured with:

```
GITHUB_CONTENT_BRANCH=staging
```

This ensures that the daily workflow's GitHub publish step targets the `staging` branch
instead of `main`.

### n8n workflows

| Aspect | Strategy |
|---|---|
| Instance | Separate staging n8n instance (Docker or self-hosted VM) |
| Workflows | Same workflow JSON files imported from `workflows/n8n/` |
| Credentials | Staging-specific credentials (staging API tokens, staging D1 ID, staging delivery channels) |
| Schedule | Staging orchestrators can run on the same schedule or be triggered manually |
| State isolation | Separate n8n data directory — no shared execution history with production |

**Do not share a single n8n instance between staging and production.** Credential
isolation and schedule independence require separate instances.

#### Staging n8n configuration

The staging n8n instance uses the same `docker-compose.yml` template but with
staging-specific environment variables:

| Variable | Staging value |
|---|---|
| `CLOUDFLARE_D1_DATABASE_ID` | Staging D1 database ID |
| `CLOUDFLARE_API_TOKEN` | Token scoped to staging D1 |
| `GITHUB_CONTENT_BRANCH` | `staging` |
| `TELEGRAM_CHAT_ID` | Staging Telegram channel ID |
| `DISCORD_WEBHOOK_URL` | Staging Discord webhook URL |
| `OPENAI_API_KEY` | Same key (or a separate key with lower spend limits) |

### Telegram and Discord delivery

| Aspect | Strategy |
|---|---|
| Telegram | Dedicated **staging Telegram channel** — separate from the production channel |
| Discord | Dedicated **staging Discord webhook** — posts to a staging-only channel |
| Isolation | Staging alerts never reach production delivery channels |

Create these channels before activating staging workflows:

1. **Telegram:** Create a staging channel (e.g. `MCP Staging Alerts`), add the bot, and
   note the chat ID.
2. **Discord:** Create a staging channel in your Discord server, create a webhook for it,
   and note the webhook URL.

### YouTube

YouTube integration should **not be active in staging** for v1. Video metadata
(`video.json`) is generated and committed to GitHub, but the actual YouTube upload
step should be disabled or skipped in the staging n8n workflows.

| Aspect | Strategy |
|---|---|
| Upload | Disabled in staging — no videos published to YouTube |
| Metadata | `video.json` is still generated and committed for testing |
| Risk | Avoids accidental public video uploads from staging content |

---

## Secret management

### Principles

1. **Never share secrets between environments.** Each environment has its own set of
   credentials.
2. **Never commit secrets to source control.** Use `.env` files locally, Cloudflare
   dashboard settings for Pages, and n8n credential storage for workflow secrets.
3. **Use least-privilege scoping.** API tokens should be scoped to the minimum
   permissions needed for each environment.
4. **Rotate staging secrets independently** of production secrets.

### Secret and configuration classes

The table below lists every secret and configuration variable, grouped by class,
with the recommended source per environment.

#### Cloudflare account and API access

| Variable | Local | Staging | Production |
|---|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | `.env` | n8n env / Pages settings | n8n env / Pages settings |
| `CLOUDFLARE_API_TOKEN` | `.env` | Staging-scoped token | Production-scoped token |
| `CLOUDFLARE_D1_DATABASE_ID` | `.env` | Staging D1 ID | Production D1 ID |
| `CLOUDFLARE_PAGES_PROJECT_NAME` | `.env` | Same project name | Same project name |

#### Internal write API

| Variable | Local | Staging | Production |
|---|---|---|---|
| `WRITE_API_KEY` | `.dev.vars` | Pages preview secrets | Pages production secrets |

#### GitHub publishing

| Variable | Local | Staging | Production |
|---|---|---|---|
| `GITHUB_TOKEN` | `.env` | Staging PAT (or same PAT) | Production PAT |
| `GITHUB_REPO_OWNER` | `.env` | Same owner | Same owner |
| `GITHUB_REPO_NAME` | `.env` | Same repo | Same repo |
| `GITHUB_CONTENT_BRANCH` | n/a | `staging` | `main` |

#### AI services

| Variable | Local | Staging | Production |
|---|---|---|---|
| `OPENAI_API_KEY` | `.env` | Same key or staging key | Production key |

#### Delivery channels

| Variable | Local | Staging | Production |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | `.env` | Same bot or staging bot | Production bot |
| `TELEGRAM_CHAT_ID` | `.env` | Staging channel ID | Production channel ID |
| `DISCORD_WEBHOOK_URL` | `.env` | Staging webhook URL | Production webhook URL |

#### Data sources

| Variable | Local | Staging | Production |
|---|---|---|---|
| `NEWS_API_KEY` | `.env` | Same key or staging key | Production key |

#### YouTube (v1 enhancement — disabled in staging)

| Variable | Local | Staging | Production |
|---|---|---|---|
| `YOUTUBE_CLIENT_ID` | n/a | n/a | Production OAuth client |
| `YOUTUBE_CLIENT_SECRET` | n/a | n/a | Production OAuth secret |

### Where secrets are stored

| Environment | Secret store | Notes |
|---|---|---|
| Local | `.env`, `.dev.vars` | Git-ignored files in the repo root |
| Staging n8n | n8n credential store + environment variables | Encrypted in n8n's SQLite database |
| Staging Pages | Cloudflare dashboard → Pages → Settings → Environment variables | Set for preview environment |
| Production n8n | n8n credential store + environment variables | Encrypted in n8n's database |
| Production Pages | Cloudflare dashboard → Pages → Settings → Environment variables | Set for production environment |

---

## Environment responsibility split

| Responsibility | Local | Staging | Production |
|---|---|---|---|
| D1 database | Local SQLite via Wrangler | `modern-content-platform-db-staging` | `modern-content-platform-db` |
| Pages hosting | `localhost:8788` (Wrangler) or `localhost:5173` (Vite) | Preview deployment (`staging.*`) | Production deployment |
| Pages Functions | Wrangler local dev | Preview deployment | Production deployment |
| n8n instance | Docker on developer machine | Separate staging instance | Separate production instance |
| GitHub branch | Feature branches | `staging` | `main` |
| Content publishing | Not applicable (local testing only) | Publishes to `staging` branch | Publishes to `main` branch |
| Telegram delivery | Developer's test channel (optional) | Staging channel | Production channel |
| Discord delivery | Developer's test webhook (optional) | Staging channel | Production channel |
| YouTube upload | Disabled | Disabled | Enabled (when ready) |
| Schema migrations | `--local` flag | Applied to staging D1 | Applied to production D1 |
| Seed data | Full sample data (`sample_alerts.sql`) | Topics seed + workflow-generated data | Topics seed + live data |

---

## Validation flow before production

Before promoting changes from staging to production, verify the following checklist:

### 1. Schema validation

- [ ] All D1 migrations applied to staging D1 without errors
- [ ] `SELECT name FROM sqlite_master WHERE type='table'` returns expected tables
- [ ] No data corruption — run sample queries against staging D1

### 2. Pages Functions validation

- [ ] `GET /api/topics` returns seeded topic list from staging D1
- [ ] `GET /api/day-status/{topicSlug}/{dateKey}` returns correct page state
- [ ] `GET /api/timeline/{topicSlug}/{dateKey}` returns alerts (if any exist)
- [ ] `GET /api/navigation/{topicSlug}/{dateKey}` returns correct prev/next links
- [ ] Internal write endpoints accept valid payloads with the staging `WRITE_API_KEY`

### 3. Frontend validation

- [ ] Homepage loads and renders topic grid from staging D1
- [ ] Topic page renders alert count and latest date
- [ ] Topic/day page renders timeline, summary, and placeholder states correctly
- [ ] SPA routing works for all defined routes
- [ ] No console errors in browser developer tools

### 4. Intraday pipeline validation

- [ ] Staging n8n orchestrator runs at least one full intraday cycle
- [ ] Alerts appear in staging D1 `alerts` table
- [ ] Event clusters appear in staging D1 `event_clusters` table
- [ ] `daily_status` row is created/updated
- [ ] Telegram alert delivered to staging channel
- [ ] Discord alert delivered to staging channel

### 5. Daily editorial pipeline validation

- [ ] Staging n8n daily orchestrator runs at least one full cycle
- [ ] `summary.json`, `article.md`, `metadata.json`, `video.json` committed to `staging` branch
- [ ] `daily_status` updated to `page_state = 'published'` in staging D1
- [ ] `publish_jobs` row updated to `status = 'success'`
- [ ] Topic/day page renders published content on the staging preview URL

### 6. Promotion

- [ ] All validation steps above pass
- [ ] Create a pull request from `staging` → `main`
- [ ] Review the diff — ensure no staging-specific configuration leaks into `main`
- [ ] Merge to `main` — Cloudflare Pages auto-deploys production
- [ ] Apply any new D1 migrations to the production database
- [ ] Verify production deployment matches staging behavior

---

## Promotion path: local → staging → production

### Step 1: Local development

1. Developer works on a feature branch.
2. Runs locally with Wrangler + local D1 + Docker n8n.
3. Runs linting (`npm run lint`) and tests (`npx vitest run`).
4. Commits and pushes to the feature branch.

### Step 2: Merge to staging

1. Open a pull request from the feature branch to `staging`.
2. Review and merge.
3. Cloudflare Pages auto-deploys the staging preview.
4. If the change includes D1 migrations, apply them to the staging database:
   ```bash
   wrangler d1 migrations apply modern-content-platform-db-staging --remote
   ```
5. If the change includes n8n workflow updates, import the updated JSON into the
   staging n8n instance.

### Step 3: Validate in staging

1. Run the validation checklist above.
2. Let the staging n8n instance run at least one full intraday and daily cycle.
3. Verify the staging preview URL, staging D1, and staging delivery channels.

### Step 4: Promote to production

1. Open a pull request from `staging` to `main`.
2. Review and merge.
3. Cloudflare Pages auto-deploys to production.
4. Apply any new D1 migrations to the production database:
   ```bash
   wrangler d1 migrations apply modern-content-platform-db --remote
   ```
5. If the change includes n8n workflow updates, import the updated JSON into the
   production n8n instance.
6. Verify production endpoints and delivery channels.

---

## Setting up staging for the first time

### Prerequisites

- Cloudflare account with D1 and Pages enabled
- Production Cloudflare Pages project already connected to this repository
- Wrangler CLI authenticated (`wrangler login`)

### Steps

1. **Create the staging D1 database:**
   ```bash
   wrangler d1 create modern-content-platform-db-staging
   ```
   Note the returned `database_id`.

2. **Add staging environment to `wrangler.toml`:**
   ```toml
   [env.staging]
   [[env.staging.d1_databases]]
   binding = "DB"
   database_name = "modern-content-platform-db-staging"
   database_id = "YOUR_STAGING_D1_DATABASE_ID"
   migrations_dir = "db/migrations"
   ```

3. **Apply migrations and seed data:**
   ```bash
   wrangler d1 migrations apply modern-content-platform-db-staging --remote
   wrangler d1 execute modern-content-platform-db-staging --remote --file=db/seeds/topics.sql
   ```

4. **Create the `staging` branch:**
   ```bash
   git checkout main
   git checkout -b staging
   git push origin staging
   ```

5. **Configure Pages preview deployment:**
   - In the Cloudflare dashboard, go to your Pages project → Settings.
   - Under **Builds & deployments → Branch deployments**, ensure `staging` is included
     in preview branches.
   - Under **Settings → Functions → D1 database bindings**, add a binding for the
     preview environment:
     - Variable name: `DB`
     - D1 database: `modern-content-platform-db-staging`

6. **Set staging secrets in Pages:**
   - Go to Pages project → Settings → Environment variables.
   - Add staging-specific values for the **Preview** environment:
     - `WRITE_API_KEY` → staging write key

7. **Set up staging delivery channels:**
   - Create a staging Telegram channel and add the bot.
   - Create a staging Discord channel and webhook.

8. **Deploy a staging n8n instance:**
   - Use the same `n8n/docker-compose.yml` on a staging server.
   - Configure staging-specific environment variables (staging D1 ID, staging
     delivery channels, `GITHUB_CONTENT_BRANCH=staging`).
   - Import all workflow JSON files from `workflows/n8n/`.
   - Configure staging n8n credentials.

9. **Test the staging deployment:**
   - Push a commit to the `staging` branch.
   - Verify the preview deployment loads at the staging URL.
   - Run the validation checklist.

---

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Staging n8n accidentally writes to production D1 | Data corruption | Use a separate Cloudflare API token scoped only to the staging D1 database |
| Staging alerts delivered to production Telegram/Discord | User confusion | Use dedicated staging channels with distinct names |
| Staging content merged to `main` without review | Unreviewed content published | Require pull request review for `staging` → `main` merges |
| Schema drift between staging and production D1 | Migration failures | Always apply the same migration files in the same order to both databases |
| Staging n8n credentials leak | Unauthorized access | Use least-privilege tokens; rotate staging credentials independently |
| AI costs double from staging usage | Budget overrun | Use the same OpenAI key with spend alerts; or use a separate key with lower limits for staging |

---

## What staging does not cover in v1

The following items are explicitly out of scope for the initial staging setup.
They may be added as the platform matures.

| Item | Why deferred |
|---|---|
| Automated CI/CD pipeline with staging gate | Manual promotion is sufficient for v1 team size |
| Staging-specific monitoring or alerting | n8n execution logs and Cloudflare analytics are sufficient |
| Load testing in staging | Traffic volume in v1 does not require load testing |
| Staging YouTube uploads | Risk of accidental public video uploads; disabled until v2 |
| Automated staging data refresh from production | Staging generates its own data via workflows |
| Infrastructure-as-code for staging provisioning | Manual setup is faster and simpler for v1 |

---

## Best next step

**Set up the staging D1 database and `staging` branch.**

These two steps unlock the entire staging environment. Once the staging D1 database
exists and the `staging` branch triggers preview deployments, all other staging
components (n8n, delivery channels, secrets) can be configured incrementally.
