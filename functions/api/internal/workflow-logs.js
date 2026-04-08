/**
 * POST /api/internal/workflow-logs
 *
 * Safe write endpoint for recording a workflow execution event in D1.
 * Used by n8n workflows to persist failure records, retry attempts,
 * and completion checkpoints for observability.
 *
 * Authentication: X-Write-Key header (must match env.WRITE_API_KEY)
 *
 * Request body: see schemas/workflow/write_workflow_log.json
 *
 * Response (201):
 *   { id, workflow_name, event_type }
 */
import { jsonResponse, errorResponse } from '../../lib/db.js'
import { authenticateWrite } from '../../lib/auth.js'
import { validateWorkflowLogPayload } from '../../lib/validate.js'
import { createWorkflowLog } from '../../lib/writers.js'

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

  const validation = validateWorkflowLogPayload(body)
  if (!validation.valid) {
    return errorResponse(validation.error, 400)
  }

  const data = validation.data

  try {
    const result = await createWorkflowLog(db, data)

    return jsonResponse({
      id: result.id,
      workflow_name: data.workflow_name,
      event_type: data.event_type
    }, 201)
  } catch (err) {
    console.error('[POST /api/internal/workflow-logs] Write failed:', err)
    return errorResponse(`Workflow log write failed: ${err.message}`)
  }
}
