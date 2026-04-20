/**
 * POST /api/internal/meta-social-publish-log
 *
 * Safe write endpoint for recording a Meta (Instagram/Facebook) publish
 * attempt in D1.  Used by n8n modules 12 (daily) and 10 (intraday) to
 * persist each publish result for operational monitoring.
 *
 * Authentication: X-Write-Key header (must match env.WRITE_API_KEY)
 *
 * Request body: see schemas/workflow/write_meta_social_publish_log.json
 *
 * Response (201):
 *   { id, topic_slug, date_key, platform, post_type, status }
 */
import { jsonResponse, errorResponse } from '../../lib/db.js'
import { authenticateWrite } from '../../lib/auth.js'
import { validateMetaSocialPublishPayload } from '../../lib/validate.js'
import { createMetaSocialPublishLog } from '../../lib/writers.js'

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

  const validation = validateMetaSocialPublishPayload(body)
  if (!validation.valid) {
    return errorResponse(validation.error, 400)
  }

  const data = validation.data

  try {
    const result = await createMetaSocialPublishLog(db, data)

    return jsonResponse({
      id: result.id,
      topic_slug: data.topic_slug,
      date_key: data.date_key,
      platform: data.platform,
      post_type: data.post_type,
      status: data.status
    }, 201)
  } catch (err) {
    console.error('[POST /api/internal/meta-social-publish-log] Write failed:', err)
    return errorResponse(`Meta social publish log write failed: ${err.message}`)
  }
}
