# config/examples

Copy-ready environment variable example files for common v1 setups.

Each file documents the variables needed for a specific environment and
provider combination. Copy the relevant blocks into `.dev.vars` (for local
Wrangler / Pages Functions secrets) or into n8n **Settings → Variables** (for
workflow execution).

---

## Files

| File | Use case |
|---|---|
| `local-openai-newsapi.env` | Local development — OpenAI + NewsAPI. **Recommended starting point.** |
| `local-google-newsapi.env` | Local development — Google + NewsAPI. Use to test the Google provider path. |
| `production-openai-newsapi-shotstack.env` | Production — OpenAI + NewsAPI + Shotstack render. Finance + Crypto v1 recommended setup. |
| `production-openai-hybrid-sources.env` | Production — OpenAI + hybrid sources (NewsAPI + X). Use when X API credentials are available. |

---

## Quick start

1. Pick the file that matches your environment.
2. Copy the variable block(s) you need.
3. Fill in your actual keys and tokens.
4. Paste into `.dev.vars` or n8n **Settings → Variables**.

For a full explanation of every variable, see:
- [`docs/ai-provider-media-modes.md`](../../docs/ai-provider-media-modes.md) — AI provider and media mode reference
- [`docs/source-provider-modes.md`](../../docs/source-provider-modes.md) — source provider configuration
- [`.env.example`](../../.env.example) — fully annotated root env reference

---

## Notes

- These files contain placeholder values only. Never commit real API keys.
- `.env` and `.dev.vars` are excluded by `.gitignore`.
- Variables in these files overlap with `.env.example`. The files here focus on
  minimal, environment-specific subsets for faster onboarding.
- When adding a new supported combination, add a corresponding example file and
  update this README.
