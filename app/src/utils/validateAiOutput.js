/**
 * validateAiOutput.js
 *
 * Reusable validation utilities for structured AI JSON outputs.
 *
 * Each AI task produces a defined JSON contract (see schemas/ai/).  This
 * module provides:
 *
 *   - `parseJsonOutput(rawContent)`
 *       Strips optional markdown code fences, parses JSON, and returns the
 *       parsed object.  Throws `AI_PARSE_ERROR` when parsing fails.
 *
 *   - Per-task `validate*(obj)` functions
 *       Accept a parsed object and return `{ ok: boolean, errors: string[] }`.
 *       Never throw — callers decide how to handle validation failures.
 *
 *   - Per-task `parseAndValidate*(rawContent)` functions
 *       Combine `parseJsonOutput` and the matching `validate*` call.  Throw
 *       `AI_PARSE_ERROR` on JSON parse failure or `AI_VALIDATION_ERROR` when
 *       required fields are absent or out of range.  Return the normalised
 *       object on success.
 *
 * All functions are side-effect-free and can be used in:
 *   - n8n Code node logic (copy-paste the relevant helper)
 *   - local CI validation scripts
 *   - unit tests
 *   - any JS consumer that receives raw AI output
 *
 * See schemas/ai/ for the canonical JSON Schema definitions.
 * See docs/architecture/ai-provider.md for the full AI provider guide.
 */

// ---------------------------------------------------------------------------
// Valid value sets (mirrors the JSON schemas in schemas/ai/)
// ---------------------------------------------------------------------------

export const VALID_TOPICS = ['crypto', 'finance', 'economy', 'health', 'ai', 'energy', 'technology']
export const VALID_SENTIMENTS = ['bullish', 'bearish', 'neutral', 'mixed']
export const VALID_SEVERITY_LEVELS = ['high', 'medium', 'low']
export const VALID_RISK_LEVELS = ['low', 'medium', 'high']
export const VALID_IMPACT_LEVELS = ['high', 'medium', 'low']
export const VALID_EXPECTATION_OUTCOMES = ['met', 'missed', 'partial']
export const VALID_SOURCE_ROLES_SUMMARY = ['primary', 'confirmation', 'data', 'commentary', 'official']
export const VALID_SOURCE_ROLES_VIDEO = ['primary', 'data', 'commentary']
export const VALID_LABEL_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'gray']
export const VALID_VISIBILITIES = ['public', 'unlisted', 'private']

// ---------------------------------------------------------------------------
// Core parse helper
// ---------------------------------------------------------------------------

/**
 * Strips optional markdown code fences and parses a JSON string.
 *
 * @param {string} rawContent - Raw string returned by the OpenAI API.
 * @returns {unknown} Parsed JSON value.
 * @throws {Error} AI_PARSE_ERROR when the content cannot be parsed as JSON.
 */
