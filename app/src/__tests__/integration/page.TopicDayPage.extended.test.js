/**
 * Integration tests — TopicDayPage extended scenarios
 *
 * Supplements page.TopicDayPage.test.js with additional scenarios:
 *   - VideoEmbed rendering when video_available is 1
 *   - Load-more timeline pagination
 *   - Navigation prev/next rendering
 *   - Route change (watch) reloads the page
 *   - Published state with all content available
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import TopicDayPage from '@/pages/TopicDayPage.vue'

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const NAV_WITH_DATES = { prev_date_key: '2025-01-14', next_date_key: '2025-01-16' }
const NAV_NO_DATES = { prev_date_key: null, next_date_key: null }

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

const TIMELINE_RESPONSE_PAGE1 = {
  alerts: [
    {
      id: 1,
      headline: 'Alert 1',
      summary_text: 'Summary 1.',
      source_name: 'Source1',
      source_url: 'https://example.com/1',
      severity_score: 60,
      importance_score: 82,
      confidence_score: 90,
      event_at: '2025-01-15T14:30:00Z'
    }
  ],
  total: 2,
  has_more: true
}

const TIMELINE_RESPONSE_PAGE2 = {
  alerts: [
    {
      id: 2,
      headline: 'Alert 2',
      summary_text: 'Summary 2.',
      source_name: 'Source2',
      source_url: 'https://example.com/2',
      severity_score: 40,
      importance_score: 65,
      confidence_score: 85,
      event_at: '2025-01-15T12:00:00Z'
    }
  ],
  total: 2,
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

/**
 * Build a fetch mock.
 * timelineResponses: array of responses returned in order for successive timeline calls.
 */
