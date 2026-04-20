/**
 * Integration tests — Meta social content generation and formatting
 *
 * Validates the platform-specific formatting utilities used in the
 * n8n Meta social workflow modules (daily/11, daily/12, intraday/10).
 *
 * Covered scenarios:
 *
 *   hashtag handling
 *     - normalizeHashtag adds # prefix when missing
 *     - normalizeHashtag preserves existing # prefix
 *     - mergeHashtags deduplicates AI and base topic hashtags
 *     - mergeHashtags caps at 30 items
 *     - mergeHashtags returns base-only hashtags when aiHashtags is empty
 *     - mergeHashtags returns base-only hashtags for unknown topic
 *
 *   Instagram caption formatting
 *     - short caption fits within 2200 chars unchanged
 *     - CTA and hashtags are appended with double-newline separators
 *     - caption body is truncated when total would exceed 2200 chars
 *     - caption without CTA omits CTA block
 *     - empty hashtag list omits hashtag block
 *
 *   Facebook caption formatting
 *     - short caption fits within 63206 chars unchanged
 *     - caption structure matches Instagram structure
 *     - extremely long caption is truncated at 63206 chars
 *
 *   story caption truncation
 *     - short story caption is returned unchanged
 *     - story caption exceeding 200 chars is truncated with ellipsis
 *     - non-string input returns empty string
 *
 *   daily social asset formatting
 *     - produces a correctly shaped meta_social_asset for a daily_post
 *     - instagram.enabled reflects instagramEnabled parameter
 *     - facebook.enabled reflects facebookEnabled parameter
 *     - story_enabled is false when stories are disabled
 *     - story_enabled is true when both platform and stories are enabled
 *     - fallback CTA is applied when ai_output.cta is null
 *     - topic-level base hashtags are merged into the final caption
 *
 *   alert story asset formatting
 *     - produces a correctly shaped meta_social_asset for a story
 *     - story caption includes topic emoji
 *     - story caption is truncated when headline is very long
 *     - isAlertStoryEligible returns true at threshold boundary
 *     - isAlertStoryEligible returns false below threshold
 *     - date_key is derived from event_at when present
 *     - asset_type is 'story' and source_type is 'alert'
 *
 *   fixture compatibility
 *     - crypto daily post fixture matches meta_social_asset shape
 *     - crypto story fixture matches meta_social_asset shape
 */
import { describe, it, expect } from 'vitest'
import {
  normalizeHashtag,
  mergeHashtags,
  buildInstagramCaption,
  buildFacebookCaption,
  truncateStoryCaption,
  formatDailySocialAsset,
  formatAlertStoryAsset,
  isAlertStoryEligible,
  INSTAGRAM_CAPTION_MAX,
  FACEBOOK_CAPTION_MAX,
  STORY_CAPTION_MAX,
  ALERT_STORY_THRESHOLD_DEFAULT,
  TOPIC_BASE_HASHTAGS
} from '@/utils/metaSocialFormat.js'

import CRYPTO_DAILY_POST from '@fixtures/meta-social/crypto-2025-01-15-daily-post.json'
import CRYPTO_STORY      from '@fixtures/meta-social/crypto-2025-01-15-story.json'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TOPIC_SLUGS = ['crypto', 'finance', 'economy', 'health', 'ai', 'energy', 'technology']

function makeSampleAiOutput(overrides = {}) {
  return {
    post_caption:          'Bitcoin ETF inflows hit a record $500M in a single session.',
    hashtags:              ['#bitcoin', '#BTC', '#ETF'],
    image_prompt:          'Bitcoin chart on dark background',
    story_caption:         'BTC ETFs record $500M inflows 🚀',
    story_background_hint: 'Dark gradient with orange Bitcoin symbol',
    cta:                   'Full daily crypto briefing — link in bio.',
    ...overrides
  }
}

function makeSampleAlert(overrides = {}) {
  return {
    item_id:          'c1a2b3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5',
    topic_slug:       'crypto',
    headline:         'Spot Bitcoin ETFs record $500M inflows in a single session',
    summary_text:     'US-listed spot Bitcoin ETFs attracted more than $500 million in net inflows.',
    importance_score: 82,
    severity_score:   60,
    event_at:         '2025-01-15T14:30:00Z',
    ...overrides
  }
}

// ---------------------------------------------------------------------------
// normalizeHashtag
// ---------------------------------------------------------------------------

