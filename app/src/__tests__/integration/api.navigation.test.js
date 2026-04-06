/**
 * Integration tests — GET /api/navigation/:topicSlug/:dateKey
 *
 * Tests the full onRequestGet handler pipeline using a seeded in-memory D1 mock.
 * Validates: response shape, prev/next navigation keys, and error states.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { onRequestGet } from '@functions/api/navigation/[topicSlug]/[dateKey].js'
import { createSeededDb } from './helpers/mockD1.js'

function makeCtx(db, topicSlug, dateKey) {
  return { params: { topicSlug, dateKey }, env: { DB: db } }
}

describe('GET /api/navigation/:topicSlug/:dateKey', () => {
  let db

  beforeEach(() => {
    db = createSeededDb()
  })

  // ---- Happy path ----

  it('returns HTTP 200 for a known topic/date', async () => {
    const res = await onRequestGet(makeCtx(db, 'crypto', '2025-01-15'))
    expect(res.status).toBe(200)
  })

  it('returns the expected response shape', async () => {
    const res = await onRequestGet(makeCtx(db, 'crypto', '2025-01-15'))
    const body = await res.json()
    expect(body).toHaveProperty('prev_date_key')
    expect(body).toHaveProperty('next_date_key')
  })

  it('returns null prev/next when no adjacent dates exist in seed data', async () => {
    const res = await onRequestGet(makeCtx(db, 'crypto', '2025-01-15'))
    const body = await res.json()
    expect(body.prev_date_key).toBeNull()
    expect(body.next_date_key).toBeNull()
  })

  it('returns prev/next when set on the daily_status row', async () => {
    db.seed('daily_status', [
      {
        topic_slug: 'crypto',
        date_key: '2025-01-15',
        page_state: 'published',
        alert_count: 3,
        cluster_count: 1,
        summary_available: 1,
        video_available: 1,
        article_available: 1,
        prev_date_key: '2025-01-14',
        next_date_key: '2025-01-16',
        published_at: '2025-01-15T23:00:00Z'
      }
    ])
    const res = await onRequestGet(makeCtx(db, 'crypto', '2025-01-15'))
    const body = await res.json()
    expect(body.prev_date_key).toBe('2025-01-14')
    expect(body.next_date_key).toBe('2025-01-16')
  })

  it('returns null prev/next when no daily_status row exists for the date', async () => {
    const res = await onRequestGet(makeCtx(db, 'crypto', '2099-12-31'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.prev_date_key).toBeNull()
    expect(body.next_date_key).toBeNull()
  })

  // ---- Input validation ----

  it('returns 400 for an invalid topicSlug', async () => {
    const res = await onRequestGet(makeCtx(db, 'INVALID SLUG!', '2025-01-15'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('returns 400 for an invalid dateKey format', async () => {
    const res = await onRequestGet(makeCtx(db, 'crypto', 'not-a-date'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('returns 404 for an unknown topic slug', async () => {
    const res = await onRequestGet(makeCtx(db, 'unknown-topic', '2025-01-15'))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('returns 503 when DB is not configured', async () => {
    const res = await onRequestGet({ params: { topicSlug: 'crypto', dateKey: '2025-01-15' }, env: {} })
    expect(res.status).toBe(503)
  })

  it('returns a JSON Content-Type header', async () => {
    const res = await onRequestGet(makeCtx(db, 'crypto', '2025-01-15'))
    expect(res.headers.get('Content-Type')).toContain('application/json')
  })
})
