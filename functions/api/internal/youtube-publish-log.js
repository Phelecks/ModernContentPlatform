/**
 * POST /api/internal/youtube-publish-log
 *
 * Safe write endpoint for recording a YouTube video upload attempt in D1.
 * Used by n8n module 15 (YouTube Upload) to persist each upload result
 * for operational monitoring and retry tracking.
 *
 * Authentication: X-Write-Key header (must match env.WRITE_API_KEY)
 *
 * Request body: see schemas/workflow/write_youtube_publish_log.json
 *
 * Response (201):
 *   { id, topic_slug, date_key, status, youtube_video_id }
 */
import { jsonResponse, errorResponse } from '../../lib/db.js'
import { authenticateWrite } from '../../lib/auth.js'
import { validateYoutubePublishPayload } from '../../lib/validate.js'
import { createYoutubePublishLog } from '../../lib/writers.js'

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

  const validation = validateYoutubePublishPayload(body)
  if (!validation.valid) {
    return errorResponse(validation.error, 400)
  }

  const data = validation.data

  try {
    const result = await createYoutubePublishLog(db, data)

    return jsonResponse({
      id: result.id,
      topic_slug: data.topic_slug,
      date_key: data.date_key,
      status: data.status,
      youtube_video_id: data.youtube_video_id
    }, 201)
  } catch (err) {
    console.error('[POST /api/internal/youtube-publish-log] Write failed:', err)
    return errorResponse(`YouTube publish log write failed: ${err.message}`)
  }
}
