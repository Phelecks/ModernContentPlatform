# D1 Provisioning and Migration Operations Guide

This document covers the full lifecycle of Cloudflare D1 database provisioning, migration, verification, and rollback for the Modern Content Platform.

---

## Overview

The platform uses two remote D1 databases:

| Environment | Database name | Purpose |
|---|---|---|
| **Production** | `modern-content-platform-db` | Live data — alerts, daily status, publish jobs |
| **Staging** | `modern-content-platform-staging-db` | Pre-production validation of migrations and workflows |

Both databases share the same schema defined in `db/migrations/`. Migrations are applied in filename order using Wrangler CLI.

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| **Wrangler CLI** | 3.x or later | `npm install -g wrangler` |
| **Cloudflare account** | — | Pages + D1 enabled |

Authenticate Wrangler before running any remote commands:

```bash
wrangler login
```

Or set the environment variable for non-interactive (CI) use:

```bash
export CLOUDFLARE_API_TOKEN=your-api-token
export CLOUDFLARE_ACCOUNT_ID=your-account-id
```

---

## 1. Provision D1 databases

### Production

```bash
wrangler d1 create modern-content-platform-db
```

Copy the `database_id` from the output and update:
- `wrangler.toml` → top-level `[[d1_databases]]` → `database_id`
- `.env` → `CLOUDFLARE_D1_DATABASE_ID`

### Staging

```bash
wrangler d1 create modern-content-platform-staging-db
```

Copy the `database_id` from the output and update:
- `wrangler.toml` → `[[env.staging.d1_databases]]` → `database_id`
- `.env` → `CLOUDFLARE_D1_STAGING_DATABASE_ID`

### Verify databases exist

```bash
wrangler d1 list
```

Both `modern-content-platform-db` and `modern-content-platform-staging-db` should appear in the output.

---

## 2. Apply migrations

### Recommended order

Always apply migrations to **staging first**, verify, then apply to **production**.

```
staging → verify → production → verify
```

### Using the migration script

The provided script applies all pending migrations and runs verification automatically:

```bash
# Staging
bash scripts/d1-migrate-remote.sh staging

# Production (after staging is verified)
bash scripts/d1-migrate-remote.sh production
```

### Manual migration commands

If you prefer to run commands directly:

```bash
# List pending migrations (staging)
wrangler d1 migrations list modern-content-platform-staging-db --env staging --remote

# Apply migrations (staging)
wrangler d1 migrations apply modern-content-platform-staging-db --env staging --remote

# List pending migrations (production)
wrangler d1 migrations list modern-content-platform-db --remote

# Apply migrations (production)
wrangler d1 migrations apply modern-content-platform-db --remote
```

### Local migrations

Local development uses a SQLite file managed by Wrangler. No remote database is needed:

```bash
# Apply migrations locally
wrangler d1 migrations apply modern-content-platform-db --local

# Or use the full reset script
bash scripts/local-reset.sh
```

---

## 3. Verify schema state

After applying migrations, verify the schema matches the expected state:

```bash
# Staging
bash scripts/d1-verify-schema.sh staging

# Production
bash scripts/d1-verify-schema.sh production

# Local
bash scripts/d1-verify-schema.sh local
```

The verification script checks:
1. **Expected tables** — all 10 platform tables exist
2. **Applied migrations** — the `d1_migrations` table lists all migration files
3. **Expected indexes** — all 30 indexes are present
4. **Row counts** — informational counts for key tables

### Manual verification queries

You can also verify schema state directly:

```bash
# List all tables
wrangler d1 execute modern-content-platform-db --remote \
  --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"

# List all indexes
wrangler d1 execute modern-content-platform-db --remote \
  --command "SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY tbl_name, name;"

# Check migration history
wrangler d1 execute modern-content-platform-db --remote \
  --command "SELECT id, name, applied_at FROM d1_migrations ORDER BY id;"

# Verify a specific table schema
wrangler d1 execute modern-content-platform-db --remote \
  --command "PRAGMA table_info(alerts);"
```

For staging, add `--env staging` and use `modern-content-platform-staging-db`.

---

## 4. Seed initial data

After the first migration run, seed the topics table:

```bash
# Staging
wrangler d1 execute modern-content-platform-staging-db --env staging --remote \
  --file=db/seeds/topics.sql

# Production
wrangler d1 execute modern-content-platform-db --remote \
  --file=db/seeds/topics.sql
```

The sources seed (`db/seeds/sources.sql`) can also be applied if source data is ready:

```bash
wrangler d1 execute modern-content-platform-db --remote \
  --file=db/seeds/sources.sql
```

