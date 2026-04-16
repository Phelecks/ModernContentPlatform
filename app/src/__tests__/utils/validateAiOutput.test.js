/**
 * Unit tests — app/src/utils/validateAiOutput.js
 *
 * Validates the structured AI output parsing and validation utilities.
 *
 * Covers:
 *   parseJsonOutput            — valid JSON, markdown-fenced JSON, CRLF fences, uppercase lang tags, parse failure, non-string input
 *   validateAlertClassification — required fields, enum values, secondary_topics, cluster_label type, integer ranges, boolean type
 *   validateTimelineEntry       — required fields, severity_level enum, label_color enum, source_url pattern, source_attribution length
 *   validateDailySummary        — required fields, nested key_events, sentiment enum, topic_score
 *   validateExpectationCheck    — required fields, outcome enum, alignment_score range, array maxItems, surprise_events length bounds, source field validation
 *   validateTomorrowOutlook     — required fields, key_watchpoints, scheduled_events maxItems, time_hint length, risk_level enum, source field validation on watchpoints and events
 *   validateVideoScript         — required fields, segments array, duration ranges
 *   validateYoutubeMetadata     — required fields, tags array, visibility enum
 *   parseAndValidate* functions — parse + validate integration, error propagation
 */
import { describe, it, expect } from 'vitest'
import {
  parseJsonOutput,
  validateAlertClassification,
  validateTimelineEntry,
  validateDailySummary,
  validateExpectationCheck,
  validateTomorrowOutlook,
  validateVideoScript,
  validateYoutubeMetadata,
  validateNarrationAsset,
  parseAndValidateAlertClassification,
  parseAndValidateTimelineEntry,
  parseAndValidateDailySummary,
  parseAndValidateExpectationCheck,
  parseAndValidateTomorrowOutlook,
  parseAndValidateVideoScript,
  parseAndValidateYoutubeMetadata,
  parseAndValidateNarrationAsset,
  VALID_TOPICS,
  VALID_SENTIMENTS,
  VALID_SEVERITY_LEVELS,
  VALID_RISK_LEVELS,
  VALID_EXPECTATION_OUTCOMES,
  VALID_NARRATION_PROVIDERS,
  VALID_NARRATION_FORMATS,
  VALID_NARRATION_AUDIO_ENCODINGS,
} from '@/utils/validateAiOutput.js'

// ---------------------------------------------------------------------------
// Fixtures — valid minimal objects for each task
// ---------------------------------------------------------------------------

const VALID_ALERT_CLASSIFICATION = {
  topic_slug: 'crypto',
  secondary_topics: ['finance'],
  headline: 'Bitcoin Hits New All-Time High Above $120K',
  summary_text: 'Bitcoin surged past $120,000, setting a new all-time high driven by strong institutional inflows.',
  severity_score: 72,
  importance_score: 88,
  confidence_score: 95,
  send_alert: true,
  alert_reason: 'New all-time high is a high-importance milestone for the crypto audience.',
  cluster_label: 'Bitcoin price rally',
  source_confidence_note: null,
}

const VALID_TIMELINE_ENTRY = {
  headline: 'Bitcoin Breaks $120K All-Time High',
  summary_text: 'Bitcoin surged past $120,000 for the first time, driven by record institutional ETF inflows.',
  severity_level: 'high',
  label: 'Price Action',
  label_color: 'green',
  source_attribution: 'via CoinDesk',
  source_url: 'https://www.coindesk.com/markets/2025/01/15/bitcoin-hits-new-ath/',
}

const VALID_DAILY_SUMMARY = {
  headline: 'Bitcoin Breaks $120K as Institutional Inflows Hit Record High',
  overview: 'Bitcoin surged past $120,000 on Thursday, driven by record institutional inflows and strong ETF demand. The move extended a week-long rally and pushed total crypto market cap above $3 trillion for the first time. Major altcoins followed with gains of 5–15%. Sentiment remained broadly bullish as on-chain metrics showed continued accumulation by long-term holders.',
  key_events: [
    {
      title: 'Bitcoin New All-Time High Above $120K',
      significance: 'A new all-time high reinforces the ongoing bull market and is likely to attract additional retail and institutional flows.',
      importance_score: 95,
    },
    {
      title: 'Spot Bitcoin ETF Daily Inflow Exceeds $1.5B',
      significance: 'Record daily ETF inflows indicate sustained institutional demand and further legitimisation of Bitcoin as an asset class.',
      importance_score: 88,
    },
  ],
  sentiment: 'bullish',
  topic_score: 92,
}

const VALID_EXPECTATION_CHECK = {
  expectations_checked: [
    {
      expectation: 'Bitcoin would test resistance near $115K before moving higher',
      outcome: 'missed',
      note: 'Bitcoin broke through $115K with minimal resistance.',
    },
  ],
  surprise_events: ['A major sovereign wealth fund disclosed a $2B Bitcoin allocation.'],
  alignment_score: 65,
  analyst_note: null,
}

const VALID_TOMORROW_OUTLOOK = {
  key_watchpoints: [
    {
      title: 'Bitcoin $120K Support Hold',
      description: 'After breaking above $120K, holding this level as support is critical for continued momentum.',
    },
  ],
  scheduled_events: [
    {
      title: 'FOMC Meeting Minutes Release',
      time_hint: '14:00 ET',
      impact: 'high',
    },
  ],
  outlook_summary: 'Bitcoin enters Friday\'s session at all-time highs with strong momentum. The key risk tomorrow is macro: the FOMC minutes could introduce volatility if language around rate cuts shifts.',
  risk_level: 'medium',
}

const VALID_VIDEO_SCRIPT = {
  intro: 'Bitcoin just hit a new all-time high — breaking above $120,000 for the first time in history.',
  segments: [
    {
      title: 'Bitcoin All-Time High',
      script: 'So let\'s start with the headline event. Bitcoin crossed $120,000 today, setting a new all-time high. The move was driven by two things: record ETF inflows and a surprise announcement from a major sovereign wealth fund.',
      duration_seconds: 45,
      sources: null,
    },
    {
      title: 'ETF Flows and Institutional Demand',
      script: 'Let\'s talk about those ETF flows because they\'re becoming the dominant force in this market. $1.5 billion in a single day is more than double the previous record. It tells us that traditional finance is actively allocating.',
      duration_seconds: 40,
      sources: null,
    },
  ],
  outro: 'So where does this leave us? Bitcoin is at all-time highs, institutional demand is accelerating, and tomorrow we have FOMC minutes.',
  total_duration_seconds: 180,
  call_to_action: null,
}

const VALID_YOUTUBE_METADATA = {
  title: 'Bitcoin Hits $120K All-Time High | Crypto Daily Briefing Jan 15 2025',
  description: 'Bitcoin broke above $120,000 today, setting a new all-time high driven by record institutional ETF inflows and a major sovereign wealth fund disclosure.\n\nIn today\'s briefing:\n- Bitcoin new ATH: what drove the move\n- Spot ETF inflows hit $1.5B in one day\n- Tomorrow\'s watchpoints: FOMC minutes and $120K support\n\nStay informed — subscribe for daily crypto briefings.',
  tags: ['bitcoin', 'crypto', 'bitcoin all time high', 'crypto news', 'bitcoin etf'],
  category: 'News & Politics',
  visibility: 'public',
}

// ---------------------------------------------------------------------------
// Exported constants
// ---------------------------------------------------------------------------

