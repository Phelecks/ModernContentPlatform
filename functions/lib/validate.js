/**
 * Payload validation for internal write endpoints.
 *
 * Each validator returns { valid: true, data: <cleaned payload> }
 * or { valid: false, error: <message> }.
 *
 * Validators enforce the same rules as the workflow contracts in
 * schemas/workflow/ and the D1 column constraints in db/migrations/.
 * Unknown fields are rejected (matching additionalProperties: false).
 */
import { isValidTopicSlug, isValidDateKey, isValidISOTimestamp } from './db.js'

const VALID_TOPICS = ['crypto', 'finance', 'economy', 'health', 'ai', 'energy', 'technology']
const VALID_PAGE_STATES = ['pending', 'ready', 'published', 'error']
const VALID_JOB_STATUSES = ['pending', 'running', 'success', 'failed', 'retrying']
const VALID_TRIGGERS = ['schedule', 'manual', 'retry']
const VALID_SOURCE_TYPES = ['rss', 'api', 'social', 'webhook', 'x_account', 'x_query']
const VALID_TRUST_TIERS = ['T1', 'T2', 'T3', 'T4']
const VALID_INGESTION_METHODS = ['poll', 'push', 'manual']

function ok(data) { return { valid: true, data } }
function fail(error) { return { valid: false, error } }

function isScore(v) {
  return Number.isInteger(v) && v >= 0 && v <= 100
}

function isNonEmptyString(v, maxLen) {
  return typeof v === 'string' && v.length > 0 && (maxLen === undefined || v.length <= maxLen)
}

function isOptionalString(v, maxLen) {
  if (v === null || v === undefined) return true
  return typeof v === 'string' && (maxLen === undefined || v.length <= maxLen)
}

/**
 * Check for unexpected keys in the payload.
 * @param {Object} body
 * @param {string[]} allowedKeys
 * @returns {string|null} error message or null
 */
function checkUnknownKeys(body, allowedKeys) {
  const allowed = new Set(allowedKeys)
  const unknown = Object.keys(body).filter(k => !allowed.has(k))
  if (unknown.length > 0) {
    return `Unknown fields not allowed: ${unknown.join(', ')}`
  }
  return null
}

/**
 * Basic URL format validation.
 * Accepts http: and https: URLs with a host component.
 * @param {string} value
 * @returns {boolean}
 */
function isValidUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

const ALERT_ALLOWED_KEYS = [
  'topic_slug', 'date_key', 'headline', 'summary_text', 'source_name',
  'severity_score', 'importance_score', 'confidence_score',
  'event_at', 'source_url', 'cluster_label', 'alert_reason',
  'secondary_topics', 'item_id'
]

/**
 * Validate an alert write payload.
 *
 * Required: topic_slug, date_key, headline, summary_text, source_name,
 *   severity_score, importance_score, confidence_score, event_at
 * Optional: source_url, cluster_label, alert_reason, secondary_topics, item_id
 */
