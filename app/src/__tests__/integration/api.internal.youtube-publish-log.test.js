/**
 * Integration tests — POST /api/internal/youtube-publish-log
 *
 * Tests the youtube_publish_log write endpoint using a seeded in-memory D1 mock.
 * Validates: authentication, payload validation, successful create, and error states.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { onRequestPost } from '@functions/api/internal/youtube-publish-log.js'
import { createSeededDb } from './helpers/mockD1.js'

const WRITE_KEY = 'test-write-key-secret'

function makeRequest(body, headers = {}) {
  return new Request('http://localhost/api/internal/youtube-publish-log', {
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
    status: 'published',
    youtube_video_id: 'dQw4w9WgXcQ',
    visibility: 'public',
    attempt: 1,
    ...overrides
  }
}

describe('POST /api/internal/youtube-publish-log', () => {
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

  it('returns 400 when status is not a valid youtube status', async () => {
    const ctx = makeCtx(db, validPayload({ status: 'active' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/status/)
  })

  it('returns 400 when visibility is not valid', async () => {
    const ctx = makeCtx(db, validPayload({ visibility: 'draft' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/visibility/)
  })

  it('returns 400 when attempt is out of range', async () => {
    const ctx = makeCtx(db, validPayload({ attempt: 0 }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
  })

  it('returns 400 when unknown fields are present', async () => {
    const ctx = makeCtx(db, validPayload({ extra_field: 'foo' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
  })

  // --- Successful create ---

  it('returns 201 with published status and video_id', async () => {
    const ctx = makeCtx(db, validPayload(), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBeDefined()
    expect(body.topic_slug).toBe('crypto')
    expect(body.date_key).toBe('2025-01-15')
    expect(body.status).toBe('published')
    expect(body.youtube_video_id).toBe('dQw4w9WgXcQ')
  })

  it('returns 201 with uploading status', async () => {
    const payload = validPayload({ status: 'uploading', youtube_video_id: null })
    const ctx = makeCtx(db, payload, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.status).toBe('uploading')
    expect(body.youtube_video_id).toBeNull()
  })

  it('returns 201 with failed status and error_message', async () => {
    const payload = validPayload({
      status: 'failed',
      youtube_video_id: null,
      error_message: 'YouTube Data API returned 403 quotaExceeded'
    })
    const ctx = makeCtx(db, payload, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.status).toBe('failed')
  })

  it('returns 201 with skipped status', async () => {
    const payload = validPayload({
      status: 'skipped',
      youtube_video_id: null,
      visibility: null
    })
    const ctx = makeCtx(db, payload, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.status).toBe('skipped')
  })

  it('returns 201 with unlisted visibility', async () => {
    const payload = validPayload({ visibility: 'unlisted' })
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

  it('defaults attempt to 1 when not provided', async () => {
    const payload = validPayload()
    delete payload.attempt
    const ctx = makeCtx(db, payload, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(201)
  })

  it('accepts minimal payload with only required fields', async () => {
    const payload = { topic_slug: 'finance', date_key: '2025-01-15' }
    const ctx = makeCtx(db, payload, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.topic_slug).toBe('finance')
    expect(body.status).toBe('pending')
    expect(body.youtube_video_id).toBeNull()
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
