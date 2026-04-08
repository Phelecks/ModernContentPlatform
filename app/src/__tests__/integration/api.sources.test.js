/**
 * Integration tests — GET /api/sources
 *
 * Tests the source registry read endpoint using a seeded in-memory D1 mock.
 * Validates: response shape, topic filtering, active-only filtering,
 * invalid parameter handling, and error states.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { onRequestGet } from '@functions/api/sources/index.js'
import { createSeededDb } from './helpers/mockD1.js'

function makeCtx(db, queryParams = {}) {
  const url = new URL('http://localhost/api/sources')
  for (const [key, val] of Object.entries(queryParams)) {
    url.searchParams.set(key, String(val))
  }
  return {
    request: new Request(url.toString()),
    env: { DB: db }
  }
}

describe('GET /api/sources', () => {
  let db

  beforeEach(() => {
    db = createSeededDb()
    db.seed('sources', [
      {
        id: 1,
        source_slug: 'coindesk-rss',
        source_name: 'CoinDesk RSS',
        topic_slug: 'crypto',
        source_type: 'rss',
        trust_tier: 'T3',
        trust_score: 50,
        priority_weight: 70,
        url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
        is_active: 1,
        poll_interval_minutes: 15,
        ingestion_method: 'poll'
      },
      {
        id: 2,
        source_slug: 'reuters-crypto-rss',
        source_name: 'Reuters Crypto RSS',
        topic_slug: 'crypto',
        source_type: 'rss',
        trust_tier: 'T2',
        trust_score: 75,
        priority_weight: 80,
        url: 'https://feeds.reuters.com/reuters/technologyNews',
        is_active: 1,
        poll_interval_minutes: 15,
        ingestion_method: 'poll'
      },
      {
        id: 3,
        source_slug: 'who-news-rss',
        source_name: 'WHO News RSS',
        topic_slug: 'health',
        source_type: 'rss',
        trust_tier: 'T1',
        trust_score: 90,
        priority_weight: 90,
        url: 'https://www.who.int/rss-feeds/news-english.xml',
        is_active: 1,
        poll_interval_minutes: 30,
        ingestion_method: 'poll'
      },
      {
        id: 4,
        source_slug: 'disabled-source',
        source_name: 'Disabled Source',
        topic_slug: 'crypto',
        source_type: 'rss',
        trust_tier: 'T3',
        trust_score: 50,
        priority_weight: 40,
        url: 'https://example.com/disabled',
        is_active: 0,
        poll_interval_minutes: 15,
        ingestion_method: 'poll'
      }
    ])
  })

  // --- Happy path ---

  it('returns HTTP 200 with an array', async () => {
    const res = await onRequestGet(makeCtx(db))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
  })

  it('returns only active sources (is_active=1)', async () => {
    const res = await onRequestGet(makeCtx(db))
    const sources = await res.json()
    expect(sources).toHaveLength(3)
    for (const source of sources) {
      expect(source.source_slug).not.toBe('disabled-source')
    }
  })

  it('returns the expected fields on each source', async () => {
    const res = await onRequestGet(makeCtx(db))
    const sources = await res.json()
    for (const source of sources) {
      expect(source).toHaveProperty('source_slug')
      expect(source).toHaveProperty('source_name')
      expect(source).toHaveProperty('topic_slug')
      expect(source).toHaveProperty('source_type')
      expect(source).toHaveProperty('trust_tier')
      expect(source).toHaveProperty('trust_score')
      expect(source).toHaveProperty('priority_weight')
      expect(source).toHaveProperty('url')
      expect(source).toHaveProperty('poll_interval_minutes')
      expect(source).toHaveProperty('ingestion_method')
    }
  })

  it('returns a JSON Content-Type header', async () => {
    const res = await onRequestGet(makeCtx(db))
    expect(res.headers.get('Content-Type')).toContain('application/json')
  })

  // --- Topic filter ---

  it('returns only sources for the specified topic', async () => {
    const res = await onRequestGet(makeCtx(db, { topic: 'crypto' }))
    const sources = await res.json()
    expect(sources).toHaveLength(2)
    for (const source of sources) {
      expect(source.topic_slug).toBe('crypto')
    }
  })

  it('returns only health sources when topic=health', async () => {
    const res = await onRequestGet(makeCtx(db, { topic: 'health' }))
    const sources = await res.json()
    expect(sources).toHaveLength(1)
    expect(sources[0].source_slug).toBe('who-news-rss')
  })

  it('returns empty array for a valid topic with no sources', async () => {
    const res = await onRequestGet(makeCtx(db, { topic: 'energy' }))
    expect(res.status).toBe(200)
    const sources = await res.json()
    expect(sources).toHaveLength(0)
  })

  // --- Validation ---

  it('returns 400 for an invalid topic parameter', async () => {
    const res = await onRequestGet(makeCtx(db, { topic: 'INVALID!' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  // --- Error states ---

  it('returns 503 when DB is not configured', async () => {
    const res = await onRequestGet({ request: new Request('http://localhost/api/sources'), env: {} })
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('returns an empty array when no sources exist', async () => {
    db.seed('sources', [])
    const res = await onRequestGet(makeCtx(db))
    expect(res.status).toBe(200)
    const sources = await res.json()
    expect(sources).toHaveLength(0)
  })
})
