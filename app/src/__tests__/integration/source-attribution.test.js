/**
 * Integration tests — source attribution end-to-end
 *
 * Verifies that source attribution is preserved from ingestion through
 * alerts, timeline API responses, daily summaries, and frontend rendering.
 *
 * Covered scenarios:
 *   1. Alert write — source attribution fields are accepted and validated
 *   2. Alert persistence — source_metadata_json round-trips correctly
 *   3. Timeline API — source attribution is present in every response
 *   4. Daily summary content model — article-level and key_event-level sources
 *   5. Classified alert fixture — source fields survive AI classification
 *   6. Frontend — AlertTimelineItem renders source attribution fields
 *   7. Frontend — SourceList renders summary source references
 *   8. Placeholder → ready state transition preserves source data
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'

import { onRequestPost } from '@functions/api/internal/alerts.js'
import { onRequestGet as timelineGet } from '@functions/api/timeline/[topicSlug]/[dateKey].js'

import { createSeededDb, MockD1Database } from './helpers/mockD1.js'
import AlertTimelineItem from '@/components/AlertTimelineItem.vue'
import SourceList from '@/components/SourceList.vue'
import TopicDayPage from '@/pages/TopicDayPage.vue'

import {
  CRYPTO_CLASSIFIED_ALERTS,
  CRYPTO_DAILY_SUMMARY,
  FINANCE_DAILY_SUMMARY
} from './helpers/fixtures.js'

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const WRITE_KEY = 'test-write-key-secret'

function postAlert(db, payload) {
  return onRequestPost({
    request: new Request('http://localhost/api/internal/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Write-Key': WRITE_KEY },
      body: JSON.stringify(payload)
    }),
    env: { DB: db, WRITE_API_KEY: WRITE_KEY }
  })
}

function timelineCtx(db, topicSlug, dateKey) {
  return {
    params: { topicSlug, dateKey },
    request: { url: `http://localhost/api/timeline/${topicSlug}/${dateKey}` },
    env: { DB: db }
  }
}

function baseAlertPayload(overrides = {}) {
  return {
    topic_slug: 'crypto',
    date_key: '2025-01-20',
    headline: 'Source Attribution Integration Test Alert',
    summary_text: 'Verifying source attribution is preserved from ingestion through storage and retrieval.',
    source_name: 'CryptoNews',
    source_url: 'https://example.com/source-test',
    severity_score: 55,
    importance_score: 70,
    confidence_score: 85,
    event_at: '2025-01-20T10:00:00Z',
    ...overrides
  }
}

// ---------------------------------------------------------------------------
// Section 1 — Alert write: source attribution fields accepted and validated
// ---------------------------------------------------------------------------

describe('Alert write — source attribution fields', () => {
  let db

  beforeEach(() => {
    db = createSeededDb()
  })

  it('accepts a primary source with source_type and source_domain', async () => {
    const res = await postAlert(db, baseAlertPayload({
      source_type: 'rss',
      source_domain: 'example.com'
    }))
    expect(res.status).toBe(201)
  })

  it('accepts all valid source_type values', async () => {
    const sourceTypes = ['rss', 'api', 'social', 'webhook', 'x_account', 'x_query']
    for (const source_type of sourceTypes) {
      const res = await postAlert(db, baseAlertPayload({ source_type }))
      expect(res.status).toBe(201)
    }
  })

  it('rejects an invalid source_type value', async () => {
    const res = await postAlert(db, baseAlertPayload({ source_type: 'unknown_type' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/source_type/i)
  })

  it('accepts an alert with supporting_sources array', async () => {
    const res = await postAlert(db, baseAlertPayload({
      source_type: 'rss',
      source_domain: 'example.com',
      supporting_sources: [
        {
          source_name: 'Bloomberg',
          source_url: 'https://bloomberg.com/article',
          source_type: 'api',
          source_role: 'confirmation'
        }
      ]
    }))
    expect(res.status).toBe(201)
  })

  it('accepts supporting_sources with up to 5 items', async () => {
    const sources = Array.from({ length: 5 }, (_, i) => ({
      source_name: `Source ${i + 1}`,
      source_url: `https://example.com/source-${i + 1}`,
      source_type: 'rss',
      source_role: 'confirmation'
    }))
    const res = await postAlert(db, baseAlertPayload({ supporting_sources: sources }))
    expect(res.status).toBe(201)
  })

  it('rejects supporting_sources with more than 5 items', async () => {
    const sources = Array.from({ length: 6 }, (_, i) => ({
      source_name: `Source ${i + 1}`
    }))
    const res = await postAlert(db, baseAlertPayload({ supporting_sources: sources }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/supporting_sources/i)
  })

  it('rejects a supporting source with a non-HTTP URL', async () => {
    const res = await postAlert(db, baseAlertPayload({
      supporting_sources: [
        { source_name: 'BadSource', source_url: 'ftp://example.com/data' }
      ]
    }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/source_url/i)
  })

  it('rejects a supporting source with unknown fields', async () => {
    const res = await postAlert(db, baseAlertPayload({
      supporting_sources: [
        { source_name: 'Source', source_url: 'https://example.com', extra_field: 'bad' }
      ]
    }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/unknown fields/i)
  })

  it('accepts null for source_type, source_domain, and supporting_sources', async () => {
    const res = await postAlert(db, baseAlertPayload({
      source_type: null,
      source_domain: null,
      supporting_sources: null
    }))
    expect(res.status).toBe(201)
  })

  it('accepts an alert with only a source_name (no source_url or source_type)', async () => {
    const res = await postAlert(db, {
      topic_slug: 'ai',
      date_key: '2025-01-20',
      headline: 'Minimal source attribution test',
      summary_text: 'Testing that source_name alone is sufficient.',
      source_name: 'InternalSignal',
      severity_score: 40,
      importance_score: 55,
      confidence_score: 70,
      event_at: '2025-01-20T08:00:00Z'
    })
    expect(res.status).toBe(201)
  })
})

// ---------------------------------------------------------------------------
// Section 2 — Alert persistence: source_metadata_json read-back
// ---------------------------------------------------------------------------

describe('Alert persistence — source_metadata_json serialization', () => {
  let db

  beforeEach(() => {
    // Use a fresh DB with a single alert that has supporting sources.
    db = new MockD1Database()
    db.seed('topics', [
      { topic_slug: 'crypto', display_name: 'Crypto', is_active: 1, sort_order: 1 }
    ])
    db.seed('alerts', [
      {
        id: 10,
        topic_slug: 'crypto',
        date_key: '2025-01-20',
        headline: 'BTC ETF inflows surge',
        summary_text: 'ETF products saw record inflows.',
        source_name: 'CryptoNews',
        source_url: 'https://example.com/btc-etf',
        source_type: 'rss',
        source_domain: 'example.com',
        source_metadata_json: JSON.stringify({
          supporting_sources: [
            {
              source_name: 'CoinGecko API',
              source_url: 'https://api.coingecko.com/api/v3/simple/price',
              source_type: 'api',
              source_role: 'data'
            },
            {
              source_name: 'OnChain Analytics',
              source_url: 'https://example.com/onchain',
              source_type: 'api',
              source_role: 'confirmation'
            }
          ]
        }),
        severity_score: 65,
        importance_score: 82,
        confidence_score: 90,
        status: 'active',
        event_at: '2025-01-20T14:00:00Z'
      },
      {
        id: 11,
        topic_slug: 'crypto',
        date_key: '2025-01-20',
        headline: 'Bitcoin briefly crosses $55,000',
        summary_text: 'Price action driven by ETF flows.',
        source_name: 'BlockDesk',
        source_url: 'https://example.com/btc-55k',
        source_type: 'rss',
        source_domain: 'example.com',
        source_metadata_json: null,
        severity_score: 50,
        importance_score: 70,
        confidence_score: 85,
        status: 'active',
        event_at: '2025-01-20T08:00:00Z'
      }
    ])
    db.seed('daily_status', [
      {
        topic_slug: 'crypto',
        date_key: '2025-01-20',
        page_state: 'ready',
        alert_count: 2,
        cluster_count: 1,
        summary_available: 0,
        video_available: 0,
        article_available: 0,
        published_at: null
      }
    ])
  })

  it('timeline returns source_metadata_json for an alert with supporting sources', async () => {
    const res = await timelineGet(timelineCtx(db, 'crypto', '2025-01-20'))
    expect(res.status).toBe(200)
    const { alerts } = await res.json()
    const alert = alerts.find(a => a.id === 10)
    expect(alert).toBeDefined()
    expect(alert.source_metadata_json).toBeTruthy()
  })

  it('source_metadata_json is valid JSON', async () => {
    const res = await timelineGet(timelineCtx(db, 'crypto', '2025-01-20'))
    const { alerts } = await res.json()
    const alert = alerts.find(a => a.id === 10)
    expect(() => JSON.parse(alert.source_metadata_json)).not.toThrow()
  })

  it('source_metadata_json contains a supporting_sources array', async () => {
    const res = await timelineGet(timelineCtx(db, 'crypto', '2025-01-20'))
    const { alerts } = await res.json()
    const alert = alerts.find(a => a.id === 10)
    const metadata = JSON.parse(alert.source_metadata_json)
    expect(Array.isArray(metadata.supporting_sources)).toBe(true)
    expect(metadata.supporting_sources).toHaveLength(2)
  })

  it('each supporting source in metadata has source_name, source_url, source_type, source_role', async () => {
    const res = await timelineGet(timelineCtx(db, 'crypto', '2025-01-20'))
    const { alerts } = await res.json()
    const alert = alerts.find(a => a.id === 10)
    const { supporting_sources } = JSON.parse(alert.source_metadata_json)
    for (const ss of supporting_sources) {
      expect(typeof ss.source_name).toBe('string')
      expect(ss.source_name.length).toBeGreaterThan(0)
      expect(typeof ss.source_url).toBe('string')
      expect(typeof ss.source_type).toBe('string')
      expect(typeof ss.source_role).toBe('string')
    }
  })

  it('timeline returns null source_metadata_json for an alert without supporting sources', async () => {
    const res = await timelineGet(timelineCtx(db, 'crypto', '2025-01-20'))
    const { alerts } = await res.json()
    const alert = alerts.find(a => a.id === 11)
    expect(alert).toBeDefined()
    expect(alert.source_metadata_json).toBeNull()
  })

  it('primary source fields (source_type, source_domain) are returned correctly', async () => {
    const res = await timelineGet(timelineCtx(db, 'crypto', '2025-01-20'))
    const { alerts } = await res.json()
    const alert = alerts.find(a => a.id === 10)
    expect(alert.source_type).toBe('rss')
    expect(alert.source_domain).toBe('example.com')
    expect(alert.source_name).toBe('CryptoNews')
    expect(alert.source_url).toBe('https://example.com/btc-etf')
  })
})

// ---------------------------------------------------------------------------
// Section 3 — Timeline API: source attribution data contract
// ---------------------------------------------------------------------------

describe('Timeline API — source attribution data contract', () => {
  let db

  beforeEach(() => {
    db = createSeededDb()
  })

  it('every returned alert has source_name, source_url, source_type, source_domain, source_metadata_json', async () => {
    const res = await timelineGet(timelineCtx(db, 'crypto', '2025-01-15'))
    const { alerts } = await res.json()
    expect(alerts.length).toBeGreaterThan(0)
    for (const alert of alerts) {
      expect(alert).toHaveProperty('source_name')
      expect(alert).toHaveProperty('source_url')
      expect(alert).toHaveProperty('source_type')
      expect(alert).toHaveProperty('source_domain')
      expect(alert).toHaveProperty('source_metadata_json')
    }
  })

  it('source_metadata_json is null or valid JSON on every alert', async () => {
    const res = await timelineGet(timelineCtx(db, 'crypto', '2025-01-15'))
    const { alerts } = await res.json()
    for (const alert of alerts) {
      if (alert.source_metadata_json !== null) {
        expect(() => JSON.parse(alert.source_metadata_json)).not.toThrow()
      }
    }
  })

  it('seeded alert with supporting sources preserves them in source_metadata_json', async () => {
    const res = await timelineGet(timelineCtx(db, 'crypto', '2025-01-15'))
    const { alerts } = await res.json()
    const etfAlert = alerts.find(a => a.id === 1)
    expect(etfAlert).toBeDefined()
    const metadata = JSON.parse(etfAlert.source_metadata_json)
    expect(Array.isArray(metadata.supporting_sources)).toBe(true)
    expect(metadata.supporting_sources[0].source_name).toBe('CoinGecko API')
    expect(metadata.supporting_sources[0].source_type).toBe('api')
    expect(metadata.supporting_sources[0].source_role).toBe('data')
  })

  it('source_type values in seeded data include rss, api, and social', async () => {
    const cryptoRes = await timelineGet(timelineCtx(db, 'crypto', '2025-01-15'))
    const financeRes = await timelineGet(timelineCtx(db, 'finance', '2025-01-15'))
    const aiRes = await timelineGet(timelineCtx(db, 'ai', '2025-01-15'))
    const [cryptoBody, financeBody, aiBody] = await Promise.all([
      cryptoRes.json(), financeRes.json(), aiRes.json()
    ])
    const allAlerts = [
      ...cryptoBody.alerts,
      ...financeBody.alerts,
      ...aiBody.alerts
    ]
    const seenTypes = new Set(allAlerts.map(a => a.source_type).filter(Boolean))
    expect(seenTypes.has('rss')).toBe(true)
    expect(seenTypes.has('api')).toBe(true)
    expect(seenTypes.has('social')).toBe(true)
  })

  it('source attribution fields are present even when before cursor is used', async () => {
    const allRes = await timelineGet(timelineCtx(db, 'crypto', '2025-01-15'))
    const { alerts: allAlerts } = await allRes.json()
    const cursor = allAlerts[0].event_at
    const res = await timelineGet({
      params: { topicSlug: 'crypto', dateKey: '2025-01-15' },
      request: { url: `http://localhost/api/timeline/crypto/2025-01-15?before=${encodeURIComponent(cursor)}` },
      env: { DB: db }
    })
    const { alerts } = await res.json()
    expect(alerts.length).toBeGreaterThan(0)
    for (const alert of alerts) {
      expect(alert).toHaveProperty('source_type')
      expect(alert).toHaveProperty('source_domain')
      expect(alert).toHaveProperty('source_metadata_json')
    }
  })
})

// ---------------------------------------------------------------------------
// Section 4 — Daily summary content model: source references
// ---------------------------------------------------------------------------

describe('Daily summary content model — source references', () => {
  it('crypto summary has a top-level sources array', () => {
    expect(Array.isArray(CRYPTO_DAILY_SUMMARY.sources)).toBe(true)
    expect(CRYPTO_DAILY_SUMMARY.sources.length).toBeGreaterThanOrEqual(1)
  })

  it('each crypto summary source has source_name, source_url, and source_role', () => {
    for (const src of CRYPTO_DAILY_SUMMARY.sources) {
      expect(typeof src.source_name).toBe('string')
      expect(src.source_name.length).toBeGreaterThan(0)
      expect(typeof src.source_url).toBe('string')
      expect(typeof src.source_role).toBe('string')
    }
  })

  it('crypto summary has a source_confidence_note', () => {
    expect(typeof CRYPTO_DAILY_SUMMARY.source_confidence_note).toBe('string')
    expect(CRYPTO_DAILY_SUMMARY.source_confidence_note.length).toBeGreaterThan(0)
  })

  it('each key_event in crypto summary has a section-level sources array', () => {
    expect(Array.isArray(CRYPTO_DAILY_SUMMARY.key_events)).toBe(true)
    for (const event of CRYPTO_DAILY_SUMMARY.key_events) {
      expect(Array.isArray(event.sources)).toBe(true)
      expect(event.sources.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('each key_event source has at minimum a source_name', () => {
    for (const event of CRYPTO_DAILY_SUMMARY.key_events) {
      for (const src of event.sources) {
        expect(typeof src.source_name).toBe('string')
        expect(src.source_name.length).toBeGreaterThan(0)
      }
    }
  })

  it('finance summary has a top-level sources array', () => {
    expect(Array.isArray(FINANCE_DAILY_SUMMARY.sources)).toBe(true)
    expect(FINANCE_DAILY_SUMMARY.sources.length).toBeGreaterThanOrEqual(1)
  })

  it('finance summary key_events have section-level sources', () => {
    for (const event of FINANCE_DAILY_SUMMARY.key_events) {
      expect(Array.isArray(event.sources)).toBe(true)
      expect(event.sources.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('summary source_url values are HTTP or HTTPS', () => {
    for (const src of CRYPTO_DAILY_SUMMARY.sources) {
      if (src.source_url) {
        expect(src.source_url).toMatch(/^https?:\/\//)
      }
    }
  })

  it('summary key_event source_url values are HTTP or HTTPS', () => {
    for (const event of CRYPTO_DAILY_SUMMARY.key_events) {
      for (const src of event.sources) {
        if (src.source_url) {
          expect(src.source_url).toMatch(/^https?:\/\//)
        }
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Section 5 — Classified alert fixture: source fields survive AI classification
// ---------------------------------------------------------------------------

describe('Classified alert fixture — source fields preserved', () => {
  it('classified alerts array is non-empty', () => {
    expect(Array.isArray(CRYPTO_CLASSIFIED_ALERTS)).toBe(true)
    expect(CRYPTO_CLASSIFIED_ALERTS.length).toBeGreaterThan(0)
  })

  it('every classified alert has source_name, source_url, source_type, source_domain', () => {
    for (const alert of CRYPTO_CLASSIFIED_ALERTS) {
      expect(typeof alert.source_name).toBe('string')
      expect(alert.source_name.length).toBeGreaterThan(0)
      expect(typeof alert.source_url).toBe('string')
      expect(typeof alert.source_type).toBe('string')
      expect(typeof alert.source_domain).toBe('string')
    }
  })

  it('the BTC ETF classified alert has a supporting_sources array', () => {
    const etfAlert = CRYPTO_CLASSIFIED_ALERTS.find(a =>
      a.headline.toLowerCase().includes('etf') && a.source_name === 'CryptoNews'
    )
    expect(etfAlert).toBeDefined()
    expect(Array.isArray(etfAlert.supporting_sources)).toBe(true)
    expect(etfAlert.supporting_sources.length).toBeGreaterThan(0)
  })

  it('supporting source in classified alert has source_name, source_url, source_type, source_role', () => {
    const etfAlert = CRYPTO_CLASSIFIED_ALERTS.find(a =>
      Array.isArray(a.supporting_sources) && a.supporting_sources.length > 0
    )
    expect(etfAlert).toBeDefined()
    const ss = etfAlert.supporting_sources[0]
    expect(typeof ss.source_name).toBe('string')
    expect(typeof ss.source_url).toBe('string')
    expect(typeof ss.source_type).toBe('string')
    expect(typeof ss.source_role).toBe('string')
  })

  it('classified alerts without supporting sources have null for supporting_sources', () => {
    const nullSrcAlerts = CRYPTO_CLASSIFIED_ALERTS.filter(a => a.supporting_sources === null)
    expect(nullSrcAlerts.length).toBeGreaterThan(0)
  })

  it('source_url values in classified alerts are HTTP or HTTPS', () => {
    for (const alert of CRYPTO_CLASSIFIED_ALERTS) {
      if (alert.source_url) {
        expect(alert.source_url).toMatch(/^https?:\/\//)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Section 6 — Frontend: AlertTimelineItem source attribution rendering
// ---------------------------------------------------------------------------

describe('AlertTimelineItem — source attribution rendering', () => {
  // baseAlert mirrors the shape returned by /api/timeline: source attribution
  // is carried in source_type, source_domain, and source_metadata_json (a JSON
  // string), NOT in a pre-parsed supporting_sources array.
  const baseAlert = {
    id: 1,
    headline: 'BTC ETF inflows hit record',
    summary_text: 'Record single-day inflows recorded.',
    source_name: 'CryptoNews',
    source_url: 'https://example.com/btc-etf',
    source_type: 'rss',
    source_domain: 'example.com',
    source_metadata_json: null,
    severity_score: 60,
    importance_score: 82,
    confidence_score: 90,
    event_at: '2025-01-15T14:30:00Z'
  }

  it('renders a source type badge when source_type is provided', () => {
    const wrapper = mount(AlertTimelineItem, { props: { alert: baseAlert } })
    expect(wrapper.find('.alert-timeline-item__type-badge').exists()).toBe(true)
  })

  it('does not render a source type badge when source_type is absent', () => {
    const wrapper = mount(AlertTimelineItem, {
      props: { alert: { ...baseAlert, source_type: undefined } }
    })
    expect(wrapper.find('.alert-timeline-item__type-badge').exists()).toBe(false)
  })

  it('does not render a source type badge when source_type is null', () => {
    const wrapper = mount(AlertTimelineItem, {
      props: { alert: { ...baseAlert, source_type: null } }
    })
    expect(wrapper.find('.alert-timeline-item__type-badge').exists()).toBe(false)
  })

  it('renders supporting sources section when source_metadata_json contains supporting_sources', () => {
    const wrapper = mount(AlertTimelineItem, {
      props: {
        alert: {
          ...baseAlert,
          source_metadata_json: JSON.stringify({
            supporting_sources: [
              {
                source_name: 'CoinGecko API',
                source_url: 'https://api.coingecko.com',
                source_type: 'api',
                source_role: 'data'
              }
            ]
          })
        }
      }
    })
    expect(wrapper.find('.alert-timeline-item__supporting').exists()).toBe(true)
  })

  it('renders all supporting source entries parsed from source_metadata_json', () => {
    const wrapper = mount(AlertTimelineItem, {
      props: {
        alert: {
          ...baseAlert,
          source_metadata_json: JSON.stringify({
            supporting_sources: [
              { source_name: 'Source A', source_url: 'https://a.example.com', source_type: 'rss', source_role: 'primary' },
              { source_name: 'Source B', source_url: 'https://b.example.com', source_type: 'api', source_role: 'data' }
            ]
          })
        }
      }
    })
    const items = wrapper.findAll('.alert-timeline-item__supporting-source')
    expect(items).toHaveLength(2)
  })

  it('renders supporting source links as external links from source_metadata_json', () => {
    const wrapper = mount(AlertTimelineItem, {
      props: {
        alert: {
          ...baseAlert,
          source_metadata_json: JSON.stringify({
            supporting_sources: [
              { source_name: 'CoinGecko API', source_url: 'https://api.coingecko.com', source_type: 'api' }
            ]
          })
        }
      }
    })
    const link = wrapper.find('.alert-timeline-item__supporting-link')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('https://api.coingecko.com')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toBe('noopener noreferrer')
  })

  it('does not render supporting sources section when source_metadata_json is null', () => {
    const wrapper = mount(AlertTimelineItem, {
      props: { alert: { ...baseAlert, source_metadata_json: null } }
    })
    expect(wrapper.find('.alert-timeline-item__supporting').exists()).toBe(false)
  })

  it('does not render supporting sources section when source_metadata_json has empty supporting_sources', () => {
    const wrapper = mount(AlertTimelineItem, {
      props: {
        alert: {
          ...baseAlert,
          source_metadata_json: JSON.stringify({ supporting_sources: [] })
        }
      }
    })
    expect(wrapper.find('.alert-timeline-item__supporting').exists()).toBe(false)
  })

  it('renders a supporting source without a URL as plain text from source_metadata_json', () => {
    const wrapper = mount(AlertTimelineItem, {
      props: {
        alert: {
          ...baseAlert,
          source_metadata_json: JSON.stringify({
            supporting_sources: [
              { source_name: 'Internal Signal', source_url: null, source_type: 'api' }
            ]
          })
        }
      }
    })
    expect(wrapper.find('.alert-timeline-item__supporting-link').exists()).toBe(false)
    expect(wrapper.text()).toContain('Internal Signal')
  })
})

// ---------------------------------------------------------------------------
// Section 7 — Frontend: SourceList summary source attribution rendering
// ---------------------------------------------------------------------------

describe('SourceList — summary source attribution rendering', () => {
  const summarySources = [
    {
      source_name: 'CryptoNews',
      source_url: 'https://example.com/crypto/btc-etf-inflows',
      source_type: 'rss',
      source_role: 'primary'
    },
    {
      source_name: 'CoinGecko API',
      source_url: 'https://api.coingecko.com/api/v3/simple/price',
      source_type: 'api',
      source_role: 'data'
    },
    {
      source_name: 'InternalAnalysis',
      source_url: null,
      source_role: 'analysis'
    }
  ]

  const confidenceNote = 'High confidence: multiple specialist outlets corroborated by real-time market data.'

  it('renders one list item per summary source', () => {
    const wrapper = mount(SourceList, { props: { sources: summarySources } })
    expect(wrapper.findAll('.source-list__item')).toHaveLength(3)
  })

  it('renders source names', () => {
    const wrapper = mount(SourceList, { props: { sources: summarySources } })
    expect(wrapper.text()).toContain('CryptoNews')
    expect(wrapper.text()).toContain('CoinGecko API')
    expect(wrapper.text()).toContain('InternalAnalysis')
  })

  it('renders source role labels', () => {
    const wrapper = mount(SourceList, { props: { sources: summarySources } })
    expect(wrapper.text()).toContain('primary')
    expect(wrapper.text()).toContain('data')
    expect(wrapper.text()).toContain('analysis')
  })

  it('renders clickable links for sources with URLs', () => {
    const wrapper = mount(SourceList, { props: { sources: summarySources } })
    const links = wrapper.findAll('.source-list__link')
    expect(links.length).toBe(2)
    expect(links[0].attributes('href')).toBe('https://example.com/crypto/btc-etf-inflows')
    expect(links[1].attributes('href')).toBe('https://api.coingecko.com/api/v3/simple/price')
  })

  it('renders plain text for sources without a URL', () => {
    const wrapper = mount(SourceList, { props: { sources: summarySources } })
    expect(wrapper.find('.source-list__name').exists()).toBe(true)
    expect(wrapper.find('.source-list__name').text()).toBe('InternalAnalysis')
  })

  it('renders the confidence note when provided', () => {
    const wrapper = mount(SourceList, {
      props: { sources: summarySources, confidenceNote }
    })
    expect(wrapper.find('.source-list__confidence').text()).toBe(confidenceNote)
  })

  it('renders source type badges for sources with source_type', () => {
    const wrapper = mount(SourceList, { props: { sources: summarySources } })
    // SourceBadge is rendered inside each item that has source_type
    const badges = wrapper.findAll('.source-badge')
    expect(badges.length).toBeGreaterThanOrEqual(2)
  })

  it('renders sources from the crypto daily summary fixture correctly', () => {
    const wrapper = mount(SourceList, {
      props: {
        sources: CRYPTO_DAILY_SUMMARY.sources,
        confidenceNote: CRYPTO_DAILY_SUMMARY.source_confidence_note
      }
    })
    expect(wrapper.find('.source-list').exists()).toBe(true)
    expect(wrapper.find('.source-list__confidence').exists()).toBe(true)
    expect(wrapper.findAll('.source-list__item').length).toBe(CRYPTO_DAILY_SUMMARY.sources.length)
  })
})

// ---------------------------------------------------------------------------
// Section 8 — Placeholder → ready state transition preserves source data
// ---------------------------------------------------------------------------

describe('Placeholder → ready state transition — source data preserved', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  const TIMELINE_WITH_SOURCES = {
    alerts: [
      {
        id: 1,
        headline: 'Spot Bitcoin ETFs record $500M inflows',
        summary_text: 'Record inflows.',
        source_name: 'CryptoNews',
        source_url: 'https://example.com/btc-etf-inflows',
        source_type: 'rss',
        source_domain: 'example.com',
        source_metadata_json: JSON.stringify({
          supporting_sources: [
            {
              source_name: 'CoinGecko API',
              source_url: 'https://api.coingecko.com',
              source_type: 'api',
              source_role: 'data'
            }
          ]
        }),
        severity_score: 60,
        importance_score: 82,
        confidence_score: 90,
        event_at: '2025-01-15T14:30:00Z'
      }
    ],
    total: 1,
    has_more: false
  }

  const NAV_RESPONSE = { prev_date_key: null, next_date_key: null }

  const PENDING_STATUS = {
    topic_slug: 'crypto',
    date_key: '2025-01-15',
    page_state: 'pending',
    display_name: 'Crypto',
    alert_count: 1,
    cluster_count: 1,
    summary_available: 0,
    video_available: 0,
    article_available: 0,
    prev_date_key: null,
    next_date_key: null,
    published_at: null
  }

  const READY_STATUS = {
    ...PENDING_STATUS,
    page_state: 'ready',
    summary_available: 1,
    article_available: 1
  }

  function buildFetch(status, articleText = null) {
    return vi.fn((url) => {
      if (url.includes('/api/day-status/')) {
        return Promise.resolve(new Response(JSON.stringify(status), {
          status: 200, headers: { 'Content-Type': 'application/json' }
        }))
      }
      if (url.includes('/api/navigation/')) {
        return Promise.resolve(new Response(JSON.stringify(NAV_RESPONSE), {
          status: 200, headers: { 'Content-Type': 'application/json' }
        }))
      }
      if (url.includes('/api/timeline/')) {
        return Promise.resolve(new Response(JSON.stringify(TIMELINE_WITH_SOURCES), {
          status: 200, headers: { 'Content-Type': 'application/json' }
        }))
      }
      if (url.endsWith('/article.md')) {
        if (articleText) {
          return Promise.resolve(new Response(articleText, { status: 200 }))
        }
        return Promise.resolve(new Response('', { status: 404 }))
      }
      return Promise.resolve(new Response('Not Found', { status: 404 }))
    })
  }

  async function mountTopicDayPage(topicSlug = 'crypto', dateKey = '2025-01-15') {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/topics/:topicSlug/:dateKey', component: TopicDayPage },
        { path: '/topics/:topicSlug', component: { template: '<div />' } }
      ]
    })
    await router.push(`/topics/${topicSlug}/${dateKey}`)
    await router.isReady()
    return mount(TopicDayPage, { global: { plugins: [router] } })
  }

  it('timeline is shown with source data in pending (placeholder) state', async () => {
    vi.stubGlobal('fetch', buildFetch(PENDING_STATUS))
    const wrapper = await mountTopicDayPage()
    await flushPromises()
    // Alert timeline renders even when the summary is not ready
    expect(wrapper.find('.alert-timeline').exists()).toBe(true)
    expect(wrapper.find('.summary-placeholder').exists()).toBe(true)
  })

  it('timeline is shown with source data in ready state', async () => {
    vi.stubGlobal('fetch', buildFetch(READY_STATUS, '# Crypto Report\n\nSome content.'))
    const wrapper = await mountTopicDayPage()
    await flushPromises()
    expect(wrapper.find('.alert-timeline').exists()).toBe(true)
    expect(wrapper.find('.summary-section').exists()).toBe(true)
  })

  it('timeline fetch is called with topic/date path in pending state', async () => {
    const fetchMock = buildFetch(PENDING_STATUS)
    vi.stubGlobal('fetch', fetchMock)
    await mountTopicDayPage('crypto', '2025-01-15')
    await flushPromises()
    const timelineCalls = fetchMock.mock.calls.filter(([url]) =>
      url.includes('/api/timeline/crypto/2025-01-15')
    )
    expect(timelineCalls.length).toBeGreaterThan(0)
  })

  it('timeline fetch is called with topic/date path in ready state', async () => {
    const fetchMock = buildFetch(READY_STATUS, '# Crypto\nContent.')
    vi.stubGlobal('fetch', fetchMock)
    await mountTopicDayPage('crypto', '2025-01-15')
    await flushPromises()
    const timelineCalls = fetchMock.mock.calls.filter(([url]) =>
      url.includes('/api/timeline/crypto/2025-01-15')
    )
    expect(timelineCalls.length).toBeGreaterThan(0)
  })

  it('source attribution fields are preserved by the mounted timeline in both pending and ready states', async () => {
    const expectedAlert = TIMELINE_WITH_SOURCES.alerts[0]

    const assertRenderedAlertSourceData = (wrapper) => {
      expect(wrapper.find('.alert-timeline').exists()).toBe(true)
      const timelineItem = wrapper.findComponent(AlertTimelineItem)
      expect(timelineItem.exists()).toBe(true)

      const renderedAlert = timelineItem.props('alert')
      expect(renderedAlert).toBeTruthy()
      expect(renderedAlert.source_name).toBe(expectedAlert.source_name)
      expect(renderedAlert.source_url).toBe(expectedAlert.source_url)
      expect(renderedAlert.source_type).toBe(expectedAlert.source_type)
      expect(renderedAlert.source_domain).toBe(expectedAlert.source_domain)
      expect(renderedAlert.source_metadata_json).toBe(expectedAlert.source_metadata_json)

      const metadata = JSON.parse(renderedAlert.source_metadata_json)
      expect(Array.isArray(metadata.supporting_sources)).toBe(true)
      expect(metadata.supporting_sources[0].source_name).toBe('CoinGecko API')
    }

    vi.stubGlobal('fetch', buildFetch(PENDING_STATUS))
    const pendingWrapper = await mountTopicDayPage()
    await flushPromises()
    assertRenderedAlertSourceData(pendingWrapper)
    expect(pendingWrapper.find('.summary-placeholder').exists()).toBe(true)

    vi.stubGlobal('fetch', buildFetch(READY_STATUS, '# Crypto Report\n\nSome content.'))
    const readyWrapper = await mountTopicDayPage()
    await flushPromises()
    assertRenderedAlertSourceData(readyWrapper)
    expect(readyWrapper.find('.summary-section').exists()).toBe(true)
  })
})
