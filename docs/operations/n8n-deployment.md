# n8n Deployment and Operations Guide

This document covers deploying a production or staging n8n instance, importing
platform workflows, configuring credentials and runtime variables, and
maintaining the instance over time.

> For **local development**, see [`n8n/README.md`](../../n8n/README.md).

---

## Overview

The platform uses a self-hosted n8n instance to orchestrate:

- **Intraday alert flow** — source ingestion, AI classification, D1 persistence,
  and Telegram/Discord delivery every 15 minutes.
- **Daily editorial flow** — summary generation, article writing, video script
  creation, GitHub publishing, and D1 state updates at 23:30 UTC.
- **Shared modules** — failure notifier for error alerting across all workflows.

The production stack runs n8n with a PostgreSQL backend inside Docker Compose.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Host / VPS                                         │
│                                                     │
│  ┌──────────────────┐   ┌────────────────────────┐  │
│  │  Reverse Proxy   │   │  docker compose         │  │
│  │  (Nginx/Caddy)   │──▶│                         │  │
│  │  TLS termination │   │  ┌─────────┐            │  │
│  └──────────────────┘   │  │  n8n    │            │  │
│                         │  │  :5678  │            │  │
│                         │  └────┬────┘            │  │
│                         │       │                  │  │
│                         │  ┌────▼──────────────┐  │  │
│                         │  │  PostgreSQL 16    │  │  │
│                         │  │  (n8n backend)    │  │  │
│                         │  └──────────────────┘  │  │
│                         └────────────────────────┘  │
└─────────────────────────────────────────────────────┘
         │                         │
         ▼                         ▼
   Cloudflare D1             External APIs
   (HTTP REST)         (OpenAI, Telegram, Discord,
                        GitHub, NewsAPI, X API)
```

---

## Prerequisites

| Requirement | Details |
|---|---|
| **Server** | Linux VPS or dedicated server with Docker installed |
| **Docker** | 24 or later |
| **Docker Compose** | v2 (bundled with Docker Engine) |
| **Reverse proxy** | Nginx, Caddy, or Cloudflare Tunnel for TLS termination |
| **Domain** | DNS record pointing to the server (e.g. `n8n.example.com`) |
| **Repository clone** | Access to the `workflows/n8n/` directory |

---

## 1. Server preparation

### Install Docker

```bash
# Ubuntu / Debian
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in for group changes to take effect
```

### Clone the repository

```bash
git clone https://github.com/Phelecks/ModernContentPlatform.git
cd ModernContentPlatform
```

---

## 2. Configure environment variables

Copy the production environment template:

```bash
cp n8n/.env.production.example n8n/.env.production
```

Edit `n8n/.env.production` and fill in all required values:

### Required variables

| Variable | How to generate | Notes |
|---|---|---|
| `N8N_HOST` | Your domain | e.g. `n8n.example.com` |
| `WEBHOOK_URL` | `https://<N8N_HOST>/` | Must include trailing slash |
| `N8N_EDITOR_BASE_URL` | `https://<N8N_HOST>/` | Must include trailing slash |
| `N8N_ENCRYPTION_KEY` | `openssl rand -hex 32` | **Back up securely** — losing this makes all stored credentials unrecoverable |
| `POSTGRES_PASSWORD` | `openssl rand -hex 24` | Database password for the n8n backend |

### API keys (fill in as needed)

| Variable | Required for |
|---|---|
| `OPENAI_API_KEY` | AI classification, summary, video script generation |
| `GOOGLE_API_KEY` | Google AI provider (if `AI_PROVIDER=google`) |
| `TELEGRAM_BOT_TOKEN` | Alert delivery to Telegram |
| `TELEGRAM_CHAT_ID` | Target Telegram chat or channel |
| `DISCORD_WEBHOOK_URL` | Alert delivery to Discord |
| `GITHUB_TOKEN` | Publishing daily content to GitHub |
| `NEWS_API_KEY` | NewsAPI source ingestion |
| `CLOUDFLARE_ACCOUNT_ID` | D1 REST API access |
| `CLOUDFLARE_API_TOKEN` | D1 REST API access (needs D1:Edit permission) |
| `CLOUDFLARE_D1_DATABASE_ID` | Target D1 database |

> **Security:** Never commit `n8n/.env.production` to version control.
> The `.gitignore` already excludes `.env.*` files (except `.env.example`).

---

## 3. Start the n8n stack

```bash
docker compose -f n8n/docker-compose.production.yml \
  --env-file n8n/.env.production up -d
```

Verify both containers are running:

