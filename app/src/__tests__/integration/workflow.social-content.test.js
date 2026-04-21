/**
 * Integration tests — Social content generation and formatting for X, Telegram, Discord
 *
 * Validates the platform-specific formatting utilities used in the
 * n8n social workflow modules (daily/13, daily/14, intraday/11).
 *
 * Covered scenarios:
 *
 *   X formatting
 *     - buildXPost fits within 280 chars for short caption
 *     - buildXPost truncates body when total exceeds 280 chars
 *     - buildXPost prepends topic emoji
 *     - buildXPost includes up to 5 hashtags
 *     - buildXAlertPost fits within 280 chars for short headline
 *     - buildXAlertPost truncates when headline + source_url exceeds 280
 *     - buildXAlertPost omits source_url suffix when null
 *     - buildXThread returns null for short body
 *     - buildXThread splits long body into multiple posts
 *
 *   Telegram formatting
 *     - buildTelegramDailyMessage produces valid HTML with bold topic header
 *     - buildTelegramDailyMessage includes CTA and hashtags
 *     - buildTelegramDailyMessage truncates to 4096 chars
 *     - buildTelegramAlertMessage includes importance bar
 *     - buildTelegramAlertMessage includes source link when present
 *     - escapeHtml escapes &, <, >, " characters
 *
 *   Discord formatting
 *     - buildDiscordDailyEmbed produces valid embed shape
 *     - buildDiscordDailyEmbed uses correct topic color
 *     - buildDiscordDailyEmbed includes CTA field
 *     - buildDiscordAlertEmbed includes importance and severity fields
 *     - buildDiscordAlertEmbed includes source URL when present
 *
 *   daily social content asset formatting
 *     - produces a correctly shaped social_content_asset for daily_post
 *     - x.enabled reflects xEnabled parameter
 *     - telegram.enabled reflects telegramEnabled parameter
 *     - discord.enabled reflects discordEnabled parameter
 *     - x.post_text is within 280 chars
 *     - telegram.message_html is within 4096 chars
 *     - discord.embed has required shape
 *
 *   alert social content asset formatting
 *     - produces a correctly shaped social_content_asset for story
 *     - x.alert_text is within 280 chars
 *     - telegram.alert_html is populated
 *     - discord.alert_embed is populated
 *     - isAlertSocialEligible returns true at threshold boundary
 *     - isAlertSocialEligible returns false below threshold
 *
 *   fixture compatibility
 *     - crypto daily post fixture matches social_content_asset shape
 *     - crypto story fixture matches social_content_asset shape
 */
import { describe, it, expect } from 'vitest'
import {
  buildXPost,
  buildXAlertPost,
  buildXThread,
  buildTelegramDailyMessage,
  buildTelegramAlertMessage,
  buildDiscordDailyEmbed,
  buildDiscordAlertEmbed,
  escapeHtml,
  formatDailySocialContentAsset,
  formatAlertSocialContentAsset,
  isAlertSocialEligible,
  X_POST_MAX,
  TELEGRAM_MESSAGE_MAX,
  DISCORD_EMBED_DESCRIPTION_MAX,
  DISCORD_EMBED_TITLE_MAX,
  TOPIC_EMOJI,
  DISCORD_TOPIC_COLOR
} from '@/utils/socialFormat.js'

import CRYPTO_DAILY_POST from '@fixtures/social-content/crypto-2025-01-15-daily-post.json'
import CRYPTO_STORY      from '@fixtures/social-content/crypto-2025-01-15-story.json'

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
    severity_score:   75,
    source_name:      'CoinDesk',
    source_url:       'https://example.com/btc-etf',
    event_at:         '2025-01-15T14:30:00Z',
    ...overrides
  }
}

// ---------------------------------------------------------------------------
// X formatting
// ---------------------------------------------------------------------------

