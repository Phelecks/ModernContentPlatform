/**
 * Integration tests — source ingestion and normalization flow
 *
 * Verifies that source items from all configured source types normalize
 * correctly into the intraday_normalized_item contract and that the source
 * registry behaves as expected across topics and trust tiers.
 *
 * Covered scenarios:
 *   - news item (RSS, T2/T3) normalization
 *   - official source (RSS, T1) normalization with trust propagation
 *   - X account item (x_account, T4) normalization
 *   - X query item (x_query, T4) normalization
 *   - generic API source normalization
 *   - item_id determinism and format
 *   - HTML stripping from title and body
 *   - topic candidate detection for all platform topics
 *   - trust field coercion (decimal truncation, clamping, null handling)
 *   - headline validation (items with short headlines are discarded)
 *   - published_at fallback to fetched_at
 *   - source registry lookup: topic filtering, active-only, trust fields
 *   - source registry X source type registration and retrieval
 *   - downstream contract compatibility (all required fields present)
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { normalizeItem, computeItemId, stripHtml, detectTopicCandidates } from '@functions/lib/normalizeItem.js'
import { onRequestGet } from '@functions/api/sources/index.js'
import { onRequestPost as onRequestPostSource } from '@functions/api/internal/sources.js'
import { createSeededDb } from './helpers/mockD1.js'
import {
  CRYPTO_SOURCE_EVENT_BTC_ETF,
  FINANCE_SOURCE_EVENT_FED_MINUTES,
  AI_SOURCE_EVENT_OPEN_WEIGHT_MODEL,
  CRYPTO_SOURCE_EVENT_X_WHALE_ALERT,
  ECONOMY_SOURCE_EVENT_BLS_CPI,
  CRYPTO_SOURCE_EVENT_X_QUERY_BTC,
  ECONOMY_NORMALIZED_ITEM_BLS_CPI,
  CRYPTO_NORMALIZED_ITEM_X_QUERY_BTC
} from './helpers/fixtures.js'

const WRITE_KEY = 'test-write-key-secret'

// ---- Helpers ----------------------------------------------------------------

/** Build a POST context for the internal sources endpoint. */
function makeSourceCtx(db, body) {
  return {
    request: new Request('http://localhost/api/internal/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Write-Key': WRITE_KEY },
      body: JSON.stringify(body)
    }),
    env: { DB: db, WRITE_API_KEY: WRITE_KEY }
  }
}

/** Build a GET context for the public sources endpoint. */
function makeSourcesGetCtx(db, queryParams = {}) {
  const url = new URL('http://localhost/api/sources')
  for (const [key, val] of Object.entries(queryParams)) {
    url.searchParams.set(key, String(val))
  }
  return { request: new Request(url.toString()), env: { DB: db } }
}

/** Return a minimal valid source registry payload. */
function sourcePayload(overrides = {}) {
  return {
    source_slug: 'test-source',
    source_name: 'Test Source',
    topic_slug: 'crypto',
    source_type: 'rss',
    trust_tier: 'T3',
    trust_score: 50,
    priority_weight: 60,
    url: 'https://example.com/rss',
    is_active: 1,
    poll_interval_minutes: 15,
    ingestion_method: 'poll',
    ...overrides
  }
}

// ---- normalizeItem — news RSS item ------------------------------------------

