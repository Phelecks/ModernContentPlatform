import { describe, it, expect } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import TopicCard from '@/components/TopicCard.vue'

const topic = {
  topic_slug: 'crypto',
  display_name: 'Crypto',
  description: 'Cryptocurrency news and analysis.'
}

const mountOptions = {
  global: {
    stubs: { RouterLink: RouterLinkStub }
  }
}

describe('TopicCard', () => {
  it('renders the topic display name', () => {
    const wrapper = mount(TopicCard, { ...mountOptions, props: { topic } })
    expect(wrapper.text()).toContain('Crypto')
  })

  it('renders the topic description when provided', () => {
    const wrapper = mount(TopicCard, { ...mountOptions, props: { topic } })
    expect(wrapper.text()).toContain('Cryptocurrency news and analysis.')
  })

  it('does not render a description element when description is absent', () => {
    const wrapper = mount(TopicCard, {
      ...mountOptions,
      props: { topic: { topic_slug: 'finance', display_name: 'Finance' } }
    })
    expect(wrapper.find('.topic-card__desc').exists()).toBe(false)
  })

  it('renders a link to the correct topic route', () => {
    const wrapper = mount(TopicCard, { ...mountOptions, props: { topic } })
    const link = wrapper.findComponent(RouterLinkStub)
    expect(link.props('to')).toBe('/topics/crypto')
  })

  it('renders the "View latest →" call-to-action', () => {
    const wrapper = mount(TopicCard, { ...mountOptions, props: { topic } })
    expect(wrapper.text()).toContain('View latest')
  })
})
