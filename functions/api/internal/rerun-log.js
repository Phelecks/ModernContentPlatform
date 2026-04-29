/**
 * POST /api/internal/rerun-log
 *
 * Safe write endpoint for recording a rerun or recovery attempt in D1.
 * Used by operator-triggered n8n rerun workflows to persist each
 * attempt for observability, idempotency tracking, and audit.
 *
 * Authentication: X-Write-Key header (must match env.WRITE_API_KEY)
 *
 * Request body: see schemas/workflow/write_rerun_log.json
 *
 * When `id` is present in the body, updates the existing row.
 * Supported update fields: status (required), workflow_run_id, error_message.
 * When `id` is absent, creates a new rerun log entry.
 *
 * Response (201 for create, 200 for update):
 *   Create: { id, rerun_type, topic_slug, date_key, status }
 *   Update: { id, status, success: true }
 */
import { jsonResponse, errorResponse } from '../../lib/db.js'
import { authenticateWrite } from '../../lib/auth.js'
import { validateRerunLogPayload, validateRerunLogUpdatePayload } from '../../lib/validate.js'
import { createRerunLog, updateRerunLog } from '../../lib/writers.js'

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

  // Update path: when `id` is present, update existing rerun
  if (body.id !== undefined) {
    const validation = validateRerunLogUpdatePayload(body)
    if (!validation.valid) {
      return errorResponse(validation.error, 400)
    }

    try {
      const existing = await db
        .prepare('SELECT id FROM rerun_log WHERE id = ?')
        .bind(validation.data.id)
        .first()

      if (!existing) {
        return errorResponse('Rerun log entry not found', 404)
      }

      const updateData = { id: validation.data.id, status: validation.data.status }

      if ('workflow_run_id' in body) {
        updateData.workflow_run_id = validation.data.workflow_run_id
      }

      if ('error_message' in body) {
        updateData.error_message = validation.data.error_message
      }

      const result = await updateRerunLog(db, updateData)

      return jsonResponse({
        id: validation.data.id,
        status: validation.data.status,
        success: result.success
      })
    } catch (err) {
      console.error('[POST /api/internal/rerun-log] Update failed:', err)
      return errorResponse(`Rerun log update failed: ${err.message}`)
    }
  }

  // Create path
  const validation = validateRerunLogPayload(body)
  if (!validation.valid) {
    return errorResponse(validation.error, 400)
  }

  const data = validation.data

  try {
    const result = await createRerunLog(db, data)

    return jsonResponse({
      id: result.id,
      rerun_type: data.rerun_type,
      topic_slug: data.topic_slug,
      date_key: data.date_key,
      status: data.status
    }, 201)
  } catch (err) {
    console.error('[POST /api/internal/rerun-log] Create failed:', err)
    return errorResponse(`Rerun log create failed: ${err.message}`)
  }
}
