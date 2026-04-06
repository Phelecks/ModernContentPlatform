/**
 * Integration tests — GET /api/day-status/:topicSlug/:dateKey
 *
 * Tests the full onRequestGet handler pipeline using a seeded in-memory D1 mock.
 * Validates: response shape, page_state values, availability flags, and error states.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { onRequestGet } from '@functions/api/day-status/[topicSlug]/[dateKey].js'
import { createSeededDb } from './helpers/mockD1.js'

function makeCtx(db, topicSlug, dateKey) {
  return { params: { topicSlug, dateKey }, env: { DB: db } }
}

describe('GET /api/day-status/:topicSlug/:dateKey', () => {
  let db

  beforeEach(() => {
    db = createSeededDb()
  })

  // ---- Happy path — published state ----

  it('returns HTTP 200 for a known topic/date', async () => {
    const res = await onRequestGet(makeCtx(db, 'crypto', '2025-01-15'))
    expect(res.status).toBe(200)
  })

  it('returns the full response shape', async () => {
    const res = await onRequestGet(makeCtx(db, 'crypto', '2025-01-15'))
    const body = await res.json()
    expect(body).toHaveProperty('topic_slug')
    expect(body).toHaveProperty('date_key')
    expect(body).toHaveProperty('page_state')
    expect(body).toHaveProperty('display_name')
    expect(body).toHaveProperty('alert_count')
    expect(body).toHaveProperty('cluster_count')
    expect(body).toHaveProperty('summary_available')
    expect(body).toHaveProperty('video_available')
    expect(body).toHaveProperty('article_available')
    expect(body).toHaveProperty('prev_date_key')
    expect(body).toHaveProperty('next_date_key')
    expect(body).toHaveProperty('published_at')
  })

  it('returns published state for crypto/2025-01-15', async () => {
    const res = await onRequestGet(makeCtx(db, 'crypto', '2025-01-15'))
    const body = await res.json()
    expect(body.page_state).toBe('published')
    expect(body.topic_slug).toBe('crypto')
    expect(body.date_key).toBe('2025-01-15')
    expect(body.display_name).toBe('Crypto')
  })

  it('returns all availability flags as 1 for fully published crypto day', async () => {
    const res = await onRequestGet(makeCtx(db, 'crypto', '2025-01-15'))
    const body = await res.json()
    expect(body.summary_available).toBe(1)
    expect(body.video_available).toBe(1)
    expect(body.article_available).toBe(1)
  })

  it('returns video_available 0 for finance (no video in seed)', async () => {
    const res = await onRequestGet(makeCtx(db, 'finance', '2025-01-15'))
    const body = await res.json()
    expect(body.video_available).toBe(0)
    expect(body.article_available).toBe(1)
  })

  // ---- Ready state ----

  it('returns ready state for ai/2025-01-15', async () => {
    const res = await onRequestGet(makeCtx(db, 'ai', '2025-01-15'))
    const body = await res.json()
    expect(body.page_state).toBe('ready')
    expect(body.article_available).toBe(0)
    expect(body.published_at).toBeNull()
  })

  // ---- Pending state (no daily_status row) ----

  it('returns pending state when no daily_status row exists for the date', async () => {
    const res = await onRequestGet(makeCtx(db, 'crypto', '2099-12-31'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.page_state).toBe('pending')
    expect(body.alert_count).toBe(0)
    expect(body.summary_available).toBe(0)
    expect(body.video_available).toBe(0)
    expect(body.article_available).toBe(0)
    expect(body.published_at).toBeNull()
  })

  it('returns topic display_name even when no daily_status row exists', async () => {
    const res = await onRequestGet(makeCtx(db, 'economy', '2025-01-15'))
    const body = await res.json()
    expect(body.display_name).toBe('Economy')
    expect(body.page_state).toBe('pending')
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
