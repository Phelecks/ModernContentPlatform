/**
 * Integration tests — POST /api/internal/alerts
 *
 * Tests the alert write endpoint using a seeded in-memory D1 mock.
 * Validates: authentication, payload validation, successful writes, and error states.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { onRequestPost } from '@functions/api/internal/alerts.js'
import { createSeededDb } from './helpers/mockD1.js'

const WRITE_KEY = 'test-write-key-secret'

function makeRequest(body, headers = {}) {
  return new Request('http://localhost/api/internal/alerts', {
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
    date_key: '2025-01-15',
    headline: 'Test Alert Headline',
    summary_text: 'This is a test alert summary for integration testing.',
    source_name: 'TestSource',
    source_url: 'https://example.com/test',
    severity_score: 60,
    importance_score: 80,
    confidence_score: 90,
    event_at: '2025-01-15T14:30:00Z',
    cluster_label: 'Test cluster',
    alert_reason: 'Testing write path',
    secondary_topics: ['finance'],
    item_id: 'test-item-001',
    ...overrides
  }
}

describe('POST /api/internal/alerts', () => {
  let db

  beforeEach(() => {
    db = createSeededDb()
  })

  // --- Authentication ---

  it('returns 503 when WRITE_API_KEY is not configured', async () => {
    const ctx = {
      request: makeRequest(validPayload(), { 'X-Write-Key': WRITE_KEY }),
      env: { DB: db }
    }
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toMatch(/not configured/i)
  })

  it('returns 401 when X-Write-Key header is missing', async () => {
    const ctx = makeCtx(db, validPayload())
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toMatch(/missing/i)
  })

  it('returns 403 when X-Write-Key header is wrong', async () => {
    const ctx = makeCtx(db, validPayload(), { 'X-Write-Key': 'wrong-key' })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/invalid/i)
  })

  // --- Payload validation ---

  it('returns 400 when body is not valid JSON', async () => {
    const ctx = {
      request: new Request('http://localhost/api/internal/alerts', {
        method: 'POST',
        headers: { 'X-Write-Key': WRITE_KEY, 'Content-Type': 'application/json' },
        body: 'not json'
      }),
      env: { DB: db, WRITE_API_KEY: WRITE_KEY }
    }
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
  })

  it('returns 400 when topic_slug is invalid', async () => {
    const ctx = makeCtx(db, validPayload({ topic_slug: 'invalid' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/topic_slug/i)
  })

  it('returns 400 when date_key format is wrong', async () => {
    const ctx = makeCtx(db, validPayload({ date_key: '2025/01/15' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/date_key/i)
  })

  it('returns 400 when headline is empty', async () => {
    const ctx = makeCtx(db, validPayload({ headline: '' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/headline/i)
  })

  it('returns 400 when severity_score is out of range', async () => {
    const ctx = makeCtx(db, validPayload({ severity_score: 101 }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/severity_score/i)
  })

  it('returns 400 when event_at is not a valid timestamp', async () => {
    const ctx = makeCtx(db, validPayload({ event_at: 'not-a-date' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/event_at/i)
  })

  it('returns 400 when secondary_topics has more than 2 items', async () => {
    const ctx = makeCtx(db, validPayload({ secondary_topics: ['finance', 'ai', 'health'] }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/secondary_topics/i)
  })

  it('returns 400 when required fields are missing', async () => {
    const ctx = makeCtx(db, { topic_slug: 'crypto' }, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
  })

  it('returns 400 when unknown fields are present', async () => {
    const ctx = makeCtx(db, validPayload({ unknown_field: 'foo' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/unknown/i)
  })

  it('returns 400 when source_url is not a valid URL', async () => {
    const ctx = makeCtx(db, validPayload({ source_url: 'not-a-url' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/source_url/i)
  })

  // --- Successful writes ---

  it('returns 201 with alert_id and cluster_id on success', async () => {
    const ctx = makeCtx(db, validPayload(), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toHaveProperty('alert_id')
    expect(body).toHaveProperty('cluster_id')
    expect(body.topic_slug).toBe('crypto')
    expect(body.date_key).toBe('2025-01-15')
  })

  it('returns 201 when optional fields are omitted', async () => {
    const payload = {
      topic_slug: 'ai',
      date_key: '2025-01-15',
      headline: 'Minimal Alert',
      summary_text: 'A minimal alert without optional fields.',
      source_name: 'TestSource',
      severity_score: 50,
      importance_score: 50,
      confidence_score: 50,
      event_at: '2025-01-15T10:00:00Z'
    }
    const ctx = makeCtx(db, payload, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.alert_id).toBeTruthy()
  })

  it('returns 201 when cluster_label is null (falls back to topic_slug)', async () => {
    const ctx = makeCtx(db, validPayload({ cluster_label: null }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(201)
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
    const body = await res.json()
    expect(body.error).toMatch(/database/i)
  })
})