> **Note:** Do not apply `db/seeds/sample_alerts.sql` to staging or production. That seed file is for local development only.

---

## 5. Adding new migrations

When adding a new migration:

1. Create a new SQL file in `db/migrations/` with the next sequence number:
   ```
   db/migrations/0011_your_description.sql
   ```

2. Use `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ADD COLUMN`, or the safe table-rebuild pattern (see `0002_event_clusters_unique.sql` for an example).

3. Test locally first:
   ```bash
   wrangler d1 migrations apply modern-content-platform-db --local
   bash scripts/d1-verify-schema.sh local
   ```

4. Apply to staging:
   ```bash
   bash scripts/d1-migrate-remote.sh staging
   ```

5. After staging verification, apply to production:
   ```bash
   bash scripts/d1-migrate-remote.sh production
   ```

6. Commit the new migration file and update the verification script if new tables or indexes were added.

### Migration naming conventions

```
0001_init.sql
0002_event_clusters_unique.sql
0003_workflow_logs.sql
...
0011_your_descriptive_name.sql
```

- Use a 4-digit zero-padded sequence number.
- Use a short, descriptive snake_case suffix.
- Wrangler applies migrations in filename sort order.

### Migration safety rules

- **Never modify an already-applied migration file.** Wrangler tracks applied migrations by name. Changing the content of an applied file will not re-apply it and will create state drift.
- **Always use `IF NOT EXISTS` / `IF EXISTS`** guards where possible.
- **Never use `DROP TABLE` without a rebuild plan** (see the pattern in `0002_event_clusters_unique.sql`).
- **Test each migration locally** before applying remotely.

---

## 6. Rollback and recovery

### Understanding D1 migration state

Wrangler tracks applied migrations in the `d1_migrations` internal table. There is no built-in `migrate down` or `rollback` command. Recovery must be handled manually.

### Rollback strategies

#### Strategy A: Forward-fix migration (preferred)

Write a new migration that reverses the problematic change:

```sql
-- 0012_revert_bad_column.sql
-- Reverts the column added by 0011

-- SQLite does not support DROP COLUMN before 3.35.0.
-- Use the table-rebuild pattern if needed:
-- 1. CREATE TABLE new_table (... without the bad column ...)
-- 2. INSERT INTO new_table SELECT ... FROM old_table
-- 3. DROP TABLE old_table
-- 4. ALTER TABLE new_table RENAME TO old_table
-- 5. Recreate indexes
```

This is the safest approach because:
- Migration history stays consistent.
- The fix is tracked in version control.
- It can be tested on staging before production.

#### Strategy B: Manual SQL fix

For urgent production issues, run corrective SQL directly:

```bash
wrangler d1 execute modern-content-platform-db --remote \
  --command "ALTER TABLE alerts DROP COLUMN bad_column;"
```

> **Warning:** Manual changes bypass migration tracking. After a manual fix, the migration state in `d1_migrations` no longer matches the actual schema. You must create a matching forward-fix migration so future environments stay in sync.

#### Strategy C: Database recreation (last resort)

If the schema is unrecoverable, delete and recreate the database:

```bash
# Delete the database (DESTRUCTIVE — all data is lost)
wrangler d1 delete modern-content-platform-staging-db

# Recreate
wrangler d1 create modern-content-platform-staging-db

# Update wrangler.toml with the new database_id

# Re-apply all migrations
bash scripts/d1-migrate-remote.sh staging
```

> **Warning:** This destroys all data. Only use this for staging or when production data loss is acceptable and backups exist.

### Pre-migration backups

Before applying migrations to production, export critical tables:

```bash
# Export topics
wrangler d1 execute modern-content-platform-db --remote \
  --json \
  --command "SELECT * FROM topics;" > /tmp/backup_topics.json

# Export alerts (recent)
wrangler d1 execute modern-content-platform-db --remote \
  --json \
  --command "SELECT * FROM alerts WHERE date_key >= '2025-01-01';" > /tmp/backup_alerts.json

# Export daily_status
wrangler d1 execute modern-content-platform-db --remote \
  --json \
  --command "SELECT * FROM daily_status;" > /tmp/backup_daily_status.json
```

Cloudflare also provides [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) which allows point-in-time recovery within the retention window. Check the current retention window in the Cloudflare dashboard.

---

## 7. Expected schema state

After all 10 migrations are applied, the database should contain:

### Tables (10)

