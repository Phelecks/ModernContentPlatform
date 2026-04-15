/**
 * Fixture validation tests.
 *
 * Verifies that every fixture file loads correctly and contains the required
 * top-level fields for its type.  These tests act as a regression guard: if a
 * fixture is accidentally malformed or a required field is removed, this suite
 * catches it immediately.
 *
 * Tests do NOT re-validate the full JSON Schema — that would require a schema
 * validator library.  Instead they assert the presence and basic type of each
 * required field, which is sufficient to catch structural regressions.
 */
import { describe, it, expect } from 'vitest'
import {
  CRYPTO_PUBLISHED_STATUS,
  FINANCE_PUBLISHED_STATUS,
  AI_READY_STATUS,
  CRYPTO_PENDING_STATUS,
  CRYPTO_CLASSIFIED_ALERTS,
  CRYPTO_CLASSIFIED_ALERTS_X_SOURCE,
  FINANCE_CLASSIFIED_ALERTS,
  AI_CLASSIFIED_ALERTS,
  CRYPTO_DAILY_SUMMARY,
  FINANCE_DAILY_SUMMARY,
  CRYPTO_VIDEO_SCRIPT,
  FINANCE_VIDEO_SCRIPT,
  CRYPTO_SOURCE_EVENT_BTC_ETF,
  FINANCE_SOURCE_EVENT_FED_MINUTES,
  AI_SOURCE_EVENT_OPEN_WEIGHT_MODEL,
  CRYPTO_SOURCE_EVENT_X_WHALE_ALERT,
  ECONOMY_SOURCE_EVENT_BLS_CPI,
  CRYPTO_SOURCE_EVENT_X_QUERY_BTC,
  CRYPTO_SOURCE_EVENT_SOCIAL_TELEGRAM,
  CRYPTO_SOURCE_EVENT_WEBHOOK_LIQUIDATION,
  CRYPTO_NORMALIZED_ITEM_BTC_ETF,
  FINANCE_NORMALIZED_ITEM_FED_MINUTES,
  AI_NORMALIZED_ITEM_OPEN_WEIGHT_MODEL,
  CRYPTO_NORMALIZED_ITEM_X_WHALE_ALERT,
  ECONOMY_NORMALIZED_ITEM_BLS_CPI,
  CRYPTO_NORMALIZED_ITEM_X_QUERY_BTC,
  CRYPTO_NORMALIZED_ITEM_SOCIAL_TELEGRAM,
  CRYPTO_NORMALIZED_ITEM_WEBHOOK_LIQUIDATION
} from './helpers/fixtures.js'

// ---- Helpers ----

const PAGE_STATE_VALUES = ['pending', 'ready', 'published', 'error']
const TOPIC_SLUGS = ['crypto', 'finance', 'economy', 'health', 'ai', 'energy', 'technology']
const SOURCE_TYPES = ['rss', 'api', 'social', 'webhook', 'x_account', 'x_query']

function assertPageState(fixture, label) {
  expect(fixture, `${label}: must be an object`).toBeTypeOf('object')
  expect(fixture.topic_slug, `${label}: topic_slug`).toBeTypeOf('string')
  expect(TOPIC_SLUGS, `${label}: topic_slug must be a known slug`).toContain(fixture.topic_slug)
  expect(fixture.date_key, `${label}: date_key`).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  expect(PAGE_STATE_VALUES, `${label}: page_state must be a known value`).toContain(fixture.page_state)
  expect(fixture.display_name, `${label}: display_name`).toBeTypeOf('string')
  expect(fixture.alert_count, `${label}: alert_count`).toBeTypeOf('number')
  expect(fixture.cluster_count, `${label}: cluster_count`).toBeTypeOf('number')
  expect([0, 1], `${label}: summary_available`).toContain(fixture.summary_available)
  expect([0, 1], `${label}: video_available`).toContain(fixture.video_available)
  expect([0, 1], `${label}: article_available`).toContain(fixture.article_available)
}

