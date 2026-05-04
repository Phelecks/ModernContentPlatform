/**
 * GET /api/day-status/:topicSlug/:dateKey
 *
 * Returns publish state and readiness for a topic/day page.
 *
 * Response shape:
 *   {
 *     topic_slug, date_key, page_state,
 *     display_name,
 *     alert_count, cluster_count,
 *     summary_available, video_available, article_available,
 *     prev_date_key, next_date_key,
 *     published_at
 *   }
 */
import { queryOne, jsonResponse, errorResponse, isValidTopicSlug, isValidDateKey } from '../../../lib/db.js'

export async function onRequestGet({ params, env }) {
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

  try {
    const row = await queryOne(
      db,
      `SELECT
         t.topic_slug AS topic_slug,
         ? AS date_key,
         COALESCE(ds.page_state, 'pending') AS page_state,
         t.display_name,
         COALESCE(ds.alert_count, 0) AS alert_count,
         COALESCE(ds.cluster_count, 0) AS cluster_count,
         COALESCE(ds.summary_available, 0) AS summary_available,
         COALESCE(ds.video_available, 0) AS video_available,
         COALESCE(ds.article_available, 0) AS article_available,
         ds.prev_date_key,
         ds.next_date_key,
         ds.published_at
       FROM topics t
       LEFT JOIN daily_status ds
         ON ds.topic_slug = t.topic_slug
        AND ds.date_key = ?
       WHERE t.topic_slug = ?`,
      [dateKey, dateKey, topicSlug]
    )

    if (!row) {
      return errorResponse(`Unknown topic: ${topicSlug}`, 404)
    }

    return jsonResponse(row, 200, { cacheTtl: 60, staleWhileRevalidate: true })
  } catch (err) {
    return errorResponse(`Failed to fetch day status: ${err.message}`)
  }
}
