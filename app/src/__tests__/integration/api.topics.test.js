/**
 * Integration tests — GET /api/topics
 *
 * Tests the full onRequestGet handler pipeline using a seeded in-memory D1 mock.
 * Validates: response shape, ordering, active-topic filtering, and error states.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { onRequestGet } from '@functions/api/topics/index.js'
import { createSeededDb } from './helpers/mockD1.js'

function makeCtx(db) {
  return { env: { DB: db } }
}

describe('GET /api/topics', () => {
  let db

  beforeEach(() => {
    db = createSeededDb()
  })

  it('returns HTTP 200 with an array', async () => {
    const res = await onRequestGet(makeCtx(db))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
  })

  it('returns all 7 seeded active topics', async () => {
    const res = await onRequestGet(makeCtx(db))
    const topics = await res.json()
    expect(topics).toHaveLength(7)
  })

  it('returns topics in ascending sort_order', async () => {
    const res = await onRequestGet(makeCtx(db))
    const topics = await res.json()
    for (let i = 1; i < topics.length; i++) {
      expect(topics[i].sort_order).toBeGreaterThanOrEqual(topics[i - 1].sort_order)
    }
  })

  it('returns crypto as the first topic', async () => {
    const res = await onRequestGet(makeCtx(db))
    const topics = await res.json()
    expect(topics[0].topic_slug).toBe('crypto')
  })

  it('returns the required fields on each topic', async () => {
    const res = await onRequestGet(makeCtx(db))
    const topics = await res.json()
    for (const topic of topics) {
      expect(topic).toHaveProperty('topic_slug')
      expect(topic).toHaveProperty('display_name')
      expect(topic).toHaveProperty('description')
      expect(topic).toHaveProperty('sort_order')
    }
  })

  it('excludes inactive topics', async () => {
    db.seed('topics', [
      { topic_slug: 'crypto', display_name: 'Crypto', description: '', is_active: 1, sort_order: 1 },
      { topic_slug: 'archived', display_name: 'Archived', description: '', is_active: 0, sort_order: 99 }
    ])
    const res = await onRequestGet(makeCtx(db))
    const topics = await res.json()
    expect(topics).toHaveLength(1)
    expect(topics[0].topic_slug).toBe('crypto')
  })

  it('returns an empty array when no active topics exist', async () => {
    db.seed('topics', [
      { topic_slug: 'archived', display_name: 'Archived', description: '', is_active: 0, sort_order: 1 }
    ])
    const res = await onRequestGet(makeCtx(db))
    expect(res.status).toBe(200)
    const topics = await res.json()
    expect(topics).toHaveLength(0)
  })

  it('returns 503 when DB is not configured', async () => {
    const res = await onRequestGet({ env: {} })
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('returns a JSON Content-Type header', async () => {
    const res = await onRequestGet(makeCtx(db))
    expect(res.headers.get('Content-Type')).toContain('application/json')
  })
})
