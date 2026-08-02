# Staging Runbook

Staging is an isolated deployment used to validate migrations, n8n workflows,
Cloudflare AI routing, and delivery behavior before production. Never reuse a
production D1 database, R2 bucket, Access application, n8n data volume, or
delivery channel here.

## 1. Prerequisites and environment values

Before deploying, collect the staging D1 ID, Workers AI-enabled Cloudflare
account, Worker custom domain, Cloudflare Access team domain and application
AUD, R2 bucket name, n8n hostname, and staging-only delivery/GitHub tokens.
Do not put secrets in Git or workflow JSON.

Replace only the placeholders in these configuration files with staging values:

- `wrangler.toml` -> staging D1 ID
- `workers/ai-runtime/wrangler.jsonc` -> staging D1 ID, bucket, Access values,
  Gateway ID, and custom domain

Create these Cloudflare resources first:

1. `modern-content-platform-staging-db` D1 database.
2. `mcp-ai-assets-staging` R2 bucket with a seven-day lifecycle for the
   `temporary/` prefix.
3. `mcp-ai-staging` AI Gateway, configured from
   [`config/cloudflare-ai-gateway-policy.json`](../../config/cloudflare-ai-gateway-policy.json).
4. A staging Access application and Service Auth policy for
   `https://<staging-ai-domain>/v1/tasks/*`.

Keep `/v1/assets/*` outside Access: the Worker protects those short-lived URLs
with an HMAC signature so render providers can download media without the n8n
service token.

## 2. Deploy D1 and Pages

Authenticate Wrangler, apply staging migrations, then verify them:

```bash
wrangler login
bash scripts/d1-migrate-remote.sh staging
bash scripts/d1-verify-schema.sh staging
```

Seed topics once for a fresh staging database:

```bash
wrangler d1 execute modern-content-platform-staging-db --env staging --remote \
  --file db/seeds/topics.sql
```

Configure the Cloudflare Pages preview environment's `DB` binding to point to
the staging D1 database. Push the `staging` branch or use the configured Pages
deployment flow, then record the preview URL. Do not let a preview deployment
use production D1.

## 3. Deploy the staging AI Worker

Set the Worker signing key outside source control, configure the R2 lifecycle,
and deploy:

```bash
cd workers/ai-runtime
npm ci
npm run check
npx wrangler secret put ASSET_SIGNING_KEY --env staging
npm run lifecycle:staging
npm run deploy:staging
```

Attach the configured custom domain to the Worker and confirm the Access policy
protects `/v1/tasks/*`. In the Access application, configure service-token
authentication through the single `Authorization` header.

## 4. Deploy isolated staging n8n

Create a staging n8n environment file from the template. Use a separate
hostname, PostgreSQL volume, encryption key, D1 token/database ID, GitHub
content branch (`staging`), and non-production delivery channels. If staging
and production share a host, set a different `N8N_PORT`, such as `5679`.

```bash
cp n8n/.env.production.example n8n/.env.staging
# Edit n8n/.env.staging with staging-only values.
docker compose --env-file n8n/.env.staging \
  -f n8n/docker-compose.production.yml -p n8n-staging up -d
bash scripts/n8n-workflow-import.sh staging
```

In the n8n editor:

1. Create the staging `McpAiRuntimeAccess` Header Auth credential. Its only
   header is `Authorization` with the Service Token JSON required by Access.
2. Create staging-only D1, GitHub, source, and delivery credentials.
3. Set all workflow IDs and `AI_RUNTIME_URL=https://<staging-ai-domain>` in
   **Settings -> Variables**.
4. Set `AI_RUNTIME=shadow`. Leave group overrides unset initially.
5. Keep production delivery destinations and production GitHub branch out of
   the staging credentials.

## 5. Verify before promotion

Run repository checks before or alongside the deployment:

```bash
npm run check --prefix workers/ai-runtime
npm test --prefix app -- --run
npm run build --prefix app
node scripts/check-ai-runtime-boundary.mjs
node scripts/check-doc-links.mjs
bash scripts/smoke-check.sh staging
```

Run the AI workflows in `shadow` and compare their retained `_ai_shadow` output
with the legacy result. Follow the labeled evaluation and staged-promotion gates
in [the roadmap](../roadmap.md). Do not make a task authoritative merely because
a single manual workflow execution succeeds.

For architecture, failure behavior, and rollback, use the
[Cloudflare AI Runtime guide](../architecture/cloudflare-ai-runtime.md).
