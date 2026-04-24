# Integration Testing

This document describes the integration testing foundation for Modern Content Platform — what it covers, how to run it, and how to extend it.

## Overview

Integration tests sit one level above unit tests. They verify that the full request-to-response pipeline of each Pages Function handler works correctly with realistic seeded data, and that Vue pages render the right UI for each combination of page state and content availability.

### What is tested

| Layer | File | Scope |
|---|---|---|
| Pages Function | `api.topics.test.js` | `GET /api/topics` — topic list, ordering, filtering, error states |
| Pages Function | `api.timeline.test.js` | `GET /api/timeline/:topicSlug/:dateKey` — alerts, pagination, cursor, validation |
| Pages Function | `api.day-status.test.js` | `GET /api/day-status/:topicSlug/:dateKey` — status flags, pending/ready/published states |
| Pages Function | `api.navigation.test.js` | `GET /api/navigation/:topicSlug/:dateKey` — prev/next date keys |
| Pages Function | `api.sources.test.js` | `GET /api/sources` — source registry listing, topic filtering, active-only, error states |
| Pages Function (write) | `api.internal.alerts.test.js` | `POST /api/internal/alerts` — auth, payload validation, D1 writes |
| Pages Function (write) | `api.internal.daily-status.test.js` | `POST /api/internal/daily-status` — auth, payload validation, upsert |
| Pages Function (write) | `api.internal.publish-jobs.test.js` | `POST /api/internal/publish-jobs` — auth, create, update, lifecycle |
| Pages Function (write) | `api.internal.sources.test.js` | `POST /api/internal/sources` — auth, source creation, X account/query types, dedup |
| Pages Function (write) | `api.internal.workflow-logs.test.js` | `POST /api/internal/workflow-logs` — auth, log creation, error states |
| Vue page | `page.TopicDayPage.test.js` | TopicDayPage — placeholder, summary, banner messages, error state, loading |
| Vue page | `page.TopicDayPage.extended.test.js` | TopicDayPage — video embed, navigation, load-more pagination, full published state |
| Vue page | `page.TopicPage.test.js` | TopicPage — redirect to today's day page, error state |
| Vue page | `page.HomePage.test.js` | HomePage — topic card list, error state, loading |
| Vue component | `components/AlertTimeline.test.js` | AlertTimeline — all states: loading, error, empty, populated, load-more |
| Vue component | `components/AlertTimelineItem.test.js` | AlertTimelineItem — rendering, severity levels, time display, optional fields |
| Vue component | `components/PageStateBanner.test.js` | PageStateBanner — all types (info/warning/success/error), message, accessibility |
| Vue component | `components/SourceBadge.test.js` | SourceBadge — all source type labels (rss, api, official, x_account, x_query, social, webhook), empty guard |
| Vue component | `components/SourceList.test.js` | SourceList — summary source attribution, role labels, badges, URLs, confidence notes |
| Vue component | `components/SummarySection.test.js` | SummarySection — markdown, html, sanitization, slot fallback |
| Vue component | `components/VideoEmbed.test.js` | VideoEmbed — iframe src, title, lazy loading |
| Vue component | `components/DateNavigator.test.js` | DateNavigator — date display, prev/next links, disabled state |
| Vue component | `components/TopicCard.test.js` | TopicCard — display name, description, route link |
| Vue component | `components/SummaryPlaceholder.test.js` | SummaryPlaceholder — title, guidance text |
| Utility | `utils/date.test.js` | formatDateKey, todayKey, isToday, formatTime, timeAgo |
| Utility | `utils/url.test.js` | isSafeUrl — HTTP/HTTPS allowed, javascript:/data:/null/malformed rejected |
| Utility | `utils/validate.test.js` | validateAlertPayload, validateDailyStatusPayload, validatePublishJobPayload |
| Utility | `utils/sourceTrust.test.js` | Source normalization, trust tier/score mapping, HTML stripping, confirmation rules, attribution payload shaping |
| Service | `services/api.test.js` | fetchTopics, fetchDayStatus, fetchTimeline, fetchNavigation — paths, params, errors |
| Service | `services/content.test.js` | fetchSummary, fetchArticle, fetchVideoMeta, fetchMetadata — paths, 404 handling, errors |
| Content files | `content.daily-summary.test.js` | Generated content schema validation and placeholder→final state transition |
| Fixtures | `fixtures.test.js` | All fixture files — structural validation of page states, alerts, summaries |
| Source ingestion | `workflow.source-ingestion.test.js` | normalizeItem for all 6 source types (rss, api, social, webhook, x_account, x_query), trust propagation, HTML stripping, topic candidate detection, item_id determinism |
| Source attribution | `source-attribution.test.js` | Source attribution round-trip: alert write → timeline API → frontend rendering; placeholder→ready state transition with source data preserved |
| E2E daily cycle | `e2e.daily-cycle.test.js` | Full 12-stage pipeline verification for Finance and Crypto: source ingestion → classification → D1 → delivery → summary → video → YouTube → GitHub → state → social → page render |

