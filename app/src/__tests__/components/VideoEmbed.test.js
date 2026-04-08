/**
 * Component tests — VideoEmbed
 *
 * Validates YouTube video embed rendering:
 *   - iframe src built from videoId
 *   - title attribute on the iframe
 *   - optional title caption below video
 *   - responsive container structure
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import VideoEmbed from '@/components/VideoEmbed.vue'

describe('VideoEmbed', () => {
  // ---- Core rendering ----

  it('renders without errors', () => {
    const wrapper = mount(VideoEmbed, { props: { videoId: 'dQw4w9WgXcQ' } })
    expect(wrapper.exists()).toBe(true)
  })

  it('has the video-embed root class', () => {
    const wrapper = mount(VideoEmbed, { props: { videoId: 'dQw4w9WgXcQ' } })
    expect(wrapper.find('.video-embed').exists()).toBe(true)
  })

  it('renders an iframe element', () => {
    const wrapper = mount(VideoEmbed, { props: { videoId: 'dQw4w9WgXcQ' } })
    expect(wrapper.find('iframe').exists()).toBe(true)
  })

  // ---- Iframe src ----

  it('builds the correct YouTube embed src from videoId', () => {
    const wrapper = mount(VideoEmbed, { props: { videoId: 'dQw4w9WgXcQ' } })
    expect(wrapper.find('iframe').attributes('src')).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ'
    )
  })

  it('uses the provided videoId in the iframe src', () => {
    const wrapper = mount(VideoEmbed, { props: { videoId: 'abc123XYZ' } })
    expect(wrapper.find('iframe').attributes('src')).toContain('abc123XYZ')
  })

  // ---- Title ----

  it('renders the title caption when title prop is provided', () => {
    const wrapper = mount(VideoEmbed, {
      props: { videoId: 'dQw4w9WgXcQ', title: 'Crypto Daily — January 15 2025' }
    })
    expect(wrapper.find('.video-embed__title').exists()).toBe(true)
    expect(wrapper.find('.video-embed__title').text()).toBe('Crypto Daily — January 15 2025')
  })

  it('does not render the title caption when title prop is absent', () => {
    const wrapper = mount(VideoEmbed, { props: { videoId: 'dQw4w9WgXcQ' } })
    expect(wrapper.find('.video-embed__title').exists()).toBe(false)
  })

  it('sets the iframe title attribute to the provided title', () => {
    const wrapper = mount(VideoEmbed, {
      props: { videoId: 'dQw4w9WgXcQ', title: 'My Video Title' }
    })
    expect(wrapper.find('iframe').attributes('title')).toBe('My Video Title')
  })

  it('uses the default title "Daily video" on the iframe when no title prop given', () => {
    const wrapper = mount(VideoEmbed, { props: { videoId: 'dQw4w9WgXcQ' } })
    expect(wrapper.find('iframe').attributes('title')).toBe('Daily video')
  })

  // ---- Responsive container ----

  it('renders the video container wrapper', () => {
    const wrapper = mount(VideoEmbed, { props: { videoId: 'dQw4w9WgXcQ' } })
    expect(wrapper.find('.video-embed__container').exists()).toBe(true)
  })

  it('sets lazy loading on the iframe', () => {
    const wrapper = mount(VideoEmbed, { props: { videoId: 'dQw4w9WgXcQ' } })
    expect(wrapper.find('iframe').attributes('loading')).toBe('lazy')
  })

  it('sets allowfullscreen on the iframe', () => {
    const wrapper = mount(VideoEmbed, { props: { videoId: 'dQw4w9WgXcQ' } })
    // happy-dom returns attribute as empty string when present as boolean attribute
    expect(wrapper.find('iframe').attributes('allowfullscreen')).toBeDefined()
  })
})
