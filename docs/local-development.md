# Local Development Guide

This guide explains how to run Modern Content Platform locally in VS Code for frontend development, Pages Functions testing, and D1 database operations.

---

## Prerequisites

Install the following tools before starting:

| Tool | Version | Install |
|---|---|---|
| **Node.js** | 20 LTS or later | https://nodejs.org |
| **npm** | bundled with Node.js | — |
| **Wrangler CLI** | 3.x or later | `npm install -g wrangler` |

You also need a **Cloudflare account** with Pages and D1 enabled to provision the database and deploy. Local development with a local D1 SQLite file does not require a Cloudflare account.

---

## First-time setup

### 1. Clone the repository and install dependencies

```bash
git clone https://github.com/Phelecks/ModernContentPlatform.git
cd ModernContentPlatform

# Install Vue frontend dependencies
cd app
npm install
cd ..
```

### 2. Authenticate Wrangler

```bash
wrangler login
```

This opens a browser window to authenticate with your Cloudflare account. Wrangler uses this session for all D1 and Pages CLI operations — **you do not need to set `CLOUDFLARE_ACCOUNT_ID` or `CLOUDFLARE_API_TOKEN` in `.env` for local development**.

### 3. Configure local runtime secrets (optional)

If your Pages Functions need secret values at runtime (e.g. an API key read from the environment inside a function), create a `.dev.vars` file in the repository root. Wrangler reads this file automatically during `wrangler pages dev`:

```bash
# .dev.vars — local-only, never commit this file
MY_SECRET_KEY=some-local-value
```