describe('exported constants', () => {
  it('VALID_TOPICS contains all seven supported topics', () => {
    expect(VALID_TOPICS).toEqual(['crypto', 'finance', 'economy', 'health', 'ai', 'energy', 'technology'])
  })
  it('VALID_SENTIMENTS contains the four sentiment values', () => {
    expect(VALID_SENTIMENTS).toEqual(['bullish', 'bearish', 'neutral', 'mixed'])
  })
  it('VALID_SEVERITY_LEVELS contains high, medium, low', () => {
    expect(VALID_SEVERITY_LEVELS).toEqual(['high', 'medium', 'low'])
  })
  it('VALID_RISK_LEVELS contains low, medium, high', () => {
    expect(VALID_RISK_LEVELS).toEqual(['low', 'medium', 'high'])
  })
  it('VALID_EXPECTATION_OUTCOMES contains met, missed, partial', () => {
    expect(VALID_EXPECTATION_OUTCOMES).toEqual(['met', 'missed', 'partial'])
  })
  it('VALID_NARRATION_PROVIDERS contains openai and google', () => {
    expect(VALID_NARRATION_PROVIDERS).toEqual(['openai', 'google'])
  })
  it('VALID_NARRATION_FORMATS contains b64_json', () => {
    expect(VALID_NARRATION_FORMATS).toEqual(['b64_json'])
  })
  it('VALID_NARRATION_AUDIO_ENCODINGS contains all supported encodings', () => {
    expect(VALID_NARRATION_AUDIO_ENCODINGS).toEqual(['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm'])
  })
})

// ---------------------------------------------------------------------------
// parseJsonOutput
// ---------------------------------------------------------------------------

describe('parseJsonOutput', () => {
  it('parses a plain JSON string', () => {
    const result = parseJsonOutput('{"key": "value"}')
    expect(result).toEqual({ key: 'value' })
  })

  it('strips a json code fence before parsing', () => {
    const result = parseJsonOutput('```json\n{"key": "value"}\n```')
    expect(result).toEqual({ key: 'value' })
  })

  it('strips a bare code fence before parsing', () => {
    const result = parseJsonOutput('```\n{"key": "value"}\n```')
    expect(result).toEqual({ key: 'value' })
  })

  it('parses a JSON array', () => {
    const result = parseJsonOutput('[1, 2, 3]')
    expect(result).toEqual([1, 2, 3])
  })

  it('throws AI_PARSE_ERROR when input is not valid JSON', () => {
    expect(() => parseJsonOutput('not json')).toThrow('AI_PARSE_ERROR')
  })

  it('throws AI_PARSE_ERROR when input is not a string', () => {
    expect(() => parseJsonOutput(null)).toThrow('AI_PARSE_ERROR')
  })

  it('throws AI_PARSE_ERROR when input is undefined', () => {
    expect(() => parseJsonOutput(undefined)).toThrow('AI_PARSE_ERROR')
  })

  it('throws AI_PARSE_ERROR and includes a snippet of the raw content in the message', () => {
    const raw = 'This is not json at all'
    try {
      parseJsonOutput(raw)
      expect.fail('Should have thrown')
    } catch (e) {
      expect(e.message).toContain('This is not json')
    }
  })

  it('trims leading and trailing whitespace before parsing', () => {
    const result = parseJsonOutput('  {"a": 1}  ')
    expect(result).toEqual({ a: 1 })
  })

  it('strips a CRLF-terminated code fence before parsing', () => {
    const result = parseJsonOutput('```json\r\n{"key": "value"}\r\n```')
    expect(result).toEqual({ key: 'value' })
  })

  it('strips an uppercase language tag code fence before parsing', () => {
    const result = parseJsonOutput('```JSON\n{"key": "value"}\n```')
    expect(result).toEqual({ key: 'value' })
  })
})

// ---------------------------------------------------------------------------
// validateAlertClassification
// ---------------------------------------------------------------------------

