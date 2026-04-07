/**
 * Centralized D1 write functions.
 *
 * All workflow-driven writes to D1 go through these helpers.
 * Each function encapsulates the SQL, parameter binding, and return-value
 * extraction so that write logic is not duplicated across endpoints or
 * workflow modules.
 *
 * Usage:
 *   import { upsertEventCluster, insertAlert, upsertDailyStatus } from '../../lib/writers.js'
 */

/**
 * Upsert an event cluster row.
 *
 * Creates a new cluster or increments alert_count / updates importance_score
 * when the (topic_slug, date_key, cluster_label) combination already exists.
 *
 * Requires migration 0002_event_clusters_unique.sql for the UNIQUE constraint.
 *
 * @param {D1Database} db
 * @param {{ topic_slug: string, date_key: string, cluster_label: string, importance_score: number }} params
 * @returns {Promise<{ id: number }>}
 */
export async function upsertEventCluster(db, { topic_slug, date_key, cluster_label, importance_score }) {
  const sql = `
    INSERT INTO event_clusters
      (topic_slug, date_key, cluster_label, alert_count, importance_score)
    VALUES (?, ?, ?, 1, ?)
    ON CONFLICT(topic_slug, date_key, cluster_label)
    DO UPDATE SET
      alert_count      = alert_count + 1,
      importance_score = MAX(importance_score, excluded.importance_score),
      updated_at       = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    RETURNING id`

  const row = await db.prepare(sql)
    .bind(topic_slug, date_key, cluster_label, importance_score)
    .first()

  return { id: row?.id ?? null }
}

/**
 * Insert an alert row and return the new row ID.
 *
 * @param {D1Database} db
 * @param {Object} params - Alert fields
 * @returns {Promise<{ id: number }>}
 */
export async function insertAlert(db, {
  topic_slug, date_key, cluster_id,
  headline, summary_text, source_url, source_name,
  severity_score, importance_score, confidence_score,
  event_at, item_id, secondary_topics, alert_reason
}) {
  const sql = `
    INSERT INTO alerts (
      topic_slug, date_key, cluster_id,
      headline, summary_text, source_url, source_name,
      severity_score, importance_score, confidence_score,
      status, delivered_telegram, delivered_discord,
      event_at, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, 0, ?,
      json_object(
        'item_id',          ?,
        'secondary_topics', json(?),
        'alert_reason',     ?
      )
    )
    RETURNING id`

  const row = await db.prepare(sql)
    .bind(
      topic_slug, date_key, cluster_id,
      headline, summary_text, source_url, source_name,
      severity_score, importance_score, confidence_score,
      event_at,
      item_id,
      JSON.stringify(secondary_topics ?? []),
      alert_reason
    )
    .first()

  return { id: row?.id ?? null }
}

/**
 * Upsert a daily_status row.
 *
 * On first insert for a (topic_slug, date_key), sets initial counts.
 * On conflict, increments alert_count and recalculates cluster_count from
 * the event_clusters table.
 *
 * @param {D1Database} db
 * @param {{ topic_slug: string, date_key: string, page_state?: string, alert_count?: number, cluster_count?: number, summary_available?: number, video_available?: number, article_available?: number }} params
 * @returns {Promise<{ success: boolean }>}
 */
export async function upsertDailyStatus(db, {
  topic_slug, date_key,
  page_state = 'ready',
  alert_count = 0,
  cluster_count = 0,
  summary_available = 0,
  video_available = 0,
  article_available = 0
}) {
  const sql = `
    INSERT INTO daily_status
      (topic_slug, date_key, page_state, alert_count, cluster_count,
       summary_available, video_available, article_available)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (topic_slug, date_key)
    DO UPDATE SET
      page_state         = excluded.page_state,
      alert_count        = MAX(alert_count, excluded.alert_count),
      cluster_count      = MAX(cluster_count, excluded.cluster_count),
      summary_available  = MAX(summary_available, excluded.summary_available),
      video_available    = MAX(video_available, excluded.video_available),
      article_available  = MAX(article_available, excluded.article_available),
      updated_at         = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`

  const result = await db.prepare(sql)
    .bind(topic_slug, date_key, page_state, alert_count, cluster_count,
      summary_available, video_available, article_available)
    .run()

  return { success: result.success ?? true }
}

/**
 * Upsert daily_status specifically for the intraday alert flow.
 *
 * Increments alert_count by 1 and recounts clusters from event_clusters.
 * Used after each individual alert write.
 *
 * @param {D1Database} db
 * @param {{ topic_slug: string, date_key: string }} params
 * @returns {Promise<{ success: boolean }>}
 */
export async function upsertDailyStatusForAlert(db, { topic_slug, date_key }) {
  const sql = `
    INSERT INTO daily_status
      (topic_slug, date_key, page_state, alert_count, cluster_count)
    VALUES (?, ?, 'ready', 1, 1)
    ON CONFLICT (topic_slug, date_key)
    DO UPDATE SET
      alert_count   = alert_count + 1,
      cluster_count = (
        SELECT COUNT(DISTINCT id) FROM event_clusters
        WHERE topic_slug = excluded.topic_slug
          AND date_key = excluded.date_key
      ),
      updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`

  const result = await db.prepare(sql)
    .bind(topic_slug, date_key)
    .run()

  return { success: result.success ?? true }
}

/**
 * Insert a new publish_jobs row.
 *
 * @param {D1Database} db
 * @param {Object} params
 * @returns {Promise<{ id: number }>}
 */
export async function createPublishJob(db, {
  topic_slug, date_key, status = 'pending',
  triggered_by = null, workflow_run_id = null
}) {
  const sql = `
    INSERT INTO publish_jobs
      (topic_slug, date_key, status, triggered_by, workflow_run_id)
    VALUES (?, ?, ?, ?, ?)
    RETURNING id`

  const row = await db.prepare(sql)
    .bind(topic_slug, date_key, status, triggered_by, workflow_run_id)
    .first()

  return { id: row?.id ?? null }
}

/**
 * Update an existing publish_jobs row.
 *
 * @param {D1Database} db
 * @param {{ id: number, status: string, error_message?: string|null, metadata_json?: string|null }} params
 * @returns {Promise<{ success: boolean }>}
 */
export async function updatePublishJob(db, { id, status, error_message = null }) {
  const completedAt = (status === 'success' || status === 'failed')
    ? "strftime('%Y-%m-%dT%H:%M:%SZ', 'now')"
    : 'NULL'

  const sql = `
    UPDATE publish_jobs SET
      status        = ?,
      error_message = ?,
      completed_at  = CASE WHEN ? IN ('success', 'failed')
                        THEN strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
                        ELSE completed_at END,
      updated_at    = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE id = ?`

  const result = await db.prepare(sql)
    .bind(status, error_message, status, id)
    .run()

  return { success: result.success ?? true }
}
