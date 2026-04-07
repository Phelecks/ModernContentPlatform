/**
 * Integration tests — POST /api/internal/publish-jobs
 *
 * Tests the publish_jobs write endpoint using a seeded in-memory D1 mock.
 * Validates: authentication, payload validation, create vs update, and error states.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { onRequestPost } from '@functions/api/internal/publish-jobs.js'
import { createSeededDb } from './helpers/mockD1.js'

const WRITE_KEY = 'test-write-key-secret'

function makeRequest(body, headers = {}) {
  return new Request('http://localhost/api/internal/publish-jobs', {
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

function validCreatePayload(overrides = {}) {
  return {
    topic_slug: 'crypto',
    date_key: '2025-01-15',
    status: 'pending',
    triggered_by: 'schedule',
    workflow_run_id: 'exec-12345',
    ...overrides
  }
}

describe('POST /api/internal/publish-jobs', () => {
  let db

  beforeEach(() => {
    db = createSeededDb()
  })

  // --- Authentication ---

  it('returns 401 when X-Write-Key header is missing', async () => {
    const ctx = makeCtx(db, validCreatePayload())
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(401)
  })

  it('returns 403 when X-Write-Key header is wrong', async () => {
    const ctx = makeCtx(db, validCreatePayload(), { 'X-Write-Key': 'wrong' })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(403)
  })

  // --- Create: payload validation ---

  it('returns 400 when topic_slug is invalid on create', async () => {
    const ctx = makeCtx(db, validCreatePayload({ topic_slug: 'invalid' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
  })

  it('returns 400 when date_key format is wrong on create', async () => {
    const ctx = makeCtx(db, validCreatePayload({ date_key: '2025/01/15' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
  })

  it('returns 400 when status is invalid on create', async () => {
    const ctx = makeCtx(db, validCreatePayload({ status: 'unknown' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
  })

  it('returns 400 when triggered_by is invalid', async () => {
    const ctx = makeCtx(db, validCreatePayload({ triggered_by: 'unknown' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
  })

  // --- Create: successful write ---

  it('returns 201 with id on successful create', async () => {
    const ctx = makeCtx(db, validCreatePayload(), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toHaveProperty('id')
    expect(body.topic_slug).toBe('crypto')
    expect(body.date_key).toBe('2025-01-15')
    expect(body.status).toBe('pending')
  })

  it('returns 201 with defaults when only required fields provided', async () => {
    const payload = { topic_slug: 'ai', date_key: '2025-01-15' }
    const ctx = makeCtx(db, payload, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.status).toBe('pending')
  })

  // --- Update: payload validation ---

  it('returns 400 when id is not a positive integer on update', async () => {
    const ctx = makeCtx(db, { id: -1, status: 'success', topic_slug: 'crypto', date_key: '2025-01-15' }, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/id/i)
  })

  it('returns 400 when status is missing on update', async () => {
    const ctx = makeCtx(db, { id: 42, topic_slug: 'crypto', date_key: '2025-01-15' }, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/status/i)
  })

  it('returns 400 when status is invalid on update', async () => {
    const ctx = makeCtx(db, { id: 42, status: 'unknown', topic_slug: 'crypto', date_key: '2025-01-15' }, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
  })

  it('returns 400 when unknown fields are present on create', async () => {
    const ctx = makeCtx(db, validCreatePayload({ extra_field: 'value' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/unknown/i)
  })

  it('returns 400 when error_message is not a string on update', async () => {
    const ctx = makeCtx(db, { id: 42, status: 'failed', error_message: 123, topic_slug: 'crypto', date_key: '2025-01-15' }, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
  })

  // --- Update: successful write ---

  it('returns 200 with success on valid update', async () => {
    // Seed a publish job so the update can find it
    db.seed('publish_jobs', [
      { id: 42, topic_slug: 'crypto', date_key: '2025-01-15', status: 'running' }
    ])
    const ctx = makeCtx(db, { id: 42, status: 'success', topic_slug: 'crypto', date_key: '2025-01-15' }, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe(42)
    expect(body.status).toBe('success')
    expect(body.topic_slug).toBe('crypto')
    expect(body.date_key).toBe('2025-01-15')
    expect(body.success).toBe(true)
  })

  it('returns 200 with error_message on failed update', async () => {
    db.seed('publish_jobs', [
      { id: 42, topic_slug: 'crypto', date_key: '2025-01-15', status: 'running' }
    ])
    const ctx = makeCtx(db, { id: 42, status: 'failed', error_message: 'Out of memory', topic_slug: 'crypto', date_key: '2025-01-15' }, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('failed')
    expect(body.success).toBe(true)
  })

  it('returns 404 when updating a non-existent job', async () => {
    db.seed('publish_jobs', [])
    const ctx = makeCtx(db, { id: 999, status: 'success', topic_slug: 'crypto', date_key: '2025-01-15' }, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/not found/i)
  })

  it('returns 409 when job id does not match topic/date', async () => {
    db.seed('publish_jobs', [
      { id: 42, topic_slug: 'finance', date_key: '2025-01-16', status: 'running' }
    ])
    const ctx = makeCtx(db, { id: 42, status: 'success', topic_slug: 'crypto', date_key: '2025-01-15' }, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/does not match/i)
  })

  it('returns JSON Content-Type header', async () => {
    const ctx = makeCtx(db, validCreatePayload(), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.headers.get('Content-Type')).toContain('application/json')
  })

  // --- Error states ---

  it('returns 503 when DB is not configured', async () => {
    const ctx = {
      request: makeRequest(validCreatePayload(), { 'X-Write-Key': WRITE_KEY }),
      env: { WRITE_API_KEY: WRITE_KEY }
    }
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(503)
  })
})
