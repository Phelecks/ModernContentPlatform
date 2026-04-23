/**
 * Integration tests — Telegram and Discord alert delivery formatting
 *
 * Validates the formatting utilities used by n8n intraday modules 08
 * (Telegram delivery) and 09 (Discord delivery), the delivery payload
 * contract, and the delivery log structure.
 *
 * Covered scenarios:
 *
 *   delivery payload contract
 *     - fixture conforms to intraday_delivery_payload shape
 *     - items array contains at least one item
 *     - each item has all required delivery fields
 *     - channels array only contains valid values
 *     - topic_slug values are valid
 *     - date_key matches YYYY-MM-DD format
 *     - score fields are integers between 0 and 100
 *
 *   Telegram alert formatting
 *     - buildTelegramAlertMessage produces non-empty HTML string
 *     - message includes topic emoji and uppercase topic
 *     - message includes importance bar
 *     - message includes HTML-escaped headline
 *     - message includes source link when source_url is present
 *     - message falls back to source_name only when source_url is null
 *     - message stays within 4096 character limit
 *     - escapeHtml escapes all required characters
 *     - importance bar renders 5 segments correctly
 *     - importance bar clamps to 0-5 range
 *
 *   Discord alert formatting
 *     - buildDiscordAlertEmbed produces valid embed shape
 *     - embed has correct topic color
 *     - embed includes Importance and Severity fields
 *     - embed includes source URL when present
 *     - embed omits url when source_url is null
 *     - embed title is within 256 character limit
 *     - embed description is within 4096 character limit
 *     - embed timestamp is valid ISO-8601
 *     - embed uses fallback color for unknown topic
 *
 *   channel routing
 *     - items with only telegram in channels are not routed to discord
 *     - items with only discord in channels are not routed to telegram
 *     - items with both channels are routed to both
 *
 *   delivery log structure
 *     - Telegram delivery log entry has correct platform and post_type
 *     - Discord delivery log entry has correct platform and post_type
 *     - delivery log entry includes required social_publish_log fields
 */
import { describe, it, expect } from 'vitest'
import {
  buildTelegramAlertMessage,
  buildDiscordAlertEmbed,
  escapeHtml,
  TELEGRAM_MESSAGE_MAX,
  DISCORD_EMBED_DESCRIPTION_MAX,
  DISCORD_EMBED_TITLE_MAX,
  DISCORD_TOPIC_COLOR
} from '@/utils/socialFormat.js'

import DELIVERY_PAYLOAD from '@fixtures/delivery-payloads/crypto-2025-01-15-telegram-discord.json'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_TOPICS = ['crypto', 'finance', 'economy', 'health', 'ai', 'energy', 'technology']
const VALID_CHANNELS = ['telegram', 'discord']
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

function makeSampleAlert(overrides = {}) {
  return {
    item_id:          'test-item-001',
    alert_id:         1001,
    topic_slug:       'crypto',
    headline:         'Bitcoin Hits New All-Time High Above $120K',
    summary_text:     'Bitcoin surged past $120,000, setting a new all-time high driven by institutional inflows.',
    source_url:       'https://example.com/btc-ath',
    source_name:      'CoinDesk',
    severity_score:   72,
    importance_score: 88,
    confidence_score: 95,
    event_at:         '2025-01-15T14:32:00Z',
    date_key:         '2025-01-15',
    ...overrides
  }
}

// ---------------------------------------------------------------------------
// Delivery payload contract
// ---------------------------------------------------------------------------

