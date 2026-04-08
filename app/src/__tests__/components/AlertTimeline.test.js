/**
 * Component tests — AlertTimeline
 *
 * Validates timeline rendering for all states:
 *   - loading state
 *   - error state
 *   - empty state (no alerts)
 *   - populated state (one or more alerts)
 *   - has-more / load-more button behavior
 *   - count badge visibility
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import AlertTimeline from '@/components/AlertTimeline.vue'

const SAMPLE_ALERT = {
  id: 1,
  headline: 'Bitcoin ETFs record inflows',
  summary_text: 'Large inflows reported across major ETF products.',
  source_name: 'CryptoNews',
  source_url: 'https://example.com/btc-etf',
  severity_score: 60,
  importance_score: 82,
  confidence_score: 90,
  event_at: '2025-01-15T14:30:00Z'
}

const SAMPLE_ALERTS = [
  SAMPLE_ALERT,
  {
    id: 2,
    headline: 'Ethereum upgrade scheduled',
    summary_text: 'Next upgrade expected within weeks.',
    source_name: 'EthDaily',
    source_url: 'https://example.com/eth-upgrade',
    severity_score: 45,
    importance_score: 70,
    confidence_score: 88,
    event_at: '2025-01-15T13:00:00Z'
  }
]

describe('AlertTimeline', () => {
  // ---- Default / empty ----

  it('renders without errors with default props', () => {
    const wrapper = mount(AlertTimeline)
    expect(wrapper.exists()).toBe(true)
  })

  it('has the alert-timeline root class', () => {
    const wrapper = mount(AlertTimeline)
    expect(wrapper.find('.alert-timeline').exists()).toBe(true)
  })

  it('shows the "No alerts yet" message when alerts is empty and not loading', () => {
    const wrapper = mount(AlertTimeline, { props: { alerts: [], loading: false } })
    expect(wrapper.text()).toContain('No alerts yet for this day')
  })

  it('does not show the count badge when alerts array is empty', () => {
    const wrapper = mount(AlertTimeline, { props: { alerts: [] } })
    expect(wrapper.find('.alert-timeline__count').exists()).toBe(false)
  })

  // ---- Loading state ----

  it('shows the loading message when loading is true', () => {
    const wrapper = mount(AlertTimeline, { props: { alerts: [], loading: true } })
    expect(wrapper.text()).toContain('Loading alerts')
  })

  it('hides the "No alerts yet" message while loading', () => {
    const wrapper = mount(AlertTimeline, { props: { alerts: [], loading: true } })
    expect(wrapper.text()).not.toContain('No alerts yet for this day')
  })

  it('does not show the alert list while loading', () => {
    const wrapper = mount(AlertTimeline, { props: { alerts: SAMPLE_ALERTS, loading: true } })
    expect(wrapper.find('.alert-timeline__list').exists()).toBe(false)
  })

  // ---- Error state ----

  it('shows the error message when error is true', () => {
    const wrapper = mount(AlertTimeline, { props: { alerts: [], loading: false, error: true } })
    expect(wrapper.text()).toContain('Failed to load alerts')
  })

  it('applies the error modifier class to the error state container', () => {
    const wrapper = mount(AlertTimeline, { props: { alerts: [], loading: false, error: true } })
    expect(wrapper.find('.alert-timeline__state--error').exists()).toBe(true)
  })

  it('hides the "No alerts yet" message when error is true', () => {
    const wrapper = mount(AlertTimeline, { props: { alerts: [], loading: false, error: true } })
    expect(wrapper.text()).not.toContain('No alerts yet for this day')
  })

  // ---- Populated state ----

  it('renders an alert list when alerts are provided', () => {
    const wrapper = mount(AlertTimeline, { props: { alerts: SAMPLE_ALERTS } })
    expect(wrapper.find('.alert-timeline__list').exists()).toBe(true)
  })

  it('renders the correct number of alert items', () => {
    const wrapper = mount(AlertTimeline, { props: { alerts: SAMPLE_ALERTS } })
    const items = wrapper.findAll('.alert-timeline__list li')
    expect(items).toHaveLength(2)
  })

  it('renders the count badge when alerts are present', () => {
    const wrapper = mount(AlertTimeline, { props: { alerts: SAMPLE_ALERTS, loading: false } })
    expect(wrapper.find('.alert-timeline__count').exists()).toBe(true)
    expect(wrapper.find('.alert-timeline__count').text()).toBe('2')
  })

  it('hides the "No alerts yet" message when alerts are present', () => {
    const wrapper = mount(AlertTimeline, { props: { alerts: SAMPLE_ALERTS } })
    expect(wrapper.text()).not.toContain('No alerts yet for this day')
  })

  it('contains an AlertTimelineItem for each alert', () => {
    const wrapper = mount(AlertTimeline, { props: { alerts: SAMPLE_ALERTS } })
    const headlines = wrapper.findAll('.alert-timeline-item__headline')
    expect(headlines).toHaveLength(2)
  })

  // ---- Load-more button ----

  it('does not render the load-more button when hasMore is false', () => {
    const wrapper = mount(AlertTimeline, { props: { alerts: SAMPLE_ALERTS, hasMore: false } })
    expect(wrapper.find('.alert-timeline__load-more').exists()).toBe(false)
  })

  it('renders the load-more button when hasMore is true and not loading', () => {
    const wrapper = mount(AlertTimeline, { props: { alerts: SAMPLE_ALERTS, hasMore: true, loading: false } })
    expect(wrapper.find('.alert-timeline__load-more').exists()).toBe(true)
  })

  it('hides the load-more button while loading even if hasMore is true', () => {
    const wrapper = mount(AlertTimeline, { props: { alerts: SAMPLE_ALERTS, hasMore: true, loading: true } })
    expect(wrapper.find('.alert-timeline__load-more').exists()).toBe(false)
  })

  it('emits load-more when the button is clicked', async () => {
    const wrapper = mount(AlertTimeline, { props: { alerts: SAMPLE_ALERTS, hasMore: true, loading: false } })
    await wrapper.find('.alert-timeline__load-more').trigger('click')
    expect(wrapper.emitted('load-more')).toBeTruthy()
    expect(wrapper.emitted('load-more')).toHaveLength(1)
  })

  // ---- Title ----

  it('renders the "Live Alerts" heading', () => {
    const wrapper = mount(AlertTimeline)
    expect(wrapper.text()).toContain('Live Alerts')
  })
})