describe('normalizeHashtag', () => {
  it('adds # prefix when missing', () => {
    expect(normalizeHashtag('crypto')).toBe('#crypto')
  })

  it('preserves existing # prefix', () => {
    expect(normalizeHashtag('#crypto')).toBe('#crypto')
  })

  it('handles tags with underscores and numbers', () => {
    expect(normalizeHashtag('web3_tech')).toBe('#web3_tech')
  })
})

// ---------------------------------------------------------------------------
// mergeHashtags
// ---------------------------------------------------------------------------

describe('mergeHashtags', () => {
  it('deduplicates AI hashtags with base topic hashtags', () => {
    const result = mergeHashtags(['#crypto', '#bitcoin'], 'crypto')
    // #crypto is in both AI output and base — should appear only once
    const cryptoCount = result.filter(h => h === '#crypto').length
    expect(cryptoCount).toBe(1)
  })

  it('caps total hashtag count at 30', () => {
    const many = Array.from({ length: 50 }, (_, i) => `#tag${i}`)
    const result = mergeHashtags(many, 'crypto')
    expect(result.length).toBeLessThanOrEqual(30)
  })

  it('returns base hashtags for the topic even when aiHashtags is empty', () => {
    const result = mergeHashtags([], 'finance')
    expect(result).toEqual(expect.arrayContaining(TOPIC_BASE_HASHTAGS.finance))
  })

  it('returns empty-ish list for unknown topic (no base)', () => {
    const result = mergeHashtags(['#custom'], 'unknown_topic')
    expect(result).toContain('#custom')
  })

  it('normalises tags that are missing the # prefix', () => {
    const result = mergeHashtags(['bitcoin'], 'crypto')
    expect(result).toContain('#bitcoin')
  })

  it('all known topic slugs have base hashtags defined', () => {
    for (const slug of TOPIC_SLUGS) {
      expect(TOPIC_BASE_HASHTAGS[slug]).toBeDefined()
      expect(TOPIC_BASE_HASHTAGS[slug].length).toBeGreaterThan(0)
    }
  })
})

// ---------------------------------------------------------------------------
// buildInstagramCaption
// ---------------------------------------------------------------------------

