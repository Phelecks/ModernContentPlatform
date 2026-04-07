/**
 * POST /api/internal/alerts
 *
 * Safe write endpoint for creating an alert record in D1.
 * Performs three atomic writes per alert:
 *   1. Upsert event_clusters
 *   2. Insert alerts row
 *   3. Upsert daily_status (increment counters)
 *
 * Authentication: X-Write-Key header (must match env.WRITE_API_KEY)
 *
 * Request body: see schemas/workflow/write_alert.json
 *
 * Response (201):
 *   { alert_id, cluster_id, topic_slug, date_key }
 */
import { jsonResponse, errorResponse } from '../../lib/db.js'
import { authenticateWrite } from '../../lib/auth.js'
import { validateAlertPayload } from '../../lib/validate.js'
import {
  upsertEventCluster,
  insertAlert,
  upsertDailyStatusForAlert
} from '../../lib/writers.js'

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

  const validation = validateAlertPayload(body)
  if (!validation.valid) {
    return errorResponse(validation.error, 400)
  }

  const data = validation.data

  try {
    // Resolve cluster_label: fall back to topic_slug when null
    // (event_clusters.cluster_label is NOT NULL in the schema)
    const effectiveClusterLabel = data.cluster_label || data.topic_slug

    // Step 1: Upsert event cluster
    const cluster = await upsertEventCluster(db, {
      topic_slug: data.topic_slug,
      date_key: data.date_key,
      cluster_label: effectiveClusterLabel,
      importance_score: data.importance_score
    })

    // Step 2: Insert alert row
    const alert = await insertAlert(db, {
      topic_slug: data.topic_slug,
      date_key: data.date_key,
      cluster_id: cluster.id,
      headline: data.headline,
      summary_text: data.summary_text,
      source_url: data.source_url,
      source_name: data.source_name,
      severity_score: data.severity_score,
      importance_score: data.importance_score,
      confidence_score: data.confidence_score,
      event_at: data.event_at,
      item_id: data.item_id,
      secondary_topics: data.secondary_topics,
      alert_reason: data.alert_reason
    })

    // Step 3: Upsert daily_status
    await upsertDailyStatusForAlert(db, {
      topic_slug: data.topic_slug,
      date_key: data.date_key
    })

    return jsonResponse({
      alert_id: alert.id,
      cluster_id: cluster.id,
      topic_slug: data.topic_slug,
      date_key: data.date_key
    }, 201)
  } catch (err) {
    console.error('[POST /api/internal/alerts] Write failed:', err)
    return errorResponse(`Alert write failed: ${err.message}`)
  }
}