```bash
docker compose -f n8n/docker-compose.production.yml ps
```

Expected output:

```
NAME       SERVICE    STATUS
n8n        n8n        Up (healthy)
postgres   postgres   Up (healthy)
```

Check the n8n logs:

```bash
docker compose -f n8n/docker-compose.production.yml logs -f n8n
```

On first launch, n8n prompts you to create an owner account at `https://<N8N_HOST>/`.

---

## 4. Set up a reverse proxy

n8n should be placed behind a reverse proxy for TLS termination. Below are
examples for the two most common options.

### Option A: Caddy (recommended — automatic HTTPS)

```
# /etc/caddy/Caddyfile
n8n.example.com {
    reverse_proxy localhost:5678
}
```

```bash
sudo systemctl reload caddy
```

### Option B: Nginx + Let's Encrypt

```nginx
# /etc/nginx/sites-available/n8n
server {
    listen 80;
    server_name n8n.example.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name n8n.example.com;

    ssl_certificate     /etc/letsencrypt/live/n8n.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/n8n.example.com/privkey.pem;

    location / {
        proxy_pass http://localhost:5678;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        chunked_transfer_encoding off;
        proxy_buffering off;
        proxy_cache off;
    }
}
```

```bash
sudo certbot --nginx -d n8n.example.com
sudo systemctl reload nginx
```

### Option C: Cloudflare Tunnel

If the server is behind a firewall and does not have a public IP, use a
Cloudflare Tunnel:

```bash
cloudflared tunnel create n8n-tunnel
cloudflared tunnel route dns n8n-tunnel n8n.example.com
cloudflared tunnel --config /etc/cloudflared/config.yml run n8n-tunnel
```

With a `config.yml`:

```yaml
tunnel: <tunnel-id>
credentials-file: /etc/cloudflared/<tunnel-id>.json
ingress:
  - hostname: n8n.example.com
    service: http://localhost:5678
  - service: http_status:404
```

---

## 5. Import workflows

### Using the import script

The repository includes a helper script that imports all workflow JSON files
in the correct order:

```bash
bash scripts/n8n-workflow-import.sh production
```

The script imports workflows in this order:

1. **Shared** — `failure_notifier.json`
2. **Intraday modules** — `00_local_alert_smoke_test.json` through `11_social_story_delivery.json`
3. **Intraday orchestrator** — `orchestrator.json`
4. **Daily modules** — all numeric-prefixed workflow files in `workflows/n8n/daily/`, including `01_aggregate_alerts.json` through `14_publish_social_channels.json` as well as `06_full_video_generation.json` and the `06b`/`06c`/`06d` media pipeline variants
5. **Daily orchestrator** — `orchestrator.json`

### Manual import (alternative)

If the script does not work in your environment, import workflows manually
through the n8n editor:

1. Open `https://<N8N_HOST>/` and log in.
2. Go to **Workflows** → **Import from File**.
3. Import `workflows/n8n/shared/failure_notifier.json` first.
4. Import each file from `workflows/n8n/intraday/` in numeric order.
5. Import each file from `workflows/n8n/daily/` in numeric order.
6. Import the orchestrators last (`orchestrator.json` in each directory).

### Re-importing (updating workflows)

The `n8n import:workflow` command creates new workflows or updates existing
ones if the workflow ID in the JSON matches an existing workflow. To update
workflows after pulling new changes from the repository:

```bash
git pull origin main
bash scripts/n8n-workflow-import.sh production
```

---

## 6. Configure n8n credentials

After the first login, create the following credentials in the n8n editor
under **Settings → Credentials**:

| Credential name | Type | Configuration |
|---|---|---|
| `CloudflareD1Api` | HTTP Header Auth | Header: `Authorization`, Value: `Bearer <CLOUDFLARE_API_TOKEN>` |
| `OpenAiApi` | OpenAI API | API key: `<OPENAI_API_KEY>` |
| `TelegramBotApi` | Telegram Bot API | Bot token: `<TELEGRAM_BOT_TOKEN>` |
| `X Bearer Token` | HTTP Header Auth | Header: `Authorization`, Value: `Bearer <X_BEARER_TOKEN>` |
| `NewsApiCredential` | HTTP Header Auth | Header: `X-Api-Key`, Value: `<NEWS_API_KEY>` |

The `CloudflareD1Api` token must have the **D1:Edit** permission for the target database.

> **Note:** Credentials are stored encrypted in the PostgreSQL database using
> the `N8N_ENCRYPTION_KEY`. Back up this key securely.

---

## 7. Configure runtime variables

