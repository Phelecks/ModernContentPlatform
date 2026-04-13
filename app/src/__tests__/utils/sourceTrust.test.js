/**
 * Unit tests — app/src/utils/sourceTrust.js
 *
 * Tests source normalization, trust scoring, confirmation rules, and source
 * attribution payload shaping.  Logic mirrors:
 *   - workflows/n8n/intraday/02_normalization.json (Normalize Item node)
 *   - workflows/n8n/intraday/06_alert_decision.json (Apply Thresholds node)
 *   - config/trust-rules.json
 *   - docs/architecture/trust-scoring.md
 *
 * Coverage:
 *   - Source type mapping (getDefaultTrustTierForSourceType)
 *   - HTML stripping (stripHtml)
 *   - Trust score coercion (coerceTrustScore)
 *   - Topic candidate detection (detectTopicCandidates)
 *   - Normalized source item creation (createNormalizedItem)
 *   - BASE_TRUST_SCORES data integrity
 *   - Topic policy normalization (normalizeTopicPolicy)
 *   - Alert decision — approved, rejected, pending paths (applyAlertDecision)
 *   - T4-excluded topics (economy, health)
 *   - X-only low-confidence cases
 *   - Official + news confirmation cases
 *   - Confirmation boost logic (applyConfidenceBoost)
 *   - Wording style selection (getWordingStyle)
 *   - Source attribution payload shaping (buildSourceAttributionPayload)
 */
import { describe, it, expect } from 'vitest'
import {
  BASE_TRUST_SCORES,
  DEFAULT_TOPIC_POLICIES,
  UNKNOWN_SOURCE_SEVERITY_CAP,
  X_SOURCE_TYPES,
  SOCIAL_SOURCE_TYPES,
  getDefaultTrustTierForSourceType,
  stripHtml,
  coerceTrustScore,
  detectTopicCandidates,
  createNormalizedItem,
  normalizeTopicPolicy,
  applyAlertDecision,
  applyConfidenceBoost,
  getWordingStyle,
  buildSourceAttributionPayload
} from '@/utils/sourceTrust.js'

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeSourceItem(overrides = {}) {
  return {
    source_id:    'test-id-001',
    source_slug:  'coindesk-rss',
    source_name:  'CoinDesk RSS',
    source_type:  'rss',
    source_url:   'https://www.coindesk.com/article/001',
    title:        'Bitcoin Hits New All-Time High',
    body:         'BTC surged past $120,000 driven by institutional demand.',
    author:       'Jane Smith',
    published_at: '2025-01-15T14:32:00Z',
    fetched_at:   '2025-01-15T14:45:00Z',
    trust_tier:   'T3',
    trust_score:  50,
    raw_json:     {},
    ...overrides
  }
}

function makeClassifiedItem(overrides = {}) {
  return {
    item_id:          'abc123',
    topic_slug:       'crypto',
    headline:         'Bitcoin Hits New ATH',
    summary_text:     'BTC surged to a new record.',
    source_name:      'CoinDesk RSS',
    source_slug:      'coindesk-rss',
    source_type:      'rss',
    source_url:       'https://www.coindesk.com/article/001',
    trust_tier:       'T3',
    trust_score:      50,
    severity_score:   70,
    importance_score: 80,
    confidence_score: 75,
    send_alert:       true,
    alert_reason:     'New all-time high',
    event_at:         '2025-01-15T14:32:00Z',
    cluster_label:    null,
    source_confidence_note: null,
    ...overrides
  }
}

// ---------------------------------------------------------------------------
// BASE_TRUST_SCORES data integrity
// ---------------------------------------------------------------------------

describe('BASE_TRUST_SCORES', () => {
  it('defines entries for T1, T2, T3, T4, and unknown', () => {
    expect(Object.keys(BASE_TRUST_SCORES)).toEqual(
      expect.arrayContaining(['T1', 'T2', 'T3', 'T4', 'unknown'])
    )
  })

  it('T1 has score 90 and zero confidence adjustment', () => {
    expect(BASE_TRUST_SCORES.T1.score).toBe(90)
    expect(BASE_TRUST_SCORES.T1.confidenceAdjustment).toBe(0)
  })

  it('T2 has score 75 and zero confidence adjustment', () => {
    expect(BASE_TRUST_SCORES.T2.score).toBe(75)
    expect(BASE_TRUST_SCORES.T2.confidenceAdjustment).toBe(0)
  })

  it('T3 has score 50 and negative confidence adjustment', () => {
    expect(BASE_TRUST_SCORES.T3.score).toBe(50)
    expect(BASE_TRUST_SCORES.T3.confidenceAdjustment).toBeLessThan(0)
  })

  it('T4 has score 25 and a confidence adjustment of at most -20', () => {
    expect(BASE_TRUST_SCORES.T4.score).toBe(25)
    expect(BASE_TRUST_SCORES.T4.confidenceAdjustment).toBeLessThanOrEqual(-20)
  })

  it('unknown has score 0 and a confidence adjustment of at most -25', () => {
    expect(BASE_TRUST_SCORES.unknown.score).toBe(0)
    expect(BASE_TRUST_SCORES.unknown.confidenceAdjustment).toBeLessThanOrEqual(-25)
  })

  it('trust scores are ordered T1 > T2 > T3 > T4 > unknown', () => {
    expect(BASE_TRUST_SCORES.T1.score).toBeGreaterThan(BASE_TRUST_SCORES.T2.score)
    expect(BASE_TRUST_SCORES.T2.score).toBeGreaterThan(BASE_TRUST_SCORES.T3.score)
    expect(BASE_TRUST_SCORES.T3.score).toBeGreaterThan(BASE_TRUST_SCORES.T4.score)
    expect(BASE_TRUST_SCORES.T4.score).toBeGreaterThan(BASE_TRUST_SCORES.unknown.score)
  })

  it('each entry has a non-empty label string', () => {
    for (const [, entry] of Object.entries(BASE_TRUST_SCORES)) {
      expect(typeof entry.label).toBe('string')
      expect(entry.label.length).toBeGreaterThan(0)
    }
  })
})

