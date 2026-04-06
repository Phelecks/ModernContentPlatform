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
| Vue page | `page.TopicDayPage.test.js` | TopicDayPage rendering — placeholder, summary, banner messages, error state, loading |

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

### Watch mode (during development)

```bash
cd app
npm test
```

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
          mockD1.js               ← mock D1 + createSeededDb()
        api.day-status.test.js
        api.navigation.test.js
        api.timeline.test.js
        api.topics.test.js
        page.TopicDayPage.test.js
      components/                 ← unit tests (unchanged)
      utils/                      ← unit tests (unchanged)
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

---

## Notes on the expected console output

The "shows error state when the API call fails" test intentionally triggers a rejected fetch. The component logs the error via `console.error`. This output is expected and does not indicate a test failure:

```
[TopicDayPage] Failed to load page: Error: Network error
```
