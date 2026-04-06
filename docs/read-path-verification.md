# Local Read Path Verification

This document records the end-to-end verification of the local read path across Vue, Pages Functions, and local Cloudflare D1. It covers the homepage topic list, topic/day page rendering, and all four live API endpoints.

---

## Verified local flow

```
Browser (Vue)
  │
  ├── GET /api/topics
  │     └── Pages Function → D1 topics table → JSON array
  │
  ├── GET /api/day-status/:topicSlug/:dateKey
  │     └── Pages Function → D1 topics + daily_status (LEFT JOIN) → JSON object
  │
  ├── GET /api/timeline/:topicSlug/:dateKey
  │     └── Pages Function → D1 alerts table → paginated JSON
  │
  ├── GET /api/navigation/:topicSlug/:dateKey
  │     └── Pages Function → D1 daily_status table → prev/next date keys
  │
  └── GET /content/topics/:topicSlug/:dateKey/article.md
      GET /content/topics/:topicSlug/:dateKey/video.json
        └── Static file served from GitHub-backed content/ tree
```

---

## Verification method

All paths are verified by a suite of integration tests that run in a `happy-dom` environment without a live server or database. Tests use a `MockD1Database` pre-seeded with data that mirrors `db/seeds/topics.sql` and `db/seeds/sample_alerts.sql`.

Run the full suite:

```bash
cd app
npm run test:run
```

Expected output: **98 tests passing across 10 test files**.

---

## Seed data summary

| Table | Rows |
|---|---|
| `topics` | 7 active topics (crypto, finance, economy, health, ai, energy, technology) |
| `alerts` | 9 sample alerts across crypto, finance, and ai for date `2025-01-15` |
| `daily_status` | 3 rows: crypto (published), finance (published), ai (ready) |

Content files available in `content/`:

| Topic | Date | Article | Video |
|---|---|---|---|
| `crypto` | 2025-01-15 | ✓ | ✓ |
| `finance` | 2025-01-15 | ✓ | ✗ |

---

## Endpoint verification results

### GET /api/topics

- Returns HTTP 200 with a JSON array of 7 active topics
- Topics are ordered by `sort_order` ascending (`crypto` first)
- Each topic includes: `topic_slug`, `display_name`, `description`, `sort_order`
- Inactive topics are excluded
- Returns HTTP 503 when the `DB` binding is not configured

**Test file:** `app/src/__tests__/integration/api.topics.test.js` (9 tests)

---

### GET /api/day-status/:topicSlug/:dateKey

- Returns HTTP 200 with the full status object for known topics
- Returns `page_state: "published"` with all availability flags set to `1` for `crypto/2025-01-15`
- Returns `page_state: "published"` with `video_available: 0` for `finance/2025-01-15` (no video in seed)
- Returns `page_state: "ready"` with `article_available: 0` for `ai/2025-01-15`
- Returns `page_state: "pending"` with all counts at zero when no `daily_status` row exists
- Returns `display_name` from the `topics` table even when no `daily_status` row exists
- Returns HTTP 400 for invalid `topicSlug` or `dateKey` formats
- Returns HTTP 404 for unknown topic slugs
- Returns HTTP 503 when the `DB` binding is not configured

**Test file:** `app/src/__tests__/integration/api.day-status.test.js` (13 tests)

---

### GET /api/timeline/:topicSlug/:dateKey

- Returns HTTP 200 with `{ alerts, total, has_more }` shape
- Alerts are ordered newest-first by `event_at`
- Returns 3 alerts for `crypto/2025-01-15` with `total: 3` and `has_more: false`
- Each alert includes: `id`, `headline`, `summary_text`, `source_name`, `source_url`, `severity_score`, `importance_score`, `confidence_score`, `event_at`
- `limit` query parameter is respected (default 30, max 100)
- `before` ISO-8601 cursor filters out alerts at or after the cursor
- `has_more: true` when there are more alerts beyond the current page
- Returns an empty array for dates with no alerts
- Returns HTTP 400 for invalid formats or a malformed `before` cursor
- Returns HTTP 404 for unknown topic slugs
- Returns HTTP 503 when the `DB` binding is not configured

**Test file:** `app/src/__tests__/integration/api.timeline.test.js` (16 tests)

---

### GET /api/navigation/:topicSlug/:dateKey

- Returns HTTP 200 with `{ prev_date_key, next_date_key }`
- Both keys are `null` when no adjacent published days exist in the seed data
- Returns the correct `prev_date_key` and `next_date_key` when set on the `daily_status` row
- Returns `null` for both when no `daily_status` row exists for the date
- Returns HTTP 400 for invalid formats
- Returns HTTP 404 for unknown topic slugs
- Returns HTTP 503 when the `DB` binding is not configured

**Test file:** `app/src/__tests__/integration/api.navigation.test.js` (10 tests)

---

## Frontend verification results

### HomePage

