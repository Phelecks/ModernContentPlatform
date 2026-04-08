/**
 * Unit tests — functions/lib/validate.js
 *
 * Tests each validator function directly to protect the payload contract rules
 * that gate every workflow write to D1.
 *
 * Coverage:
 *   - validateAlertPayload
 *   - validateDailyStatusPayload
 *   - validatePublishJobPayload
 *
 * Integration tests in api.internal.*.test.js cover the full HTTP pipeline.
 * These unit tests focus on the validator logic in isolation, including
 * boundary values, null/undefined handling, and default normalization.
 */
import { describe, it, expect } from 'vitest'
import {
  validateAlertPayload,
  validateDailyStatusPayload,
  validatePublishJobPayload
} from '@functions/lib/validate.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validAlert(overrides = {}) {
  return {
    topic_slug: 'crypto',
    date_key: '2025-01-15',
    headline: 'Bitcoin Hits New ATH',
    summary_text: 'BTC surged past record highs driven by institutional demand.',
    source_name: 'CoinDesk',
    source_url: 'https://example.com/btc-ath',
    severity_score: 72,
    importance_score: 88,
    confidence_score: 95,
    event_at: '2025-01-15T14:32:00Z',
    cluster_label: 'Bitcoin price rally',
    alert_reason: 'New all-time high milestone',
    secondary_topics: ['finance'],
    item_id: 'abc123',
    ...overrides
  }
}

function validDailyStatus(overrides = {}) {
  return {
    topic_slug: 'crypto',
    date_key: '2025-01-15',
    page_state: 'ready',
    alert_count: 5,
    cluster_count: 2,
    summary_available: 1,
    video_available: 0,
    article_available: 1,
    ...overrides
  }
}

function validPublishJob(overrides = {}) {
  return {
    topic_slug: 'crypto',
    date_key: '2025-01-15',
    status: 'pending',
    attempt: 1,
    triggered_by: 'schedule',
    workflow_run_id: 'exec-001',
    ...overrides
  }
}

// ---------------------------------------------------------------------------
// validateAlertPayload
// ---------------------------------------------------------------------------

