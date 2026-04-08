/**
 * Unit tests — services/api.js
 *
 * Validates the API service fetch wrappers around Cloudflare Pages Functions
 * endpoints.
 *
 * Tests verify:
 *   - correct endpoint paths are called
 *   - query parameters are appended correctly
 *   - successful responses return parsed JSON
 *   - non-OK responses throw an error
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchTopics, fetchDayStatus, fetchTimeline, fetchNavigation } from '@/services/api.js'

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------

function jsonRes(data, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' }
    })
  )
}

function errorRes(status = 500) {
  return Promise.resolve(new Response('Error', { status }))
}

// ---------------------------------------------------------------------------
// fetchTopics
// ---------------------------------------------------------------------------

describe('fetchTopics', () => {
  afterEach(() => vi.restoreAllMocks())

  it('calls the /api/topics endpoint', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockReturnValue(jsonRes([]))
    await fetchTopics()
    expect(spy).toHaveBeenCalledWith('/api/topics')
  })

  it('returns the parsed topics array', async () => {
    const topics = [
      { topic_slug: 'crypto', display_name: 'Crypto', description: '', sort_order: 1 }
    ]
    vi.spyOn(globalThis, 'fetch').mockReturnValue(jsonRes(topics))
    const result = await fetchTopics()
    expect(result).toEqual(topics)
  })

  it('throws when the response is not ok', async () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(errorRes(500))
    await expect(fetchTopics()).rejects.toThrow(/500/)
  })

  it('throws on 503 (database not configured)', async () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(errorRes(503))
    await expect(fetchTopics()).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// fetchDayStatus
// ---------------------------------------------------------------------------

describe('fetchDayStatus', () => {
  afterEach(() => vi.restoreAllMocks())

  it('calls the correct day-status endpoint', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockReturnValue(jsonRes({}))
    await fetchDayStatus('crypto', '2025-01-15')
    expect(spy).toHaveBeenCalledWith('/api/day-status/crypto/2025-01-15')
  })

  it('builds the correct path for different topic/date combos', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockReturnValue(jsonRes({}))
    await fetchDayStatus('finance', '2026-04-08')
    expect(spy).toHaveBeenCalledWith('/api/day-status/finance/2026-04-08')
  })

  it('returns the parsed status object', async () => {
    const status = {
      topic_slug: 'crypto', date_key: '2025-01-15', page_state: 'published',
      display_name: 'Crypto', alert_count: 3, cluster_count: 1,
      summary_available: 1, video_available: 1, article_available: 1,
      prev_date_key: null, next_date_key: null, published_at: '2025-01-15T23:00:00Z'
    }
    vi.spyOn(globalThis, 'fetch').mockReturnValue(jsonRes(status))
    const result = await fetchDayStatus('crypto', '2025-01-15')
    expect(result).toEqual(status)
    expect(result.page_state).toBe('published')
  })

  it('throws on 404 (unknown topic)', async () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(errorRes(404))
    await expect(fetchDayStatus('unknown', '2025-01-15')).rejects.toThrow(/404/)
  })

  it('throws on 400 (invalid input)', async () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(errorRes(400))
    await expect(fetchDayStatus('INVALID', '2025-01-15')).rejects.toThrow(/400/)
  })
})

// ---------------------------------------------------------------------------
// fetchTimeline
// ---------------------------------------------------------------------------

describe('fetchTimeline', () => {
  afterEach(() => vi.restoreAllMocks())

  it('calls the correct timeline endpoint without options', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockReturnValue(jsonRes({ alerts: [], total: 0, has_more: false }))
    await fetchTimeline('crypto', '2025-01-15')
    expect(spy).toHaveBeenCalledWith('/api/timeline/crypto/2025-01-15')
  })

  it('appends the limit query parameter when provided', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockReturnValue(jsonRes({ alerts: [], total: 0, has_more: false }))
    await fetchTimeline('crypto', '2025-01-15', { limit: 10 })
    expect(spy).toHaveBeenCalledWith('/api/timeline/crypto/2025-01-15?limit=10')
  })

  it('appends the before cursor when provided', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockReturnValue(jsonRes({ alerts: [], total: 0, has_more: false }))
    const cursor = '2025-01-15T14:00:00Z'
    await fetchTimeline('crypto', '2025-01-15', { before: cursor })
    const calledUrl = spy.mock.calls[0][0]
    expect(calledUrl).toContain('before=')
    expect(calledUrl).toContain('2025-01-15')
  })

  it('appends both limit and before when both are provided', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockReturnValue(jsonRes({ alerts: [], total: 0, has_more: false }))
    await fetchTimeline('crypto', '2025-01-15', { limit: 5, before: '2025-01-15T10:00:00Z' })
    const calledUrl = spy.mock.calls[0][0]
    expect(calledUrl).toContain('limit=5')
    expect(calledUrl).toContain('before=')
  })

  it('does not append a query string when opts is empty', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockReturnValue(jsonRes({ alerts: [], total: 0, has_more: false }))
    await fetchTimeline('crypto', '2025-01-15', {})
    expect(spy).toHaveBeenCalledWith('/api/timeline/crypto/2025-01-15')
  })

  it('returns the parsed timeline response', async () => {
    const response = {
      alerts: [{ id: 1, headline: 'Test', event_at: '2025-01-15T12:00:00Z' }],
      total: 1,
      has_more: false
    }
    vi.spyOn(globalThis, 'fetch').mockReturnValue(jsonRes(response))
    const result = await fetchTimeline('crypto', '2025-01-15')
    expect(result).toEqual(response)
    expect(result.alerts).toHaveLength(1)
    expect(result.has_more).toBe(false)
  })

  it('throws on error responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(errorRes(503))
    await expect(fetchTimeline('crypto', '2025-01-15')).rejects.toThrow(/503/)
  })

  it('builds the correct path for different topic/date combos', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockReturnValue(jsonRes({ alerts: [], total: 0, has_more: false }))
    await fetchTimeline('finance', '2026-04-08')
    expect(spy).toHaveBeenCalledWith('/api/timeline/finance/2026-04-08')
  })
})

// ---------------------------------------------------------------------------
// fetchNavigation
// ---------------------------------------------------------------------------

describe('fetchNavigation', () => {
  afterEach(() => vi.restoreAllMocks())

  it('calls the correct navigation endpoint', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockReturnValue(
      jsonRes({ prev_date_key: null, next_date_key: null })
    )
    await fetchNavigation('crypto', '2025-01-15')
    expect(spy).toHaveBeenCalledWith('/api/navigation/crypto/2025-01-15')
  })

  it('builds the correct path for different topic/date combos', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockReturnValue(
      jsonRes({ prev_date_key: null, next_date_key: null })
    )
    await fetchNavigation('ai', '2026-04-08')
    expect(spy).toHaveBeenCalledWith('/api/navigation/ai/2026-04-08')
  })

  it('returns the parsed navigation object', async () => {
    const nav = { prev_date_key: '2025-01-14', next_date_key: '2025-01-16' }
    vi.spyOn(globalThis, 'fetch').mockReturnValue(jsonRes(nav))
    const result = await fetchNavigation('crypto', '2025-01-15')
    expect(result).toEqual(nav)
    expect(result.prev_date_key).toBe('2025-01-14')
    expect(result.next_date_key).toBe('2025-01-16')
  })

  it('returns null prev/next when no adjacent dates exist', async () => {
    const nav = { prev_date_key: null, next_date_key: null }
    vi.spyOn(globalThis, 'fetch').mockReturnValue(jsonRes(nav))
    const result = await fetchNavigation('crypto', '2025-01-15')
    expect(result.prev_date_key).toBeNull()
    expect(result.next_date_key).toBeNull()
  })

  it('throws on error responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(errorRes(404))
    await expect(fetchNavigation('unknown', '2025-01-15')).rejects.toThrow(/404/)
  })
})
