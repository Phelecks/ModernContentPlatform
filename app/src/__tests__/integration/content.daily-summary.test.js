/**
 * Integration tests — local daily summary generation flow
 *
 * Validates that:
 *   1. The generated content files for ai/2025-01-15 match the expected schema.
 *   2. The TopicDayPage correctly transitions from placeholder state to final
 *      summary state when served with the generated content.
 *
 * These tests act as acceptance criteria for the local summary generation
 * path described in docs/local-summary-generation.md.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import TopicDayPage from '@/pages/TopicDayPage.vue'

// ---------------------------------------------------------------------------
// Load generated content files from the repository content directory.
// These files are written by scripts/generate-daily-summary.js.
// process.cwd() is the app/ directory when vitest runs; content/ is one level up.
// ---------------------------------------------------------------------------
const REPO_ROOT = join(process.cwd(), '..')

function readContentFile(relPath) {
  return readFileSync(join(REPO_ROOT, 'content', relPath), 'utf8')
}

const AI_SUMMARY = JSON.parse(readContentFile('topics/ai/2025-01-15/summary.json'))
const AI_ARTICLE = readContentFile('topics/ai/2025-01-15/article.md')
const AI_METADATA = JSON.parse(readContentFile('topics/ai/2025-01-15/metadata.json'))

const CRYPTO_SUMMARY = JSON.parse(readContentFile('topics/crypto/2025-01-15/summary.json'))
const FINANCE_SUMMARY = JSON.parse(readContentFile('topics/finance/2025-01-15/summary.json'))

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------
const NAV_RESPONSE = { prev_date_key: null, next_date_key: null }

const TIMELINE_RESPONSE = {
  alerts: [
    {
      id: 1,
      headline: 'Major AI lab releases 70B open-weight model',
      summary_text: 'Apache 2.0 licence, enterprise interest.',
      source_name: 'AIInsider',
      source_url: 'https://example.com',
      severity_score: 45,
      importance_score: 78,
      confidence_score: 92,
      event_at: '2025-01-15T10:00:00Z'
    }
  ],
  total: 1,
  has_more: false
}

const AI_DAY_STATUS_READY = {
  topic_slug: 'ai',
  date_key: '2025-01-15',
  page_state: 'ready',
  display_name: 'AI',
  alert_count: 3,
  cluster_count: 1,
  summary_available: 1,
  video_available: 0,
  article_available: 1,
  prev_date_key: null,
  next_date_key: null,
  published_at: null
}

const AI_DAY_STATUS_PENDING = {
  ...AI_DAY_STATUS_READY,
  page_state: 'pending',
  summary_available: 0,
  article_available: 0
}

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
  return Promise.resolve(new Response(text, { status }))
}

function buildFetch(statusData, { articleContent = AI_ARTICLE } = {}) {
  return vi.fn((url) => {
    if (url.includes('/api/day-status/')) return jsonRes(statusData)
    if (url.includes('/api/navigation/')) return jsonRes(NAV_RESPONSE)
    if (url.includes('/api/timeline/')) return jsonRes(TIMELINE_RESPONSE)
    if (url.endsWith('/article.md')) {
      return articleContent
        ? textRes(articleContent)
        : Promise.resolve(new Response('', { status: 404 }))
    }
    return Promise.resolve(new Response('Not Found', { status: 404 }))
  })
}

async function createTestRouter(topicSlug = 'ai', dateKey = '2025-01-15') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/topics/:topicSlug/:dateKey', component: TopicDayPage },
      { path: '/topics/:topicSlug', component: { template: '<div />' } }
    ]
  })
  await router.push(`/topics/${topicSlug}/${dateKey}`)
  await router.isReady()
  return router
}

// ---------------------------------------------------------------------------
// Schema validation helpers
// ---------------------------------------------------------------------------

function hasDailySummaryShape(summary) {
  return (
    typeof summary.topic_slug === 'string' &&
    typeof summary.date_key === 'string' &&
    typeof summary.headline === 'string' && summary.headline.length >= 5 &&
    typeof summary.overview === 'string' && summary.overview.length >= 20 &&
    Array.isArray(summary.key_events) && summary.key_events.length >= 1 &&
    ['bullish', 'bearish', 'neutral', 'mixed'].includes(summary.sentiment) &&
    typeof summary.topic_score === 'number' &&
    summary.topic_score >= 0 && summary.topic_score <= 100
  )
}

function hasKeyEventShape(event) {
  return (
    typeof event.title === 'string' && event.title.length >= 5 &&
    typeof event.significance === 'string' && event.significance.length >= 20 &&
    typeof event.importance_score === 'number' &&
    event.importance_score >= 0 && event.importance_score <= 100
  )
}

function hasMetadataShape(metadata) {
  return (
    typeof metadata.topic_slug === 'string' &&
    typeof metadata.date_key === 'string' &&
    typeof metadata.page_state === 'string' &&
    typeof metadata.article_path === 'string' &&
    typeof metadata.summary_path === 'string' &&
    'video_path' in metadata
  )
}

// ---------------------------------------------------------------------------
// Tests: generated content file schema
// ---------------------------------------------------------------------------

describe('Generated content — ai/2025-01-15 schema validation', () => {
  it('summary.json has the required daily summary fields', () => {
    expect(hasDailySummaryShape(AI_SUMMARY)).toBe(true)
  })

  it('summary.json topic_slug matches the expected topic', () => {
    expect(AI_SUMMARY.topic_slug).toBe('ai')
  })

  it('summary.json date_key is in YYYY-MM-DD format', () => {
    expect(AI_SUMMARY.date_key).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('summary.json key_events contains at least one event', () => {
    expect(AI_SUMMARY.key_events.length).toBeGreaterThanOrEqual(1)
  })

  it('summary.json every key_event has required fields', () => {
    for (const event of AI_SUMMARY.key_events) {
      expect(hasKeyEventShape(event)).toBe(true)
    }
  })

  it('summary.json sentiment is a valid value', () => {
    expect(['bullish', 'bearish', 'neutral', 'mixed']).toContain(AI_SUMMARY.sentiment)
  })

  it('summary.json topic_score is between 0 and 100', () => {
    expect(AI_SUMMARY.topic_score).toBeGreaterThanOrEqual(0)
    expect(AI_SUMMARY.topic_score).toBeLessThanOrEqual(100)
  })

  it('summary.json has an article-level sources array', () => {
    expect(Array.isArray(AI_SUMMARY.sources)).toBe(true)
    expect(AI_SUMMARY.sources.length).toBeGreaterThanOrEqual(1)
  })

  it('summary.json sources contain valid source objects', () => {
    for (const src of AI_SUMMARY.sources) {
      expect(typeof src.source_name).toBe('string')
      expect(src.source_name.length).toBeGreaterThan(0)
    }
  })

  it('summary.json has a source_confidence_note', () => {
    expect(typeof AI_SUMMARY.source_confidence_note).toBe('string')
    expect(AI_SUMMARY.source_confidence_note.length).toBeGreaterThan(0)
  })

  it('summary.json key_events have section-level sources', () => {
    for (const event of AI_SUMMARY.key_events) {
      expect(Array.isArray(event.sources)).toBe(true)
      expect(event.sources.length).toBeGreaterThanOrEqual(1)
      for (const src of event.sources) {
        expect(typeof src.source_name).toBe('string')
        expect(src.source_name.length).toBeGreaterThan(0)
      }
    }
  })

  it('article.md is a non-empty string', () => {
    expect(typeof AI_ARTICLE).toBe('string')
    expect(AI_ARTICLE.trim().length).toBeGreaterThan(0)
  })

  it('article.md starts with a markdown heading', () => {
    expect(AI_ARTICLE.trimStart()).toMatch(/^#/)
  })

  it('metadata.json has the required metadata fields', () => {
    expect(hasMetadataShape(AI_METADATA)).toBe(true)
  })

  it('metadata.json page_state is a valid publish state', () => {
    expect(['pending', 'ready', 'published', 'error']).toContain(AI_METADATA.page_state)
  })

  it('metadata.json article_path points to the correct file', () => {
    expect(AI_METADATA.article_path).toContain('ai/2025-01-15/article.md')
  })

  it('metadata.json summary_path points to the correct file', () => {
    expect(AI_METADATA.summary_path).toContain('ai/2025-01-15/summary.json')
  })
})

// ---------------------------------------------------------------------------
// Tests: frontend state transition
// ---------------------------------------------------------------------------

describe('Frontend state transition — placeholder → final summary', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows SummaryPlaceholder before generate-daily-summary runs (pending state)', async () => {
    vi.stubGlobal('fetch', buildFetch(AI_DAY_STATUS_PENDING, { articleContent: null }))
    const router = await createTestRouter()
    const wrapper = mount(TopicDayPage, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.find('.summary-placeholder').exists()).toBe(true)
    expect(wrapper.find('.summary-section').exists()).toBe(false)
  })

  it('shows SummarySection after generate-daily-summary runs (ready state with article)', async () => {
    vi.stubGlobal('fetch', buildFetch(AI_DAY_STATUS_READY))
    const router = await createTestRouter()
    const wrapper = mount(TopicDayPage, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.find('.summary-section').exists()).toBe(true)
    expect(wrapper.find('.summary-placeholder').exists()).toBe(false)
  })

  it('shows the correct banner message in ready state', async () => {
    vi.stubGlobal('fetch', buildFetch(AI_DAY_STATUS_READY))
    const router = await createTestRouter()
    const wrapper = mount(TopicDayPage, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.text()).toContain('Summary ready')
  })

  it('renders the generated article headline in the summary body', async () => {
    vi.stubGlobal('fetch', buildFetch(AI_DAY_STATUS_READY))
    const router = await createTestRouter()
    const wrapper = mount(TopicDayPage, { global: { plugins: [router] } })
    await flushPromises()
    // The article.md content should appear in the rendered SummarySection
    expect(wrapper.find('.summary-section').exists()).toBe(true)
    // Verify some content from the generated article is present
    expect(wrapper.text()).toContain('Open-Source Model Release')
  })

  it('still shows the alert timeline alongside the generated summary', async () => {
    vi.stubGlobal('fetch', buildFetch(AI_DAY_STATUS_READY))
    const router = await createTestRouter()
    const wrapper = mount(TopicDayPage, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.find('.alert-timeline').exists()).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Tests: example Crypto and Finance summary payloads
// These validate that the committed example content files conform to the
// full daily_summary schema (schemas/ai/daily_summary.json) and can serve
// as reference payloads for the OpenAI daily summary generation flow.
// ---------------------------------------------------------------------------

describe('Example payload — crypto/2025-01-15 schema validation', () => {
  it('summary.json has the required daily summary fields', () => {
    expect(hasDailySummaryShape(CRYPTO_SUMMARY)).toBe(true)
  })

  it('summary.json topic_slug is crypto', () => {
    expect(CRYPTO_SUMMARY.topic_slug).toBe('crypto')
  })

  it('summary.json date_key is in YYYY-MM-DD format', () => {
    expect(CRYPTO_SUMMARY.date_key).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('summary.json sentiment is bullish', () => {
    expect(CRYPTO_SUMMARY.sentiment).toBe('bullish')
  })

  it('summary.json topic_score is between 0 and 100', () => {
    expect(CRYPTO_SUMMARY.topic_score).toBeGreaterThanOrEqual(0)
    expect(CRYPTO_SUMMARY.topic_score).toBeLessThanOrEqual(100)
  })

  it('summary.json key_events contains at least one event', () => {
    expect(CRYPTO_SUMMARY.key_events.length).toBeGreaterThanOrEqual(1)
  })

  it('summary.json every key_event has required fields', () => {
    for (const event of CRYPTO_SUMMARY.key_events) {
      expect(hasKeyEventShape(event)).toBe(true)
    }
  })

  it('summary.json key_events have section-level sources', () => {
    for (const event of CRYPTO_SUMMARY.key_events) {
      expect(Array.isArray(event.sources)).toBe(true)
      expect(event.sources.length).toBeGreaterThanOrEqual(1)
      for (const src of event.sources) {
        expect(typeof src.source_name).toBe('string')
        expect(src.source_name.length).toBeGreaterThan(0)
      }
    }
  })

  it('summary.json has an article-level sources array', () => {
    expect(Array.isArray(CRYPTO_SUMMARY.sources)).toBe(true)
    expect(CRYPTO_SUMMARY.sources.length).toBeGreaterThan(0)
  })

  it('summary.json sources contain valid source objects', () => {
    for (const src of CRYPTO_SUMMARY.sources) {
      expect(typeof src.source_name).toBe('string')
      expect(src.source_name.length).toBeGreaterThan(0)
    }
  })

  it('summary.json has a source_confidence_note', () => {
    expect(typeof CRYPTO_SUMMARY.source_confidence_note).toBe('string')
    expect(CRYPTO_SUMMARY.source_confidence_note.length).toBeGreaterThan(0)
  })
})

describe('Example payload — finance/2025-01-15 schema validation', () => {
  it('summary.json has the required daily summary fields', () => {
    expect(hasDailySummaryShape(FINANCE_SUMMARY)).toBe(true)
  })

  it('summary.json topic_slug is finance', () => {
    expect(FINANCE_SUMMARY.topic_slug).toBe('finance')
  })

  it('summary.json date_key is in YYYY-MM-DD format', () => {
    expect(FINANCE_SUMMARY.date_key).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('summary.json sentiment is bearish', () => {
    expect(FINANCE_SUMMARY.sentiment).toBe('bearish')
  })

  it('summary.json topic_score is between 0 and 100', () => {
    expect(FINANCE_SUMMARY.topic_score).toBeGreaterThanOrEqual(0)
    expect(FINANCE_SUMMARY.topic_score).toBeLessThanOrEqual(100)
  })

  it('summary.json key_events contains at least one event', () => {
    expect(FINANCE_SUMMARY.key_events.length).toBeGreaterThanOrEqual(1)
  })

  it('summary.json every key_event has required fields', () => {
    for (const event of FINANCE_SUMMARY.key_events) {
      expect(hasKeyEventShape(event)).toBe(true)
    }
  })

  it('summary.json key_events have section-level sources', () => {
    for (const event of FINANCE_SUMMARY.key_events) {
      expect(Array.isArray(event.sources)).toBe(true)
      expect(event.sources.length).toBeGreaterThanOrEqual(1)
      for (const src of event.sources) {
        expect(typeof src.source_name).toBe('string')
        expect(src.source_name.length).toBeGreaterThan(0)
      }
    }
  })

  it('summary.json has an article-level sources array', () => {
    expect(Array.isArray(FINANCE_SUMMARY.sources)).toBe(true)
    expect(FINANCE_SUMMARY.sources.length).toBeGreaterThan(0)
  })

  it('summary.json sources contain valid source objects', () => {
    for (const src of FINANCE_SUMMARY.sources) {
      expect(typeof src.source_name).toBe('string')
      expect(src.source_name.length).toBeGreaterThan(0)
    }
  })

  it('summary.json has a source_confidence_note', () => {
    expect(typeof FINANCE_SUMMARY.source_confidence_note).toBe('string')
    expect(FINANCE_SUMMARY.source_confidence_note.length).toBeGreaterThan(0)
  })
})