describe('validateAlertPayload', () => {
  // ---- Valid inputs ----

  it('returns valid=true for a complete valid payload', () => {
    const result = validateAlertPayload(validAlert())
    expect(result.valid).toBe(true)
  })

  it('returns the cleaned data object on success', () => {
    const result = validateAlertPayload(validAlert())
    expect(result.data).toBeTruthy()
    expect(result.data.topic_slug).toBe('crypto')
    expect(result.data.date_key).toBe('2025-01-15')
  })

  it('accepts all 7 valid topic slugs', () => {
    const topics = ['crypto', 'finance', 'economy', 'health', 'ai', 'energy', 'technology']
    for (const topic of topics) {
      const result = validateAlertPayload(validAlert({ topic_slug: topic }))
      expect(result.valid, `topic_slug=${topic} should be valid`).toBe(true)
    }
  })

  it('accepts boundary scores of 0', () => {
    const result = validateAlertPayload(validAlert({
      severity_score: 0, importance_score: 0, confidence_score: 0
    }))
    expect(result.valid).toBe(true)
  })

  it('accepts boundary scores of 100', () => {
    const result = validateAlertPayload(validAlert({
      severity_score: 100, importance_score: 100, confidence_score: 100
    }))
    expect(result.valid).toBe(true)
  })

  it('accepts payload without optional fields', () => {
    const minimal = {
      topic_slug: 'ai',
      date_key: '2025-01-15',
      headline: 'AI model released',
      summary_text: 'A major AI lab released a new open-weight model.',
      source_name: 'AIInsider',
      severity_score: 50,
      importance_score: 70,
      confidence_score: 80,
      event_at: '2025-01-15T10:00:00Z'
    }
    const result = validateAlertPayload(minimal)
    expect(result.valid).toBe(true)
  })

  it('defaults optional fields to null/empty on success', () => {
    const minimal = {
      topic_slug: 'ai',
      date_key: '2025-01-15',
      headline: 'AI model released',
      summary_text: 'A major AI lab released a new open-weight model.',
      source_name: 'AIInsider',
      severity_score: 50,
      importance_score: 70,
      confidence_score: 80,
      event_at: '2025-01-15T10:00:00Z'
    }
    const result = validateAlertPayload(minimal)
    expect(result.data.source_url).toBeNull()
    expect(result.data.cluster_label).toBeNull()
    expect(result.data.alert_reason).toBeNull()
    expect(result.data.secondary_topics).toEqual([])
    expect(result.data.item_id).toBeNull()
  })

  it('accepts null cluster_label explicitly', () => {
    const result = validateAlertPayload(validAlert({ cluster_label: null }))
    expect(result.valid).toBe(true)
  })

  it('accepts empty secondary_topics array', () => {
    const result = validateAlertPayload(validAlert({ secondary_topics: [] }))
    expect(result.valid).toBe(true)
  })

  it('accepts two secondary topics', () => {
    const result = validateAlertPayload(validAlert({ secondary_topics: ['finance', 'ai'] }))
    expect(result.valid).toBe(true)
  })

  // ---- Invalid inputs ----

  it('returns valid=false for a non-object body', () => {
    const result = validateAlertPayload('not an object')
    expect(result.valid).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('returns valid=false for null body', () => {
    const result = validateAlertPayload(null)
    expect(result.valid).toBe(false)
  })

  it('returns valid=false for an unknown topic_slug', () => {
    const result = validateAlertPayload(validAlert({ topic_slug: 'sports' }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/topic_slug/i)
  })

  it('returns valid=false for an invalid date_key format', () => {
    const result = validateAlertPayload(validAlert({ date_key: '2025/01/15' }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/date_key/i)
  })

  it('returns valid=false when headline is empty', () => {
    const result = validateAlertPayload(validAlert({ headline: '' }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/headline/i)
  })

  it('returns valid=false when headline exceeds 250 characters', () => {
    const result = validateAlertPayload(validAlert({ headline: 'A'.repeat(251) }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/headline/i)
  })

  it('returns valid=false when summary_text is empty', () => {
    const result = validateAlertPayload(validAlert({ summary_text: '' }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/summary_text/i)
  })

  it('returns valid=false when summary_text exceeds 500 characters', () => {
    const result = validateAlertPayload(validAlert({ summary_text: 'A'.repeat(501) }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/summary_text/i)
  })

  it('returns valid=false when severity_score is negative', () => {
    const result = validateAlertPayload(validAlert({ severity_score: -1 }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/severity_score/i)
  })

  it('returns valid=false when severity_score exceeds 100', () => {
    const result = validateAlertPayload(validAlert({ severity_score: 101 }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/severity_score/i)
  })

  it('returns valid=false when importance_score is not an integer', () => {
    const result = validateAlertPayload(validAlert({ importance_score: 50.5 }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/importance_score/i)
  })

  it('returns valid=false when event_at is not a valid ISO timestamp', () => {
    const result = validateAlertPayload(validAlert({ event_at: 'not-a-date' }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/event_at/i)
  })

  it('returns valid=false when event_at is a plain date without time', () => {
    const result = validateAlertPayload(validAlert({ event_at: '2025-01-15' }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/event_at/i)
  })

  it('returns valid=false when source_url is not a valid URL', () => {
    const result = validateAlertPayload(validAlert({ source_url: 'not-a-url' }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/source_url/i)
  })

  it('returns valid=false when source_url uses an unsupported protocol', () => {
    const result = validateAlertPayload(validAlert({ source_url: 'ftp://example.com' }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/source_url/i)
  })

  it('returns valid=false when secondary_topics exceeds 2 items', () => {
    const result = validateAlertPayload(validAlert({ secondary_topics: ['finance', 'ai', 'health'] }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/secondary_topics/i)
  })

  it('returns valid=false when a secondary topic is not a known slug', () => {
    const result = validateAlertPayload(validAlert({ secondary_topics: ['invalid-topic'] }))
    expect(result.valid).toBe(false)
  })

  it('returns valid=false when secondary_topics is not an array', () => {
    const result = validateAlertPayload(validAlert({ secondary_topics: 'finance' }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/secondary_topics/i)
  })

  it('returns valid=false for unknown fields', () => {
    const result = validateAlertPayload(validAlert({ unknown_field: 'value' }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/unknown/i)
  })

  it('returns valid=false when cluster_label exceeds 100 characters', () => {
    const result = validateAlertPayload(validAlert({ cluster_label: 'A'.repeat(101) }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/cluster_label/i)
  })
})

// ---------------------------------------------------------------------------
// validateDailyStatusPayload
// ---------------------------------------------------------------------------

describe('validateDailyStatusPayload', () => {
  // ---- Valid inputs ----

  it('returns valid=true for a complete valid payload', () => {
    const result = validateDailyStatusPayload(validDailyStatus())
    expect(result.valid).toBe(true)
  })

  it('returns the data object on success', () => {
    const result = validateDailyStatusPayload(validDailyStatus())
    expect(result.data.topic_slug).toBe('crypto')
    expect(result.data.date_key).toBe('2025-01-15')
    expect(result.data.page_state).toBe('ready')
  })

  it('accepts all valid page_state values', () => {
    const states = ['pending', 'ready', 'published', 'error']
    for (const state of states) {
      const result = validateDailyStatusPayload(validDailyStatus({ page_state: state }))
      expect(result.valid, `page_state=${state} should be valid`).toBe(true)
    }
  })

  it('defaults page_state to "ready" when omitted', () => {
    const { page_state, ...rest } = validDailyStatus()
    const result = validateDailyStatusPayload(rest)
    expect(result.valid).toBe(true)
    expect(result.data.page_state).toBe('ready')
  })

  it('defaults numeric counts to 0 when omitted', () => {
    const result = validateDailyStatusPayload({ topic_slug: 'finance', date_key: '2025-01-15' })
    expect(result.valid).toBe(true)
    expect(result.data.alert_count).toBe(0)
    expect(result.data.cluster_count).toBe(0)
    expect(result.data.summary_available).toBe(0)
    expect(result.data.video_available).toBe(0)
    expect(result.data.article_available).toBe(0)
  })

  it('accepts video_available=1', () => {
    const result = validateDailyStatusPayload(validDailyStatus({ video_available: 1 }))
    expect(result.valid).toBe(true)
  })

  it('accepts all 7 valid topic slugs', () => {
    const topics = ['crypto', 'finance', 'economy', 'health', 'ai', 'energy', 'technology']
    for (const topic of topics) {
      const result = validateDailyStatusPayload(validDailyStatus({ topic_slug: topic }))
      expect(result.valid, `topic_slug=${topic} should be valid`).toBe(true)
    }
  })

  // ---- Invalid inputs ----

  it('returns valid=false for a non-object body', () => {
    const result = validateDailyStatusPayload('not an object')
    expect(result.valid).toBe(false)
  })

  it('returns valid=false for an unknown topic_slug', () => {
    const result = validateDailyStatusPayload(validDailyStatus({ topic_slug: 'sports' }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/topic_slug/i)
  })

  it('returns valid=false for an invalid date_key format', () => {
    const result = validateDailyStatusPayload(validDailyStatus({ date_key: 'Jan-15-2025' }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/date_key/i)
  })

  it('returns valid=false for an invalid page_state', () => {
    const result = validateDailyStatusPayload(validDailyStatus({ page_state: 'live' }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/page_state/i)
  })

  it('returns valid=false when alert_count is negative', () => {
    const result = validateDailyStatusPayload(validDailyStatus({ alert_count: -1 }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/alert_count/i)
  })

  it('returns valid=false when alert_count is not an integer', () => {
    const result = validateDailyStatusPayload(validDailyStatus({ alert_count: 1.5 }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/alert_count/i)
  })

  it('returns valid=false when summary_available is 2', () => {
    const result = validateDailyStatusPayload(validDailyStatus({ summary_available: 2 }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/summary_available/i)
  })

  it('returns valid=false when video_available is -1', () => {
    const result = validateDailyStatusPayload(validDailyStatus({ video_available: -1 }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/video_available/i)
  })

  it('returns valid=false for unknown fields', () => {
    const result = validateDailyStatusPayload(validDailyStatus({ unknown_field: 'value' }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/unknown/i)
  })
})

// ---------------------------------------------------------------------------
// validatePublishJobPayload
// ---------------------------------------------------------------------------

describe('validatePublishJobPayload', () => {
  // ---- Valid inputs (create) ----

  it('returns valid=true for a complete valid create payload', () => {
    const result = validatePublishJobPayload(validPublishJob())
    expect(result.valid).toBe(true)
  })

  it('returns the data object on success', () => {
    const result = validatePublishJobPayload(validPublishJob())
    expect(result.data.topic_slug).toBe('crypto')
    expect(result.data.status).toBe('pending')
    expect(result.data.attempt).toBe(1)
  })

  it('accepts all valid status values', () => {
    const statuses = ['pending', 'running', 'success', 'failed', 'retrying']
    for (const status of statuses) {
      const result = validatePublishJobPayload(validPublishJob({ status }))
      expect(result.valid, `status=${status} should be valid`).toBe(true)
    }
  })

  it('accepts all valid triggered_by values', () => {
    for (const trigger of ['schedule', 'manual', 'retry']) {
      const result = validatePublishJobPayload(validPublishJob({ triggered_by: trigger }))
      expect(result.valid, `triggered_by=${trigger} should be valid`).toBe(true)
    }
  })

  it('defaults status to "pending" when omitted', () => {
    const { status, ...rest } = validPublishJob()
    const result = validatePublishJobPayload(rest)
    expect(result.valid).toBe(true)
    expect(result.data.status).toBe('pending')
  })

  it('defaults attempt to 1 when omitted', () => {
    const { attempt, ...rest } = validPublishJob()
    const result = validatePublishJobPayload(rest)
    expect(result.valid).toBe(true)
    expect(result.data.attempt).toBe(1)
  })

  it('defaults triggered_by to null when omitted', () => {
    const { triggered_by, ...rest } = validPublishJob()
    const result = validatePublishJobPayload(rest)
    expect(result.valid).toBe(true)
    expect(result.data.triggered_by).toBeNull()
  })

  it('accepts triggered_by=null explicitly', () => {
    const result = validatePublishJobPayload(validPublishJob({ triggered_by: null }))
    expect(result.valid).toBe(true)
    expect(result.data.triggered_by).toBeNull()
  })

  it('accepts attempt values greater than 1', () => {
    const result = validatePublishJobPayload(validPublishJob({ attempt: 5 }))
    expect(result.valid).toBe(true)
    expect(result.data.attempt).toBe(5)
  })

  it('accepts error_message as a string', () => {
    const result = validatePublishJobPayload(validPublishJob({ error_message: 'Out of memory' }))
    expect(result.valid).toBe(true)
  })

  it('accepts error_message as null', () => {
    const result = validatePublishJobPayload(validPublishJob({ error_message: null }))
    expect(result.valid).toBe(true)
    expect(result.data.error_message).toBeNull()
  })

  // ---- Invalid inputs ----

  it('returns valid=false for a non-object body', () => {
    const result = validatePublishJobPayload(null)
    expect(result.valid).toBe(false)
  })

  it('returns valid=false for an unknown topic_slug', () => {
    const result = validatePublishJobPayload(validPublishJob({ topic_slug: 'gaming' }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/topic_slug/i)
  })

  it('returns valid=false for an invalid date_key format', () => {
    const result = validatePublishJobPayload(validPublishJob({ date_key: '2025/01/15' }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/date_key/i)
  })

  it('returns valid=false for an unknown status', () => {
    const result = validatePublishJobPayload(validPublishJob({ status: 'unknown' }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/status/i)
  })

  it('returns valid=false when attempt is 0', () => {
    const result = validatePublishJobPayload(validPublishJob({ attempt: 0 }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/attempt/i)
  })

  it('returns valid=false when attempt is negative', () => {
    const result = validatePublishJobPayload(validPublishJob({ attempt: -1 }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/attempt/i)
  })

  it('returns valid=false when attempt is not an integer', () => {
    const result = validatePublishJobPayload(validPublishJob({ attempt: 1.5 }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/attempt/i)
  })

  it('returns valid=false for an unknown triggered_by value', () => {
    const result = validatePublishJobPayload(validPublishJob({ triggered_by: 'webhook' }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/triggered_by/i)
  })

  it('returns valid=false when error_message is not a string', () => {
    const result = validatePublishJobPayload(validPublishJob({ error_message: 123 }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/error_message/i)
  })

  it('returns valid=false for unknown fields', () => {
    const result = validatePublishJobPayload(validPublishJob({ extra: 'field' }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/unknown/i)
  })
})
