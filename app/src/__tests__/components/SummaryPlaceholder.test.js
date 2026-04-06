import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SummaryPlaceholder from '@/components/SummaryPlaceholder.vue'

describe('SummaryPlaceholder', () => {
  it('renders without errors', () => {
    const wrapper = mount(SummaryPlaceholder)
    expect(wrapper.exists()).toBe(true)
  })

  it('displays the "Summary in progress" title', () => {
    const wrapper = mount(SummaryPlaceholder)
    expect(wrapper.text()).toContain('Summary in progress')
  })

  it('displays guidance text for the user', () => {
    const wrapper = mount(SummaryPlaceholder)
    expect(wrapper.text()).toContain("Today's full summary will be published at the end of the day.")
  })

  it('has the summary-placeholder root class', () => {
    const wrapper = mount(SummaryPlaceholder)
    expect(wrapper.find('.summary-placeholder').exists()).toBe(true)
  })
})
