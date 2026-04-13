/**
 * Component tests — AlertTimelineItem
 *
 * Validates rendering of individual alert timeline items:
 *   - headline, summary, source name, source url
 *   - time display (relative)
 *   - severity-level CSS class (high / medium / low)
 *   - optional fields
 *   - source badge rendering by type
 *   - primary source in meta row vs supporting sources section
 *   - supporting sources from supporting_sources array and source_metadata_json
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

  // ---- Source type badge ----

  it('renders a source type badge when source_type is provided', () => {
    const wrapper = mount(AlertTimelineItem, {
      props: { alert: { ...BASE_ALERT, source_type: 'rss' } }
    })
    expect(wrapper.find('.alert-timeline-item__type-badge').exists()).toBe(true)
    expect(wrapper.find('.source-badge').exists()).toBe(true)
  })

  it('displays the mapped label for source_type "rss"', () => {
    const wrapper = mount(AlertTimelineItem, {
      props: { alert: { ...BASE_ALERT, source_type: 'rss' } }
    })
    expect(wrapper.find('.source-badge').text()).toBe('News')
  })

  it('displays the mapped label for source_type "api"', () => {
    const wrapper = mount(AlertTimelineItem, {
      props: { alert: { ...BASE_ALERT, source_type: 'api' } }
    })
    expect(wrapper.find('.source-badge').text()).toBe('Data')
  })

  it('does not render the source type badge when source_type is absent', () => {
    const wrapper = mount(AlertTimelineItem, {
      props: { alert: { ...BASE_ALERT, source_type: undefined } }
    })
    expect(wrapper.find('.alert-timeline-item__type-badge').exists()).toBe(false)
  })

  // ---- Supporting sources ----

  it('renders supporting sources when provided', () => {
    const wrapper = mount(AlertTimelineItem, {
      props: {
        alert: {
          ...BASE_ALERT,
          supporting_sources: [
            { source_name: 'CoinGecko API', source_url: 'https://api.coingecko.com', source_type: 'api' }
          ]
        }
      }
    })
    expect(wrapper.find('.alert-timeline-item__supporting').exists()).toBe(true)
    expect(wrapper.text()).toContain('CoinGecko API')
  })

  it('renders multiple supporting sources', () => {
    const wrapper = mount(AlertTimelineItem, {
      props: {
        alert: {
          ...BASE_ALERT,
          supporting_sources: [
            { source_name: 'Source A', source_url: null },
            { source_name: 'Source B', source_url: 'https://example.com/b' }
          ]
        }
      }
    })
    const items = wrapper.findAll('.alert-timeline-item__supporting-source')
    expect(items).toHaveLength(2)
  })

  it('renders supporting source as link when URL is provided', () => {
    const wrapper = mount(AlertTimelineItem, {
      props: {
        alert: {
          ...BASE_ALERT,
          supporting_sources: [
            { source_name: 'CoinGecko', source_url: 'https://api.coingecko.com' }
          ]
        }
      }
    })
    const link = wrapper.find('.alert-timeline-item__supporting-link')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('https://api.coingecko.com')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toBe('noopener noreferrer')
  })

  it('renders supporting source as plain text when URL is null', () => {
    const wrapper = mount(AlertTimelineItem, {
      props: {
        alert: {
          ...BASE_ALERT,
          supporting_sources: [
            { source_name: 'Internal Data', source_url: null }
          ]
        }
      }
    })
    expect(wrapper.find('.alert-timeline-item__supporting-link').exists()).toBe(false)
    expect(wrapper.text()).toContain('Internal Data')
  })

  it('renders source type badge inside supporting source chip', () => {
    const wrapper = mount(AlertTimelineItem, {
      props: {
        alert: {
          ...BASE_ALERT,
          supporting_sources: [
            { source_name: 'CoinGecko API', source_type: 'api' }
          ]
        }
      }
    })
    const supportingBadges = wrapper.findAll('.alert-timeline-item__supporting-source .source-badge')
    expect(supportingBadges).toHaveLength(1)
    expect(supportingBadges[0].text()).toBe('Data')
  })

  it('does not render supporting sources section when array is empty', () => {
    const wrapper = mount(AlertTimelineItem, {
      props: { alert: { ...BASE_ALERT, supporting_sources: [] } }
    })
    expect(wrapper.find('.alert-timeline-item__supporting').exists()).toBe(false)
  })

  it('does not render supporting sources section when not provided', () => {
    const wrapper = mount(AlertTimelineItem, {
      props: { alert: BASE_ALERT }
    })
    expect(wrapper.find('.alert-timeline-item__supporting').exists()).toBe(false)
  })

  it('does not render "Read more" link for javascript: URLs', () => {
    const wrapper = mount(AlertTimelineItem, {
      props: { alert: { ...BASE_ALERT, source_url: 'javascript:alert(1)' } }
    })
    expect(wrapper.find('.alert-timeline-item__link').exists()).toBe(false)
  })

  it('does not render supporting source as link for unsafe URLs', () => {
    const wrapper = mount(AlertTimelineItem, {
      props: {
        alert: {
          ...BASE_ALERT,
          supporting_sources: [
            { source_name: 'Bad', source_url: 'javascript:alert(1)' }
          ]
        }
      }
    })
    expect(wrapper.find('.alert-timeline-item__supporting-link').exists()).toBe(false)
    expect(wrapper.text()).toContain('Bad')
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

  // ---- Primary source in meta row ----

  it('renders primary source name in the meta row', () => {
    const wrapper = mount(AlertTimelineItem, { props: { alert: BASE_ALERT } })
    const meta = wrapper.find('.alert-timeline-item__meta')
    expect(meta.exists()).toBe(true)
    expect(meta.text()).toContain('CryptoNews')
  })

  it('renders primary source type badge in the meta row', () => {
    const wrapper = mount(AlertTimelineItem, {
      props: { alert: { ...BASE_ALERT, source_type: 'rss' } }
    })
    const meta = wrapper.find('.alert-timeline-item__meta')
    expect(meta.find('.source-badge').exists()).toBe(true)
    expect(meta.find('.source-badge').text()).toBe('News')
  })

  it('meta row contains time, badge, and source name together', () => {
    const wrapper = mount(AlertTimelineItem, {
      props: { alert: { ...BASE_ALERT, source_type: 'api' } }
    })
    const meta = wrapper.find('.alert-timeline-item__meta')
    expect(meta.find('.alert-timeline-item__time').exists()).toBe(true)
    expect(meta.find('.source-badge').exists()).toBe(true)
    expect(meta.find('.alert-timeline-item__source').exists()).toBe(true)
  })

  it('primary source does not appear in the supporting sources section', () => {
    const wrapper = mount(AlertTimelineItem, {
      props: {
        alert: {
          ...BASE_ALERT,
          source_type: 'rss',
          supporting_sources: [
            { source_name: 'CoinGecko API', source_url: 'https://api.coingecko.com', source_type: 'api' }
          ]
        }
      }
    })
    const supporting = wrapper.find('.alert-timeline-item__supporting')
    expect(supporting.text()).not.toContain('CryptoNews')
    expect(supporting.text()).toContain('CoinGecko API')
  })

  it('renders primary source name and supporting sources in separate sections', () => {
    const wrapper = mount(AlertTimelineItem, {
      props: {
        alert: {
          ...BASE_ALERT,
          source_type: 'rss',
          supporting_sources: [
            { source_name: 'Bloomberg', source_url: 'https://bloomberg.com/article', source_type: 'api' }
          ]
        }
      }
    })
    expect(wrapper.find('.alert-timeline-item__meta .alert-timeline-item__source').text()).toBe('CryptoNews')
    expect(wrapper.find('.alert-timeline-item__supporting').text()).toContain('Bloomberg')
  })

  // ---- Supporting sources from source_metadata_json ----

  it('parses supporting sources from source_metadata_json string', () => {
    const wrapper = mount(AlertTimelineItem, {
      props: {
        alert: {
          ...BASE_ALERT,
          source_metadata_json: JSON.stringify({
            supporting_sources: [
              { source_name: 'CoinGecko API', source_url: 'https://api.coingecko.com', source_type: 'api', source_role: 'data' }
            ]
          })
        }
      }
    })
    expect(wrapper.find('.alert-timeline-item__supporting').exists()).toBe(true)
    expect(wrapper.text()).toContain('CoinGecko API')
  })

  it('renders all supporting sources parsed from source_metadata_json', () => {
    const wrapper = mount(AlertTimelineItem, {
      props: {
        alert: {
          ...BASE_ALERT,
          source_metadata_json: JSON.stringify({
            supporting_sources: [
              { source_name: 'Source A', source_url: 'https://a.example.com', source_type: 'rss' },
              { source_name: 'Source B', source_url: null, source_type: 'api' }
            ]
          })
        }
      }
    })
    const items = wrapper.findAll('.alert-timeline-item__supporting-source')
    expect(items).toHaveLength(2)
    expect(wrapper.text()).toContain('Source A')
    expect(wrapper.text()).toContain('Source B')
  })

  it('renders a link for supporting sources with a URL parsed from source_metadata_json', () => {
    const wrapper = mount(AlertTimelineItem, {
      props: {
        alert: {
          ...BASE_ALERT,
          source_metadata_json: JSON.stringify({
            supporting_sources: [
              { source_name: 'CoinGecko API', source_url: 'https://api.coingecko.com', source_type: 'api' }
            ]
          })
        }
      }
    })
    const link = wrapper.find('.alert-timeline-item__supporting-link')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('https://api.coingecko.com')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toBe('noopener noreferrer')
  })

  it('renders plain text for supporting sources without a URL from source_metadata_json', () => {
    const wrapper = mount(AlertTimelineItem, {
      props: {
        alert: {
          ...BASE_ALERT,
          source_metadata_json: JSON.stringify({
            supporting_sources: [
              { source_name: 'Internal Signal', source_url: null, source_type: 'api' }
            ]
          })
        }
      }
    })
    expect(wrapper.find('.alert-timeline-item__supporting-link').exists()).toBe(false)
    expect(wrapper.text()).toContain('Internal Signal')
  })

  it('renders source type badges from source_metadata_json supporting sources', () => {
    const wrapper = mount(AlertTimelineItem, {
      props: {
        alert: {
          ...BASE_ALERT,
          source_metadata_json: JSON.stringify({
            supporting_sources: [
              { source_name: 'CoinGecko API', source_url: null, source_type: 'api' }
            ]
          })
        }
      }
    })
    const badge = wrapper.find('.alert-timeline-item__supporting-source .source-badge')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('Data')
  })

  it('does not render supporting sources when source_metadata_json has empty array', () => {
    const wrapper = mount(AlertTimelineItem, {
      props: {
        alert: {
          ...BASE_ALERT,
          source_metadata_json: JSON.stringify({ supporting_sources: [] })
        }
      }
    })
    expect(wrapper.find('.alert-timeline-item__supporting').exists()).toBe(false)
  })

  it('does not render supporting sources when source_metadata_json is malformed JSON', () => {
    const wrapper = mount(AlertTimelineItem, {
      props: { alert: { ...BASE_ALERT, source_metadata_json: '{not valid json' } }
    })
    expect(wrapper.find('.alert-timeline-item__supporting').exists()).toBe(false)
  })

  it('does not render supporting sources when source_metadata_json is null', () => {
    const wrapper = mount(AlertTimelineItem, {
      props: { alert: { ...BASE_ALERT, source_metadata_json: null } }
    })
    expect(wrapper.find('.alert-timeline-item__supporting').exists()).toBe(false)
  })

  it('prefers supporting_sources array over source_metadata_json when both are provided', () => {
    const wrapper = mount(AlertTimelineItem, {
      props: {
        alert: {
          ...BASE_ALERT,
          supporting_sources: [
            { source_name: 'DirectSource', source_url: null }
          ],
          source_metadata_json: JSON.stringify({
            supporting_sources: [
              { source_name: 'MetaSource', source_url: null }
            ]
          })
        }
      }
    })
    expect(wrapper.text()).toContain('DirectSource')
    expect(wrapper.text()).not.toContain('MetaSource')
  })
})