describe('X formatting', () => {
  it('buildXPost fits within 280 chars for short caption', () => {
    const result = buildXPost('BTC breaks $50K', ['#crypto'], 'crypto')
    expect(result.length).toBeLessThanOrEqual(X_POST_MAX)
    expect(result).toContain('🪙')
    expect(result).toContain('#crypto')
  })

  it('buildXPost truncates body when total exceeds 280 chars', () => {
    const longBody = 'A'.repeat(300)
    const result = buildXPost(longBody, ['#crypto', '#bitcoin'], 'crypto')
    expect(result.length).toBeLessThanOrEqual(X_POST_MAX)
    expect(result).toContain('…')
  })

  it('buildXPost prepends topic emoji', () => {
    for (const slug of TOPIC_SLUGS) {
      const result = buildXPost('Test', [], slug)
      expect(result).toContain(TOPIC_EMOJI[slug])
    }
  })

  it('buildXPost includes up to 5 hashtags', () => {
    const hashtags = Array.from({ length: 10 }, (_, i) => `#tag${i}`)
    const result = buildXPost('Short post', hashtags, 'crypto')
    // Should only include 5 hashtags max
    const hashCount = (result.match(/#tag\d/g) || []).length
    expect(hashCount).toBeLessThanOrEqual(5)
  })

  it('buildXAlertPost fits within 280 chars for short headline', () => {
    const result = buildXAlertPost('BTC breaks $50K', 'crypto', null)
    expect(result.length).toBeLessThanOrEqual(X_POST_MAX)
    expect(result).toContain('🪙')
  })

  it('buildXAlertPost truncates when headline + source_url exceeds 280', () => {
    const longHeadline = 'A'.repeat(250)
    const result = buildXAlertPost(longHeadline, 'crypto', 'https://example.com/long-url')
    expect(result.length).toBeLessThanOrEqual(X_POST_MAX)
  })

  it('buildXAlertPost omits source_url suffix when null', () => {
    const result = buildXAlertPost('Short headline', 'crypto', null)
    expect(result).not.toContain('http')
  })

  it('buildXThread returns null for short body', () => {
    const result = buildXThread('Short text', ['#crypto'])
    expect(result).toBeNull()
  })

  it('buildXThread splits long body into multiple posts', () => {
    const longBody = 'The quick brown fox jumps over the lazy dog. '.repeat(20)
    const result = buildXThread(longBody, ['#crypto'])
    expect(result).not.toBeNull()
    expect(result.length).toBeGreaterThan(1)
    for (const post of result) {
      expect(post.length).toBeLessThanOrEqual(X_POST_MAX)
    }
  })
})

// ---------------------------------------------------------------------------
// Telegram formatting
// ---------------------------------------------------------------------------

describe('Telegram formatting', () => {
  it('buildTelegramDailyMessage produces valid HTML with bold topic header', () => {
    const result = buildTelegramDailyMessage({
      topicSlug: 'crypto',
      dateKey: '2025-01-15',
      captionBody: 'Bitcoin ETFs record $500M inflows.',
      cta: 'Follow for updates.',
      hashtags: ['#crypto']
    })
    expect(result).toContain('<b>Crypto Daily Briefing</b>')
    expect(result).toContain('2025-01-15')
    expect(result).toContain('🪙')
  })

  it('buildTelegramDailyMessage includes CTA and hashtags', () => {
    const result = buildTelegramDailyMessage({
      topicSlug: 'finance',
      dateKey: '2025-01-15',
      captionBody: 'Markets rally.',
      cta: 'Full briefing — link in bio.',
      hashtags: ['#finance', '#markets']
    })
    expect(result).toContain('Full briefing')
    expect(result).toContain('#finance')
  })

  it('buildTelegramDailyMessage HTML-escapes hashtags to prevent markup injection', () => {
    const result = buildTelegramDailyMessage({
      topicSlug: 'crypto',
      dateKey: '2025-01-15',
      captionBody: 'Test',
      cta: '',
      hashtags: ['#crypto', '#test<script>', '#a&b']
    })
    expect(result).not.toContain('<script>')
    expect(result).toContain('&lt;script&gt;')
    expect(result).not.toContain('#a&b')
    expect(result).toContain('#a&amp;b')
  })

  it('buildTelegramDailyMessage truncates to 4096 chars', () => {
    const result = buildTelegramDailyMessage({
      topicSlug: 'crypto',
      dateKey: '2025-01-15',
      captionBody: 'A'.repeat(5000),
      cta: '',
      hashtags: []
    })
    expect(result.length).toBeLessThanOrEqual(TELEGRAM_MESSAGE_MAX)
  })

  it('buildTelegramAlertMessage includes importance bar', () => {
    const result = buildTelegramAlertMessage(makeSampleAlert())
    expect(result).toContain('🟩')
    expect(result).toContain('82/100')
  })

  it('buildTelegramAlertMessage clamps importance bar when score > 100', () => {
    // importance_score > 100 should not cause negative repeat count
    const result = buildTelegramAlertMessage(makeSampleAlert({ importance_score: 150 }))
    expect(result).toBeTruthy()
    // Should have exactly 5 filled bars (clamped to max)
    const filled = (result.match(/🟩/gu) || []).length
    expect(filled).toBe(5)
    expect(result).not.toContain('⬜')
  })

  it('buildTelegramAlertMessage clamps importance bar when score < 0', () => {
    const result = buildTelegramAlertMessage(makeSampleAlert({ importance_score: -10 }))
    expect(result).toBeTruthy()
    // Should have 0 filled and 5 empty bars
    const filled = (result.match(/🟩/gu) || []).length
    expect(filled).toBe(0)
  })

  it('buildTelegramAlertMessage includes source link when present', () => {
    const result = buildTelegramAlertMessage(makeSampleAlert())
    expect(result).toContain('href=')
    expect(result).toContain('CoinDesk')
  })

  it('buildTelegramAlertMessage shows plain source when no URL', () => {
    const result = buildTelegramAlertMessage(makeSampleAlert({ source_url: null }))
    expect(result).toContain('Source: CoinDesk')
    expect(result).not.toContain('href=')
  })

  it('escapeHtml escapes &, <, >, " characters', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b')
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;')
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;')
  })
})

// ---------------------------------------------------------------------------
// Discord formatting
// ---------------------------------------------------------------------------

describe('Discord formatting', () => {
  it('buildDiscordDailyEmbed produces valid embed shape', () => {
    const embed = buildDiscordDailyEmbed({
      topicSlug: 'crypto',
      dateKey: '2025-01-15',
      captionBody: 'Bitcoin ETFs record $500M.',
      cta: 'Follow for updates.',
      hashtags: ['#crypto'],
      timestamp: '2025-01-15T23:45:00Z'
    })
    expect(embed).toHaveProperty('title')
    expect(embed).toHaveProperty('description')
    expect(embed).toHaveProperty('color')
    expect(embed).toHaveProperty('fields')
    expect(embed).toHaveProperty('footer')
    expect(embed).toHaveProperty('timestamp')
  })

  it('buildDiscordDailyEmbed uses correct topic color', () => {
    for (const slug of TOPIC_SLUGS) {
      const embed = buildDiscordDailyEmbed({
        topicSlug: slug, dateKey: '2025-01-15',
        captionBody: 'Test', cta: '', hashtags: [],
        timestamp: '2025-01-15T00:00:00Z'
      })
      expect(embed.color).toBe(DISCORD_TOPIC_COLOR[slug])
    }
  })

  it('buildDiscordDailyEmbed includes CTA field when provided', () => {
    const embed = buildDiscordDailyEmbed({
      topicSlug: 'crypto', dateKey: '2025-01-15',
      captionBody: 'Test', cta: 'Follow us', hashtags: [],
      timestamp: '2025-01-15T00:00:00Z'
    })
    const ctaField = embed.fields.find(f => f.name === 'CTA')
    expect(ctaField).toBeDefined()
    expect(ctaField.value).toBe('Follow us')
  })

  it('buildDiscordDailyEmbed omits CTA field when empty', () => {
    const embed = buildDiscordDailyEmbed({
      topicSlug: 'crypto', dateKey: '2025-01-15',
      captionBody: 'Test', cta: '', hashtags: [],
      timestamp: '2025-01-15T00:00:00Z'
    })
    const ctaField = embed.fields.find(f => f.name === 'CTA')
    expect(ctaField).toBeUndefined()
  })

  it('buildDiscordAlertEmbed includes importance and severity fields', () => {
    const embed = buildDiscordAlertEmbed(makeSampleAlert())
    const importance = embed.fields.find(f => f.name === 'Importance')
    const severity = embed.fields.find(f => f.name === 'Severity')
    expect(importance).toBeDefined()
    expect(importance.value).toBe('82/100')
    expect(severity).toBeDefined()
    expect(severity.value).toBe('75/100')
  })

  it('buildDiscordAlertEmbed includes source URL when present', () => {
    const embed = buildDiscordAlertEmbed(makeSampleAlert())
    expect(embed.url).toBe('https://example.com/btc-etf')
  })

  it('buildDiscordAlertEmbed omits URL when no source_url', () => {
    const embed = buildDiscordAlertEmbed(makeSampleAlert({ source_url: null }))
    expect(embed.url).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// daily social content asset formatting
// ---------------------------------------------------------------------------

describe('daily social content asset formatting', () => {
  it('produces a correctly shaped social_content_asset for daily_post', () => {
    const asset = formatDailySocialContentAsset({
      topicSlug: 'crypto',
      dateKey: '2025-01-15',
      aiOutput: makeSampleAiOutput(),
      xEnabled: true,
      telegramEnabled: true,
      discordEnabled: true,
      publishJobId: 42
    })

    expect(asset.topic_slug).toBe('crypto')
    expect(asset.date_key).toBe('2025-01-15')
    expect(asset.asset_type).toBe('daily_post')
    expect(asset.source_type).toBe('daily_summary')
    expect(asset.source_id).toBeNull()
    expect(asset.publish_job_id).toBe(42)
    expect(asset.ai_output).toBeDefined()
    expect(asset.x).toBeDefined()
    expect(asset.telegram).toBeDefined()
    expect(asset.discord).toBeDefined()
    expect(asset.generated_at).toBeDefined()
  })

  it('x.enabled reflects xEnabled parameter', () => {
    const enabled = formatDailySocialContentAsset({
      topicSlug: 'crypto', dateKey: '2025-01-15',
      aiOutput: makeSampleAiOutput(),
      xEnabled: true, telegramEnabled: false, discordEnabled: false
    })
    const disabled = formatDailySocialContentAsset({
      topicSlug: 'crypto', dateKey: '2025-01-15',
      aiOutput: makeSampleAiOutput(),
      xEnabled: false, telegramEnabled: false, discordEnabled: false
    })
    expect(enabled.x.enabled).toBe(true)
    expect(disabled.x.enabled).toBe(false)
  })

  it('telegram.enabled reflects telegramEnabled parameter', () => {
    const asset = formatDailySocialContentAsset({
      topicSlug: 'crypto', dateKey: '2025-01-15',
      aiOutput: makeSampleAiOutput(),
      xEnabled: false, telegramEnabled: true, discordEnabled: false
    })
    expect(asset.telegram.enabled).toBe(true)
  })

  it('discord.enabled reflects discordEnabled parameter', () => {
    const asset = formatDailySocialContentAsset({
      topicSlug: 'crypto', dateKey: '2025-01-15',
      aiOutput: makeSampleAiOutput(),
      xEnabled: false, telegramEnabled: false, discordEnabled: true
    })
    expect(asset.discord.enabled).toBe(true)
  })

  it('x.post_text is within 280 chars', () => {
    const asset = formatDailySocialContentAsset({
      topicSlug: 'crypto', dateKey: '2025-01-15',
      aiOutput: makeSampleAiOutput(),
      xEnabled: true, telegramEnabled: false, discordEnabled: false
    })
    expect(asset.x.post_text.length).toBeLessThanOrEqual(X_POST_MAX)
  })

  it('telegram.message_html is within 4096 chars', () => {
    const asset = formatDailySocialContentAsset({
      topicSlug: 'crypto', dateKey: '2025-01-15',
      aiOutput: makeSampleAiOutput(),
      xEnabled: false, telegramEnabled: true, discordEnabled: false
    })
    expect(asset.telegram.message_html.length).toBeLessThanOrEqual(TELEGRAM_MESSAGE_MAX)
  })

  it('discord.embed has required shape', () => {
    const asset = formatDailySocialContentAsset({
      topicSlug: 'crypto', dateKey: '2025-01-15',
      aiOutput: makeSampleAiOutput(),
      xEnabled: false, telegramEnabled: false, discordEnabled: true
    })
    expect(asset.discord.embed).toHaveProperty('title')
    expect(asset.discord.embed).toHaveProperty('description')
    expect(asset.discord.embed).toHaveProperty('color')
    expect(asset.discord.embed).toHaveProperty('fields')
  })

  it('fallback CTA is applied when ai_output.cta is null', () => {
    const asset = formatDailySocialContentAsset({
      topicSlug: 'crypto', dateKey: '2025-01-15',
      aiOutput: makeSampleAiOutput({ cta: null }),
      xEnabled: false, telegramEnabled: true, discordEnabled: true
    })
    expect(asset.telegram.message_html).toContain('Follow for daily crypto updates')
    const ctaField = asset.discord.embed.fields.find(f => f.name === 'CTA')
    expect(ctaField).toBeDefined()
    expect(ctaField.value).toContain('Follow for daily crypto updates')
  })

  it('topic-level base hashtags are merged into formatted content', () => {
    const asset = formatDailySocialContentAsset({
      topicSlug: 'crypto', dateKey: '2025-01-15',
      aiOutput: makeSampleAiOutput({ hashtags: ['#bitcoin'] }),
      xEnabled: true, telegramEnabled: true, discordEnabled: false
    })
    // X post should include at least #bitcoin (from AI) and topic base hashtags
    expect(asset.x.post_text).toContain('#bitcoin')
    // Telegram should include merged hashtags
    expect(asset.telegram.message_html).toContain('#crypto')
  })

  it('daily_post alert fields are null', () => {
    const asset = formatDailySocialContentAsset({
      topicSlug: 'crypto', dateKey: '2025-01-15',
      aiOutput: makeSampleAiOutput(),
      xEnabled: true, telegramEnabled: true, discordEnabled: true
    })
    expect(asset.x.alert_text).toBeNull()
    expect(asset.telegram.alert_html).toBeNull()
    expect(asset.discord.alert_embed).toBeNull()
  })

  it('x.thread is null when threadsEnabled is false (default)', () => {
    const longCaption = 'A very long caption. '.repeat(20)
    const asset = formatDailySocialContentAsset({
      topicSlug: 'crypto', dateKey: '2025-01-15',
      aiOutput: makeSampleAiOutput({ post_caption: longCaption }),
      xEnabled: true, telegramEnabled: false, discordEnabled: false
      // threadsEnabled defaults to false
    })
    expect(asset.x.thread).toBeNull()
  })

  it('x.thread is populated when threadsEnabled is true and caption is long', () => {
    const longCaption = 'A very long caption. '.repeat(20)
    const asset = formatDailySocialContentAsset({
      topicSlug: 'crypto', dateKey: '2025-01-15',
      aiOutput: makeSampleAiOutput({ post_caption: longCaption }),
      xEnabled: true, telegramEnabled: false, discordEnabled: false,
      threadsEnabled: true
    })
    expect(asset.x.thread).not.toBeNull()
    expect(asset.x.thread.length).toBeGreaterThan(1)
    for (const post of asset.x.thread) {
      expect(post.length).toBeLessThanOrEqual(X_POST_MAX)
    }
  })

  it('x.thread is null when threadsEnabled is true but caption is short', () => {
    const asset = formatDailySocialContentAsset({
      topicSlug: 'crypto', dateKey: '2025-01-15',
      aiOutput: makeSampleAiOutput(), // short caption
      xEnabled: true, telegramEnabled: false, discordEnabled: false,
      threadsEnabled: true
    })
    expect(asset.x.thread).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// alert social content asset formatting
// ---------------------------------------------------------------------------

describe('alert social content asset formatting', () => {
  it('produces a correctly shaped social_content_asset for story', () => {
    const asset = formatAlertSocialContentAsset(makeSampleAlert(), {
      xEnabled: true, telegramEnabled: true, discordEnabled: true
    })
    expect(asset.topic_slug).toBe('crypto')
    expect(asset.asset_type).toBe('story')
    expect(asset.source_type).toBe('alert')
    expect(asset.source_id).toBe(makeSampleAlert().item_id)
    expect(asset.x).toBeDefined()
    expect(asset.telegram).toBeDefined()
    expect(asset.discord).toBeDefined()
  })

  it('x.alert_text is within 280 chars', () => {
    const asset = formatAlertSocialContentAsset(makeSampleAlert(), {
      xEnabled: true, telegramEnabled: false, discordEnabled: false
    })
    expect(asset.x.alert_text.length).toBeLessThanOrEqual(X_POST_MAX)
  })

  it('x.alert_text includes source URL', () => {
    const asset = formatAlertSocialContentAsset(makeSampleAlert(), {
      xEnabled: true, telegramEnabled: false, discordEnabled: false
    })
    expect(asset.x.alert_text).toContain('https://example.com/btc-etf')
  })

  it('telegram.alert_html is populated', () => {
    const asset = formatAlertSocialContentAsset(makeSampleAlert(), {
      xEnabled: false, telegramEnabled: true, discordEnabled: false
    })
    expect(asset.telegram.alert_html).toBeTruthy()
    expect(asset.telegram.alert_html).toContain('CRYPTO')
  })

  it('discord.alert_embed is populated', () => {
    const asset = formatAlertSocialContentAsset(makeSampleAlert(), {
      xEnabled: false, telegramEnabled: false, discordEnabled: true
    })
    expect(asset.discord.alert_embed).toBeTruthy()
    expect(asset.discord.alert_embed.title).toContain('Spot Bitcoin')
    expect(asset.discord.alert_embed.fields.length).toBeGreaterThanOrEqual(3)
  })

  it('date_key is derived from event_at when present', () => {
    const asset = formatAlertSocialContentAsset(makeSampleAlert({ event_at: '2025-03-20T10:00:00Z' }), {
      xEnabled: false, telegramEnabled: false, discordEnabled: false
    })
    expect(asset.date_key).toBe('2025-03-20')
  })

  it('isAlertSocialEligible returns true at threshold boundary', () => {
    expect(isAlertSocialEligible({ importance_score: 80 }, 80)).toBe(true)
  })

  it('isAlertSocialEligible returns false below threshold', () => {
    expect(isAlertSocialEligible({ importance_score: 79 }, 80)).toBe(false)
  })

  it('story caption includes topic emoji', () => {
    const asset = formatAlertSocialContentAsset(makeSampleAlert(), {
      xEnabled: true, telegramEnabled: false, discordEnabled: false
    })
    expect(asset.ai_output.story_caption).toContain('🪙')
  })

  it('handles very long headline in X alert post', () => {
    const longAlert = makeSampleAlert({ headline: 'A'.repeat(300) })
    const asset = formatAlertSocialContentAsset(longAlert, {
      xEnabled: true, telegramEnabled: false, discordEnabled: false
    })
    expect(asset.x.alert_text.length).toBeLessThanOrEqual(X_POST_MAX)
  })
})

// ---------------------------------------------------------------------------
// fixture compatibility
// ---------------------------------------------------------------------------

describe('fixture compatibility', () => {
  it('crypto daily post fixture matches social_content_asset shape', () => {
    expect(CRYPTO_DAILY_POST.topic_slug).toBe('crypto')
    expect(CRYPTO_DAILY_POST.date_key).toBe('2025-01-15')
    expect(CRYPTO_DAILY_POST.asset_type).toBe('daily_post')
    expect(CRYPTO_DAILY_POST.source_type).toBe('daily_summary')
    expect(CRYPTO_DAILY_POST.ai_output).toBeDefined()
    expect(CRYPTO_DAILY_POST.x).toBeDefined()
    expect(CRYPTO_DAILY_POST.x.enabled).toBe(true)
    expect(CRYPTO_DAILY_POST.x.post_text).toBeTruthy()
    expect(CRYPTO_DAILY_POST.telegram).toBeDefined()
    expect(CRYPTO_DAILY_POST.telegram.enabled).toBe(true)
    expect(CRYPTO_DAILY_POST.telegram.message_html).toBeTruthy()
    expect(CRYPTO_DAILY_POST.discord).toBeDefined()
    expect(CRYPTO_DAILY_POST.discord.enabled).toBe(true)
    expect(CRYPTO_DAILY_POST.discord.embed).toBeDefined()
    expect(CRYPTO_DAILY_POST.generated_at).toBeDefined()
  })

  it('crypto story fixture matches social_content_asset shape', () => {
    expect(CRYPTO_STORY.topic_slug).toBe('crypto')
    expect(CRYPTO_STORY.asset_type).toBe('story')
    expect(CRYPTO_STORY.source_type).toBe('alert')
    expect(CRYPTO_STORY.source_id).toBeTruthy()
    expect(CRYPTO_STORY.x).toBeDefined()
    expect(CRYPTO_STORY.x.alert_text).toBeTruthy()
    expect(CRYPTO_STORY.telegram).toBeDefined()
    expect(CRYPTO_STORY.telegram.alert_html).toBeTruthy()
    expect(CRYPTO_STORY.discord).toBeDefined()
    expect(CRYPTO_STORY.discord.alert_embed).toBeDefined()
  })
})
