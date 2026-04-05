# ModernContentPlatform
AI-powered multi-topic intelligence and publishing platform with live alerts, daily summaries, video workflows, and automated delivery using n8n, Vue, Cloudflare, and GitHub.

## Repository Structure

```text
.
├── app/              # Vue frontend
├── functions/        # Cloudflare Pages Functions thin read APIs
├── content/          # GitHub-backed editorial content
├── db/               # D1 schema, migrations, queries, seeds
├── workflows/        # n8n workflow assets and workflow contracts
├── schemas/          # Shared JSON schemas for content, APIs, AI, workflows
├── docs/             # Architecture, data model, operations, runbooks
├── scripts/          # Utility scripts for local and CI tasks
└── .github/          # Copilot prompts, skills, and GitHub automation
```

## Platform Boundaries

- `app` owns frontend rendering and route composition.
- `functions` owns thin read APIs over D1.
- `content` owns final published editorial artifacts stored in GitHub.
- `db` owns D1 schema design and migration history.
- `workflows` owns n8n orchestration assets.
- `schemas` owns shared structured contracts between systems.
- `docs` owns architecture and operational documentation.