export function validateAlertPayload(body) {
  if (!body || typeof body !== 'object') return fail('Request body must be a JSON object')

  const unknownError = checkUnknownKeys(body, ALERT_ALLOWED_KEYS)
  if (unknownError) return fail(unknownError)

  const {
    topic_slug, date_key, headline, summary_text, source_name,
    severity_score, importance_score, confidence_score,
    event_at, source_url, cluster_label, alert_reason,
    secondary_topics, item_id
  } = body

  if (!isValidTopicSlug(topic_slug) || !VALID_TOPICS.includes(topic_slug)) {
    return fail(`Invalid topic_slug: must be one of ${VALID_TOPICS.join(', ')}`)
  }
  if (!isValidDateKey(date_key)) {
    return fail('Invalid date_key: expected YYYY-MM-DD format')
  }
  if (!isNonEmptyString(headline, 250)) {
    return fail('headline is required and must be a non-empty string (max 250 chars)')
  }
  if (!isNonEmptyString(summary_text, 500)) {
    return fail('summary_text is required and must be a non-empty string (max 500 chars)')
  }
  if (!isNonEmptyString(source_name)) {
    return fail('source_name is required and must be a non-empty string')
  }
  if (!isScore(severity_score)) {
    return fail('severity_score must be an integer between 0 and 100')
  }
  if (!isScore(importance_score)) {
    return fail('importance_score must be an integer between 0 and 100')
  }
  if (!isScore(confidence_score)) {
    return fail('confidence_score must be an integer between 0 and 100')
  }
  if (!isValidISOTimestamp(event_at)) {
    return fail('event_at must be a valid ISO-8601 date-time string')
  }
  if (source_url !== undefined && source_url !== null) {
    if (typeof source_url !== 'string') return fail('source_url must be a string or null')
    if (!isValidUrl(source_url)) return fail('source_url must be a valid HTTP or HTTPS URL')
  }
  if (!isOptionalString(cluster_label, 100)) {
    return fail('cluster_label must be a string (max 100 chars) or null')
  }
  if (!isOptionalString(alert_reason)) {
    return fail('alert_reason must be a string or null')
  }
  if (!isOptionalString(item_id)) {
    return fail('item_id must be a string or null')
  }
  if (secondary_topics !== undefined && secondary_topics !== null) {
    if (!Array.isArray(secondary_topics)) return fail('secondary_topics must be an array')
    if (secondary_topics.length > 2) return fail('secondary_topics allows at most 2 items')
    for (const t of secondary_topics) {
      if (!VALID_TOPICS.includes(t)) {
        return fail(`Invalid secondary topic: ${t}`)
      }
    }
  }

  return ok({
    topic_slug, date_key, headline, summary_text, source_name,
    severity_score, importance_score, confidence_score, event_at,
    source_url: source_url ?? null,
    cluster_label: cluster_label ?? null,
    alert_reason: alert_reason ?? null,
    secondary_topics: secondary_topics ?? [],
    item_id: item_id ?? null
  })
}

const DAILY_STATUS_ALLOWED_KEYS = [
  'topic_slug', 'date_key', 'page_state',
  'alert_count', 'cluster_count',
  'summary_available', 'video_available', 'article_available'
]

/**
 * Validate a daily_status write payload.
 *
 * Required: topic_slug, date_key
 * Optional: page_state, alert_count, cluster_count,
 *   summary_available, video_available, article_available
 */
export function validateDailyStatusPayload(body) {
  if (!body || typeof body !== 'object') return fail('Request body must be a JSON object')

  const unknownError = checkUnknownKeys(body, DAILY_STATUS_ALLOWED_KEYS)
  if (unknownError) return fail(unknownError)

  const {
    topic_slug, date_key, page_state,
    alert_count, cluster_count,
    summary_available, video_available, article_available
  } = body

  if (!isValidTopicSlug(topic_slug) || !VALID_TOPICS.includes(topic_slug)) {
    return fail(`Invalid topic_slug: must be one of ${VALID_TOPICS.join(', ')}`)
  }
  if (!isValidDateKey(date_key)) {
    return fail('Invalid date_key: expected YYYY-MM-DD format')
  }
  if (page_state !== undefined && !VALID_PAGE_STATES.includes(page_state)) {
    return fail(`Invalid page_state: must be one of ${VALID_PAGE_STATES.join(', ')}`)
  }
  if (alert_count !== undefined && (!Number.isInteger(alert_count) || alert_count < 0)) {
    return fail('alert_count must be a non-negative integer')
  }
  if (cluster_count !== undefined && (!Number.isInteger(cluster_count) || cluster_count < 0)) {
    return fail('cluster_count must be a non-negative integer')
  }
  for (const field of ['summary_available', 'video_available', 'article_available']) {
    const val = body[field]
    if (val !== undefined && val !== 0 && val !== 1) {
      return fail(`${field} must be 0 or 1`)
    }
  }

  return ok({
    topic_slug, date_key,
    page_state: page_state ?? 'ready',
    alert_count: alert_count ?? 0,
    cluster_count: cluster_count ?? 0,
    summary_available: summary_available ?? 0,
    video_available: video_available ?? 0,
    article_available: article_available ?? 0
  })
}

const VALID_EVENT_TYPES = ['info', 'warning', 'error', 'retry', 'completed']

const WORKFLOW_LOG_ALLOWED_KEYS = [
  'workflow_name', 'execution_id', 'topic_slug', 'date_key',
  'event_type', 'module_name', 'error_message', 'error_details', 'metadata_json'
]

/**
 * Validate a workflow_logs write payload.
 *
 * Required: workflow_name
 * Optional: execution_id, topic_slug, date_key, event_type, module_name,
 *   error_message, error_details, metadata_json
 */
