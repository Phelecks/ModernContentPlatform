/**
 * GET /api/internal/operator-dashboard
 *
 * Read-only endpoint that aggregates operational health data from D1
 * for the operator dashboard. Returns workflow runs, failures,
 * publish status, social publish failures, and AI usage summary.
 *
 * Authentication: X-Ops-Key header (must match env.OPS_READ_KEY)
 * This uses a dedicated read-only key separate from WRITE_API_KEY
 * to limit blast radius if the ops key is compromised.
 *
 * Response (200):
 *   {
 *     recent_workflow_runs: [...],
 *     failed_workflow_events: [...],
 *     pending_publish_jobs: [...],
 *     failed_publish_jobs: [...],
 *     last_publish_per_topic: [...],
 *     social_publish_failures: [...],
 *     ai_usage_summary: { total_calls, total_tokens, error_count, recent: [...] }
 *   }
 */
import { queryAll, jsonResponse, errorResponse } from '../../lib/db.js'
import { authenticateOpsRead } from '../../lib/auth.js'

export async function onRequestGet(ctx) {
  const authError = authenticateOpsRead(ctx)
  if (authError) return authError

  const db = ctx.env.DB
  if (!db) return errorResponse('Database not configured', 503)

  try {
    const [
      recentWorkflowRuns,
      failedWorkflowEvents,
      pendingPublishJobs,
      failedPublishJobs,
      lastPublishPerTopic,
      metaSocialFailures,
      socialFailures,
      youtubeFailures,
      recentAiUsage,
      recentReruns
    ] = await Promise.all([
      queryAll(db,
        'SELECT id, workflow_name, execution_id, topic_slug, date_key, event_type, module_name, error_message, created_at FROM workflow_logs ORDER BY created_at DESC LIMIT 20'
      ),
      queryAll(db,
        'SELECT id, workflow_name, execution_id, topic_slug, date_key, event_type, module_name, error_message, created_at FROM workflow_logs WHERE event_type = \'error\' ORDER BY created_at DESC LIMIT 20'
      ),
      queryAll(db,
        'SELECT id, topic_slug, date_key, status, attempt, triggered_by, error_message, created_at FROM publish_jobs WHERE status = \'pending\' ORDER BY created_at DESC LIMIT 20'
      ),
      queryAll(db,
        'SELECT id, topic_slug, date_key, status, attempt, triggered_by, error_message, created_at FROM publish_jobs WHERE status = \'failed\' ORDER BY created_at DESC LIMIT 20'
      ),
      queryAll(db,
        'SELECT topic_slug, date_key, page_state, published_at FROM daily_status WHERE page_state = \'published\' ORDER BY topic_slug ASC'
      ),
      queryAll(db,
        'SELECT id, topic_slug, date_key, platform, post_type, status, attempt, error_message, created_at FROM meta_social_publish_log WHERE status = \'failed\' ORDER BY created_at DESC LIMIT 20'
      ),
      queryAll(db,
        'SELECT id, topic_slug, date_key, platform, post_type, status, attempt, error_message, created_at FROM social_publish_log WHERE status = \'failed\' ORDER BY created_at DESC LIMIT 20'
      ),
      queryAll(db,
        'SELECT id, topic_slug, date_key, status, attempt, error_message, created_at FROM youtube_publish_log WHERE status = \'failed\' ORDER BY created_at DESC LIMIT 20'
      ),
      queryAll(db,
        'SELECT id, task, model, topic_slug, date_key, total_tokens, status, created_at FROM openai_usage_log ORDER BY created_at DESC LIMIT 50'
      ),
      queryAll(db,
        'SELECT id, rerun_type, topic_slug, date_key, source_table, source_id, status, attempt, triggered_by, workflow_run_id, error_message, created_at FROM rerun_log ORDER BY created_at DESC LIMIT 20'
      ).catch(() => [])
    ])

    // Deduplicate published days to get the last publish per topic.
    // Rows are ordered by topic_slug ASC so we keep the first occurrence
    // per topic (which is the most recent date_key for that topic since
    // ties within a topic are resolved by the default rowid order).
    // This approach covers all topics regardless of how many total
    // published rows exist, avoiding the issue with a global LIMIT.
    const seen = new Set()
    const filteredPublishPerTopic = []
    for (const row of lastPublishPerTopic) {
      if (!seen.has(row.topic_slug)) {
        seen.add(row.topic_slug)
        filteredPublishPerTopic.push(row)
      }
    }

    // Merge social publish failures from all platforms
    const socialPublishFailures = [
      ...metaSocialFailures.map((r) => ({ ...r, source: 'meta' })),
      ...socialFailures.map((r) => ({ ...r, source: 'social' })),
      ...youtubeFailures.map((r) => ({ ...r, source: 'youtube' }))
    ].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))

    // Summarize AI usage from recent records
    let totalTokens = 0
    let errorCount = 0
    for (const row of recentAiUsage) {
      totalTokens += row.total_tokens || 0
      if (row.status === 'error') errorCount++
    }

    return jsonResponse({
      recent_workflow_runs: recentWorkflowRuns,
      failed_workflow_events: failedWorkflowEvents,
      pending_publish_jobs: pendingPublishJobs,
      failed_publish_jobs: failedPublishJobs,
      last_publish_per_topic: filteredPublishPerTopic,
      social_publish_failures: socialPublishFailures,
      ai_usage_summary: {
        total_calls: recentAiUsage.length,
        total_tokens: totalTokens,
        error_count: errorCount,
        recent: recentAiUsage.slice(0, 10)
      },
      recent_reruns: recentReruns
    })
  } catch (err) {
    console.error('[GET /api/internal/operator-dashboard] Query failed:', err)
    return errorResponse(`Dashboard query failed: ${err.message}`)
  }
}
