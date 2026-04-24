# Promotion Workflow — Local → Staging → Production

This document defines the step-by-step release path for promoting changes through
the three-environment model: **local → staging → production**.

It is the canonical reference for the promotion process. For staging environment
architecture, secret management, and first-time setup, see
[`docs/staging-environment.md`](../staging-environment.md).

---

## Environment mapping

| Environment | Git branch | Cloudflare Pages | D1 database | n8n instance | Delivery channels |
|---|---|---|---|---|---|
| **Local** | Feature branches | `localhost:8788` / `localhost:5173` | Local SQLite | Docker on developer machine | Developer test channels (optional) |
| **Staging** | `staging` | Preview deployment (`staging.modern-content-platform.pages.dev`) | `modern-content-platform-staging-db` | Separate staging instance | Staging Telegram + Discord channels |
| **Production** | `main` | Production deployment (`modern-content-platform.pages.dev`) | `modern-content-platform-db` | Separate production instance | Production Telegram + Discord channels |

### Branch-to-environment rules

- **Feature branches** → local development only. Never deployed.
- **`staging` branch** → Cloudflare Pages preview deployment + staging D1.
- **`main` branch** → Cloudflare Pages production deployment + production D1.

### Promotion direction

```
Feature branch  ──►  staging  ──►  main
     │                  │            │
  local dev        staging env   production env
```

Changes always flow forward: local → staging → production.
Direct merges from feature branches to `main` are not allowed.

---

## Step 1 — Local development

### Developer workflow

1. Create a feature branch from the latest `staging` branch:
   ```bash
   git checkout staging
   git pull origin staging
   git checkout -b feature/my-change
   ```

2. Develop and test locally:
   - Run the Vue dev server: `cd app && npm run dev`
   - Run the full local stack: `wrangler pages dev app/dist --d1=DB`
   - Run local n8n: `docker compose -f n8n/docker-compose.yml --env-file .env up -d`

3. Run lint and unit tests:
   ```bash
   cd app
   npm run lint
   npm run test:run
   ```

4. If the change includes D1 migrations, test locally:
   ```bash
   wrangler d1 migrations apply modern-content-platform-db --local
   bash scripts/d1-verify-schema.sh local
   ```

### Exit criteria for local

- [ ] Code compiles and builds without errors (`npm run build`)
- [ ] Lint passes (`npm run lint`)
- [ ] Unit tests pass (`npm run test:run`)
- [ ] If D1 migrations: schema verified locally (`scripts/d1-verify-schema.sh local`)
- [ ] Feature works as expected in local testing

---

## Step 2 — Merge to staging

1. Push the feature branch and open a pull request targeting `staging`:
   ```bash
   git push origin feature/my-change
   # Open PR: feature/my-change → staging
   ```

2. CI runs automatically on the pull request:
   - Build, lint, and test must pass (`.github/workflows/ci.yml`).

3. **Review the pull request.** At minimum one team member reviews:
   - Code correctness
   - No staging-specific configuration leaking (hardcoded URLs, IDs)
   - Migration safety (additive schema changes, no destructive DDL)
   - No secrets in committed files

4. Merge the pull request into `staging`.

5. **Cloudflare Pages auto-deploys** the staging preview.

6. If the change includes D1 migrations, apply them to the staging database:
   ```bash
   bash scripts/d1-migrate-remote.sh staging
   ```

7. If the change includes n8n workflow updates, import them into the staging
   n8n instance:
   ```bash
   bash scripts/n8n-workflow-import.sh staging
   ```

---

## Step 3 — Validate in staging

Run the full validation checklist before promoting to production. Use the
smoke check script for automated checks:

```bash
bash scripts/smoke-check.sh staging
```

### Automated smoke checks (via `scripts/smoke-check.sh`)

The smoke check script verifies:

- [ ] D1 schema state — all expected tables, indexes, and migrations present
- [ ] API health — `GET /api/topics` returns a valid topic list
- [ ] Frontend availability — staging URL returns HTTP 200

### Manual validation checklist

After automated checks pass, manually verify:

#### Schema and data

- [ ] All D1 migrations applied to staging without errors
- [ ] No data corruption — run sample queries against staging D1