describe('normalizeItem — news RSS item', () => {
  it('produces a normalized item from a crypto RSS source event', () => {
    const result = normalizeItem(CRYPTO_SOURCE_EVENT_BTC_ETF)
    expect(result).not.toBeNull()
    expect(result.source_id).toBe(CRYPTO_SOURCE_EVENT_BTC_ETF.source_id)
    expect(result.source_name).toBe('CryptoNews')
    expect(result.source_type).toBe('rss')
    expect(result.headline).toBeTypeOf('string')
    expect(result.headline.length).toBeGreaterThan(0)
    expect(result.is_duplicate).toBe(false)
  })

  it('detects crypto and finance topic candidates for BTC ETF news', () => {
    const result = normalizeItem(CRYPTO_SOURCE_EVENT_BTC_ETF)
    expect(result.topic_candidates).toContain('crypto')
    expect(result.topic_candidates).toContain('finance')
  })

  it('sets published_at from the source event timestamp', () => {
    const result = normalizeItem(CRYPTO_SOURCE_EVENT_BTC_ETF)
    expect(result.published_at).toBe('2025-01-15T14:00:00.000Z')
  })

  it('preserves source_url from the source event', () => {
    const result = normalizeItem(CRYPTO_SOURCE_EVENT_BTC_ETF)
    expect(result.source_url).toBe(CRYPTO_SOURCE_EVENT_BTC_ETF.source_url)
  })

  it('detects finance and economy topic candidates for Fed minutes news', () => {
    const result = normalizeItem(FINANCE_SOURCE_EVENT_FED_MINUTES)
    expect(result.topic_candidates).toContain('finance')
    expect(result.topic_candidates).toContain('economy')
  })

  it('detects ai topic candidate for an open-weight AI model release', () => {
    const result = normalizeItem(AI_SOURCE_EVENT_OPEN_WEIGHT_MODEL)
    expect(result).not.toBeNull()
    expect(result.source_type).toBe('rss')
    expect(result.topic_candidates).toContain('ai')
  })
})

// ---- normalizeItem — official source (T1) -----------------------------------

describe('normalizeItem — official T1 source', () => {
  it('normalizes the BLS CPI official RSS source event', () => {
    const result = normalizeItem(ECONOMY_SOURCE_EVENT_BLS_CPI)
    expect(result).not.toBeNull()
    expect(result.source_id).toBe(ECONOMY_SOURCE_EVENT_BLS_CPI.source_id)
    expect(result.source_name).toBe('BLS News RSS')
    expect(result.source_type).toBe('rss')
    expect(result.source_slug).toBe('bls-rss')
  })

  it('propagates T1 trust_tier from the source event', () => {
    const result = normalizeItem(ECONOMY_SOURCE_EVENT_BLS_CPI)
    expect(result.trust_tier).toBe('T1')
  })

  it('propagates trust_score 90 from the T1 official source', () => {
    const result = normalizeItem(ECONOMY_SOURCE_EVENT_BLS_CPI)
    expect(result.trust_score).toBe(90)
  })

  it('detects economy topic candidate for CPI news', () => {
    const result = normalizeItem(ECONOMY_SOURCE_EVENT_BLS_CPI)
    expect(result.topic_candidates).toContain('economy')
  })

  it('sets author to null for official sources that omit it', () => {
    const result = normalizeItem(ECONOMY_SOURCE_EVENT_BLS_CPI)
    expect(result.author).toBeNull()
  })

  it('item_id matches the expected SHA-256 for the BLS source event', () => {
    const result = normalizeItem(ECONOMY_SOURCE_EVENT_BLS_CPI)
    expect(result.item_id).toBe(ECONOMY_NORMALIZED_ITEM_BLS_CPI.item_id)
  })

  it('normalized output matches the expected fixture shape', () => {
    const result = normalizeItem(ECONOMY_SOURCE_EVENT_BLS_CPI)
    expect(result.headline).toBe(ECONOMY_NORMALIZED_ITEM_BLS_CPI.headline)
    expect(result.source_slug).toBe(ECONOMY_NORMALIZED_ITEM_BLS_CPI.source_slug)
    expect(result.trust_tier).toBe(ECONOMY_NORMALIZED_ITEM_BLS_CPI.trust_tier)
    expect(result.trust_score).toBe(ECONOMY_NORMALIZED_ITEM_BLS_CPI.trust_score)
    expect(result.is_duplicate).toBe(false)
  })
})

// ---- normalizeItem — X account item (x_account) ----------------------------

