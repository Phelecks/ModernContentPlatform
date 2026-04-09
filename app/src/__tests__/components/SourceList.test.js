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
})
