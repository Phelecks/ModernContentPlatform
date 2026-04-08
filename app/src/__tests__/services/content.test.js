/**
 * Unit tests — services/content.js
 *
 * Validates the content service fetch helpers that load GitHub-backed
 * editorial content files served as static assets.
 *
 * Tests verify:
 *   - correct URL paths are built from topicSlug + dateKey
 *   - 404 responses return null (not an error)
 *   - successful responses return the parsed content
 *   - non-404 errors are re-thrown
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchSummary, fetchArticle, fetchVideoMeta, fetchMetadata } from '@/services/content.js'

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

function textRes(text, status = 200) {
  return Promise.resolve(new Response(text, { status, headers: { 'Content-Type': 'text/plain' } }))
}

function notFoundRes() {
  return Promise.resolve(new Response('', { status: 404 }))
}

function serverErrorRes() {
  return Promise.resolve(new Response('Internal Server Error', { status: 500 }))
}

const SAMPLE_SUMMARY = {
  topic_slug: 'crypto',
  date_key: '2025-01-15',
  headline: 'Bitcoin Reaches New High',
  overview: 'Strong institutional inflows drove BTC to new records.',
  key_events: [{ title: 'ATH Reached', significance: 'Bitcoin surpassed its previous high.', importance_score: 90 }],
  sentiment: 'bullish',
  topic_score: 85
}

const SAMPLE_VIDEO_META = {
  video_id: 'dQw4w9WgXcQ',
  title: 'Crypto Daily — January 15 2025',
  published_at: '2025-01-15T23:30:00Z'
}

const SAMPLE_METADATA = {
  topic_slug: 'crypto',
  date_key: '2025-01-15',
  page_state: 'published',
  article_path: 'content/topics/crypto/2025-01-15/article.md',
  summary_path: 'content/topics/crypto/2025-01-15/summary.json',
  video_path: 'content/topics/crypto/2025-01-15/video.json'
}

const SAMPLE_ARTICLE = '# Crypto Daily\n\nBitcoin markets surged today.'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('fetchSummary', () => {
  afterEach(() => vi.restoreAllMocks())

  it('fetches from the correct content path', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockReturnValue(jsonRes(SAMPLE_SUMMARY))
    await fetchSummary('crypto', '2025-01-15')
    expect(spy).toHaveBeenCalledWith('/content/topics/crypto/2025-01-15/summary.json')
  })

  it('returns the parsed JSON on a successful response', async () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(jsonRes(SAMPLE_SUMMARY))
    const result = await fetchSummary('crypto', '2025-01-15')
    expect(result).toEqual(SAMPLE_SUMMARY)
  })

  it('returns null when the file is not found (404)', async () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(notFoundRes())
    const result = await fetchSummary('crypto', '2025-01-15')
    expect(result).toBeNull()
  })

  it('throws an error on non-404 server errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(serverErrorRes())
    await expect(fetchSummary('crypto', '2025-01-15')).rejects.toThrow()
  })

  it('builds the correct path for a different topic', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockReturnValue(jsonRes({}))
    await fetchSummary('finance', '2025-03-20')
    expect(spy).toHaveBeenCalledWith('/content/topics/finance/2025-03-20/summary.json')
  })
})

describe('fetchArticle', () => {
  afterEach(() => vi.restoreAllMocks())

  it('fetches from the correct content path', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockReturnValue(textRes(SAMPLE_ARTICLE))
    await fetchArticle('crypto', '2025-01-15')
    expect(spy).toHaveBeenCalledWith('/content/topics/crypto/2025-01-15/article.md')
  })

  it('returns the raw text string on a successful response', async () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(textRes(SAMPLE_ARTICLE))
    const result = await fetchArticle('crypto', '2025-01-15')
    expect(result).toBe(SAMPLE_ARTICLE)
  })

  it('returns null when the article is not found (404)', async () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(notFoundRes())
    const result = await fetchArticle('crypto', '2025-01-15')
    expect(result).toBeNull()
  })

  it('throws an error on non-404 server errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(serverErrorRes())
    await expect(fetchArticle('crypto', '2025-01-15')).rejects.toThrow()
  })

  it('builds the correct path for the ai topic', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockReturnValue(textRes(''))
    await fetchArticle('ai', '2025-01-15')
    expect(spy).toHaveBeenCalledWith('/content/topics/ai/2025-01-15/article.md')
  })
})

describe('fetchVideoMeta', () => {
  afterEach(() => vi.restoreAllMocks())

  it('fetches from the correct content path', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockReturnValue(jsonRes(SAMPLE_VIDEO_META))
    await fetchVideoMeta('crypto', '2025-01-15')
    expect(spy).toHaveBeenCalledWith('/content/topics/crypto/2025-01-15/video.json')
  })

  it('returns the parsed video metadata on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(jsonRes(SAMPLE_VIDEO_META))
    const result = await fetchVideoMeta('crypto', '2025-01-15')
    expect(result).toEqual(SAMPLE_VIDEO_META)
    expect(result.video_id).toBe('dQw4w9WgXcQ')
  })

  it('returns null when no video file exists (404)', async () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(notFoundRes())
    const result = await fetchVideoMeta('finance', '2025-01-15')
    expect(result).toBeNull()
  })

  it('throws an error on non-404 server errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(serverErrorRes())
    await expect(fetchVideoMeta('crypto', '2025-01-15')).rejects.toThrow()
  })
})

describe('fetchMetadata', () => {
  afterEach(() => vi.restoreAllMocks())

  it('fetches from the correct content path', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockReturnValue(jsonRes(SAMPLE_METADATA))
    await fetchMetadata('crypto', '2025-01-15')
    expect(spy).toHaveBeenCalledWith('/content/topics/crypto/2025-01-15/metadata.json')
  })

  it('returns the parsed metadata on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(jsonRes(SAMPLE_METADATA))
    const result = await fetchMetadata('crypto', '2025-01-15')
    expect(result).toEqual(SAMPLE_METADATA)
    expect(result.page_state).toBe('published')
  })

  it('returns null when no metadata file exists (404)', async () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(notFoundRes())
    const result = await fetchMetadata('ai', '2025-01-15')
    expect(result).toBeNull()
  })

  it('builds the correct path for the energy topic', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockReturnValue(jsonRes({}))
    await fetchMetadata('energy', '2026-04-01')
    expect(spy).toHaveBeenCalledWith('/content/topics/energy/2026-04-01/metadata.json')
  })
})