describe('normalizeItem — X account item', () => {
  it('normalizes the Whale Alert X account source event', () => {
    const result = normalizeItem(CRYPTO_SOURCE_EVENT_X_WHALE_ALERT)
    expect(result).not.toBeNull()
    expect(result.source_id).toBe('x-1879012345678901234')
    expect(result.source_type).toBe('x_account')
  })

  it('uses the tweet text as the headline', () => {
    const result = normalizeItem(CRYPTO_SOURCE_EVENT_X_WHALE_ALERT)
    expect(result.headline).toContain('BTC')
    expect(result.headline).toContain('transferred')
  })

  it('sets body to null for X items that have no body', () => {
    const result = normalizeItem(CRYPTO_SOURCE_EVENT_X_WHALE_ALERT)
    expect(result.body).toBeNull()
  })

  it('sets source_url to the X status link', () => {
    const result = normalizeItem(CRYPTO_SOURCE_EVENT_X_WHALE_ALERT)
    expect(result.source_url).toMatch(/x\.com/)
  })

  it('detects crypto topic candidates for a BTC transfer tweet', () => {
    const result = normalizeItem(CRYPTO_SOURCE_EVENT_X_WHALE_ALERT)
    expect(result.topic_candidates).toContain('crypto')
  })

  it('preserves is_duplicate as false on ingestion', () => {
    const result = normalizeItem(CRYPTO_SOURCE_EVENT_X_WHALE_ALERT)
    expect(result.is_duplicate).toBe(false)
  })
})

// ---- normalizeItem — X query item (x_query) ---------------------------------

describe('normalizeItem — X query item', () => {
  it('normalizes the X query BTC breakout source event', () => {
    const result = normalizeItem(CRYPTO_SOURCE_EVENT_X_QUERY_BTC)
    expect(result).not.toBeNull()
    expect(result.source_type).toBe('x_query')
    expect(result.source_slug).toBe('x-search-btc-breakout')
  })

  it('propagates T4 trust_tier for the X query source', () => {
    const result = normalizeItem(CRYPTO_SOURCE_EVENT_X_QUERY_BTC)
    expect(result.trust_tier).toBe('T4')
  })

  it('propagates trust_score 25 for the T4 X query source', () => {
    const result = normalizeItem(CRYPTO_SOURCE_EVENT_X_QUERY_BTC)
    expect(result.trust_score).toBe(25)
  })

  it('detects crypto topic candidate for BTC breakout tweet', () => {
    const result = normalizeItem(CRYPTO_SOURCE_EVENT_X_QUERY_BTC)
    expect(result.topic_candidates).toContain('crypto')
  })

  it('item_id matches the expected SHA-256 for the X query event', () => {
    const result = normalizeItem(CRYPTO_SOURCE_EVENT_X_QUERY_BTC)
    expect(result.item_id).toBe(CRYPTO_NORMALIZED_ITEM_X_QUERY_BTC.item_id)
  })

  it('normalized output matches the expected fixture shape', () => {
    const result = normalizeItem(CRYPTO_SOURCE_EVENT_X_QUERY_BTC)
    expect(result.source_type).toBe(CRYPTO_NORMALIZED_ITEM_X_QUERY_BTC.source_type)
    expect(result.trust_tier).toBe(CRYPTO_NORMALIZED_ITEM_X_QUERY_BTC.trust_tier)
    expect(result.trust_score).toBe(CRYPTO_NORMALIZED_ITEM_X_QUERY_BTC.trust_score)
    expect(result.is_duplicate).toBe(false)
  })
})

// ---- normalizeItem — API source ---------------------------------------------

describe('normalizeItem — API source', () => {
  it('normalizes a structured data API source item', () => {
    const apiItem = {
      source_id: 'coingecko-btc-2025-01-15T14:00:00Z',
      source_slug: 'coingecko-api',
      source_name: 'CoinGecko API',
      source_type: 'api',
      source_url: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
      title: 'Bitcoin price alert: $120,432 (+8.2% 24h)',
      body: null,
      author: null,
      published_at: '2025-01-15T14:00:00Z',
      fetched_at: '2025-01-15T14:01:05Z',
      trust_tier: 'T1',
      trust_score: 90,
      raw_json: { bitcoin: { usd: 120432 } }
    }
    const result = normalizeItem(apiItem)
    expect(result).not.toBeNull()
    expect(result.source_type).toBe('api')
    expect(result.source_slug).toBe('coingecko-api')
    expect(result.trust_tier).toBe('T1')
    expect(result.trust_score).toBe(90)
    expect(result.topic_candidates).toContain('crypto')
  })
})

