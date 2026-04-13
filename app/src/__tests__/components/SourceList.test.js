/**
 * Component tests — SourceList
 *
 * Validates rendering of the source attribution section:
 *   - renders source chips with names
 *   - links sources that have a URL
 *   - shows source role badges
 *   - displays confidence note when provided
 *   - renders nothing when sources are null or empty
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SourceList from '@/components/SourceList.vue'

const SAMPLE_SOURCES = [
  { source_name: 'CoinDesk', source_url: 'https://example.com/coindesk', source_role: 'primary' },
  { source_name: 'Bloomberg', source_url: 'https://example.com/bloomberg', source_role: 'confirmation' },
  { source_name: 'CoinGecko API', source_url: null, source_role: 'data' }
]

const SAMPLE_CONFIDENCE_NOTE = 'High confidence: multiple specialist outlets corroborated by real-time market data.'

describe('SourceList', () => {
  // ---- Core rendering ----

  it('renders without errors with no props', () => {
    const wrapper = mount(SourceList)
    expect(wrapper.exists()).toBe(true)
  })

  it('does not render the source-list section when sources is null', () => {
    const wrapper = mount(SourceList, { props: { sources: null } })
    expect(wrapper.find('.source-list').exists()).toBe(false)
  })

  it('does not render the source-list section when sources is an empty array', () => {
    const wrapper = mount(SourceList, { props: { sources: [] } })
    expect(wrapper.find('.source-list').exists()).toBe(false)
  })

  it('renders the source-list section when sources are provided', () => {
    const wrapper = mount(SourceList, { props: { sources: SAMPLE_SOURCES } })
    expect(wrapper.find('.source-list').exists()).toBe(true)
  })

  it('renders the "Sources" heading', () => {
    const wrapper = mount(SourceList, { props: { sources: SAMPLE_SOURCES } })
    expect(wrapper.find('.source-list__heading').text()).toBe('Sources')
  })

  // ---- Source items ----

  it('renders one list item per source', () => {
    const wrapper = mount(SourceList, { props: { sources: SAMPLE_SOURCES } })
    const items = wrapper.findAll('.source-list__item')
    expect(items).toHaveLength(3)
  })

  it('renders source names', () => {
    const wrapper = mount(SourceList, { props: { sources: SAMPLE_SOURCES } })
    expect(wrapper.text()).toContain('CoinDesk')
    expect(wrapper.text()).toContain('Bloomberg')
    expect(wrapper.text()).toContain('CoinGecko API')
  })

  // ---- Links ----

  it('renders a link when source_url is provided', () => {
    const wrapper = mount(SourceList, { props: { sources: SAMPLE_SOURCES } })
    const links = wrapper.findAll('.source-list__link')
    expect(links.length).toBeGreaterThanOrEqual(2)
    expect(links[0].attributes('href')).toBe('https://example.com/coindesk')
    expect(links[0].text()).toBe('CoinDesk')
  })

  it('sets target="_blank" and rel="noopener noreferrer" on source links', () => {
    const wrapper = mount(SourceList, { props: { sources: SAMPLE_SOURCES } })
    const link = wrapper.find('.source-list__link')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toBe('noopener noreferrer')
  })

  it('renders a span instead of a link when source_url is null', () => {
    const wrapper = mount(SourceList, { props: { sources: SAMPLE_SOURCES } })
    const nameSpans = wrapper.findAll('.source-list__name')
    expect(nameSpans.length).toBe(1)
    expect(nameSpans[0].text()).toBe('CoinGecko API')
  })

  it('renders a span instead of a link for javascript: URLs', () => {
    const sources = [{ source_name: 'Malicious', source_url: 'javascript:alert("xss")', source_role: 'primary' }]
    const wrapper = mount(SourceList, { props: { sources } })
    expect(wrapper.find('.source-list__link').exists()).toBe(false)
    expect(wrapper.find('.source-list__name').text()).toBe('Malicious')
  })

  it('renders a span instead of a link for data: URLs', () => {
    const sources = [{ source_name: 'DataURL', source_url: 'data:text/html,<script>alert(1)</script>', source_role: null }]
    const wrapper = mount(SourceList, { props: { sources } })
    expect(wrapper.find('.source-list__link').exists()).toBe(false)
    expect(wrapper.find('.source-list__name').text()).toBe('DataURL')
  })

  // ---- Source roles ----

  it('displays the source role when provided', () => {
    const wrapper = mount(SourceList, { props: { sources: SAMPLE_SOURCES } })
    const roles = wrapper.findAll('.source-list__role')
    expect(roles.length).toBe(3)
    expect(roles[0].text()).toBe('primary')
    expect(roles[1].text()).toBe('confirmation')
    expect(roles[2].text()).toBe('data')
  })

  it('does not display a role badge when source_role is null', () => {
    const sources = [{ source_name: 'Test', source_url: null, source_role: null }]
    const wrapper = mount(SourceList, { props: { sources } })
    expect(wrapper.find('.source-list__role').exists()).toBe(false)
  })

  // ---- Confidence note ----

  it('renders the confidence note when provided', () => {
    const wrapper = mount(SourceList, {
      props: { sources: SAMPLE_SOURCES, confidenceNote: SAMPLE_CONFIDENCE_NOTE }
    })
    expect(wrapper.find('.source-list__confidence').exists()).toBe(true)
    expect(wrapper.find('.source-list__confidence').text()).toBe(SAMPLE_CONFIDENCE_NOTE)
  })

  it('does not render the confidence note when not provided', () => {
    const wrapper = mount(SourceList, { props: { sources: SAMPLE_SOURCES } })
    expect(wrapper.find('.source-list__confidence').exists()).toBe(false)
  })

  // ---- Single source ----

  it('renders correctly with a single source', () => {
    const sources = [{ source_name: 'Reuters', source_url: 'https://example.com/reuters', source_role: 'primary' }]
    const wrapper = mount(SourceList, { props: { sources } })
    expect(wrapper.findAll('.source-list__item')).toHaveLength(1)
    expect(wrapper.text()).toContain('Reuters')
  })

  // ---- Source type badges ----

  it('renders a source type badge when source_type is provided', () => {
    const sources = [{ source_name: 'CoinDesk', source_url: 'https://example.com', source_type: 'rss', source_role: 'primary' }]
    const wrapper = mount(SourceList, { props: { sources } })
    expect(wrapper.find('.source-badge').exists()).toBe(true)
    expect(wrapper.find('.source-badge').text()).toBe('News')
  })

  it('does not render a source type badge when source_type is absent', () => {
    const sources = [{ source_name: 'CoinDesk', source_url: 'https://example.com', source_role: 'primary' }]
    const wrapper = mount(SourceList, { props: { sources } })
    expect(wrapper.find('.source-badge').exists()).toBe(false)
  })

  it('renders source type badges for each source that has a type', () => {
    const sources = [
      { source_name: 'CoinDesk', source_type: 'rss', source_role: 'primary' },
      { source_name: 'CoinGecko', source_type: 'api', source_role: 'data' },
      { source_name: 'Unknown', source_role: 'confirmation' }
    ]
    const wrapper = mount(SourceList, { props: { sources } })
    const badges = wrapper.findAll('.source-badge')
    expect(badges).toHaveLength(2)
    expect(badges[0].text()).toBe('News')
    expect(badges[1].text()).toBe('Data')
  })
})

// ---------------------------------------------------------------------------
// Daily summary context
// ---------------------------------------------------------------------------

const SUMMARY_SOURCES = [
  {
    source_name: 'CryptoNews',
    source_url: 'https://example.com/crypto/btc-etf-inflows',
    source_type: 'rss',
    source_role: 'primary'
  },
  {
    source_name: 'CoinGecko API',
    source_url: 'https://api.coingecko.com/api/v3/simple/price',
    source_type: 'api',
    source_role: 'data'
  },
  {
    source_name: 'InternalAnalysis',
    source_url: null,
    source_type: null,
    source_role: 'analysis'
  }
]

const SUMMARY_CONFIDENCE_NOTE =
  'High confidence: multiple specialist outlets corroborated by real-time market data.'

describe('SourceList — daily summary source context', () => {
  // ---- Primary source presentation ----

  it('renders the primary source first in the list', () => {
    const wrapper = mount(SourceList, { props: { sources: SUMMARY_SOURCES } })
    const items = wrapper.findAll('.source-list__item')
    expect(items[0].text()).toContain('CryptoNews')
  })

  it('renders the primary source role label', () => {
    const wrapper = mount(SourceList, { props: { sources: SUMMARY_SOURCES } })
    const roles = wrapper.findAll('.source-list__role')
    expect(roles[0].text()).toBe('primary')
  })

  it('renders a link for the primary source', () => {
    const wrapper = mount(SourceList, { props: { sources: SUMMARY_SOURCES } })
    const links = wrapper.findAll('.source-list__link')
    expect(links[0].attributes('href')).toBe('https://example.com/crypto/btc-etf-inflows')
  })

  // ---- Supporting (non-primary) source presentation ----

  it('renders supporting data source role', () => {
    const wrapper = mount(SourceList, { props: { sources: SUMMARY_SOURCES } })
    expect(wrapper.text()).toContain('data')
  })

  it('renders plain text for the analysis source without a URL', () => {
    const wrapper = mount(SourceList, { props: { sources: SUMMARY_SOURCES } })
    const nameSpans = wrapper.findAll('.source-list__name')
    const analysisSpan = nameSpans.find(s => s.text() === 'InternalAnalysis')
    expect(analysisSpan).toBeDefined()
  })

  // ---- Source type badge variety in summary ----

  it('renders News badge for the RSS primary source', () => {
    const wrapper = mount(SourceList, { props: { sources: SUMMARY_SOURCES } })
    const badges = wrapper.findAll('.source-badge')
    const newsBadge = badges.find(b => b.text() === 'News')
    expect(newsBadge).toBeDefined()
  })

  it('renders Data badge for the API supporting source', () => {
    const wrapper = mount(SourceList, { props: { sources: SUMMARY_SOURCES } })
    const badges = wrapper.findAll('.source-badge')
    const dataBadge = badges.find(b => b.text() === 'Data')
    expect(dataBadge).toBeDefined()
  })

  it('does not render a badge for the analysis source that has no source_type', () => {
    const wrapper = mount(SourceList, { props: { sources: SUMMARY_SOURCES } })
    const items = wrapper.findAll('.source-list__item')
    const analysisItem = items.find(i => i.text().includes('InternalAnalysis'))
    expect(analysisItem.find('.source-badge').exists()).toBe(false)
  })

  // ---- Confidence note ----

  it('renders the confidence note alongside summary sources', () => {
    const wrapper = mount(SourceList, {
      props: { sources: SUMMARY_SOURCES, confidenceNote: SUMMARY_CONFIDENCE_NOTE }
    })
    expect(wrapper.find('.source-list__confidence').text()).toBe(SUMMARY_CONFIDENCE_NOTE)
  })

  // ---- Multiple source types together ----

  it('renders all four summary sources correctly', () => {
    const sources = [
      { source_name: 'Reuters', source_url: 'https://reuters.com/article', source_type: 'rss', source_role: 'primary' },
      { source_name: 'Bloomberg', source_url: 'https://bloomberg.com/article', source_type: 'api', source_role: 'confirmation' },
      { source_name: 'SEC Filing', source_url: 'https://sec.gov/filing', source_type: 'official', source_role: 'official' },
      { source_name: 'Internal Model', source_url: null, source_type: null, source_role: 'analysis' }
    ]
    const wrapper = mount(SourceList, { props: { sources } })
    expect(wrapper.findAll('.source-list__item')).toHaveLength(4)
    expect(wrapper.findAll('.source-badge')).toHaveLength(3)
    expect(wrapper.findAll('.source-list__link')).toHaveLength(3)
    expect(wrapper.findAll('.source-list__name')).toHaveLength(1)
  })

  it('renders Official badge for official source type in summary', () => {
    const sources = [
      { source_name: 'SEC Filing', source_url: 'https://sec.gov', source_type: 'official', source_role: 'official' }
    ]
    const wrapper = mount(SourceList, { props: { sources } })
    expect(wrapper.find('.source-badge').text()).toBe('Official')
    expect(wrapper.find('.source-badge--official').exists()).toBe(true)
  })

  it('renders Research badge for research source type in summary', () => {
    const sources = [
      { source_name: 'Arxiv Paper', source_url: 'https://arxiv.org/paper', source_type: 'research', source_role: 'research' }
    ]
    const wrapper = mount(SourceList, { props: { sources } })
    expect(wrapper.find('.source-badge').text()).toBe('Research')
    expect(wrapper.find('.source-badge--research').exists()).toBe(true)
  })

  it('renders X badge for x_account source type in summary', () => {
    const sources = [
      { source_name: '@elonmusk', source_url: null, source_type: 'x_account', source_role: 'signal' }
    ]
    const wrapper = mount(SourceList, { props: { sources } })
    expect(wrapper.find('.source-badge').text()).toBe('X')
    expect(wrapper.find('.source-badge--x').exists()).toBe(true)
  })

  it('renders Signal badge for webhook source type in summary', () => {
    const sources = [
      { source_name: 'On-chain Alert', source_url: null, source_type: 'webhook', source_role: 'signal' }
    ]
    const wrapper = mount(SourceList, { props: { sources } })
    expect(wrapper.find('.source-badge').text()).toBe('Signal')
    expect(wrapper.find('.source-badge--signal').exists()).toBe(true)
  })
})
