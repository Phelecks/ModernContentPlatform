# n8n — Local Development Environment

This directory contains the Docker Compose setup for running n8n locally during development.

> **This setup is for local development only.** It uses SQLite storage, no TLS, and no
> production-grade credential hardening. Do not expose this instance to the internet.

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| **Docker** | 24 or later | https://docs.docker.com/get-docker/ |
| **Docker Compose** | v2 (bundled with Docker Desktop) | — |

---

## Quick start

### 1. Copy and fill in environment variables

From the repository root, copy the example file and add your local values:

```bash
cp .env.example .env
```

Only the variables you actually need for the workflows you are developing need to be filled in.
All variables default to empty if omitted — n8n will still start without them.

### 2. Start n8n

```bash
# From the repository root
docker compose -f n8n/docker-compose.yml --env-file .env up -d

# Or from inside this directory
cd n8n
docker compose --env-file ../.env up -d
```

n8n is available at **http://localhost:5678**.

On first launch, n8n will prompt you to create an owner account. Use any local credentials —
these are stored only in `local_data/` and are never committed to version control.

### 3. Stop n8n

```bash
docker compose -f n8n/docker-compose.yml down
```

---

## Local state

n8n workflow definitions, credentials, and execution history are stored in:

```
n8n/local_data/
```

This directory is created automatically on first run and is excluded from version control
by `.gitignore`. State persists across Docker restarts as long as `local_data/` exists.

### Reset local state

To wipe all local n8n data and start fresh:

```bash
docker compose -f n8n/docker-compose.yml down
rm -rf n8n/local_data
docker compose -f n8n/docker-compose.yml --env-file .env up -d
```

---

## Environment variables

Environment variables are loaded from the root `.env` file at startup. Use
`.env.example` as the starting point for local configuration. The table below documents
the variables passed to n8n at runtime via `docker-compose.yml`.

Variables passed to n8n at runtime (via `docker-compose.yml`):

| Variable | Scope | Purpose |
|---|---|---|
| `GENERIC_TIMEZONE` | n8n | Timezone for cron schedules (default: `UTC`) |
| `OPENAI_API_KEY` | AI | OpenAI API key for AI workflow steps |
| `TELEGRAM_BOT_TOKEN` | Delivery | Telegram bot token for alert delivery |
| `TELEGRAM_CHAT_ID` | Delivery | Telegram chat/channel ID |
| `DISCORD_WEBHOOK_URL` | Delivery | Discord webhook URL for alert delivery |
| `GITHUB_TOKEN` | Publishing | GitHub PAT for pushing daily editorial content |
| `GITHUB_REPO_OWNER` | Publishing | GitHub org or username |
| `GITHUB_REPO_NAME` | Publishing | Repository name (default: `ModernContentPlatform`) |
| `NEWS_API_KEY` | Ingestion | API key for news source ingestion |
| `CLOUDFLARE_ACCOUNT_ID` | D1 | Cloudflare account ID for D1 REST API calls |
| `CLOUDFLARE_API_TOKEN` | D1 | Cloudflare API token for D1 REST API calls |
| `CLOUDFLARE_D1_DATABASE_ID` | D1 | D1 database ID for HTTP Request nodes |

Variables with no value set default to empty. n8n starts normally — credentials that
require a value will produce errors only when the relevant workflow step executes.

---

## Developing workflows

1. Open **http://localhost:5678** in your browser.
2. Create or import workflow JSON files from `workflows/n8n/`.
3. Use the **Execute Workflow** button to test individual flows.
4. Credential values configured in the n8n UI are stored encrypted in `local_data/`.
5. Exported workflow JSON (without credentials) can be committed to `workflows/n8n/`.

Workflow contracts and input/output schemas are documented in `workflows/contracts/`.

---

## VS Code tip

Install the **Docker** extension (`ms-azuretools.vscode-docker`) to manage the container
and view logs directly from VS Code without leaving the editor.