Set the following variables in **n8n Settings → Variables**.

### Cloudflare / D1

| Variable | Value |
|---|---|
| `CF_ACCOUNT_ID` | Your Cloudflare account ID |
| `CF_D1_DATABASE_ID` | Target D1 database ID |
| `CF_API_TOKEN` | Cloudflare API token with D1:Edit permission (used by workflow nodes that call the D1 REST API) |

### GitHub publishing

| Variable | Value |
|---|---|
| `GITHUB_REPO_OWNER` | GitHub org or username |
| `GITHUB_REPO_NAME` | `ModernContentPlatform` |
| `GITHUB_CONTENT_BRANCH` | `main` |

### AI and media

| Variable | Default | Description |
|---|---|---|
| `AI_PROVIDER` | `openai` | `openai` or `google` |
| `MEDIA_MODE` | `image_video` | `image_video` (v1 only) |
| `AI_MODEL_STANDARD` | `gpt-4o` | Model for editorial tasks |
| `AI_MODEL_FAST` | `gpt-4o-mini` | Model for classification tasks |

### Alert thresholds

| Variable | Default | Description |
|---|---|---|
| `ALERT_IMPORTANCE_THRESHOLD` | `60` | Minimum importance score to deliver |
| `ALERT_SEVERITY_THRESHOLD` | `50` | Minimum severity score to deliver |
| `ALERT_CONFIDENCE_THRESHOLD` | `40` | Minimum AI confidence to deliver |

### Delivery

| Variable | Value |
|---|---|
| `TELEGRAM_CHAT_ID` | Target Telegram chat or channel ID |
| `DISCORD_WEBHOOK_URL` | Discord incoming webhook URL |
| `FAILURE_ALERT_CHANNEL` | Telegram chat ID for failure notifications |

### Workflow IDs

After importing all workflows, note each workflow's ID from the n8n editor
and set these variables:

**Intraday:**

| Variable | Points to |
|---|---|
| `FAILURE_NOTIFIER_WORKFLOW_ID` | `failure_notifier.json` |
| `INTRADAY_INGESTION_WORKFLOW_ID` | `01_source_ingestion.json` |
| `INTRADAY_NORMALIZATION_WORKFLOW_ID` | `02_normalization.json` |
| `INTRADAY_DEDUPLICATION_WORKFLOW_ID` | `03_deduplication.json` |
| `INTRADAY_CLUSTERING_WORKFLOW_ID` | `04_clustering.json` |
| `INTRADAY_AI_CLASSIFICATION_WORKFLOW_ID` | `05_ai_classification.json` |
| `INTRADAY_ALERT_DECISION_WORKFLOW_ID` | `06_alert_decision.json` |
| `INTRADAY_D1_PERSISTENCE_WORKFLOW_ID` | `07_d1_persistence.json` |
| `INTRADAY_TELEGRAM_WORKFLOW_ID` | `08_telegram_delivery.json` |
| `INTRADAY_DISCORD_WORKFLOW_ID` | `09_discord_delivery.json` |

**Daily:**

| Variable | Points to |
|---|---|
| `DAILY_AGGREGATE_WORKFLOW_ID` | `01_aggregate_alerts.json` |
| `DAILY_SUMMARY_WORKFLOW_ID` | `02_generate_summary.json` |
| `DAILY_ARTICLE_WORKFLOW_ID` | `03_generate_article.json` |
| `DAILY_EXPECTATION_CHECK_WORKFLOW_ID` | `04_generate_expectation_check.json` |
| `DAILY_TOMORROW_OUTLOOK_WORKFLOW_ID` | `05_generate_tomorrow_outlook.json` |
| `DAILY_VIDEO_SCRIPT_WORKFLOW_ID` | `06_generate_video_script.json` |
| `DAILY_YOUTUBE_METADATA_WORKFLOW_ID` | `07_generate_youtube_metadata.json` |
| `DAILY_VALIDATE_OUTPUTS_WORKFLOW_ID` | `08_validate_outputs.json` |
| `DAILY_PUBLISH_GITHUB_WORKFLOW_ID` | `09_publish_to_github.json` |
| `DAILY_UPDATE_D1_WORKFLOW_ID` | `10_update_d1_state.json` |

See `docs/architecture/workflow-runtime-variables.md` for the complete
variable reference including model overrides and media configuration.

---

## 8. Activate workflows

After credentials and variables are configured:

1. Open the **intraday orchestrator** workflow in the n8n editor.
2. Click **Active** (toggle on) — this starts the 15-minute schedule.
3. Open the **daily orchestrator** workflow.
4. Click **Active** (toggle on) — this starts the 23:30 UTC schedule.
5. Open the **failure notifier** workflow and verify it is active.