- Shows a loading spinner before the `/api/topics` response resolves
- Renders all 7 seeded topics as `TopicCard` components after data loads
- Each card links to the correct `/topics/:topicSlug` route
- Shows `home-topics__error` when the API call fails
- Renders an empty grid (no error) when the API returns zero topics

**Test file:** `app/src/__tests__/integration/page.HomePage.test.js` (10 tests)

---

### TopicDayPage

- Shows a loading spinner before any data resolves
- Fetches day status and navigation in parallel; fetches article and video only when their availability flags are set
- Shows `SummaryPlaceholder` for `pending` and `ready` states, or when `article_available` is `1` but the content file returns 404
- Shows `SummarySection` with rendered markdown when `article_available` is `1` and the article loads successfully
- Shows `VideoEmbed` only when `video_available` is `1` and `video.json` loads
- Renders the correct `PageStateBanner` message for each `page_state` value:
  - `pending` → "Live — summary pending end of day"
  - `ready` → "Summary ready — publishing soon"
  - `published` → "Published"
- Shows `AlertTimeline` after the page shell loads
- Shows `topic-day-page__error` when the API call fails

**Test file:** `app/src/__tests__/integration/page.TopicDayPage.test.js` (11 tests)

---

## Data contract alignment

The following table confirms that every field used by the Vue frontend is present in the API response and the JSON schemas:

| Endpoint | Field used by Vue | Present in API | In schema |
|---|---|---|---|
| `/api/topics` | `topic_slug` | ✓ | ✓ |
| `/api/topics` | `display_name` | ✓ | ✓ |
| `/api/topics` | `description` | ✓ | ✓ |
| `/api/day-status` | `page_state` | ✓ | ✓ |
| `/api/day-status` | `display_name` | ✓ | ✓ |
| `/api/day-status` | `article_available` | ✓ | ✓ |
| `/api/day-status` | `video_available` | ✓ | ✓ |
| `/api/day-status` | `summary_available` | ✓ | ✓ |
| `/api/navigation` | `prev_date_key` | ✓ | ✓ |
| `/api/navigation` | `next_date_key` | ✓ | ✓ |
| `/api/timeline` | `alerts[].id` | ✓ | ✓ |
| `/api/timeline` | `alerts[].headline` | ✓ | ✓ |
| `/api/timeline` | `alerts[].summary_text` | ✓ | ✓ |
| `/api/timeline` | `alerts[].source_name` | ✓ | ✓ |
| `/api/timeline` | `alerts[].source_url` | ✓ | ✓ |
| `/api/timeline` | `alerts[].severity_score` | ✓ | ✓ |
| `/api/timeline` | `alerts[].event_at` | ✓ | ✓ |
| `/api/timeline` | `has_more` | ✓ | ✓ |

No mismatches found between the seeded D1 data, API responses, and frontend expectations.

---

## Gaps and notes

**No blocking issues found.** All acceptance criteria are met by the test suite.

| Observation | Severity | Notes |
|---|---|---|
| `TopicDayPage` makes two parallel requests (day-status + navigation) even though day-status already returns `prev_date_key`/`next_date_key` | Low | The dedicated `/api/navigation` endpoint is intentionally separate so callers can request only nav keys without full status. No action required. |
| Article markdown is rendered as raw `<pre>` text when no HTML renderer is configured | Low | The `SummarySection` component intentionally falls back to a `<pre>` block for markdown when only the raw string is passed. An HTML renderer (e.g. marked.js) can be added in a future iteration. |
| `wrangler.toml` still has `database_id = "YOUR_D1_DATABASE_ID"` | None | This is expected for new clones. Local development using `--local` mode does not require a real database ID. See `docs/local-development.md`. |

---

## How to run the local stack manually

See `docs/local-development.md` for the full setup. Quick reference:

```bash
# Terminal 1 — apply migrations and seed the local D1 SQLite file
wrangler d1 migrations apply modern-content-platform-db --local
wrangler d1 execute modern-content-platform-db --file=db/seeds/topics.sql --local
wrangler d1 execute modern-content-platform-db --file=db/seeds/sample_alerts.sql --local

# Terminal 2 — serve the Vite dev server (Vue + content/ files)
cd app
npm run dev

# Terminal 3 — serve Pages Functions backed by local D1
wrangler pages dev app/dist --d1=DB
```

Open **http://localhost:5173** (Vite) — the Vue dev server proxies `/api/*` requests to wrangler on port 8788 automatically.

To verify:

| Check | URL |
|---|---|
| Homepage topic list | http://localhost:5173/ |
| Crypto topic/day page | http://localhost:5173/topics/crypto/2025-01-15 |
| Finance topic/day page | http://localhost:5173/topics/finance/2025-01-15 |
| AI topic/day page (ready state) | http://localhost:5173/topics/ai/2025-01-15 |
| Raw topics API | http://localhost:8788/api/topics |
| Raw day-status API | http://localhost:8788/api/day-status/crypto/2025-01-15 |
| Raw timeline API | http://localhost:8788/api/timeline/crypto/2025-01-15 |
| Raw navigation API | http://localhost:8788/api/navigation/crypto/2025-01-15 |