---

## Running the tests

### All tests (unit + integration)

```bash
cd app
npm run test:run
```

### Integration tests only

```bash
cd app
npm run test:integration
```

### Source and X tests only

```bash
cd app
npm run test:run -- \
  src/__tests__/utils/sourceTrust.test.js \
  src/__tests__/utils/url.test.js \
  src/__tests__/components/SourceBadge.test.js \
  src/__tests__/components/SourceList.test.js \
  src/__tests__/integration/workflow.source-ingestion.test.js \
  src/__tests__/integration/source-attribution.test.js \
  src/__tests__/integration/api.sources.test.js \
  src/__tests__/integration/api.internal.sources.test.js
```

### Watch mode (during development)

```bash
cd app
npm test
```

---

## CI test coverage

The GitHub Actions CI workflow (`.github/workflows/ci.yml`) runs three test steps on every push and pull request.

### Step 1 — Unit tests

Runs all component, utility, and service unit tests:

```
src/__tests__/components   (all component tests, including SourceBadge and SourceList)
src/__tests__/utils        (all utility tests, including sourceTrust and url)
src/__tests__/services     (all service tests)
```

### Step 2 — Source and X tests

A dedicated CI step that runs only source-related and X-related tests. This step exists so that source logic failures are immediately visible and actionable as a named CI check, separate from the broader test suites:

| Test file | What it protects |
|---|---|
| `utils/sourceTrust.test.js` | Source type mapping, trust tier/score assignment, HTML stripping, confirmation rules |
| `utils/url.test.js` | isSafeUrl helper used by source attribution rendering |
| `components/SourceBadge.test.js` | Source type badge labels and rendering guard |
| `components/SourceList.test.js` | Summary source attribution display with role labels, URLs, and badges |
| `integration/workflow.source-ingestion.test.js` | normalizeItem for all 6 source types including x_account and x_query; trust field propagation; item_id determinism |
| `integration/source-attribution.test.js` | Source attribution round-trip from alert write through timeline API to frontend rendering |
| `integration/api.sources.test.js` | `GET /api/sources` response shape, filtering, and error handling |
| `integration/api.internal.sources.test.js` | `POST /api/internal/sources` authentication, payload validation, and X source creation |

A failure in this step indicates a regression in source normalization, trust scoring, X ingestion, or source attribution.

### Step 3 — Integration tests

Runs the full integration test suite (`src/__tests__/integration`), which includes all source integration tests plus the broader API, page, and content tests.

---

## Test data strategy

Integration tests use a `MockD1Database` (see `app/src/__tests__/integration/helpers/mockD1.js`) rather than a live database. This mock:

- stores table rows in memory
- implements the D1 API surface (`prepare().bind().first()` / `.all()`)
- executes the same SQL patterns used in the production handlers
- is pre-seeded with data that mirrors `db/seeds/topics.sql` and `db/seeds/sample_alerts.sql`

The seed covers:

