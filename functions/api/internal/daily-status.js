/**
 * POST /api/internal/daily-status
 *
 * Safe write endpoint for upserting a daily_status record in D1.
 * Used by both the intraday and daily editorial workflows to update
 * page readiness, content availability flags, and counters.
 *
 * Authentication: X-Write-Key header (must match env.WRITE_API_KEY)
 *
 * Request body: see schemas/workflow/write_daily_status.json
 *
 * Response (200):
 *   { topic_slug, date_key, page_state, success: true }
 */
import { jsonResponse, errorResponse } from '../../lib/db.js'
import { authenticateWrite } from '../../lib/auth.js'
import { validateDailyStatusPayload } from '../../lib/validate.js'
import { upsertDailyStatus } from '../../lib/writers.js'

export async function onRequestPost(ctx) {
  const { request, env } = ctx

  const authError = authenticateWrite(ctx)
  if (authError) return authError

  const db = env.DB
  if (!db) return errorResponse('Database not configured', 503)

  let body
  try {
    body = await request.json()
  } catch {
    return errorResponse('Invalid JSON body', 400)
  }

  const validation = validateDailyStatusPayload(body)
  if (!validation.valid) {
    return errorResponse(validation.error, 400)
  }

  const data = validation.data

  try {
    const result = await upsertDailyStatus(db, data)

    return jsonResponse({
      topic_slug: data.topic_slug,
      date_key: data.date_key,
      page_state: data.page_state,
      success: result.success
    })
  } catch (err) {
    console.error('[POST /api/internal/daily-status] Write failed:', err)
    return errorResponse(`Daily status write failed: ${err.message}`)
  }
}
