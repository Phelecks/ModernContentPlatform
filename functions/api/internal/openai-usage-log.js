/**
 * POST /api/internal/openai-usage-log
 *
 * Legacy compatibility endpoint. New writes are disabled; AI Runtime writes
 * provider-neutral metadata directly to ai_invocations through its D1 binding.
 *
 * Authentication: X-Write-Key header (must match env.WRITE_API_KEY)
 *
 * Request body: see schemas/workflow/write_openai_usage_log.json
 *
 * Response (410):
 *   { error: "openai_usage_log is a read-only legacy compatibility surface..." }
 */
import { errorResponse } from '../../lib/db.js'
import { authenticateWrite } from '../../lib/auth.js'
import { validateOpenAiUsagePayload } from '../../lib/validate.js'

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

  return errorResponse(
    'openai_usage_log is a read-only legacy compatibility surface; use the Cloudflare AI Runtime.',
    410
  )
}
