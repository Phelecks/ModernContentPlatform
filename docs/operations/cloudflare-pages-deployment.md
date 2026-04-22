# Cloudflare Pages Deployment Guide

This document covers connecting Cloudflare Pages to the GitHub repository,
configuring build settings, and verifying preview and production deployments.

---

## Overview

The platform uses Cloudflare Pages for hosting. Pages provides:

- **Production deployments** — triggered by pushes to the `main` branch.
- **Preview deployments** — triggered by pull requests against `main`.
- **Pages Functions** — server-side API endpoints deployed alongside the frontend.
- **D1 bindings** — database access from Pages Functions at runtime.

A single Pages project handles both production and preview environments. No
additional projects are needed for staging or preview branches.

---

## Prerequisites

| Requirement | Details |
|---|---|
| **Cloudflare account** | Pages and D1 enabled |
| **GitHub repository** | `Phelecks/ModernContentPlatform` (or your fork) |
| **D1 database provisioned** | See `docs/operations/d1-provisioning.md` |
| **Node.js** | 20 LTS or later (matches `app/package.json` engine requirement) |

---

## 1. Create the Pages project

### Via Cloudflare dashboard

1. Log in to the [Cloudflare dashboard](https://dash.cloudflare.com).
2. Navigate to **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Select your GitHub account and the `ModernContentPlatform` repository.
4. Authorize Cloudflare to access the repository (if not already authorized).
5. Configure the build settings as described in section 2 below.
6. Click **Save and Deploy** to trigger the first production deployment.

### Via Wrangler CLI (alternative)

```bash
wrangler pages project create modern-content-platform \
  --production-branch main
```

Then connect the GitHub repository in the dashboard under
**Workers & Pages → modern-content-platform → Settings → Builds & Deployments → Source**.

---

## 2. Build configuration

Configure the following settings in the Pages project under
**Settings → Builds & Deployments**:

| Setting | Value |
|---|---|
| **Production branch** | `main` |
| **Build command** | `cd app && npm ci --legacy-peer-deps && npm run build` |
| **Build output directory** | `app/dist` |
| **Root directory** | `/` (repository root) |

### Environment variables (build-time)

Set these in **Settings → Environment variables** if needed:

| Variable | Value | Environment |
|---|---|---|
| `NODE_VERSION` | `20` | Production + Preview |

> **Note:** Cloudflare Pages auto-detects Node.js from `engines` in
> `app/package.json`, but setting `NODE_VERSION` explicitly ensures
> consistent behavior across build system updates.

### How the build works

1. Pages clones the repository at the commit that triggered the build.
2. The build command runs from the repository root:
   - `cd app` — enters the Vue frontend directory.
   - `npm ci --legacy-peer-deps` — installs pinned dependencies from `package-lock.json`.
   - `npm run build` — runs `vite build`, producing static assets in `app/dist/`.
3. The Vite build plugin `copy-content-dir` copies `content/` into `app/dist/content/`
   so that GitHub-published editorial content is served as static files.
4. Pages deploys the contents of `app/dist/` as the static site.
5. Pages detects the `functions/` directory at the repository root and deploys
   all Pages Functions alongside the static assets.

---

## 3. Pages Functions

Pages Functions are defined in the `functions/` directory at the repository root.
Cloudflare Pages automatically discovers and deploys them based on the file-system
routing convention.

### Deployed endpoints

| Endpoint | File | Method |
|---|---|---|
| `/api/topics` | `functions/api/topics/index.js` | GET |
| `/api/day-status/:topicSlug/:dateKey` | `functions/api/day-status/[topicSlug]/[dateKey].js` | GET |
| `/api/timeline/:topicSlug/:dateKey` | `functions/api/timeline/[topicSlug]/[dateKey].js` | GET |
| `/api/navigation/:topicSlug/:dateKey` | `functions/api/navigation/[topicSlug]/[dateKey].js` | GET |
| `/api/sources` | `functions/api/sources/index.js` | GET |
| `/api/internal/alerts` | `functions/api/internal/alerts.js` | POST |
| `/api/internal/daily-status` | `functions/api/internal/daily-status.js` | POST |
| `/api/internal/publish-jobs` | `functions/api/internal/publish-jobs.js` | POST |
| `/api/internal/workflow-logs` | `functions/api/internal/workflow-logs.js` | POST |
| `/api/internal/sources` | `functions/api/internal/sources.js` | POST |
| `/api/internal/social-publish-log` | `functions/api/internal/social-publish-log.js` | POST |
| `/api/internal/meta-social-publish-log` | `functions/api/internal/meta-social-publish-log.js` | POST |
| `/api/internal/openai-usage-log` | `functions/api/internal/openai-usage-log.js` | POST |

### D1 binding

Pages Functions access D1 via the `DB` binding configured in `wrangler.toml`. For
deployed Pages, the D1 binding must also be set in the Cloudflare dashboard:

1. Go to **Workers & Pages → modern-content-platform → Settings → Functions**.
2. Under **D1 database bindings**, add:
   - **Variable name:** `DB`
   - **D1 database:** select `modern-content-platform-db`
3. For preview deployments that should use a staging database, set a separate
   binding under the **Preview** environment pointing to
   `modern-content-platform-staging-db`.

### Secrets

Pages Functions that require runtime secrets (e.g. `WRITE_API_KEY` for internal
write endpoints) must have those secrets configured in the dashboard:

1. Go to **Workers & Pages → modern-content-platform → Settings → Environment variables**.
2. Add the secret under **Production** and/or **Preview** as needed.
3. Mark the value as **Encrypted** for sensitive keys.

| Secret | Required by | Environment |
|---|---|---|
| `WRITE_API_KEY` | `POST /api/internal/*` endpoints | Production + Preview |

---

## 4. SPA routing

The Vue frontend uses client-side routing via `vue-router`. All unmatched
requests must fall back to `index.html` so that the Vue router can handle
them.

This is configured via the `_redirects` file at `app/public/_redirects`:

```
/* /index.html 200
```

This file is copied into `app/dist/` during the build and tells Cloudflare
Pages to serve `index.html` with a 200 status for any path that does not
match a static file or Pages Function.

### Route resolution order

Cloudflare Pages resolves requests in this order:

1. **Static files** — exact match in `app/dist/` (e.g. `/assets/index-xxx.js`).
2. **Pages Functions** — matching route in `functions/` (e.g. `/api/topics`).
3. **`_redirects` rules** — the `/* /index.html 200` catch-all serves the SPA.

This means:
- API calls to `/api/*` are handled by Pages Functions, not the SPA.
- Direct navigation to `/topics/crypto/2025-01-15` serves `index.html`,
  and `vue-router` renders the correct page component.
- Static assets (JS, CSS, images) are served directly.

---

## 5. Preview deployments

### Trigger

Every pull request opened against the `main` branch triggers a preview
deployment. Each PR gets a unique preview URL:

```
https://<commit-hash>.modern-content-platform.pages.dev
```

A deployment status is posted as a comment on the pull request with a link
to the preview URL.

### What is deployed

Preview deployments include:
- The Vue frontend built from the PR branch.
- Pages Functions from the PR branch.
- The `content/` directory as it exists on the PR branch.

### D1 binding for previews

By default, preview deployments use the same D1 binding as production.
To isolate preview environments:

1. Create a staging D1 database (see `docs/operations/d1-provisioning.md`).
2. In **Settings → Functions → D1 database bindings**, set the **Preview**
   environment to use the staging database.

### Verification steps

After a preview deployment completes:

1. Open the preview URL from the PR comment or the Cloudflare dashboard.
2. Verify the homepage loads and renders the topic grid.
3. Navigate to a topic page (e.g. `/topics/crypto`) — confirm SPA routing works.
4. Navigate to a topic/day page (e.g. `/topics/crypto/2025-01-15`) — confirm
   the page renders (placeholder state if no data exists).
5. Test an API endpoint:
   ```bash
   curl https://<preview-url>/api/topics
   ```
6. Verify the response returns JSON with the seeded topic list.
7. Confirm the 404 page renders for an unknown route (e.g. `/nonexistent`).

---

## 6. Production deployments

### Trigger

Every push to the `main` branch triggers a production deployment. This
includes merged pull requests.

### Production URL

The production site is available at:

```
https://modern-content-platform.pages.dev
```

A custom domain can be configured in **Settings → Custom domains**.

### Verification steps

After a production deployment completes:

1. Open the production URL.
2. Verify the homepage loads and displays topics from D1.
3. Test SPA routing by navigating to a deep link:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" https://modern-content-platform.pages.dev/topics/crypto/2025-01-15
   ```
   Expected: `200` (SPA fallback serves `index.html`).
4. Test a Pages Function endpoint:
   ```bash
   curl https://modern-content-platform.pages.dev/api/topics
   ```
   Expected: JSON array of topics.
5. Test a dynamic Pages Function:
   ```bash
   curl https://modern-content-platform.pages.dev/api/day-status/crypto/2025-01-15
   ```
   Expected: JSON object with `page_state` field.
6. Verify static content is served:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" https://modern-content-platform.pages.dev/content/topics/crypto/2025-01-15/summary.json
   ```
   Expected: `200` if content exists, `404` if not yet published.

---

## 7. Deploy hooks (optional)

A deploy hook allows external systems (e.g. n8n daily workflow) to trigger
a production redeploy after new content is published to GitHub.

### Create a deploy hook

1. Go to **Workers & Pages → modern-content-platform → Settings → Builds & Deployments**.
2. Under **Deploy hooks**, click **Add deploy hook**.
3. Name it (e.g. `n8n-daily-publish`) and select the `main` branch.
4. Copy the generated webhook URL.

### Use in n8n

Set the n8n variable:

```
CLOUDFLARE_PAGES_DEPLOY_HOOK=https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/<hook-id>
```

The daily editorial workflow (module 10) calls this hook after publishing
content files to GitHub, triggering a redeploy that picks up the new
content.

---

## 8. Build caching

Cloudflare Pages caches `node_modules` between builds automatically. The
build uses `npm ci --legacy-peer-deps` which installs from the lockfile,
ensuring reproducible builds even when the cache is used.

If a build fails due to stale cache, trigger a retry from the Cloudflare
dashboard by clicking **Retry deployment** on the failed build, or push
an empty commit:

```bash
git commit --allow-empty -m "retry pages build"
git push
```

---

## 9. Custom domains

To serve the site from a custom domain:

1. Go to **Workers & Pages → modern-content-platform → Custom domains**.
2. Click **Set up a custom domain**.
3. Enter your domain (e.g. `www.example.com`).
4. Follow the DNS configuration instructions (CNAME or proxied A record).
5. Cloudflare automatically provisions an SSL certificate.

---

## 10. Troubleshooting

### Build fails with "npm ERR! could not resolve dependency"

The `--legacy-peer-deps` flag in the build command handles peer dependency
conflicts. If the flag is missing from the build command, update it in
**Settings → Builds & Deployments → Build command**.

### Pages Functions return 404

- Confirm the `functions/` directory is at the repository root, not inside `app/`.
- Confirm the function file uses the correct export (`onRequestGet`, `onRequestPost`).
- Check the deployment log in the Cloudflare dashboard for function compilation errors.

### SPA routes return 404 instead of index.html

- Confirm `app/public/_redirects` exists and contains `/* /index.html 200`.
- Confirm `_redirects` appears in `app/dist/` after building.
- Note: `_redirects` rules only apply to paths not matched by static files or Functions.

### D1 binding not available in Pages Functions

- Confirm the D1 binding is set in **Settings → Functions → D1 database bindings**.
- The variable name must be `DB` (matching the binding name in `wrangler.toml` and function code).
- After adding a binding, a new deployment is required for the change to take effect.

### Preview deployment uses production D1 data

- By default, preview and production share the same D1 binding.
- To isolate, set a separate D1 binding under the **Preview** environment in the dashboard.
- See `docs/staging-environment.md` for the full staging strategy.

### Deployment does not pick up new content files

- Content files in `content/` are copied into `app/dist/content/` at build time.
- A new deployment is required after pushing content changes to GitHub.
- Use a deploy hook (section 7) or push any commit to `main` to trigger a redeploy.

---

## Quick reference

| Item | Value |
|---|---|
| **Pages project name** | `modern-content-platform` |
| **Production branch** | `main` |
| **Build command** | `cd app && npm ci --legacy-peer-deps && npm run build` |
| **Build output directory** | `app/dist` |
| **Root directory** | `/` (repository root) |
| **Node.js version** | `20` |
| **SPA fallback** | `app/public/_redirects` → `/* /index.html 200` |
| **Functions directory** | `functions/` (repository root) |
| **D1 binding name** | `DB` |
| **D1 database (production)** | `modern-content-platform-db` |
| **D1 database (staging)** | `modern-content-platform-staging-db` |
| **wrangler.toml** | Deployment and D1 binding configuration |

---

## Related documentation

- [`docs/operations/d1-provisioning.md`](d1-provisioning.md) — D1 database setup and migration
- [`docs/staging-environment.md`](../staging-environment.md) — staging environment strategy
- [`docs/local-development.md`](../local-development.md) — local development with Wrangler
- [`docs/roadmap.md`](../roadmap.md) — phase-by-phase deployment roadmap
