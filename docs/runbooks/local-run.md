# Local Runbook

Use this guide to run the website, Pages Functions, local D1 database, optional
AI Worker, and local n8n safely on one development machine. Nothing in this
guide deploys to Cloudflare or sends content to production.

## What works locally

- The Vue website, static sample content, Pages Functions, and D1 all run
  locally without a Cloudflare account.
- The AI Worker health endpoint and request/authentication path run locally.
- Actual Workers AI inference requires a Cloudflare account with Workers AI
  enabled because the local binding sends model work to Cloudflare.
- Local Worker image/narration URLs are only reachable on your machine. Use
  staging—not a local Worker—to test an external render provider consuming R2
  assets.

## 1. Install prerequisites

- Node.js 20 or newer
- Docker Desktop or Docker Engine with Compose v2, only if using n8n
- Wrangler CLI: `npm install -g wrangler`

From the repository root, install the two Node projects:

```bash
npm ci --prefix app --legacy-peer-deps
npm ci --prefix workers/ai-runtime
```

Confirm the tools are available:

```bash
node --version
wrangler --version
docker compose version
```

## 2. Create a local D1 database

The reset command deletes only local Wrangler D1 state, then applies all
migrations and sample data. Do not run it when you need to keep local test
data.

```bash
bash scripts/local-reset.sh
bash scripts/d1-verify-schema.sh local
```

## 3. Run the website and Pages Functions

Build the site once:

```bash
npm run build --prefix app
```

In terminal 1, start Pages Functions and the local D1 binding:

```bash
wrangler pages dev app/dist --d1 DB=YOUR_PRODUCTION_D1_DATABASE_ID --port 8788
```

Use the exact `database_id` from the root `wrangler.toml` if you have replaced
the checked-in placeholder. This makes Pages use the migrated local D1 state.

In terminal 2, start Vite hot reload:

```bash
npm run dev --prefix app
```

Open `http://localhost:5173`. Vite proxies `/api/*` to Pages on port 8788.
Confirm the local API before continuing:

```bash
curl http://localhost:8788/api/topics
```

For a production-like single-server check, stop Vite and open
`http://localhost:8788` instead.

## 4. Optional: run the AI Worker locally

Copy the ignored local-secret template and use random development-only values:

```bash
cp workers/ai-runtime/.dev.vars.example workers/ai-runtime/.dev.vars.local
npm run db:local:migrate --prefix workers/ai-runtime
npm run dev --prefix workers/ai-runtime
```

The Worker listens on the URL Wrangler prints, normally `http://localhost:8787`.
Its unauthenticated health check should respond:

```bash
curl http://localhost:8787/health
```

For a local task call, send `Authorization: Bearer <LOCAL_DEV_TOKEN>` using
the value in `.dev.vars.local`. Model calls need your local Wrangler login and
Workers AI entitlement. Keep `AI_RUNTIME=legacy` if you only want to use the
existing provider nodes.

## 5. Optional: run n8n locally

Create a local environment file if it does not exist, then start n8n:

```bash
cp .env.example .env
docker compose -f n8n/docker-compose.yml --env-file .env up -d
bash scripts/n8n-workflow-import.sh local
```

Open `http://localhost:5678`, create the local owner account, and set the
workflow IDs plus runtime variables in **Settings -> Variables**.

For local Worker tests, create the `McpAiRuntimeAccess` HTTP Header Auth
credential with `Authorization: Bearer <LOCAL_DEV_TOKEN>`, then set:

```text
AI_RUNTIME=cloudflare
AI_RUNTIME_URL=http://host.docker.internal:8787
```

The local Compose file maps `host.docker.internal` to the host gateway on
Linux and is already compatible with Docker Desktop. For a safe comparison,
use `AI_RUNTIME=shadow` only when legacy provider credentials are also present;
the legacy result remains the one eligible for publishing.

Do not activate delivery or publishing workflows locally unless all target
credentials point to disposable test destinations.

## 6. Stop services

```bash
docker compose -f n8n/docker-compose.yml --env-file .env down
```

Stop Vite, Pages, and the Worker with `Ctrl+C` in their terminals. The local
D1 state and n8n state remain for the next run.

See [the canonical AI Runtime guide](../architecture/cloudflare-ai-runtime.md)
for the task API and [the detailed local guide](../local-development.md) for
editor and troubleshooting notes.
