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
 *       required fields are absent or out of range.  Return the parsed object
 *       on success (the object is not normalised or clamped — callers that
 *       need normalisation should apply it separately after validation).
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
export const VALID_IMAGE_FORMATS = ['url', 'b64_json']
export const VALID_IMAGE_PROVIDERS = ['openai', 'google']
export const VALID_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp']

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
  const cleaned = rawContent.replace(/^```[a-zA-Z]*\r?\n?|\r?\n?```$/g, '').trim()
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
  if ('secondary_topics' in obj) {
    if (!Array.isArray(obj.secondary_topics)) {
      errors.push('secondary_topics must be an array when present.')
    } else if (obj.secondary_topics.length > 2) {
      errors.push('secondary_topics must have at most 2 items.')
    } else {
      obj.secondary_topics.forEach((t, i) => {
        if (!VALID_TOPICS.includes(t)) {
          errors.push(`secondary_topics[${i}] "${t}" is not a valid topic. Expected one of: ${VALID_TOPICS.join(', ')}.`)
        }
      })
    }
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
  } else if (obj.cluster_label !== null && !isString(obj.cluster_label, 1, 100)) {
    errors.push('cluster_label must be a string of 1–100 characters or null.')
  }

  if ('supporting_sources' in obj && obj.supporting_sources !== null) {
    if (!Array.isArray(obj.supporting_sources)) {
      errors.push('supporting_sources must be an array or null when present.')
    } else if (obj.supporting_sources.length > 5) {
      errors.push('supporting_sources must have at most 5 items.')
    } else {
      const VALID_SS_SOURCE_TYPES = ['rss', 'api', 'social', 'webhook', 'x_account', 'x_query']
      const VALID_SS_ROLES = ['confirmation', 'data', 'commentary', 'official']
      obj.supporting_sources.forEach((ss, i) => {
        if (!ss || typeof ss !== 'object') {
          errors.push(`supporting_sources[${i}] must be an object.`)
          return
        }
        if (typeof ss.source_name !== 'string' || ss.source_name.trim() === '') {
          errors.push(`supporting_sources[${i}].source_name must be a non-empty string.`)
        }
        if ('source_url' in ss && ss.source_url !== null) {
          if (typeof ss.source_url !== 'string' || !/^https?:\/\//i.test(ss.source_url)) {
            errors.push(`supporting_sources[${i}].source_url must be an HTTP or HTTPS URL or null.`)
          }
        }
        if ('source_type' in ss && ss.source_type !== null && !VALID_SS_SOURCE_TYPES.includes(ss.source_type)) {
          errors.push(`supporting_sources[${i}].source_type "${ss.source_type}" is not valid. Expected one of: ${VALID_SS_SOURCE_TYPES.join(', ')}, or null.`)
        }
        if ('source_role' in ss && ss.source_role !== null && !VALID_SS_ROLES.includes(ss.source_role)) {
          errors.push(`supporting_sources[${i}].source_role "${ss.source_role}" is not valid. Expected one of: ${VALID_SS_ROLES.join(', ')}, or null.`)
        }
      })
    }
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
  if ('source_attribution' in obj && obj.source_attribution !== null && !isString(obj.source_attribution, 1, 100)) {
    errors.push('source_attribution must be a string of 1–100 characters or null.')
  }
  if ('source_url' in obj && obj.source_url !== null) {
    if (typeof obj.source_url !== 'string' || !/^https?:\/\//i.test(obj.source_url)) {
      errors.push('source_url must be an HTTP or HTTPS URL or null.')
    }
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
  } else if (obj.expectations_checked.length > 5) {
    errors.push('expectations_checked must have at most 5 items.')
  } else {
    obj.expectations_checked.forEach((e, i) => {
      if (!isString(e.expectation, 10, 200)) {
        errors.push(`expectations_checked[${i}].expectation must be a string of 10–200 characters.`)
      }
      if (!VALID_EXPECTATION_OUTCOMES.includes(e.outcome)) {
        errors.push(`expectations_checked[${i}].outcome "${e.outcome}" is invalid. Expected: ${VALID_EXPECTATION_OUTCOMES.join(', ')}.`)
      }
      if ('source' in e && e.source !== null) {
        if (typeof e.source !== 'object' || Array.isArray(e.source)) {
          errors.push(`expectations_checked[${i}].source must be an object or null.`)
        } else if (typeof e.source.source_name !== 'string' || e.source.source_name.trim() === '') {
          errors.push(`expectations_checked[${i}].source.source_name must be a non-empty string.`)
        } else if ('source_url' in e.source && e.source.source_url !== null) {
          if (typeof e.source.source_url !== 'string' || !/^https?:\/\//i.test(e.source.source_url)) {
            errors.push(`expectations_checked[${i}].source.source_url must be an HTTP or HTTPS URL or null.`)
          }
        }
      }
    })
  }
  if (!Array.isArray(obj.surprise_events)) {
    errors.push('surprise_events must be an array.')
  } else if (obj.surprise_events.length > 5) {
    errors.push('surprise_events must have at most 5 items.')
  } else {
    obj.surprise_events.forEach((s, i) => {
      if (!isString(s, 10, 200)) {
        errors.push(`surprise_events[${i}] must be a string of 10–200 characters.`)
      }
    })
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
      if ('source' in w && w.source !== null) {
        if (typeof w.source !== 'object' || Array.isArray(w.source)) {
          errors.push(`key_watchpoints[${i}].source must be an object or null.`)
        } else if (typeof w.source.source_name !== 'string' || w.source.source_name.trim() === '') {
          errors.push(`key_watchpoints[${i}].source.source_name must be a non-empty string.`)
        } else if ('source_url' in w.source && w.source.source_url !== null) {
          if (typeof w.source.source_url !== 'string' || !/^https?:\/\//i.test(w.source.source_url)) {
            errors.push(`key_watchpoints[${i}].source.source_url must be an HTTP or HTTPS URL or null.`)
          }
        }
      }
    })
  }
  if (!Array.isArray(obj.scheduled_events)) {
    errors.push('scheduled_events must be an array.')
  } else if (obj.scheduled_events.length > 5) {
    errors.push('scheduled_events must have at most 5 items.')
  } else {
    obj.scheduled_events.forEach((e, i) => {
      if (!isString(e.title, 5, 150)) {
        errors.push(`scheduled_events[${i}].title must be a string of 5–150 characters.`)
      }
      if (!VALID_IMPACT_LEVELS.includes(e.impact)) {
        errors.push(`scheduled_events[${i}].impact "${e.impact}" is invalid. Expected: ${VALID_IMPACT_LEVELS.join(', ')}.`)
      }
      if ('time_hint' in e && e.time_hint !== null && !isString(e.time_hint, 1, 50)) {
        errors.push(`scheduled_events[${i}].time_hint must be a string of 1–50 characters or null.`)
      }
      if ('source' in e && e.source !== null) {
        if (typeof e.source !== 'object' || Array.isArray(e.source)) {
          errors.push(`scheduled_events[${i}].source must be an object or null.`)
        } else if (typeof e.source.source_name !== 'string' || e.source.source_name.trim() === '') {
          errors.push(`scheduled_events[${i}].source.source_name must be a non-empty string.`)
        } else if ('source_url' in e.source && e.source.source_url !== null) {
          if (typeof e.source.source_url !== 'string' || !/^https?:\/\//i.test(e.source.source_url)) {
            errors.push(`scheduled_events[${i}].source.source_url must be an HTTP or HTTPS URL or null.`)
          }
        }
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

// ---------------------------------------------------------------------------
// Image generation asset
// ---------------------------------------------------------------------------

/**
 * Validates a normalized image generation asset object.
 *
 * This is not a direct AI JSON output — it is the normalized asset record
 * produced by the 06b_generate_images workflow Code node after consuming
 * the provider-specific API response (OpenAI images/generations or Google
 * Imagen).  Validation here confirms the normalization step is correct and
 * the downstream media pipeline receives a consistent contract.
 *
 * Required top-level fields: images (array, min 1), image_count, provider,
 * model, generated_at.
 *
 * Each images[] entry must have: index, prompt, provider, model, format,
 * generated_at.  The url/b64_json field must be non-null according to
 * format.
 *
 * @param {unknown} obj - Parsed image generation asset object.
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateImageGenerationAsset(obj) {
  const errors = []

  if (!obj || typeof obj !== 'object') {
    return { ok: false, errors: ['Output is not an object.'] }
  }

  if (!Array.isArray(obj.images) || obj.images.length < 1) {
    errors.push('images must be a non-empty array.')
  } else if (obj.images.length > 4) {
    errors.push('images must have at most 4 entries.')
  } else {
    obj.images.forEach((img, i) => {
      const prefix = `images[${i}]`

      if (!img || typeof img !== 'object') {
        errors.push(`${prefix} must be an object.`)
        return
      }

      if (typeof img.index !== 'number' || img.index < 0) {
        errors.push(`${prefix}.index must be a non-negative integer.`)
      }

      if (!isString(img.prompt, 10, 2000)) {
        errors.push(`${prefix}.prompt must be a string of 10–2000 characters.`)
      }

      if (!VALID_IMAGE_PROVIDERS.includes(img.provider)) {
        errors.push(`${prefix}.provider "${img.provider}" is invalid. Expected: ${VALID_IMAGE_PROVIDERS.join(', ')}.`)
      }

      if (!isString(img.model, 1, 100)) {
        errors.push(`${prefix}.model must be a non-empty string up to 100 characters.`)
      }

      if (!VALID_IMAGE_FORMATS.includes(img.format)) {
        errors.push(`${prefix}.format "${img.format}" is invalid. Expected: ${VALID_IMAGE_FORMATS.join(', ')}.`)
      } else if (img.format === 'url') {
        if (!isString(img.url, 1)) {
          errors.push(`${prefix}.url must be a non-empty string when format is 'url'.`)
        }
      } else if (img.format === 'b64_json') {
        if (!isString(img.b64_json, 1)) {
          errors.push(`${prefix}.b64_json must be a non-empty string when format is 'b64_json'.`)
        }
        if (img.mime_type !== null && img.mime_type !== undefined && !VALID_IMAGE_MIME_TYPES.includes(img.mime_type)) {
          errors.push(`${prefix}.mime_type "${img.mime_type}" is invalid. Expected one of: ${VALID_IMAGE_MIME_TYPES.join(', ')}.`)
        }
      }

      if (!isString(img.generated_at, 10)) {
        errors.push(`${prefix}.generated_at must be a non-empty ISO 8601 timestamp string.`)
      }
    })
  }

  if (typeof obj.image_count !== 'number' || obj.image_count < 1 || obj.image_count > 4) {
    errors.push('image_count must be an integer between 1 and 4.')
  } else if (Array.isArray(obj.images) && obj.image_count !== obj.images.length) {
    errors.push(`image_count (${obj.image_count}) must equal images.length (${obj.images.length}).`)
  }

  if (!VALID_IMAGE_PROVIDERS.includes(obj.provider)) {
    errors.push(`provider "${obj.provider}" is invalid. Expected: ${VALID_IMAGE_PROVIDERS.join(', ')}.`)
  }

  if (!isString(obj.model, 1, 100)) {
    errors.push('model must be a non-empty string up to 100 characters.')
  }

  if (!isString(obj.generated_at, 10)) {
    errors.push('generated_at must be a non-empty ISO 8601 timestamp string.')
  }

  return { ok: errors.length === 0, errors }
}

/**
 * Validates an image generation asset object.
 *
 * Unlike most other parseAndValidate* functions this does not call
 * parseJsonOutput() because the image asset is produced by the workflow
 * Code node rather than returned as raw JSON text by an AI model.
 * Callers pass a pre-parsed object directly.
 *
 * Throws AI_VALIDATION_ERROR when required fields are absent or invalid.
 *
 * @param {object} obj - Pre-parsed image generation asset object.
 * @returns {object} The validated object (unmodified).
 * @throws {Error} AI_VALIDATION_ERROR.
 */
export function parseAndValidateImageGenerationAsset(obj) {
  const { ok, errors } = validateImageGenerationAsset(obj)
  if (!ok) {
    throw new Error(
      `AI_VALIDATION_ERROR: Image generation asset is invalid.\n${errors.join('\n')}`
    )
  }
  return obj
}
