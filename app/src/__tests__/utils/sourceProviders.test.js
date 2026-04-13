/**
 * Unit tests — app/src/utils/sourceProviders.js
 *
 * Validates source-provider selection logic for all four provider states:
 *   - X-only mode
 *   - NewsAPI-only mode
 *   - Hybrid mode (both X and NewsAPI configured)
 *   - No-provider error (neither configured)
 *
 * Also validates:
 *   - classifySourceProvider — per-type provider classification
 *   - detectProviders — provider presence detection
 *   - selectSourcesByProviders — source filtering by enabled providers
 *   - resolveProviderMode — main entry point, all valid + invalid states
 *   - Non-provider sources (rss, api, webhook, social) always pass through
 */
import { describe, it, expect } from 'vitest'
import {
  PROVIDER_X,
  PROVIDER_NEWSAPI,
  X_PROVIDER_SOURCE_TYPES,
  NEWSAPI_SOURCE_TYPE,
  classifySourceProvider,
  detectProviders,
  selectSourcesByProviders,
  resolveProviderMode
} from '@/utils/sourceProviders.js'

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function xAccountSource(overrides = {}) {
  return { name: 'Whale Alert', type: 'x_account', url: 'https://x.com/whale_alert', ...overrides }
}
function xQuerySource(overrides = {}) {
  return { name: 'BTC Breakout Search', type: 'x_query', url: 'https://api.twitter.com/2/tweets/search/recent', ...overrides }
}
function newsapiSource(overrides = {}) {
  return { name: 'NewsAPI Headlines', type: 'newsapi', url: 'https://newsapi.org/v2/top-headlines', ...overrides }
}
function rssSource(overrides = {}) {
  return { name: 'CoinDesk RSS', type: 'rss', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', ...overrides }
}
function apiSource(overrides = {}) {
  return { name: 'Hacker News API', type: 'api', url: 'https://hacker-news.firebaseio.com/v0/topstories.json', ...overrides }
}
function webhookSource(overrides = {}) {
  return { name: 'Exchange Webhook', type: 'webhook', url: 'https://example.com/webhook', ...overrides }
}
function socialSource(overrides = {}) {
  return { name: 'Crypto Telegram', type: 'social', url: 'https://t.me/cryptosignals', ...overrides }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('sourceProviders — constants', () => {
  it('PROVIDER_X is "x"', () => {
    expect(PROVIDER_X).toBe('x')
  })

  it('PROVIDER_NEWSAPI is "newsapi"', () => {
    expect(PROVIDER_NEWSAPI).toBe('newsapi')
  })

  it('X_PROVIDER_SOURCE_TYPES includes x_account and x_query', () => {
    expect(X_PROVIDER_SOURCE_TYPES).toContain('x_account')
    expect(X_PROVIDER_SOURCE_TYPES).toContain('x_query')
  })

  it('NEWSAPI_SOURCE_TYPE is "newsapi"', () => {
    expect(NEWSAPI_SOURCE_TYPE).toBe('newsapi')
  })
})

// ---------------------------------------------------------------------------
// classifySourceProvider
// ---------------------------------------------------------------------------

describe('classifySourceProvider', () => {
  it('returns "x" for type x_account', () => {
    expect(classifySourceProvider('x_account')).toBe('x')
  })

  it('returns "x" for type x_query', () => {
    expect(classifySourceProvider('x_query')).toBe('x')
  })

  it('returns "newsapi" for type newsapi', () => {
    expect(classifySourceProvider('newsapi')).toBe('newsapi')
  })

  it('returns null for type rss', () => {
    expect(classifySourceProvider('rss')).toBeNull()
  })

  it('returns null for type api', () => {
    expect(classifySourceProvider('api')).toBeNull()
  })

  it('returns null for type webhook', () => {
    expect(classifySourceProvider('webhook')).toBeNull()
  })

  it('returns null for type social', () => {
    expect(classifySourceProvider('social')).toBeNull()
  })

  it('returns null for null input', () => {
    expect(classifySourceProvider(null)).toBeNull()
  })

  it('returns null for undefined input', () => {
    expect(classifySourceProvider(undefined)).toBeNull()
  })

  it('returns null for an unknown type', () => {
    expect(classifySourceProvider('unknown_type')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// detectProviders
// ---------------------------------------------------------------------------

describe('detectProviders', () => {
  it('detects X when an x_account source is present', () => {
    const result = detectProviders([xAccountSource()])
    expect(result.x).toBe(true)
    expect(result.newsapi).toBe(false)
  })

  it('detects X when an x_query source is present', () => {
    const result = detectProviders([xQuerySource()])
    expect(result.x).toBe(true)
    expect(result.newsapi).toBe(false)
  })

  it('detects NewsAPI when a newsapi source is present', () => {
    const result = detectProviders([newsapiSource()])
    expect(result.x).toBe(false)
    expect(result.newsapi).toBe(true)
  })

  it('detects both providers when both types are present', () => {
    const result = detectProviders([xAccountSource(), newsapiSource()])
    expect(result.x).toBe(true)
    expect(result.newsapi).toBe(true)
  })

  it('returns false for both when only rss sources are present', () => {
    const result = detectProviders([rssSource()])
    expect(result.x).toBe(false)
    expect(result.newsapi).toBe(false)
  })

  it('returns false for both when only api sources are present', () => {
    const result = detectProviders([apiSource()])
    expect(result.x).toBe(false)
    expect(result.newsapi).toBe(false)
  })

  it('returns false for both on an empty array', () => {
    const result = detectProviders([])
    expect(result.x).toBe(false)
    expect(result.newsapi).toBe(false)
  })

  it('returns false for both when input is not an array', () => {
    expect(detectProviders(null)).toEqual({ x: false, newsapi: false })
    expect(detectProviders(undefined)).toEqual({ x: false, newsapi: false })
  })
})

// ---------------------------------------------------------------------------
// selectSourcesByProviders
// ---------------------------------------------------------------------------

describe('selectSourcesByProviders', () => {
  const allSources = [
    xAccountSource(),
    xQuerySource(),
    newsapiSource(),
    rssSource(),
    apiSource(),
    webhookSource(),
    socialSource()
  ]

  it('includes all sources when both providers are enabled', () => {
    const result = selectSourcesByProviders(allSources, { x: true, newsapi: true })
    expect(result).toHaveLength(allSources.length)
  })

  it('excludes NewsAPI sources when only X is enabled', () => {
    const result = selectSourcesByProviders(allSources, { x: true, newsapi: false })
    expect(result.some(s => s.type === 'newsapi')).toBe(false)
    expect(result.some(s => s.type === 'x_account')).toBe(true)
    expect(result.some(s => s.type === 'x_query')).toBe(true)
  })

  it('excludes X sources when only NewsAPI is enabled', () => {
    const result = selectSourcesByProviders(allSources, { x: false, newsapi: true })
    expect(result.some(s => s.type === 'x_account')).toBe(false)
    expect(result.some(s => s.type === 'x_query')).toBe(false)
    expect(result.some(s => s.type === 'newsapi')).toBe(true)
  })

  it('always keeps rss sources regardless of provider flags', () => {
    const result = selectSourcesByProviders(allSources, { x: false, newsapi: false })
    expect(result.some(s => s.type === 'rss')).toBe(true)
  })

  it('always keeps api sources regardless of provider flags', () => {
    const result = selectSourcesByProviders(allSources, { x: false, newsapi: false })
    expect(result.some(s => s.type === 'api')).toBe(true)
  })

  it('always keeps webhook sources regardless of provider flags', () => {
    const result = selectSourcesByProviders(allSources, { x: false, newsapi: false })
    expect(result.some(s => s.type === 'webhook')).toBe(true)
  })

  it('always keeps social sources regardless of provider flags', () => {
    const result = selectSourcesByProviders(allSources, { x: false, newsapi: false })
    expect(result.some(s => s.type === 'social')).toBe(true)
  })

  it('returns an empty array for non-array input', () => {
    expect(selectSourcesByProviders(null, { x: true, newsapi: true })).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// resolveProviderMode — X-only mode
// ---------------------------------------------------------------------------

describe('resolveProviderMode — X-only mode', () => {
  it('returns mode "x_only" when only X sources are present', () => {
    const { mode } = resolveProviderMode([xAccountSource()])
    expect(mode).toBe('x_only')
  })

  it('returns mode "x_only" for x_query sources', () => {
    const { mode } = resolveProviderMode([xQuerySource()])
    expect(mode).toBe('x_only')
  })

  it('includes X sources in activeSources', () => {
    const sources = [xAccountSource(), xQuerySource()]
    const { activeSources } = resolveProviderMode(sources)
    expect(activeSources.some(s => s.type === 'x_account')).toBe(true)
    expect(activeSources.some(s => s.type === 'x_query')).toBe(true)
  })

  it('includes non-provider sources alongside X sources', () => {
    const sources = [xAccountSource(), rssSource(), apiSource()]
    const { activeSources } = resolveProviderMode(sources)
    expect(activeSources.some(s => s.type === 'rss')).toBe(true)
    expect(activeSources.some(s => s.type === 'api')).toBe(true)
    expect(activeSources.some(s => s.type === 'x_account')).toBe(true)
  })

  it('excludes NewsAPI sources in X-only mode', () => {
    const xOnlySources = [xAccountSource(), rssSource()]
    const { activeSources } = resolveProviderMode(xOnlySources)
    expect(activeSources.some(s => s.type === 'newsapi')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// resolveProviderMode — NewsAPI-only mode
// ---------------------------------------------------------------------------

describe('resolveProviderMode — NewsAPI-only mode', () => {
  it('returns mode "newsapi_only" when only NewsAPI sources are present', () => {
    const { mode } = resolveProviderMode([newsapiSource()])
    expect(mode).toBe('newsapi_only')
  })

  it('includes NewsAPI sources in activeSources', () => {
    const { activeSources } = resolveProviderMode([newsapiSource()])
    expect(activeSources.some(s => s.type === 'newsapi')).toBe(true)
  })

  it('includes non-provider sources alongside NewsAPI sources', () => {
    const sources = [newsapiSource(), rssSource(), webhookSource()]
    const { activeSources } = resolveProviderMode(sources)
    expect(activeSources.some(s => s.type === 'newsapi')).toBe(true)
    expect(activeSources.some(s => s.type === 'rss')).toBe(true)
    expect(activeSources.some(s => s.type === 'webhook')).toBe(true)
  })

  it('excludes X sources in NewsAPI-only mode', () => {
    const sources = [newsapiSource(), rssSource()]
    const { activeSources } = resolveProviderMode(sources)
    expect(activeSources.some(s => s.type === 'x_account')).toBe(false)
    expect(activeSources.some(s => s.type === 'x_query')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// resolveProviderMode — hybrid mode
// ---------------------------------------------------------------------------

describe('resolveProviderMode — hybrid mode', () => {
  it('returns mode "hybrid" when both X and NewsAPI sources are present', () => {
    const { mode } = resolveProviderMode([xAccountSource(), newsapiSource()])
    expect(mode).toBe('hybrid')
  })

  it('returns mode "hybrid" with x_query + newsapi combination', () => {
    const { mode } = resolveProviderMode([xQuerySource(), newsapiSource()])
    expect(mode).toBe('hybrid')
  })

  it('includes all source types in activeSources in hybrid mode', () => {
    const sources = [xAccountSource(), xQuerySource(), newsapiSource(), rssSource()]
    const { activeSources } = resolveProviderMode(sources)
    expect(activeSources).toHaveLength(sources.length)
  })
})

// ---------------------------------------------------------------------------
// resolveProviderMode — error state (neither configured)
// ---------------------------------------------------------------------------

describe('resolveProviderMode — no provider configured', () => {
  it('throws when the source list is empty', () => {
    expect(() => resolveProviderMode([])).toThrow('PROVIDER_CONFIG_ERROR')
  })

  it('throws when only rss sources are present', () => {
    expect(() => resolveProviderMode([rssSource()])).toThrow('PROVIDER_CONFIG_ERROR')
  })

  it('throws when only api sources are present', () => {
    expect(() => resolveProviderMode([apiSource()])).toThrow('PROVIDER_CONFIG_ERROR')
  })

  it('throws when only webhook sources are present', () => {
    expect(() => resolveProviderMode([webhookSource()])).toThrow('PROVIDER_CONFIG_ERROR')
  })

  it('throws when only social sources are present', () => {
    expect(() => resolveProviderMode([socialSource()])).toThrow('PROVIDER_CONFIG_ERROR')
  })

  it('throws when input is null', () => {
    expect(() => resolveProviderMode(null)).toThrow('PROVIDER_CONFIG_ERROR')
  })

  it('throws when input is undefined', () => {
    expect(() => resolveProviderMode(undefined)).toThrow('PROVIDER_CONFIG_ERROR')
  })

  it('error message mentions X source types', () => {
    expect(() => resolveProviderMode([])).toThrow(/x_account|x_query/i)
  })

  it('error message mentions NewsAPI source type', () => {
    expect(() => resolveProviderMode([])).toThrow(/newsapi/i)
  })

  it('error message mentions INTRADAY_SOURCES_JSON', () => {
    expect(() => resolveProviderMode([])).toThrow(/INTRADAY_SOURCES_JSON/)
  })
})

// ---------------------------------------------------------------------------
// resolveProviderMode — activeSources count
// ---------------------------------------------------------------------------

describe('resolveProviderMode — activeSources count', () => {
  it('returns correct count for x_only mode with mixed sources', () => {
    const xRss = [xAccountSource(), rssSource()]
    const { activeSources } = resolveProviderMode(xRss)
    expect(activeSources).toHaveLength(2)
  })

  it('returns correct count for newsapi_only mode with mixed sources', () => {
    const sources = [newsapiSource(), rssSource(), webhookSource()]
    const { activeSources } = resolveProviderMode(sources)
    expect(activeSources).toHaveLength(3)
  })

  it('throws PROVIDER_CONFIG_ERROR when only non-provider sources (rss, api) are present', () => {
    expect(() => resolveProviderMode([rssSource(), apiSource()])).toThrow('PROVIDER_CONFIG_ERROR')
  })
})