describe('validateAlertClassification', () => {
  it('returns ok=true for a valid minimal object', () => {
    const { ok, errors } = validateAlertClassification(VALID_ALERT_CLASSIFICATION)
    expect(ok).toBe(true)
    expect(errors).toHaveLength(0)
  })

  it('returns ok=false when the input is not an object', () => {
    expect(validateAlertClassification(null).ok).toBe(false)
    expect(validateAlertClassification('string').ok).toBe(false)
    expect(validateAlertClassification(42).ok).toBe(false)
  })

  it('reports an error for an invalid topic_slug', () => {
    const { ok, errors } = validateAlertClassification({ ...VALID_ALERT_CLASSIFICATION, topic_slug: 'sports' })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('topic_slug'))).toBe(true)
  })

  it('reports an error when headline is too short', () => {
    const { ok, errors } = validateAlertClassification({ ...VALID_ALERT_CLASSIFICATION, headline: 'Short' })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('headline'))).toBe(true)
  })

  it('reports an error when headline is too long', () => {
    const { ok, errors } = validateAlertClassification({ ...VALID_ALERT_CLASSIFICATION, headline: 'A'.repeat(251) })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('headline'))).toBe(true)
  })

  it('reports an error when summary_text is too short', () => {
    const { ok, errors } = validateAlertClassification({ ...VALID_ALERT_CLASSIFICATION, summary_text: 'Too short.' })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('summary_text'))).toBe(true)
  })

  it('reports an error when severity_score is out of range', () => {
    const { ok, errors } = validateAlertClassification({ ...VALID_ALERT_CLASSIFICATION, severity_score: 150 })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('severity_score'))).toBe(true)
  })

  it('reports an error when severity_score is negative', () => {
    const { ok, errors } = validateAlertClassification({ ...VALID_ALERT_CLASSIFICATION, severity_score: -1 })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('severity_score'))).toBe(true)
  })

  it('reports an error when importance_score is not a number', () => {
    const { ok, errors } = validateAlertClassification({ ...VALID_ALERT_CLASSIFICATION, importance_score: '88' })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('importance_score'))).toBe(true)
  })

  it('reports an error when confidence_score is a float', () => {
    const { ok, errors } = validateAlertClassification({ ...VALID_ALERT_CLASSIFICATION, confidence_score: 95.5 })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('confidence_score'))).toBe(true)
  })

  it('reports an error when send_alert is not a boolean', () => {
    const { ok, errors } = validateAlertClassification({ ...VALID_ALERT_CLASSIFICATION, send_alert: 1 })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('send_alert'))).toBe(true)
  })

  it('reports an error when cluster_label field is absent', () => {
    const obj = { ...VALID_ALERT_CLASSIFICATION }
    delete obj.cluster_label
    const { ok, errors } = validateAlertClassification(obj)
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('cluster_label'))).toBe(true)
  })

  it('accepts cluster_label as null', () => {
    const { ok } = validateAlertClassification({ ...VALID_ALERT_CLASSIFICATION, cluster_label: null })
    expect(ok).toBe(true)
  })

  it('accepts cluster_label as a string', () => {
    const { ok } = validateAlertClassification({ ...VALID_ALERT_CLASSIFICATION, cluster_label: 'Bitcoin rally' })
    expect(ok).toBe(true)
  })

  it('accepts all valid topic_slug values', () => {
    VALID_TOPICS.forEach(topic => {
      const { ok } = validateAlertClassification({ ...VALID_ALERT_CLASSIFICATION, topic_slug: topic })
      expect(ok).toBe(true)
    })
  })

  it('reports multiple errors when multiple fields are invalid', () => {
    const { ok, errors } = validateAlertClassification({
      ...VALID_ALERT_CLASSIFICATION,
      topic_slug: 'bad',
      severity_score: -5,
      send_alert: 'yes',
    })
    expect(ok).toBe(false)
    expect(errors.length).toBeGreaterThanOrEqual(3)
  })

  it('reports an error when cluster_label is a non-string non-null value', () => {
    const { ok, errors } = validateAlertClassification({ ...VALID_ALERT_CLASSIFICATION, cluster_label: 123 })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('cluster_label'))).toBe(true)
  })

  it('reports an error when cluster_label exceeds 100 characters', () => {
    const { ok, errors } = validateAlertClassification({ ...VALID_ALERT_CLASSIFICATION, cluster_label: 'A'.repeat(101) })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('cluster_label'))).toBe(true)
  })

  it('reports an error when secondary_topics contains an invalid topic', () => {
    const { ok, errors } = validateAlertClassification({ ...VALID_ALERT_CLASSIFICATION, secondary_topics: ['sports'] })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('secondary_topics'))).toBe(true)
  })

  it('reports an error when secondary_topics has more than 2 items', () => {
    const { ok, errors } = validateAlertClassification({ ...VALID_ALERT_CLASSIFICATION, secondary_topics: ['finance', 'economy', 'ai'] })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('secondary_topics'))).toBe(true)
  })

  it('reports an error when secondary_topics is not an array', () => {
    const { ok, errors } = validateAlertClassification({ ...VALID_ALERT_CLASSIFICATION, secondary_topics: 'finance' })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('secondary_topics'))).toBe(true)
  })

  it('accepts secondary_topics as an empty array', () => {
    const { ok } = validateAlertClassification({ ...VALID_ALERT_CLASSIFICATION, secondary_topics: [] })
    expect(ok).toBe(true)
  })

  it('accepts secondary_topics with two valid topics', () => {
    const { ok } = validateAlertClassification({ ...VALID_ALERT_CLASSIFICATION, secondary_topics: ['finance', 'economy'] })
    expect(ok).toBe(true)
  })

  it('accepts a valid object without secondary_topics field', () => {
    const obj = { ...VALID_ALERT_CLASSIFICATION }
    delete obj.secondary_topics
    const { ok } = validateAlertClassification(obj)
    expect(ok).toBe(true)
  })

  it('accepts a valid object with supporting_sources as null', () => {
    const { ok } = validateAlertClassification({ ...VALID_ALERT_CLASSIFICATION, supporting_sources: null })
    expect(ok).toBe(true)
  })

  it('accepts a valid object without supporting_sources field', () => {
    const obj = { ...VALID_ALERT_CLASSIFICATION }
    delete obj.supporting_sources
    const { ok } = validateAlertClassification(obj)
    expect(ok).toBe(true)
  })

  it('accepts a valid supporting_sources array', () => {
    const { ok } = validateAlertClassification({
      ...VALID_ALERT_CLASSIFICATION,
      supporting_sources: [
        { source_name: 'CoinGecko API', source_url: 'https://api.coingecko.com', source_type: 'api', source_role: 'data' }
      ]
    })
    expect(ok).toBe(true)
  })

  it('accepts a supporting_sources entry with null source_url and source_role', () => {
    const { ok } = validateAlertClassification({
      ...VALID_ALERT_CLASSIFICATION,
      supporting_sources: [{ source_name: 'Reuters', source_url: null, source_type: 'rss', source_role: null }]
    })
    expect(ok).toBe(true)
  })

  it('rejects supporting_sources when it is not an array and not null', () => {
    const { ok, errors } = validateAlertClassification({ ...VALID_ALERT_CLASSIFICATION, supporting_sources: 'bad' })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('supporting_sources'))).toBe(true)
  })

  it('rejects supporting_sources with more than 5 items', () => {
    const ss = Array.from({ length: 6 }, (_, i) => ({ source_name: `Source ${i}` }))
    const { ok, errors } = validateAlertClassification({ ...VALID_ALERT_CLASSIFICATION, supporting_sources: ss })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('supporting_sources'))).toBe(true)
  })

  it('rejects a supporting_sources entry with a missing source_name', () => {
    const { ok, errors } = validateAlertClassification({
      ...VALID_ALERT_CLASSIFICATION,
      supporting_sources: [{ source_type: 'rss' }]
    })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('source_name'))).toBe(true)
  })

  it('rejects a supporting_sources entry with an invalid source_role', () => {
    const { ok, errors } = validateAlertClassification({
      ...VALID_ALERT_CLASSIFICATION,
      supporting_sources: [{ source_name: 'Test', source_role: 'unknown-role' }]
    })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('source_role'))).toBe(true)
  })

  it('accepts all valid source_role values', () => {
    for (const role of ['confirmation', 'data', 'commentary', 'official']) {
      const { ok } = validateAlertClassification({
        ...VALID_ALERT_CLASSIFICATION,
        supporting_sources: [{ source_name: 'Test', source_role: role }]
      })
      expect(ok).toBe(true)
    }
  })

  it('rejects a supporting_sources entry with a non-http source_url', () => {
    const { ok, errors } = validateAlertClassification({
      ...VALID_ALERT_CLASSIFICATION,
      supporting_sources: [{ source_name: 'Test', source_url: 'ftp://example.com/data' }]
    })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('source_url'))).toBe(true)
  })

  it('rejects a supporting_sources entry with a plain-string source_url', () => {
    const { ok, errors } = validateAlertClassification({
      ...VALID_ALERT_CLASSIFICATION,
      supporting_sources: [{ source_name: 'Test', source_url: 'not-a-url' }]
    })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('source_url'))).toBe(true)
  })

  it('accepts a supporting_sources entry with a valid https source_url', () => {
    const { ok } = validateAlertClassification({
      ...VALID_ALERT_CLASSIFICATION,
      supporting_sources: [{ source_name: 'CoinGecko', source_url: 'https://api.coingecko.com' }]
    })
    expect(ok).toBe(true)
  })

  it('rejects a supporting_sources entry with an invalid source_type', () => {
    const { ok, errors } = validateAlertClassification({
      ...VALID_ALERT_CLASSIFICATION,
      supporting_sources: [{ source_name: 'Test', source_type: 'bad-type' }]
    })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('source_type'))).toBe(true)
  })

  it('accepts all valid source_type values', () => {
    for (const type of ['rss', 'api', 'social', 'webhook', 'x_account', 'x_query']) {
      const { ok } = validateAlertClassification({
        ...VALID_ALERT_CLASSIFICATION,
        supporting_sources: [{ source_name: 'Test', source_type: type }]
      })
      expect(ok).toBe(true)
    }
  })

  it('accepts a supporting_sources entry with null source_type', () => {
    const { ok } = validateAlertClassification({
      ...VALID_ALERT_CLASSIFICATION,
      supporting_sources: [{ source_name: 'Test', source_type: null }]
    })
    expect(ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// validateTimelineEntry
// ---------------------------------------------------------------------------

describe('validateTimelineEntry', () => {
  it('returns ok=true for a valid object', () => {
    const { ok, errors } = validateTimelineEntry(VALID_TIMELINE_ENTRY)
    expect(ok).toBe(true)
    expect(errors).toHaveLength(0)
  })

  it('returns ok=false when the input is not an object', () => {
    expect(validateTimelineEntry(null).ok).toBe(false)
  })

  it('reports an error when headline is too short', () => {
    const { ok, errors } = validateTimelineEntry({ ...VALID_TIMELINE_ENTRY, headline: 'Too short' })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('headline'))).toBe(true)
  })

  it('reports an error when headline exceeds 150 characters', () => {
    const { ok, errors } = validateTimelineEntry({ ...VALID_TIMELINE_ENTRY, headline: 'A'.repeat(151) })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('headline'))).toBe(true)
  })

  it('reports an error when summary_text is too short', () => {
    const { ok, errors } = validateTimelineEntry({ ...VALID_TIMELINE_ENTRY, summary_text: 'Too short.' })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('summary_text'))).toBe(true)
  })

  it('reports an error when severity_level is invalid', () => {
    const { ok, errors } = validateTimelineEntry({ ...VALID_TIMELINE_ENTRY, severity_level: 'extreme' })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('severity_level'))).toBe(true)
  })

  it('accepts all valid severity_level values', () => {
    VALID_SEVERITY_LEVELS.forEach(level => {
      const { ok } = validateTimelineEntry({ ...VALID_TIMELINE_ENTRY, severity_level: level })
      expect(ok).toBe(true)
    })
  })

  it('reports an error when label is too short', () => {
    const { ok, errors } = validateTimelineEntry({ ...VALID_TIMELINE_ENTRY, label: 'A' })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('label'))).toBe(true)
  })

  it('reports an error when label_color is not a valid enum value', () => {
    const { ok, errors } = validateTimelineEntry({ ...VALID_TIMELINE_ENTRY, label_color: 'pink' })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('label_color'))).toBe(true)
  })

  it('accepts label_color as null', () => {
    const { ok } = validateTimelineEntry({ ...VALID_TIMELINE_ENTRY, label_color: null })
    expect(ok).toBe(true)
  })

  it('accepts a valid object without optional fields', () => {
    const minimal = {
      headline: 'Bitcoin Breaks $120K All-Time High',
      summary_text: 'Bitcoin surged past $120,000 for the first time, driven by record institutional ETF inflows.',
      severity_level: 'high',
      label: 'Price Action',
    }
    const { ok } = validateTimelineEntry(minimal)
    expect(ok).toBe(true)
  })

  it('reports an error when source_url uses a non-HTTP scheme', () => {
    const { ok, errors } = validateTimelineEntry({ ...VALID_TIMELINE_ENTRY, source_url: 'ftp://example.com/file' })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('source_url'))).toBe(true)
  })

  it('reports an error when source_url is a plain string without a scheme', () => {
    const { ok, errors } = validateTimelineEntry({ ...VALID_TIMELINE_ENTRY, source_url: 'example.com/path' })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('source_url'))).toBe(true)
  })

  it('accepts source_url as null', () => {
    const { ok } = validateTimelineEntry({ ...VALID_TIMELINE_ENTRY, source_url: null })
    expect(ok).toBe(true)
  })

  it('accepts source_url as a valid HTTPS URL', () => {
    const { ok } = validateTimelineEntry({ ...VALID_TIMELINE_ENTRY, source_url: 'https://example.com/article' })
    expect(ok).toBe(true)
  })

  it('reports an error when source_attribution exceeds 100 characters', () => {
    const { ok, errors } = validateTimelineEntry({ ...VALID_TIMELINE_ENTRY, source_attribution: 'via '.repeat(26) })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('source_attribution'))).toBe(true)
  })

  it('accepts source_attribution as null', () => {
    const { ok } = validateTimelineEntry({ ...VALID_TIMELINE_ENTRY, source_attribution: null })
    expect(ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// validateDailySummary
// ---------------------------------------------------------------------------

describe('validateDailySummary', () => {
  it('returns ok=true for a valid object', () => {
    const { ok, errors } = validateDailySummary(VALID_DAILY_SUMMARY)
    expect(ok).toBe(true)
    expect(errors).toHaveLength(0)
  })

  it('returns ok=false when the input is not an object', () => {
    expect(validateDailySummary(null).ok).toBe(false)
  })

  it('reports an error when headline is too short', () => {
    const { ok, errors } = validateDailySummary({ ...VALID_DAILY_SUMMARY, headline: 'Short' })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('headline'))).toBe(true)
  })

  it('reports an error when overview is too short', () => {
    const { ok, errors } = validateDailySummary({ ...VALID_DAILY_SUMMARY, overview: 'Too short.' })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('overview'))).toBe(true)
  })

  it('reports an error when key_events is empty', () => {
    const { ok, errors } = validateDailySummary({ ...VALID_DAILY_SUMMARY, key_events: [] })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('key_events'))).toBe(true)
  })

  it('reports an error when key_events is not an array', () => {
    const { ok, errors } = validateDailySummary({ ...VALID_DAILY_SUMMARY, key_events: null })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('key_events'))).toBe(true)
  })

  it('reports an error when key_events has more than 7 items', () => {
    const manyEvents = Array.from({ length: 8 }, (_, i) => ({
      title: `Event ${i + 1} with a title`,
      significance: 'This event matters because of its broad market implications and investor interest.',
      importance_score: 50,
    }))
    const { ok, errors } = validateDailySummary({ ...VALID_DAILY_SUMMARY, key_events: manyEvents })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('key_events'))).toBe(true)
  })

  it('reports an error when a key_event is missing title', () => {
    const events = [{ title: '', significance: 'This is significant enough for a two-sentence explanation.', importance_score: 50 }]
    const { ok, errors } = validateDailySummary({ ...VALID_DAILY_SUMMARY, key_events: events })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('key_events[0].title'))).toBe(true)
  })

  it('reports an error when a key_event importance_score is out of range', () => {
    const events = [{ title: 'Valid title', significance: 'This is significant enough for a two-sentence explanation.', importance_score: 150 }]
    const { ok, errors } = validateDailySummary({ ...VALID_DAILY_SUMMARY, key_events: events })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('key_events[0].importance_score'))).toBe(true)
  })

  it('reports an error when sentiment is invalid', () => {
    const { ok, errors } = validateDailySummary({ ...VALID_DAILY_SUMMARY, sentiment: 'positive' })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('sentiment'))).toBe(true)
  })

  it('accepts all valid sentiment values', () => {
    VALID_SENTIMENTS.forEach(s => {
      const { ok } = validateDailySummary({ ...VALID_DAILY_SUMMARY, sentiment: s })
      expect(ok).toBe(true)
    })
  })

  it('reports an error when topic_score is out of range', () => {
    const { ok, errors } = validateDailySummary({ ...VALID_DAILY_SUMMARY, topic_score: 101 })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('topic_score'))).toBe(true)
  })

  it('reports an error when topic_score is a float', () => {
    const { ok, errors } = validateDailySummary({ ...VALID_DAILY_SUMMARY, topic_score: 92.5 })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('topic_score'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// validateExpectationCheck
// ---------------------------------------------------------------------------

describe('validateExpectationCheck', () => {
  it('returns ok=true for a valid object', () => {
    const { ok, errors } = validateExpectationCheck(VALID_EXPECTATION_CHECK)
    expect(ok).toBe(true)
    expect(errors).toHaveLength(0)
  })

  it('returns ok=false when the input is not an object', () => {
    expect(validateExpectationCheck(null).ok).toBe(false)
  })

  it('accepts an empty expectations_checked array', () => {
    const { ok } = validateExpectationCheck({ ...VALID_EXPECTATION_CHECK, expectations_checked: [] })
    expect(ok).toBe(true)
  })

  it('reports an error when expectations_checked is not an array', () => {
    const { ok, errors } = validateExpectationCheck({ ...VALID_EXPECTATION_CHECK, expectations_checked: null })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('expectations_checked'))).toBe(true)
  })

  it('reports an error when an expectation text is too short', () => {
    const check = {
      ...VALID_EXPECTATION_CHECK,
      expectations_checked: [{ expectation: 'Short', outcome: 'met', note: null }],
    }
    const { ok, errors } = validateExpectationCheck(check)
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('expectations_checked[0].expectation'))).toBe(true)
  })

  it('reports an error when outcome is not a valid enum', () => {
    const check = {
      ...VALID_EXPECTATION_CHECK,
      expectations_checked: [{ expectation: 'Bitcoin would test resistance near $115K', outcome: 'unknown', note: null }],
    }
    const { ok, errors } = validateExpectationCheck(check)
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('outcome'))).toBe(true)
  })

  it('accepts all valid outcome values', () => {
    VALID_EXPECTATION_OUTCOMES.forEach(outcome => {
      const check = {
        ...VALID_EXPECTATION_CHECK,
        expectations_checked: [{ expectation: 'Bitcoin would test resistance near $115K', outcome, note: null }],
      }
      const { ok } = validateExpectationCheck(check)
      expect(ok).toBe(true)
    })
  })

  it('reports an error when surprise_events is not an array', () => {
    const { ok, errors } = validateExpectationCheck({ ...VALID_EXPECTATION_CHECK, surprise_events: 'none' })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('surprise_events'))).toBe(true)
  })

  it('accepts an empty surprise_events array', () => {
    const { ok } = validateExpectationCheck({ ...VALID_EXPECTATION_CHECK, surprise_events: [] })
    expect(ok).toBe(true)
  })

  it('reports an error when alignment_score is out of range', () => {
    const { ok, errors } = validateExpectationCheck({ ...VALID_EXPECTATION_CHECK, alignment_score: 101 })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('alignment_score'))).toBe(true)
  })

  it('reports an error when alignment_score is not a number', () => {
    const { ok, errors } = validateExpectationCheck({ ...VALID_EXPECTATION_CHECK, alignment_score: '65' })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('alignment_score'))).toBe(true)
  })

  it('reports an error when expectations_checked has more than 5 items', () => {
    const many = Array.from({ length: 6 }, () => ({
      expectation: 'Bitcoin would test resistance near $115K before moving higher',
      outcome: 'met',
      note: null,
    }))
    const { ok, errors } = validateExpectationCheck({ ...VALID_EXPECTATION_CHECK, expectations_checked: many })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('expectations_checked'))).toBe(true)
  })

  it('reports an error when surprise_events has more than 5 items', () => {
    const many = Array.from({ length: 6 }, () => 'An unexpected event occurred today in the market.')
    const { ok, errors } = validateExpectationCheck({ ...VALID_EXPECTATION_CHECK, surprise_events: many })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('surprise_events'))).toBe(true)
  })

  it('reports an error when a surprise_events item is too short', () => {
    const { ok, errors } = validateExpectationCheck({ ...VALID_EXPECTATION_CHECK, surprise_events: ['Short.'] })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('surprise_events[0]'))).toBe(true)
  })

  it('reports an error when a surprise_events item exceeds 200 characters', () => {
    const { ok, errors } = validateExpectationCheck({ ...VALID_EXPECTATION_CHECK, surprise_events: ['A'.repeat(201)] })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('surprise_events[0]'))).toBe(true)
  })

  it('accepts expectations_checked with a valid source object', () => {
    const check = {
      ...VALID_EXPECTATION_CHECK,
      expectations_checked: [
        {
          expectation: 'Bitcoin would test resistance near $115K before moving higher',
          outcome: 'missed',
          note: null,
          source: { source_name: 'CoinDesk RSS', source_url: 'https://www.coindesk.com/markets/test' },
        },
      ],
    }
    const { ok } = validateExpectationCheck(check)
    expect(ok).toBe(true)
  })

  it('accepts expectations_checked with source as null', () => {
    const check = {
      ...VALID_EXPECTATION_CHECK,
      expectations_checked: [
        {
          expectation: 'Bitcoin would test resistance near $115K before moving higher',
          outcome: 'missed',
          note: null,
          source: null,
        },
      ],
    }
    const { ok } = validateExpectationCheck(check)
    expect(ok).toBe(true)
  })

  it('reports an error when expectations_checked[].source.source_name is empty', () => {
    const check = {
      ...VALID_EXPECTATION_CHECK,
      expectations_checked: [
        {
          expectation: 'Bitcoin would test resistance near $115K before moving higher',
          outcome: 'missed',
          note: null,
          source: { source_name: '', source_url: null },
        },
      ],
    }
    const { ok, errors } = validateExpectationCheck(check)
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('source.source_name'))).toBe(true)
  })

  it('reports an error when expectations_checked[].source.source_url is not a valid URL', () => {
    const check = {
      ...VALID_EXPECTATION_CHECK,
      expectations_checked: [
        {
          expectation: 'Bitcoin would test resistance near $115K before moving higher',
          outcome: 'missed',
          note: null,
          source: { source_name: 'CoinDesk', source_url: 'not-a-url' },
        },
      ],
    }
    const { ok, errors } = validateExpectationCheck(check)
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('source.source_url'))).toBe(true)
  })

  it('accepts expectations_checked[].source.source_url as null', () => {
    const check = {
      ...VALID_EXPECTATION_CHECK,
      expectations_checked: [
        {
          expectation: 'Bitcoin would test resistance near $115K before moving higher',
          outcome: 'missed',
          note: null,
          source: { source_name: 'CoinDesk', source_url: null },
        },
      ],
    }
    const { ok } = validateExpectationCheck(check)
    expect(ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// validateTomorrowOutlook
// ---------------------------------------------------------------------------

describe('validateTomorrowOutlook', () => {
  it('returns ok=true for a valid object', () => {
    const { ok, errors } = validateTomorrowOutlook(VALID_TOMORROW_OUTLOOK)
    expect(ok).toBe(true)
    expect(errors).toHaveLength(0)
  })

  it('returns ok=false when the input is not an object', () => {
    expect(validateTomorrowOutlook(null).ok).toBe(false)
  })

  it('reports an error when key_watchpoints is empty', () => {
    const { ok, errors } = validateTomorrowOutlook({ ...VALID_TOMORROW_OUTLOOK, key_watchpoints: [] })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('key_watchpoints'))).toBe(true)
  })

  it('reports an error when key_watchpoints has more than 5 items', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({
      title: `Watchpoint ${i + 1}`,
      description: 'This is an important watchpoint that could move the market in either direction.',
    }))
    const { ok, errors } = validateTomorrowOutlook({ ...VALID_TOMORROW_OUTLOOK, key_watchpoints: many })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('key_watchpoints'))).toBe(true)
  })

  it('reports an error when a watchpoint title is too short', () => {
    const bad = [{ title: 'BTc', description: 'This is a valid description for the watchpoint.' }]
    const { ok, errors } = validateTomorrowOutlook({ ...VALID_TOMORROW_OUTLOOK, key_watchpoints: bad })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('key_watchpoints[0].title'))).toBe(true)
  })

  it('reports an error when a watchpoint description is too short', () => {
    const bad = [{ title: 'Bitcoin $120K Support Hold', description: 'Short.' }]
    const { ok, errors } = validateTomorrowOutlook({ ...VALID_TOMORROW_OUTLOOK, key_watchpoints: bad })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('key_watchpoints[0].description'))).toBe(true)
  })

  it('accepts an empty scheduled_events array', () => {
    const { ok } = validateTomorrowOutlook({ ...VALID_TOMORROW_OUTLOOK, scheduled_events: [] })
    expect(ok).toBe(true)
  })

  it('reports an error when scheduled_events is not an array', () => {
    const { ok, errors } = validateTomorrowOutlook({ ...VALID_TOMORROW_OUTLOOK, scheduled_events: null })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('scheduled_events'))).toBe(true)
  })

  it('reports an error when a scheduled event impact is invalid', () => {
    const bad = [{ title: 'US CPI Release', impact: 'critical' }]
    const { ok, errors } = validateTomorrowOutlook({ ...VALID_TOMORROW_OUTLOOK, scheduled_events: bad })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('scheduled_events[0].impact'))).toBe(true)
  })

  it('reports an error when outlook_summary is too short', () => {
    const { ok, errors } = validateTomorrowOutlook({ ...VALID_TOMORROW_OUTLOOK, outlook_summary: 'Too short.' })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('outlook_summary'))).toBe(true)
  })

  it('reports an error when risk_level is invalid', () => {
    const { ok, errors } = validateTomorrowOutlook({ ...VALID_TOMORROW_OUTLOOK, risk_level: 'extreme' })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('risk_level'))).toBe(true)
  })

  it('accepts all valid risk_level values', () => {
    VALID_RISK_LEVELS.forEach(level => {
      const { ok } = validateTomorrowOutlook({ ...VALID_TOMORROW_OUTLOOK, risk_level: level })
      expect(ok).toBe(true)
    })
  })

  it('reports an error when scheduled_events has more than 5 items', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({
      title: `Scheduled Event ${i + 1}`,
      impact: 'medium',
    }))
    const { ok, errors } = validateTomorrowOutlook({ ...VALID_TOMORROW_OUTLOOK, scheduled_events: many })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('scheduled_events'))).toBe(true)
  })

  it('reports an error when time_hint exceeds 50 characters', () => {
    const bad = [{ title: 'FOMC Meeting Minutes Release', impact: 'high', time_hint: 'A'.repeat(51) }]
    const { ok, errors } = validateTomorrowOutlook({ ...VALID_TOMORROW_OUTLOOK, scheduled_events: bad })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('time_hint'))).toBe(true)
  })

  it('accepts time_hint as null', () => {
    const event = [{ title: 'FOMC Meeting Minutes Release', impact: 'high', time_hint: null }]
    const { ok } = validateTomorrowOutlook({ ...VALID_TOMORROW_OUTLOOK, scheduled_events: event })
    expect(ok).toBe(true)
  })

  it('accepts a scheduled event without a time_hint field', () => {
    const event = [{ title: 'FOMC Meeting Minutes Release', impact: 'high' }]
    const { ok } = validateTomorrowOutlook({ ...VALID_TOMORROW_OUTLOOK, scheduled_events: event })
    expect(ok).toBe(true)
  })

  it('accepts key_watchpoints with a valid source object', () => {
    const watchpoints = [
      {
        title: 'Bitcoin $120K Support Hold',
        description: 'After breaking above $120K, holding this level as support is critical for continued momentum.',
        source: { source_name: 'CoinDesk RSS', source_url: 'https://www.coindesk.com/markets/test' },
      },
    ]
    const { ok } = validateTomorrowOutlook({ ...VALID_TOMORROW_OUTLOOK, key_watchpoints: watchpoints })
    expect(ok).toBe(true)
  })

  it('accepts key_watchpoints with source as null', () => {
    const watchpoints = [
      {
        title: 'Bitcoin $120K Support Hold',
        description: 'After breaking above $120K, holding this level as support is critical for continued momentum.',
        source: null,
      },
    ]
    const { ok } = validateTomorrowOutlook({ ...VALID_TOMORROW_OUTLOOK, key_watchpoints: watchpoints })
    expect(ok).toBe(true)
  })

  it('reports an error when key_watchpoints[].source.source_name is empty', () => {
    const watchpoints = [
      {
        title: 'Bitcoin $120K Support Hold',
        description: 'After breaking above $120K, holding this level as support is critical for continued momentum.',
        source: { source_name: '', source_url: null },
      },
    ]
    const { ok, errors } = validateTomorrowOutlook({ ...VALID_TOMORROW_OUTLOOK, key_watchpoints: watchpoints })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('key_watchpoints[0].source.source_name'))).toBe(true)
  })

  it('reports an error when key_watchpoints[].source.source_url is not a valid URL', () => {
    const watchpoints = [
      {
        title: 'Bitcoin $120K Support Hold',
        description: 'After breaking above $120K, holding this level as support is critical for continued momentum.',
        source: { source_name: 'CoinDesk', source_url: 'ftp://invalid' },
      },
    ]
    const { ok, errors } = validateTomorrowOutlook({ ...VALID_TOMORROW_OUTLOOK, key_watchpoints: watchpoints })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('key_watchpoints[0].source.source_url'))).toBe(true)
  })

  it('accepts scheduled_events with a valid source object', () => {
    const events = [
      {
        title: 'FOMC Meeting Minutes Release',
        impact: 'high',
        time_hint: '14:00 ET',
        source: { source_name: 'Federal Reserve', source_url: 'https://www.federalreserve.gov/' },
      },
    ]
    const { ok } = validateTomorrowOutlook({ ...VALID_TOMORROW_OUTLOOK, scheduled_events: events })
    expect(ok).toBe(true)
  })

  it('accepts scheduled_events with source as null', () => {
    const events = [{ title: 'FOMC Meeting Minutes Release', impact: 'high', source: null }]
    const { ok } = validateTomorrowOutlook({ ...VALID_TOMORROW_OUTLOOK, scheduled_events: events })
    expect(ok).toBe(true)
  })

  it('reports an error when scheduled_events[].source.source_name is empty', () => {
    const events = [
      { title: 'FOMC Meeting Minutes Release', impact: 'high', source: { source_name: '', source_url: null } },
    ]
    const { ok, errors } = validateTomorrowOutlook({ ...VALID_TOMORROW_OUTLOOK, scheduled_events: events })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('scheduled_events[0].source.source_name'))).toBe(true)
  })

  it('reports an error when scheduled_events[].source.source_url is not a valid URL', () => {
    const events = [
      { title: 'FOMC Meeting Minutes Release', impact: 'high', source: { source_name: 'Fed', source_url: 'not-a-url' } },
    ]
    const { ok, errors } = validateTomorrowOutlook({ ...VALID_TOMORROW_OUTLOOK, scheduled_events: events })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('scheduled_events[0].source.source_url'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// validateVideoScript
// ---------------------------------------------------------------------------

describe('validateVideoScript', () => {
  it('returns ok=true for a valid object', () => {
    const { ok, errors } = validateVideoScript(VALID_VIDEO_SCRIPT)
    expect(ok).toBe(true)
    expect(errors).toHaveLength(0)
  })

  it('returns ok=false when the input is not an object', () => {
    expect(validateVideoScript(null).ok).toBe(false)
  })

  it('reports an error when intro is too short', () => {
    const { ok, errors } = validateVideoScript({ ...VALID_VIDEO_SCRIPT, intro: 'Short.' })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('intro'))).toBe(true)
  })

  it('reports an error when segments array has only one item', () => {
    const { ok, errors } = validateVideoScript({ ...VALID_VIDEO_SCRIPT, segments: [VALID_VIDEO_SCRIPT.segments[0]] })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('segments'))).toBe(true)
  })

  it('reports an error when segments has more than 5 items', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({
      title: `Segment ${i + 1}`,
      script: 'This is the spoken script for this segment. It provides good context for the viewer and covers the most important aspect of the event in detail.',
      duration_seconds: 30,
      sources: null,
    }))
    const { ok, errors } = validateVideoScript({ ...VALID_VIDEO_SCRIPT, segments: many })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('segments'))).toBe(true)
  })

  it('reports an error when a segment title is too short', () => {
    const bad = [
      { title: 'AB', script: 'This is the spoken script for this segment. It provides good context for the viewer and covers the most important aspect of the event in detail.', duration_seconds: 30, sources: null },
      VALID_VIDEO_SCRIPT.segments[1],
    ]
    const { ok, errors } = validateVideoScript({ ...VALID_VIDEO_SCRIPT, segments: bad })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('segments[0].title'))).toBe(true)
  })

  it('reports an error when a segment script is too short', () => {
    const bad = [
      { title: 'Valid Title', script: 'Short.', duration_seconds: 30, sources: null },
      VALID_VIDEO_SCRIPT.segments[1],
    ]
    const { ok, errors } = validateVideoScript({ ...VALID_VIDEO_SCRIPT, segments: bad })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('segments[0].script'))).toBe(true)
  })

  it('reports an error when a segment duration_seconds is out of range', () => {
    const bad = [
      { title: 'Valid Title Here', script: 'This is the spoken script for this segment. It provides good context for the viewer.', duration_seconds: 200, sources: null },
      VALID_VIDEO_SCRIPT.segments[1],
    ]
    const { ok, errors } = validateVideoScript({ ...VALID_VIDEO_SCRIPT, segments: bad })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('segments[0].duration_seconds'))).toBe(true)
  })

  it('reports an error when outro is too short', () => {
    const { ok, errors } = validateVideoScript({ ...VALID_VIDEO_SCRIPT, outro: 'Short.' })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('outro'))).toBe(true)
  })

  it('reports an error when total_duration_seconds is out of range', () => {
    const { ok, errors } = validateVideoScript({ ...VALID_VIDEO_SCRIPT, total_duration_seconds: 700 })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('total_duration_seconds'))).toBe(true)
  })

  it('reports an error when total_duration_seconds is below minimum', () => {
    const { ok, errors } = validateVideoScript({ ...VALID_VIDEO_SCRIPT, total_duration_seconds: 30 })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('total_duration_seconds'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// validateYoutubeMetadata
// ---------------------------------------------------------------------------

describe('validateYoutubeMetadata', () => {
  it('returns ok=true for a valid object', () => {
    const { ok, errors } = validateYoutubeMetadata(VALID_YOUTUBE_METADATA)
    expect(ok).toBe(true)
    expect(errors).toHaveLength(0)
  })

  it('returns ok=false when the input is not an object', () => {
    expect(validateYoutubeMetadata(null).ok).toBe(false)
  })

  it('reports an error when title is too short', () => {
    const { ok, errors } = validateYoutubeMetadata({ ...VALID_YOUTUBE_METADATA, title: 'Short' })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('title'))).toBe(true)
  })

  it('reports an error when title exceeds 100 characters', () => {
    const { ok, errors } = validateYoutubeMetadata({ ...VALID_YOUTUBE_METADATA, title: 'A'.repeat(101) })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('title'))).toBe(true)
  })

  it('reports an error when description is too short', () => {
    const { ok, errors } = validateYoutubeMetadata({ ...VALID_YOUTUBE_METADATA, description: 'Too short.' })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('description'))).toBe(true)
  })

  it('reports an error when tags has fewer than 5 items', () => {
    const { ok, errors } = validateYoutubeMetadata({ ...VALID_YOUTUBE_METADATA, tags: ['crypto', 'bitcoin'] })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('tags'))).toBe(true)
  })

  it('reports an error when tags has more than 15 items', () => {
    const many = Array.from({ length: 16 }, (_, i) => `tag${i}`)
    const { ok, errors } = validateYoutubeMetadata({ ...VALID_YOUTUBE_METADATA, tags: many })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('tags'))).toBe(true)
  })

  it('reports an error when a tag is too short', () => {
    const tags = ['a', 'bitcoin', 'crypto', 'finance', 'markets']
    const { ok, errors } = validateYoutubeMetadata({ ...VALID_YOUTUBE_METADATA, tags })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('tags[0]'))).toBe(true)
  })

  it('reports an error when visibility is invalid', () => {
    const { ok, errors } = validateYoutubeMetadata({ ...VALID_YOUTUBE_METADATA, visibility: 'hidden' })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('visibility'))).toBe(true)
  })

  it('accepts all valid visibility values', () => {
    ['public', 'unlisted', 'private'].forEach(v => {
      const { ok } = validateYoutubeMetadata({ ...VALID_YOUTUBE_METADATA, visibility: v })
      expect(ok).toBe(true)
    })
  })

  it('accepts a valid object without optional visibility field', () => {
    const { visibility: _, ...noVis } = VALID_YOUTUBE_METADATA
    const { ok } = validateYoutubeMetadata(noVis)
    expect(ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// parseAndValidate* integration — success paths
// ---------------------------------------------------------------------------

describe('parseAndValidate* — success paths', () => {
  it('parseAndValidateAlertClassification returns parsed object on valid JSON string', () => {
    const result = parseAndValidateAlertClassification(JSON.stringify(VALID_ALERT_CLASSIFICATION))
    expect(result.topic_slug).toBe('crypto')
    expect(result.send_alert).toBe(true)
  })

  it('parseAndValidateTimelineEntry returns parsed object on valid JSON string', () => {
    const result = parseAndValidateTimelineEntry(JSON.stringify(VALID_TIMELINE_ENTRY))
    expect(result.severity_level).toBe('high')
  })

  it('parseAndValidateDailySummary returns parsed object on valid JSON string', () => {
    const result = parseAndValidateDailySummary(JSON.stringify(VALID_DAILY_SUMMARY))
    expect(result.sentiment).toBe('bullish')
  })

  it('parseAndValidateExpectationCheck returns parsed object on valid JSON string', () => {
    const result = parseAndValidateExpectationCheck(JSON.stringify(VALID_EXPECTATION_CHECK))
    expect(result.alignment_score).toBe(65)
  })

  it('parseAndValidateTomorrowOutlook returns parsed object on valid JSON string', () => {
    const result = parseAndValidateTomorrowOutlook(JSON.stringify(VALID_TOMORROW_OUTLOOK))
    expect(result.risk_level).toBe('medium')
  })

  it('parseAndValidateVideoScript returns parsed object on valid JSON string', () => {
    const result = parseAndValidateVideoScript(JSON.stringify(VALID_VIDEO_SCRIPT))
    expect(result.segments).toHaveLength(2)
  })

  it('parseAndValidateYoutubeMetadata returns parsed object on valid JSON string', () => {
    const result = parseAndValidateYoutubeMetadata(JSON.stringify(VALID_YOUTUBE_METADATA))
    expect(result.title).toContain('Bitcoin')
  })

  it('parseAndValidateAlertClassification handles JSON wrapped in code fences', () => {
    const raw = '```json\n' + JSON.stringify(VALID_ALERT_CLASSIFICATION) + '\n```'
    const result = parseAndValidateAlertClassification(raw)
    expect(result.topic_slug).toBe('crypto')
  })
})

// ---------------------------------------------------------------------------
// parseAndValidate* integration — failure paths
// ---------------------------------------------------------------------------

describe('parseAndValidate* — failure paths', () => {
  it('parseAndValidateAlertClassification throws AI_PARSE_ERROR on invalid JSON', () => {
    expect(() => parseAndValidateAlertClassification('not json')).toThrow('AI_PARSE_ERROR')
  })

  it('parseAndValidateAlertClassification throws AI_VALIDATION_ERROR on invalid output', () => {
    const bad = JSON.stringify({ ...VALID_ALERT_CLASSIFICATION, topic_slug: 'invalid' })
    expect(() => parseAndValidateAlertClassification(bad)).toThrow('AI_VALIDATION_ERROR')
  })

  it('parseAndValidateTimelineEntry throws AI_PARSE_ERROR on invalid JSON', () => {
    expect(() => parseAndValidateTimelineEntry('{bad')).toThrow('AI_PARSE_ERROR')
  })

  it('parseAndValidateTimelineEntry throws AI_VALIDATION_ERROR on missing required field', () => {
    const bad = JSON.stringify({ ...VALID_TIMELINE_ENTRY, severity_level: undefined })
    expect(() => parseAndValidateTimelineEntry(bad)).toThrow('AI_VALIDATION_ERROR')
  })

  it('parseAndValidateDailySummary throws AI_PARSE_ERROR on invalid JSON', () => {
    expect(() => parseAndValidateDailySummary('')).toThrow('AI_PARSE_ERROR')
  })

  it('parseAndValidateDailySummary throws AI_VALIDATION_ERROR when key_events is empty', () => {
    const bad = JSON.stringify({ ...VALID_DAILY_SUMMARY, key_events: [] })
    expect(() => parseAndValidateDailySummary(bad)).toThrow('AI_VALIDATION_ERROR')
  })

  it('parseAndValidateExpectationCheck throws AI_VALIDATION_ERROR on missing alignment_score', () => {
    const { alignment_score: _, ...noScore } = VALID_EXPECTATION_CHECK
    expect(() => parseAndValidateExpectationCheck(JSON.stringify(noScore))).toThrow('AI_VALIDATION_ERROR')
  })

  it('parseAndValidateTomorrowOutlook throws AI_VALIDATION_ERROR when key_watchpoints is empty', () => {
    const bad = JSON.stringify({ ...VALID_TOMORROW_OUTLOOK, key_watchpoints: [] })
    expect(() => parseAndValidateTomorrowOutlook(bad)).toThrow('AI_VALIDATION_ERROR')
  })

  it('parseAndValidateVideoScript throws AI_VALIDATION_ERROR when segments has only one item', () => {
    const bad = JSON.stringify({ ...VALID_VIDEO_SCRIPT, segments: [VALID_VIDEO_SCRIPT.segments[0]] })
    expect(() => parseAndValidateVideoScript(bad)).toThrow('AI_VALIDATION_ERROR')
  })

  it('parseAndValidateYoutubeMetadata throws AI_VALIDATION_ERROR when tags has fewer than 5 items', () => {
    const bad = JSON.stringify({ ...VALID_YOUTUBE_METADATA, tags: ['a', 'b'] })
    expect(() => parseAndValidateYoutubeMetadata(bad)).toThrow('AI_VALIDATION_ERROR')
  })

  it('AI_VALIDATION_ERROR message names the failing task', () => {
    const bad = JSON.stringify({ ...VALID_ALERT_CLASSIFICATION, topic_slug: 'invalid' })
    try {
      parseAndValidateAlertClassification(bad)
      expect.fail('Should have thrown')
    } catch (e) {
      expect(e.message).toContain('AI_VALIDATION_ERROR')
      expect(e.message).toContain('Alert classification')
    }
  })
})

// ---------------------------------------------------------------------------
// validateNarrationAsset
// ---------------------------------------------------------------------------

const VALID_NARRATION_ASSET_OPENAI = {
  provider: 'openai',
  model: 'gpt-4o-mini-tts',
  voice: 'alloy',
  format: 'b64_json',
  audio_encoding: 'mp3',
  audio_b64: 'SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjYwLjE2LjEwMAAAAAAAAAAAAAAA',
  char_count: 842,
  duration_seconds: null,
  generated_at: '2025-01-15T10:00:00.000Z',
  warning: null,
}

const VALID_NARRATION_ASSET_GOOGLE = {
  provider: 'google',
  model: 'en-US-Chirp3-HD-Aoede',
  voice: 'en-US-Chirp3-HD-Aoede',
  format: 'b64_json',
  audio_encoding: 'mp3',
  audio_b64: 'SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjYwLjE2LjEwMAAAAAAAAAAAAAAA',
  char_count: 934,
  duration_seconds: null,
  generated_at: '2025-01-15T10:00:00.000Z',
  warning: null,
}

describe('validateNarrationAsset', () => {
  it('returns ok=true for a valid OpenAI narration asset', () => {
    const { ok, errors } = validateNarrationAsset(VALID_NARRATION_ASSET_OPENAI)
    expect(ok).toBe(true)
    expect(errors).toEqual([])
  })

  it('returns ok=true for a valid Google narration asset', () => {
    const { ok, errors } = validateNarrationAsset(VALID_NARRATION_ASSET_GOOGLE)
    expect(ok).toBe(true)
    expect(errors).toEqual([])
  })

  it('returns ok=true when audio_b64 is null (failed generation with warning)', () => {
    const asset = { ...VALID_NARRATION_ASSET_OPENAI, audio_b64: null, warning: 'OpenAI TTS API error: upstream timeout' }
    const { ok } = validateNarrationAsset(asset)
    expect(ok).toBe(true)
  })

  it('returns ok=true when duration_seconds is a positive number', () => {
    const asset = { ...VALID_NARRATION_ASSET_OPENAI, duration_seconds: 62.4 }
    const { ok } = validateNarrationAsset(asset)
    expect(ok).toBe(true)
  })

  it('returns ok=false when input is not an object', () => {
    const { ok, errors } = validateNarrationAsset(null)
    expect(ok).toBe(false)
    expect(errors[0]).toMatch(/not an object/)
  })

  it('reports an error for an invalid provider', () => {
    const { ok, errors } = validateNarrationAsset({ ...VALID_NARRATION_ASSET_OPENAI, provider: 'anthropic' })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('provider'))).toBe(true)
  })

  it('reports an error when model is missing', () => {
    const { ok, errors } = validateNarrationAsset({ ...VALID_NARRATION_ASSET_OPENAI, model: '' })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('model'))).toBe(true)
  })

  it('reports an error when voice is missing', () => {
    const { ok, errors } = validateNarrationAsset({ ...VALID_NARRATION_ASSET_OPENAI, voice: '' })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('voice'))).toBe(true)
  })

  it('reports an error for an invalid format', () => {
    const { ok, errors } = validateNarrationAsset({ ...VALID_NARRATION_ASSET_OPENAI, format: 'url' })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('format'))).toBe(true)
  })

  it('reports an error for an invalid audio_encoding', () => {
    const { ok, errors } = validateNarrationAsset({ ...VALID_NARRATION_ASSET_OPENAI, audio_encoding: 'ogg' })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('audio_encoding'))).toBe(true)
  })

  it('accepts all valid audio_encoding values', () => {
    for (const enc of VALID_NARRATION_AUDIO_ENCODINGS) {
      const { ok } = validateNarrationAsset({ ...VALID_NARRATION_ASSET_OPENAI, audio_encoding: enc })
      expect(ok).toBe(true)
    }
  })

  it('reports an error when char_count is zero', () => {
    const { ok, errors } = validateNarrationAsset({ ...VALID_NARRATION_ASSET_OPENAI, char_count: 0 })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('char_count'))).toBe(true)
  })

  it('reports an error when char_count is not an integer', () => {
    const { ok, errors } = validateNarrationAsset({ ...VALID_NARRATION_ASSET_OPENAI, char_count: 1.5 })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('char_count'))).toBe(true)
  })

  it('reports an error when duration_seconds is negative', () => {
    const { ok, errors } = validateNarrationAsset({ ...VALID_NARRATION_ASSET_OPENAI, duration_seconds: -1 })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('duration_seconds'))).toBe(true)
  })

  it('reports an error when generated_at is missing', () => {
    const { ok, errors } = validateNarrationAsset({ ...VALID_NARRATION_ASSET_OPENAI, generated_at: '' })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('generated_at'))).toBe(true)
  })

  it('reports an error when warning exceeds 500 characters', () => {
    const { ok, errors } = validateNarrationAsset({ ...VALID_NARRATION_ASSET_OPENAI, warning: 'x'.repeat(501) })
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('warning'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// parseAndValidateNarrationAsset
// ---------------------------------------------------------------------------

describe('parseAndValidateNarrationAsset', () => {
  it('returns the validated object on a valid asset', () => {
    const result = parseAndValidateNarrationAsset(VALID_NARRATION_ASSET_OPENAI)
    expect(result).toBe(VALID_NARRATION_ASSET_OPENAI)
  })

  it('throws AI_VALIDATION_ERROR on an invalid asset', () => {
    expect(() => parseAndValidateNarrationAsset({ ...VALID_NARRATION_ASSET_OPENAI, provider: 'bad' }))
      .toThrow('AI_VALIDATION_ERROR')
  })

  it('throws AI_VALIDATION_ERROR when the input is null', () => {
    expect(() => parseAndValidateNarrationAsset(null)).toThrow('AI_VALIDATION_ERROR')
  })
})
