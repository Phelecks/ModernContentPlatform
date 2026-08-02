# Production Runbook

Use this runbook only after staging passes its functional, quality, latency,
and cost gates. Production is a separate deployment, not a promotion of staging
state: it has its own D1 database, R2 bucket, AI Gateway, Access application,
n8n instance, credentials, and delivery destinations.

## 1. Confirm promotion gates

Before touching production, confirm all of the following:

- Staging D1 migrations and Pages deployment are healthy.
- Worker, workflow-boundary, frontend, and documentation checks pass on the
  release commit.
- The required 100 labeled classifications and 20 Finance/Crypto topic-days
  meet the schema, agreement, attribution, quality, latency, and cost gates in
  [the roadmap](../roadmap.md).
- Image and narration evaluation samples have valid signed-R2 delivery and
  successful render-provider consumption.
- A rollback owner and a tested `AI_RUNTIME=legacy` path are available.

## 2. Provision production Cloudflare resources

Create or verify these production-only resources:

1. `modern-content-platform-db` D1 database.
2. `mcp-ai-assets-production` R2 bucket, with a seven-day lifecycle for
   `temporary/` objects.
3. `mcp-ai-production` AI Gateway using the checked-in Gateway policy.
4. A production Worker custom domain and Access Service Auth application for
   `/v1/tasks/*`.
5. Pages production `DB` binding to the production D1 database.

Replace the production placeholders in `wrangler.toml` and
`workers/ai-runtime/wrangler.jsonc`. Do not copy staging IDs, Access AUDs, or
R2 bucket names into production.

## 3. Deploy database, Worker, and Pages

Apply database migrations only after staging is verified:

```bash
wrangler login
bash scripts/d1-migrate-remote.sh production
bash scripts/d1-verify-schema.sh production
```

For a new production database, seed topics once:

```bash
wrangler d1 execute modern-content-platform-db --remote --file db/seeds/topics.sql
```

Deploy the production Worker:

```bash
cd workers/ai-runtime
npm ci
npm run check
npx wrangler secret put ASSET_SIGNING_KEY
npm run lifecycle:production
npm run deploy
```

Deploy Pages from the reviewed `main` commit using the configured Cloudflare
Pages Git integration. Confirm the site and API use production D1 before
starting schedulers.

## 4. Deploy production n8n

Use a separate production host whenever possible. Create the environment file,
set a pinned n8n version and a unique backed-up encryption key, then start the
stack:

```bash
cp n8n/.env.production.example n8n/.env.production
# Edit n8n/.env.production with production-only values.
docker compose --env-file n8n/.env.production \
  -f n8n/docker-compose.production.yml up -d
bash scripts/n8n-workflow-import.sh production
```

In n8n, create encrypted credentials for production D1, Access, sources,
GitHub, delivery, rendering, and any legacy provider kept for rollback. Set
workflow IDs and these Settings -> Variables:

```text
AI_RUNTIME=shadow
AI_RUNTIME_URL=https://<production-ai-domain>
```

Leave `AI_RUNTIME_FAST`, `AI_RUNTIME_EDITORIAL`, `AI_RUNTIME_IMAGE`, and
`AI_RUNTIME_NARRATION` unset until each group is intentionally promoted.
Point GitHub publishing to `main` and confirm every delivery credential targets
the real production channel only after the safe execution tests complete.

## 5. Promote and operate

Start with manual shadow executions, then activate schedules. Promote task
groups in the defined order—fast text, editorial text, image, narration—through
shadow, 10%, 50%, and 100%. Advance only after the clean-cycle requirements in
the roadmap. Monitor `ai_invocations`, Gateway logs, n8n errors, and module 08/
08b gates.

## Rollback

Set `AI_RUNTIME=legacy` in n8n Settings -> Variables. Also remove group
overrides or set every `AI_RUNTIME_*` override to `legacy`; otherwise an
override can keep a task on the Worker. Keep legacy credentials for 14
successful daily cycles after full cutover. Remove old nodes, credentials, and
legacy telemetry writes only in a separate approved change.

Use [the promotion workflow](../operations/promotion-workflow.md) for the
broader release process and [the AI Runtime guide](../architecture/cloudflare-ai-runtime.md)
for Access, Gateway, and failure details.