// ---- item_id computation ----------------------------------------------------

describe('computeItemId', () => {
  it('returns a 64-character hex string (SHA-256)', () => {
    const id = computeItemId('CoinDesk RSS', 'https://coindesk.com/article/1')
    expect(id).toMatch(/^[a-f0-9]{64}$/)
  })

  it('is deterministic — same inputs produce the same id', () => {
    const id1 = computeItemId('CoinDesk RSS', 'https://coindesk.com/article/1')
    const id2 = computeItemId('CoinDesk RSS', 'https://coindesk.com/article/1')
    expect(id1).toBe(id2)
  })

  it('differs when source_name changes', () => {
    const id1 = computeItemId('CoinDesk RSS', 'https://coindesk.com/article/1')
    const id2 = computeItemId('Reuters RSS', 'https://coindesk.com/article/1')
    expect(id1).not.toBe(id2)
  })

  it('differs when source_id changes', () => {
    const id1 = computeItemId('CoinDesk RSS', 'https://coindesk.com/article/1')
    const id2 = computeItemId('CoinDesk RSS', 'https://coindesk.com/article/2')
    expect(id1).not.toBe(id2)
  })

  it('normalizeItem produces the correct item_id for a known source pair', () => {
    const result = normalizeItem(ECONOMY_SOURCE_EVENT_BLS_CPI)
    const expected = computeItemId('BLS News RSS', 'https://www.bls.gov/news.release/cpi.nr0.htm')
    expect(result.item_id).toBe(expected)
  })
})

// ---- HTML stripping ----------------------------------------------------------

describe('stripHtml', () => {
  it('strips HTML tags from a title', () => {
    const clean = stripHtml('<b>Bitcoin</b> hits <em>$120K</em>')
    expect(clean).toBe('Bitcoin hits $120K')
  })

  it('collapses multiple whitespace characters to a single space', () => {
    const clean = stripHtml('hello   world\n\nfoo')
    expect(clean).toBe('hello world foo')
  })

  it('returns empty string for null input', () => {
    expect(stripHtml(null)).toBe('')
  })

  it('normalizeItem strips HTML from the title field', () => {
    const item = {
      ...CRYPTO_SOURCE_EVENT_BTC_ETF,
      title: '<p>Spot Bitcoin ETFs record <strong>$500M</strong> inflows</p>'
    }
    const result = normalizeItem(item)
    expect(result.headline).toBe('Spot Bitcoin ETFs record $500M inflows')
  })

  it('normalizeItem strips HTML from the body field', () => {
    const item = {
      ...FINANCE_SOURCE_EVENT_FED_MINUTES,
      body: '<p>Fed minutes show <em>no urgency</em> to cut rates.</p>'
    }
    const result = normalizeItem(item)
    expect(result.body).toBe('Fed minutes show no urgency to cut rates.')
  })
})

// ---- Topic candidate detection ----------------------------------------------