### Smoke test

Before activating the orchestrators, run the smoke test to verify the D1
write path:

1. Open `00_local_alert_smoke_test` in the n8n editor.
2. Click **Execute Workflow**.
3. Verify the test alert appears in the D1 `alerts` table.
4. Delete the test alert from D1 after verification.

---

## 9. Verify the deployment

### Checklist

- [ ] n8n is reachable at `https://<N8N_HOST>/`
- [ ] Owner account is created
- [ ] All workflows are imported (check the workflow list)
- [ ] Credentials are configured and pass connection tests
- [ ] Runtime variables are set in Settings → Variables
- [ ] Failure notifier is active
- [ ] Smoke test writes to D1 successfully
- [ ] Intraday orchestrator is active
- [ ] Daily orchestrator is active

### Quick verification commands

```bash
# Check containers are running
docker compose -f n8n/docker-compose.production.yml ps

# Check n8n is responding
curl -s -o /dev/null -w "%{http_code}" https://n8n.example.com/healthz

# Check n8n logs for errors
docker compose -f n8n/docker-compose.production.yml logs --tail=50 n8n

# Check PostgreSQL is healthy
docker compose -f n8n/docker-compose.production.yml exec postgres \
  pg_isready -U n8n -d n8n
```

---

## 10. Updates and maintenance

### Update n8n version

