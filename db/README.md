# DB

Cloudflare D1 database assets live here.

- `migrations/` for migration-safe SQL changes.
- `schema/` for canonical schema references.
- `queries/` for reusable read query examples.
- `seeds/` for local and test seed data:
  - `topics.sql` — canonical topic rows; safe to apply to remote or local D1.
  - `sample_alerts.sql` — sample event clusters, alerts, and daily_status rows for local development and testing (do not apply to production).

D1 should store alerts, daily status, publish jobs, navigation metadata, and operational workflow state.

## Local reset

To wipe and reinitialise the local D1 database from scratch:

```bash
bash scripts/local-reset.sh
```

See `docs/local-development.md` for the full local setup guide.
