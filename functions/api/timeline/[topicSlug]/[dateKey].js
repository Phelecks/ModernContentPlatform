/**
 * GET /api/timeline/:topicSlug/:dateKey?limit=30&before=<iso-timestamp>
 *
 * Returns paginated alerts for a topic/day, newest first.
 *
 * Query params:
 *   limit  - number of alerts to return (default 30, max 100)
 *   before - ISO-8601 cursor: return alerts with event_at < before
 *
 * Response shape:
 *   {
 *     alerts: Array<{ id, headline, summary_text, source_name, source_url,
 *                     source_type, source_domain, source_metadata_json,
 *                     severity_score, importance_score, confidence_score, event_at }>,
 *     total: number,
 *     has_more: boolean
 *   }
 */
import { queryAll, queryOne, jsonResponse, errorResponse, isValidTopicSlug, isValidDateKey, isValidISOTimestamp } from '../../../lib/db.js'

const MAX_LIMIT = 100
const DEFAULT_LIMIT = 30

export async function onRequestGet({ params, request, env }) {
  const { topicSlug, dateKey } = params
  if (!topicSlug || !dateKey) {
    return errorResponse('Missing topicSlug or dateKey', 400)
  }
  if (!isValidTopicSlug(topicSlug)) {
    return errorResponse('Invalid topicSlug format', 400)
  }
  if (!isValidDateKey(dateKey)) {
    return errorResponse('Invalid dateKey format — expected YYYY-MM-DD', 400)
  }

  const db = env.DB
  if (!db) return errorResponse('Database not configured', 503)

  const url = new URL(request.url)
  const rawLimit = Number(url.searchParams.get('limit'))
  const limit = Number.isFinite(rawLimit) && rawLimit >= 1
    ? Math.min(Math.floor(rawLimit), MAX_LIMIT)
    : DEFAULT_LIMIT
  const before = url.searchParams.get('before') || null
  if (before !== null && !isValidISOTimestamp(before)) {
    return errorResponse('Invalid before cursor — expected ISO-8601 date-time', 400)
  }

  try {
    const topicRow = await queryOne(db, `SELECT 1 FROM topics WHERE topic_slug = ? AND is_active = 1`, [topicSlug])
    if (!topicRow) {
      return errorResponse(`Unknown topic: ${topicSlug}`, 404)
    }

    let sql
    let bindParams

    if (before) {
      sql = `SELECT id, headline, summary_text, source_name, source_url,
                    source_type, source_domain, source_metadata_json,
                    severity_score, importance_score, confidence_score, event_at
             FROM alerts
             WHERE topic_slug = ? AND date_key = ? AND status = 'active' AND event_at < ?
             ORDER BY event_at DESC
             LIMIT ?`
      bindParams = [topicSlug, dateKey, before, limit + 1]
    } else {
      sql = `SELECT id, headline, summary_text, source_name, source_url,
                    source_type, source_domain, source_metadata_json,
                    severity_score, importance_score, confidence_score, event_at
             FROM alerts
             WHERE topic_slug = ? AND date_key = ? AND status = 'active'
             ORDER BY event_at DESC
             LIMIT ?`
      bindParams = [topicSlug, dateKey, limit + 1]
    }

    const rows = await queryAll(db, sql, bindParams)
    const hasMore = rows.length > limit
    const alerts = hasMore ? rows.slice(0, limit) : rows

    // Only fetch total count on the first page (no cursor) to avoid extra query on paginated reads
    let total = 0
    if (!before) {
      const countRow = await queryOne(
        db,
        `SELECT COUNT(*) as total FROM alerts WHERE topic_slug = ? AND date_key = ? AND status = 'active'`,
        [topicSlug, dateKey]
      )
      total = countRow?.total ?? 0
    } else {
      // For cursor-based pages, total is not re-fetched to save a query
      total = -1
    }

    return jsonResponse({
      alerts,
      total,
      has_more: hasMore
    }, 200, { cacheTtl: 30, staleWhileRevalidate: true })
  } catch (err) {
    return errorResponse(`Failed to fetch timeline: ${err.message}`)
  }
}