export function validateWorkflowLogPayload(body) {
  if (!body || typeof body !== 'object') return fail('Request body must be a JSON object')

  const unknownError = checkUnknownKeys(body, WORKFLOW_LOG_ALLOWED_KEYS)
  if (unknownError) return fail(unknownError)

  const {
    workflow_name, execution_id, topic_slug, date_key,
    event_type, module_name, error_message, error_details, metadata_json
  } = body

  if (!isNonEmptyString(workflow_name, 200)) {
    return fail('workflow_name is required and must be a non-empty string (max 200 chars)')
  }
  if (execution_id !== undefined && execution_id !== null) {
    if (typeof execution_id !== 'string' && typeof execution_id !== 'number') {
      return fail('execution_id must be a string, number, or null')
    }
  }
  if (topic_slug !== undefined && topic_slug !== null) {
    if (!isValidTopicSlug(topic_slug) || !VALID_TOPICS.includes(topic_slug)) {
      return fail(`Invalid topic_slug: must be one of ${VALID_TOPICS.join(', ')}`)
    }
  }
  if (date_key !== undefined && date_key !== null) {
    if (!isValidDateKey(date_key)) {
      return fail('Invalid date_key: expected YYYY-MM-DD format')
    }
  }
  if (event_type !== undefined && !VALID_EVENT_TYPES.includes(event_type)) {
    return fail(`Invalid event_type: must be one of ${VALID_EVENT_TYPES.join(', ')}`)
  }
  if (!isOptionalString(module_name, 200)) {
    return fail('module_name must be a string (max 200 chars) or null')
  }
  if (!isOptionalString(error_message)) {
    return fail('error_message must be a string or null')
  }
  const resolvedEventType = event_type ?? 'info'
  if ((resolvedEventType === 'error' || resolvedEventType === 'retry') &&
      !isNonEmptyString(error_message)) {
    return fail('error_message is required and must be a non-empty string for error and retry events')
  }
  if (!isOptionalString(error_details)) {
    return fail('error_details must be a string or null')
  }
  if (!isOptionalString(metadata_json)) {
    return fail('metadata_json must be a string or null')
  }

  return ok({
    workflow_name,
    execution_id: execution_id != null ? String(execution_id) : null,
    topic_slug: topic_slug ?? null,
    date_key: date_key ?? null,
    event_type: resolvedEventType,
    module_name: module_name ?? null,
    error_message: error_message ?? null,
    error_details: error_details ?? null,
    metadata_json: metadata_json ?? null
  })
}

const PUBLISH_JOB_ALLOWED_KEYS = [
  'topic_slug', 'date_key', 'status', 'attempt', 'triggered_by',
  'workflow_run_id', 'error_message', 'id'
]

/**
 * Validate a publish_jobs write payload.
 *
 * Required: topic_slug, date_key
 * Optional: status, attempt, triggered_by, workflow_run_id, error_message, id
 */
export function validatePublishJobPayload(body) {
  if (!body || typeof body !== 'object') return fail('Request body must be a JSON object')

  const unknownError = checkUnknownKeys(body, PUBLISH_JOB_ALLOWED_KEYS)
  if (unknownError) return fail(unknownError)

  const {
    topic_slug, date_key, status, attempt, triggered_by,
    workflow_run_id, error_message
  } = body

  if (!isValidTopicSlug(topic_slug) || !VALID_TOPICS.includes(topic_slug)) {
    return fail(`Invalid topic_slug: must be one of ${VALID_TOPICS.join(', ')}`)
  }
  if (!isValidDateKey(date_key)) {
    return fail('Invalid date_key: expected YYYY-MM-DD format')
  }
  if (status !== undefined && !VALID_JOB_STATUSES.includes(status)) {
    return fail(`Invalid status: must be one of ${VALID_JOB_STATUSES.join(', ')}`)
  }
  if (attempt !== undefined && (!Number.isInteger(attempt) || attempt < 1)) {
    return fail('attempt must be a positive integer')
  }
  if (triggered_by !== undefined && triggered_by !== null && !VALID_TRIGGERS.includes(triggered_by)) {
    return fail(`Invalid triggered_by: must be one of ${VALID_TRIGGERS.join(', ')}`)
  }
  if (!isOptionalString(workflow_run_id)) {
    return fail('workflow_run_id must be a string or null')
  }
  if (!isOptionalString(error_message)) {
    return fail('error_message must be a string or null')
  }

  return ok({
    topic_slug, date_key,
    status: status ?? 'pending',
    attempt: attempt ?? 1,
    triggered_by: triggered_by ?? null,
    workflow_run_id: workflow_run_id ?? null,
    error_message: error_message ?? null
  })
}

