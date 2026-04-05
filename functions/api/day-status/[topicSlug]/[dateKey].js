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
import { queryOne, jsonResponse, errorResponse } from '../../../lib/db.js'

export async function onRequestGet({ params, env }) {
  const { topicSlug, dateKey } = params
  if (!topicSlug || !dateKey) {
    return errorResponse('Missing topicSlug or dateKey', 400)
  }

  const db = env.DB
  if (!db) return errorResponse('Database not configured', 503)

  try {
    const row = await queryOne(
      db,
      `SELECT
         ds.topic_slug,
         ds.date_key,
         ds.page_state,
         t.display_name,
         ds.alert_count,
         ds.cluster_count,
         ds.summary_available,
         ds.video_available,
         ds.article_available,
         ds.prev_date_key,
         ds.next_date_key,
         ds.published_at
       FROM daily_status ds
       JOIN topics t ON t.topic_slug = ds.topic_slug
       WHERE ds.topic_slug = ? AND ds.date_key = ?`,
      [topicSlug, dateKey]
    )

    if (!row) {
      return jsonResponse(
        {
          topic_slug: topicSlug,
          date_key: dateKey,
          page_state: 'pending',
          display_name: topicSlug,
          alert_count: 0,
          cluster_count: 0,
          summary_available: 0,
          video_available: 0,
          article_available: 0,
          prev_date_key: null,
          next_date_key: null,
          published_at: null
        },
        200
      )
    }

    return jsonResponse(row)
  } catch (err) {
    return errorResponse(`Failed to fetch day status: ${err.message}`)
  }
}
