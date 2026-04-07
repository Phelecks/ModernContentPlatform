/**
 * Payload validation for internal write endpoints.
 *
 * Each validator returns { valid: true, data: <cleaned payload> }
 * or { valid: false, error: <message> }.
 *
 * Validators enforce the same rules as the workflow contracts in
 * schemas/workflow/ and the D1 column constraints in db/migrations/.
 */
import { isValidTopicSlug, isValidDateKey, isValidISOTimestamp } from './db.js'

const VALID_TOPICS = ['crypto', 'finance', 'economy', 'health', 'ai', 'energy', 'technology']
const VALID_ALERT_STATUSES = ['active', 'archived', 'suppressed']
const VALID_PAGE_STATES = ['pending', 'ready', 'published', 'error']
const VALID_JOB_STATUSES = ['pending', 'running', 'success', 'failed', 'retrying']
const VALID_TRIGGERS = ['schedule', 'manual', 'retry']

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
 * Validate an alert write payload.
 *
 * Required: topic_slug, date_key, headline, summary_text, source_name,
 *   severity_score, importance_score, confidence_score, event_at
 * Optional: source_url, cluster_label, alert_reason, secondary_topics, item_id
 */
export function validateAlertPayload(body) {
  if (!body || typeof body !== 'object') return fail('Request body must be a JSON object')

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

/**
 * Validate a daily_status write payload.
 *
 * Required: topic_slug, date_key
 * Optional: page_state, alert_count, cluster_count,
 *   summary_available, video_available, article_available
 */
export function validateDailyStatusPayload(body) {
  if (!body || typeof body !== 'object') return fail('Request body must be a JSON object')

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

/**
 * Validate a publish_jobs write payload.
 *
 * Required: topic_slug, date_key
 * Optional: status, triggered_by, workflow_run_id, error_message
 */
export function validatePublishJobPayload(body) {
  if (!body || typeof body !== 'object') return fail('Request body must be a JSON object')

  const {
    topic_slug, date_key, status, triggered_by,
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
    triggered_by: triggered_by ?? null,
    workflow_run_id: workflow_run_id ?? null,
    error_message: error_message ?? null
  })
}
