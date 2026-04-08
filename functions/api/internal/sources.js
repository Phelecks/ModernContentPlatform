/**
 * POST /api/internal/sources
 *
 * Safe write endpoint for registering a new source in D1.
 * Used by n8n workflows or admin tooling to manage the source registry.
 *
 * Authentication: X-Write-Key header (must match env.WRITE_API_KEY)
 *
 * Request body fields:
 *   Required: source_slug, source_name, topic_slug, source_type
 *   Optional: trust_tier, trust_score, priority_weight, url,
 *             is_active, poll_interval_minutes, ingestion_method, metadata_json
 *
 * Response (201):
 *   { id, source_slug, source_name, topic_slug }
 */
import { jsonResponse, errorResponse } from '../../lib/db.js'
import { authenticateWrite } from '../../lib/auth.js'
import { validateSourcePayload } from '../../lib/validate.js'
import { createSource } from '../../lib/writers.js'

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

  const validation = validateSourcePayload(body)
  if (!validation.valid) {
    return errorResponse(validation.error, 400)
  }

  const data = validation.data

  try {
    const result = await createSource(db, data)

    return jsonResponse({
      id: result.id,
      source_slug: data.source_slug,
      source_name: data.source_name,
      topic_slug: data.topic_slug
    }, 201)
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return errorResponse(`Source with slug '${data.source_slug}' already exists`, 409)
    }
    console.error('[POST /api/internal/sources] Write failed:', err)
    return errorResponse(`Source write failed: ${err.message}`)
  }
}
