/**
 * Component tests — SourceBadge
 *
 * Validates rendering of the source type badge:
 *   - renders display label from DB source_type values
 *   - renders display label from display-level type names
 *   - applies correct CSS modifier class per type
 *   - supports label override prop
 *   - handles null/missing type gracefully
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SourceBadge from '@/components/SourceBadge.vue'

describe('SourceBadge', () => {
  // ---- Core rendering ----

  it('renders without errors with no props', () => {
    const wrapper = mount(SourceBadge)
    expect(wrapper.exists()).toBe(true)
  })

  it('does not render the badge element when type and label are both absent', () => {
    const wrapper = mount(SourceBadge)
    expect(wrapper.find('.source-badge').exists()).toBe(false)
  })

  it('does not render the badge element when type is null and label is absent', () => {
    const wrapper = mount(SourceBadge, { props: { type: null } })
    expect(wrapper.find('.source-badge').exists()).toBe(false)
  })

  it('has the source-badge root class', () => {
    const wrapper = mount(SourceBadge, { props: { type: 'rss' } })
    expect(wrapper.find('.source-badge').exists()).toBe(true)
  })

  // ---- DB type → display label mapping ----

  it('maps "rss" to "News"', () => {
    const wrapper = mount(SourceBadge, { props: { type: 'rss' } })
    expect(wrapper.text()).toBe('News')
  })

  it('maps "api" to "Data"', () => {
    const wrapper = mount(SourceBadge, { props: { type: 'api' } })
    expect(wrapper.text()).toBe('Data')
  })

  it('maps "social" to "Social"', () => {
    const wrapper = mount(SourceBadge, { props: { type: 'social' } })
    expect(wrapper.text()).toBe('Social')
  })

  it('maps "webhook" to "Signal"', () => {
    const wrapper = mount(SourceBadge, { props: { type: 'webhook' } })
    expect(wrapper.text()).toBe('Signal')
  })

  it('maps "x_account" to "X"', () => {
    const wrapper = mount(SourceBadge, { props: { type: 'x_account' } })
    expect(wrapper.text()).toBe('X')
  })

  it('maps "x_query" to "X"', () => {
    const wrapper = mount(SourceBadge, { props: { type: 'x_query' } })
    expect(wrapper.text()).toBe('X')
  })

  // ---- Display-level type names ----

  it('renders "News" for type="news"', () => {
    const wrapper = mount(SourceBadge, { props: { type: 'news' } })
    expect(wrapper.text()).toBe('News')
  })

  it('renders "Official" for type="official"', () => {
    const wrapper = mount(SourceBadge, { props: { type: 'official' } })
    expect(wrapper.text()).toBe('Official')
  })

  it('renders "Data" for type="data"', () => {
    const wrapper = mount(SourceBadge, { props: { type: 'data' } })
    expect(wrapper.text()).toBe('Data')
  })

  it('renders "Research" for type="research"', () => {
    const wrapper = mount(SourceBadge, { props: { type: 'research' } })
    expect(wrapper.text()).toBe('Research')
  })

  it('renders "X" for type="x"', () => {
    const wrapper = mount(SourceBadge, { props: { type: 'x' } })
    expect(wrapper.text()).toBe('X')
  })

  it('renders "Signal" for type="signal"', () => {
    const wrapper = mount(SourceBadge, { props: { type: 'signal' } })
    expect(wrapper.text()).toBe('Signal')
  })

  // ---- CSS modifier classes ----

  it('applies source-badge--news for type="rss"', () => {
    const wrapper = mount(SourceBadge, { props: { type: 'rss' } })
    expect(wrapper.find('.source-badge--news').exists()).toBe(true)
  })

  it('applies source-badge--data for type="api"', () => {
    const wrapper = mount(SourceBadge, { props: { type: 'api' } })
    expect(wrapper.find('.source-badge--data').exists()).toBe(true)
  })

  it('applies source-badge--x for type="x_account"', () => {
    const wrapper = mount(SourceBadge, { props: { type: 'x_account' } })
    expect(wrapper.find('.source-badge--x').exists()).toBe(true)
  })

  it('applies source-badge--x for type="x_query"', () => {
    const wrapper = mount(SourceBadge, { props: { type: 'x_query' } })
    expect(wrapper.find('.source-badge--x').exists()).toBe(true)
  })

  it('applies source-badge--signal for type="webhook"', () => {
    const wrapper = mount(SourceBadge, { props: { type: 'webhook' } })
    expect(wrapper.find('.source-badge--signal').exists()).toBe(true)
  })

  it('applies source-badge--official for type="official"', () => {
    const wrapper = mount(SourceBadge, { props: { type: 'official' } })
    expect(wrapper.find('.source-badge--official').exists()).toBe(true)
  })

  it('applies source-badge--research for type="research"', () => {
    const wrapper = mount(SourceBadge, { props: { type: 'research' } })
    expect(wrapper.find('.source-badge--research').exists()).toBe(true)
  })

  it('does not render the badge for null type (no empty artifact)', () => {
    const wrapper = mount(SourceBadge, { props: { type: null } })
    expect(wrapper.find('.source-badge').exists()).toBe(false)
  })

  it('applies source-badge--default for unmapped type', () => {
    const wrapper = mount(SourceBadge, { props: { type: 'unknown_type' } })
    expect(wrapper.find('.source-badge--default').exists()).toBe(true)
  })

  // ---- Label override ----

  it('uses label prop over type mapping when provided', () => {
    const wrapper = mount(SourceBadge, { props: { type: 'rss', label: 'Custom' } })
    expect(wrapper.text()).toBe('Custom')
  })

  it('uses label prop even when type is null', () => {
    const wrapper = mount(SourceBadge, { props: { type: null, label: 'Override' } })
    expect(wrapper.text()).toBe('Override')
  })

  // ---- Fallback for unknown types ----

  it('capitalises first character of an unknown type as fallback label', () => {
    const wrapper = mount(SourceBadge, { props: { type: 'podcast' } })
    expect(wrapper.text()).toBe('Podcast')
  })

  // ---- Case insensitivity ----

  it('handles uppercase type input', () => {
    const wrapper = mount(SourceBadge, { props: { type: 'RSS' } })
    expect(wrapper.text()).toBe('News')
    expect(wrapper.find('.source-badge--news').exists()).toBe(true)
  })

  it('handles mixed case type input', () => {
    const wrapper = mount(SourceBadge, { props: { type: 'Api' } })
    expect(wrapper.text()).toBe('Data')
    expect(wrapper.find('.source-badge--data').exists()).toBe(true)
  })
})
