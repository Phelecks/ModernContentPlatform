# Functions

Cloudflare Pages Functions live here.

## Read APIs (public)

- `api/timeline/` serves live alert timeline reads.
- `api/day-status/` serves topic/day readiness and publish state.
- `api/navigation/` serves previous and next day navigation data.
- `api/topics/` serves topic metadata and listing data.

## Write APIs (internal, authenticated)

- `api/internal/alerts` — creates an alert with event cluster and daily_status updates.
- `api/internal/daily-status` — upserts page readiness and content availability.
- `api/internal/publish-jobs` — creates or updates publish job records.

All internal write endpoints require an `X-Write-Key` header matching the
`WRITE_API_KEY` secret. See `docs/d1-write-path.md` for details.

## Shared libraries

- `lib/db.js` — query helpers and response utilities (reads).
- `lib/auth.js` — API key authentication for internal write endpoints.
- `lib/validate.js` — payload validation for alert, daily_status, and publish_jobs writes.
- `lib/writers.js` — centralized D1 write functions used by all internal endpoints.

Read APIs should remain thin and focused on reading operational data from D1.
Write APIs centralize all workflow-driven persistence logic.