/**
 * Integration tests — POST /api/internal/meta-social-publish-log
 *
 * Tests the meta_social_publish_log write endpoint using a seeded in-memory D1 mock.
 * Validates: authentication, payload validation, successful create, and error states.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { onRequestPost } from '@functions/api/internal/meta-social-publish-log.js'
import { createSeededDb } from './helpers/mockD1.js'

const WRITE_KEY = 'test-write-key-secret'

function makeRequest(body, headers = {}) {
  return new Request('http://localhost/api/internal/meta-social-publish-log', {
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
    asset_type: 'daily_post',
    source_type: 'daily_summary',
    platform: 'instagram',
    post_type: 'feed',
    status: 'published',
    platform_post_id: '17895695668004550',
    attempt: 1,
    ...overrides
  }
}

describe('POST /api/internal/meta-social-publish-log', () => {
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
    const body = await res.json()
    expect(body.error).toMatch(/date_key/)
  })

  it('returns 400 when asset_type is invalid', async () => {
    const ctx = makeCtx(db, validPayload({ asset_type: 'unknown' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/asset_type/)
  })

  it('returns 400 when source_type is invalid', async () => {
    const ctx = makeCtx(db, validPayload({ source_type: 'unknown' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/source_type/)
  })

  it('returns 400 when platform is invalid', async () => {
    const ctx = makeCtx(db, validPayload({ platform: 'twitter' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/platform/)
  })

  it('returns 400 when post_type is invalid', async () => {
    const ctx = makeCtx(db, validPayload({ post_type: 'reel' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/post_type/)
  })

  it('returns 400 when status is invalid', async () => {
    const ctx = makeCtx(db, validPayload({ status: 'unknown' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/status/)
  })

  it('returns 400 when attempt is not a valid integer', async () => {
    const ctx = makeCtx(db, validPayload({ attempt: 0 }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/attempt/)
  })

  it('returns 400 when attempt exceeds maximum', async () => {
    const ctx = makeCtx(db, validPayload({ attempt: 11 }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/attempt/)
  })

  it('returns 400 when unknown fields are present', async () => {
    const ctx = makeCtx(db, validPayload({ extra_field: 'value' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/unknown/i)
  })

  it('returns 400 when error_message is not a string', async () => {
    const ctx = makeCtx(db, validPayload({ error_message: 123 }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
  })

  // --- Successful create ---

  it('returns 201 with id on successful create for Instagram feed', async () => {
    const ctx = makeCtx(db, validPayload(), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toHaveProperty('id')
    expect(body.topic_slug).toBe('crypto')
    expect(body.date_key).toBe('2025-01-15')
    expect(body.platform).toBe('instagram')
    expect(body.post_type).toBe('feed')
    expect(body.status).toBe('published')
  })

  it('returns 201 for Facebook story', async () => {
    const ctx = makeCtx(db, validPayload({
      platform: 'facebook',
      post_type: 'story',
      asset_type: 'story',
      source_type: 'alert',
      source_id: 'alert-123',
      status: 'published'
    }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.platform).toBe('facebook')
    expect(body.post_type).toBe('story')
  })

  it('returns 201 with defaults when only required fields provided', async () => {
    const payload = {
      topic_slug: 'ai',
      date_key: '2025-01-15',
      asset_type: 'daily_post',
      source_type: 'daily_summary',
      platform: 'facebook',
      post_type: 'feed'
    }
    const ctx = makeCtx(db, payload, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.status).toBe('pending')
  })

  it('returns 201 with error_message for failed publish', async () => {
    const ctx = makeCtx(db, validPayload({
      status: 'failed',
      platform_post_id: null,
      error_message: 'Graph API error: rate limit exceeded'
    }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.status).toBe('failed')
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
