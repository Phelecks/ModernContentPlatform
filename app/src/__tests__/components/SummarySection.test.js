/**
 * Component tests — SummarySection
 *
 * Validates rendering of the daily summary content area:
 *   - markdown prop (raw markdown fallback)
 *   - html prop (rendered HTML, sanitized by DOMPurify)
 *   - slot fallback when neither is provided
 *   - heading and structure
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SummarySection from '@/components/SummarySection.vue'

const SAMPLE_MARKDOWN = `# Daily Summary\n\nCrypto markets moved significantly today as Bitcoin reached new highs.`
const SAMPLE_HTML = `<h2>Daily Summary</h2><p>Bitcoin surged to new highs today.</p>`

describe('SummarySection', () => {
  // ---- Core rendering ----

  it('renders without errors with no props', () => {
    const wrapper = mount(SummarySection)
    expect(wrapper.exists()).toBe(true)
  })

  it('has the summary-section root class', () => {
    const wrapper = mount(SummarySection)
    expect(wrapper.find('.summary-section').exists()).toBe(true)
  })

  it('renders the "Daily Summary" heading', () => {
    const wrapper = mount(SummarySection)
    expect(wrapper.text()).toContain('Daily Summary')
  })

  // ---- Markdown prop ----

  it('renders markdown content inside the body when markdown prop is provided', () => {
    const wrapper = mount(SummarySection, { props: { markdown: SAMPLE_MARKDOWN } })
    expect(wrapper.find('.summary-section__body').exists()).toBe(true)
  })

  it('displays the markdown text when html is not provided', () => {
    const wrapper = mount(SummarySection, { props: { markdown: SAMPLE_MARKDOWN } })
    expect(wrapper.text()).toContain('Crypto markets moved significantly')
  })

  it('renders markdown inside the pre element', () => {
    const wrapper = mount(SummarySection, { props: { markdown: SAMPLE_MARKDOWN } })
    expect(wrapper.find('.summary-section__raw').exists()).toBe(true)
    expect(wrapper.find('.summary-section__raw').text()).toContain('Daily Summary')
  })

  // ---- HTML prop ----

  it('renders HTML content when html prop is provided', () => {
    const wrapper = mount(SummarySection, { props: { html: SAMPLE_HTML } })
    expect(wrapper.find('.summary-section__body').exists()).toBe(true)
  })

  it('prefers html over markdown when both are provided', () => {
    const wrapper = mount(SummarySection, {
      props: { html: SAMPLE_HTML, markdown: SAMPLE_MARKDOWN }
    })
    // HTML takes precedence — the raw pre element should not be rendered
    expect(wrapper.find('.summary-section__raw').exists()).toBe(false)
    expect(wrapper.find('.summary-section__body').exists()).toBe(true)
  })

  it('sanitizes HTML content before rendering', () => {
    const maliciousHtml = `<p>Safe content</p><script>alert('xss')</script>`
    const wrapper = mount(SummarySection, { props: { html: maliciousHtml } })
    expect(wrapper.html()).not.toContain('<script>')
    expect(wrapper.text()).toContain('Safe content')
  })

  it('strips dangerous attributes in HTML', () => {
    const dangerousHtml = `<p onclick="alert('xss')">Click me</p>`
    const wrapper = mount(SummarySection, { props: { html: dangerousHtml } })
    expect(wrapper.html()).not.toContain('onclick')
  })

  // ---- Slot fallback ----

  it('renders slot content when neither html nor markdown is provided', () => {
    const wrapper = mount(SummarySection, {
      slots: { default: '<p class="fallback-content">Fallback slot content</p>' }
    })
    expect(wrapper.find('.fallback-content').exists()).toBe(true)
    expect(wrapper.text()).toContain('Fallback slot content')
  })

  it('does not render the body div when neither html nor markdown is provided', () => {
    const wrapper = mount(SummarySection)
    expect(wrapper.find('.summary-section__body').exists()).toBe(false)
    expect(wrapper.find('.summary-section__raw').exists()).toBe(false)
  })
})