function assertClassifiedAlert(alert, label) {
  expect(alert.item_id, `${label}: item_id`).toBeTypeOf('string')
  expect(alert.item_id.length, `${label}: item_id length`).toBeGreaterThanOrEqual(32)
  expect(TOPIC_SLUGS, `${label}: topic_slug must be a known slug`).toContain(alert.topic_slug)
  expect(alert.headline, `${label}: headline`).toBeTypeOf('string')
  expect(alert.headline.length, `${label}: headline non-empty`).toBeGreaterThan(0)
  expect(alert.summary_text, `${label}: summary_text`).toBeTypeOf('string')
  expect(alert.source_name, `${label}: source_name`).toBeTypeOf('string')
  expect(alert.cluster_label, `${label}: cluster_label`).toBeTypeOf('string')
  expect(alert.cluster_label.length, `${label}: cluster_label non-empty`).toBeGreaterThan(0)
  expect(alert.severity_score, `${label}: severity_score`).toBeTypeOf('number')
  expect(alert.severity_score, `${label}: severity_score 0–100`).toBeGreaterThanOrEqual(0)
  expect(alert.severity_score, `${label}: severity_score 0–100`).toBeLessThanOrEqual(100)
  expect(alert.importance_score, `${label}: importance_score`).toBeTypeOf('number')
  expect(alert.importance_score, `${label}: importance_score 0–100`).toBeGreaterThanOrEqual(0)
  expect(alert.importance_score, `${label}: importance_score 0–100`).toBeLessThanOrEqual(100)
  expect(alert.confidence_score, `${label}: confidence_score`).toBeTypeOf('number')
  expect(alert.confidence_score, `${label}: confidence_score 0–100`).toBeGreaterThanOrEqual(0)
  expect(alert.confidence_score, `${label}: confidence_score 0–100`).toBeLessThanOrEqual(100)
  expect(alert.send_alert, `${label}: send_alert`).toBeTypeOf('boolean')
  expect(alert.event_at, `${label}: event_at`).toMatch(/^\d{4}-\d{2}-\d{2}T/)
}

function assertDailySummary(summary, label) {
  expect(summary.headline, `${label}: headline`).toBeTypeOf('string')
  expect(summary.headline.length, `${label}: headline min length`).toBeGreaterThanOrEqual(10)
  expect(summary.overview, `${label}: overview`).toBeTypeOf('string')
  expect(summary.overview.length, `${label}: overview min length`).toBeGreaterThanOrEqual(100)
  expect(Array.isArray(summary.key_events), `${label}: key_events is array`).toBe(true)
  expect(summary.key_events.length, `${label}: at least one key event`).toBeGreaterThanOrEqual(1)
  expect(['bullish', 'bearish', 'neutral', 'mixed'], `${label}: sentiment`).toContain(summary.sentiment)
  expect(summary.topic_score, `${label}: topic_score`).toBeTypeOf('number')
  expect(summary.topic_score, `${label}: topic_score 0–100`).toBeGreaterThanOrEqual(0)
  expect(summary.topic_score, `${label}: topic_score 0–100`).toBeLessThanOrEqual(100)
  for (const event of summary.key_events) {
    expect(event.title, `${label}: key_event.title`).toBeTypeOf('string')
    expect(event.significance, `${label}: key_event.significance`).toBeTypeOf('string')
    expect(event.importance_score, `${label}: key_event.importance_score`).toBeTypeOf('number')
  }
  // Source attribution fields (optional but validated when present)
  if (summary.sources !== undefined && summary.sources !== null) {
    expect(Array.isArray(summary.sources), `${label}: sources is array`).toBe(true)
    for (const src of summary.sources) {
      expect(src.source_name, `${label}: source.source_name`).toBeTypeOf('string')
      expect(src.source_name.length, `${label}: source.source_name non-empty`).toBeGreaterThan(0)
    }
  }
  if (summary.source_confidence_note !== undefined && summary.source_confidence_note !== null) {
    expect(summary.source_confidence_note, `${label}: source_confidence_note`).toBeTypeOf('string')
  }
}

function assertSourceEvent(item, label) {
  expect(item.source_id, `${label}: source_id`).toBeTypeOf('string')
  expect(item.source_name, `${label}: source_name`).toBeTypeOf('string')
  expect(SOURCE_TYPES, `${label}: source_type must be a known type`).toContain(item.source_type)
  expect(item.title, `${label}: title`).toBeTypeOf('string')
  expect(item.fetched_at, `${label}: fetched_at`).toMatch(/^\d{4}-\d{2}-\d{2}T/)
}