1. Check the [n8n changelog](https://docs.n8n.io/release-notes/) for breaking changes.
2. Update the `N8N_VERSION` in `n8n/.env.production`:
   ```
   N8N_VERSION=1.70.0
   ```
3. Pull the new image and restart:
   ```bash
   docker compose -f n8n/docker-compose.production.yml pull
   docker compose -f n8n/docker-compose.production.yml up -d
   ```
4. Verify n8n starts successfully and workflows are intact.

### Update workflows

When workflow JSON files are updated in the repository:

```bash
cd ModernContentPlatform
git pull origin main
bash scripts/n8n-workflow-import.sh production
```

Verify in the n8n editor that updated workflows reflect the expected changes.

### Back up n8n data

#### PostgreSQL backup

```bash
docker compose -f n8n/docker-compose.production.yml exec postgres \
  pg_dump -U n8n -d n8n > /tmp/n8n-backup-$(date +%Y%m%d).sql
```

#### Encryption key backup

The `N8N_ENCRYPTION_KEY` in `n8n/.env.production` must be backed up securely.
Without it, credential data in the database cannot be decrypted.

#### Docker volume backup

```bash
# Stop the stack
docker compose -f n8n/docker-compose.production.yml down

# Back up volumes
docker run --rm \
  -v n8n_postgres_data:/data \
  -v /tmp:/backup \
  alpine tar czf /backup/n8n-postgres-data.tar.gz -C /data .

docker run --rm \
  -v n8n_n8n_data:/data \
  -v /tmp:/backup \
  alpine tar czf /backup/n8n-n8n-data.tar.gz -C /data .

# Restart the stack
docker compose -f n8n/docker-compose.production.yml \
  --env-file n8n/.env.production up -d
```

### View execution logs

In the n8n editor, go to **Executions** to see workflow execution history.
Execution data is pruned after the number of hours specified by
`EXECUTIONS_DATA_MAX_AGE` (default: 168 hours / 7 days).

---

## 11. Staging instance

A staging n8n instance follows the same deployment steps but with isolated
configuration:

| Setting | Staging value |
|---|---|
| `N8N_HOST` | `n8n-staging.example.com` |
| `CLOUDFLARE_D1_DATABASE_ID` | Staging D1 database ID |
| `TELEGRAM_CHAT_ID` | Staging Telegram channel |
| `DISCORD_WEBHOOK_URL` | Staging Discord webhook |
| `GITHUB_CONTENT_BRANCH` | `staging` |

Use a separate `n8n/.env.staging` file:

```bash
cp n8n/.env.production.example n8n/.env.staging
# Edit with staging-specific values

docker compose -f n8n/docker-compose.production.yml \
  --env-file n8n/.env.staging -p n8n-staging up -d
```

Import workflows into the staging instance:

```bash
bash scripts/n8n-workflow-import.sh staging
```

> **Important:** Use separate `N8N_ENCRYPTION_KEY` and `POSTGRES_PASSWORD`
> values for staging and production.

See `docs/staging-environment.md` for the full staging strategy.

---

## 12. Troubleshooting

### n8n fails to start

```bash
docker compose -f n8n/docker-compose.production.yml logs n8n
```

| Symptom | Cause | Fix |
|---|---|---|
| "POSTGRES_PASSWORD is required" | Missing env var | Fill in `n8n/.env.production` |
| "N8N_ENCRYPTION_KEY is required" | Missing env var | Generate with `openssl rand -hex 32` |
| Connection refused to PostgreSQL | Postgres not ready | Wait for healthcheck or check postgres logs |
| "port 5678 already in use" | Another process on port 5678 | Change `N8N_PORT` or stop the conflicting process |

### Workflows fail to import

| Symptom | Cause | Fix |
|---|---|---|
| "duplicate key" | Workflow ID already exists | Re-import updates existing workflows — this is usually safe to ignore |
| "invalid JSON" | Corrupted workflow file | Re-export from a working n8n instance or check the JSON syntax |
| "command not found: n8n" | Wrong container | Verify the container ID with `docker compose ps` |

### Credentials fail connection test

| Credential | Check |
|---|---|
| `CloudflareD1Api` | Verify the API token has D1:Edit permission |
| `OpenAiApi` | Verify the API key is valid and has sufficient quota |
| `TelegramBotApi` | Verify the bot token and that the bot is added to the target chat |
| `X Bearer Token` | Verify the X API v2 bearer token is valid |

### Workflows run but produce no alerts

1. Check the intraday orchestrator execution log in n8n.
2. Verify `INTRADAY_SOURCES_JSON` is set with valid source configurations.
3. Verify the source provider mode (at least one X or NewsAPI source required).
4. Check that the AI API key is valid and has quota.
5. Check that `CF_ACCOUNT_ID` and `CF_D1_DATABASE_ID` are correct.

### Failure notifier does not send messages

1. Verify the failure notifier workflow is active.
2. Verify `FAILURE_ALERT_CHANNEL` is set to a valid Telegram chat ID.
3. Verify the `TelegramBotApi` credential is configured.
4. Check the failure notifier execution log in n8n for errors.

---

## 13. Security considerations

- **TLS:** Always terminate TLS at the reverse proxy. Never expose n8n on
  plain HTTP in production.
- **Authentication:** n8n requires owner account login. Consider restricting
  access by IP or VPN if the instance should not be publicly accessible.
- **Encryption key:** The `N8N_ENCRYPTION_KEY` encrypts all stored credentials.
  Rotate it only if you re-encrypt all credentials.
- **API tokens:** Use scoped API tokens with minimum required permissions.
  Rotate tokens periodically.
- **Network:** The PostgreSQL container is not exposed to the host. Only n8n
  can reach it via the Docker network.
- **Secrets in env files:** The `n8n/.env.production` file contains secrets.
  Restrict file permissions: `chmod 600 n8n/.env.production`.

---

## Quick reference

| Task | Command |
|---|---|
| Start the stack | `docker compose -f n8n/docker-compose.production.yml --env-file n8n/.env.production up -d` |
| Stop the stack | `docker compose -f n8n/docker-compose.production.yml down` |
| View n8n logs | `docker compose -f n8n/docker-compose.production.yml logs -f n8n` |
| Import workflows (production) | `bash scripts/n8n-workflow-import.sh production` |
| Import workflows (staging) | `bash scripts/n8n-workflow-import.sh staging` |
| Update n8n | Edit `N8N_VERSION` in `.env.production`, then `docker compose pull && up -d` |
| Back up database | `docker compose exec postgres pg_dump -U n8n -d n8n > backup.sql` |
| Check health | `curl -s https://n8n.example.com/healthz` |

---

## Related documentation

- [`n8n/README.md`](../../n8n/README.md) — Local development setup
- [`docs/staging-environment.md`](../staging-environment.md) — Staging strategy
- [`docs/architecture/workflow-runtime-variables.md`](../architecture/workflow-runtime-variables.md) — Full variable reference
- [`docs/architecture/intraday-workflow.md`](../architecture/intraday-workflow.md) — Intraday pipeline architecture
- [`docs/architecture/daily-editorial-workflow.md`](../architecture/daily-editorial-workflow.md) — Daily pipeline architecture
- [`docs/operations/cloudflare-pages-deployment.md`](cloudflare-pages-deployment.md) — Cloudflare Pages deployment
- [`docs/operations/d1-provisioning.md`](d1-provisioning.md) — D1 database provisioning
- [`workflows/n8n/intraday/README.md`](../../workflows/n8n/intraday/README.md) — Intraday workflow reference
