/**
 * Integration tests — OperatorDashboardPage rendering
 *
 * Tests the OperatorDashboardPage component by:
 *   - mounting it inside a real Vue Router instance
 *   - mocking global fetch to return dashboard data
 *   - asserting correct rendering for auth gate, loaded, empty, and error states
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import OperatorDashboardPage from '@/pages/OperatorDashboardPage.vue'

// ---- Fixture data ----

function createDashboardData(overrides = {}) {
  return {
    recent_workflow_runs: [],
    failed_workflow_events: [],
    pending_publish_jobs: [],
    failed_publish_jobs: [],
    last_publish_per_topic: [
      { topic_slug: 'crypto', date_key: '2025-01-15', page_state: 'published', published_at: '2025-01-15T23:00:00Z' },
      { topic_slug: 'finance', date_key: '2025-01-15', page_state: 'published', published_at: '2025-01-15T23:00:00Z' }
    ],
    social_publish_failures: [],
    ai_usage_summary: {
      total_calls: 0,
      total_tokens: 0,
      error_count: 0,
      recent: []
    },
    ...overrides
  }
}

// ---- Fetch mock helpers ----

function jsonRes(data, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' }
    })
  )
}

function buildFetch(data = createDashboardData(), { failAuth = false, failApi = false } = {}) {
  return vi.fn((url) => {
    if (failApi) return Promise.reject(new Error('Network error'))
    if (failAuth) {
      return Promise.resolve(
        new Response(JSON.stringify({ error: 'Invalid write key' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    }
    if (url.includes('/api/internal/operator-dashboard')) return jsonRes(data)
    return Promise.resolve(new Response('Not Found', { status: 404 }))
  })
}

// ---- Router factory ----

async function createTestRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/ops', component: OperatorDashboardPage }
    ]
  })
  await router.push('/ops')
  await router.isReady()
  return router
}

// ---- Tests ----

describe('OperatorDashboardPage — rendering integration', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('shows the auth gate initially', async () => {
    const router = await createTestRouter()
    const wrapper = mount(OperatorDashboardPage, { global: { plugins: [router] } })
    expect(wrapper.find('.ops-auth').exists()).toBe(true)
    expect(wrapper.find('.ops-auth__input').exists()).toBe(true)
    expect(wrapper.find('.ops-auth__btn').exists()).toBe(true)
  })

  it('shows an error when submitting empty key', async () => {
    const router = await createTestRouter()
    const wrapper = mount(OperatorDashboardPage, { global: { plugins: [router] } })
    await wrapper.find('.ops-auth__form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('.ops-auth__error').text()).toContain('enter a write key')
  })

  it('shows auth error on 403 response', async () => {
    vi.stubGlobal('fetch', buildFetch(null, { failAuth: true }))
    const router = await createTestRouter()
    const wrapper = mount(OperatorDashboardPage, { global: { plugins: [router] } })
    await wrapper.find('.ops-auth__input').setValue('wrong-key')
    await wrapper.find('.ops-auth__form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('.ops-auth__error').text()).toContain('Authentication failed')
  })

  it('shows dashboard data after successful authentication', async () => {
    vi.stubGlobal('fetch', buildFetch())
    const router = await createTestRouter()
    const wrapper = mount(OperatorDashboardPage, { global: { plugins: [router] } })
    await wrapper.find('.ops-auth__input').setValue('valid-key')
    await wrapper.find('.ops-auth__form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('.ops-auth').exists()).toBe(false)
    expect(wrapper.find('.ops-sections').exists()).toBe(true)
  })

  it('renders the page title', async () => {
    const router = await createTestRouter()
    const wrapper = mount(OperatorDashboardPage, { global: { plugins: [router] } })
    expect(wrapper.text()).toContain('Operator Dashboard')
  })

  it('renders Last Publish Per Topic section with data', async () => {
    vi.stubGlobal('fetch', buildFetch())
    const router = await createTestRouter()
    const wrapper = mount(OperatorDashboardPage, { global: { plugins: [router] } })
    await wrapper.find('.ops-auth__input').setValue('valid-key')
    await wrapper.find('.ops-auth__form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Last Publish Per Topic')
    expect(wrapper.text()).toContain('crypto')
    expect(wrapper.text()).toContain('finance')
  })

  it('renders empty state for workflow runs', async () => {
    vi.stubGlobal('fetch', buildFetch())
    const router = await createTestRouter()
    const wrapper = mount(OperatorDashboardPage, { global: { plugins: [router] } })
    await wrapper.find('.ops-auth__input').setValue('valid-key')
    await wrapper.find('.ops-auth__form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('No recent workflow runs')
  })

  it('renders empty success state for failures', async () => {
    vi.stubGlobal('fetch', buildFetch())
    const router = await createTestRouter()
    const wrapper = mount(OperatorDashboardPage, { global: { plugins: [router] } })
    await wrapper.find('.ops-auth__input').setValue('valid-key')
    await wrapper.find('.ops-auth__form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('No recent failures')
    expect(wrapper.text()).toContain('No failed publish jobs')
    expect(wrapper.text()).toContain('No social publish failures')
  })

  it('renders AI usage summary stats', async () => {
    const data = createDashboardData({
      ai_usage_summary: {
        total_calls: 42,
        total_tokens: 15000,
        error_count: 3,
        recent: []
      }
    })
    vi.stubGlobal('fetch', buildFetch(data))
    const router = await createTestRouter()
    const wrapper = mount(OperatorDashboardPage, { global: { plugins: [router] } })
    await wrapper.find('.ops-auth__input').setValue('valid-key')
    await wrapper.find('.ops-auth__form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('42')
    expect(wrapper.text()).toContain('15,000')
    expect(wrapper.text()).toContain('3')
    expect(wrapper.text()).toContain('Total Calls')
    expect(wrapper.text()).toContain('Total Tokens')
    expect(wrapper.text()).toContain('Errors')
  })

  it('renders workflow runs table when data exists', async () => {
    const data = createDashboardData({
      recent_workflow_runs: [
        {
          id: 1,
          workflow_name: 'Daily — Orchestrator',
          execution_id: 'exec-1',
          topic_slug: 'crypto',
          date_key: '2025-01-15',
          event_type: 'completed',
          module_name: '09 Publish to GitHub',
          error_message: null,
          created_at: '2025-01-15T23:00:00Z'
        }
      ]
    })
    vi.stubGlobal('fetch', buildFetch(data))
    const router = await createTestRouter()
    const wrapper = mount(OperatorDashboardPage, { global: { plugins: [router] } })
    await wrapper.find('.ops-auth__input').setValue('valid-key')
    await wrapper.find('.ops-auth__form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Daily — Orchestrator')
    expect(wrapper.text()).toContain('completed')
  })

  it('renders failed workflow events with error messages', async () => {
    const data = createDashboardData({
      failed_workflow_events: [
        {
          id: 2,
          workflow_name: 'Intraday — Orchestrator',
          execution_id: 'exec-2',
          topic_slug: 'crypto',
          date_key: '2025-01-15',
          event_type: 'error',
          module_name: '07 D1 Persistence',
          error_message: 'D1 write timeout',
          created_at: '2025-01-15T22:00:00Z'
        }
      ]
    })
    vi.stubGlobal('fetch', buildFetch(data))
    const router = await createTestRouter()
    const wrapper = mount(OperatorDashboardPage, { global: { plugins: [router] } })
    await wrapper.find('.ops-auth__input').setValue('valid-key')
    await wrapper.find('.ops-auth__form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('D1 write timeout')
    expect(wrapper.text()).toContain('Intraday — Orchestrator')
  })

  it('shows error message on network failure', async () => {
    vi.stubGlobal('fetch', buildFetch(null, { failApi: true }))
    const router = await createTestRouter()
    const wrapper = mount(OperatorDashboardPage, { global: { plugins: [router] } })
    await wrapper.find('.ops-auth__input').setValue('valid-key')
    await wrapper.find('.ops-auth__form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('.ops-dashboard__error').exists()).toBe(true)
    expect(wrapper.text()).toContain('Failed to load dashboard data')
  })

  it('renders all section headings', async () => {
    vi.stubGlobal('fetch', buildFetch())
    const router = await createTestRouter()
    const wrapper = mount(OperatorDashboardPage, { global: { plugins: [router] } })
    await wrapper.find('.ops-auth__input').setValue('valid-key')
    await wrapper.find('.ops-auth__form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Last Publish Per Topic')
    expect(wrapper.text()).toContain('Recent Workflow Runs')
    expect(wrapper.text()).toContain('Failed Workflow Events')
    expect(wrapper.text()).toContain('Pending Publish Jobs')
    expect(wrapper.text()).toContain('Failed Publish Jobs')
    expect(wrapper.text()).toContain('Social Publish Failures')
    expect(wrapper.text()).toContain('AI Usage Summary')
  })
})