function assertVideoScript(script, label) {
  expect(script.intro, `${label}: intro`).toBeTypeOf('string')
  expect(script.intro.length, `${label}: intro min length`).toBeGreaterThanOrEqual(30)
  expect(script.intro.length, `${label}: intro max length`).toBeLessThanOrEqual(500)
  expect(Array.isArray(script.segments), `${label}: segments is array`).toBe(true)
  expect(script.segments.length, `${label}: at least 2 segments`).toBeGreaterThanOrEqual(2)
  expect(script.segments.length, `${label}: at most 5 segments`).toBeLessThanOrEqual(5)
  for (const seg of script.segments) {
    expect(seg.title, `${label}: segment.title`).toBeTypeOf('string')
    expect(seg.script, `${label}: segment.script`).toBeTypeOf('string')
    expect(seg.duration_seconds, `${label}: segment.duration_seconds`).toBeTypeOf('number')
    expect(seg.duration_seconds, `${label}: duration_seconds 15–120`).toBeGreaterThanOrEqual(15)
    expect(seg.duration_seconds, `${label}: duration_seconds 15–120`).toBeLessThanOrEqual(120)
    if (seg.sources !== undefined && seg.sources !== null) {
      expect(Array.isArray(seg.sources), `${label}: segment.sources is array`).toBe(true)
      for (const src of seg.sources) {
        expect(src.source_name, `${label}: segment source.source_name`).toBeTypeOf('string')
        expect(src.source_name.length, `${label}: segment source.source_name non-empty`).toBeGreaterThan(0)
      }
    }
  }
  expect(script.outro, `${label}: outro`).toBeTypeOf('string')
  expect(script.outro.length, `${label}: outro min length`).toBeGreaterThanOrEqual(30)
  expect(script.outro.length, `${label}: outro max length`).toBeLessThanOrEqual(400)
  expect(script.total_duration_seconds, `${label}: total_duration_seconds`).toBeTypeOf('number')
  expect(script.total_duration_seconds, `${label}: total_duration_seconds 60–600`).toBeGreaterThanOrEqual(60)
  expect(script.total_duration_seconds, `${label}: total_duration_seconds 60–600`).toBeLessThanOrEqual(600)
}

function assertNormalizedItem(item, label) {
  expect(item.item_id, `${label}: item_id`).toBeTypeOf('string')
  expect(item.item_id.length, `${label}: item_id length`).toBeGreaterThanOrEqual(32)
  expect(item.source_id, `${label}: source_id`).toBeTypeOf('string')
  expect(item.source_name, `${label}: source_name`).toBeTypeOf('string')
  expect(SOURCE_TYPES, `${label}: source_type`).toContain(item.source_type)
  expect(item.headline, `${label}: headline`).toBeTypeOf('string')
  expect(item.published_at, `${label}: published_at`).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  expect(item.fetched_at, `${label}: fetched_at`).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  expect(Array.isArray(item.topic_candidates), `${label}: topic_candidates must be an array`).toBe(true)
  expect(item.is_duplicate, `${label}: is_duplicate`).toBeTypeOf('boolean')
}

// ---- Page-state fixture tests ----

