/**
 * GET /api/topics
 *
 * Returns all active topics ordered by sort_order.
 *
 * Response shape:
 *   Array<{ topic_slug, display_name, description, sort_order }>
 */
import { queryAll, jsonResponse, errorResponse } from '../../lib/db.js'

export async function onRequestGet({ env }) {
  const db = env.DB
  if (!db) return errorResponse('Database not configured', 503)

  try {
    const topics = await queryAll(
      db,
      `SELECT topic_slug, display_name, description, sort_order
       FROM topics
       WHERE is_active = 1
       ORDER BY sort_order ASC, display_name ASC`
    )
    return jsonResponse(topics, 200, { cacheTtl: 300, staleWhileRevalidate: true })
  } catch (err) {
    console.error('[/api/topics] Failed to fetch topics:', err)
    return errorResponse('Failed to fetch topics')
  }
}