function buildFetch(statusData, {
  articleContent = null,
  videoMeta = null,
  navData = NAV_NO_DATES,
  timelineResponses = [TIMELINE_RESPONSE]
} = {}) {
  let timelineCallCount = 0
  return vi.fn((url) => {
    if (url.includes('/api/day-status/')) return jsonRes(statusData)
    if (url.includes('/api/navigation/')) return jsonRes(navData)
    if (url.includes('/api/timeline/')) {
      const response = timelineResponses[Math.min(timelineCallCount, timelineResponses.length - 1)]
      timelineCallCount++
      return jsonRes(response)
    }
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

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

async function createTestRouter(topicSlug = 'crypto', dateKey = '2025-01-15') {
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
// Tests
// ---------------------------------------------------------------------------

describe('TopicDayPage — video embed', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('does not render VideoEmbed when video_available is 0', async () => {
    vi.stubGlobal('fetch', buildFetch(PENDING_STATUS))
    const router = await createTestRouter()
    const wrapper = mount(TopicDayPage, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.find('.video-embed').exists()).toBe(false)
  })

  it('renders VideoEmbed when video_available is 1 and video.json loads', async () => {
    vi.stubGlobal('fetch', buildFetch(PUBLISHED_STATUS, {
      articleContent: ARTICLE_MARKDOWN,
      videoMeta: VIDEO_META
    }))
    const router = await createTestRouter()
    const wrapper = mount(TopicDayPage, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.find('.video-embed').exists()).toBe(true)
  })

  it('renders the YouTube iframe with the correct video ID', async () => {
    vi.stubGlobal('fetch', buildFetch(PUBLISHED_STATUS, {
      articleContent: ARTICLE_MARKDOWN,
      videoMeta: VIDEO_META
    }))
    const router = await createTestRouter()
    const wrapper = mount(TopicDayPage, { global: { plugins: [router] } })
    await flushPromises()
    const iframe = wrapper.find('iframe')
    expect(iframe.exists()).toBe(true)
    expect(iframe.attributes('src')).toContain('dQw4w9WgXcQ')
  })

  it('does not render VideoEmbed when video_available is 1 but video.json returns 404', async () => {
    vi.stubGlobal('fetch', buildFetch(PUBLISHED_STATUS, {
      articleContent: ARTICLE_MARKDOWN,
      videoMeta: null // 404 response for video.json
    }))
    const router = await createTestRouter()
    const wrapper = mount(TopicDayPage, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.find('.video-embed').exists()).toBe(false)
  })
})

describe('TopicDayPage — navigation', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('renders DateNavigator with prev/next links when navigation data is provided', async () => {
    vi.stubGlobal('fetch', buildFetch(PENDING_STATUS, { navData: NAV_WITH_DATES }))
    const router = await createTestRouter()
    const wrapper = mount(TopicDayPage, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.find('.date-navigator').exists()).toBe(true)
    // Links to adjacent dates should appear
    expect(wrapper.html()).toContain('2025-01-14')
    expect(wrapper.html()).toContain('2025-01-16')
  })

  it('renders the topic display name in the header', async () => {
    vi.stubGlobal('fetch', buildFetch(PENDING_STATUS))
    const router = await createTestRouter()
    const wrapper = mount(TopicDayPage, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.text()).toContain('Crypto')
  })

  it('renders the correct date in the date navigator', async () => {
    vi.stubGlobal('fetch', buildFetch(PENDING_STATUS))
    const router = await createTestRouter()
    const wrapper = mount(TopicDayPage, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.find('.date-navigator').exists()).toBe(true)
    expect(wrapper.text()).toContain('January 15, 2025')
  })
})

describe('TopicDayPage — timeline load-more', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('shows the load-more button when has_more is true', async () => {
    vi.stubGlobal('fetch', buildFetch(PENDING_STATUS, {
      timelineResponses: [TIMELINE_RESPONSE_PAGE1]
    }))
    const router = await createTestRouter()
    const wrapper = mount(TopicDayPage, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.find('.alert-timeline__load-more').exists()).toBe(true)
  })

  it('does not show the load-more button when has_more is false', async () => {
    vi.stubGlobal('fetch', buildFetch(PENDING_STATUS, {
      timelineResponses: [TIMELINE_RESPONSE]
    }))
    const router = await createTestRouter()
    const wrapper = mount(TopicDayPage, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.find('.alert-timeline__load-more').exists()).toBe(false)
  })

  it('loads additional alerts when load-more is clicked', async () => {
    vi.stubGlobal('fetch', buildFetch(PENDING_STATUS, {
      timelineResponses: [TIMELINE_RESPONSE_PAGE1, TIMELINE_RESPONSE_PAGE2]
    }))
    const router = await createTestRouter()
    const wrapper = mount(TopicDayPage, { global: { plugins: [router] } })
    await flushPromises()

    // Initially one alert visible
    expect(wrapper.findAll('.alert-timeline-item')).toHaveLength(1)

    // Click load more
    await wrapper.find('.alert-timeline__load-more').trigger('click')
    await flushPromises()

    // Now two alerts visible
    expect(wrapper.findAll('.alert-timeline-item')).toHaveLength(2)
  })

  it('hides the load-more button after all alerts are loaded', async () => {
    vi.stubGlobal('fetch', buildFetch(PENDING_STATUS, {
      timelineResponses: [TIMELINE_RESPONSE_PAGE1, TIMELINE_RESPONSE_PAGE2]
    }))
    const router = await createTestRouter()
    const wrapper = mount(TopicDayPage, { global: { plugins: [router] } })
    await flushPromises()

    await wrapper.find('.alert-timeline__load-more').trigger('click')
    await flushPromises()

    expect(wrapper.find('.alert-timeline__load-more').exists()).toBe(false)
  })
})

describe('TopicDayPage — published state with full content', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('renders both video and summary in published state', async () => {
    vi.stubGlobal('fetch', buildFetch(PUBLISHED_STATUS, {
      articleContent: ARTICLE_MARKDOWN,
      videoMeta: VIDEO_META
    }))
    const router = await createTestRouter()
    const wrapper = mount(TopicDayPage, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.find('.video-embed').exists()).toBe(true)
    expect(wrapper.find('.summary-section').exists()).toBe(true)
    expect(wrapper.find('.summary-placeholder').exists()).toBe(false)
  })

  it('shows the published banner in fully published state', async () => {
    vi.stubGlobal('fetch', buildFetch(PUBLISHED_STATUS, {
      articleContent: ARTICLE_MARKDOWN,
      videoMeta: VIDEO_META
    }))
    const router = await createTestRouter()
    const wrapper = mount(TopicDayPage, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.find('.page-state-banner--success').exists()).toBe(true)
  })
})
