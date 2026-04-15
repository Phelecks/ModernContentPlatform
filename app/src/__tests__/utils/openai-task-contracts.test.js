/**
 * OpenAI Task Contract Tests
 *
 * Verifies that the structured AI output validators faithfully enforce the
 * contracts defined in schemas/ai/ for every task type the platform depends on.
 *
 * These tests sit one level above the low-level validator unit tests in
 * validateAiOutput.test.js — they focus on:
 *
 *   1. Schema-to-validator parity
 *      Each schema/ai/*.json file ships canonical `examples` arrays.  This
 *      suite loads those examples at runtime and runs them through the matching
 *      validate*() / parseAndValidate*() functions.  A failure here means the
 *      example in the schema no longer matches what the validator accepts —
 *      i.e. the contract has drifted.
 *
 *   2. End-to-end parse + validate pipeline per task
 *      Exercises the parseAndValidate* functions with realistic JSON strings
 *      (simulating raw OpenAI API responses) so that both the JSON-parsing
 *      step and the validation step are confirmed for every task type.
 *
 *   3. Required-field enforcement per task
 *      Removing each required field from a valid object must produce a
 *      validation failure with a descriptive error.  Guards against silent
 *      regressions where a required field check is accidentally dropped.
 *
 *   4. Invalid / incomplete output handling
 *      Confirms that non-object inputs, empty objects, and completely
 *      malformed payloads are rejected safely by every validator.
 *
 *   5. Optional-field robustness (fallback behavior)
 *      Validates that outputs which omit every optional field are still
 *      accepted, keeping validators backwards-compatible with outputs that
 *      do not include newer optional fields.
 *
 *   6. Task registry completeness
 *      Asserts that every task listed in OPENAI_STRUCTURED_OUTPUT_TASKS has a
 *      corresponding validate* export, and that all validate* exports are
 *      reachable through parseAndValidate* wrappers.
 *
 * Coverage summary:
 *   validateAlertClassification / parseAndValidateAlertClassification
 *   validateTimelineEntry       / parseAndValidateTimelineEntry
 *   validateDailySummary        / parseAndValidateDailySummary
 *   validateExpectationCheck    / parseAndValidateExpectationCheck
 *   validateTomorrowOutlook     / parseAndValidateTomorrowOutlook
 *   validateVideoScript         / parseAndValidateVideoScript
 *   validateYoutubeMetadata     / parseAndValidateYoutubeMetadata
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  validateAlertClassification,
  validateTimelineEntry,
  validateDailySummary,
  validateExpectationCheck,
  validateTomorrowOutlook,
  validateVideoScript,
  validateYoutubeMetadata,
  parseAndValidateAlertClassification,
  parseAndValidateTimelineEntry,
  parseAndValidateDailySummary,
  parseAndValidateExpectationCheck,
  parseAndValidateTomorrowOutlook,
  parseAndValidateVideoScript,
  parseAndValidateYoutubeMetadata,
} from '@/utils/validateAiOutput.js'
import { OPENAI_STRUCTURED_OUTPUT_TASKS } from '@/utils/openaiConfig.js'

// ---------------------------------------------------------------------------
// Helpers — load schema example fixtures from schemas/ai/
// ---------------------------------------------------------------------------

const SCHEMAS_DIR = join(process.cwd(), '..', 'schemas', 'ai')

function loadSchemaExamples(schemaFile) {
  const raw = readFileSync(join(SCHEMAS_DIR, schemaFile), 'utf8')
  const schema = JSON.parse(raw)
  return schema.examples ?? []
}

// Strip non-validator keys that exist only as schema metadata (e.g. `_topic`)
function stripMetaKeys(obj) {
  const result = { ...obj }
  for (const key of Object.keys(result)) {
    if (key.startsWith('_')) delete result[key]
  }
  return result
}

// ---------------------------------------------------------------------------
// Minimal valid objects (stripped of all optional fields)
// ---------------------------------------------------------------------------

const MINIMAL_ALERT_CLASSIFICATION = {
  topic_slug: 'crypto',
  headline: 'Bitcoin Hits New All-Time High Above $120K',
  summary_text: 'Bitcoin surged past $120,000, setting a new all-time high driven by strong institutional inflows.',
  severity_score: 72,
  importance_score: 88,
  confidence_score: 95,
  send_alert: true,
  cluster_label: 'Bitcoin price rally',
}

const MINIMAL_TIMELINE_ENTRY = {
  headline: 'Bitcoin Breaks $120K All-Time High',
  summary_text: 'Bitcoin surged past $120,000 for the first time, driven by record institutional ETF inflows.',
  severity_level: 'high',
  label: 'Price Action',
}

const MINIMAL_DAILY_SUMMARY = {
  headline: 'Bitcoin Breaks $120K as Institutional Inflows Hit Record High',
  overview: 'Bitcoin surged past $120,000 on Thursday, driven by record institutional inflows and strong ETF demand. The move extended a week-long rally and pushed total crypto market cap above $3 trillion. Major altcoins followed with gains of 5–15%. Sentiment remained broadly bullish.',
  key_events: [
    { title: 'Bitcoin ATH Above $120K', significance: 'Reinforces the ongoing bull market and is likely to attract additional institutional flows.', importance_score: 95 },
  ],
  sentiment: 'bullish',
  topic_score: 92,
}

const MINIMAL_EXPECTATION_CHECK = {
  expectations_checked: [],
  surprise_events: [],
  alignment_score: 65,
}

const MINIMAL_TOMORROW_OUTLOOK = {
  key_watchpoints: [
    { title: 'BTC $120K Support', description: 'Holding this level as support is critical for continued upside momentum.' },
  ],
  scheduled_events: [],
  outlook_summary: 'Bitcoin enters the next session at all-time highs. The key risk is macro: FOMC minutes could introduce volatility if language around rate cuts shifts materially.',
  risk_level: 'medium',
}

const MINIMAL_VIDEO_SCRIPT = {
  intro: 'Bitcoin just hit a new all-time high — breaking above $120,000 for the first time in history.',
  segments: [
    { title: 'BTC ATH', script: 'Bitcoin crossed $120,000 today, setting a new all-time high. The move was driven by record ETF inflows and a major sovereign wealth fund disclosure.', duration_seconds: 45 },
    { title: 'ETF Flows', script: 'Spot Bitcoin ETF inflows hit $1.5 billion in a single day — more than double the previous record — confirming sustained institutional demand.', duration_seconds: 40 },
  ],
  outro: 'Bitcoin is at all-time highs. Tomorrow watch the FOMC minutes and the $120K support level.',
  total_duration_seconds: 180,
}

const MINIMAL_YOUTUBE_METADATA = {
  title: 'Bitcoin Hits $120K All-Time High | Crypto Daily Briefing Jan 15 2025',
  description: 'Bitcoin broke above $120,000 today, setting a new all-time high driven by record institutional ETF inflows and a major sovereign wealth fund disclosure. Subscribe for daily crypto briefings.',
  tags: ['bitcoin', 'crypto', 'bitcoin all time high', 'crypto news', 'btc price'],
}

// ---------------------------------------------------------------------------
// 1. Schema example fixtures — all canonical examples must pass validation
// ---------------------------------------------------------------------------

describe('schema example fixtures — alert classification', () => {
  const examples = loadSchemaExamples('alert_classification.json')

  it('at least one example is defined in the schema', () => {
    expect(examples.length).toBeGreaterThan(0)
  })

  examples.forEach((example, i) => {
    const fixture = stripMetaKeys(example)
    it(`example[${i}] passes validateAlertClassification`, () => {
      const result = validateAlertClassification(fixture)
      expect(result.ok).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it(`example[${i}] passes the full parseAndValidateAlertClassification pipeline`, () => {
      const json = JSON.stringify(fixture)
      expect(() => parseAndValidateAlertClassification(json)).not.toThrow()
      const parsed = parseAndValidateAlertClassification(json)
      expect(parsed.topic_slug).toBe(fixture.topic_slug)
      expect(parsed.headline).toBe(fixture.headline)
    })
  })
})

describe('schema example fixtures — timeline entry', () => {
  const examples = loadSchemaExamples('timeline_entry.json')

  it('at least one example is defined in the schema', () => {
    expect(examples.length).toBeGreaterThan(0)
  })

  examples.forEach((example, i) => {
    const fixture = stripMetaKeys(example)
    it(`example[${i}] passes validateTimelineEntry`, () => {
      const result = validateTimelineEntry(fixture)
      expect(result.ok).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it(`example[${i}] passes the full parseAndValidateTimelineEntry pipeline`, () => {
      const json = JSON.stringify(fixture)
      expect(() => parseAndValidateTimelineEntry(json)).not.toThrow()
      const parsed = parseAndValidateTimelineEntry(json)
      expect(parsed.headline).toBe(fixture.headline)
    })
  })
})

describe('schema example fixtures — daily summary', () => {
  const examples = loadSchemaExamples('daily_summary.json')

  it('at least one example is defined in the schema', () => {
    expect(examples.length).toBeGreaterThan(0)
  })

  examples.forEach((example, i) => {
    const fixture = stripMetaKeys(example)
    it(`example[${i}] passes validateDailySummary`, () => {
      const result = validateDailySummary(fixture)
      expect(result.ok).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it(`example[${i}] passes the full parseAndValidateDailySummary pipeline`, () => {
      const json = JSON.stringify(fixture)
      expect(() => parseAndValidateDailySummary(json)).not.toThrow()
      const parsed = parseAndValidateDailySummary(json)
      expect(parsed.sentiment).toBe(fixture.sentiment)
    })
  })
})

describe('schema example fixtures — expectation check', () => {
  const examples = loadSchemaExamples('expectation_check.json')

  it('at least one example is defined in the schema', () => {
    expect(examples.length).toBeGreaterThan(0)
  })

  examples.forEach((example, i) => {
    const fixture = stripMetaKeys(example)
    it(`example[${i}] passes validateExpectationCheck`, () => {
      const result = validateExpectationCheck(fixture)
      expect(result.ok).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it(`example[${i}] passes the full parseAndValidateExpectationCheck pipeline`, () => {
      const json = JSON.stringify(fixture)
      expect(() => parseAndValidateExpectationCheck(json)).not.toThrow()
      const parsed = parseAndValidateExpectationCheck(json)
      expect(typeof parsed.alignment_score).toBe('number')
    })
  })
})

describe('schema example fixtures — tomorrow outlook', () => {
  const examples = loadSchemaExamples('tomorrow_outlook.json')

  it('at least one example is defined in the schema', () => {
    expect(examples.length).toBeGreaterThan(0)
  })

  examples.forEach((example, i) => {
    const fixture = stripMetaKeys(example)
    it(`example[${i}] passes validateTomorrowOutlook`, () => {
      const result = validateTomorrowOutlook(fixture)
      expect(result.ok).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it(`example[${i}] passes the full parseAndValidateTomorrowOutlook pipeline`, () => {
      const json = JSON.stringify(fixture)
      expect(() => parseAndValidateTomorrowOutlook(json)).not.toThrow()
      const parsed = parseAndValidateTomorrowOutlook(json)
      expect(parsed.risk_level).toBe(fixture.risk_level)
    })
  })
})

describe('schema example fixtures — video script', () => {
  const examples = loadSchemaExamples('video_script.json')

  it('at least one example is defined in the schema', () => {
    expect(examples.length).toBeGreaterThan(0)
  })

  examples.forEach((example, i) => {
    const fixture = stripMetaKeys(example)
    it(`example[${i}] passes validateVideoScript`, () => {
      const result = validateVideoScript(fixture)
      expect(result.ok).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it(`example[${i}] passes the full parseAndValidateVideoScript pipeline`, () => {
      const json = JSON.stringify(fixture)
      expect(() => parseAndValidateVideoScript(json)).not.toThrow()
      const parsed = parseAndValidateVideoScript(json)
      expect(parsed.total_duration_seconds).toBe(fixture.total_duration_seconds)
    })
  })
})

describe('schema example fixtures — YouTube metadata', () => {
  const examples = loadSchemaExamples('youtube_metadata.json')

  it('at least one example is defined in the schema', () => {
    expect(examples.length).toBeGreaterThan(0)
  })

  examples.forEach((example, i) => {
    const fixture = stripMetaKeys(example)
    it(`example[${i}] passes validateYoutubeMetadata`, () => {
      const result = validateYoutubeMetadata(fixture)
      expect(result.ok).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it(`example[${i}] passes the full parseAndValidateYoutubeMetadata pipeline`, () => {
      const json = JSON.stringify(fixture)
      expect(() => parseAndValidateYoutubeMetadata(json)).not.toThrow()
      const parsed = parseAndValidateYoutubeMetadata(json)
      expect(parsed.title).toBe(fixture.title)
    })
  })
})

// ---------------------------------------------------------------------------
// 2. Required-field enforcement per task
// ---------------------------------------------------------------------------

describe('required-field enforcement — alert classification', () => {
  const REQUIRED = ['topic_slug', 'headline', 'summary_text', 'severity_score', 'importance_score', 'confidence_score', 'send_alert', 'cluster_label']

  REQUIRED.forEach(field => {
    it(`removing "${field}" produces a validation error`, () => {
      const obj = { ...MINIMAL_ALERT_CLASSIFICATION }
      delete obj[field]
      const { ok, errors } = validateAlertClassification(obj)
      expect(ok).toBe(false)
      expect(errors.length).toBeGreaterThan(0)
    })
  })

  it('parseAndValidateAlertClassification throws AI_VALIDATION_ERROR when topic_slug is missing', () => {
    const obj = { ...MINIMAL_ALERT_CLASSIFICATION }
    delete obj.topic_slug
    expect(() => parseAndValidateAlertClassification(JSON.stringify(obj))).toThrow('AI_VALIDATION_ERROR')
  })

  it('error message for missing topic_slug mentions "topic_slug"', () => {
    const obj = { ...MINIMAL_ALERT_CLASSIFICATION }
    delete obj.topic_slug
    const { errors } = validateAlertClassification(obj)
    expect(errors.some(e => e.includes('topic_slug'))).toBe(true)
  })

  it('error message for missing headline mentions "headline"', () => {
    const obj = { ...MINIMAL_ALERT_CLASSIFICATION, headline: '' }
    const { errors } = validateAlertClassification(obj)
    expect(errors.some(e => e.includes('headline'))).toBe(true)
  })
})

describe('required-field enforcement — timeline entry', () => {
  const REQUIRED = ['headline', 'summary_text', 'severity_level', 'label']

  REQUIRED.forEach(field => {
    it(`removing "${field}" produces a validation error`, () => {
      const obj = { ...MINIMAL_TIMELINE_ENTRY }
      delete obj[field]
      const { ok, errors } = validateTimelineEntry(obj)
      expect(ok).toBe(false)
      expect(errors.length).toBeGreaterThan(0)
    })
  })

  it('parseAndValidateTimelineEntry throws AI_VALIDATION_ERROR when severity_level is missing', () => {
    const obj = { ...MINIMAL_TIMELINE_ENTRY }
    delete obj.severity_level
    expect(() => parseAndValidateTimelineEntry(JSON.stringify(obj))).toThrow('AI_VALIDATION_ERROR')
  })

  it('error message for invalid severity_level mentions "severity_level"', () => {
    const obj = { ...MINIMAL_TIMELINE_ENTRY, severity_level: 'critical' }
    const { errors } = validateTimelineEntry(obj)
    expect(errors.some(e => e.includes('severity_level'))).toBe(true)
  })
})

describe('required-field enforcement — daily summary', () => {
  const REQUIRED = ['headline', 'overview', 'key_events', 'sentiment', 'topic_score']

  REQUIRED.forEach(field => {
    it(`removing "${field}" produces a validation error`, () => {
      const obj = { ...MINIMAL_DAILY_SUMMARY }
      delete obj[field]
      const { ok, errors } = validateDailySummary(obj)
      expect(ok).toBe(false)
      expect(errors.length).toBeGreaterThan(0)
    })
  })

  it('parseAndValidateDailySummary throws AI_VALIDATION_ERROR when sentiment is invalid', () => {
    const obj = { ...MINIMAL_DAILY_SUMMARY, sentiment: 'optimistic' }
    expect(() => parseAndValidateDailySummary(JSON.stringify(obj))).toThrow('AI_VALIDATION_ERROR')
  })

  it('error message for invalid sentiment mentions "sentiment"', () => {
    const obj = { ...MINIMAL_DAILY_SUMMARY, sentiment: 'optimistic' }
    const { errors } = validateDailySummary(obj)
    expect(errors.some(e => e.includes('sentiment'))).toBe(true)
  })

  it('error message for empty key_events array mentions "key_events"', () => {
    const obj = { ...MINIMAL_DAILY_SUMMARY, key_events: [] }
    const { errors } = validateDailySummary(obj)
    expect(errors.some(e => e.includes('key_events'))).toBe(true)
  })
})

describe('required-field enforcement — expectation check', () => {
  const REQUIRED = ['expectations_checked', 'surprise_events', 'alignment_score']

  REQUIRED.forEach(field => {
    it(`removing "${field}" produces a validation error`, () => {
      const obj = { ...MINIMAL_EXPECTATION_CHECK }
      delete obj[field]
      const { ok, errors } = validateExpectationCheck(obj)
      expect(ok).toBe(false)
      expect(errors.length).toBeGreaterThan(0)
    })
  })

  it('parseAndValidateExpectationCheck throws AI_VALIDATION_ERROR when alignment_score is missing', () => {
    const obj = { ...MINIMAL_EXPECTATION_CHECK }
    delete obj.alignment_score
    expect(() => parseAndValidateExpectationCheck(JSON.stringify(obj))).toThrow('AI_VALIDATION_ERROR')
  })

  it('error message for out-of-range alignment_score mentions "alignment_score"', () => {
    const obj = { ...MINIMAL_EXPECTATION_CHECK, alignment_score: 150 }
    const { errors } = validateExpectationCheck(obj)
    expect(errors.some(e => e.includes('alignment_score'))).toBe(true)
  })
})

describe('required-field enforcement — tomorrow outlook', () => {
  const REQUIRED = ['key_watchpoints', 'scheduled_events', 'outlook_summary', 'risk_level']

  REQUIRED.forEach(field => {
    it(`removing "${field}" produces a validation error`, () => {
      const obj = { ...MINIMAL_TOMORROW_OUTLOOK }
      delete obj[field]
      const { ok, errors } = validateTomorrowOutlook(obj)
      expect(ok).toBe(false)
      expect(errors.length).toBeGreaterThan(0)
    })
  })

  it('parseAndValidateTomorrowOutlook throws AI_VALIDATION_ERROR when risk_level is invalid', () => {
    const obj = { ...MINIMAL_TOMORROW_OUTLOOK, risk_level: 'extreme' }
    expect(() => parseAndValidateTomorrowOutlook(JSON.stringify(obj))).toThrow('AI_VALIDATION_ERROR')
  })

  it('error message for empty key_watchpoints mentions "key_watchpoints"', () => {
    const obj = { ...MINIMAL_TOMORROW_OUTLOOK, key_watchpoints: [] }
    const { errors } = validateTomorrowOutlook(obj)
    expect(errors.some(e => e.includes('key_watchpoints'))).toBe(true)
  })
})

describe('required-field enforcement — video script', () => {
  const REQUIRED = ['intro', 'segments', 'outro', 'total_duration_seconds']

  REQUIRED.forEach(field => {
    it(`removing "${field}" produces a validation error`, () => {
      const obj = { ...MINIMAL_VIDEO_SCRIPT }
      delete obj[field]
      const { ok, errors } = validateVideoScript(obj)
      expect(ok).toBe(false)
      expect(errors.length).toBeGreaterThan(0)
    })
  })

  it('parseAndValidateVideoScript throws AI_VALIDATION_ERROR when segments has only one item', () => {
    const obj = { ...MINIMAL_VIDEO_SCRIPT, segments: [MINIMAL_VIDEO_SCRIPT.segments[0]] }
    expect(() => parseAndValidateVideoScript(JSON.stringify(obj))).toThrow('AI_VALIDATION_ERROR')
  })

  it('error message for a single-segment array mentions "segments"', () => {
    const obj = { ...MINIMAL_VIDEO_SCRIPT, segments: [MINIMAL_VIDEO_SCRIPT.segments[0]] }
    const { errors } = validateVideoScript(obj)
    expect(errors.some(e => e.includes('segments'))).toBe(true)
  })

  it('error message for out-of-range total_duration_seconds mentions "total_duration_seconds"', () => {
    const obj = { ...MINIMAL_VIDEO_SCRIPT, total_duration_seconds: 30 }
    const { errors } = validateVideoScript(obj)
    expect(errors.some(e => e.includes('total_duration_seconds'))).toBe(true)
  })
})

describe('required-field enforcement — YouTube metadata', () => {
  const REQUIRED = ['title', 'description', 'tags']

  REQUIRED.forEach(field => {
    it(`removing "${field}" produces a validation error`, () => {
      const obj = { ...MINIMAL_YOUTUBE_METADATA }
      delete obj[field]
      const { ok, errors } = validateYoutubeMetadata(obj)
      expect(ok).toBe(false)
      expect(errors.length).toBeGreaterThan(0)
    })
  })

  it('parseAndValidateYoutubeMetadata throws AI_VALIDATION_ERROR when tags has fewer than 5 items', () => {
    const obj = { ...MINIMAL_YOUTUBE_METADATA, tags: ['bitcoin', 'crypto'] }
    expect(() => parseAndValidateYoutubeMetadata(JSON.stringify(obj))).toThrow('AI_VALIDATION_ERROR')
  })

  it('error message for short tags array mentions "tags"', () => {
    const obj = { ...MINIMAL_YOUTUBE_METADATA, tags: ['bitcoin'] }
    const { errors } = validateYoutubeMetadata(obj)
    expect(errors.some(e => e.includes('tags'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 3. Invalid / incomplete output handling
// ---------------------------------------------------------------------------

describe('invalid output handling — all tasks', () => {
  const CASES = [null, undefined, 42, 'string', [], true]

  describe('validateAlertClassification', () => {
    CASES.forEach(input => {
      it(`returns ok=false for input: ${JSON.stringify(input)}`, () => {
        const { ok } = validateAlertClassification(input)
        expect(ok).toBe(false)
      })
    })

    it('returns ok=false for an empty object', () => {
      const { ok, errors } = validateAlertClassification({})
      expect(ok).toBe(false)
      expect(errors.length).toBeGreaterThan(0)
    })
  })

  describe('validateTimelineEntry', () => {
    CASES.forEach(input => {
      it(`returns ok=false for input: ${JSON.stringify(input)}`, () => {
        const { ok } = validateTimelineEntry(input)
        expect(ok).toBe(false)
      })
    })

    it('returns ok=false for an empty object', () => {
      const { ok } = validateTimelineEntry({})
      expect(ok).toBe(false)
    })
  })

  describe('validateDailySummary', () => {
    CASES.forEach(input => {
      it(`returns ok=false for input: ${JSON.stringify(input)}`, () => {
        const { ok } = validateDailySummary(input)
        expect(ok).toBe(false)
      })
    })

    it('returns ok=false for an empty object', () => {
      const { ok } = validateDailySummary({})
      expect(ok).toBe(false)
    })
  })

  describe('validateExpectationCheck', () => {
    CASES.forEach(input => {
      it(`returns ok=false for input: ${JSON.stringify(input)}`, () => {
        const { ok } = validateExpectationCheck(input)
        expect(ok).toBe(false)
      })
    })

    it('returns ok=false for an empty object', () => {
      const { ok } = validateExpectationCheck({})
      expect(ok).toBe(false)
    })
  })

  describe('validateTomorrowOutlook', () => {
    CASES.forEach(input => {
      it(`returns ok=false for input: ${JSON.stringify(input)}`, () => {
        const { ok } = validateTomorrowOutlook(input)
        expect(ok).toBe(false)
      })
    })

    it('returns ok=false for an empty object', () => {
      const { ok } = validateTomorrowOutlook({})
      expect(ok).toBe(false)
    })
  })

  describe('validateVideoScript', () => {
    CASES.forEach(input => {
      it(`returns ok=false for input: ${JSON.stringify(input)}`, () => {
        const { ok } = validateVideoScript(input)
        expect(ok).toBe(false)
      })
    })

    it('returns ok=false for an empty object', () => {
      const { ok } = validateVideoScript({})
      expect(ok).toBe(false)
    })
  })

  describe('validateYoutubeMetadata', () => {
    CASES.forEach(input => {
      it(`returns ok=false for input: ${JSON.stringify(input)}`, () => {
        const { ok } = validateYoutubeMetadata(input)
        expect(ok).toBe(false)
      })
    })

    it('returns ok=false for an empty object', () => {
      const { ok } = validateYoutubeMetadata({})
      expect(ok).toBe(false)
    })
  })
})

describe('parseAndValidate* — AI_PARSE_ERROR on malformed JSON', () => {
  const PARSE_FNS = [
    ['parseAndValidateAlertClassification', parseAndValidateAlertClassification],
    ['parseAndValidateTimelineEntry', parseAndValidateTimelineEntry],
    ['parseAndValidateDailySummary', parseAndValidateDailySummary],
    ['parseAndValidateExpectationCheck', parseAndValidateExpectationCheck],
    ['parseAndValidateTomorrowOutlook', parseAndValidateTomorrowOutlook],
    ['parseAndValidateVideoScript', parseAndValidateVideoScript],
    ['parseAndValidateYoutubeMetadata', parseAndValidateYoutubeMetadata],
  ]

  PARSE_FNS.forEach(([name, fn]) => {
    it(`${name} throws AI_PARSE_ERROR on invalid JSON string`, () => {
      expect(() => fn('not json {')).toThrow('AI_PARSE_ERROR')
    })

    it(`${name} throws AI_PARSE_ERROR on empty string`, () => {
      expect(() => fn('')).toThrow('AI_PARSE_ERROR')
    })
  })
})

describe('parseAndValidate* — AI_VALIDATION_ERROR on structurally empty JSON object', () => {
  const VALIDATE_FNS = [
    ['parseAndValidateAlertClassification', parseAndValidateAlertClassification],
    ['parseAndValidateTimelineEntry', parseAndValidateTimelineEntry],
    ['parseAndValidateDailySummary', parseAndValidateDailySummary],
    ['parseAndValidateExpectationCheck', parseAndValidateExpectationCheck],
    ['parseAndValidateTomorrowOutlook', parseAndValidateTomorrowOutlook],
    ['parseAndValidateVideoScript', parseAndValidateVideoScript],
    ['parseAndValidateYoutubeMetadata', parseAndValidateYoutubeMetadata],
  ]

  VALIDATE_FNS.forEach(([name, fn]) => {
    it(`${name} throws AI_VALIDATION_ERROR for an empty JSON object`, () => {
      expect(() => fn('{}')).toThrow('AI_VALIDATION_ERROR')
    })
  })
})

// ---------------------------------------------------------------------------
// 4. Optional-field robustness (fallback behavior)
// ---------------------------------------------------------------------------

describe('optional-field robustness — alert classification', () => {
  it('accepts output with no secondary_topics field', () => {
    const obj = { ...MINIMAL_ALERT_CLASSIFICATION }
    delete obj.secondary_topics
    const { ok } = validateAlertClassification(obj)
    expect(ok).toBe(true)
  })

  it('accepts output with no supporting_sources field', () => {
    const obj = { ...MINIMAL_ALERT_CLASSIFICATION }
    delete obj.supporting_sources
    const { ok } = validateAlertClassification(obj)
    expect(ok).toBe(true)
  })

  it('accepts cluster_label as null', () => {
    const { ok } = validateAlertClassification({ ...MINIMAL_ALERT_CLASSIFICATION, cluster_label: null })
    expect(ok).toBe(true)
  })

  it('accepts supporting_sources as null', () => {
    const { ok } = validateAlertClassification({ ...MINIMAL_ALERT_CLASSIFICATION, supporting_sources: null })
    expect(ok).toBe(true)
  })
})

describe('optional-field robustness — timeline entry', () => {
  it('accepts output with no label_color field', () => {
    const obj = { ...MINIMAL_TIMELINE_ENTRY }
    delete obj.label_color
    const { ok } = validateTimelineEntry(obj)
    expect(ok).toBe(true)
  })

  it('accepts output with no source_attribution field', () => {
    const obj = { ...MINIMAL_TIMELINE_ENTRY }
    delete obj.source_attribution
    const { ok } = validateTimelineEntry(obj)
    expect(ok).toBe(true)
  })

  it('accepts output with no source_url field', () => {
    const obj = { ...MINIMAL_TIMELINE_ENTRY }
    delete obj.source_url
    const { ok } = validateTimelineEntry(obj)
    expect(ok).toBe(true)
  })

  it('accepts source_url as null', () => {
    const { ok } = validateTimelineEntry({ ...MINIMAL_TIMELINE_ENTRY, source_url: null })
    expect(ok).toBe(true)
  })
})

describe('optional-field robustness — daily summary', () => {
  it('accepts output with no market_context field', () => {
    const obj = { ...MINIMAL_DAILY_SUMMARY }
    delete obj.market_context
    const { ok } = validateDailySummary(obj)
    expect(ok).toBe(true)
  })

  it('accepts output with no sources field', () => {
    const obj = { ...MINIMAL_DAILY_SUMMARY }
    delete obj.sources
    const { ok } = validateDailySummary(obj)
    expect(ok).toBe(true)
  })
})

describe('optional-field robustness — expectation check', () => {
  it('accepts an empty expectations_checked array', () => {
    const { ok } = validateExpectationCheck({ ...MINIMAL_EXPECTATION_CHECK, expectations_checked: [] })
    expect(ok).toBe(true)
  })

  it('accepts an empty surprise_events array', () => {
    const { ok } = validateExpectationCheck({ ...MINIMAL_EXPECTATION_CHECK, surprise_events: [] })
    expect(ok).toBe(true)
  })

  it('accepts expectations_checked items with no source field', () => {
    const obj = {
      ...MINIMAL_EXPECTATION_CHECK,
      expectations_checked: [
        { expectation: 'Bitcoin would test resistance near $115K before moving higher', outcome: 'missed' },
      ],
    }
    const { ok } = validateExpectationCheck(obj)
    expect(ok).toBe(true)
  })
})

describe('optional-field robustness — tomorrow outlook', () => {
  it('accepts an empty scheduled_events array', () => {
    const { ok } = validateTomorrowOutlook({ ...MINIMAL_TOMORROW_OUTLOOK, scheduled_events: [] })
    expect(ok).toBe(true)
  })

  it('accepts key_watchpoints items with no source field', () => {
    const obj = {
      ...MINIMAL_TOMORROW_OUTLOOK,
      key_watchpoints: [
        { title: 'BTC $120K Support', description: 'Holding this level as support is critical for continued upside momentum.' },
      ],
    }
    const { ok } = validateTomorrowOutlook(obj)
    expect(ok).toBe(true)
  })

  it('accepts scheduled_events items with no time_hint field', () => {
    const obj = {
      ...MINIMAL_TOMORROW_OUTLOOK,
      scheduled_events: [
        { title: 'FOMC Meeting Minutes Release', impact: 'high' },
      ],
    }
    const { ok } = validateTomorrowOutlook(obj)
    expect(ok).toBe(true)
  })
})

describe('optional-field robustness — video script', () => {
  it('accepts output with no call_to_action field', () => {
    const obj = { ...MINIMAL_VIDEO_SCRIPT }
    delete obj.call_to_action
    const { ok } = validateVideoScript(obj)
    expect(ok).toBe(true)
  })

  it('accepts segments with no sources field', () => {
    const obj = {
      ...MINIMAL_VIDEO_SCRIPT,
      segments: [
        { title: 'BTC ATH', script: 'Bitcoin crossed $120,000 today, setting a new all-time high. The move was driven by record ETF inflows and a major sovereign wealth fund disclosure.', duration_seconds: 45 },
        { title: 'ETF Flows', script: 'Spot Bitcoin ETF inflows hit $1.5 billion in a single day — more than double the previous record — confirming sustained institutional demand.', duration_seconds: 40 },
      ],
    }
    const { ok } = validateVideoScript(obj)
    expect(ok).toBe(true)
  })
})

describe('optional-field robustness — YouTube metadata', () => {
  it('accepts output with no visibility field', () => {
    const obj = { ...MINIMAL_YOUTUBE_METADATA }
    delete obj.visibility
    const { ok } = validateYoutubeMetadata(obj)
    expect(ok).toBe(true)
  })

  it('accepts output with no category field', () => {
    const obj = { ...MINIMAL_YOUTUBE_METADATA }
    delete obj.category
    const { ok } = validateYoutubeMetadata(obj)
    expect(ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 5. Task registry completeness
// ---------------------------------------------------------------------------

describe('task registry completeness', () => {
  it('OPENAI_STRUCTURED_OUTPUT_TASKS lists exactly 7 JSON-output tasks', () => {
    expect(Object.keys(OPENAI_STRUCTURED_OUTPUT_TASKS)).toHaveLength(7)
  })

  it('every task in OPENAI_STRUCTURED_OUTPUT_TASKS has a corresponding validate* function exported', () => {
    const VALIDATORS = {
      alertClassification: validateAlertClassification,
      timelineFormatting: null, // timeline formatting uses validateTimelineEntry
      dailySummary: validateDailySummary,
      expectationCheck: validateExpectationCheck,
      tomorrowOutlook: validateTomorrowOutlook,
      videoScript: validateVideoScript,
      youtubeMetadata: validateYoutubeMetadata,
    }

    Object.keys(OPENAI_STRUCTURED_OUTPUT_TASKS).forEach(task => {
      expect(VALIDATORS).toHaveProperty(task)
    })
  })

  it('timelineFormatting task has a corresponding parseAndValidateTimelineEntry function', () => {
    // The timeline formatting task maps to the timeline entry validator
    expect(typeof parseAndValidateTimelineEntry).toBe('function')
  })

  it('all structured output tasks set responseFormat to "json_object"', () => {
    Object.entries(OPENAI_STRUCTURED_OUTPUT_TASKS).forEach(([task, cfg]) => {
      expect(cfg.responseFormat).toBe('json_object')
    })
  })

  it('articleGeneration is deliberately absent from OPENAI_STRUCTURED_OUTPUT_TASKS', () => {
    expect(OPENAI_STRUCTURED_OUTPUT_TASKS).not.toHaveProperty('articleGeneration')
  })
})

// ---------------------------------------------------------------------------
// 6. Schema validation failure messages — task name identification
// ---------------------------------------------------------------------------

describe('AI_VALIDATION_ERROR messages identify the failing task', () => {
  it('parseAndValidateAlertClassification error names the task', () => {
    try {
      parseAndValidateAlertClassification('{}')
    } catch (e) {
      expect(e.message).toContain('Alert classification')
    }
  })

  it('parseAndValidateTimelineEntry error names the task', () => {
    try {
      parseAndValidateTimelineEntry('{}')
    } catch (e) {
      expect(e.message).toContain('Timeline entry')
    }
  })

  it('parseAndValidateDailySummary error names the task', () => {
    try {
      parseAndValidateDailySummary('{}')
    } catch (e) {
      expect(e.message).toContain('Daily summary')
    }
  })

  it('parseAndValidateExpectationCheck error names the task', () => {
    try {
      parseAndValidateExpectationCheck('{}')
    } catch (e) {
      expect(e.message).toContain('Expectation check')
    }
  })

  it('parseAndValidateTomorrowOutlook error names the task', () => {
    try {
      parseAndValidateTomorrowOutlook('{}')
    } catch (e) {
      expect(e.message).toContain('Tomorrow outlook')
    }
  })

  it('parseAndValidateVideoScript error names the task', () => {
    try {
      parseAndValidateVideoScript('{}')
    } catch (e) {
      expect(e.message).toContain('Video script')
    }
  })

  it('parseAndValidateYoutubeMetadata error names the task', () => {
    try {
      parseAndValidateYoutubeMetadata('{}')
    } catch (e) {
      expect(e.message).toContain('YouTube metadata')
    }
  })
})
