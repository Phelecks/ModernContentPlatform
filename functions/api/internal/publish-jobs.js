/**
 * POST /api/internal/publish-jobs
 *
 * Safe write endpoint for creating or updating a publish_jobs record in D1.
 * Used by the daily editorial workflow to track publish attempts.
 *
 * Authentication: X-Write-Key header (must match env.WRITE_API_KEY)
 *
 * Request body: see schemas/workflow/write_publish_job.json
 *
 * When `id` is present in the body, updates the existing row.
 * When `id` is absent, creates a new publish job.
 *
 * Response (201 for create, 200 for update):
 *   Create: { id, topic_slug, date_key, status }
 *   Update: { id, topic_slug, date_key, status, success: true }
 */
import { jsonResponse, errorResponse } from '../../lib/db.js'
import { authenticateWrite } from '../../lib/auth.js'
import { validatePublishJobPayload } from '../../lib/validate.js'
import { createPublishJob, updatePublishJob } from '../../lib/writers.js'

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

  // Validate full payload (both create and update paths)
  const validation = validatePublishJobPayload(body)
  if (!validation.valid) {
    return errorResponse(validation.error, 400)
  }

  const data = validation.data

  // If `id` is present, this is an update to an existing job
  if (body.id !== undefined) {
    if (!Number.isInteger(body.id) || body.id < 1) {
      return errorResponse('id must be a positive integer', 400)
    }
    if (body.status === undefined) {
      return errorResponse('status is required when updating a publish job', 400)
    }

    try {
      // Verify the job exists and matches the provided topic/date
      const existing = await db
        .prepare('SELECT id, topic_slug, date_key FROM publish_jobs WHERE id = ?')
        .bind(body.id)
        .first()

      if (!existing) {
        return errorResponse('Publish job not found', 404)
      }

      if (existing.topic_slug !== data.topic_slug || existing.date_key !== data.date_key) {
        return errorResponse('Publish job id does not match the provided topic_slug and date_key', 409)
      }

      const result = await updatePublishJob(db, {
        id: body.id,
        status: data.status,
        error_message: data.error_message
      })

      return jsonResponse({
        id: body.id,
        topic_slug: data.topic_slug,
        date_key: data.date_key,
        status: data.status,
        success: result.success
      })
    } catch (err) {
      console.error('[POST /api/internal/publish-jobs] Update failed:', err)
      return errorResponse(`Publish job update failed: ${err.message}`)
    }
  }

  // Otherwise, create a new publish job
  try {
    const result = await createPublishJob(db, data)

    return jsonResponse({
      id: result.id,
      topic_slug: data.topic_slug,
      date_key: data.date_key,
      status: data.status
    }, 201)
  } catch (err) {
    console.error('[POST /api/internal/publish-jobs] Create failed:', err)
    return errorResponse(`Publish job create failed: ${err.message}`)
  }
}