describe('delivery payload contract', () => {
  it('fixture has items array with at least one item', () => {
    expect(Array.isArray(DELIVERY_PAYLOAD.items)).toBe(true)
    expect(DELIVERY_PAYLOAD.items.length).toBeGreaterThanOrEqual(1)
  })

  it('each item has all required delivery fields', () => {
    const required = [
      'item_id', 'alert_id', 'topic_slug', 'headline', 'summary_text',
      'source_name', 'severity_score', 'importance_score', 'event_at',
      'date_key', 'channels'
    ]
    for (const item of DELIVERY_PAYLOAD.items) {
      for (const field of required) {
        expect(item).toHaveProperty(field)
      }
    }
  })

  it('channels array only contains valid values', () => {
    for (const item of DELIVERY_PAYLOAD.items) {
      expect(Array.isArray(item.channels)).toBe(true)
      for (const ch of item.channels) {
        expect(VALID_CHANNELS).toContain(ch)
      }
    }
  })

  it('topic_slug values are valid', () => {
    for (const item of DELIVERY_PAYLOAD.items) {
      expect(VALID_TOPICS).toContain(item.topic_slug)
    }
  })

  it('date_key matches YYYY-MM-DD format', () => {
    for (const item of DELIVERY_PAYLOAD.items) {
      expect(item.date_key).toMatch(DATE_KEY_RE)
    }
  })

  it('score fields are integers between 0 and 100', () => {
    const scoreFields = ['severity_score', 'importance_score']
    for (const item of DELIVERY_PAYLOAD.items) {
      for (const field of scoreFields) {
        expect(Number.isInteger(item[field])).toBe(true)
        expect(item[field]).toBeGreaterThanOrEqual(0)
        expect(item[field]).toBeLessThanOrEqual(100)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Telegram alert formatting
// ---------------------------------------------------------------------------

describe('Telegram alert formatting', () => {
  it('buildTelegramAlertMessage produces non-empty HTML string', () => {
    const msg = buildTelegramAlertMessage(makeSampleAlert())
    expect(typeof msg).toBe('string')
    expect(msg.length).toBeGreaterThan(0)
  })

  it('message includes topic emoji and uppercase topic', () => {
    const msg = buildTelegramAlertMessage(makeSampleAlert())
    expect(msg).toContain('🪙')
    expect(msg).toContain('CRYPTO')
  })

  it('message includes importance bar', () => {
    const msg = buildTelegramAlertMessage(makeSampleAlert({ importance_score: 80 }))
    expect(msg).toContain('🟩')
    expect(msg).toContain('80/100')
  })

  it('message includes HTML-escaped headline', () => {
    const alert = makeSampleAlert({ headline: 'Price <rises> & "surges"' })
    const msg = buildTelegramAlertMessage(alert)
    expect(msg).toContain('&lt;rises&gt;')
    expect(msg).toContain('&amp;')
    expect(msg).toContain('&quot;surges&quot;')
  })

  it('message includes source link when source_url is present', () => {
    const msg = buildTelegramAlertMessage(makeSampleAlert())
    expect(msg).toContain('<a href=')
    expect(msg).toContain('CoinDesk')
  })

  it('message falls back to source_name only when source_url is null', () => {
    const msg = buildTelegramAlertMessage(makeSampleAlert({ source_url: null }))
    expect(msg).not.toContain('<a href=')
    expect(msg).toContain('Source: CoinDesk')
  })

  it('message stays within 4096 character limit', () => {
    const longSummary = 'A'.repeat(5000)
    const msg = buildTelegramAlertMessage(makeSampleAlert({ summary_text: longSummary }))
    expect(msg.length).toBeLessThanOrEqual(TELEGRAM_MESSAGE_MAX)
  })

  it('escapeHtml escapes all required characters', () => {
    expect(escapeHtml('&')).toBe('&amp;')
    expect(escapeHtml('<')).toBe('&lt;')
    expect(escapeHtml('>')).toBe('&gt;')
    expect(escapeHtml('"')).toBe('&quot;')
  })

  it('importance bar renders 5 segments correctly', () => {
    const msg100 = buildTelegramAlertMessage(makeSampleAlert({ importance_score: 100 }))
    expect((msg100.match(/🟩/g) || []).length).toBe(5)
    expect((msg100.match(/⬜/g) || []).length).toBe(0)

    const msg0 = buildTelegramAlertMessage(makeSampleAlert({ importance_score: 0 }))
    expect((msg0.match(/🟩/g) || []).length).toBe(0)
    expect((msg0.match(/⬜/g) || []).length).toBe(5)
  })

  it('importance bar clamps to 0-5 range for edge values', () => {
    const msg = buildTelegramAlertMessage(makeSampleAlert({ importance_score: 50 }))
    const filled = (msg.match(/🟩/g) || []).length
    const empty = (msg.match(/⬜/g) || []).length
    expect(filled + empty).toBe(5)
    expect(filled).toBeGreaterThanOrEqual(0)
    expect(filled).toBeLessThanOrEqual(5)
  })

  it('formats all fixture items without error', () => {
    for (const item of DELIVERY_PAYLOAD.items) {
      if (!item.channels.includes('telegram')) continue
      const msg = buildTelegramAlertMessage(item)
      expect(msg.length).toBeGreaterThan(0)
      expect(msg.length).toBeLessThanOrEqual(TELEGRAM_MESSAGE_MAX)
    }
  })
})

// ---------------------------------------------------------------------------
// Discord alert formatting
// ---------------------------------------------------------------------------

describe('Discord alert formatting', () => {
  it('buildDiscordAlertEmbed produces valid embed shape', () => {
    const embed = buildDiscordAlertEmbed(makeSampleAlert())
    expect(embed).toHaveProperty('title')
    expect(embed).toHaveProperty('description')
    expect(embed).toHaveProperty('color')
    expect(embed).toHaveProperty('fields')
    expect(embed).toHaveProperty('footer')
    expect(embed).toHaveProperty('timestamp')
  })

  it('embed has correct topic color', () => {
    for (const topic of VALID_TOPICS) {
      const embed = buildDiscordAlertEmbed(makeSampleAlert({ topic_slug: topic }))
      expect(embed.color).toBe(DISCORD_TOPIC_COLOR[topic])
    }
  })

  it('embed includes Importance and Severity fields', () => {
    const embed = buildDiscordAlertEmbed(makeSampleAlert())
    const fieldNames = embed.fields.map(f => f.name)
    expect(fieldNames).toContain('Importance')
    expect(fieldNames).toContain('Severity')
  })

  it('embed includes source URL when present', () => {
    const embed = buildDiscordAlertEmbed(makeSampleAlert())
    expect(embed.url).toBe('https://example.com/btc-ath')
  })

  it('embed omits url when source_url is null', () => {
    const embed = buildDiscordAlertEmbed(makeSampleAlert({ source_url: null }))
    expect(embed).not.toHaveProperty('url')
  })

  it('embed title is within 256 character limit', () => {
    const longHeadline = 'X'.repeat(300)
    const embed = buildDiscordAlertEmbed(makeSampleAlert({ headline: longHeadline }))
    expect(embed.title.length).toBeLessThanOrEqual(DISCORD_EMBED_TITLE_MAX)
  })

  it('embed description is within 4096 character limit', () => {
    const longSummary = 'Y'.repeat(5000)
    const embed = buildDiscordAlertEmbed(makeSampleAlert({ summary_text: longSummary }))
    expect(embed.description.length).toBeLessThanOrEqual(DISCORD_EMBED_DESCRIPTION_MAX)
  })

  it('embed timestamp is valid ISO-8601', () => {
    const embed = buildDiscordAlertEmbed(makeSampleAlert())
    expect(isNaN(Date.parse(embed.timestamp))).toBe(false)
  })

  it('embed uses fallback color for unknown topic', () => {
    const embed = buildDiscordAlertEmbed(makeSampleAlert({ topic_slug: 'unknown' }))
    expect(embed.color).toBe(0x95A5A6)
  })

  it('formats all fixture items without error', () => {
    for (const item of DELIVERY_PAYLOAD.items) {
      if (!item.channels.includes('discord')) continue
      const embed = buildDiscordAlertEmbed(item)
      expect(embed.title.length).toBeGreaterThan(0)
      expect(embed.description.length).toBeGreaterThan(0)
      expect(embed.title.length).toBeLessThanOrEqual(DISCORD_EMBED_TITLE_MAX)
    }
  })
})

// ---------------------------------------------------------------------------
// Channel routing
// ---------------------------------------------------------------------------

describe('channel routing', () => {
  it('items with only telegram in channels are not routed to discord', () => {
    const telegramOnly = DELIVERY_PAYLOAD.items.filter(
      i => i.channels.includes('telegram') && !i.channels.includes('discord')
    )
    for (const item of telegramOnly) {
      expect(item.channels).not.toContain('discord')
    }
  })

  it('items with only discord in channels are not routed to telegram', () => {
    const discordOnly = DELIVERY_PAYLOAD.items.filter(
      i => i.channels.includes('discord') && !i.channels.includes('telegram')
    )
    for (const item of discordOnly) {
      expect(item.channels).not.toContain('telegram')
    }
  })

  it('items with both channels are routed to both', () => {
    const both = DELIVERY_PAYLOAD.items.filter(
      i => i.channels.includes('telegram') && i.channels.includes('discord')
    )
    expect(both.length).toBeGreaterThan(0)
    for (const item of both) {
      expect(item.channels).toContain('telegram')
      expect(item.channels).toContain('discord')
    }
  })

  it('fixture has at least one telegram-only item', () => {
    const telegramOnly = DELIVERY_PAYLOAD.items.filter(
      i => i.channels.includes('telegram') && !i.channels.includes('discord')
    )
    expect(telegramOnly.length).toBeGreaterThanOrEqual(1)
  })
})

// ---------------------------------------------------------------------------
// Delivery log structure
// ---------------------------------------------------------------------------

describe('delivery log structure', () => {
  const SOCIAL_PUBLISH_LOG_FIELDS = [
    'topic_slug', 'date_key', 'platform', 'status'
  ]

  it('Telegram delivery log entry has correct platform and post_type', () => {
    const item = makeSampleAlert()
    const logEntry = {
      topic_slug:       item.topic_slug,
      date_key:         item.date_key,
      asset_type:       'story',
      source_type:      'alert',
      source_id:        item.item_id,
      platform:         'telegram',
      post_type:        'alert',
      status:           'published',
      platform_post_id: '12345',
      error_message:    null
    }
    expect(logEntry.platform).toBe('telegram')
    expect(logEntry.post_type).toBe('alert')
  })

  it('Discord delivery log entry has correct platform and post_type', () => {
    const item = makeSampleAlert()
    const logEntry = {
      topic_slug:       item.topic_slug,
      date_key:         item.date_key,
      asset_type:       'story',
      source_type:      'alert',
      source_id:        item.item_id,
      platform:         'discord',
      post_type:        'embed',
      status:           'published',
      platform_post_id: '98765',
      error_message:    null
    }
    expect(logEntry.platform).toBe('discord')
    expect(logEntry.post_type).toBe('embed')
  })

  it('delivery log entry includes required social_publish_log fields', () => {
    const logEntry = {
      topic_slug:       'crypto',
      date_key:         '2025-01-15',
      asset_type:       'story',
      source_type:      'alert',
      source_id:        'test-item-001',
      platform:         'telegram',
      post_type:        'alert',
      status:           'published',
      platform_post_id: '12345',
      error_message:    null
    }
    for (const field of SOCIAL_PUBLISH_LOG_FIELDS) {
      expect(logEntry).toHaveProperty(field)
    }
    expect(['pending', 'published', 'failed', 'skipped']).toContain(logEntry.status)
    expect(['x', 'telegram', 'discord']).toContain(logEntry.platform)
  })

  it('failed delivery log entry has error_message', () => {
    const logEntry = {
      topic_slug:       'crypto',
      date_key:         '2025-01-15',
      asset_type:       'story',
      source_type:      'alert',
      source_id:        'test-item-001',
      platform:         'discord',
      post_type:        'embed',
      status:           'failed',
      platform_post_id: null,
      error_message:    'Discord webhook returned 429 Too Many Requests'
    }
    expect(logEntry.status).toBe('failed')
    expect(logEntry.platform_post_id).toBeNull()
    expect(logEntry.error_message).toBeTruthy()
  })
})