describe('detectTopicCandidates', () => {
  it('detects crypto from BTC-related headline', () => {
    expect(detectTopicCandidates('Bitcoin ETF sets new record', null)).toContain('crypto')
  })

  it('detects finance from interest rate news', () => {
    expect(detectTopicCandidates('Interest rate hike expected from Fed', null)).toContain('finance')
  })

  it('detects economy from inflation body text', () => {
    expect(detectTopicCandidates('CPI report released', 'Inflation rose 0.3 percent in December')).toContain('economy')
  })

  it('detects ai from LLM headline', () => {
    expect(detectTopicCandidates('New LLM outperforms GPT on benchmarks', null)).toContain('ai')
  })

  it('detects energy from oil and renewable keywords', () => {
    expect(detectTopicCandidates('Oil prices fall as renewable energy surges', null)).toContain('energy')
  })

  it('detects technology from chip news', () => {
    expect(detectTopicCandidates('TSMC semiconductor chip shortage easing', null)).toContain('technology')
  })

  it('detects health from vaccine headline', () => {
    expect(detectTopicCandidates('New vaccine approved by FDA for flu season', null)).toContain('health')
  })

  it('returns an empty array when no keywords match', () => {
    expect(detectTopicCandidates('Completely unrelated headline here', null)).toHaveLength(0)
  })

  it('returns at most 3 topic candidates', () => {
    const result = detectTopicCandidates(
      'Bitcoin ETF crypto blockchain stock market interest rate',
      'inflation gdp recession ai llm automation cloud software'
    )
    expect(result.length).toBeLessThanOrEqual(3)
  })

  it('detects multiple topics from multi-topic content', () => {
    const candidates = detectTopicCandidates(
      'Bitcoin ETF drives stock market gains amid inflation concerns',
      null
    )
    expect(candidates).toContain('crypto')
    expect(candidates.length).toBeGreaterThanOrEqual(2)
  })
})

// ---- Trust field propagation ------------------------------------------------

describe('normalizeItem — trust field propagation', () => {
  it('propagates trust_tier and trust_score from source item', () => {
    const item = {
      source_id: 'test-001',
      source_name: 'Test Source',
      source_type: 'rss',
      title: 'Test headline for trust',
      fetched_at: '2025-01-15T10:00:00Z',
      trust_tier: 'T2',
      trust_score: 75
    }
    const result = normalizeItem(item)
    expect(result.trust_tier).toBe('T2')
    expect(result.trust_score).toBe(75)
  })

  it('sets trust_tier to null when absent from source item', () => {
    const item = {
      source_id: 'test-002',
      source_name: 'No Trust Source',
      source_type: 'api',
      title: 'Headline without trust tier',
      fetched_at: '2025-01-15T10:00:00Z'
    }
    const result = normalizeItem(item)
    expect(result.trust_tier).toBeNull()
    expect(result.trust_score).toBeNull()
  })

  it('truncates a decimal trust_score to an integer', () => {
    const item = {
      source_id: 'test-003',
      source_name: 'Decimal Trust Source',
      source_type: 'rss',
      title: 'Headline for decimal trust test',
      fetched_at: '2025-01-15T10:00:00Z',
      trust_score: 75.9
    }
    const result = normalizeItem(item)
    expect(result.trust_score).toBe(75)
  })

  it('clamps trust_score above 100 to 100', () => {
    const item = {
      source_id: 'test-004',
      source_name: 'High Trust Source',
      source_type: 'rss',
      title: 'Headline for clamping test',
      fetched_at: '2025-01-15T10:00:00Z',
      trust_score: 150
    }
    const result = normalizeItem(item)
    expect(result.trust_score).toBe(100)
  })

  it('clamps trust_score below 0 to 0', () => {
    const item = {
      source_id: 'test-005',
      source_name: 'Negative Trust Source',
      source_type: 'rss',
      title: 'Headline for negative clamping',
      fetched_at: '2025-01-15T10:00:00Z',
      trust_score: -10
    }
    const result = normalizeItem(item)
    expect(result.trust_score).toBe(0)
  })

  it('sets trust_score to null when it is an invalid string', () => {
    const item = {
      source_id: 'test-006',
      source_name: 'Bad Trust Source',
      source_type: 'rss',
      title: 'Headline for invalid trust score',
      fetched_at: '2025-01-15T10:00:00Z',
      trust_score: 'high'
    }
    const result = normalizeItem(item)
    expect(result.trust_score).toBeNull()
  })
})

// ---- Headline validation and published_at fallback -------------------------

