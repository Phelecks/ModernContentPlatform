/**
 * Integration tests — TopicDayPage rendering
 *
 * Tests the TopicDayPage component end-to-end by:
 *   - mounting it inside a real Vue Router instance
 *   - mocking global fetch to return seeded API and content responses
 *   - asserting correct rendering for pending, ready, and published page states
 *
 * This layer verifies that the page correctly:
 *   - shows a loading spinner initially
 *   - shows SummaryPlaceholder when no article is available
 *   - shows SummarySection when the article is available and loaded
 *   - shows an error state when API calls fail
 *   - renders the correct banner message for each page state
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import TopicDayPage from '@/pages/TopicDayPage.vue'

// ---- Fixture data ----

const NAV_RESPONSE = { prev_date_key: null, next_date_key: null }

const TIMELINE_RESPONSE = {
  alerts: [
    {
      id: 1,
      headline: 'Bitcoin ETFs record inflows',
      summary_text: 'Large inflows reported.',
      source_name: 'CryptoNews',
      source_url: 'https://example.com',
      severity_score: 60,
      importance_score: 82,
      confidence_score: 90,
      event_at: '2025-01-15T14:30:00Z'
    }
  ],
  total: 1,
  has_more: false
}

const PENDING_STATUS = {
  topic_slug: 'crypto',
  date_key: '2025-01-15',
  page_state: 'pending',
  display_name: 'Crypto',
  alert_count: 0,
  cluster_count: 0,
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
  alert_count: 3,
  summary_available: 1
}

const PUBLISHED_STATUS = {
  topic_slug: 'crypto',
  date_key: '2025-01-15',
  page_state: 'published',
  display_name: 'Crypto',
  alert_count: 3,
  cluster_count: 1,
  summary_available: 1,
  video_available: 1,
  article_available: 1,
  prev_date_key: null,
  next_date_key: null,
  published_at: '2025-01-15T23:00:00Z'
}

const ARTICLE_MARKDOWN = '# Daily Summary\nCrypto markets moved significantly today.'

const VIDEO_META = { video_id: 'dQw4w9WgXcQ', title: 'Crypto Daily — January 15 2025' }

// ---- Fetch mock helpers ----

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

/**
 * Build a fetch mock that serves the given day-status and optional content.
 */
function buildFetch(statusData, { articleContent = ARTICLE_MARKDOWN, videoMeta = VIDEO_META, failApi = false } = {}) {
  return vi.fn((url) => {
    if (failApi) return Promise.reject(new Error('Network error'))

    if (url.includes('/api/day-status/')) return jsonRes(statusData)
    if (url.includes('/api/navigation/')) return jsonRes(NAV_RESPONSE)
    if (url.includes('/api/timeline/')) return jsonRes(TIMELINE_RESPONSE)

    if (url.endsWith('/article.md')) {
      return articleContent
        ? textRes(articleContent)
        : Promise.resolve(new Response('', { status: 404 }))
    }
    if (url.endsWith('/video.json')) {
      return videoMeta
        ? jsonRes(videoMeta)
        : Promise.resolve(new Response('', { status: 404 }))
    }

    return Promise.resolve(new Response('Not Found', { status: 404 }))
  })
}

// ---- Router factory ----

async function createTestRouter(topicSlug = 'crypto', dateKey = '2025-01-15') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/topics/:topicSlug/:dateKey', component: TopicDayPage },
      // Stub for the topic-level link in TopicDayHeader — prevents spurious router warnings
      { path: '/topics/:topicSlug', component: { template: '<div />' } }
    ]
  })
  await router.push(`/topics/${topicSlug}/${dateKey}`)
  await router.isReady()
  return router
}

// ---- Tests ----

describe('TopicDayPage — page rendering integration', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the loading spinner on initial mount before data resolves', async () => {
    vi.stubGlobal('fetch', buildFetch(PENDING_STATUS))
    const router = await createTestRouter()
    const wrapper = mount(TopicDayPage, { global: { plugins: [router] } })
    expect(wrapper.find('.loading-spinner').exists()).toBe(true)
  })

  it('hides the loading spinner once data has loaded', async () => {
    vi.stubGlobal('fetch', buildFetch(PENDING_STATUS))
    const router = await createTestRouter()
    const wrapper = mount(TopicDayPage, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.find('.loading-spinner').exists()).toBe(false)
  })

  it('shows SummaryPlaceholder when page state is pending', async () => {
    vi.stubGlobal('fetch', buildFetch(PENDING_STATUS))
    const router = await createTestRouter()
    const wrapper = mount(TopicDayPage, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.find('.summary-placeholder').exists()).toBe(true)
    expect(wrapper.find('.summary-section').exists()).toBe(false)
  })

  it('shows SummaryPlaceholder when page state is ready but article is unavailable', async () => {
    vi.stubGlobal('fetch', buildFetch(READY_STATUS))
    const router = await createTestRouter()
    const wrapper = mount(TopicDayPage, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.find('.summary-placeholder').exists()).toBe(true)
  })

  it('shows SummarySection when page state is published and article is available', async () => {
    vi.stubGlobal('fetch', buildFetch(PUBLISHED_STATUS))
    const router = await createTestRouter()
    const wrapper = mount(TopicDayPage, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.find('.summary-section').exists()).toBe(true)
    expect(wrapper.find('.summary-placeholder').exists()).toBe(false)
  })

  it('shows SummaryPlaceholder when article_available is 1 but content fetch returns 404', async () => {
    vi.stubGlobal('fetch', buildFetch(PUBLISHED_STATUS, { articleContent: null }))
    const router = await createTestRouter()
    const wrapper = mount(TopicDayPage, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.find('.summary-placeholder').exists()).toBe(true)
  })

  it('renders the correct banner message for pending state', async () => {
    vi.stubGlobal('fetch', buildFetch(PENDING_STATUS))
    const router = await createTestRouter()
    const wrapper = mount(TopicDayPage, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.text()).toContain('Live — summary pending end of day')
  })

  it('renders the correct banner message for ready state', async () => {
    vi.stubGlobal('fetch', buildFetch(READY_STATUS))
    const router = await createTestRouter()
    const wrapper = mount(TopicDayPage, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.text()).toContain('Summary ready')
  })

  it('renders the correct banner message for published state', async () => {
    vi.stubGlobal('fetch', buildFetch(PUBLISHED_STATUS))
    const router = await createTestRouter()
    const wrapper = mount(TopicDayPage, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.text()).toContain('Published')
  })

  it('shows the error state when the API call fails', async () => {
    vi.stubGlobal('fetch', buildFetch(null, { failApi: true }))
    const router = await createTestRouter()
    const wrapper = mount(TopicDayPage, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.find('.topic-day-page__error').exists()).toBe(true)
    expect(wrapper.find('.loading-spinner').exists()).toBe(false)
  })

  it('renders timeline alerts after the page shell loads', async () => {
    vi.stubGlobal('fetch', buildFetch(PENDING_STATUS))
    const router = await createTestRouter()
    const wrapper = mount(TopicDayPage, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.find('.alert-timeline').exists()).toBe(true)
  })
})