describe('fixtures/page-states', () => {
  it('crypto-2025-01-15-published has required fields and published state', () => {
    assertPageState(CRYPTO_PUBLISHED_STATUS, 'crypto-published')
    expect(CRYPTO_PUBLISHED_STATUS.page_state).toBe('published')
    expect(CRYPTO_PUBLISHED_STATUS.topic_slug).toBe('crypto')
    expect(CRYPTO_PUBLISHED_STATUS.article_available).toBe(1)
    expect(CRYPTO_PUBLISHED_STATUS.video_available).toBe(1)
    expect(CRYPTO_PUBLISHED_STATUS.published_at).not.toBeNull()
  })

  it('finance-2025-01-15-published has required fields and published state without video', () => {
    assertPageState(FINANCE_PUBLISHED_STATUS, 'finance-published')
    expect(FINANCE_PUBLISHED_STATUS.page_state).toBe('published')
    expect(FINANCE_PUBLISHED_STATUS.topic_slug).toBe('finance')
    expect(FINANCE_PUBLISHED_STATUS.article_available).toBe(1)
    expect(FINANCE_PUBLISHED_STATUS.video_available).toBe(0)
  })

  it('ai-2025-01-15-ready has required fields and ready state', () => {
    assertPageState(AI_READY_STATUS, 'ai-ready')
    expect(AI_READY_STATUS.page_state).toBe('ready')
    expect(AI_READY_STATUS.topic_slug).toBe('ai')
    expect(AI_READY_STATUS.article_available).toBe(0)
    expect(AI_READY_STATUS.published_at).toBeNull()
  })

  it('crypto-2025-01-16-pending has required fields and pending state with zero counts', () => {
    assertPageState(CRYPTO_PENDING_STATUS, 'crypto-pending')
    expect(CRYPTO_PENDING_STATUS.page_state).toBe('pending')
    expect(CRYPTO_PENDING_STATUS.alert_count).toBe(0)
    expect(CRYPTO_PENDING_STATUS.summary_available).toBe(0)
    expect(CRYPTO_PENDING_STATUS.published_at).toBeNull()
  })
})

// ---- Classified alert fixture tests ----

describe('fixtures/classified-alerts', () => {
  it('crypto-2025-01-15 is a non-empty array of valid classified alerts', () => {
    expect(Array.isArray(CRYPTO_CLASSIFIED_ALERTS)).toBe(true)
    expect(CRYPTO_CLASSIFIED_ALERTS.length).toBeGreaterThan(0)
    for (const alert of CRYPTO_CLASSIFIED_ALERTS) {
      assertClassifiedAlert(alert, 'crypto-classified-alerts')
      expect(alert.topic_slug).toBe('crypto')
    }
  })

  it('finance-2025-01-15 is a non-empty array of valid classified alerts', () => {
    expect(Array.isArray(FINANCE_CLASSIFIED_ALERTS)).toBe(true)
    expect(FINANCE_CLASSIFIED_ALERTS.length).toBeGreaterThan(0)
    for (const alert of FINANCE_CLASSIFIED_ALERTS) {
      assertClassifiedAlert(alert, 'finance-classified-alerts')
      expect(alert.topic_slug).toBe('finance')
    }
  })

  it('ai-2025-01-15 is a non-empty array of valid classified alerts', () => {
    expect(Array.isArray(AI_CLASSIFIED_ALERTS)).toBe(true)
    expect(AI_CLASSIFIED_ALERTS.length).toBeGreaterThan(0)
    for (const alert of AI_CLASSIFIED_ALERTS) {
      assertClassifiedAlert(alert, 'ai-classified-alerts')
      expect(alert.topic_slug).toBe('ai')
    }
  })

  it('all classified-alert item_ids are unique within each set', () => {
    for (const [label, set] of [
      ['crypto', CRYPTO_CLASSIFIED_ALERTS],
      ['finance', FINANCE_CLASSIFIED_ALERTS],
      ['ai', AI_CLASSIFIED_ALERTS]
    ]) {
      const ids = set.map((a) => a.item_id)
      expect(new Set(ids).size, `${label}: item_ids must be unique`).toBe(ids.length)
    }
  })

  it('crypto-2025-01-15-x-source is a non-empty array of valid classified alerts from X sources', () => {
    expect(Array.isArray(CRYPTO_CLASSIFIED_ALERTS_X_SOURCE)).toBe(true)
    expect(CRYPTO_CLASSIFIED_ALERTS_X_SOURCE.length).toBeGreaterThan(0)
    for (const alert of CRYPTO_CLASSIFIED_ALERTS_X_SOURCE) {
      assertClassifiedAlert(alert, 'crypto-classified-alerts-x-source')
      expect(alert.topic_slug).toBe('crypto')
    }
  })

  it('crypto-2025-01-15-x-source alerts have source_confidence_note explaining trust impact', () => {
    for (const alert of CRYPTO_CLASSIFIED_ALERTS_X_SOURCE) {
      expect(alert.source_confidence_note, 'source_confidence_note must be a string').toBeTypeOf('string')
      expect(alert.source_confidence_note.length, 'source_confidence_note non-empty').toBeGreaterThan(0)
    }
  })

  it('crypto-2025-01-15-x-source T4 alerts have reduced confidence vs T2 confirmed alert', () => {
    const t4Alerts = CRYPTO_CLASSIFIED_ALERTS_X_SOURCE.filter(
      (a) => a.trust_tier === 'T4'
    )
    const t2Alert = CRYPTO_CLASSIFIED_ALERTS_X_SOURCE.find((a) => a.trust_tier === 'T2')
    expect(t4Alerts.length, 'should have T4 alerts').toBeGreaterThan(0)
    expect(t2Alert, 'should have a T2 confirmed alert').toBeDefined()
    for (const t4 of t4Alerts) {
      expect(t4.confidence_score, 'T4 confidence lower than T2 confirmed').toBeLessThan(
        t2Alert.confidence_score
      )
    }
  })

  it('crypto-2025-01-15-x-source T4 alerts have severity within crypto T4 cap (60)', () => {
    const t4Alerts = CRYPTO_CLASSIFIED_ALERTS_X_SOURCE.filter(
      (a) => a.trust_tier === 'T4'
    )
    for (const t4 of t4Alerts) {
      expect(t4.severity_score, 'T4 severity must be <= 60').toBeLessThanOrEqual(60)
    }
  })

  it('crypto-2025-01-15-x-source alerts carry explicit trust_tier and trust_score', () => {
    const VALID_TIERS = ['T1', 'T2', 'T3', 'T4']
    for (const alert of CRYPTO_CLASSIFIED_ALERTS_X_SOURCE) {
      expect(VALID_TIERS, `trust_tier "${alert.trust_tier}" must be valid`).toContain(alert.trust_tier)
      expect(alert.trust_score, 'trust_score must be a number').toBeTypeOf('number')
      expect(alert.trust_score, 'trust_score 0–100').toBeGreaterThanOrEqual(0)
      expect(alert.trust_score, 'trust_score 0–100').toBeLessThanOrEqual(100)
    }
  })
})

