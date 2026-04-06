import { describe, it, expect } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import DateNavigator from '@/components/DateNavigator.vue'

const baseProps = {
  topicSlug: 'crypto',
  dateKey: '2025-01-15',
  prevDateKey: '2025-01-14',
  nextDateKey: '2025-01-16'
}

const mountOptions = {
  global: {
    stubs: { RouterLink: RouterLinkStub }
  }
}

describe('DateNavigator', () => {
  it('renders the formatted date', () => {
    const wrapper = mount(DateNavigator, { ...mountOptions, props: baseProps })
    expect(wrapper.text()).toContain('January 15, 2025')
  })

  it('renders a previous-day link when prevDateKey is provided', () => {
    const wrapper = mount(DateNavigator, { ...mountOptions, props: baseProps })
    const links = wrapper.findAllComponents(RouterLinkStub)
    const prevLink = links.find(l => l.props('to')?.includes('2025-01-14'))
    expect(prevLink).toBeTruthy()
  })

  it('renders a next-day link when nextDateKey is provided', () => {
    const wrapper = mount(DateNavigator, { ...mountOptions, props: baseProps })
    const links = wrapper.findAllComponents(RouterLinkStub)
    const nextLink = links.find(l => l.props('to')?.includes('2025-01-16'))
    expect(nextLink).toBeTruthy()
  })

  it('renders disabled arrows when prevDateKey is null', () => {
    const wrapper = mount(DateNavigator, {
      ...mountOptions,
      props: { ...baseProps, prevDateKey: null }
    })
    const disabled = wrapper.findAll('.date-navigator__arrow--disabled')
    expect(disabled.length).toBeGreaterThan(0)
  })

  it('renders disabled arrows when nextDateKey is null', () => {
    const wrapper = mount(DateNavigator, {
      ...mountOptions,
      props: { ...baseProps, nextDateKey: null }
    })
    const disabled = wrapper.findAll('.date-navigator__arrow--disabled')
    expect(disabled.length).toBeGreaterThan(0)
  })

  it('builds the correct previous link route', () => {
    const wrapper = mount(DateNavigator, { ...mountOptions, props: baseProps })
    const links = wrapper.findAllComponents(RouterLinkStub)
    const prevLink = links.find(l => l.props('to')?.includes('2025-01-14'))
    expect(prevLink.props('to')).toBe('/topics/crypto/2025-01-14')
  })

  it('builds the correct next link route', () => {
    const wrapper = mount(DateNavigator, { ...mountOptions, props: baseProps })
    const links = wrapper.findAllComponents(RouterLinkStub)
    const nextLink = links.find(l => l.props('to')?.includes('2025-01-16'))
    expect(nextLink.props('to')).toBe('/topics/crypto/2025-01-16')
  })
})