describe('buildInstagramCaption', () => {
  it('short caption is returned unchanged (within 2200 chars)', () => {
    const body     = 'Short caption.'
    const cta      = 'Link in bio.'
    const hashtags = ['#crypto', '#bitcoin']
    const result   = buildInstagramCaption(body, cta, hashtags)
    expect(result.length).toBeLessThanOrEqual(INSTAGRAM_CAPTION_MAX)
    expect(result).toContain(body)
    expect(result).toContain(cta)
    expect(result).toContain('#crypto')
  })

  it('appends CTA and hashtags separated by double newlines', () => {
    const result = buildInstagramCaption('Body text.', 'CTA line.', ['#tag'])
    expect(result).toBe('Body text.\n\nCTA line.\n\n#tag')
  })

  it('omits CTA block when cta is empty string', () => {
    const result = buildInstagramCaption('Body.', '', ['#tag'])
    expect(result).toBe('Body.\n\n#tag')
    expect(result).not.toContain('\n\n\n')
  })

  it('omits hashtag block when hashtags array is empty', () => {
    const result = buildInstagramCaption('Body.', 'CTA.', [])
    expect(result).toBe('Body.\n\nCTA.')
  })

  it('truncates body when total would exceed 2200 chars', () => {
    const longBody = 'A'.repeat(2300)
    const result   = buildInstagramCaption(longBody, 'CTA.', ['#tag'])
    expect(result.length).toBeLessThanOrEqual(INSTAGRAM_CAPTION_MAX)
    expect(result).toContain('CTA.')
    expect(result).toContain('#tag')
    expect(result).toContain('...')
  })

  it('always ends with hashtags when hashtags are provided', () => {
    const result = buildInstagramCaption('Body.', 'CTA.', ['#first', '#second'])
    expect(result.endsWith('#first #second')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// buildFacebookCaption
// ---------------------------------------------------------------------------

describe('buildFacebookCaption', () => {
  it('short caption is returned unchanged', () => {
    const result = buildFacebookCaption('Body.', 'CTA.', ['#tag'])
    expect(result.length).toBeLessThanOrEqual(FACEBOOK_CAPTION_MAX)
    expect(result).toContain('Body.')
  })

  it('caption structure matches Instagram (double-newline separators)', () => {
    const igResult = buildInstagramCaption('Body.', 'CTA.', ['#tag'])
    const fbResult = buildFacebookCaption('Body.', 'CTA.', ['#tag'])
    expect(fbResult).toBe(igResult)
  })

  it('truncates at 63206 chars', () => {
    const longBody = 'B'.repeat(64000)
    const result   = buildFacebookCaption(longBody, '', [])
    expect(result.length).toBeLessThanOrEqual(FACEBOOK_CAPTION_MAX)
  })
})

// ---------------------------------------------------------------------------
// truncateStoryCaption
// ---------------------------------------------------------------------------

describe('truncateStoryCaption', () => {
  it('returns short caption unchanged', () => {
    const text = 'Short story caption 🚀'
    expect(truncateStoryCaption(text)).toBe(text)
  })

  it('truncates caption exceeding 200 chars with ellipsis', () => {
    const long   = 'X'.repeat(250)
    const result = truncateStoryCaption(long)
    expect(result.length).toBeLessThanOrEqual(STORY_CAPTION_MAX)
    expect(result.endsWith('…')).toBe(true)
  })

  it('returns empty string for non-string input', () => {
    expect(truncateStoryCaption(null)).toBe('')
    expect(truncateStoryCaption(undefined)).toBe('')
    expect(truncateStoryCaption(42)).toBe('')
  })

  it('returns caption of exactly 200 chars unchanged', () => {
    const exact = 'E'.repeat(200)
    expect(truncateStoryCaption(exact)).toBe(exact)
  })
})

// ---------------------------------------------------------------------------
// formatDailySocialAsset
// ---------------------------------------------------------------------------

describe('formatDailySocialAsset', () => {
  function defaults(overrides = {}) {
    return {
      topicSlug:         'crypto',
      dateKey:           '2025-01-15',
      aiOutput:          makeSampleAiOutput(),
      instagramEnabled:  true,
      facebookEnabled:   true,
      igStoriesEnabled:  false,
      fbStoriesEnabled:  false,
      publishJobId:      42,
      ...overrides
    }
  }

  it('produces an object with all required meta_social_asset fields', () => {
    const asset = formatDailySocialAsset(defaults())
    expect(asset.topic_slug).toBe('crypto')
    expect(asset.date_key).toBe('2025-01-15')
    expect(asset.asset_type).toBe('daily_post')
    expect(asset.source_type).toBe('daily_summary')
    expect(asset.source_id).toBeNull()
    expect(asset.publish_job_id).toBe(42)
    expect(asset.ai_output).toBeDefined()
    expect(asset.instagram).toBeDefined()
    expect(asset.facebook).toBeDefined()
    expect(asset.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('instagram.enabled reflects instagramEnabled parameter', () => {
    const enabled  = formatDailySocialAsset(defaults({ instagramEnabled: true }))
    const disabled = formatDailySocialAsset(defaults({ instagramEnabled: false }))
    expect(enabled.instagram.enabled).toBe(true)
    expect(disabled.instagram.enabled).toBe(false)
  })

  it('facebook.enabled reflects facebookEnabled parameter', () => {
    const enabled  = formatDailySocialAsset(defaults({ facebookEnabled: true }))
    const disabled = formatDailySocialAsset(defaults({ facebookEnabled: false }))
    expect(enabled.facebook.enabled).toBe(true)
    expect(disabled.facebook.enabled).toBe(false)
  })

  it('instagram.story_enabled is false when igStoriesEnabled is false', () => {
    const asset = formatDailySocialAsset(defaults({ igStoriesEnabled: false }))
    expect(asset.instagram.story_enabled).toBe(false)
  })

  it('instagram.story_enabled is true when both instagramEnabled and igStoriesEnabled are true', () => {
    const asset = formatDailySocialAsset(defaults({ instagramEnabled: true, igStoriesEnabled: true }))
    expect(asset.instagram.story_enabled).toBe(true)
  })

  it('instagram.story_enabled is false when platform is disabled even if stories are enabled', () => {
    const asset = formatDailySocialAsset(defaults({ instagramEnabled: false, igStoriesEnabled: true }))
    expect(asset.instagram.story_enabled).toBe(false)
  })

  it('falls back to default CTA when ai_output.cta is null', () => {
    const asset = formatDailySocialAsset(defaults({
      aiOutput: makeSampleAiOutput({ cta: null })
    }))
    expect(asset.instagram.caption).toContain('Follow for daily crypto updates.')
  })

  it('uses provided CTA from ai_output', () => {
    const asset = formatDailySocialAsset(defaults())
    expect(asset.instagram.caption).toContain('Full daily crypto briefing — link in bio.')
  })

  it('merges topic base hashtags into the Instagram caption', () => {
    const asset = formatDailySocialAsset(defaults({
      aiOutput: makeSampleAiOutput({ hashtags: ['#bitcoin'] })
    }))
    // TOPIC_BASE_HASHTAGS.crypto contains #crypto, #blockchain, etc.
    expect(asset.instagram.caption).toContain('#blockchain')
  })

  it('Instagram caption is within 2200 chars', () => {
    const asset = formatDailySocialAsset(defaults())
    expect(asset.instagram.caption.length).toBeLessThanOrEqual(INSTAGRAM_CAPTION_MAX)
  })

  it('story_caption in instagram is null when ai_output.story_caption is null', () => {
    const asset = formatDailySocialAsset(defaults({
      aiOutput: makeSampleAiOutput({ story_caption: null })
    }))
    expect(asset.instagram.story_caption).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// formatAlertStoryAsset
// ---------------------------------------------------------------------------

describe('formatAlertStoryAsset', () => {
  it('produces an object with all required meta_social_asset fields', () => {
    const asset = formatAlertStoryAsset(makeSampleAlert(), { igStoryEnabled: true, fbStoryEnabled: false })
    expect(asset.topic_slug).toBe('crypto')
    expect(asset.date_key).toBe('2025-01-15')
    expect(asset.asset_type).toBe('story')
    expect(asset.source_type).toBe('alert')
    expect(asset.source_id).toBeTypeOf('string')
    expect(asset.publish_job_id).toBeNull()
    expect(asset.instagram).toBeDefined()
    expect(asset.facebook).toBeDefined()
    expect(asset.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('story caption includes the topic emoji', () => {
    const asset = formatAlertStoryAsset(makeSampleAlert(), { igStoryEnabled: true, fbStoryEnabled: false })
    expect(asset.instagram.story_caption).toContain('🪙')
  })

  it('story caption is truncated when headline is very long', () => {
    const alert = makeSampleAlert({ headline: 'H'.repeat(300) })
    const asset = formatAlertStoryAsset(alert, { igStoryEnabled: true, fbStoryEnabled: false })
    expect(asset.instagram.story_caption.length).toBeLessThanOrEqual(STORY_CAPTION_MAX)
  })

  it('instagram is disabled when igStoryEnabled is false', () => {
    const asset = formatAlertStoryAsset(makeSampleAlert(), { igStoryEnabled: false, fbStoryEnabled: false })
    expect(asset.instagram.enabled).toBe(false)
    expect(asset.instagram.story_enabled).toBe(false)
  })

  it('facebook is enabled when fbStoryEnabled is true', () => {
    const asset = formatAlertStoryAsset(makeSampleAlert(), { igStoryEnabled: false, fbStoryEnabled: true })
    expect(asset.facebook.enabled).toBe(true)
    expect(asset.facebook.story_enabled).toBe(true)
  })

  it('date_key is derived from event_at', () => {
    const asset = formatAlertStoryAsset(makeSampleAlert({ event_at: '2025-03-10T08:00:00Z' }), { igStoryEnabled: true, fbStoryEnabled: false })
    expect(asset.date_key).toBe('2025-03-10')
  })

  it('all topic slugs produce the correct emoji in the story caption', () => {
    const emojiMap = {
      crypto: '🪙', finance: '📈', economy: '🏦',
      health: '🏥', ai: '🤖', energy: '⚡', technology: '💻'
    }
    for (const [slug, emoji] of Object.entries(emojiMap)) {
      const alert = makeSampleAlert({ topic_slug: slug })
      const asset = formatAlertStoryAsset(alert, { igStoryEnabled: true, fbStoryEnabled: false })
      expect(asset.instagram.story_caption).toContain(emoji)
    }
  })
})

// ---------------------------------------------------------------------------
// isAlertStoryEligible
// ---------------------------------------------------------------------------

describe('isAlertStoryEligible', () => {
  it('returns true when importance_score equals the threshold', () => {
    expect(isAlertStoryEligible({ importance_score: 80 }, 80)).toBe(true)
  })

  it('returns true when importance_score exceeds the threshold', () => {
    expect(isAlertStoryEligible({ importance_score: 95 }, 80)).toBe(true)
  })

  it('returns false when importance_score is below the threshold', () => {
    expect(isAlertStoryEligible({ importance_score: 79 }, 80)).toBe(false)
  })

  it('uses ALERT_STORY_THRESHOLD_DEFAULT when no threshold is provided', () => {
    expect(isAlertStoryEligible({ importance_score: ALERT_STORY_THRESHOLD_DEFAULT })).toBe(true)
    expect(isAlertStoryEligible({ importance_score: ALERT_STORY_THRESHOLD_DEFAULT - 1 })).toBe(false)
  })

  it('returns false for non-numeric importance_score', () => {
    expect(isAlertStoryEligible({ importance_score: null })).toBe(false)
    expect(isAlertStoryEligible({ importance_score: undefined })).toBe(false)
    expect(isAlertStoryEligible({})).toBe(false)
  })

  it('ALERT_STORY_THRESHOLD_DEFAULT is 80', () => {
    expect(ALERT_STORY_THRESHOLD_DEFAULT).toBe(80)
  })
})

// ---------------------------------------------------------------------------
// Fixture compatibility
// ---------------------------------------------------------------------------

describe('Meta social fixtures', () => {
  const META_ASSET_TYPES    = ['daily_post', 'story']
  const META_SOURCE_TYPES   = ['daily_summary', 'alert']
  const META_PLATFORM_TYPES = ['feed', 'story']

  function assertMetaSocialAsset(fixture, label) {
    expect(fixture, `${label}: must be an object`).toBeTypeOf('object')
    expect(fixture.topic_slug,  `${label}: topic_slug`).toBeTypeOf('string')
    expect(fixture.date_key,    `${label}: date_key`).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(META_ASSET_TYPES,    `${label}: asset_type`).toContain(fixture.asset_type)
    expect(META_SOURCE_TYPES,   `${label}: source_type`).toContain(fixture.source_type)
    expect(fixture.ai_output,   `${label}: ai_output`).toBeTypeOf('object')
    expect(fixture.ai_output.post_caption, `${label}: ai_output.post_caption`).toBeTypeOf('string')
    expect(Array.isArray(fixture.ai_output.hashtags), `${label}: ai_output.hashtags`).toBe(true)
    expect(fixture.instagram,   `${label}: instagram`).toBeTypeOf('object')
    expect(fixture.instagram.caption, `${label}: instagram.caption`).toBeTypeOf('string')
    expect(typeof fixture.instagram.enabled, `${label}: instagram.enabled`).toBe('boolean')
    expect(fixture.facebook,    `${label}: facebook`).toBeTypeOf('object')
    expect(fixture.facebook.caption, `${label}: facebook.caption`).toBeTypeOf('string')
    expect(typeof fixture.facebook.enabled, `${label}: facebook.enabled`).toBe('boolean')
    expect(fixture.generated_at, `${label}: generated_at`).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  }

  it('crypto daily post fixture has correct shape', () => {
    assertMetaSocialAsset(CRYPTO_DAILY_POST, 'crypto-daily-post')
  })

  it('crypto daily post fixture has asset_type daily_post', () => {
    expect(CRYPTO_DAILY_POST.asset_type).toBe('daily_post')
  })

  it('crypto daily post fixture instagram caption is within 2200 chars', () => {
    expect(CRYPTO_DAILY_POST.instagram.caption.length).toBeLessThanOrEqual(INSTAGRAM_CAPTION_MAX)
  })

  it('crypto daily post fixture facebook caption is within 63206 chars', () => {
    expect(CRYPTO_DAILY_POST.facebook.caption.length).toBeLessThanOrEqual(FACEBOOK_CAPTION_MAX)
  })

  it('crypto story fixture has correct shape', () => {
    assertMetaSocialAsset(CRYPTO_STORY, 'crypto-story')
  })

  it('crypto story fixture has asset_type story', () => {
    expect(CRYPTO_STORY.asset_type).toBe('story')
  })

  it('crypto story fixture has source_type alert', () => {
    expect(CRYPTO_STORY.source_type).toBe('alert')
  })

  it('crypto story fixture instagram story_caption is within 200 chars', () => {
    if (CRYPTO_STORY.instagram.story_caption) {
      expect(CRYPTO_STORY.instagram.story_caption.length).toBeLessThanOrEqual(STORY_CAPTION_MAX)
    }
  })

  it('crypto story fixture has a source_id', () => {
    expect(CRYPTO_STORY.source_id).toBeTypeOf('string')
    expect(CRYPTO_STORY.source_id.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Workflow branching — daily_post vs story
// ---------------------------------------------------------------------------

describe('Workflow branching — daily_post vs story', () => {
  function dailyDefaults(overrides = {}) {
    return {
      topicSlug:        'finance',
      dateKey:          '2025-01-15',
      aiOutput:         makeSampleAiOutput(),
      instagramEnabled: true,
      facebookEnabled:  true,
      igStoriesEnabled: false,
      fbStoriesEnabled: false,
      publishJobId:     101,
      ...overrides
    }
  }

  it('formatDailySocialAsset produces asset_type daily_post', () => {
    const asset = formatDailySocialAsset(dailyDefaults())
    expect(asset.asset_type).toBe('daily_post')
  })

  it('formatAlertStoryAsset produces asset_type story', () => {
    const asset = formatAlertStoryAsset(makeSampleAlert(), { igStoryEnabled: true, fbStoryEnabled: false })
    expect(asset.asset_type).toBe('story')
  })

  it('formatDailySocialAsset has source_type daily_summary', () => {
    const asset = formatDailySocialAsset(dailyDefaults())
    expect(asset.source_type).toBe('daily_summary')
  })

  it('formatAlertStoryAsset has source_type alert', () => {
    const asset = formatAlertStoryAsset(makeSampleAlert(), { igStoryEnabled: true, fbStoryEnabled: false })
    expect(asset.source_type).toBe('alert')
  })

  it('daily_post source_id is null', () => {
    const asset = formatDailySocialAsset(dailyDefaults())
    expect(asset.source_id).toBeNull()
  })

  it('story source_id is taken from alert.item_id', () => {
    const alert = makeSampleAlert({ item_id: 'abc123' })
    const asset = formatAlertStoryAsset(alert, { igStoryEnabled: true, fbStoryEnabled: false })
    expect(asset.source_id).toBe('abc123')
  })

  it('daily_post publish_job_id reflects the provided param', () => {
    const asset = formatDailySocialAsset(dailyDefaults({ publishJobId: 42 }))
    expect(asset.publish_job_id).toBe(42)
  })

  it('story publish_job_id is always null', () => {
    const asset = formatAlertStoryAsset(makeSampleAlert(), { igStoryEnabled: true, fbStoryEnabled: false })
    expect(asset.publish_job_id).toBeNull()
  })

  it('daily_post Instagram caption contains CTA and hashtags; story caption is short', () => {
    const dailyAsset = formatDailySocialAsset(dailyDefaults())
    const storyAsset = formatAlertStoryAsset(makeSampleAlert(), { igStoryEnabled: true, fbStoryEnabled: false })

    // Daily post caption must include a CTA line and a hashtag block
    expect(dailyAsset.instagram.caption).toContain('\n\n')
    expect(dailyAsset.instagram.caption).toMatch(/#\w+/)

    // Story caption is short and has no embedded hashtag block
    expect(storyAsset.instagram.story_caption.length).toBeLessThanOrEqual(STORY_CAPTION_MAX)
  })

  it('daily_post ai_output preserves all six AI fields', () => {
    const asset = formatDailySocialAsset(dailyDefaults())
    expect(asset.ai_output).toHaveProperty('post_caption')
    expect(asset.ai_output).toHaveProperty('hashtags')
    expect(asset.ai_output).toHaveProperty('image_prompt')
    expect(asset.ai_output).toHaveProperty('story_caption')
    expect(asset.ai_output).toHaveProperty('story_background_hint')
    expect(asset.ai_output).toHaveProperty('cta')
  })

  it('story ai_output derives hashtags from topic_slug', () => {
    const asset = formatAlertStoryAsset(makeSampleAlert({ topic_slug: 'finance' }), { igStoryEnabled: true, fbStoryEnabled: false })
    expect(asset.ai_output.hashtags).toContain('#finance')
  })
})

// ---------------------------------------------------------------------------
// Platform disabled / invalid publish configuration
// ---------------------------------------------------------------------------

describe('Platform disabled / invalid publish configuration', () => {
  function disabledDefaults(overrides = {}) {
    return {
      topicSlug:        'crypto',
      dateKey:          '2025-01-15',
      aiOutput:         makeSampleAiOutput(),
      instagramEnabled: false,
      facebookEnabled:  false,
      igStoriesEnabled: false,
      fbStoriesEnabled: false,
      ...overrides
    }
  }

  it('both platforms disabled still returns a valid meta_social_asset shape', () => {
    const asset = formatDailySocialAsset(disabledDefaults())
    expect(asset.topic_slug).toBe('crypto')
    expect(asset.date_key).toBe('2025-01-15')
    expect(asset.asset_type).toBe('daily_post')
    expect(asset.instagram).toBeDefined()
    expect(asset.facebook).toBeDefined()
    expect(asset.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('both instagram.enabled and facebook.enabled are false when both disabled', () => {
    const asset = formatDailySocialAsset(disabledDefaults())
    expect(asset.instagram.enabled).toBe(false)
    expect(asset.facebook.enabled).toBe(false)
  })

  it('story_enabled is false on both platforms when platform is disabled, even if stories toggled on', () => {
    const asset = formatDailySocialAsset(disabledDefaults({ igStoriesEnabled: true, fbStoriesEnabled: true }))
    expect(asset.instagram.story_enabled).toBe(false)
    expect(asset.facebook.story_enabled).toBe(false)
  })

  it('story_enabled is false when only the story toggle is off even if platform is enabled', () => {
    const asset = formatDailySocialAsset(disabledDefaults({
      instagramEnabled: true,
      facebookEnabled:  true,
      igStoriesEnabled: false,
      fbStoriesEnabled: false
    }))
    expect(asset.instagram.story_enabled).toBe(false)
    expect(asset.facebook.story_enabled).toBe(false)
  })

  it('unknown topic_slug in alert produces fallback newspaper emoji in story caption', () => {
    const alert = makeSampleAlert({ topic_slug: 'unknown_topic' })
    const asset = formatAlertStoryAsset(alert, { igStoryEnabled: true, fbStoryEnabled: false })
    expect(asset.instagram.story_caption).toContain('📰')
  })

  it('alert with missing item_id has null source_id', () => {
    const alert = makeSampleAlert({ item_id: undefined })
    const asset = formatAlertStoryAsset(alert, { igStoryEnabled: true, fbStoryEnabled: false })
    expect(asset.source_id).toBeNull()
  })

  it('alert with no event_at falls back to today for date_key', () => {
    const alert = makeSampleAlert({ event_at: undefined })
    const asset = formatAlertStoryAsset(alert, { igStoryEnabled: true, fbStoryEnabled: false })
    const todayKey = new Date().toISOString().slice(0, 10)
    expect(asset.date_key).toBe(todayKey)
  })

  it('alert with igStoryEnabled false and fbStoryEnabled false produces disabled story asset', () => {
    const asset = formatAlertStoryAsset(makeSampleAlert(), { igStoryEnabled: false, fbStoryEnabled: false })
    expect(asset.instagram.enabled).toBe(false)
    expect(asset.facebook.enabled).toBe(false)
    expect(asset.instagram.story_enabled).toBe(false)
    expect(asset.facebook.story_enabled).toBe(false)
    // Caption fields are empty string when disabled
    expect(asset.instagram.caption).toBe('')
    expect(asset.facebook.caption).toBe('')
  })

  it('formatDailySocialAsset with publish_job_id null defaults to null', () => {
    const asset = formatDailySocialAsset(disabledDefaults({ publishJobId: null }))
    expect(asset.publish_job_id).toBeNull()
  })

  it('isAlertStoryEligible returns false when importance_score is zero', () => {
    expect(isAlertStoryEligible({ importance_score: 0 })).toBe(false)
  })

  it('isAlertStoryEligible returns false when importance_score is exactly one below threshold', () => {
    expect(isAlertStoryEligible({ importance_score: 79 }, 80)).toBe(false)
  })

  it('story caption is empty string for disabled platform, not null', () => {
    const asset = formatAlertStoryAsset(makeSampleAlert(), { igStoryEnabled: false, fbStoryEnabled: false })
    expect(asset.instagram.caption).toBe('')
    expect(asset.facebook.caption).toBe('')
  })
})
