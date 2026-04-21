/**
 * Integration tests — POST /api/internal/social-publish-log
 *
 * Tests the social_publish_log write endpoint using a seeded in-memory D1 mock.
 * Validates: authentication, payload validation, successful create, and error states.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { onRequestPost } from '@functions/api/internal/social-publish-log.js'
import { createSeededDb } from './helpers/mockD1.js'

const WRITE_KEY = 'test-write-key-secret'

function makeRequest(body, headers = {}) {
  return new Request('http://localhost/api/internal/social-publish-log', {
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
    platform: 'x',
    post_type: 'post',
    status: 'published',
    platform_post_id: '1750000000000000000',
    attempt: 1,
    ...overrides
  }
}

describe('POST /api/internal/social-publish-log', () => {
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

  it('returns 400 when platform is not x, telegram, or discord', async () => {
    const ctx = makeCtx(db, validPayload({ platform: 'instagram' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/platform/)
  })

  it('returns 400 when post_type is invalid', async () => {
    const ctx = makeCtx(db, validPayload({ post_type: 'feed' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/post_type/)
  })

  it('returns 400 when asset_type is invalid', async () => {
    const ctx = makeCtx(db, validPayload({ asset_type: 'reel' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
  })

  it('returns 400 when status is invalid', async () => {
    const ctx = makeCtx(db, validPayload({ status: 'nope' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
  })

  it('returns 400 when attempt exceeds 10', async () => {
    const ctx = makeCtx(db, validPayload({ attempt: 11 }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
  })

  it('returns 400 when unknown field is present', async () => {
    const ctx = makeCtx(db, validPayload({ unknown_field: 'test' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
  })

  // --- Successful create ---

  it('returns 201 with X platform payload', async () => {
    const ctx = makeCtx(db, validPayload(), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBeDefined()
    expect(body.platform).toBe('x')
    expect(body.post_type).toBe('post')
    expect(body.status).toBe('published')
  })

  it('returns 201 with Telegram platform payload', async () => {
    const payload = validPayload({ platform: 'telegram', post_type: 'digest' })
    const ctx = makeCtx(db, payload, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.platform).toBe('telegram')
    expect(body.post_type).toBe('digest')
  })

  it('returns 201 with Discord platform payload', async () => {
    const payload = validPayload({ platform: 'discord', post_type: 'embed' })
    const ctx = makeCtx(db, payload, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.platform).toBe('discord')
    expect(body.post_type).toBe('embed')
  })

  it('returns 201 with alert post_type', async () => {
    const payload = validPayload({
      asset_type: 'story',
      source_type: 'alert',
      source_id: 'abc123',
      platform: 'x',
      post_type: 'alert',
      status: 'published'
    })
    const ctx = makeCtx(db, payload, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(201)
  })

  it('returns 201 with thread post_type', async () => {
    const payload = validPayload({ platform: 'x', post_type: 'thread' })
    const ctx = makeCtx(db, payload, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.post_type).toBe('thread')
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

  it('accepts failed status with error_message', async () => {
    const payload = validPayload({
      status: 'failed',
      platform_post_id: null,
      error_message: 'Rate limit exceeded'
    })
    const ctx = makeCtx(db, payload, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(201)
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
