# config/examples

Copy-ready environment variable example files for common v1 setups.

---

## Configuration placement — three separate locations

Setting configuration values in the wrong place is the most common setup
mistake. Each example file is organized into three clearly labeled sections:

| Section | Where to set it | Used by | Example values |
|---|---|---|---|
| **Container env** | Root `.env` file (read by docker-compose) | n8n container at startup; powers credential setup | `OPENAI_API_KEY`, `GOOGLE_API_KEY` |
| **n8n Credentials UI** | n8n → Credentials → New | Workflow nodes that reference the credential by name | `OpenAiApi` (OpenAI API type), `GoogleApiKey` (HTTP Query Auth) |
| **n8n Variables** | n8n Settings → Variables | Workflow expressions (`$vars.VARIABLE_NAME`) | `AI_PROVIDER`, `AI_MODEL_STANDARD`, `DAILY_*_WORKFLOW_ID` |

> **Important:** `OPENAI_API_KEY` and `GOOGLE_API_KEY` are container env vars,
> not n8n workflow variables. Pasting them into n8n Settings → Variables will
> have no effect on the workflows — they are consumed via the n8n credential
> objects (`OpenAiApi`, `GoogleApiKey`), not via `$vars.*`.

---

## Files

| File | Use case |
|---|---|
| `local-openai-newsapi.env` | Local development — OpenAI + NewsAPI. **Recommended starting point.** |
| `local-google-newsapi.env` | Local development — Google media tasks + NewsAPI. Both credentials required. |
| `production-openai-newsapi-shotstack.env` | Production — OpenAI + NewsAPI + Shotstack render. Finance + Crypto v1 recommended. |
| `production-openai-hybrid-sources.env` | Production — OpenAI + hybrid sources (NewsAPI + X). |

---

## Quick start

1. Pick the file that matches your environment.
2. Copy **Section 1** values into your root `.env` file.
3. Start n8n (`docker compose -f n8n/docker-compose.yml --env-file .env up -d`).
4. Open n8n and create the credentials listed in **Section 2**.
5. Go to n8n **Settings → Variables** and add the values from **Section 3**.
6. Import workflow JSON files from `workflows/n8n/` and record the IDs assigned
   by n8n, then fill in the `DAILY_*_WORKFLOW_ID` / `INTRADAY_*_WORKFLOW_ID` variables.

---

## Related documentation

- [`docs/ai-provider-media-modes.md`](../../docs/ai-provider-media-modes.md) — AI provider and media mode reference
- [`docs/source-provider-modes.md`](../../docs/source-provider-modes.md) — source provider configuration
- [`docs/local-development.md`](../../docs/local-development.md) — full local setup guide
- [`.env.example`](../../.env.example) — fully annotated root env reference

---

## Notes

- These files contain placeholder values only. Never commit real API keys.
- `.env` and `.dev.vars` are excluded by `.gitignore`.
- When adding a new supported combination, add a corresponding example file and
  update this README.
