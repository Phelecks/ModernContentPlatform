/**
 * POST /api/internal/openai-usage-log
 *
 * Safe write endpoint for recording OpenAI task usage and failures in D1.
 * Used by n8n workflows after each OpenAI task execution attempt.
 *
 * Authentication: X-Write-Key header (must match env.WRITE_API_KEY)
 *
 * Request body: see schemas/workflow/write_openai_usage_log.json
 *
 * Response (201):
 *   { id, task, model, status }
 */
import { jsonResponse, errorResponse } from '../../lib/db.js'
import { authenticateWrite } from '../../lib/auth.js'
import { validateOpenAiUsagePayload } from '../../lib/validate.js'
import { createOpenAiUsageLog } from '../../lib/writers.js'

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

  const validation = validateOpenAiUsagePayload(body)
  if (!validation.valid) {
    return errorResponse(validation.error, 400)
  }

  const data = validation.data

  try {
    const result = await createOpenAiUsageLog(db, data)

    return jsonResponse({
      id: result.id,
      task: data.task,
      model: data.model,
      status: data.status
    }, 201)
  } catch (err) {
    console.error('[POST /api/internal/openai-usage-log] Write failed:', err)
    return errorResponse(`OpenAI usage log write failed: ${err.message}`)
  }
}
