# Scripts

Utility scripts for local development, validation, imports, and release helpers live here.

Keep scripts focused and task-specific.

## Available scripts

| Script | Purpose |
|--------|---------|
| `local-reset.sh` | Reset local D1 database, apply all migrations, and reseed sample data. Run this first before local development. |
| `generate-daily-summary.js` | Generate a local daily summary for a topic/date. Reads alerts from local D1, writes content files, and updates `daily_status`. See `docs/local-summary-generation.md` for full usage. |

## Usage

### Reset local D1

```bash
bash scripts/local-reset.sh
```

### Generate a daily summary locally

```bash
node scripts/generate-daily-summary.js --topic <topic_slug> --date <YYYY-MM-DD>
```

Example:

```bash
node scripts/generate-daily-summary.js --topic ai --date 2025-01-15
```

See `docs/local-summary-generation.md` for details on the full editorial path.