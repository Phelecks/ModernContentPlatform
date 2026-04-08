/**
 * GET /api/sources
 *
 * Returns active sources, optionally filtered by topic_slug.
 *
 * Query params:
 *   topic (optional) — filter by topic_slug
 *
 * Response shape:
 *   Array<{ source_slug, source_name, topic_slug, source_type,
 *           trust_tier, trust_score, priority_weight, url,
 *           poll_interval_minutes, ingestion_method }>
 */
import { queryAll, jsonResponse, errorResponse, isValidTopicSlug } from '../../lib/db.js'

export async function onRequestGet({ request, env }) {
  const db = env.DB
  if (!db) return errorResponse('Database not configured', 503)

  const url = new URL(request.url)
  const topic = url.searchParams.get('topic')

  try {
    let sql = `
      SELECT source_slug, source_name, topic_slug, source_type,
             trust_tier, trust_score, priority_weight, url,
             poll_interval_minutes, ingestion_method
      FROM sources
      WHERE is_active = 1`
    const params = []

    if (topic) {
      if (!isValidTopicSlug(topic)) {
        return errorResponse('Invalid topic parameter', 400)
      }
      sql += ` AND topic_slug = ?`
      params.push(topic)
    }

    sql += ` ORDER BY topic_slug ASC, priority_weight DESC`

    const sources = await queryAll(db, sql, params)
    return jsonResponse(sources)
  } catch (err) {
    console.error('[/api/sources] Failed to fetch sources:', err)
    return errorResponse('Failed to fetch sources')
  }
}