// ---- Daily summary fixture tests ----

describe('fixtures/daily-summaries', () => {
  it('crypto-2025-01-15 has required daily summary fields', () => {
    assertDailySummary(CRYPTO_DAILY_SUMMARY, 'crypto-daily-summary')
    expect(CRYPTO_DAILY_SUMMARY.sentiment).toBe('bullish')
  })

  it('crypto-2025-01-15 has article-level sources', () => {
    expect(Array.isArray(CRYPTO_DAILY_SUMMARY.sources)).toBe(true)
    expect(CRYPTO_DAILY_SUMMARY.sources.length).toBeGreaterThan(0)
    for (const src of CRYPTO_DAILY_SUMMARY.sources) {
      expect(src.source_name).toBeTypeOf('string')
    }
  })

  it('crypto-2025-01-15 key_events have section-level sources', () => {
    for (const event of CRYPTO_DAILY_SUMMARY.key_events) {
      expect(Array.isArray(event.sources)).toBe(true)
      expect(event.sources.length).toBeGreaterThan(0)
      for (const src of event.sources) {
        expect(src.source_name).toBeTypeOf('string')
      }
    }
  })

  it('finance-2025-01-15 has required daily summary fields', () => {
    assertDailySummary(FINANCE_DAILY_SUMMARY, 'finance-daily-summary')
    expect(FINANCE_DAILY_SUMMARY.sentiment).toBe('bearish')
  })

  it('finance-2025-01-15 has article-level sources', () => {
    expect(Array.isArray(FINANCE_DAILY_SUMMARY.sources)).toBe(true)
    expect(FINANCE_DAILY_SUMMARY.sources.length).toBeGreaterThan(0)
  })

  it('daily summaries have valid source_role values when present', () => {
    const validRoles = ['primary', 'confirmation', 'data', 'commentary', 'official', null]
    for (const summary of [CRYPTO_DAILY_SUMMARY, FINANCE_DAILY_SUMMARY]) {
      if (summary.sources) {
        for (const src of summary.sources) {
          if (src.source_role !== undefined) {
            expect(validRoles, `source_role "${src.source_role}" must be valid`).toContain(src.source_role)
          }
        }
      }
    }
  })
})

// ---- Video script fixture tests ----