export function parseJsonOutput(rawContent) {
  if (typeof rawContent !== 'string') {
    throw new Error('AI_PARSE_ERROR: rawContent must be a string.')
  }
  const cleaned = rawContent.replace(/^```[a-z]*\n?|\n?```$/g, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch (e) {
    throw new Error(
      `AI_PARSE_ERROR: Failed to parse AI JSON output. ${e.message}. ` +
      `Raw (first 200 chars): ${rawContent.slice(0, 200)}`
    )
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when `v` is a finite integer in the range [min, max].
 *
 * @param {unknown} v
 * @param {number} min
 * @param {number} max
 * @returns {boolean}
 */
function isIntegerInRange(v, min, max) {
  return typeof v === 'number' && Number.isFinite(v) && Math.round(v) === v && v >= min && v <= max
}

/**
 * Returns true when `v` is a non-empty string within the given length bounds.
 *
 * @param {unknown} v
 * @param {number} minLen
 * @param {number} maxLen
 * @returns {boolean}
 */
function isString(v, minLen = 1, maxLen = Infinity) {
  return typeof v === 'string' && v.length >= minLen && v.length <= maxLen
}

// ---------------------------------------------------------------------------
// Alert classification
// ---------------------------------------------------------------------------

/**
 * Validates a parsed alert classification AI output.
 *
 * Required fields: topic_slug, headline, summary_text, severity_score,
 * importance_score, confidence_score, send_alert, cluster_label (present).
 *
 * @param {unknown} obj - Parsed AI output object.
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateAlertClassification(obj) {
  const errors = []

  if (!obj || typeof obj !== 'object') {
    return { ok: false, errors: ['Output is not an object.'] }
  }

  if (!VALID_TOPICS.includes(obj.topic_slug)) {
    errors.push(`topic_slug "${obj.topic_slug}" is not a valid topic. Expected one of: ${VALID_TOPICS.join(', ')}.`)
  }
  if (!isString(obj.headline, 10, 250)) {
    errors.push('headline must be a string of 10–250 characters.')
  }
  if (!isString(obj.summary_text, 20, 500)) {
    errors.push('summary_text must be a string of 20–500 characters.')
  }
  if (!isIntegerInRange(obj.severity_score, 0, 100)) {
    errors.push('severity_score must be an integer 0–100.')
  }
  if (!isIntegerInRange(obj.importance_score, 0, 100)) {
    errors.push('importance_score must be an integer 0–100.')
  }
  if (!isIntegerInRange(obj.confidence_score, 0, 100)) {
    errors.push('confidence_score must be an integer 0–100.')
  }
  if (typeof obj.send_alert !== 'boolean') {
    errors.push('send_alert must be a boolean.')
  }
  if (!('cluster_label' in obj)) {
    errors.push('cluster_label field must be present (string or null).')
  }

  return { ok: errors.length === 0, errors }
}

/**
 * Parses raw AI content and validates it as an alert classification output.
 *
 * @param {string} rawContent - Raw string returned by the OpenAI API.
 * @returns {object} Validated alert classification output.
 * @throws {Error} AI_PARSE_ERROR or AI_VALIDATION_ERROR.
 */
export function parseAndValidateAlertClassification(rawContent) {
  const obj = parseJsonOutput(rawContent)
  const { ok, errors } = validateAlertClassification(obj)
  if (!ok) {
    throw new Error(
      `AI_VALIDATION_ERROR: Alert classification output is invalid.\n${errors.join('\n')}`
    )
  }
  return obj
}

// ---------------------------------------------------------------------------
// Timeline entry
// ---------------------------------------------------------------------------

/**
 * Validates a parsed timeline entry AI output.
 *
 * Required fields: headline, summary_text, severity_level, label.
 *
 * @param {unknown} obj - Parsed AI output object.
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateTimelineEntry(obj) {
  const errors = []

  if (!obj || typeof obj !== 'object') {
    return { ok: false, errors: ['Output is not an object.'] }
  }

  if (!isString(obj.headline, 10, 150)) {
    errors.push('headline must be a string of 10–150 characters.')
  }
  if (!isString(obj.summary_text, 20, 300)) {
    errors.push('summary_text must be a string of 20–300 characters.')
  }
  if (!VALID_SEVERITY_LEVELS.includes(obj.severity_level)) {
    errors.push(`severity_level "${obj.severity_level}" is invalid. Expected: ${VALID_SEVERITY_LEVELS.join(', ')}.`)
  }
  if (!isString(obj.label, 2, 40)) {
    errors.push('label must be a string of 2–40 characters.')
  }
  if ('label_color' in obj && obj.label_color !== null && !VALID_LABEL_COLORS.includes(obj.label_color)) {
    errors.push(`label_color "${obj.label_color}" is invalid. Expected one of: ${VALID_LABEL_COLORS.join(', ')} or null.`)
  }

  return { ok: errors.length === 0, errors }
}

/**
 * Parses raw AI content and validates it as a timeline entry output.
 *
 * @param {string} rawContent - Raw string returned by the OpenAI API.
 * @returns {object} Validated timeline entry output.
 * @throws {Error} AI_PARSE_ERROR or AI_VALIDATION_ERROR.
 */
export function parseAndValidateTimelineEntry(rawContent) {
  const obj = parseJsonOutput(rawContent)
  const { ok, errors } = validateTimelineEntry(obj)
  if (!ok) {
    throw new Error(
      `AI_VALIDATION_ERROR: Timeline entry output is invalid.\n${errors.join('\n')}`
    )
  }
  return obj
}

// ---------------------------------------------------------------------------
// Daily summary
// ---------------------------------------------------------------------------

/**
 * Validates a parsed daily summary AI output.
 *
 * Required fields: headline, overview, key_events, sentiment, topic_score.
 *
 * @param {unknown} obj - Parsed AI output object.
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateDailySummary(obj) {
  const errors = []

  if (!obj || typeof obj !== 'object') {
    return { ok: false, errors: ['Output is not an object.'] }
  }

  if (!isString(obj.headline, 10, 200)) {
    errors.push('headline must be a string of 10–200 characters.')
  }
  if (!isString(obj.overview, 100, 1000)) {
    errors.push('overview must be a string of 100–1000 characters.')
  }
  if (!Array.isArray(obj.key_events) || obj.key_events.length === 0) {
    errors.push('key_events must be a non-empty array.')
  } else if (obj.key_events.length > 7) {
    errors.push('key_events must have at most 7 items.')
  } else {
    obj.key_events.forEach((e, i) => {
      if (!isString(e.title, 5, 150)) {
        errors.push(`key_events[${i}].title must be a string of 5–150 characters.`)
      }
      if (!isString(e.significance, 20, 300)) {
        errors.push(`key_events[${i}].significance must be a string of 20–300 characters.`)
      }
      if (!isIntegerInRange(e.importance_score, 0, 100)) {
        errors.push(`key_events[${i}].importance_score must be an integer 0–100.`)
      }
    })
  }
  if (!VALID_SENTIMENTS.includes(obj.sentiment)) {
    errors.push(`sentiment "${obj.sentiment}" is invalid. Expected: ${VALID_SENTIMENTS.join(', ')}.`)
  }
  if (!isIntegerInRange(obj.topic_score, 0, 100)) {
    errors.push('topic_score must be an integer 0–100.')
  }

  return { ok: errors.length === 0, errors }
}

/**
 * Parses raw AI content and validates it as a daily summary output.
 *
 * @param {string} rawContent - Raw string returned by the OpenAI API.
 * @returns {object} Validated daily summary output.
 * @throws {Error} AI_PARSE_ERROR or AI_VALIDATION_ERROR.
 */
export function parseAndValidateDailySummary(rawContent) {
  const obj = parseJsonOutput(rawContent)
  const { ok, errors } = validateDailySummary(obj)
  if (!ok) {
    throw new Error(
      `AI_VALIDATION_ERROR: Daily summary output is invalid.\n${errors.join('\n')}`
    )
  }
  return obj
}

// ---------------------------------------------------------------------------
// Expectation check
// ---------------------------------------------------------------------------

/**
 * Validates a parsed expectation check AI output.
 *
 * Required fields: expectations_checked, surprise_events, alignment_score.
 *
 * @param {unknown} obj - Parsed AI output object.
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateExpectationCheck(obj) {
  const errors = []

  if (!obj || typeof obj !== 'object') {
    return { ok: false, errors: ['Output is not an object.'] }
  }

  if (!Array.isArray(obj.expectations_checked)) {
    errors.push('expectations_checked must be an array.')
  } else {
    obj.expectations_checked.forEach((e, i) => {
      if (!isString(e.expectation, 10, 200)) {
        errors.push(`expectations_checked[${i}].expectation must be a string of 10–200 characters.`)
      }
      if (!VALID_EXPECTATION_OUTCOMES.includes(e.outcome)) {
        errors.push(`expectations_checked[${i}].outcome "${e.outcome}" is invalid. Expected: ${VALID_EXPECTATION_OUTCOMES.join(', ')}.`)
      }
    })
  }
  if (!Array.isArray(obj.surprise_events)) {
    errors.push('surprise_events must be an array.')
  }
  if (!isIntegerInRange(obj.alignment_score, 0, 100)) {
    errors.push('alignment_score must be an integer 0–100.')
  }

  return { ok: errors.length === 0, errors }
}

/**
 * Parses raw AI content and validates it as an expectation check output.
 *
 * @param {string} rawContent - Raw string returned by the OpenAI API.
 * @returns {object} Validated expectation check output.
 * @throws {Error} AI_PARSE_ERROR or AI_VALIDATION_ERROR.
 */
export function parseAndValidateExpectationCheck(rawContent) {
  const obj = parseJsonOutput(rawContent)
  const { ok, errors } = validateExpectationCheck(obj)
  if (!ok) {
    throw new Error(
      `AI_VALIDATION_ERROR: Expectation check output is invalid.\n${errors.join('\n')}`
    )
  }
  return obj
}

// ---------------------------------------------------------------------------
// Tomorrow outlook
// ---------------------------------------------------------------------------

/**
 * Validates a parsed tomorrow outlook AI output.
 *
 * Required fields: key_watchpoints, scheduled_events, outlook_summary, risk_level.
 *
 * @param {unknown} obj - Parsed AI output object.
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateTomorrowOutlook(obj) {
  const errors = []

  if (!obj || typeof obj !== 'object') {
    return { ok: false, errors: ['Output is not an object.'] }
  }

  if (!Array.isArray(obj.key_watchpoints) || obj.key_watchpoints.length === 0) {
    errors.push('key_watchpoints must be a non-empty array.')
  } else if (obj.key_watchpoints.length > 5) {
    errors.push('key_watchpoints must have at most 5 items.')
  } else {
    obj.key_watchpoints.forEach((w, i) => {
      if (!isString(w.title, 5, 100)) {
        errors.push(`key_watchpoints[${i}].title must be a string of 5–100 characters.`)
      }
      if (!isString(w.description, 20, 300)) {
        errors.push(`key_watchpoints[${i}].description must be a string of 20–300 characters.`)
      }
    })
  }
  if (!Array.isArray(obj.scheduled_events)) {
    errors.push('scheduled_events must be an array.')
  } else {
    obj.scheduled_events.forEach((e, i) => {
      if (!isString(e.title, 5, 150)) {
        errors.push(`scheduled_events[${i}].title must be a string of 5–150 characters.`)
      }
      if (!VALID_IMPACT_LEVELS.includes(e.impact)) {
        errors.push(`scheduled_events[${i}].impact "${e.impact}" is invalid. Expected: ${VALID_IMPACT_LEVELS.join(', ')}.`)
      }
    })
  }
  if (!isString(obj.outlook_summary, 50, 600)) {
    errors.push('outlook_summary must be a string of 50–600 characters.')
  }
  if (!VALID_RISK_LEVELS.includes(obj.risk_level)) {
    errors.push(`risk_level "${obj.risk_level}" is invalid. Expected: ${VALID_RISK_LEVELS.join(', ')}.`)
  }

  return { ok: errors.length === 0, errors }
}

/**
 * Parses raw AI content and validates it as a tomorrow outlook output.
 *
 * @param {string} rawContent - Raw string returned by the OpenAI API.
 * @returns {object} Validated tomorrow outlook output.
 * @throws {Error} AI_PARSE_ERROR or AI_VALIDATION_ERROR.
 */
export function parseAndValidateTomorrowOutlook(rawContent) {
  const obj = parseJsonOutput(rawContent)
  const { ok, errors } = validateTomorrowOutlook(obj)
  if (!ok) {
    throw new Error(
      `AI_VALIDATION_ERROR: Tomorrow outlook output is invalid.\n${errors.join('\n')}`
    )
  }
  return obj
}

// ---------------------------------------------------------------------------
// Video script
// ---------------------------------------------------------------------------

/**
 * Validates a parsed video script AI output.
 *
 * Required fields: intro, segments (min 2), outro, total_duration_seconds.
 *
 * @param {unknown} obj - Parsed AI output object.
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateVideoScript(obj) {
  const errors = []

  if (!obj || typeof obj !== 'object') {
    return { ok: false, errors: ['Output is not an object.'] }
  }

  if (!isString(obj.intro, 30, 500)) {
    errors.push('intro must be a string of 30–500 characters.')
  }
  if (!Array.isArray(obj.segments) || obj.segments.length < 2) {
    errors.push('segments must be an array with at least 2 items.')
  } else if (obj.segments.length > 5) {
    errors.push('segments must have at most 5 items.')
  } else {
    obj.segments.forEach((s, i) => {
      if (!isString(s.title, 3, 100)) {
        errors.push(`segments[${i}].title must be a string of 3–100 characters.`)
      }
      if (!isString(s.script, 50, 1500)) {
        errors.push(`segments[${i}].script must be a string of 50–1500 characters.`)
      }
      if (!isIntegerInRange(s.duration_seconds, 15, 120)) {
        errors.push(`segments[${i}].duration_seconds must be an integer 15–120.`)
      }
    })
  }
  if (!isString(obj.outro, 30, 400)) {
    errors.push('outro must be a string of 30–400 characters.')
  }
  if (!isIntegerInRange(obj.total_duration_seconds, 60, 600)) {
    errors.push('total_duration_seconds must be an integer 60–600.')
  }

  return { ok: errors.length === 0, errors }
}

/**
 * Parses raw AI content and validates it as a video script output.
 *
 * @param {string} rawContent - Raw string returned by the OpenAI API.
 * @returns {object} Validated video script output.
 * @throws {Error} AI_PARSE_ERROR or AI_VALIDATION_ERROR.
 */
export function parseAndValidateVideoScript(rawContent) {
  const obj = parseJsonOutput(rawContent)
  const { ok, errors } = validateVideoScript(obj)
  if (!ok) {
    throw new Error(
      `AI_VALIDATION_ERROR: Video script output is invalid.\n${errors.join('\n')}`
    )
  }
  return obj
}

// ---------------------------------------------------------------------------
// YouTube metadata
// ---------------------------------------------------------------------------

/**
 * Validates a parsed YouTube metadata AI output.
 *
 * Required fields: title, description, tags (min 5).
 *
 * @param {unknown} obj - Parsed AI output object.
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateYoutubeMetadata(obj) {
  const errors = []

  if (!obj || typeof obj !== 'object') {
    return { ok: false, errors: ['Output is not an object.'] }
  }

  if (!isString(obj.title, 10, 100)) {
    errors.push('title must be a string of 10–100 characters.')
  }
  if (!isString(obj.description, 100, 5000)) {
    errors.push('description must be a string of 100–5000 characters.')
  }
  if (!Array.isArray(obj.tags) || obj.tags.length < 5) {
    errors.push('tags must be an array with at least 5 items.')
  } else if (obj.tags.length > 15) {
    errors.push('tags must have at most 15 items.')
  } else {
    obj.tags.forEach((t, i) => {
      if (!isString(t, 2, 100)) {
        errors.push(`tags[${i}] must be a string of 2–100 characters.`)
      }
    })
  }
  if ('visibility' in obj && !VALID_VISIBILITIES.includes(obj.visibility)) {
    errors.push(`visibility "${obj.visibility}" is invalid. Expected: ${VALID_VISIBILITIES.join(', ')}.`)
  }

  return { ok: errors.length === 0, errors }
}

/**
 * Parses raw AI content and validates it as a YouTube metadata output.
 *
 * @param {string} rawContent - Raw string returned by the OpenAI API.
 * @returns {object} Validated YouTube metadata output.
 * @throws {Error} AI_PARSE_ERROR or AI_VALIDATION_ERROR.
 */
export function parseAndValidateYoutubeMetadata(rawContent) {
  const obj = parseJsonOutput(rawContent)
  const { ok, errors } = validateYoutubeMetadata(obj)
  if (!ok) {
    throw new Error(
      `AI_VALIDATION_ERROR: YouTube metadata output is invalid.\n${errors.join('\n')}`
    )
  }
  return obj
}
