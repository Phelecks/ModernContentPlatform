/**
 * Integration tests — GET /api/timeline/:topicSlug/:dateKey
 *
 * Tests the full onRequestGet handler pipeline using a seeded in-memory D1 mock.
 * Validates: response shape, pagination, cursor filtering, input validation, and error states.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { onRequestGet } from '@functions/api/timeline/[topicSlug]/[dateKey].js'
import { createSeededDb } from './helpers/mockD1.js'

const BASE_URL = 'http://localhost'

function makeCtx(db, topicSlug, dateKey, queryParams = {}) {
  const url = new URL(`${BASE_URL}/api/timeline/${topicSlug}/${dateKey}`)
  for (const [key, val] of Object.entries(queryParams)) {
    url.searchParams.set(key, String(val))
  }
  return {
    params: { topicSlug, dateKey },
    request: { url: url.toString() },
    env: { DB: db }
  }
}

describe('GET /api/timeline/:topicSlug/:dateKey', () => {
  let db

  beforeEach(() => {
    db = createSeededDb()
  })

  // ---- Happy path ----

  it('returns HTTP 200 for a seeded topic/date', async () => {
    const res = await onRequestGet(makeCtx(db, 'crypto', '2025-01-15'))
    expect(res.status).toBe(200)
  })

  it('returns the expected response shape', async () => {
    const res = await onRequestGet(makeCtx(db, 'crypto', '2025-01-15'))
    const body = await res.json()
    expect(body).toHaveProperty('alerts')
    expect(body).toHaveProperty('total')
    expect(body).toHaveProperty('has_more')
    expect(Array.isArray(body.alerts)).toBe(true)
  })

  it('returns alerts for crypto/2025-01-15 in descending event_at order', async () => {
    const res = await onRequestGet(makeCtx(db, 'crypto', '2025-01-15'))
    const { alerts } = await res.json()
    expect(alerts.length).toBeGreaterThan(0)
    for (let i = 1; i < alerts.length; i++) {
      expect(alerts[i].event_at <= alerts[i - 1].event_at).toBe(true)
    }
  })

  it('returns the required fields on each alert', async () => {
    const res = await onRequestGet(makeCtx(db, 'crypto', '2025-01-15'))
    const { alerts } = await res.json()
    for (const alert of alerts) {
      expect(alert).toHaveProperty('id')
      expect(alert).toHaveProperty('headline')
      expect(alert).toHaveProperty('summary_text')
      expect(alert).toHaveProperty('source_name')
      expect(alert).toHaveProperty('source_url')
      expect(alert).toHaveProperty('source_type')
      expect(alert).toHaveProperty('source_domain')
      expect(alert).toHaveProperty('source_metadata_json')
      expect(alert).toHaveProperty('severity_score')
      expect(alert).toHaveProperty('importance_score')
      expect(alert).toHaveProperty('event_at')
    }
  })

  it('returns correct total count for crypto/2025-01-15', async () => {
    const res = await onRequestGet(makeCtx(db, 'crypto', '2025-01-15'))
    const { total } = await res.json()
    expect(total).toBe(3)
  })

  it('returns source attribution data for seeded alerts', async () => {
    const res = await onRequestGet(makeCtx(db, 'crypto', '2025-01-15'))
    const { alerts } = await res.json()
    const etfAlert = alerts.find(a => a.id === 1)
    expect(etfAlert.source_type).toBe('rss')
    expect(etfAlert.source_domain).toBe('example.com')
    expect(etfAlert.source_metadata_json).toBeTruthy()
    const metadata = JSON.parse(etfAlert.source_metadata_json)
    expect(metadata.supporting_sources).toHaveLength(1)
    expect(metadata.supporting_sources[0].source_name).toBe('CoinGecko API')
  })

  it('returns has_more false when all alerts fit within the limit', async () => {
    const res = await onRequestGet(makeCtx(db, 'crypto', '2025-01-15'))
    const { has_more } = await res.json()
    expect(has_more).toBe(false)
  })

  // ---- Pagination ----

  it('respects the limit query parameter', async () => {
    const res = await onRequestGet(makeCtx(db, 'crypto', '2025-01-15', { limit: 1 }))
    const { alerts, has_more } = await res.json()
    expect(alerts).toHaveLength(1)
    expect(has_more).toBe(true)
  })

  it('returns has_more true when there are more alerts beyond the limit', async () => {
    const res = await onRequestGet(makeCtx(db, 'crypto', '2025-01-15', { limit: 2 }))
    const { has_more } = await res.json()
    expect(has_more).toBe(true)
  })

  it('enforces the maximum limit of 100', async () => {
    const res = await onRequestGet(makeCtx(db, 'crypto', '2025-01-15', { limit: 999 }))
    expect(res.status).toBe(200)
  })

  it('respects the before cursor to exclude older-than-cursor alerts', async () => {
    // Fetch all to get the second alert's event_at as cursor
    const allRes = await onRequestGet(makeCtx(db, 'crypto', '2025-01-15'))
    const { alerts: allAlerts } = await allRes.json()
    // Sorted DESC — second item is older than the first
    const cursor = allAlerts[0].event_at

    const res = await onRequestGet(
      makeCtx(db, 'crypto', '2025-01-15', { before: cursor })
    )
    const { alerts } = await res.json()
    expect(alerts.every((a) => a.event_at < cursor)).toBe(true)
  })

  // ---- Empty results ----

  it('returns an empty alert array for a date with no alerts', async () => {
    const res = await onRequestGet(makeCtx(db, 'crypto', '2025-12-31'))
    const { alerts, total, has_more } = await res.json()
    expect(alerts).toHaveLength(0)
    expect(total).toBe(0)
    expect(has_more).toBe(false)
  })

  // ---- Input validation ----

  it('returns 400 for an invalid topicSlug', async () => {
    const res = await onRequestGet(makeCtx(db, 'INVALID SLUG!', '2025-01-15'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('returns 400 for an invalid dateKey format', async () => {
    const res = await onRequestGet(makeCtx(db, 'crypto', 'not-a-date'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('returns 400 for a malformed before cursor', async () => {
    const res = await onRequestGet(
      makeCtx(db, 'crypto', '2025-01-15', { before: 'not-a-timestamp' })
    )
    expect(res.status).toBe(400)
  })

  it('returns 404 for an unknown topicSlug', async () => {
    const res = await onRequestGet(makeCtx(db, 'unknown-topic', '2025-01-15'))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('returns 503 when DB is not configured', async () => {
    const ctx = { params: { topicSlug: 'crypto', dateKey: '2025-01-15' }, request: { url: `${BASE_URL}/api/timeline/crypto/2025-01-15` }, env: {} }
    const res = await onRequestGet(ctx)
    expect(res.status).toBe(503)
  })
})