| Topic | Date | page_state | article | video |
|---|---|---|---|---|
| `crypto` | 2025-01-15 | `published` | ✓ | ✓ |
| `finance` | 2025-01-15 | `published` | ✓ | ✗ |
| `ai` | 2025-01-15 | `ready` | ✗ | ✗ |

All other topic/date combinations return `pending` state with zero counts, matching the COALESCE defaults in the production handler.

### Using the seed helper in a test

```js
import { createSeededDb } from './helpers/mockD1.js'

const db = createSeededDb()
// optionally override a table:
db.seed('daily_status', [{ topic_slug: 'crypto', date_key: '2025-01-20', page_state: 'pending', ... }])
```

### Overriding a table for a specific test case

```js
it('returns pending state for a date with no status row', async () => {
  db.seed('daily_status', [])   // clear all rows
  const res = await onRequestGet(makeCtx(db, 'crypto', '2025-01-15'))
  expect((await res.json()).page_state).toBe('pending')
})
```

---

## File structure

```
app/
  src/
    __tests__/
      integration/
        helpers/
          mockD1.js                              ← mock D1 + createSeededDb()
          fixtures.js                            ← canonical fixture re-exports
        api.day-status.test.js
        api.internal.alerts.test.js
        api.internal.daily-status.test.js
        api.internal.publish-jobs.test.js
        api.internal.sources.test.js            ← source registry write API
        api.internal.workflow-logs.test.js
        api.navigation.test.js
        api.sources.test.js                     ← source registry read API
        api.timeline.test.js
        api.topics.test.js
        content.daily-summary.test.js
        fixtures.test.js
        page.HomePage.test.js
        page.TopicDayPage.test.js
        page.TopicDayPage.extended.test.js      ← video, navigation, load-more
        page.TopicPage.test.js
        source-attribution.test.js              ← source attribution end-to-end
        e2e.daily-cycle.test.js                 ← full 12-stage Finance/Crypto verification
        workflow.source-ingestion.test.js       ← source normalization + X ingestion
      components/
        AlertTimeline.test.js
        AlertTimelineItem.test.js
        DateNavigator.test.js
        PageStateBanner.test.js
        SourceBadge.test.js                     ← source type badge rendering
        SourceList.test.js                      ← summary source attribution UI
        SummaryPlaceholder.test.js
        SummarySection.test.js
        TopicCard.test.js
        VideoEmbed.test.js
      services/
        api.test.js
        content.test.js
      utils/
        date.test.js
        sourceTrust.test.js                     ← source normalization + trust scoring
        url.test.js                             ← isSafeUrl helper
        validate.test.js
```

The integration tests are included in the default `vitest` run (`src/**/*.test.js`) so they run alongside unit tests in CI.

---

## How Pages Function tests work

Each test imports the handler directly using the `@functions` alias (configured in `app/vitest.config.js`) and calls it with a context object containing a seeded `MockD1Database`:

```js
import { onRequestGet } from '@functions/api/topics/index.js'
import { createSeededDb } from './helpers/mockD1.js'

const db = createSeededDb()
const res = await onRequestGet({ env: { DB: db } })
const topics = await res.json()
```

This tests the complete handler pipeline including:
- input validation
- D1 queries (via mock)
- response shaping
- HTTP status codes
- JSON headers

---

## How page rendering tests work

`page.TopicDayPage.test.js` mounts the real `TopicDayPage` component inside a `createMemoryHistory()` Vue Router and replaces the global `fetch` with a mock that returns seeded fixture data:

```js
vi.stubGlobal('fetch', buildFetch(PENDING_STATUS))
const router = await createTestRouter()
const wrapper = mount(TopicDayPage, { global: { plugins: [router] } })
await flushPromises()
expect(wrapper.find('.summary-placeholder').exists()).toBe(true)
```

Each fixture constant matches a realistic combination of `page_state` and availability flags:

| Fixture | `page_state` | `article_available` | `video_available` |
|---|---|---|---|
| `PENDING_STATUS` | `pending` | 0 | 0 |
| `READY_STATUS` | `ready` | 0 | 0 |
| `PUBLISHED_STATUS` | `published` | 1 | 1 |

