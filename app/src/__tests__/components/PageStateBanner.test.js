/**
 * Component tests — PageStateBanner
 *
 * Validates banner rendering for all page state types:
 *   - info (pending)
 *   - warning (ready)
 *   - success (published)
 *   - error
 * Also validates the message prop and indicator dot.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PageStateBanner from '@/components/PageStateBanner.vue'

describe('PageStateBanner', () => {
  // ---- Core rendering ----

  it('renders without errors', () => {
    const wrapper = mount(PageStateBanner, { props: { type: 'info', message: 'Test message' } })
    expect(wrapper.exists()).toBe(true)
  })

  it('has the page-state-banner root class', () => {
    const wrapper = mount(PageStateBanner, { props: { type: 'info', message: 'Test' } })
    expect(wrapper.find('.page-state-banner').exists()).toBe(true)
  })

  it('renders the message text', () => {
    const wrapper = mount(PageStateBanner, { props: { type: 'info', message: 'Live — summary pending end of day' } })
    expect(wrapper.text()).toContain('Live — summary pending end of day')
  })

  it('renders the indicator dot element', () => {
    const wrapper = mount(PageStateBanner, { props: { type: 'info', message: 'Test' } })
    expect(wrapper.find('.page-state-banner__dot').exists()).toBe(true)
  })

  it('renders the message inside the message span', () => {
    const wrapper = mount(PageStateBanner, { props: { type: 'success', message: 'Published' } })
    expect(wrapper.find('.page-state-banner__message').text()).toBe('Published')
  })

  // ---- Type modifier classes ----

  it('applies the info modifier class for type="info"', () => {
    const wrapper = mount(PageStateBanner, { props: { type: 'info', message: 'Pending' } })
    expect(wrapper.find('.page-state-banner--info').exists()).toBe(true)
  })

  it('applies the warning modifier class for type="warning"', () => {
    const wrapper = mount(PageStateBanner, { props: { type: 'warning', message: 'Summary ready' } })
    expect(wrapper.find('.page-state-banner--warning').exists()).toBe(true)
  })

  it('applies the success modifier class for type="success"', () => {
    const wrapper = mount(PageStateBanner, { props: { type: 'success', message: 'Published' } })
    expect(wrapper.find('.page-state-banner--success').exists()).toBe(true)
  })

  it('applies the error modifier class for type="error"', () => {
    const wrapper = mount(PageStateBanner, { props: { type: 'error', message: 'Publish error' } })
    expect(wrapper.find('.page-state-banner--error').exists()).toBe(true)
  })

  it('uses info as the default type', () => {
    const wrapper = mount(PageStateBanner, { props: { message: 'Default' } })
    expect(wrapper.find('.page-state-banner--info').exists()).toBe(true)
  })

  // ---- Page state message scenarios (matching TopicDayPage banner logic) ----

  it('renders correct pending message', () => {
    const wrapper = mount(PageStateBanner, {
      props: { type: 'info', message: 'Live — summary pending end of day' }
    })
    expect(wrapper.text()).toContain('Live — summary pending end of day')
  })

  it('renders correct ready message', () => {
    const wrapper = mount(PageStateBanner, {
      props: { type: 'warning', message: 'Summary ready — publishing soon' }
    })
    expect(wrapper.text()).toContain('Summary ready — publishing soon')
  })

  it('renders correct published message', () => {
    const wrapper = mount(PageStateBanner, {
      props: { type: 'success', message: 'Published' }
    })
    expect(wrapper.text()).toContain('Published')
  })

  it('renders correct error message', () => {
    const wrapper = mount(PageStateBanner, {
      props: { type: 'error', message: 'Publish error — check back later' }
    })
    expect(wrapper.text()).toContain('Publish error — check back later')
  })

  // ---- Accessibility ----

  it('has role="status" for assistive technology', () => {
    const wrapper = mount(PageStateBanner, { props: { type: 'info', message: 'Test' } })
    expect(wrapper.find('[role="status"]').exists()).toBe(true)
  })

  it('marks the dot as aria-hidden', () => {
    const wrapper = mount(PageStateBanner, { props: { type: 'info', message: 'Test' } })
    expect(wrapper.find('.page-state-banner__dot').attributes('aria-hidden')).toBe('true')
  })
})