#### Pages Functions

- [ ] `GET /api/topics` returns seeded topic list
- [ ] `GET /api/day-status/{topicSlug}/{dateKey}` returns correct page state
- [ ] `GET /api/timeline/{topicSlug}/{dateKey}` returns alerts (if any exist)
- [ ] `GET /api/navigation/{topicSlug}/{dateKey}` returns correct links
- [ ] Internal write endpoints accept valid payloads with staging `WRITE_API_KEY`

#### Frontend

- [ ] Homepage loads and renders topic grid
- [ ] Topic page renders alert count and latest date
- [ ] Topic/day page renders timeline, summary, and placeholder states
- [ ] SPA routing works for all defined routes
- [ ] No console errors in browser developer tools

#### Intraday pipeline (if changed)

- [ ] Staging n8n orchestrator runs at least one full intraday cycle
- [ ] Alerts appear in staging D1 `alerts` table
- [ ] Event clusters appear in staging D1 `event_clusters` table
- [ ] `daily_status` row is created/updated
- [ ] Telegram alert delivered to staging channel
- [ ] Discord alert delivered to staging channel

#### Daily editorial pipeline (if changed)

- [ ] Staging n8n daily orchestrator runs at least one full cycle
- [ ] Content files committed to `staging` branch
- [ ] `daily_status` updated to `page_state = 'published'` in staging D1
- [ ] `publish_jobs` row updated to `status = 'success'`
- [ ] Topic/day page renders published content on the staging preview URL

### Exit criteria for staging

- [ ] Automated smoke checks pass (`scripts/smoke-check.sh staging`)
- [ ] All relevant manual validation items pass
- [ ] No regressions observed compared to current production

---

## Step 4 — Promote to production

### Approval gate

Promotion to production requires:

1. **All staging validation checks pass** (Step 3).
2. **A pull request from `staging` → `main`** is created and reviewed.
3. **At least one team member approves** the pull request, confirming:
   - Staging validation was performed
   - No staging-only configuration exists in the diff
   - Migration changes are safe and additive
   - No secrets or environment-specific values in the code

### Promotion steps

1. Open a pull request from `staging` to `main`:
   ```bash
   # Via GitHub UI or CLI
   gh pr create --base main --head staging --title "Release: staging → production"
   ```

2. Review the diff carefully. Watch for:
   - Staging-specific URLs or database IDs
   - Debug logging or test-only code
   - Incomplete features not ready for production

3. **Merge the pull request** after approval.

4. **Cloudflare Pages auto-deploys** to production.

5. If the change includes D1 migrations, apply them to the production database:
   ```bash
   bash scripts/d1-migrate-remote.sh production
   ```

6. If the change includes n8n workflow updates, import them into the production
   n8n instance:
   ```bash
   bash scripts/n8n-workflow-import.sh production
   ```

7. Run post-deployment smoke checks against production:
   ```bash
   bash scripts/smoke-check.sh production
   ```

### Post-deployment verification

After the production deployment completes, verify:

- [ ] Production URL loads correctly
- [ ] `GET /api/topics` returns expected data from production D1
- [ ] SPA routing works (navigate to a topic/day page directly)
- [ ] Existing alerts and content still display correctly
- [ ] Production n8n workflows are running (if updated)
- [ ] Telegram and Discord delivery channels are receiving alerts (if changed)

---

## Rollback procedures

### Frontend and Pages Functions rollback

Cloudflare Pages keeps deployment history. To roll back:

1. Open the Cloudflare dashboard → **Workers & Pages** → **modern-content-platform**.
2. Go to **Deployments**.
3. Find the last known good production deployment.
4. Click **Rollback to this deployment**.

This immediately serves the previous frontend build and Pages Functions version.

**Alternative — Git revert:**

```bash
git checkout main
git revert <bad-commit-sha>
git push origin main
# Cloudflare Pages auto-deploys the reverted state
```

### D1 schema rollback

D1 migrations are **forward-only**. To undo a schema change:

1. Write a new migration that reverses the change (e.g., `DROP TABLE` or `ALTER TABLE`).
2. Apply the rollback migration:
   ```bash
   wrangler d1 execute modern-content-platform-db --remote --file=db/migrations/<rollback>.sql
   ```

