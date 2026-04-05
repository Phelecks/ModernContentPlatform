/**
 * GET /api/navigation/:topicSlug/:dateKey
 *
 * Returns the previous and next published day keys for a topic.
 * These are read from daily_status and allow the DateNavigator to build links.
 *
 * Response shape:
 *   { prev_date_key: string|null, next_date_key: string|null }
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
      `SELECT prev_date_key, next_date_key
       FROM daily_status
       WHERE topic_slug = ? AND date_key = ?`,
      [topicSlug, dateKey]
    )

    return jsonResponse({
      prev_date_key: row?.prev_date_key ?? null,
      next_date_key: row?.next_date_key ?? null
    })
  } catch (err) {
    return errorResponse(`Failed to fetch navigation: ${err.message}`)
  }
}