// ---------------------------------------------------------------------------
// Source type constants
// ---------------------------------------------------------------------------

describe('X_SOURCE_TYPES', () => {
  it('contains x_account and x_query', () => {
    expect(X_SOURCE_TYPES).toContain('x_account')
    expect(X_SOURCE_TYPES).toContain('x_query')
  })
})

describe('SOCIAL_SOURCE_TYPES', () => {
  it('contains social, x_account, and x_query', () => {
    expect(SOCIAL_SOURCE_TYPES).toContain('social')
    expect(SOCIAL_SOURCE_TYPES).toContain('x_account')
    expect(SOCIAL_SOURCE_TYPES).toContain('x_query')
  })
})

// ---------------------------------------------------------------------------
// Source type → trust tier mapping
// ---------------------------------------------------------------------------

describe('getDefaultTrustTierForSourceType', () => {
  it('returns T4 for x_account', () => {
    expect(getDefaultTrustTierForSourceType('x_account')).toBe('T4')
  })

  it('returns T4 for x_query', () => {
    expect(getDefaultTrustTierForSourceType('x_query')).toBe('T4')
  })

  it('returns T4 for social', () => {
    expect(getDefaultTrustTierForSourceType('social')).toBe('T4')
  })

  it('returns T1 for api', () => {
    expect(getDefaultTrustTierForSourceType('api')).toBe('T1')
  })

  it('returns T3 for rss', () => {
    expect(getDefaultTrustTierForSourceType('rss')).toBe('T3')
  })

  it('returns T2 for webhook', () => {
    expect(getDefaultTrustTierForSourceType('webhook')).toBe('T2')
  })

  it('returns T3 for newsapi', () => {
    expect(getDefaultTrustTierForSourceType('newsapi')).toBe('T3')
  })

  it('returns null for an unknown type', () => {
    expect(getDefaultTrustTierForSourceType('unknown_type')).toBeNull()
  })

  it('returns null when sourceType is null', () => {
    expect(getDefaultTrustTierForSourceType(null)).toBeNull()
  })

  it('returns null when sourceType is undefined', () => {
    expect(getDefaultTrustTierForSourceType(undefined)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// HTML stripping
// ---------------------------------------------------------------------------

describe('stripHtml', () => {
  it('removes simple HTML tags', () => {
    expect(stripHtml('<b>Hello</b>')).toBe('Hello')
  })

  it('removes nested HTML tags', () => {
    expect(stripHtml('<p><strong>Bitcoin</strong> hit <em>$120k</em></p>')).toBe('Bitcoin hit $120k')
  })

  it('collapses multiple whitespace characters into a single space', () => {
    expect(stripHtml('Hello   world')).toBe('Hello world')
  })

  it('trims leading and trailing whitespace', () => {
    expect(stripHtml('  hello  ')).toBe('hello')
  })

  it('returns an empty string for null', () => {
    expect(stripHtml(null)).toBe('')
  })

  it('returns an empty string for undefined', () => {
    expect(stripHtml(undefined)).toBe('')
  })

  it('returns an empty string for an empty string', () => {
    expect(stripHtml('')).toBe('')
  })

  it('preserves plain text without modification', () => {
    expect(stripHtml('Bitcoin surged past $120,000')).toBe('Bitcoin surged past $120,000')
  })

  it('removes self-closing tags without injecting extra space', () => {
    // The implementation strips tags but does not insert spaces in their place;
    // the \s+ collapse only normalises pre-existing whitespace.
    expect(stripHtml('Line one<br/>Line two')).toBe('Line oneLine two')
  })
})

// ---------------------------------------------------------------------------
// Trust score coercion
// ---------------------------------------------------------------------------

describe('coerceTrustScore', () => {
  it('returns the integer value for a valid integer', () => {
    expect(coerceTrustScore(50)).toBe(50)
  })

  it('returns the integer value for a valid float (truncated)', () => {
    expect(coerceTrustScore(50.9)).toBe(50)
  })

  it('truncates toward zero (not rounds)', () => {
    expect(coerceTrustScore(49.99)).toBe(49)
  })

  it('clamps values above 100 to 100', () => {
    expect(coerceTrustScore(150)).toBe(100)
  })

  it('clamps values below 0 to 0', () => {
    expect(coerceTrustScore(-10)).toBe(0)
  })

  it('returns 0 for score of 0', () => {
    expect(coerceTrustScore(0)).toBe(0)
  })

  it('returns 100 for score of 100', () => {
    expect(coerceTrustScore(100)).toBe(100)
  })

  it('returns null for null', () => {
    expect(coerceTrustScore(null)).toBeNull()
  })

  it('returns null for undefined', () => {
    expect(coerceTrustScore(undefined)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(coerceTrustScore('')).toBeNull()
  })

  it('returns null for NaN', () => {
    expect(coerceTrustScore(NaN)).toBeNull()
  })

  it('returns null for Infinity', () => {
    expect(coerceTrustScore(Infinity)).toBeNull()
  })

  it('parses a numeric string', () => {
    expect(coerceTrustScore('75')).toBe(75)
  })

  it('returns null for a non-numeric string', () => {
    expect(coerceTrustScore('abc')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Topic candidate detection
// ---------------------------------------------------------------------------

describe('detectTopicCandidates', () => {
  it('detects crypto from bitcoin keyword', () => {
    expect(detectTopicCandidates('bitcoin hits new all-time high')).toContain('crypto')
  })

  it('detects finance from stock keyword', () => {
    expect(detectTopicCandidates('stock market rally continues')).toContain('finance')
  })

  it('detects economy from inflation keyword', () => {
    expect(detectTopicCandidates('inflation rose 0.3 percent in december')).toContain('economy')
  })

  it('detects health from vaccine keyword', () => {
    expect(detectTopicCandidates('new vaccine approved by fda')).toContain('health')
  })

  it('detects ai from openai keyword', () => {
    expect(detectTopicCandidates('openai releases new foundation model')).toContain('ai')
  })

  it('detects energy from oil keyword', () => {
    expect(detectTopicCandidates('oil prices rise after opec meeting')).toContain('energy')
  })

  it('detects technology from apple keyword', () => {
    expect(detectTopicCandidates('apple announces new chip architecture')).toContain('technology')
  })

  it('returns at most 3 candidates', () => {
    const text = 'bitcoin stock market gdp vaccine openai oil apple'
    expect(detectTopicCandidates(text).length).toBeLessThanOrEqual(3)
  })

  it('returns an empty array when no keywords match', () => {
    expect(detectTopicCandidates('the weather is nice today')).toEqual([])
  })

  it('returns an empty array for an empty string', () => {
    expect(detectTopicCandidates('')).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Normalized source item creation
// ---------------------------------------------------------------------------

describe('createNormalizedItem', () => {
  it('returns an object with the correct shape', () => {
    const item = makeSourceItem()
    const result = createNormalizedItem(item, 'fixed-id-001')
    expect(result).toMatchObject({
      item_id:          'fixed-id-001',
      source_id:        item.source_id,
      source_slug:      item.source_slug,
      source_name:      item.source_name,
      source_type:      item.source_type,
      source_url:       item.source_url,
      is_duplicate:     false
    })
  })

  it('strips HTML from the title to produce headline', () => {
    const item = makeSourceItem({ title: '<b>Bitcoin</b> Surges' })
    const result = createNormalizedItem(item, 'id-strip')
    expect(result.headline).toBe('Bitcoin Surges')
  })

  it('strips HTML from body', () => {
    const item = makeSourceItem({ body: '<p>BTC is up <em>8%</em></p>' })
    const result = createNormalizedItem(item, 'id-body')
    expect(result.body).toBe('BTC is up 8%')
  })

  it('truncates headline to 250 characters', () => {
    const longTitle = 'A'.repeat(300)
    const result = createNormalizedItem(makeSourceItem({ title: longTitle }), 'id-long')
    expect(result.headline.length).toBeLessThanOrEqual(250)
  })

  it('truncates body to 2000 characters', () => {
    const longBody = 'B'.repeat(3000)
    const result = createNormalizedItem(makeSourceItem({ body: longBody }), 'id-longbody')
    expect(result.body.length).toBeLessThanOrEqual(2000)
  })

  it('sets body to null when source item has no body', () => {
    const result = createNormalizedItem(makeSourceItem({ body: null }), 'id-nobody')
    expect(result.body).toBeNull()
  })

  it('strips HTML from author', () => {
    const result = createNormalizedItem(makeSourceItem({ author: '<span>Jane Smith</span>' }), 'id-author')
    expect(result.author).toBe('Jane Smith')
  })

  it('sets author to null when source item has no author', () => {
    const result = createNormalizedItem(makeSourceItem({ author: null }), 'id-noauthor')
    expect(result.author).toBeNull()
  })

  it('uses published_at when available', () => {
    const result = createNormalizedItem(makeSourceItem({ published_at: '2025-01-15T14:32:00Z' }), 'id-pub')
    expect(result.published_at).toBe('2025-01-15T14:32:00.000Z')
  })

  it('falls back to fetched_at when published_at is null', () => {
    const result = createNormalizedItem(
      makeSourceItem({ published_at: null, fetched_at: '2025-01-15T14:45:00Z' }),
      'id-nopub'
    )
    expect(result.published_at).toBe('2025-01-15T14:45:00Z')
  })

  it('propagates trust_tier from the source item', () => {
    const result = createNormalizedItem(makeSourceItem({ trust_tier: 'T1' }), 'id-trust')
    expect(result.trust_tier).toBe('T1')
  })

  it('sets trust_tier to null when absent', () => {
    const result = createNormalizedItem(makeSourceItem({ trust_tier: undefined }), 'id-notrust')
    expect(result.trust_tier).toBeNull()
  })

  it('coerces trust_score to an integer', () => {
    const result = createNormalizedItem(makeSourceItem({ trust_score: 50.9 }), 'id-score')
    expect(result.trust_score).toBe(50)
  })

  it('sets trust_score to null when absent', () => {
    const result = createNormalizedItem(makeSourceItem({ trust_score: null }), 'id-noscore')
    expect(result.trust_score).toBeNull()
  })

  it('sets source_url to null when absent', () => {
    const result = createNormalizedItem(makeSourceItem({ source_url: undefined }), 'id-nourl')
    expect(result.source_url).toBeNull()
  })

  it('sets source_slug to null when absent', () => {
    const result = createNormalizedItem(makeSourceItem({ source_slug: undefined }), 'id-noslug')
    expect(result.source_slug).toBeNull()
  })

  it('always sets is_duplicate to false', () => {
    const result = createNormalizedItem(makeSourceItem(), 'id-dup')
    expect(result.is_duplicate).toBe(false)
  })

  it('detects topic_candidates from headline and body', () => {
    const result = createNormalizedItem(
      makeSourceItem({ title: 'Bitcoin surges', body: 'BTC hits new highs' }),
      'id-topics'
    )
    expect(result.topic_candidates).toContain('crypto')
  })

  it('sets topic_candidates to empty array when no keywords match', () => {
    const result = createNormalizedItem(
      makeSourceItem({ title: 'Weather update', body: 'It is sunny today.' }),
      'id-notopic'
    )
    expect(result.topic_candidates).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Topic policy normalization
// ---------------------------------------------------------------------------

describe('normalizeTopicPolicy', () => {
  it('returns a policy with all false/zero values for null input', () => {
    expect(normalizeTopicPolicy(null)).toEqual({
      t4Allowed: false, severityCap: 0, canTrigger: false, confirmationRequired: false
    })
  })

  it('returns a policy with all false/zero values for a non-object input', () => {
    expect(normalizeTopicPolicy('bad')).toEqual({
      t4Allowed: false, severityCap: 0, canTrigger: false, confirmationRequired: false
    })
  })

  it('reads camelCase fields correctly', () => {
    expect(normalizeTopicPolicy({
      t4Allowed: true, severityCap: 60, canTrigger: true, confirmationRequired: false
    })).toEqual({ t4Allowed: true, severityCap: 60, canTrigger: true, confirmationRequired: false })
  })

  it('reads snake_case fields correctly', () => {
    expect(normalizeTopicPolicy({
      t4_allowed: true, severity_cap: 30, can_trigger_alert: false, confirmation_required: true
    })).toEqual({ t4Allowed: true, severityCap: 30, canTrigger: false, confirmationRequired: true })
  })

  it('prefers camelCase over snake_case when both are present', () => {
    expect(normalizeTopicPolicy({
      t4Allowed: true, t4_allowed: false,
      severityCap: 60, severity_cap: 30
    })).toMatchObject({ t4Allowed: true, severityCap: 60 })
  })

  it('defaults boolean fields to false when absent', () => {
    const result = normalizeTopicPolicy({ severityCap: 50 })
    expect(result.t4Allowed).toBe(false)
    expect(result.canTrigger).toBe(false)
    expect(result.confirmationRequired).toBe(false)
  })

  it('defaults severityCap to 0 when absent', () => {
    const result = normalizeTopicPolicy({ t4Allowed: true })
    expect(result.severityCap).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// DEFAULT_TOPIC_POLICIES data integrity
// ---------------------------------------------------------------------------

describe('DEFAULT_TOPIC_POLICIES', () => {
  it('defines policies for all 7 canonical topics', () => {
    const expected = ['crypto', 'ai', 'finance', 'economy', 'health', 'energy', 'technology']
    expect(Object.keys(DEFAULT_TOPIC_POLICIES)).toEqual(expect.arrayContaining(expected))
  })

  it('economy excludes T4 (t4Allowed = false)', () => {
    expect(DEFAULT_TOPIC_POLICIES.economy.t4Allowed).toBe(false)
  })

  it('health excludes T4 (t4Allowed = false)', () => {
    expect(DEFAULT_TOPIC_POLICIES.health.t4Allowed).toBe(false)
  })

  it('finance requires confirmation for T4', () => {
    expect(DEFAULT_TOPIC_POLICIES.finance.confirmationRequired).toBe(true)
  })

  it('finance T4 cannot trigger independently (canTrigger = false)', () => {
    expect(DEFAULT_TOPIC_POLICIES.finance.canTrigger).toBe(false)
  })

  it('crypto allows T4 with a severity cap of 60', () => {
    expect(DEFAULT_TOPIC_POLICIES.crypto.t4Allowed).toBe(true)
    expect(DEFAULT_TOPIC_POLICIES.crypto.severityCap).toBe(60)
  })

  it('energy requires confirmation for T4', () => {
    expect(DEFAULT_TOPIC_POLICIES.energy.confirmationRequired).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// UNKNOWN_SOURCE_SEVERITY_CAP
// ---------------------------------------------------------------------------

describe('UNKNOWN_SOURCE_SEVERITY_CAP', () => {
  it('is 30', () => {
    expect(UNKNOWN_SOURCE_SEVERITY_CAP).toBe(30)
  })
})

// ---------------------------------------------------------------------------
// applyAlertDecision — snake_case policy integration
// Verifies that policies sourced directly from config/trust-rules.json
// (topic_t4_policy entries use snake_case: t4_allowed, severity_cap, etc.)
// are accepted and produce the correct decision without manual conversion.
// ---------------------------------------------------------------------------

describe('applyAlertDecision — snake_case policy map (config/trust-rules.json integration)', () => {
  // Mirrors the shape of trustRules.topic_t4_policy from config/trust-rules.json
  const snakeCasePolicies = {
    crypto:     { t4_allowed: true,  severity_cap: 60, can_trigger_alert: true,  confirmation_required: false },
    finance:    { t4_allowed: true,  severity_cap: 30, can_trigger_alert: false, confirmation_required: true  },
    economy:    { t4_allowed: false, severity_cap: 0,  can_trigger_alert: false, confirmation_required: false },
    health:     { t4_allowed: false, severity_cap: 0,  can_trigger_alert: false, confirmation_required: false },
    ai:         { t4_allowed: true,  severity_cap: 50, can_trigger_alert: true,  confirmation_required: false },
    energy:     { t4_allowed: true,  severity_cap: 50, can_trigger_alert: true,  confirmation_required: true  },
    technology: { t4_allowed: true,  severity_cap: 50, can_trigger_alert: true,  confirmation_required: false }
  }

  it('approves a T4 crypto item using snake_case policy (severity within cap)', () => {
    const item = makeClassifiedItem({
      trust_tier: 'T4', topic_slug: 'crypto',
      severity_score: 55, importance_score: 70, confidence_score: 50
    })
    const { result, item: out } = applyAlertDecision(item, snakeCasePolicies)
    expect(result).toBe('approved')
    expect(out.severity_score).toBe(55)
  })

  it('caps T4 crypto severity to 60 using snake_case policy', () => {
    const item = makeClassifiedItem({
      trust_tier: 'T4', topic_slug: 'crypto',
      severity_score: 80, importance_score: 70, confidence_score: 50
    })
    const { item: out } = applyAlertDecision(item, snakeCasePolicies)
    expect(out.severity_score).toBe(60)
  })

  it('holds a T4 finance item as pending using snake_case policy', () => {
    const item = makeClassifiedItem({
      trust_tier: 'T4', topic_slug: 'finance',
      severity_score: 55, importance_score: 70, confidence_score: 50
    })
    const { result, item: out } = applyAlertDecision(item, snakeCasePolicies)
    expect(result).toBe('pending')
    expect(out.status).toBe('pending_confirmation')
  })

  it('rejects a T4 economy item using snake_case policy', () => {
    const item = makeClassifiedItem({
      trust_tier: 'T4', topic_slug: 'economy',
      severity_score: 80, importance_score: 80, confidence_score: 80
    })
    const { result } = applyAlertDecision(item, snakeCasePolicies)
    expect(result).toBe('rejected')
  })

  it('rejects a T4 health item using snake_case policy', () => {
    const item = makeClassifiedItem({
      trust_tier: 'T4', topic_slug: 'health',
      severity_score: 80, importance_score: 80, confidence_score: 80
    })
    const { result } = applyAlertDecision(item, snakeCasePolicies)
    expect(result).toBe('rejected')
  })
})

// ---------------------------------------------------------------------------
// Alert decision — T1/T2/T3 (high-trust) approved path
// ---------------------------------------------------------------------------

describe('applyAlertDecision — high-trust sources (T1/T2/T3)', () => {
  it('approves a T1 item that passes all thresholds', () => {
    const item = makeClassifiedItem({ trust_tier: 'T1', trust_score: 90 })
    const { result, item: out } = applyAlertDecision(item)
    expect(result).toBe('approved')
    expect(out.status).toBe('active')
    expect(out.confirmation_status).toBe('confirmed')
  })

  it('approves a T2 item that passes all thresholds', () => {
    const item = makeClassifiedItem({ trust_tier: 'T2', trust_score: 75 })
    const { result } = applyAlertDecision(item)
    expect(result).toBe('approved')
  })

  it('approves a T3 item that passes all thresholds', () => {
    const item = makeClassifiedItem({ trust_tier: 'T3', trust_score: 50 })
    const { result } = applyAlertDecision(item)
    expect(result).toBe('approved')
  })

  it('rejects a T1 item with send_alert = false', () => {
    const item = makeClassifiedItem({ trust_tier: 'T1', send_alert: false })
    const { result } = applyAlertDecision(item)
    expect(result).toBe('rejected')
  })

  it('rejects a T2 item with importance_score below threshold', () => {
    const item = makeClassifiedItem({ trust_tier: 'T2', importance_score: 30 })
    const { result } = applyAlertDecision(item)
    expect(result).toBe('rejected')
  })

  it('rejects a T3 item with severity_score below threshold', () => {
    const item = makeClassifiedItem({ trust_tier: 'T3', severity_score: 20 })
    const { result } = applyAlertDecision(item)
    expect(result).toBe('rejected')
  })

  it('sets date_key from event_at', () => {
    const item = makeClassifiedItem({ trust_tier: 'T1', event_at: '2025-06-01T10:00:00Z' })
    const { item: out } = applyAlertDecision(item)
    expect(out.date_key).toBe('2025-06-01')
  })

  it('sets channels to telegram and discord', () => {
    const item = makeClassifiedItem({ trust_tier: 'T1' })
    const { item: out } = applyAlertDecision(item)
    expect(out.channels).toEqual(['telegram', 'discord'])
  })
})

// ---------------------------------------------------------------------------
// Alert decision — T4 source, crypto topic (capped, approved)
// ---------------------------------------------------------------------------

describe('applyAlertDecision — T4 source, crypto topic', () => {
  it('approves a T4 crypto item within the severity cap', () => {
    const item = makeClassifiedItem({
      trust_tier: 'T4', trust_score: 25, topic_slug: 'crypto',
      severity_score: 55, importance_score: 70, confidence_score: 50
    })
    const { result, item: out } = applyAlertDecision(item)
    expect(result).toBe('approved')
    expect(out.severity_score).toBe(55)
    expect(out.confirmation_status).toBe('unconfirmed')
  })

  it('caps severity to the topic limit (60 for crypto)', () => {
    const item = makeClassifiedItem({
      trust_tier: 'T4', topic_slug: 'crypto',
      severity_score: 80, importance_score: 70, confidence_score: 50
    })
    const { item: out } = applyAlertDecision(item)
    expect(out.severity_score).toBe(60)
  })

  it('rejects when adjusted severity is below the global threshold', () => {
    const item = makeClassifiedItem({
      trust_tier: 'T4', topic_slug: 'crypto',
      severity_score: 80, importance_score: 70, confidence_score: 50
    })
    // Override severity threshold to above the cap
    const { result } = applyAlertDecision(item, undefined, { severity: 65 })
    expect(result).toBe('rejected')
  })
})

// ---------------------------------------------------------------------------
// Alert decision — T4 source, finance topic (pending confirmation)
// ---------------------------------------------------------------------------

describe('applyAlertDecision — T4 source, finance topic (confirmation required)', () => {
  it('holds a T4 finance item as pending when raw severity passes', () => {
    const item = makeClassifiedItem({
      trust_tier: 'T4', topic_slug: 'finance',
      severity_score: 55, importance_score: 70, confidence_score: 50
    })
    const { result, item: out } = applyAlertDecision(item)
    expect(result).toBe('pending')
    expect(out.status).toBe('pending_confirmation')
    expect(out.confirmation_status).toBe('pending')
  })

  it('caps severity to the topic limit (30 for finance) in the pending item', () => {
    const item = makeClassifiedItem({
      trust_tier: 'T4', topic_slug: 'finance',
      severity_score: 60, importance_score: 70, confidence_score: 50
    })
    const { item: out } = applyAlertDecision(item)
    expect(out.severity_score).toBe(30)
  })
})

// ---------------------------------------------------------------------------
// Alert decision — T4-excluded topics (economy, health)
// ---------------------------------------------------------------------------

describe('applyAlertDecision — T4 excluded topics', () => {
  it('rejects a T4 economy item entirely', () => {
    const item = makeClassifiedItem({
      trust_tier: 'T4', topic_slug: 'economy',
      severity_score: 80, importance_score: 80, confidence_score: 80
    })
    const { result } = applyAlertDecision(item)
    expect(result).toBe('rejected')
  })

  it('rejects a T4 health item entirely', () => {
    const item = makeClassifiedItem({
      trust_tier: 'T4', topic_slug: 'health',
      severity_score: 80, importance_score: 80, confidence_score: 80
    })
    const { result } = applyAlertDecision(item)
    expect(result).toBe('rejected')
  })

  it('approves a T1 economy item that passes all thresholds', () => {
    const item = makeClassifiedItem({
      trust_tier: 'T1', topic_slug: 'economy',
      severity_score: 70, importance_score: 80, confidence_score: 75
    })
    const { result } = applyAlertDecision(item)
    expect(result).toBe('approved')
  })
})

// ---------------------------------------------------------------------------
// Alert decision — unknown trust tier (null)
// ---------------------------------------------------------------------------

describe('applyAlertDecision — unknown trust tier', () => {
  it('caps severity to UNKNOWN_SOURCE_SEVERITY_CAP (30) for null-tier items and approves when cap passes threshold', () => {
    const item = makeClassifiedItem({
      trust_tier: null, topic_slug: 'crypto',
      severity_score: 70, importance_score: 70, confidence_score: 50
    })
    // Lower the severity threshold so the capped value (30) still passes.
    const { result, item: out } = applyAlertDecision(item, undefined, { severity: 25 })
    expect(result).toBe('approved')
    expect(out.severity_score).toBe(UNKNOWN_SOURCE_SEVERITY_CAP)
  })

  it('rejects a null-tier item for an excluded topic (health)', () => {
    const item = makeClassifiedItem({
      trust_tier: null, topic_slug: 'health',
      severity_score: 80, importance_score: 80, confidence_score: 80
    })
    const { result } = applyAlertDecision(item)
    expect(result).toBe('rejected')
  })
})

// ---------------------------------------------------------------------------
// X-only low-confidence cases
// ---------------------------------------------------------------------------

describe('applyAlertDecision — X source (x_account / x_query)', () => {
  it('approves an x_account item for crypto within the severity cap', () => {
    // severity 55 is below the crypto T4 cap (60), so it stays at 55 which
    // passes the default global severity threshold (50).
    const item = makeClassifiedItem({
      trust_tier: 'T4', source_type: 'x_account', topic_slug: 'crypto',
      severity_score: 55, importance_score: 65, confidence_score: 42
    })
    const { result } = applyAlertDecision(item)
    expect(result).toBe('approved')
  })

  it('holds an x_query finance item as pending confirmation', () => {
    const item = makeClassifiedItem({
      trust_tier: 'T4', source_type: 'x_query', topic_slug: 'finance',
      severity_score: 55, importance_score: 65, confidence_score: 45
    })
    const { result } = applyAlertDecision(item)
    expect(result).toBe('pending')
  })

  it('rejects an x_account health item (health excludes T4)', () => {
    const item = makeClassifiedItem({
      trust_tier: 'T4', source_type: 'x_account', topic_slug: 'health',
      severity_score: 80, importance_score: 80, confidence_score: 80
    })
    const { result } = applyAlertDecision(item)
    expect(result).toBe('rejected')
  })

  it('rejects an x_account item with confidence_score below threshold', () => {
    const item = makeClassifiedItem({
      trust_tier: 'T4', source_type: 'x_account', topic_slug: 'crypto',
      severity_score: 55, importance_score: 65, confidence_score: 20
    })
    const { result } = applyAlertDecision(item)
    expect(result).toBe('rejected')
  })
})

// ---------------------------------------------------------------------------
// Official + news confirmation cases
// ---------------------------------------------------------------------------

describe('applyAlertDecision — official (T1) + wire (T2) sources', () => {
  it('approves a T1 official source item with confirmed status', () => {
    const item = makeClassifiedItem({
      trust_tier: 'T1', source_type: 'api', topic_slug: 'economy',
      severity_score: 80, importance_score: 85, confidence_score: 90
    })
    const { result, item: out } = applyAlertDecision(item)
    expect(result).toBe('approved')
    expect(out.confirmation_status).toBe('confirmed')
    expect(out.status).toBe('active')
  })

  it('approves a T2 wire source item with confirmed status', () => {
    const item = makeClassifiedItem({
      trust_tier: 'T2', source_type: 'rss', topic_slug: 'finance',
      severity_score: 70, importance_score: 75, confidence_score: 80
    })
    const { result, item: out } = applyAlertDecision(item)
    expect(result).toBe('approved')
    expect(out.confirmation_status).toBe('confirmed')
  })

  it('preserves original severity for T1 (no cap applied)', () => {
    const item = makeClassifiedItem({
      trust_tier: 'T1', topic_slug: 'crypto',
      severity_score: 90
    })
    const { item: out } = applyAlertDecision(item)
    expect(out.severity_score).toBe(90)
  })
})

// ---------------------------------------------------------------------------
// Confirmation boost logic
// ---------------------------------------------------------------------------

describe('applyConfidenceBoost', () => {
  it('T4 confirmed by T1 boosts by 30 up to max 95', () => {
    expect(applyConfidenceBoost(40, 'T4', 'T1')).toBe(70)
    expect(applyConfidenceBoost(70, 'T4', 'T1')).toBe(95)
    expect(applyConfidenceBoost(90, 'T4', 'T1')).toBe(95)
  })

  it('T4 confirmed by T2 boosts by 25 up to max 90', () => {
    expect(applyConfidenceBoost(40, 'T4', 'T2')).toBe(65)
    expect(applyConfidenceBoost(70, 'T4', 'T2')).toBe(90)
    expect(applyConfidenceBoost(89, 'T4', 'T2')).toBe(90)
  })

  it('T4 confirmed by T3 boosts by 15 up to max 80', () => {
    expect(applyConfidenceBoost(40, 'T4', 'T3')).toBe(55)
    expect(applyConfidenceBoost(70, 'T4', 'T3')).toBe(80)
  })

  it('T3 confirmed by T1 boosts by 15 up to max 95', () => {
    expect(applyConfidenceBoost(70, 'T3', 'T1')).toBe(85)
  })

  it('T3 confirmed by T2 boosts by 10 up to max 90', () => {
    expect(applyConfidenceBoost(70, 'T3', 'T2')).toBe(80)
  })

  it('T3 confirmed by T3 boosts by 5 up to max 80', () => {
    expect(applyConfidenceBoost(70, 'T3', 'T3')).toBe(75)
    expect(applyConfidenceBoost(78, 'T3', 'T3')).toBe(80)
  })

  it('T4 confirmed by T4 boosts by 5 up to max 60', () => {
    expect(applyConfidenceBoost(40, 'T4', 'T4')).toBe(45)
    expect(applyConfidenceBoost(58, 'T4', 'T4')).toBe(60)
  })

  it('returns base confidence unchanged for an undefined combination', () => {
    expect(applyConfidenceBoost(55, 'T1', 'T2')).toBe(55)
    expect(applyConfidenceBoost(55, 'T1', 'T1')).toBe(55)
  })
})

// ---------------------------------------------------------------------------
// Wording style
// ---------------------------------------------------------------------------

describe('getWordingStyle', () => {
  it('returns "factual" for confidence 80–100', () => {
    expect(getWordingStyle(80)).toBe('factual')
    expect(getWordingStyle(95)).toBe('factual')
    expect(getWordingStyle(100)).toBe('factual')
  })

  it('returns "attributed" for confidence 60–79', () => {
    expect(getWordingStyle(60)).toBe('attributed')
    expect(getWordingStyle(70)).toBe('attributed')
    expect(getWordingStyle(79)).toBe('attributed')
  })

  it('returns "hedged" for confidence 40–59', () => {
    expect(getWordingStyle(40)).toBe('hedged')
    expect(getWordingStyle(50)).toBe('hedged')
    expect(getWordingStyle(59)).toBe('hedged')
  })

  it('returns "flagged" for confidence 0–39', () => {
    expect(getWordingStyle(0)).toBe('flagged')
    expect(getWordingStyle(20)).toBe('flagged')
    expect(getWordingStyle(39)).toBe('flagged')
  })
})

// ---------------------------------------------------------------------------
// Source attribution payload shaping
// ---------------------------------------------------------------------------

describe('buildSourceAttributionPayload', () => {
  it('returns the expected fields for a fully populated item', () => {
    const item = makeClassifiedItem()
    const payload = buildSourceAttributionPayload(item)
    expect(payload).toEqual({
      source_name:   'CoinDesk RSS',
      source_slug:   'coindesk-rss',
      source_type:   'rss',
      source_url:    'https://www.coindesk.com/article/001',
      trust_tier:    'T3',
      trust_score:   50,
      wording_style: 'attributed'    // confidence_score=75 → attributed
    })
  })

  it('sets all fields to null when item is empty', () => {
    const payload = buildSourceAttributionPayload({})
    expect(payload.source_name).toBeNull()
    expect(payload.source_slug).toBeNull()
    expect(payload.source_type).toBeNull()
    expect(payload.source_url).toBeNull()
    expect(payload.trust_tier).toBeNull()
    expect(payload.trust_score).toBeNull()
    expect(payload.wording_style).toBeNull()
  })

  it('sets wording_style to "flagged" for a low-confidence T4 item', () => {
    const item = makeClassifiedItem({ trust_tier: 'T4', confidence_score: 30 })
    const payload = buildSourceAttributionPayload(item)
    expect(payload.trust_tier).toBe('T4')
    expect(payload.wording_style).toBe('flagged')
  })

  it('sets wording_style to "factual" for a high-confidence T1 item', () => {
    const item = makeClassifiedItem({ trust_tier: 'T1', trust_score: 90, confidence_score: 92 })
    const payload = buildSourceAttributionPayload(item)
    expect(payload.trust_tier).toBe('T1')
    expect(payload.trust_score).toBe(90)
    expect(payload.wording_style).toBe('factual')
  })

  it('sets trust_score to null for non-numeric value', () => {
    const item = makeClassifiedItem({ trust_score: 'N/A' })
    const payload = buildSourceAttributionPayload(item)
    expect(payload.trust_score).toBeNull()
  })

  it('sets wording_style to null when confidence_score is absent', () => {
    const item = { source_name: 'Test', trust_tier: 'T3' }
    const payload = buildSourceAttributionPayload(item)
    expect(payload.wording_style).toBeNull()
  })
})