const SOURCE_ALLOWED_KEYS = [
  'source_slug', 'source_name', 'topic_slug', 'source_type',
  'trust_tier', 'trust_score', 'priority_weight', 'url',
  'is_active', 'poll_interval_minutes', 'ingestion_method', 'metadata_json'
]

/**
 * Validate a source slug: 1-100 chars, lowercase letters and digits,
 * with optional internal hyphens.
 * @param {string} v
 * @returns {boolean}
 */
function isValidSourceSlug(v) {
  return typeof v === 'string' && /^(?:[a-z0-9]|[a-z0-9][a-z0-9-]*[a-z0-9])$/.test(v) && v.length <= 100
}

/**
 * Validate a source registry write payload.
 *
 * Required: source_slug, source_name, topic_slug, source_type
 * Optional: trust_tier, trust_score, priority_weight, url,
 *   is_active, poll_interval_minutes, ingestion_method, metadata_json
 */
export function validateSourcePayload(body) {
  if (!body || typeof body !== 'object') return fail('Request body must be a JSON object')

  const unknownError = checkUnknownKeys(body, SOURCE_ALLOWED_KEYS)
  if (unknownError) return fail(unknownError)

  const {
    source_slug, source_name, topic_slug, source_type,
    trust_tier, trust_score, priority_weight, url,
    is_active, poll_interval_minutes, ingestion_method, metadata_json
  } = body

  if (!isValidSourceSlug(source_slug)) {
    return fail('source_slug is required and must contain only lowercase letters, digits, and hyphens (max 100 chars)')
  }
  if (!isNonEmptyString(source_name, 200)) {
    return fail('source_name is required and must be a non-empty string (max 200 chars)')
  }
  if (!isValidTopicSlug(topic_slug) || !VALID_TOPICS.includes(topic_slug)) {
    return fail(`Invalid topic_slug: must be one of ${VALID_TOPICS.join(', ')}`)
  }
  if (!VALID_SOURCE_TYPES.includes(source_type)) {
    return fail(`Invalid source_type: must be one of ${VALID_SOURCE_TYPES.join(', ')}`)
  }
  if (trust_tier !== undefined && !VALID_TRUST_TIERS.includes(trust_tier)) {
    return fail(`Invalid trust_tier: must be one of ${VALID_TRUST_TIERS.join(', ')}`)
  }
  if (trust_score !== undefined && !isScore(trust_score)) {
    return fail('trust_score must be an integer between 0 and 100')
  }
  if (priority_weight !== undefined && !isScore(priority_weight)) {
    return fail('priority_weight must be an integer between 0 and 100')
  }
  if (url !== undefined && url !== null) {
    if (typeof url !== 'string') return fail('url must be a string or null')
    if (!isValidUrl(url)) return fail('url must be a valid HTTP or HTTPS URL')
  }
  if (is_active !== undefined && is_active !== 0 && is_active !== 1) {
    return fail('is_active must be 0 or 1')
  }
  if (poll_interval_minutes !== undefined) {
    if (!Number.isInteger(poll_interval_minutes) || poll_interval_minutes < 1 || poll_interval_minutes > 1440) {
      return fail('poll_interval_minutes must be an integer between 1 and 1440')
    }
  }
  if (ingestion_method !== undefined && !VALID_INGESTION_METHODS.includes(ingestion_method)) {
    return fail(`Invalid ingestion_method: must be one of ${VALID_INGESTION_METHODS.join(', ')}`)
  }
  if (!isOptionalString(metadata_json)) {
    return fail('metadata_json must be a string or null')
  }

  return ok({
    source_slug,
    source_name,
    topic_slug,
    source_type,
    trust_tier: trust_tier ?? 'T3',
    trust_score: trust_score ?? 50,
    priority_weight: priority_weight ?? 50,
    url: url ?? null,
    is_active: is_active ?? 1,
    poll_interval_minutes: poll_interval_minutes ?? 15,
    ingestion_method: ingestion_method ?? 'poll',
    metadata_json: metadata_json ?? null
  })
}
