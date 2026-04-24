/**
 * End-to-end daily cycle verification — Finance and Crypto
 *
 * Validates the full product cycle for the two launch topics by tracing
 * every stage of the pipeline through fixtures, content files, schemas,
 * and page rendering.
 *
 * Verified stages per topic:
 *   1. Source ingestion — normalized items exist and conform to contract
 *   2. Alert classification — classified alerts exist with valid scores
 *   3. D1 persistence — delivery payloads have valid alert_id and item_id
 *   4. Telegram/Discord delivery — delivery payloads have valid channel routing
 *   5. Daily summary generation — summary JSON matches AI output schema
 *   6. Video script generation — video script fixtures exist and are valid
 *   7. YouTube metadata — metadata fixtures are upload-ready
 *   8. YouTube upload — publish log fixtures track success/failure correctly
 *   9. GitHub content publish — content files exist (summary.json, article.md, metadata.json)
 *  10. D1 state update — page state fixtures reflect correct published state
 *  11. Social publishing — social content assets are correctly shaped
 *  12. Final topic/day page — TopicDayPage renders correctly for published state
 *
 * Gap tracking:
 *   - Finance video.json does not exist (YouTube upload failed — expected for v1)
 *   - Finance has no social story fixture (only daily_post — acceptable for v1)
 *   - Delivery retry verification is contract-only (no live n8n test)
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import TopicDayPage from '@/pages/TopicDayPage.vue'
import { validateDailySummary } from '@/utils/validateAiOutput.js'

// ---- Fixture imports ----
import {
  CRYPTO_PUBLISHED_STATUS,
  FINANCE_PUBLISHED_STATUS,
  CRYPTO_CLASSIFIED_ALERTS,
  FINANCE_CLASSIFIED_ALERTS,
  CRYPTO_DAILY_SUMMARY,
  FINANCE_DAILY_SUMMARY,
  CRYPTO_VIDEO_SCRIPT,
  FINANCE_VIDEO_SCRIPT,
  CRYPTO_YOUTUBE_METADATA,
  FINANCE_YOUTUBE_METADATA,
  CRYPTO_NORMALIZED_ITEM_BTC_ETF,
  FINANCE_NORMALIZED_ITEM_FED_MINUTES,
  CRYPTO_DELIVERY_PAYLOAD,
  FINANCE_DELIVERY_PAYLOAD,
  CRYPTO_SOCIAL_DAILY_POST,
  FINANCE_SOCIAL_DAILY_POST
} from './helpers/fixtures.js'

import YOUTUBE_PUBLISH_SUCCESS from '@fixtures/youtube-publish/crypto-2025-01-15-success.json'
import YOUTUBE_PUBLISH_FAILED from '@fixtures/youtube-publish/finance-2025-01-15-failed.json'

// ---- Content files loaded from repo ----
const REPO_ROOT = join(process.cwd(), '..')

function readContentFile(relPath) {
  return readFileSync(join(REPO_ROOT, 'content', relPath), 'utf8')
}

function contentFileExists(relPath) {
  return existsSync(join(REPO_ROOT, 'content', relPath))
}

const CRYPTO_CONTENT_SUMMARY = JSON.parse(readContentFile('topics/crypto/2025-01-15/summary.json'))
const CRYPTO_CONTENT_METADATA = JSON.parse(readContentFile('topics/crypto/2025-01-15/metadata.json'))
const CRYPTO_CONTENT_ARTICLE = readContentFile('topics/crypto/2025-01-15/article.md')
const CRYPTO_CONTENT_VIDEO = JSON.parse(readContentFile('topics/crypto/2025-01-15/video.json'))

const FINANCE_CONTENT_SUMMARY = JSON.parse(readContentFile('topics/finance/2025-01-15/summary.json'))
const FINANCE_CONTENT_METADATA = JSON.parse(readContentFile('topics/finance/2025-01-15/metadata.json'))
const FINANCE_CONTENT_ARTICLE = readContentFile('topics/finance/2025-01-15/article.md')

// ---- Shared constants ----
const VALID_TOPICS = ['crypto', 'finance', 'economy', 'health', 'ai', 'energy', 'technology']
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/
const VALID_CHANNELS = ['telegram', 'discord']
const VALID_PAGE_STATES = ['pending', 'ready', 'published', 'error']
const VALID_ASSET_TYPES = ['daily_post', 'story']
const VALID_SOURCE_TYPES = ['daily_summary', 'alert']

// ---- Router helper for page rendering tests ----
async function createTestRouter(topicSlug = 'crypto', dateKey = '2025-01-15') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/topics/:topicSlug/:dateKey', component: TopicDayPage },
      { path: '/topics/:topicSlug', component: { template: '<div />' } }
    ]
  })
  await router.push(`/topics/${topicSlug}/${dateKey}`)
  await router.isReady()
  return router
}

// ---- Mock fetch builder ----
function buildFetch(dayStatus, options = {}) {
  const {
    summaryJson = null,
    articleMd = null,
    videoJson = null,
    navResponse = { prev_date_key: null, next_date_key: null },
    timelineResponse = { alerts: [], total: 0, has_more: false }
  } = options

  function jsonRes(data) {
    return Promise.resolve(new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }))
  }
  function textRes(text) {
    return Promise.resolve(new Response(text, { status: 200 }))
  }
  function notFound() {
    return Promise.resolve(new Response('', { status: 404 }))
  }

  return vi.fn((url) => {
    const urlStr = typeof url === 'string' ? url : url.toString()

    if (urlStr.includes('/api/day-status/')) return jsonRes(dayStatus)
    if (urlStr.includes('/api/navigation/')) return jsonRes(navResponse)
    if (urlStr.includes('/api/timeline/')) return jsonRes(timelineResponse)

    if (urlStr.endsWith('/article.md')) {
      return articleMd ? textRes(articleMd) : notFound()
    }
    if (urlStr.endsWith('/video.json')) {
      return videoJson ? jsonRes(videoJson) : notFound()
    }
    if (urlStr.endsWith('/summary.json')) {
      return summaryJson ? jsonRes(summaryJson) : notFound()
    }

    return notFound()
  })
}

// ===========================================================================
// CRYPTO — Full end-to-end daily cycle verification
// ===========================================================================

describe('Crypto — end-to-end daily cycle', () => {

  afterEach(() => { vi.restoreAllMocks() })

  // ---- Stage 1: Source ingestion ----
  describe('stage 1 — source ingestion', () => {
    it('normalized item exists for crypto/BTC ETF', () => {
      expect(CRYPTO_NORMALIZED_ITEM_BTC_ETF).toBeDefined()
      expect(CRYPTO_NORMALIZED_ITEM_BTC_ETF.topic_candidates).toContain('crypto')
    })

    it('normalized item has a deterministic item_id', () => {
      expect(typeof CRYPTO_NORMALIZED_ITEM_BTC_ETF.item_id).toBe('string')
      expect(CRYPTO_NORMALIZED_ITEM_BTC_ETF.item_id.length).toBeGreaterThanOrEqual(32)
    })

    it('normalized item has required fields', () => {
      const required = ['item_id', 'source_name', 'source_type', 'headline', 'topic_candidates']
      for (const field of required) {
        expect(CRYPTO_NORMALIZED_ITEM_BTC_ETF).toHaveProperty(field)
      }
    })
  })

  // ---- Stage 2: Alert classification ----
  describe('stage 2 — alert classification', () => {
    it('classified alerts exist for crypto 2025-01-15', () => {
      expect(Array.isArray(CRYPTO_CLASSIFIED_ALERTS)).toBe(true)
      expect(CRYPTO_CLASSIFIED_ALERTS.length).toBeGreaterThan(0)
    })

    it('each classified alert has valid topic_slug', () => {
      for (const alert of CRYPTO_CLASSIFIED_ALERTS) {
        expect(VALID_TOPICS).toContain(alert.topic_slug)
      }
    })

    it('each classified alert has valid scores between 0-100', () => {
      for (const alert of CRYPTO_CLASSIFIED_ALERTS) {
        expect(alert.severity_score).toBeGreaterThanOrEqual(0)
        expect(alert.severity_score).toBeLessThanOrEqual(100)
        expect(alert.importance_score).toBeGreaterThanOrEqual(0)
        expect(alert.importance_score).toBeLessThanOrEqual(100)
        expect(alert.confidence_score).toBeGreaterThanOrEqual(0)
        expect(alert.confidence_score).toBeLessThanOrEqual(100)
      }
    })

    it('each classified alert has send_alert decision', () => {
      for (const alert of CRYPTO_CLASSIFIED_ALERTS) {
        expect(typeof alert.send_alert).toBe('boolean')
      }
    })
  })

  // ---- Stage 3: D1 persistence ----
  describe('stage 3 — D1 persistence', () => {
    it('delivery payload items have alert_id assigned', () => {
      for (const item of CRYPTO_DELIVERY_PAYLOAD.items) {
        expect(typeof item.alert_id).toBe('number')
        expect(item.alert_id).toBeGreaterThan(0)
      }
    })

    it('delivery payload items have deterministic item_id', () => {
      for (const item of CRYPTO_DELIVERY_PAYLOAD.items) {
        expect(typeof item.item_id).toBe('string')
        expect(item.item_id.length).toBeGreaterThanOrEqual(32)
      }
    })

    it('delivery payload items have valid date_key', () => {
      for (const item of CRYPTO_DELIVERY_PAYLOAD.items) {
        expect(item.date_key).toMatch(DATE_KEY_RE)
      }
    })
  })

  // ---- Stage 4: Telegram/Discord delivery ----
  describe('stage 4 — Telegram/Discord delivery', () => {
    it('delivery payload has items array', () => {
      expect(Array.isArray(CRYPTO_DELIVERY_PAYLOAD.items)).toBe(true)
      expect(CRYPTO_DELIVERY_PAYLOAD.items.length).toBeGreaterThan(0)
    })

    it('each item has valid channels array', () => {
      for (const item of CRYPTO_DELIVERY_PAYLOAD.items) {
        expect(Array.isArray(item.channels)).toBe(true)
        expect(item.channels.length).toBeGreaterThan(0)
        for (const ch of item.channels) {
          expect(VALID_CHANNELS).toContain(ch)
        }
      }
    })

    it('crypto delivery includes both telegram and discord channels', () => {
      const allChannels = new Set()
      for (const item of CRYPTO_DELIVERY_PAYLOAD.items) {
        for (const ch of item.channels) allChannels.add(ch)
      }
      expect(allChannels.has('telegram')).toBe(true)
      expect(allChannels.has('discord')).toBe(true)
    })
  })

  // ---- Stage 5: Daily summary generation ----
  describe('stage 5 — daily summary generation', () => {
    it('daily summary fixture has required fields', () => {
      const required = ['headline', 'overview', 'key_events', 'sentiment', 'topic_score', 'sources']
      for (const field of required) {
        expect(CRYPTO_DAILY_SUMMARY).toHaveProperty(field)
      }
    })

    it('content summary.json matches fixture headline', () => {
      expect(CRYPTO_CONTENT_SUMMARY.headline).toBe(CRYPTO_DAILY_SUMMARY.headline)
    })

    it('content summary.json passes AI output validation', () => {
      const result = validateDailySummary(CRYPTO_CONTENT_SUMMARY)
      expect(result.ok).toBe(true)
    })

    it('summary has at least one key event', () => {
      expect(CRYPTO_CONTENT_SUMMARY.key_events.length).toBeGreaterThan(0)
    })

    it('each key event has title, significance, and importance_score', () => {
      for (const event of CRYPTO_CONTENT_SUMMARY.key_events) {
        expect(event).toHaveProperty('title')
        expect(event).toHaveProperty('significance')
        expect(event).toHaveProperty('importance_score')
      }
    })
  })

  // ---- Stage 6: Video script generation ----
  describe('stage 6 — video script generation', () => {
    it('video script fixture exists', () => {
      expect(CRYPTO_VIDEO_SCRIPT).toBeDefined()
    })

    it('video script has intro and segments', () => {
      expect(CRYPTO_VIDEO_SCRIPT).toHaveProperty('intro')
      expect(CRYPTO_VIDEO_SCRIPT).toHaveProperty('segments')
      expect(Array.isArray(CRYPTO_VIDEO_SCRIPT.segments)).toBe(true)
    })

    it('each segment has title, script, and duration', () => {
      for (const seg of CRYPTO_VIDEO_SCRIPT.segments) {
        expect(seg).toHaveProperty('title')
        expect(seg).toHaveProperty('script')
        expect(seg).toHaveProperty('duration_seconds')
        expect(typeof seg.duration_seconds).toBe('number')
      }
    })
  })

  // ---- Stage 7: YouTube metadata ----
  describe('stage 7 — YouTube metadata', () => {
    it('YouTube metadata fixture exists', () => {
      expect(CRYPTO_YOUTUBE_METADATA).toBeDefined()
    })

    it('YouTube metadata has title, description, tags', () => {
      expect(CRYPTO_YOUTUBE_METADATA).toHaveProperty('title')
      expect(CRYPTO_YOUTUBE_METADATA).toHaveProperty('description')
      expect(CRYPTO_YOUTUBE_METADATA).toHaveProperty('tags')
      expect(Array.isArray(CRYPTO_YOUTUBE_METADATA.tags)).toBe(true)
    })

    it('YouTube metadata has valid visibility', () => {
      expect(['public', 'unlisted', 'private']).toContain(CRYPTO_YOUTUBE_METADATA.visibility)
    })
  })

  // ---- Stage 8: YouTube upload ----
  describe('stage 8 — YouTube upload', () => {
    it('YouTube publish log shows published status', () => {
      expect(YOUTUBE_PUBLISH_SUCCESS.status).toBe('published')
    })

    it('YouTube publish log has video_id', () => {
      expect(typeof YOUTUBE_PUBLISH_SUCCESS.youtube_video_id).toBe('string')
      expect(YOUTUBE_PUBLISH_SUCCESS.youtube_video_id.length).toBeGreaterThan(0)
    })

    it('YouTube publish log matches crypto topic', () => {
      expect(YOUTUBE_PUBLISH_SUCCESS.topic_slug).toBe('crypto')
      expect(YOUTUBE_PUBLISH_SUCCESS.date_key).toBe('2025-01-15')
    })
  })

  // ---- Stage 9: GitHub content publish ----
  describe('stage 9 — GitHub content publish', () => {
    it('summary.json exists', () => {
      expect(contentFileExists('topics/crypto/2025-01-15/summary.json')).toBe(true)
    })

    it('article.md exists', () => {
      expect(contentFileExists('topics/crypto/2025-01-15/article.md')).toBe(true)
    })

    it('metadata.json exists', () => {
      expect(contentFileExists('topics/crypto/2025-01-15/metadata.json')).toBe(true)
    })

    it('video.json exists', () => {
      expect(contentFileExists('topics/crypto/2025-01-15/video.json')).toBe(true)
    })

    it('metadata indicates published state', () => {
      expect(CRYPTO_CONTENT_METADATA.page_state).toBe('published')
    })

    it('metadata has correct topic and date', () => {
      expect(CRYPTO_CONTENT_METADATA.topic_slug).toBe('crypto')
      expect(CRYPTO_CONTENT_METADATA.date_key).toBe('2025-01-15')
    })

    it('video.json has video_id matching YouTube publish', () => {
      expect(CRYPTO_CONTENT_VIDEO.video_id).toBe(YOUTUBE_PUBLISH_SUCCESS.youtube_video_id)
    })

    it('article has substantive content', () => {
      expect(CRYPTO_CONTENT_ARTICLE.length).toBeGreaterThan(200)
      expect(CRYPTO_CONTENT_ARTICLE).toContain('Bitcoin')
    })
  })

  // ---- Stage 10: D1 state update ----
  describe('stage 10 — D1 state update', () => {
    it('page state fixture shows published', () => {
      expect(CRYPTO_PUBLISHED_STATUS.page_state).toBe('published')
    })

    it('page state has correct content availability flags', () => {
      expect(CRYPTO_PUBLISHED_STATUS.summary_available).toBe(1)
      expect(CRYPTO_PUBLISHED_STATUS.article_available).toBe(1)
      expect(CRYPTO_PUBLISHED_STATUS.video_available).toBe(1)
    })

    it('page state has published_at timestamp', () => {
      expect(typeof CRYPTO_PUBLISHED_STATUS.published_at).toBe('string')
      expect(CRYPTO_PUBLISHED_STATUS.published_at.length).toBeGreaterThan(0)
    })

    it('alert count matches classified alerts count', () => {
      expect(CRYPTO_PUBLISHED_STATUS.alert_count).toBe(CRYPTO_CLASSIFIED_ALERTS.length)
    })
  })

  // ---- Stage 11: Social publishing ----
  describe('stage 11 — social publishing', () => {
    it('social daily post fixture exists', () => {
      expect(CRYPTO_SOCIAL_DAILY_POST).toBeDefined()
    })

    it('social daily post has correct asset_type', () => {
      expect(CRYPTO_SOCIAL_DAILY_POST.asset_type).toBe('daily_post')
      expect(VALID_ASSET_TYPES).toContain(CRYPTO_SOCIAL_DAILY_POST.asset_type)
    })

    it('social daily post has all platform sections', () => {
      expect(CRYPTO_SOCIAL_DAILY_POST).toHaveProperty('x')
      expect(CRYPTO_SOCIAL_DAILY_POST).toHaveProperty('telegram')
      expect(CRYPTO_SOCIAL_DAILY_POST).toHaveProperty('discord')
    })

    it('X post is within 280 character limit', () => {
      expect(CRYPTO_SOCIAL_DAILY_POST.x.post_text.length).toBeLessThanOrEqual(280)
    })

    it('Telegram message is within 4096 character limit', () => {
      expect(CRYPTO_SOCIAL_DAILY_POST.telegram.message_html.length).toBeLessThanOrEqual(4096)
    })

    it('Discord embed has title and description', () => {
      expect(CRYPTO_SOCIAL_DAILY_POST.discord.embed).toHaveProperty('title')
      expect(CRYPTO_SOCIAL_DAILY_POST.discord.embed).toHaveProperty('description')
    })
  })

  // ---- Stage 12: Final topic/day page rendering ----
  describe('stage 12 — final topic/day page rendering', () => {
    it('renders published state with summary content', async () => {
      vi.stubGlobal('fetch', buildFetch(CRYPTO_PUBLISHED_STATUS, {
        summaryJson: CRYPTO_CONTENT_SUMMARY,
        articleMd: CRYPTO_CONTENT_ARTICLE,
        videoJson: CRYPTO_CONTENT_VIDEO
      }))
      const router = await createTestRouter('crypto', '2025-01-15')
      const wrapper = mount(TopicDayPage, { global: { plugins: [router] } })
      await flushPromises()

      // Should show summary content, not placeholder
      expect(wrapper.find('.summary-placeholder').exists()).toBe(false)
      expect(wrapper.find('.summary-section').exists()).toBe(true)
    })

    it('renders article content from the published day', async () => {
      vi.stubGlobal('fetch', buildFetch(CRYPTO_PUBLISHED_STATUS, {
        summaryJson: CRYPTO_CONTENT_SUMMARY,
        articleMd: CRYPTO_CONTENT_ARTICLE,
        videoJson: CRYPTO_CONTENT_VIDEO
      }))
      const router = await createTestRouter('crypto', '2025-01-15')
      const wrapper = mount(TopicDayPage, { global: { plugins: [router] } })
      await flushPromises()

      // The article contains "Bitcoin ETF" content
      expect(wrapper.text()).toContain('Bitcoin')
    })
  })
})

// ===========================================================================
// FINANCE — Full end-to-end daily cycle verification
// ===========================================================================

describe('Finance — end-to-end daily cycle', () => {

  afterEach(() => { vi.restoreAllMocks() })

  // ---- Stage 1: Source ingestion ----
  describe('stage 1 — source ingestion', () => {
    it('normalized item exists for finance/Fed minutes', () => {
      expect(FINANCE_NORMALIZED_ITEM_FED_MINUTES).toBeDefined()
      expect(FINANCE_NORMALIZED_ITEM_FED_MINUTES.topic_candidates).toContain('finance')
    })

    it('normalized item has a deterministic item_id', () => {
      expect(typeof FINANCE_NORMALIZED_ITEM_FED_MINUTES.item_id).toBe('string')
      expect(FINANCE_NORMALIZED_ITEM_FED_MINUTES.item_id.length).toBeGreaterThanOrEqual(32)
    })

    it('normalized item has required fields', () => {
      const required = ['item_id', 'source_name', 'source_type', 'headline', 'topic_candidates']
      for (const field of required) {
        expect(FINANCE_NORMALIZED_ITEM_FED_MINUTES).toHaveProperty(field)
      }
    })
  })

  // ---- Stage 2: Alert classification ----
  describe('stage 2 — alert classification', () => {
    it('classified alerts exist for finance 2025-01-15', () => {
      expect(Array.isArray(FINANCE_CLASSIFIED_ALERTS)).toBe(true)
      expect(FINANCE_CLASSIFIED_ALERTS.length).toBeGreaterThan(0)
    })

    it('each classified alert has valid topic_slug', () => {
      for (const alert of FINANCE_CLASSIFIED_ALERTS) {
        expect(VALID_TOPICS).toContain(alert.topic_slug)
      }
    })

    it('each classified alert has valid scores between 0-100', () => {
      for (const alert of FINANCE_CLASSIFIED_ALERTS) {
        expect(alert.severity_score).toBeGreaterThanOrEqual(0)
        expect(alert.severity_score).toBeLessThanOrEqual(100)
        expect(alert.importance_score).toBeGreaterThanOrEqual(0)
        expect(alert.importance_score).toBeLessThanOrEqual(100)
        expect(alert.confidence_score).toBeGreaterThanOrEqual(0)
        expect(alert.confidence_score).toBeLessThanOrEqual(100)
      }
    })

    it('each classified alert has send_alert decision', () => {
      for (const alert of FINANCE_CLASSIFIED_ALERTS) {
        expect(typeof alert.send_alert).toBe('boolean')
      }
    })
  })

  // ---- Stage 3: D1 persistence ----
  describe('stage 3 — D1 persistence', () => {
    it('delivery payload items have alert_id assigned', () => {
      for (const item of FINANCE_DELIVERY_PAYLOAD.items) {
        expect(typeof item.alert_id).toBe('number')
        expect(item.alert_id).toBeGreaterThan(0)
      }
    })

    it('delivery payload items have deterministic item_id', () => {
      for (const item of FINANCE_DELIVERY_PAYLOAD.items) {
        expect(typeof item.item_id).toBe('string')
        expect(item.item_id.length).toBeGreaterThanOrEqual(32)
      }
    })

    it('delivery payload items have valid date_key', () => {
      for (const item of FINANCE_DELIVERY_PAYLOAD.items) {
        expect(item.date_key).toMatch(DATE_KEY_RE)
      }
    })
  })

  // ---- Stage 4: Telegram/Discord delivery ----
  describe('stage 4 — Telegram/Discord delivery', () => {
    it('delivery payload has items array', () => {
      expect(Array.isArray(FINANCE_DELIVERY_PAYLOAD.items)).toBe(true)
      expect(FINANCE_DELIVERY_PAYLOAD.items.length).toBeGreaterThan(0)
    })

    it('each item has valid channels array', () => {
      for (const item of FINANCE_DELIVERY_PAYLOAD.items) {
        expect(Array.isArray(item.channels)).toBe(true)
        expect(item.channels.length).toBeGreaterThan(0)
        for (const ch of item.channels) {
          expect(VALID_CHANNELS).toContain(ch)
        }
      }
    })

    it('finance delivery includes telegram channel', () => {
      const allChannels = new Set()
      for (const item of FINANCE_DELIVERY_PAYLOAD.items) {
        for (const ch of item.channels) allChannels.add(ch)
      }
      expect(allChannels.has('telegram')).toBe(true)
    })
  })

  // ---- Stage 5: Daily summary generation ----
  describe('stage 5 — daily summary generation', () => {
    it('daily summary fixture has required fields', () => {
      const required = ['headline', 'overview', 'key_events', 'sentiment', 'topic_score', 'sources']
      for (const field of required) {
        expect(FINANCE_DAILY_SUMMARY).toHaveProperty(field)
      }
    })

    it('content summary.json matches fixture headline', () => {
      expect(FINANCE_CONTENT_SUMMARY.headline).toBe(FINANCE_DAILY_SUMMARY.headline)
    })

    it('content summary.json passes AI output validation', () => {
      const result = validateDailySummary(FINANCE_CONTENT_SUMMARY)
      expect(result.ok).toBe(true)
    })

    it('summary has at least one key event', () => {
      expect(FINANCE_CONTENT_SUMMARY.key_events.length).toBeGreaterThan(0)
    })

    it('each key event has title, significance, and importance_score', () => {
      for (const event of FINANCE_CONTENT_SUMMARY.key_events) {
        expect(event).toHaveProperty('title')
        expect(event).toHaveProperty('significance')
        expect(event).toHaveProperty('importance_score')
      }
    })
  })

  // ---- Stage 6: Video script generation ----
  describe('stage 6 — video script generation', () => {
    it('video script fixture exists', () => {
      expect(FINANCE_VIDEO_SCRIPT).toBeDefined()
    })

    it('video script has intro and segments', () => {
      expect(FINANCE_VIDEO_SCRIPT).toHaveProperty('intro')
      expect(FINANCE_VIDEO_SCRIPT).toHaveProperty('segments')
      expect(Array.isArray(FINANCE_VIDEO_SCRIPT.segments)).toBe(true)
    })

    it('each segment has title, script, and duration', () => {
      for (const seg of FINANCE_VIDEO_SCRIPT.segments) {
        expect(seg).toHaveProperty('title')
        expect(seg).toHaveProperty('script')
        expect(seg).toHaveProperty('duration_seconds')
        expect(typeof seg.duration_seconds).toBe('number')
      }
    })
  })

  // ---- Stage 7: YouTube metadata ----
  describe('stage 7 — YouTube metadata', () => {
    it('YouTube metadata fixture exists', () => {
      expect(FINANCE_YOUTUBE_METADATA).toBeDefined()
    })

    it('YouTube metadata has title, description, tags', () => {
      expect(FINANCE_YOUTUBE_METADATA).toHaveProperty('title')
      expect(FINANCE_YOUTUBE_METADATA).toHaveProperty('description')
      expect(FINANCE_YOUTUBE_METADATA).toHaveProperty('tags')
      expect(Array.isArray(FINANCE_YOUTUBE_METADATA.tags)).toBe(true)
    })

    it('YouTube metadata has valid visibility', () => {
      expect(['public', 'unlisted', 'private']).toContain(FINANCE_YOUTUBE_METADATA.visibility)
    })
  })

  // ---- Stage 8: YouTube upload ----
  describe('stage 8 — YouTube upload (expected failure)', () => {
    it('YouTube publish log shows failed status', () => {
      expect(YOUTUBE_PUBLISH_FAILED.status).toBe('failed')
    })

    it('YouTube publish log has error message', () => {
      expect(typeof YOUTUBE_PUBLISH_FAILED.error_message).toBe('string')
      expect(YOUTUBE_PUBLISH_FAILED.error_message.length).toBeGreaterThan(0)
    })

    it('YouTube publish log matches finance topic', () => {
      expect(YOUTUBE_PUBLISH_FAILED.topic_slug).toBe('finance')
      expect(YOUTUBE_PUBLISH_FAILED.date_key).toBe('2025-01-15')
    })

    it('video.json does not exist for finance (upload failed)', () => {
      expect(contentFileExists('topics/finance/2025-01-15/video.json')).toBe(false)
    })
  })

  // ---- Stage 9: GitHub content publish ----
  describe('stage 9 — GitHub content publish', () => {
    it('summary.json exists', () => {
      expect(contentFileExists('topics/finance/2025-01-15/summary.json')).toBe(true)
    })

    it('article.md exists', () => {
      expect(contentFileExists('topics/finance/2025-01-15/article.md')).toBe(true)
    })

    it('metadata.json exists', () => {
      expect(contentFileExists('topics/finance/2025-01-15/metadata.json')).toBe(true)
    })

    it('metadata indicates published state', () => {
      expect(FINANCE_CONTENT_METADATA.page_state).toBe('published')
    })

    it('metadata has correct topic and date', () => {
      expect(FINANCE_CONTENT_METADATA.topic_slug).toBe('finance')
      expect(FINANCE_CONTENT_METADATA.date_key).toBe('2025-01-15')
    })

    it('metadata correctly reflects no video', () => {
      expect(FINANCE_CONTENT_METADATA.video_path).toBeNull()
    })

    it('article has substantive content', () => {
      expect(FINANCE_CONTENT_ARTICLE.length).toBeGreaterThan(200)
      expect(FINANCE_CONTENT_ARTICLE).toContain('Fed')
    })
  })

  // ---- Stage 10: D1 state update ----
  describe('stage 10 — D1 state update', () => {
    it('page state fixture shows published', () => {
      expect(FINANCE_PUBLISHED_STATUS.page_state).toBe('published')
    })

    it('page state has correct content availability flags', () => {
      expect(FINANCE_PUBLISHED_STATUS.summary_available).toBe(1)
      expect(FINANCE_PUBLISHED_STATUS.article_available).toBe(1)
      expect(FINANCE_PUBLISHED_STATUS.video_available).toBe(0)
    })

    it('page state has published_at timestamp', () => {
      expect(typeof FINANCE_PUBLISHED_STATUS.published_at).toBe('string')
      expect(FINANCE_PUBLISHED_STATUS.published_at.length).toBeGreaterThan(0)
    })

    it('alert count matches classified alerts count', () => {
      expect(FINANCE_PUBLISHED_STATUS.alert_count).toBe(FINANCE_CLASSIFIED_ALERTS.length)
    })
  })

  // ---- Stage 11: Social publishing ----
  describe('stage 11 — social publishing', () => {
    it('social daily post fixture exists', () => {
      expect(FINANCE_SOCIAL_DAILY_POST).toBeDefined()
    })

    it('social daily post has correct asset_type', () => {
      expect(FINANCE_SOCIAL_DAILY_POST.asset_type).toBe('daily_post')
      expect(VALID_ASSET_TYPES).toContain(FINANCE_SOCIAL_DAILY_POST.asset_type)
    })

    it('social daily post has all platform sections', () => {
      expect(FINANCE_SOCIAL_DAILY_POST).toHaveProperty('x')
      expect(FINANCE_SOCIAL_DAILY_POST).toHaveProperty('telegram')
      expect(FINANCE_SOCIAL_DAILY_POST).toHaveProperty('discord')
    })

    it('X post is within 280 character limit', () => {
      expect(FINANCE_SOCIAL_DAILY_POST.x.post_text.length).toBeLessThanOrEqual(280)
    })

    it('Telegram message is within 4096 character limit', () => {
      expect(FINANCE_SOCIAL_DAILY_POST.telegram.message_html.length).toBeLessThanOrEqual(4096)
    })

    it('Discord embed has title and description', () => {
      expect(FINANCE_SOCIAL_DAILY_POST.discord.embed).toHaveProperty('title')
      expect(FINANCE_SOCIAL_DAILY_POST.discord.embed).toHaveProperty('description')
    })
  })

  // ---- Stage 12: Final topic/day page rendering ----
  describe('stage 12 — final topic/day page rendering', () => {
    it('renders published state with summary content (no video)', async () => {
      vi.stubGlobal('fetch', buildFetch(FINANCE_PUBLISHED_STATUS, {
        summaryJson: FINANCE_CONTENT_SUMMARY,
        articleMd: FINANCE_CONTENT_ARTICLE
      }))
      const router = await createTestRouter('finance', '2025-01-15')
      const wrapper = mount(TopicDayPage, { global: { plugins: [router] } })
      await flushPromises()

      // Should show summary content, not placeholder
      expect(wrapper.find('.summary-placeholder').exists()).toBe(false)
      expect(wrapper.find('.summary-section').exists()).toBe(true)
    })

    it('renders article content from the published day', async () => {
      vi.stubGlobal('fetch', buildFetch(FINANCE_PUBLISHED_STATUS, {
        summaryJson: FINANCE_CONTENT_SUMMARY,
        articleMd: FINANCE_CONTENT_ARTICLE
      }))
      const router = await createTestRouter('finance', '2025-01-15')
      const wrapper = mount(TopicDayPage, { global: { plugins: [router] } })
      await flushPromises()

      // The article contains "Fed" content
      expect(wrapper.text()).toContain('Fed')
    })
  })
})

// ===========================================================================
// Cross-topic consistency checks
// ===========================================================================

describe('Cross-topic consistency', () => {

  it('both topics use the same date_key for the verification run', () => {
    expect(CRYPTO_PUBLISHED_STATUS.date_key).toBe('2025-01-15')
    expect(FINANCE_PUBLISHED_STATUS.date_key).toBe('2025-01-15')
  })

  it('both topics have content summary.json with matching topic_slug', () => {
    expect(CRYPTO_CONTENT_SUMMARY.topic_slug).toBe('crypto')
    expect(FINANCE_CONTENT_SUMMARY.topic_slug).toBe('finance')
  })

  it('both topics have published page state in fixtures', () => {
    expect(CRYPTO_PUBLISHED_STATUS.page_state).toBe('published')
    expect(FINANCE_PUBLISHED_STATUS.page_state).toBe('published')
  })

  it('both topics have classified alerts', () => {
    expect(CRYPTO_CLASSIFIED_ALERTS.length).toBeGreaterThan(0)
    expect(FINANCE_CLASSIFIED_ALERTS.length).toBeGreaterThan(0)
  })

  it('both topics have delivery payloads', () => {
    expect(CRYPTO_DELIVERY_PAYLOAD.items.length).toBeGreaterThan(0)
    expect(FINANCE_DELIVERY_PAYLOAD.items.length).toBeGreaterThan(0)
  })

  it('both topics have social daily post assets', () => {
    expect(CRYPTO_SOCIAL_DAILY_POST.asset_type).toBe('daily_post')
    expect(FINANCE_SOCIAL_DAILY_POST.asset_type).toBe('daily_post')
  })

  it('both topics have video scripts', () => {
    expect(CRYPTO_VIDEO_SCRIPT.segments.length).toBeGreaterThan(0)
    expect(FINANCE_VIDEO_SCRIPT.segments.length).toBeGreaterThan(0)
  })

  it('both topics have YouTube metadata', () => {
    expect(CRYPTO_YOUTUBE_METADATA.title.length).toBeGreaterThan(0)
    expect(FINANCE_YOUTUBE_METADATA.title.length).toBeGreaterThan(0)
  })

  it('crypto has video available, finance does not (expected gap)', () => {
    expect(CRYPTO_PUBLISHED_STATUS.video_available).toBe(1)
    expect(FINANCE_PUBLISHED_STATUS.video_available).toBe(0)
  })
})
