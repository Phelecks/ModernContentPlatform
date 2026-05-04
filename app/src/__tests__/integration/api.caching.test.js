/**
 * Integration tests — Cache-Control headers on read APIs
 *
 * Validates that public read endpoints return appropriate Cache-Control headers
 * to reduce latency and database load for repeated reads.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { onRequestGet as getTopics } from '@functions/api/topics/index.js'
import { onRequestGet as getSources } from '@functions/api/sources/index.js'
import { onRequestGet as getTimeline } from '@functions/api/timeline/[topicSlug]/[dateKey].js'
import { onRequestGet as getNavigation } from '@functions/api/navigation/[topicSlug]/[dateKey].js'
import { onRequestGet as getDayStatus } from '@functions/api/day-status/[topicSlug]/[dateKey].js'
import { createSeededDb } from './helpers/mockD1.js'

const BASE_URL = 'http://localhost'

function makeTimelineCtx(db, topicSlug, dateKey, queryParams = {}) {
  const url = new URL(`${BASE_URL}/api/timeline/${topicSlug}/${dateKey}`)
  for (const [key, val] of Object.entries(queryParams)) {
    url.searchParams.set(key, String(val))
  }
  return {
    params: { topicSlug, dateKey },
    request: { url: url.toString() },
    env: { DB: db }
  }
}

describe('Cache-Control headers on read APIs', () => {
  let db

  beforeEach(() => {
    db = createSeededDb()
  })

  it('GET /api/topics returns public caching headers', async () => {
    const res = await getTopics({ env: { DB: db } })
    const cc = res.headers.get('Cache-Control')
    expect(cc).toContain('public')
    expect(cc).toContain('max-age=')
    expect(cc).toContain('stale-while-revalidate')
  })

  it('GET /api/sources returns public caching headers', async () => {
    const url = new URL(`${BASE_URL}/api/sources`)
    const res = await getSources({ request: { url: url.toString() }, env: { DB: db } })
    const cc = res.headers.get('Cache-Control')
    expect(cc).toContain('public')
    expect(cc).toContain('max-age=')
    expect(cc).toContain('stale-while-revalidate')
  })

  it('GET /api/timeline/:topic/:date returns public caching headers', async () => {
    const res = await getTimeline(makeTimelineCtx(db, 'crypto', '2025-01-15'))
    const cc = res.headers.get('Cache-Control')
    expect(cc).toContain('public')
    expect(cc).toContain('max-age=')
    expect(cc).toContain('stale-while-revalidate')
  })

  it('GET /api/navigation/:topic/:date returns public caching headers', async () => {
    const res = await getNavigation({ params: { topicSlug: 'crypto', dateKey: '2025-01-15' }, env: { DB: db } })
    const cc = res.headers.get('Cache-Control')
    expect(cc).toContain('public')
    expect(cc).toContain('max-age=')
    expect(cc).toContain('stale-while-revalidate')
  })

  it('GET /api/day-status/:topic/:date returns public caching headers', async () => {
    const res = await getDayStatus({ params: { topicSlug: 'crypto', dateKey: '2025-01-15' }, env: { DB: db } })
    const cc = res.headers.get('Cache-Control')
    expect(cc).toContain('public')
    expect(cc).toContain('max-age=')
    expect(cc).toContain('stale-while-revalidate')
  })

  it('error responses still use no-store', async () => {
    const res = await getTopics({ env: {} })
    expect(res.status).toBe(503)
    const cc = res.headers.get('Cache-Control')
    expect(cc).toBe('no-store')
  })

  it('timeline skips COUNT query on paginated (cursor) requests', async () => {
    const res = await getTimeline(
      makeTimelineCtx(db, 'crypto', '2025-01-15', { before: '2025-01-15T12:00:00Z' })
    )
    const body = await res.json()
    // total is -1 when cursor-paginated to indicate it was not re-fetched
    expect(body.total).toBe(-1)
  })
})
