/**
 * Integration tests — HomePage rendering
 *
 * Tests the HomePage component end-to-end by:
 *   - mounting it inside a real Vue Router instance
 *   - mocking global fetch to return seeded topic data
 *   - asserting correct rendering for the loaded, empty, and error states
 *
 * This layer verifies that the homepage correctly:
 *   - shows a loading spinner before data resolves
 *   - renders all 7 seeded topics as TopicCard components
 *   - shows an error message when the API call fails
 *   - renders each topic's display name
 *   - links each card to the correct /topics/:topicSlug route
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import HomePage from '@/pages/HomePage.vue'

// ---- Fixture data ----
//
// Keep a single fixture definition for homepage topic rendering tests.
// If/when mockD1 exports the canonical seeded topics fixture, replace
// createSeededTopics() with that import so these tests stay in sync.

function createSeededTopics() {
  return [
    { topic_slug: 'crypto',     display_name: 'Crypto',      description: 'Cryptocurrency markets, blockchain technology, and digital assets.',         sort_order: 1 },
    { topic_slug: 'finance',    display_name: 'Finance',     description: 'Global financial markets, equities, bonds, and macroeconomic indicators.',   sort_order: 2 },
    { topic_slug: 'economy',    display_name: 'Economy',     description: 'Macroeconomic trends, central bank policy, trade, and economic data.',       sort_order: 3 },
    { topic_slug: 'health',     display_name: 'Health',      description: 'Healthcare developments, medical research, public health, and biotech.',     sort_order: 4 },
    { topic_slug: 'ai',         display_name: 'AI',          description: 'Artificial intelligence breakthroughs, research, products, and policy.',     sort_order: 5 },
    { topic_slug: 'energy',     display_name: 'Energy',      description: 'Energy markets, renewables, oil and gas, and climate-related developments.', sort_order: 6 },
    { topic_slug: 'technology', display_name: 'Technology',  description: 'Technology industry news, products, infrastructure, and regulation.',        sort_order: 7 }
  ]
}

const SEEDED_TOPICS = Object.freeze(createSeededTopics())
// ---- Fetch mock helpers ----

function jsonRes(data, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' }
    })
  )
}

function buildFetch(topics = SEEDED_TOPICS, { failApi = false } = {}) {
  return vi.fn((url) => {
    if (failApi) return Promise.reject(new Error('Network error'))
    if (url.includes('/api/topics')) return jsonRes(topics)
    return Promise.resolve(new Response('Not Found', { status: 404 }))
  })
}

// ---- Router factory ----

async function createTestRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: HomePage },
      // Stub for topic links so router-link doesn't warn about missing routes
      { path: '/topics/:topicSlug', component: { template: '<div />' } }
    ]
  })
  await router.push('/')
  await router.isReady()
  return router
}

// ---- Tests ----

describe('HomePage — topic list rendering integration', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('shows the loading spinner before data resolves', async () => {
    vi.stubGlobal('fetch', buildFetch())
    const router = await createTestRouter()
    const wrapper = mount(HomePage, { global: { plugins: [router] } })
    expect(wrapper.find('.loading-spinner').exists()).toBe(true)
  })

  it('hides the loading spinner after data loads', async () => {
    vi.stubGlobal('fetch', buildFetch())
    const router = await createTestRouter()
    const wrapper = mount(HomePage, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.find('.loading-spinner').exists()).toBe(false)
  })

  it('renders all 7 seeded topics as topic cards', async () => {
    vi.stubGlobal('fetch', buildFetch())
    const router = await createTestRouter()
    const wrapper = mount(HomePage, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.findAll('.topic-card')).toHaveLength(7)
  })

  it('renders the Crypto topic card', async () => {
    vi.stubGlobal('fetch', buildFetch())
    const router = await createTestRouter()
    const wrapper = mount(HomePage, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.text()).toContain('Crypto')
  })

  it('renders all topic display names', async () => {
    vi.stubGlobal('fetch', buildFetch())
    const router = await createTestRouter()
    const wrapper = mount(HomePage, { global: { plugins: [router] } })
    await flushPromises()
    for (const topic of SEEDED_TOPICS) {
      expect(wrapper.text()).toContain(topic.display_name)
    }
  })

  it('each topic card links to the correct /topics/:topicSlug route', async () => {
    vi.stubGlobal('fetch', buildFetch())
    const router = await createTestRouter()
    const wrapper = mount(HomePage, { global: { plugins: [router] } })
    await flushPromises()
    const cards = wrapper.findAll('.topic-card')
    for (let i = 0; i < cards.length; i++) {
      const expectedSlug = SEEDED_TOPICS[i].topic_slug
      expect(cards[i].attributes('href')).toBe(`/topics/${expectedSlug}`)
    }
  })

  it('renders an empty topic grid when the API returns no topics', async () => {
    vi.stubGlobal('fetch', buildFetch([]))
    const router = await createTestRouter()
    const wrapper = mount(HomePage, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.findAll('.topic-card')).toHaveLength(0)
    expect(wrapper.find('.loading-spinner').exists()).toBe(false)
    expect(wrapper.find('.home-topics__error').exists()).toBe(false)
  })

  it('shows an error message when the API call fails', async () => {
    vi.stubGlobal('fetch', buildFetch([], { failApi: true }))
    const router = await createTestRouter()
    const wrapper = mount(HomePage, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.find('.home-topics__error').exists()).toBe(true)
    expect(wrapper.find('.loading-spinner').exists()).toBe(false)
  })

  it('renders the page heading', async () => {
    vi.stubGlobal('fetch', buildFetch())
    const router = await createTestRouter()
    const wrapper = mount(HomePage, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.text()).toContain('Modern Content Platform')
  })

  it('renders the topic section heading', async () => {
    vi.stubGlobal('fetch', buildFetch())
    const router = await createTestRouter()
    const wrapper = mount(HomePage, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.text()).toContain('Topics')
  })
})