| Table | Created by | Description |
|---|---|---|
| `topics` | 0001_init | Canonical topic list |
| `event_clusters` | 0001_init + 0002 | Grouped alert clusters |
| `alerts` | 0001_init + 0005 + 0006 | Individual alert records |
| `daily_status` | 0001_init | Per topic/day readiness state |
| `publish_jobs` | 0001_init | Publish attempt tracking |
| `workflow_logs` | 0003 | Workflow execution observability |
| `sources` | 0004 | Source registry |
| `openai_usage_log` | 0007 + 0008 | AI call monitoring |
| `meta_social_publish_log` | 0009 | Meta platform publish tracking |
| `social_publish_log` | 0010 | X/Telegram/Discord publish tracking |

### Indexes (30)

Run the verification script for the full list:

```bash
bash scripts/d1-verify-schema.sh <environment>
```

### Migration history

```
0001_init.sql
0002_event_clusters_unique.sql
0003_workflow_logs.sql
0004_source_registry.sql
0005_source_attribution.sql
0006_alerts_trust_columns.sql
0007_openai_usage_log.sql
0008_openai_usage_observability.sql
0009_meta_social_publish_log.sql
0010_social_publish_log.sql
```

---

## 8. Environment bindings reference

### wrangler.toml

```toml
# Production (default)
[[d1_databases]]
binding = "DB"
database_name = "modern-content-platform-db"
database_id = "<production-database-id>"
migrations_dir = "db/migrations"

# Staging
[env.staging]
name = "modern-content-platform-staging"

[[env.staging.d1_databases]]
binding = "DB"
database_name = "modern-content-platform-staging-db"
database_id = "<staging-database-id>"
migrations_dir = "db/migrations"
```

### Pages Functions

Pages Functions access D1 through the `env.DB` binding:

```js
export async function onRequestGet(context) {
  const db = context.env.DB;
  const result = await db.prepare('SELECT * FROM topics WHERE is_active = 1').all();
  return Response.json(result.results);
}
```

The same binding name (`DB`) is used for all environments. Cloudflare Pages routes requests to the correct database based on the deployment environment.

### Cloudflare Pages environment configuration

After provisioning, bind D1 databases to your Pages project in the Cloudflare dashboard:

1. Go to **Workers & Pages** → **modern-content-platform** → **Settings** → **Bindings**
2. Add a D1 database binding:
   - **Variable name:** `DB`
   - **D1 database:** select the appropriate database for each environment
3. For staging (preview) deployments, use the **Preview** environment tab
4. For production deployments, use the **Production** environment tab

---

## 9. Troubleshooting

### "database_id is still a placeholder"

The migration script checks for placeholder values in `wrangler.toml`. Provision the database first:

```bash
wrangler d1 create modern-content-platform-db
```

Then update `wrangler.toml` with the returned `database_id`.

### "no migrations to apply"

All migrations have already been applied. Run the verification script to confirm:

```bash
bash scripts/d1-verify-schema.sh production
```

### "migration failed: table already exists"

A previous partial migration may have created the table. Check if the table has the expected columns:

```bash
wrangler d1 execute modern-content-platform-db --remote \
  --command "PRAGMA table_info(table_name);"
```

If the schema is correct, the migration state may need to be updated. This is a rare situation — consider the forward-fix strategy in Section 6.

### "FOREIGN KEY constraint failed"

D1 enforces foreign keys. Ensure referenced tables and rows exist before inserting data. Seed tables in dependency order: `topics` → `event_clusters` → `alerts`.

### "authentication error"

Re-authenticate:

```bash
wrangler login
```

Or verify that `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are set correctly.

---

## 10. Quick reference

| Task | Command |
|---|---|
| Provision production D1 | `wrangler d1 create modern-content-platform-db` |
| Provision staging D1 | `wrangler d1 create modern-content-platform-staging-db` |
| List databases | `wrangler d1 list` |
| Migrate staging | `bash scripts/d1-migrate-remote.sh staging` |
| Migrate production | `bash scripts/d1-migrate-remote.sh production` |
| Verify staging | `bash scripts/d1-verify-schema.sh staging` |
| Verify production | `bash scripts/d1-verify-schema.sh production` |
| Verify local | `bash scripts/d1-verify-schema.sh local` |
| Seed topics (production) | `wrangler d1 execute modern-content-platform-db --remote --file=db/seeds/topics.sql` |
| Seed topics (staging) | `wrangler d1 execute modern-content-platform-staging-db --env staging --remote --file=db/seeds/topics.sql` |
| Query production | `wrangler d1 execute modern-content-platform-db --remote --command "SELECT ..."` |
| Query staging | `wrangler d1 execute modern-content-platform-staging-db --env staging --remote --command "SELECT ..."` |
| Reset local D1 | `bash scripts/local-reset.sh` |