**Important:** Test rollback migrations in staging first. Destructive schema changes
(dropping columns, tables) are not recoverable.

### n8n workflow rollback

1. Identify the previous workflow JSON in the `workflows/n8n/` directory via Git history:
   ```bash
   git log --oneline -- workflows/n8n/
   ```
2. Check out the previous version:
   ```bash
   git show <previous-commit>:workflows/n8n/<workflow>.json > /tmp/rollback-workflow.json
   ```
3. Import the previous version into the production n8n instance:
   ```bash
   # Manual import via n8n UI, or via API
   ```

### Content rollback

Editorial content is stored in GitHub. To roll back published content:

1. Revert the content commit on `main`:
   ```bash
   git revert <content-commit-sha>
   git push origin main
   ```
2. Cloudflare Pages auto-deploys, serving the previous content.

---

## Environment-specific secrets and configs

Each environment uses isolated secrets. Never reuse production secrets in staging.

| Secret category | Local source | Staging source | Production source |
|---|---|---|---|
| Cloudflare API token | `.env` | n8n env / Pages settings (staging-scoped) | n8n env / Pages settings (production-scoped) |
| D1 database ID | `.env` | Staging D1 ID | Production D1 ID |
| Write API key | `.dev.vars` | Pages preview secrets | Pages production secrets |
| GitHub token | `.env` | Staging PAT | Production PAT |
| GitHub content branch | n/a | `staging` | `main` |
| Telegram chat ID | `.env` | Staging channel | Production channel |
| Discord webhook URL | `.env` | Staging webhook | Production webhook |
| AI API keys | `.env` | Same or staging-scoped key | Production key |

For the full secret management reference, see
[`docs/staging-environment.md` § Secret management](../staging-environment.md).

---

## Release cadence recommendations

| Release type | Frequency | Description |
|---|---|---|
| **Hotfix** | As needed | Critical bug fix. Follows the same promotion path but with expedited review. |
| **Feature release** | Weekly or as features complete | One or more feature branches merged to staging, validated, then promoted. |
| **Schema migration** | With feature release | Always bundled with the feature that requires the schema change. |
| **n8n workflow update** | With feature release | Imported into staging first, validated, then imported into production. |

### Hotfix process

For urgent production fixes:

1. Create a hotfix branch from `staging` (which should be in sync with `main`).
2. Apply the fix, test locally.
3. Merge to `staging`, validate in staging.
4. Immediately promote `staging` → `main`.
5. Apply any required D1 migrations or n8n updates to production.

---

## Summary: release checklist

Use this checklist for every production release:

```
Pre-release
  □ Feature merged to staging
  □ CI passes on staging branch
  □ D1 migrations applied to staging (if any)
  □ n8n workflows imported to staging (if any)
  □ Automated smoke checks pass (scripts/smoke-check.sh staging)
  □ Manual validation complete

Promotion
  □ PR created: staging → main
  □ PR reviewed and approved
  □ PR merged

Post-deployment
  □ Cloudflare Pages production deployment succeeds
  □ D1 migrations applied to production (if any)
  □ n8n workflows imported to production (if any)
  □ Production smoke checks pass (scripts/smoke-check.sh production)
  □ Delivery channels verified (if changed)
```

---

## Related documentation

- [`docs/staging-environment.md`](../staging-environment.md) — staging architecture, first-time setup, and secret management
- [`docs/operations/cloudflare-pages-deployment.md`](cloudflare-pages-deployment.md) — Cloudflare Pages deployment guide
- [`docs/operations/d1-provisioning.md`](d1-provisioning.md) — D1 database provisioning
- [`docs/operations/n8n-deployment.md`](n8n-deployment.md) — n8n deployment and workflow import
- [`docs/local-development.md`](../local-development.md) — local development environment setup
- [`scripts/smoke-check.sh`](../../scripts/smoke-check.sh) — automated pre-promotion smoke checks
- [`scripts/d1-migrate-remote.sh`](../../scripts/d1-migrate-remote.sh) — D1 remote migration script
- [`scripts/d1-verify-schema.sh`](../../scripts/d1-verify-schema.sh) — D1 schema verification script