describe('fixtures/video-scripts', () => {
  it('crypto-2025-01-15 has required video script fields', () => {
    assertVideoScript(CRYPTO_VIDEO_SCRIPT, 'crypto-video-script')
  })

  it('crypto-2025-01-15 segments have source grounding', () => {
    for (const seg of CRYPTO_VIDEO_SCRIPT.segments) {
      if (seg.sources !== undefined && seg.sources !== null) {
        expect(seg.sources.length, 'at least one source per grounded segment').toBeGreaterThan(0)
        for (const src of seg.sources) {
          expect(src.source_name).toBeTypeOf('string')
        }
      }
    }
  })

  it('finance-2025-01-15 has required video script fields', () => {
    assertVideoScript(FINANCE_VIDEO_SCRIPT, 'finance-video-script')
  })

  it('finance-2025-01-15 segments have source grounding', () => {
    for (const seg of FINANCE_VIDEO_SCRIPT.segments) {
      if (seg.sources !== undefined && seg.sources !== null) {
        expect(seg.sources.length, 'at least one source per grounded segment').toBeGreaterThan(0)
        for (const src of seg.sources) {
          expect(src.source_name).toBeTypeOf('string')
        }
      }
    }
  })

  it('video scripts have valid source_role values when present', () => {
    const validRoles = ['primary', 'data', 'commentary', null]
    for (const script of [CRYPTO_VIDEO_SCRIPT, FINANCE_VIDEO_SCRIPT]) {
      for (const seg of script.segments) {
        if (seg.sources) {
          for (const src of seg.sources) {
            if (src.source_role !== undefined) {
              expect(validRoles, `source_role "${src.source_role}" must be valid`).toContain(src.source_role)
            }
          }
        }
      }
    }
  })

  it('video scripts do not embed raw source URLs in spoken script text', () => {
    for (const script of [CRYPTO_VIDEO_SCRIPT, FINANCE_VIDEO_SCRIPT]) {
      const allText = [
        script.intro,
        ...script.segments.map(s => s.script),
        script.outro
      ].join(' ')
      expect(allText, 'spoken text must not contain raw http:// URLs').not.toMatch(/https?:\/\//)
    }
  })
})

// ---- Source event fixture tests ----

describe('fixtures/source-events', () => {
  it('crypto-2025-01-15-btc-etf-inflows has required source-event fields', () => {
    assertSourceEvent(CRYPTO_SOURCE_EVENT_BTC_ETF, 'crypto-source-event')
    expect(CRYPTO_SOURCE_EVENT_BTC_ETF.source_type).toBe('rss')
  })

  it('finance-2025-01-15-fed-minutes has required source-event fields', () => {
    assertSourceEvent(FINANCE_SOURCE_EVENT_FED_MINUTES, 'finance-source-event')
    expect(FINANCE_SOURCE_EVENT_FED_MINUTES.source_type).toBe('rss')
  })

  it('ai-2025-01-15-open-weight-model has required source-event fields', () => {
    assertSourceEvent(AI_SOURCE_EVENT_OPEN_WEIGHT_MODEL, 'ai-source-event')
    expect(AI_SOURCE_EVENT_OPEN_WEIGHT_MODEL.source_type).toBe('rss')
  })

  it('crypto-2025-01-15-x-whale-alert has required source-event fields for x_account type', () => {
    assertSourceEvent(CRYPTO_SOURCE_EVENT_X_WHALE_ALERT, 'crypto-x-source-event')
    expect(CRYPTO_SOURCE_EVENT_X_WHALE_ALERT.source_type).toBe('x_account')
    expect(CRYPTO_SOURCE_EVENT_X_WHALE_ALERT.source_url).toMatch(/x\.com/)
  })

  it('economy-2025-01-15-bls-cpi has required source-event fields for official T1 rss type', () => {
    assertSourceEvent(ECONOMY_SOURCE_EVENT_BLS_CPI, 'economy-bls-source-event')
    expect(ECONOMY_SOURCE_EVENT_BLS_CPI.source_type).toBe('rss')
    expect(ECONOMY_SOURCE_EVENT_BLS_CPI.trust_tier).toBe('T1')
    expect(ECONOMY_SOURCE_EVENT_BLS_CPI.trust_score).toBe(90)
  })

  it('crypto-2025-01-15-x-query-btc-breakout has required source-event fields for x_query type', () => {
    assertSourceEvent(CRYPTO_SOURCE_EVENT_X_QUERY_BTC, 'crypto-x-query-source-event')
    expect(CRYPTO_SOURCE_EVENT_X_QUERY_BTC.source_type).toBe('x_query')
    expect(CRYPTO_SOURCE_EVENT_X_QUERY_BTC.trust_tier).toBe('T4')
  })

  it('crypto-2025-01-15-social-telegram has required source-event fields for social type', () => {
    assertSourceEvent(CRYPTO_SOURCE_EVENT_SOCIAL_TELEGRAM, 'crypto-social-source-event')
    expect(CRYPTO_SOURCE_EVENT_SOCIAL_TELEGRAM.source_type).toBe('social')
    expect(CRYPTO_SOURCE_EVENT_SOCIAL_TELEGRAM.trust_tier).toBe('T4')
  })

  it('crypto-2025-01-15-webhook-liquidation has required source-event fields for webhook type', () => {
    assertSourceEvent(CRYPTO_SOURCE_EVENT_WEBHOOK_LIQUIDATION, 'crypto-webhook-source-event')
    expect(CRYPTO_SOURCE_EVENT_WEBHOOK_LIQUIDATION.source_type).toBe('webhook')
    expect(CRYPTO_SOURCE_EVENT_WEBHOOK_LIQUIDATION.trust_tier).toBe('T2')
    expect(CRYPTO_SOURCE_EVENT_WEBHOOK_LIQUIDATION.trust_score).toBe(75)
  })
})

// ---- Normalized item fixture tests ----

describe('fixtures/normalized-items', () => {
  it('crypto-2025-01-15-btc-etf-inflows has required normalized-item fields', () => {
    assertNormalizedItem(CRYPTO_NORMALIZED_ITEM_BTC_ETF, 'crypto-normalized')
    expect(CRYPTO_NORMALIZED_ITEM_BTC_ETF.is_duplicate).toBe(false)
    expect(CRYPTO_NORMALIZED_ITEM_BTC_ETF.topic_candidates).toContain('crypto')
  })

  it('finance-2025-01-15-fed-minutes has required normalized-item fields', () => {
    assertNormalizedItem(FINANCE_NORMALIZED_ITEM_FED_MINUTES, 'finance-normalized')
    expect(FINANCE_NORMALIZED_ITEM_FED_MINUTES.is_duplicate).toBe(false)
    expect(FINANCE_NORMALIZED_ITEM_FED_MINUTES.topic_candidates).toContain('finance')
  })

  it('ai-2025-01-15-open-weight-model has required normalized-item fields', () => {
    assertNormalizedItem(AI_NORMALIZED_ITEM_OPEN_WEIGHT_MODEL, 'ai-normalized')
    expect(AI_NORMALIZED_ITEM_OPEN_WEIGHT_MODEL.is_duplicate).toBe(false)
    expect(AI_NORMALIZED_ITEM_OPEN_WEIGHT_MODEL.topic_candidates).toContain('ai')
  })

  it('crypto-2025-01-15-x-whale-alert has required normalized-item fields for x_account type', () => {
    assertNormalizedItem(CRYPTO_NORMALIZED_ITEM_X_WHALE_ALERT, 'crypto-x-normalized')
    expect(CRYPTO_NORMALIZED_ITEM_X_WHALE_ALERT.is_duplicate).toBe(false)
    expect(CRYPTO_NORMALIZED_ITEM_X_WHALE_ALERT.source_type).toBe('x_account')
    expect(CRYPTO_NORMALIZED_ITEM_X_WHALE_ALERT.topic_candidates).toContain('crypto')
  })

  it('economy-2025-01-15-bls-cpi has required normalized-item fields for official T1 rss type', () => {
    assertNormalizedItem(ECONOMY_NORMALIZED_ITEM_BLS_CPI, 'economy-bls-normalized')
    expect(ECONOMY_NORMALIZED_ITEM_BLS_CPI.is_duplicate).toBe(false)
    expect(ECONOMY_NORMALIZED_ITEM_BLS_CPI.source_type).toBe('rss')
    expect(ECONOMY_NORMALIZED_ITEM_BLS_CPI.trust_tier).toBe('T1')
    expect(ECONOMY_NORMALIZED_ITEM_BLS_CPI.trust_score).toBe(90)
    expect(ECONOMY_NORMALIZED_ITEM_BLS_CPI.topic_candidates).toContain('economy')
  })

  it('crypto-2025-01-15-x-query-btc-breakout has required normalized-item fields for x_query type', () => {
    assertNormalizedItem(CRYPTO_NORMALIZED_ITEM_X_QUERY_BTC, 'crypto-x-query-normalized')
    expect(CRYPTO_NORMALIZED_ITEM_X_QUERY_BTC.is_duplicate).toBe(false)
    expect(CRYPTO_NORMALIZED_ITEM_X_QUERY_BTC.source_type).toBe('x_query')
    expect(CRYPTO_NORMALIZED_ITEM_X_QUERY_BTC.trust_tier).toBe('T4')
    expect(CRYPTO_NORMALIZED_ITEM_X_QUERY_BTC.topic_candidates).toContain('crypto')
  })

  it('crypto-2025-01-15-social-telegram has required normalized-item fields for social type', () => {
    assertNormalizedItem(CRYPTO_NORMALIZED_ITEM_SOCIAL_TELEGRAM, 'crypto-social-normalized')
    expect(CRYPTO_NORMALIZED_ITEM_SOCIAL_TELEGRAM.is_duplicate).toBe(false)
    expect(CRYPTO_NORMALIZED_ITEM_SOCIAL_TELEGRAM.source_type).toBe('social')
    expect(CRYPTO_NORMALIZED_ITEM_SOCIAL_TELEGRAM.trust_tier).toBe('T4')
    expect(CRYPTO_NORMALIZED_ITEM_SOCIAL_TELEGRAM.topic_candidates).toContain('crypto')
  })

  it('crypto-2025-01-15-webhook-liquidation has required normalized-item fields for webhook type', () => {
    assertNormalizedItem(CRYPTO_NORMALIZED_ITEM_WEBHOOK_LIQUIDATION, 'crypto-webhook-normalized')
    expect(CRYPTO_NORMALIZED_ITEM_WEBHOOK_LIQUIDATION.is_duplicate).toBe(false)
    expect(CRYPTO_NORMALIZED_ITEM_WEBHOOK_LIQUIDATION.source_type).toBe('webhook')
    expect(CRYPTO_NORMALIZED_ITEM_WEBHOOK_LIQUIDATION.trust_tier).toBe('T2')
    expect(CRYPTO_NORMALIZED_ITEM_WEBHOOK_LIQUIDATION.topic_candidates).toContain('crypto')
  })

  it('source_id in normalized item matches the corresponding source event', () => {
    expect(CRYPTO_NORMALIZED_ITEM_BTC_ETF.source_id).toBe(CRYPTO_SOURCE_EVENT_BTC_ETF.source_id)
    expect(FINANCE_NORMALIZED_ITEM_FED_MINUTES.source_id).toBe(FINANCE_SOURCE_EVENT_FED_MINUTES.source_id)
    expect(AI_NORMALIZED_ITEM_OPEN_WEIGHT_MODEL.source_id).toBe(AI_SOURCE_EVENT_OPEN_WEIGHT_MODEL.source_id)
    expect(CRYPTO_NORMALIZED_ITEM_X_WHALE_ALERT.source_id).toBe(CRYPTO_SOURCE_EVENT_X_WHALE_ALERT.source_id)
    expect(ECONOMY_NORMALIZED_ITEM_BLS_CPI.source_id).toBe(ECONOMY_SOURCE_EVENT_BLS_CPI.source_id)
    expect(CRYPTO_NORMALIZED_ITEM_X_QUERY_BTC.source_id).toBe(CRYPTO_SOURCE_EVENT_X_QUERY_BTC.source_id)
    expect(CRYPTO_NORMALIZED_ITEM_SOCIAL_TELEGRAM.source_id).toBe(CRYPTO_SOURCE_EVENT_SOCIAL_TELEGRAM.source_id)
    expect(CRYPTO_NORMALIZED_ITEM_WEBHOOK_LIQUIDATION.source_id).toBe(CRYPTO_SOURCE_EVENT_WEBHOOK_LIQUIDATION.source_id)
  })
})