`.dev.vars` is excluded by `.gitignore`. See the [Wrangler `.dev.vars` docs](https://developers.cloudflare.com/workers/configuration/secrets/#local-development-with-dev-vars) for full details.

For services outside Wrangler (n8n, external tooling), copy `.env.example` to `.env` and fill in the relevant variables:

```bash
cp .env.example .env
```

Variables in `.env.example` are annotated with `[local]`, `[deploy]`, or `[n8n]` scope markers so you know which ones you actually need for a given task.

### 4. Provision the D1 database (first time only)

```bash
wrangler d1 create modern-content-platform-db
```

Copy the `database_id` value from the output. Paste it into:
- `wrangler.toml` → `database_id` field under `[[d1_databases]]`

### 5. Apply database migrations

**Apply to your remote D1 database:**

```bash
wrangler d1 migrations apply modern-content-platform-db
```

**Apply to the local SQLite file (for fully offline dev):**

```bash
wrangler d1 migrations apply modern-content-platform-db --local
```

Migrations are stored in `db/migrations/` and run in filename order.

### 6. Seed initial topic data

```bash
# Remote
wrangler d1 execute modern-content-platform-db --file=db/seeds/topics.sql

# Local
wrangler d1 execute modern-content-platform-db --file=db/seeds/topics.sql --local
```

### 7. Seed sample alerts (optional — local development only)

Sample event clusters and alerts for three topics (`crypto`, `finance`, `ai`) on date `2025-01-15` are provided for local testing. Run after seeding topics:

```bash
wrangler d1 execute modern-content-platform-db --file=db/seeds/sample_alerts.sql --local
```

### 8. Reset and reseed local D1 (optional)

Use the reset script to wipe local state and start fresh with a clean database:

```bash
bash scripts/local-reset.sh
```

This script:
1. Deletes the local D1 SQLite file under `.wrangler/state/v3/d1/`
2. Applies all migrations in `db/migrations/` in filename order
3. Seeds topics from `db/seeds/topics.sql`
4. Seeds sample alerts from `db/seeds/sample_alerts.sql`
5. Prints a verification summary of the resulting data

---

## Running locally

### Option A — Vue frontend only (no API)

Use this when working on frontend components that do not depend on live API data.

```bash
cd app
npm run dev
```

The app starts at **http://localhost:5173**.

### Option B — Full local stack (frontend + Pages Functions + D1)

Use this when working on Pages Functions or testing API integrations end-to-end.

**Step 1:** Build the Vue app (Wrangler Pages dev serves the built output):

```bash
cd app
npm run build
cd ..
```

**Step 2:** Start Wrangler Pages dev server (serves functions + static files + local D1):

```bash
wrangler pages dev app/dist --d1=DB
```

The full stack starts at **http://localhost:8788**.

> **Tip:** Run `npm run build -- --watch` in a separate terminal inside `app/` to automatically rebuild on Vue file changes while `wrangler pages dev` is running.

### Option C — Query the local D1 database directly

```bash
# Interactive REPL
wrangler d1 execute modern-content-platform-db --local --command "SELECT * FROM topics;"

# Run a query file
wrangler d1 execute modern-content-platform-db --local --file=db/queries/read_queries.sql
```

---

## VS Code setup

### Recommended extensions

Open VS Code in the repository root and install the workspace-recommended extensions:

1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Run **Extensions: Show Recommended Extensions**
3. Install all listed extensions

Recommended extensions are defined in `.vscode/extensions.json`:

| Extension | Purpose |
|---|---|
| **Vue - Official** (`Vue.volar`) | Vue 3 language support, IntelliSense, and formatting |
| **ESLint** (`dbaeumer.vscode-eslint`) | JavaScript and Vue linting |
| **EditorConfig** (`EditorConfig.EditorConfig`) | Consistent editor formatting from `.editorconfig` |
| **Prettier** (`esbenp.prettier-vscode`) | Code formatting |
| **Cloudflare Workers** (`cloudflare.cloudflare-workers-bindings`) | Wrangler and Workers IntelliSense |

### Workspace settings

`.vscode/settings.json` pre-configures:
- Format on save using Prettier for all files (Vue files use Volar's formatter)
- ESLint auto-fix on save for `.js` files via `editor.codeActionsOnSave`
- ESLint validation for `.js` and `.vue` files
- EditorConfig-consistent indentation and line endings

---

## Common commands reference

| Task | Command |
|---|---|
| Install frontend dependencies | `cd app && npm install` |
| Start Vue dev server | `cd app && npm run dev` |
| Build Vue app | `cd app && npm run build` |
| Lint frontend | `cd app && npm run lint` |
| Start full Pages dev stack | `wrangler pages dev app/dist --d1=DB` |
| Apply migrations (remote) | `wrangler d1 migrations apply modern-content-platform-db` |
| Apply migrations (local) | `wrangler d1 migrations apply modern-content-platform-db --local` |
| Seed topics (remote) | `wrangler d1 execute modern-content-platform-db --file=db/seeds/topics.sql` |
| Seed topics (local) | `wrangler d1 execute modern-content-platform-db --file=db/seeds/topics.sql --local` |
| Seed sample alerts (local) | `wrangler d1 execute modern-content-platform-db --file=db/seeds/sample_alerts.sql --local` |
| Reset local D1 (wipe + reseed) | `bash scripts/local-reset.sh` |
| Query D1 locally | `wrangler d1 execute modern-content-platform-db --local --command "SELECT ..."` |
| Authenticate Wrangler | `wrangler login` |

---

## Repository structure quick reference

```
app/         Vue frontend — run npm install here
functions/   Pages Functions — served by wrangler pages dev
db/          D1 schema, migrations, seeds, and query examples
content/     GitHub-backed editorial content (static at build time)
docs/        Architecture and operations documentation
scripts/     Utility scripts for local and CI tasks (e.g. local-reset.sh)
wrangler.toml  Cloudflare deployment and D1 binding configuration
.env.example   Environment variable template — copy to .env
```

---

## Troubleshooting

**`wrangler` command not found**
Run `npm install -g wrangler` and ensure your global npm bin directory is in your `PATH`.

**D1 binding error when running Pages dev**
Ensure you pass `--d1=DB` to `wrangler pages dev`. The binding name `DB` must match the `binding` field in `wrangler.toml`.

**`database_id` is still `YOUR_D1_DATABASE_ID` in wrangler.toml**
You need to provision D1 first: `wrangler d1 create modern-content-platform-db`. Copy the returned ID into `wrangler.toml`.

**Vue hot-reload not working with wrangler pages dev**
Run `npm run dev` inside `app/` for a hot-reload Vue experience. Use `wrangler pages dev` only when you need to test Pages Functions.

**ESLint not highlighting errors in VS Code**
Check that the **ESLint** extension is installed and that `eslint.workingDirectories` in `.vscode/settings.json` points to `app`. Run `npm install` inside `app/` to ensure eslint is installed.
