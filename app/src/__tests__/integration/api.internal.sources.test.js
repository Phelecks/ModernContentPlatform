/**
 * Integration tests — POST /api/internal/sources
 *
 * Tests the source registry write endpoint using a seeded in-memory D1 mock.
 * Validates: authentication, payload validation, successful writes, and error states.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { onRequestPost } from '@functions/api/internal/sources.js'
import { createSeededDb } from './helpers/mockD1.js'

const WRITE_KEY = 'test-write-key-secret'

function makeRequest(body, headers = {}) {
  return new Request('http://localhost/api/internal/sources', {
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
    source_slug: 'test-rss-source',
    source_name: 'Test RSS Source',
    topic_slug: 'crypto',
    source_type: 'rss',
    trust_tier: 'T2',
    trust_score: 75,
    priority_weight: 80,
    url: 'https://example.com/rss',
    is_active: 1,
    poll_interval_minutes: 15,
    ingestion_method: 'poll',
    metadata_json: '{"notes":"test source"}',
    ...overrides
  }
}

describe('POST /api/internal/sources', () => {
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

  it('returns 403 when X-Write-Key is incorrect', async () => {
    const ctx = makeCtx(db, validPayload(), { 'X-Write-Key': 'wrong-key' })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(403)
  })

  // --- Validation ---

  it('returns 400 for missing source_slug', async () => {
    const payload = validPayload()
    delete payload.source_slug
    const ctx = makeCtx(db, payload, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/source_slug/)
  })

  it('returns 400 for missing source_name', async () => {
    const payload = validPayload()
    delete payload.source_name
    const ctx = makeCtx(db, payload, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/source_name/)
  })

  it('returns 400 for invalid topic_slug', async () => {
    const ctx = makeCtx(db, validPayload({ topic_slug: 'invalid-topic' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/topic_slug/)
  })

  it('returns 400 for invalid source_type', async () => {
    const ctx = makeCtx(db, validPayload({ source_type: 'ftp' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/source_type/)
  })

  it('returns 400 for invalid trust_tier', async () => {
    const ctx = makeCtx(db, validPayload({ trust_tier: 'T5' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/trust_tier/)
  })

  it('returns 400 for trust_score out of range', async () => {
    const ctx = makeCtx(db, validPayload({ trust_score: 101 }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/trust_score/)
  })

  it('returns 400 for invalid ingestion_method', async () => {
    const ctx = makeCtx(db, validPayload({ ingestion_method: 'ftp' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/ingestion_method/)
  })

  it('returns 400 for unknown fields', async () => {
    const ctx = makeCtx(db, validPayload({ unknown_field: 'test' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/Unknown fields/)
  })

  it('returns 400 for poll_interval_minutes out of range', async () => {
    const ctx = makeCtx(db, validPayload({ poll_interval_minutes: 0 }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/poll_interval_minutes/)
  })

  // --- Successful writes ---

  it('creates a source and returns 201 with all fields provided', async () => {
    const ctx = makeCtx(db, validPayload(), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBeDefined()
    expect(body.source_slug).toBe('test-rss-source')
    expect(body.source_name).toBe('Test RSS Source')
    expect(body.topic_slug).toBe('crypto')
  })

  it('creates a source with only required fields', async () => {
    const payload = {
      source_slug: 'minimal-source',
      source_name: 'Minimal Source',
      topic_slug: 'ai',
      source_type: 'api'
    }
    const ctx = makeCtx(db, payload, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBeDefined()
    expect(body.source_slug).toBe('minimal-source')
    expect(body.topic_slug).toBe('ai')
  })

  it('creates a social source (X account)', async () => {
    const payload = validPayload({
      source_slug: 'x-crypto-whale',
      source_name: 'Crypto Whale X Account',
      source_type: 'social',
      trust_tier: 'T4',
      trust_score: 25,
      url: 'https://x.com/crypto_whale'
    })
    const ctx = makeCtx(db, payload, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.source_slug).toBe('x-crypto-whale')
  })

  it('creates a webhook source with push ingestion', async () => {
    const payload = validPayload({
      source_slug: 'exchange-webhook',
      source_name: 'Exchange Webhook',
      source_type: 'webhook',
      ingestion_method: 'push'
    })
    const ctx = makeCtx(db, payload, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(201)
  })
})
