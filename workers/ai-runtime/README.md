# Cloudflare AI Runtime

This Worker is the only runtime component that chooses AI models, constructs
prompts, validates model output, performs provider fallback, writes AI
telemetry, and stores generated media assets.

See [`docs/architecture/cloudflare-ai-runtime.md`](../../docs/architecture/cloudflare-ai-runtime.md)
for the architecture, local setup, deployment, rollout, and rollback guide.

## Commands

```bash
cd workers/ai-runtime
npm ci
npm run check
npm run db:local:migrate
npm run dev
npm run lifecycle:staging
npm run deploy:staging
```

`wrangler.jsonc` contains placeholders for account-specific D1, Access, domain,
and R2 values. Replace those values before deployment and set
`ASSET_SIGNING_KEY` as a Worker secret.

The production deploy uses `npm run deploy`; staging uses
`npm run deploy:staging`. Apply the matching lifecycle command once after each
R2 bucket is created. The intended Gateway controls are checked in at
[`config/cloudflare-ai-gateway-policy.json`](../../config/cloudflare-ai-gateway-policy.json);
provision and verify those account-level settings before enabling shadow mode.

For local development, copy `.dev.vars.example` to `.dev.vars.local`, replace
both values, apply the local D1 migrations, and create a local
`McpAiRuntimeAccess` n8n Header Auth credential with `Authorization: Bearer
<LOCAL_DEV_TOKEN>`. Local bearer authentication is enabled only in Wrangler's
`local` environment; staging and production always require a valid Access JWT.