describe('normalizeItem — headline validation and timestamp fallback', () => {
  it('returns null for an item whose title is shorter than 5 characters', () => {
    const item = {
      source_id: 'short-title-001',
      source_name: 'Test',
      source_type: 'rss',
      title: 'Hi',
      fetched_at: '2025-01-15T10:00:00Z'
    }
    expect(normalizeItem(item)).toBeNull()
  })

  it('returns null for an item with an empty title', () => {
    const item = {
      source_id: 'empty-title-001',
      source_name: 'Test',
      source_type: 'rss',
      title: '',
      fetched_at: '2025-01-15T10:00:00Z'
    }
    expect(normalizeItem(item)).toBeNull()
  })

  it('accepts an item whose title is exactly 5 characters', () => {
    const item = {
      source_id: 'five-char-001',
      source_name: 'Test',
      source_type: 'rss',
      title: 'Short',
      fetched_at: '2025-01-15T10:00:00Z'
    }
    expect(normalizeItem(item)).not.toBeNull()
  })

  it('falls back to fetched_at when published_at is null', () => {
    const item = {
      source_id: 'no-pub-date-001',
      source_name: 'Test Source',
      source_type: 'api',
      title: 'Headline without a publish date',
      body: null,
      published_at: null,
      fetched_at: '2025-01-15T10:00:00Z'
    }
    const result = normalizeItem(item)
    expect(result.published_at).toBe('2025-01-15T10:00:00Z')
  })

  it('truncates headline to 250 characters', () => {
    const longTitle = 'A'.repeat(300)
    const item = {
      source_id: 'long-title-001',
      source_name: 'Test Source',
      source_type: 'rss',
      title: longTitle,
      fetched_at: '2025-01-15T10:00:00Z'
    }
    const result = normalizeItem(item)
    expect(result.headline.length).toBe(250)
  })

  it('truncates body to 2000 characters', () => {
    const longBody = 'B'.repeat(2500)
    const item = {
      source_id: 'long-body-001',
      source_name: 'Test Source',
      source_type: 'rss',
      title: 'Normal headline for body truncation test',
      body: longBody,
      fetched_at: '2025-01-15T10:00:00Z'
    }
    const result = normalizeItem(item)
    expect(result.body.length).toBe(2000)
  })
})

// ---- Source registry — topic filtering and trust fields ---------------------

