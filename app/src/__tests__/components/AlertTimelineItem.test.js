/**
 * Component tests — AlertTimelineItem
 *
 * Validates rendering of individual alert timeline items:
 *   - headline, summary, source name, source url
 *   - time display (relative)
 *   - severity-level CSS class (high / medium / low)
 *   - optional fields
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import AlertTimelineItem from '@/components/AlertTimelineItem.vue'

const BASE_ALERT = {
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

describe('AlertTimelineItem', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  // ---- Core rendering ----

  it('renders without errors', () => {
    const wrapper = mount(AlertTimelineItem, { props: { alert: BASE_ALERT } })
    expect(wrapper.exists()).toBe(true)
  })

  it('has the alert-timeline-item root class', () => {
    const wrapper = mount(AlertTimelineItem, { props: { alert: BASE_ALERT } })
    expect(wrapper.find('.alert-timeline-item').exists()).toBe(true)
  })

  it('renders the alert headline', () => {
    const wrapper = mount(AlertTimelineItem, { props: { alert: BASE_ALERT } })
    expect(wrapper.find('.alert-timeline-item__headline').text()).toBe('Bitcoin ETFs record inflows')
  })

  it('renders the summary text', () => {
    const wrapper = mount(AlertTimelineItem, { props: { alert: BASE_ALERT } })
    expect(wrapper.find('.alert-timeline-item__summary').text()).toContain('Large inflows reported')
  })

  it('renders the source name', () => {
    const wrapper = mount(AlertTimelineItem, { props: { alert: BASE_ALERT } })
    expect(wrapper.find('.alert-timeline-item__source').text()).toBe('CryptoNews')
  })

  it('renders a "Read more" link when source_url is provided', () => {
    const wrapper = mount(AlertTimelineItem, { props: { alert: BASE_ALERT } })
    const link = wrapper.find('.alert-timeline-item__link')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('https://example.com/btc-etf')
  })

  it('opens the source link in a new tab', () => {
    const wrapper = mount(AlertTimelineItem, { props: { alert: BASE_ALERT } })
    expect(wrapper.find('.alert-timeline-item__link').attributes('target')).toBe('_blank')
  })

  it('sets rel="noopener noreferrer" on the source link', () => {
    const wrapper = mount(AlertTimelineItem, { props: { alert: BASE_ALERT } })
    expect(wrapper.find('.alert-timeline-item__link').attributes('rel')).toBe('noopener noreferrer')
  })

  // ---- Optional fields ----

  it('does not render the summary element when summary_text is absent', () => {
    const wrapper = mount(AlertTimelineItem, {
      props: { alert: { ...BASE_ALERT, summary_text: undefined } }
    })
    expect(wrapper.find('.alert-timeline-item__summary').exists()).toBe(false)
  })

  it('does not render the source element when source_name is absent', () => {
    const wrapper = mount(AlertTimelineItem, {
      props: { alert: { ...BASE_ALERT, source_name: undefined } }
    })
    expect(wrapper.find('.alert-timeline-item__source').exists()).toBe(false)
  })

  it('does not render the read-more link when source_url is absent', () => {
    const wrapper = mount(AlertTimelineItem, {
      props: { alert: { ...BASE_ALERT, source_url: undefined } }
    })
    expect(wrapper.find('.alert-timeline-item__link').exists()).toBe(false)
  })

  // ---- Severity level classes ----

  it('applies the high severity class when severity_score >= 75', () => {
    const wrapper = mount(AlertTimelineItem, {
      props: { alert: { ...BASE_ALERT, severity_score: 80 } }
    })
    expect(wrapper.find('.alert-timeline-item--severity-high').exists()).toBe(true)
  })

  it('applies the medium severity class when severity_score is between 40 and 74', () => {
    const wrapper = mount(AlertTimelineItem, {
      props: { alert: { ...BASE_ALERT, severity_score: 60 } }
    })
    expect(wrapper.find('.alert-timeline-item--severity-medium').exists()).toBe(true)
  })

  it('applies the low severity class when severity_score is below 40', () => {
    const wrapper = mount(AlertTimelineItem, {
      props: { alert: { ...BASE_ALERT, severity_score: 20 } }
    })
    expect(wrapper.find('.alert-timeline-item--severity-low').exists()).toBe(true)
  })

  it('applies the high severity class at the boundary score of 75', () => {
    const wrapper = mount(AlertTimelineItem, {
      props: { alert: { ...BASE_ALERT, severity_score: 75 } }
    })
    expect(wrapper.find('.alert-timeline-item--severity-high').exists()).toBe(true)
  })

  it('applies the medium severity class at the boundary score of 40', () => {
    const wrapper = mount(AlertTimelineItem, {
      props: { alert: { ...BASE_ALERT, severity_score: 40 } }
    })
    expect(wrapper.find('.alert-timeline-item--severity-medium').exists()).toBe(true)
  })

  it('defaults to low severity when severity_score is 0', () => {
    const wrapper = mount(AlertTimelineItem, {
      props: { alert: { ...BASE_ALERT, severity_score: 0 } }
    })
    expect(wrapper.find('.alert-timeline-item--severity-low').exists()).toBe(true)
  })

  it('defaults to low severity when severity_score is missing', () => {
    const wrapper = mount(AlertTimelineItem, {
      props: { alert: { ...BASE_ALERT, severity_score: undefined } }
    })
    expect(wrapper.find('.alert-timeline-item--severity-low').exists()).toBe(true)
  })

  // ---- Time display ----

  it('renders a non-empty time string from event_at', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-15T14:35:00Z'))
    const wrapper = mount(AlertTimelineItem, { props: { alert: BASE_ALERT } })
    const time = wrapper.find('.alert-timeline-item__time')
    expect(time.exists()).toBe(true)
    expect(time.text().length).toBeGreaterThan(0)
  })

  it('renders "just now" for a very recent alert', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-15T14:30:20Z'))
    const wrapper = mount(AlertTimelineItem, { props: { alert: BASE_ALERT } })
    expect(wrapper.find('.alert-timeline-item__time').text()).toBe('just now')
  })

  it('renders a minutes-ago label for an alert a few minutes old', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-15T14:35:00Z'))
    const wrapper = mount(AlertTimelineItem, { props: { alert: BASE_ALERT } })
    expect(wrapper.find('.alert-timeline-item__time').text()).toBe('5m ago')
  })
})