---

## Extending the tests

### Adding a test for a new endpoint

1. Create `app/src/__tests__/integration/api.<name>.test.js`
2. Import the handler via the `@functions` alias
3. Use `createSeededDb()` for data — add custom rows with `db.seed()` as needed

### Adding a new page-level test

1. Add fixture data for the new scenario
2. Build a fetch mock with `buildFetch(statusFixture, options)`
3. Mount the component with `createTestRouter()` and `flushPromises()`

### Adding a new table to the mock

`MockD1Database` stores any table name you pass to `db.seed()`. No code changes are needed — just call `db.seed('new_table', rows)` in your test.

If the new handler uses a SQL pattern not yet handled by `MockStatement._run()`, extend the parser in `helpers/mockD1.js`. The parser currently supports:

- single-table `SELECT` with `WHERE`, `ORDER BY`, `LIMIT`
- `SELECT COUNT(*) AS alias`
- two-table `LEFT JOIN` (topics + daily_status pattern)
- `?` parameter binding
- equality, inequality, and `<` / `>` comparisons in `WHERE`
- column projection to only the fields listed in `SELECT`
- `col AS alias` and `table.col AS alias` in the SELECT list
- `SELECT 1` for existence-check queries

Any unsupported `WHERE` segment will throw immediately with a descriptive error, so new SQL patterns are caught at test time rather than silently ignored.

---

## What is intentionally not yet covered

The following areas are out of scope for v1 test coverage. This is a deliberate decision, not an oversight.

### n8n workflow logic

n8n workflows (`workflows/n8n/`) are JSON configuration files executed by the n8n runtime. There is no framework to unit-test n8n node execution in isolation. Coverage here relies on:
- fixture validation tests (`fixtures.test.js`) that verify the expected input/output shapes for each workflow stage
- contract schemas (`workflows/contracts/`, `schemas/workflow/`) as the authoritative source of truth
- end-to-end validation in staging before production use

### AI prompt output quality

AI-generated content (classification scores, summaries, cluster labels) cannot be deterministically tested. Coverage for AI output relies on:
- structured JSON schema validation in `content.daily-summary.test.js`
- classified alert fixture validation in `fixtures.test.js`
- schema files in `schemas/ai/` as contracts

### Live Cloudflare D1 / Cloudflare Pages Functions

Tests run against the in-memory `MockD1Database`. Real D1 round-trips (network latency, transactional rollback under load, R2 binding edge cases) are not exercised in the unit/integration suite. These require a staging deployment.

### DefaultLayout and top-level router wiring

`src/layouts/DefaultLayout.vue` and `src/router/index.js` are not directly tested. The router structure is exercised indirectly through every page integration test that uses `createMemoryHistory()`. Top-level layout styling and slot composition is considered stable enough to defer to visual review.

### TopicGrid component

`src/components/TopicGrid.vue` (a thin wrapper over a list of `TopicCard` components) is exercised indirectly through the `page.HomePage.test.js` integration tests. A dedicated unit test would add little value beyond confirming slot rendering.

### TopicDayHeader component in isolation

`TopicDayHeader` composes `DateNavigator` (which is independently tested) and a router-link. It is exercised in every `TopicDayPage` integration test. A standalone unit test for the header is deferred as low priority.

### Write-path transactional guarantees in D1

`db.batch()` atomic semantics (all-or-nothing) cannot be verified with `MockD1Database` because the mock processes statements sequentially without a real transaction engine. The correctness of the batch pattern is validated at the SQL level by reading the `writeAlertBatch` implementation and the migration that adds the required UNIQUE constraint.

### Telegram / Discord delivery

Alert delivery integrations are out of scope for this test suite. They are n8n HTTP node configurations and should be validated with a staging n8n instance.

---

## Notes on the expected console output

The "shows error state when the API call fails" test intentionally triggers a rejected fetch. The component logs the error via `console.error`. This output is expected and does not indicate a test failure:

```
[TopicDayPage] Failed to load page: Error: Network error
```