describe('source registry — lookup and trust field propagation', () => {
  let db

  beforeEach(() => {
    db = createSeededDb()
    db.seed('sources', [
      {
        id: 1,
        source_slug: 'bls-rss',
        source_name: 'BLS News RSS',
        topic_slug: 'economy',
        source_type: 'rss',
        trust_tier: 'T1',
        trust_score: 90,
        priority_weight: 90,
        url: 'https://www.bls.gov/rss/',
        is_active: 1,
        poll_interval_minutes: 60,
        ingestion_method: 'poll'
      },
      {
        id: 2,
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
        id: 3,
        source_slug: 'x-account-whale-alert',
        source_name: 'Whale Alert (X)',
        topic_slug: 'crypto',
        source_type: 'x_account',
        trust_tier: 'T4',
        trust_score: 25,
        priority_weight: 50,
        url: 'https://x.com/whale_alert',
        is_active: 1,
        poll_interval_minutes: 5,
        ingestion_method: 'poll'
      },
      {
        id: 4,
        source_slug: 'x-search-btc-breakout',
        source_name: 'X Search: BTC Breakout',
        topic_slug: 'crypto',
        source_type: 'x_query',
        trust_tier: 'T4',
        trust_score: 25,
        priority_weight: 40,
        url: 'https://api.twitter.com/2/tweets/search/recent',
        is_active: 1,
        poll_interval_minutes: 10,
        ingestion_method: 'poll'
      },
      {
        id: 5,
        source_slug: 'inactive-source',
        source_name: 'Inactive Source',
        topic_slug: 'crypto',
        source_type: 'rss',
        trust_tier: 'T3',
        trust_score: 50,
        priority_weight: 30,
        url: 'https://example.com/inactive',
        is_active: 0,
        poll_interval_minutes: 15,
        ingestion_method: 'poll'
      }
    ])
  })

  it('returns only active sources (is_active = 1)', async () => {
    const res = await onRequestGet(makeSourcesGetCtx(db))
    const sources = await res.json()
    expect(sources).toHaveLength(4)
    for (const src of sources) {
      expect(src.source_slug).not.toBe('inactive-source')
    }
  })

  it('filters sources by topic_slug correctly', async () => {
    const res = await onRequestGet(makeSourcesGetCtx(db, { topic: 'economy' }))
    const sources = await res.json()
    expect(sources).toHaveLength(1)
    expect(sources[0].source_slug).toBe('bls-rss')
    expect(sources[0].topic_slug).toBe('economy')
  })

  it('returns T1 trust fields for the official economy source', async () => {
    const res = await onRequestGet(makeSourcesGetCtx(db, { topic: 'economy' }))
    const sources = await res.json()
    expect(sources[0].trust_tier).toBe('T1')
    expect(sources[0].trust_score).toBe(90)
  })

  it('returns both x_account and x_query sources for crypto topic', async () => {
    const res = await onRequestGet(makeSourcesGetCtx(db, { topic: 'crypto' }))
    const sources = await res.json()
    const types = sources.map(s => s.source_type)
    expect(types).toContain('x_account')
    expect(types).toContain('x_query')
  })

  it('returns T4 trust_tier for X account and X query sources', async () => {
    const res = await onRequestGet(makeSourcesGetCtx(db, { topic: 'crypto' }))
    const sources = await res.json()
    const xSources = sources.filter(s => s.source_type === 'x_account' || s.source_type === 'x_query')
    expect(xSources).toHaveLength(2)
    for (const src of xSources) {
      expect(src.trust_tier).toBe('T4')
      expect(src.trust_score).toBe(25)
    }
  })

  it('returns trust_score 25 for the X account whale alert source', async () => {
    const res = await onRequestGet(makeSourcesGetCtx(db, { topic: 'crypto' }))
    const sources = await res.json()
    const xAccount = sources.find(s => s.source_slug === 'x-account-whale-alert')
    expect(xAccount).toBeDefined()
    expect(xAccount.trust_score).toBe(25)
  })

  it('returns an empty array for a valid topic with no sources', async () => {
    const res = await onRequestGet(makeSourcesGetCtx(db, { topic: 'health' }))
    expect(res.status).toBe(200)
    const sources = await res.json()
    expect(sources).toHaveLength(0)
  })

  it('returns 400 for an invalid topic parameter', async () => {
    const res = await onRequestGet(makeSourcesGetCtx(db, { topic: 'INVALID' }))
    expect(res.status).toBe(400)
  })
})

// ---- Source registry — X source registration --------------------------------

