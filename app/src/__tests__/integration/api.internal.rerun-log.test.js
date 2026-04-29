/**
 * Integration tests — POST /api/internal/rerun-log
 *
 * Tests the rerun_log write endpoint using a seeded in-memory D1 mock.
 * Validates: authentication, payload validation, create, update, and error states.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { onRequestPost } from '@functions/api/internal/rerun-log.js'
import { createSeededDb } from './helpers/mockD1.js'

const WRITE_KEY = 'test-write-key-secret'

function makeRequest(body, headers = {}) {
  return new Request('http://localhost/api/internal/rerun-log', {
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
    rerun_type: 'daily_publish',
    topic_slug: 'crypto',
    date_key: '2025-01-15',
    source_table: 'publish_jobs',
    source_id: 42,
    status: 'running',
    attempt: 1,
    triggered_by: 'operator',
    workflow_run_id: 'exec-abc-123',
    ...overrides
  }
}

describe('POST /api/internal/rerun-log', () => {
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
    const ctx = makeCtx(db, validPayload(), { 'X-Write-Key': 'wrong' })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(403)
  })

  // --- Payload validation ---

  it('returns 400 when rerun_type is invalid', async () => {
    const ctx = makeCtx(db, validPayload({ rerun_type: 'invalid' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/rerun_type/)
  })

  it('returns 400 when topic_slug is invalid', async () => {
    const ctx = makeCtx(db, validPayload({ topic_slug: 'invalid' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/topic_slug/)
  })

  it('returns 400 when date_key format is wrong', async () => {
    const ctx = makeCtx(db, validPayload({ date_key: '2025/01/15' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
  })

  it('returns 400 when source_table is invalid', async () => {
    const ctx = makeCtx(db, validPayload({ source_table: 'invalid_table' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/source_table/)
  })

  it('returns 400 when source_id is negative', async () => {
    const ctx = makeCtx(db, validPayload({ source_id: -1 }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/source_id/)
  })

  it('returns 400 when status is not valid', async () => {
    const ctx = makeCtx(db, validPayload({ status: 'active' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/status/)
  })

  it('returns 400 when triggered_by is invalid', async () => {
    const ctx = makeCtx(db, validPayload({ triggered_by: 'bot' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/triggered_by/)
  })

  it('returns 400 when attempt is out of range', async () => {
    const ctx = makeCtx(db, validPayload({ attempt: 0 }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
  })

  it('returns 400 when attempt exceeds maximum', async () => {
    const ctx = makeCtx(db, validPayload({ attempt: 21 }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
  })

  it('returns 400 when unknown fields are present', async () => {
    const ctx = makeCtx(db, validPayload({ extra_field: 'foo' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
  })

  // --- Successful create ---

  it('returns 201 with running status', async () => {
    const ctx = makeCtx(db, validPayload(), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBeDefined()
    expect(body.rerun_type).toBe('daily_publish')
    expect(body.topic_slug).toBe('crypto')
    expect(body.date_key).toBe('2025-01-15')
    expect(body.status).toBe('running')
  })

  it('returns 201 for youtube_upload rerun type', async () => {
    const payload = validPayload({
      rerun_type: 'youtube_upload',
      source_table: 'youtube_publish_log',
      source_id: 7
    })
    const ctx = makeCtx(db, payload, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.rerun_type).toBe('youtube_upload')
  })

  it('returns 201 for alert_delivery rerun type', async () => {
    const payload = validPayload({
      rerun_type: 'alert_delivery',
      source_table: 'alerts',
      source_id: null
    })
    const ctx = makeCtx(db, payload, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.rerun_type).toBe('alert_delivery')
  })

  it('returns 201 for social_publish rerun type', async () => {
    const payload = validPayload({
      rerun_type: 'social_publish',
      source_table: 'social_publish_log'
    })
    const ctx = makeCtx(db, payload, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(201)
  })

  it('returns 201 for intraday_workflow rerun type', async () => {
    const payload = validPayload({
      rerun_type: 'intraday_workflow',
      source_table: 'workflow_logs'
    })
    const ctx = makeCtx(db, payload, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(201)
  })

  it('defaults status to pending when not provided', async () => {
    const payload = validPayload()
    delete payload.status
    const ctx = makeCtx(db, payload, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.status).toBe('pending')
  })

  it('defaults triggered_by to operator when not provided', async () => {
    const payload = validPayload()
    delete payload.triggered_by
    const ctx = makeCtx(db, payload, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(201)
  })

  it('accepts minimal payload with only required fields', async () => {
    const payload = {
      rerun_type: 'daily_publish',
      topic_slug: 'finance',
      date_key: '2025-01-15',
      source_table: 'publish_jobs'
    }
    const ctx = makeCtx(db, payload, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.topic_slug).toBe('finance')
    expect(body.status).toBe('pending')
  })

  it('accepts null source_id', async () => {
    const payload = validPayload({ source_id: null })
    const ctx = makeCtx(db, payload, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(201)
  })

  // --- Update path ---

  it('returns 200 when updating an existing rerun log entry', async () => {
    // First create a rerun log entry
    const createCtx = makeCtx(db, validPayload(), { 'X-Write-Key': WRITE_KEY })
    const createRes = await onRequestPost(createCtx)
    expect(createRes.status).toBe(201)
    const created = await createRes.json()

    // Then update it
    const updateCtx = makeCtx(db, {
      id: created.id,
      status: 'success'
    }, { 'X-Write-Key': WRITE_KEY })
    const updateRes = await onRequestPost(updateCtx)
    expect(updateRes.status).toBe(200)
    const updated = await updateRes.json()
    expect(updated.id).toBe(created.id)
    expect(updated.status).toBe('success')
    expect(updated.success).toBe(true)
  })

  it('returns 400 when updating without status', async () => {
    const ctx = makeCtx(db, { id: 1 }, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
  })

  it('returns 400 when id is not a positive integer', async () => {
    const ctx = makeCtx(db, { id: -1, status: 'success' }, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
  })

  it('returns 400 when update status is invalid', async () => {
    const ctx = makeCtx(db, { id: 1, status: 'active' }, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
  })

  it('returns 400 when unknown fields are present in update', async () => {
    const ctx = makeCtx(db, { id: 1, status: 'success', extra_field: 'foo' }, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
  })

  it('returns 404 when updating a non-existent entry', async () => {
    const ctx = makeCtx(db, { id: 9999, status: 'success' }, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(404)
  })

  // --- Error states ---

  it('returns 503 when database is not configured', async () => {
    const ctx = {
      request: makeRequest(validPayload(), { 'X-Write-Key': WRITE_KEY }),
      env: { WRITE_API_KEY: WRITE_KEY }
    }
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(503)
  })
})
