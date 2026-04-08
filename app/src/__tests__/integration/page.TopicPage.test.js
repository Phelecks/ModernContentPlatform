/**
 * Integration tests — TopicPage rendering
 *
 * Tests the TopicPage component which redirects to today's topic/day page.
 *
 * Validates:
 *   - loading spinner is shown initially
 *   - successful API response triggers router redirect to topic-day route
 *   - failed API response shows the error state
 *   - component reacts to route param changes (topic slug change)
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import TopicPage from '@/pages/TopicPage.vue'

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

const CRYPTO_STATUS = {
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

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

async function createTestRouter(topicSlug = 'crypto') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/topics/:topicSlug', name: 'topic', component: TopicPage },
      {
        path: '/topics/:topicSlug/:dateKey',
        name: 'topic-day',
        component: { template: '<div class="topic-day-stub" />' }
      }
    ]
  })
  await router.push(`/topics/${topicSlug}`)
  await router.isReady()
  return router
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TopicPage — redirect to today', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('shows the loading spinner before the API responds', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonRes(CRYPTO_STATUS)))
    const router = await createTestRouter()
    const wrapper = mount(TopicPage, { global: { plugins: [router] } })
    // Spinner should be present before data loads
    expect(wrapper.find('.loading-spinner').exists()).toBe(true)
  })

  it('redirects to the topic-day route after a successful API response', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-15T12:00:00Z'))

    vi.stubGlobal('fetch', vi.fn(() => jsonRes(CRYPTO_STATUS)))
    const router = await createTestRouter()
    const wrapper = mount(TopicPage, { global: { plugins: [router] } })
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('topic-day')
    expect(router.currentRoute.value.params.topicSlug).toBe('crypto')
    expect(router.currentRoute.value.params.dateKey).toBe('2025-01-15')

    vi.useRealTimers()
  })

  it('shows the error state when the API call fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('Network error'))))
    const router = await createTestRouter()
    const wrapper = mount(TopicPage, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.find('.topic-page__error').exists()).toBe(true)
    expect(wrapper.find('.loading-spinner').exists()).toBe(false)
  })

  it('shows the error state when the API returns 404', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve(new Response('Not Found', { status: 404 }))
    ))
    const router = await createTestRouter('unknown-topic')
    const wrapper = mount(TopicPage, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.find('.topic-page__error').exists()).toBe(true)
  })

  it('renders the loading spinner for a different topic', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonRes(CRYPTO_STATUS)))
    const router = await createTestRouter('finance')
    const wrapper = mount(TopicPage, { global: { plugins: [router] } })
    // Before data loads, spinner should be visible
    expect(wrapper.find('.loading-spinner').exists()).toBe(true)
  })
})