describe('source registry — X source registration', () => {
  let db

  beforeEach(() => {
    db = createSeededDb()
  })

  it('registers an x_account source with T4 trust and returns 201', async () => {
    const payload = sourcePayload({
      source_slug: 'x-account-whale-alert',
      source_name: 'Whale Alert (X)',
      source_type: 'x_account',
      topic_slug: 'crypto',
      trust_tier: 'T4',
      trust_score: 25,
      url: 'https://x.com/whale_alert',
      metadata_json: '{"x_user_id":"123456","x_username":"whale_alert"}'
    })
    const res = await onRequestPostSource(makeSourceCtx(db, payload))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.source_slug).toBe('x-account-whale-alert')
    expect(body.topic_slug).toBe('crypto')
  })

  it('registers an x_query source with T4 trust and returns 201', async () => {
    const payload = sourcePayload({
      source_slug: 'x-search-btc-breakout',
      source_name: 'X Search: BTC Breakout',
      source_type: 'x_query',
      topic_slug: 'crypto',
      trust_tier: 'T4',
      trust_score: 25,
      metadata_json: '{"search_query":"(#BTC OR #Bitcoin) breakout -is:retweet"}'
    })
    const res = await onRequestPostSource(makeSourceCtx(db, payload))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.source_slug).toBe('x-search-btc-breakout')
  })

  it('registers an official T1 RSS source and returns 201', async () => {
    const payload = sourcePayload({
      source_slug: 'bls-rss',
      source_name: 'BLS News RSS',
      source_type: 'rss',
      topic_slug: 'economy',
      trust_tier: 'T1',
      trust_score: 90,
      priority_weight: 90,
      url: 'https://www.bls.gov/rss/'
    })
    const res = await onRequestPostSource(makeSourceCtx(db, payload))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.source_slug).toBe('bls-rss')
    expect(body.topic_slug).toBe('economy')
  })

  it('returns 409 when registering a source with a duplicate slug', async () => {
    const payload = sourcePayload({ source_slug: 'x-dup-test', source_type: 'x_account' })
    await onRequestPostSource(makeSourceCtx(db, payload))
    const res2 = await onRequestPostSource(makeSourceCtx(db, payload))
    expect(res2.status).toBe(409)
  })
})

// ---- Downstream contract compatibility --------------------------------------

describe('normalizeItem — downstream contract compatibility', () => {
  const REQUIRED_FIELDS = [
    'item_id', 'source_id', 'source_name', 'source_type',
    'headline', 'published_at', 'fetched_at', 'is_duplicate'
  ]

  const ALL_SOURCE_EVENTS = [
    CRYPTO_SOURCE_EVENT_BTC_ETF,
    FINANCE_SOURCE_EVENT_FED_MINUTES,
    AI_SOURCE_EVENT_OPEN_WEIGHT_MODEL,
    CRYPTO_SOURCE_EVENT_X_WHALE_ALERT,
    ECONOMY_SOURCE_EVENT_BLS_CPI,
    CRYPTO_SOURCE_EVENT_X_QUERY_BTC
  ]

  for (const event of ALL_SOURCE_EVENTS) {
    it(`all required fields are present for ${event.source_name} (${event.source_type})`, () => {
      const result = normalizeItem(event)
      expect(result).not.toBeNull()
      for (const field of REQUIRED_FIELDS) {
        expect(result, `missing field: ${field}`).toHaveProperty(field)
        expect(result[field], `${field} must not be undefined`).not.toBeUndefined()
      }
    })
  }

  it('topic_candidates is always an array', () => {
    for (const event of ALL_SOURCE_EVENTS) {
      const result = normalizeItem(event)
      expect(Array.isArray(result.topic_candidates)).toBe(true)
    }
  })

  it('is_duplicate is always false on initial normalization', () => {
    for (const event of ALL_SOURCE_EVENTS) {
      const result = normalizeItem(event)
      expect(result.is_duplicate).toBe(false)
    }
  })

  it('item_id is always a 64-character hex string', () => {
    for (const event of ALL_SOURCE_EVENTS) {
      const result = normalizeItem(event)
      expect(result.item_id).toMatch(/^[a-f0-9]{64}$/)
    }
  })

  it('source_type is always a known enum value', () => {
    const VALID_TYPES = ['rss', 'api', 'social', 'webhook', 'x_account', 'x_query']
    for (const event of ALL_SOURCE_EVENTS) {
      const result = normalizeItem(event)
      expect(VALID_TYPES).toContain(result.source_type)
    }
  })

  it('published_at is always an ISO-8601 timestamp string', () => {
    for (const event of ALL_SOURCE_EVENTS) {
      const result = normalizeItem(event)
      expect(result.published_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    }
  })

  it('headline is always a non-empty string under 251 chars', () => {
    for (const event of ALL_SOURCE_EVENTS) {
      const result = normalizeItem(event)
      expect(result.headline).toBeTypeOf('string')
      expect(result.headline.length).toBeGreaterThan(0)
      expect(result.headline.length).toBeLessThanOrEqual(250)
    }
  })
})
