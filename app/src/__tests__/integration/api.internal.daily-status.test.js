/**
 * Integration tests — POST /api/internal/daily-status
 *
 * Tests the daily_status write endpoint using a seeded in-memory D1 mock.
 * Validates: authentication, payload validation, successful writes, and error states.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { onRequestPost } from '@functions/api/internal/daily-status.js'
import { createSeededDb } from './helpers/mockD1.js'

const WRITE_KEY = 'test-write-key-secret'

function makeRequest(body, headers = {}) {
  return new Request('http://localhost/api/internal/daily-status', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify(body)
  })
}

function makeCtx(db, body, headers = {}) {
  return {
    request: makeRequest(body, headers),
    env: { DB: db, WRITE_API_KEY: WRITE_KEY }
  }
}

function validPayload(overrides = {}) {
  return {
    topic_slug: 'crypto',
    date_key: '2025-01-16',
    page_state: 'ready',
    alert_count: 5,
    cluster_count: 2,
    summary_available: 1,
    video_available: 0,
    article_available: 1,
    ...overrides
  }
}

describe('POST /api/internal/daily-status', () => {
  let db

  beforeEach(() => {
    db = createSeededDb()
  })

  // --- Authentication ---

  it('returns 401 when X-Write-Key header is missing', async () => {
    const ctx = makeCtx(db, validPayload())
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(401)
  })

  it('returns 403 when X-Write-Key header is wrong', async () => {
    const ctx = makeCtx(db, validPayload(), { 'X-Write-Key': 'wrong-key' })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(403)
  })

  // --- Payload validation ---

  it('returns 400 when topic_slug is invalid', async () => {
    const ctx = makeCtx(db, validPayload({ topic_slug: 'invalid-topic' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/topic_slug/i)
  })

  it('returns 400 when date_key format is wrong', async () => {
    const ctx = makeCtx(db, validPayload({ date_key: 'Jan-15-2025' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/date_key/i)
  })

  it('returns 400 when page_state is invalid', async () => {
    const ctx = makeCtx(db, validPayload({ page_state: 'unknown' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/page_state/i)
  })

  it('returns 400 when alert_count is negative', async () => {
    const ctx = makeCtx(db, validPayload({ alert_count: -1 }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/alert_count/i)
  })

  it('returns 400 when summary_available is not 0 or 1', async () => {
    const ctx = makeCtx(db, validPayload({ summary_available: 2 }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/summary_available/i)
  })

  // --- Successful writes ---

  it('returns 200 with success on valid payload', async () => {
    const ctx = makeCtx(db, validPayload(), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.topic_slug).toBe('crypto')
    expect(body.date_key).toBe('2025-01-16')
    expect(body.page_state).toBe('ready')
  })

  it('returns 200 with defaults when only required fields provided', async () => {
    const payload = { topic_slug: 'finance', date_key: '2025-01-16' }
    const ctx = makeCtx(db, payload, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.page_state).toBe('ready')
  })

  it('accepts published page_state', async () => {
    const ctx = makeCtx(db, validPayload({ page_state: 'published' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.page_state).toBe('published')
  })

  it('returns JSON Content-Type header', async () => {
    const ctx = makeCtx(db, validPayload(), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.headers.get('Content-Type')).toContain('application/json')
  })

  // --- Error states ---

  it('returns 503 when DB is not configured', async () => {
    const ctx = {
      request: makeRequest(validPayload(), { 'X-Write-Key': WRITE_KEY }),
      env: { WRITE_API_KEY: WRITE_KEY }
    }
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(503)
  })
})
