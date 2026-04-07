/**
 * Centralized D1 write functions.
 *
 * All workflow-driven writes to D1 go through these helpers.
 * Each function encapsulates the SQL, parameter binding, and return-value
 * extraction so that write logic is not duplicated across endpoints or
 * workflow modules.
 *
 * Usage:
 *   import { writeAlertBatch, upsertDailyStatus } from '../../lib/writers.js'
 */

// ---- Status constants ----

const STARTED_STATUSES = ['running', 'success', 'failed']
const TERMINAL_STATUSES = ['success', 'failed']

// ---- SQL templates (used by both batch and individual helpers) ----

const UPSERT_EVENT_CLUSTER_SQL = `
  INSERT INTO event_clusters
    (topic_slug, date_key, cluster_label, alert_count, importance_score)
  VALUES (?, ?, ?, 1, ?)
  ON CONFLICT(topic_slug, date_key, cluster_label)
  DO UPDATE SET
    alert_count      = alert_count + 1,
    importance_score = MAX(importance_score, excluded.importance_score),
    updated_at       = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
  RETURNING id`

const INSERT_ALERT_WITH_SUBQUERY_SQL = `
  INSERT INTO alerts (
    topic_slug, date_key, cluster_id,
    headline, summary_text, source_url, source_name,
    severity_score, importance_score, confidence_score,
    status, delivered_telegram, delivered_discord,
    event_at, metadata_json
  ) VALUES (?, ?,
    (SELECT id FROM event_clusters
     WHERE topic_slug = ? AND date_key = ? AND cluster_label = ?),
    ?, ?, ?, ?,
    ?, ?, ?, 'active', 0, 0, ?,
    json_object(
      'item_id',          ?,
      'secondary_topics', json(?),
      'alert_reason',     ?
    )
  )
  RETURNING id`

const UPSERT_DAILY_STATUS_FOR_ALERT_SQL = `
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

/**
 * Write an alert as a D1 batch transaction (atomic).
 *
 * Executes three statements in a single `db.batch()` call so that
 * all writes succeed or none are committed:
 *   1. Upsert event_clusters — returns cluster id
 *   2. Insert alerts row (uses subquery to resolve cluster_id) — returns alert id
 *   3. Upsert daily_status — increments counters
 *
 * Requires migration 0002_event_clusters_unique.sql for the UNIQUE constraint.
 *
 * @param {D1Database} db
 * @param {Object} data - Validated alert payload
 * @returns {Promise<{ alert_id: number, cluster_id: number }>}
 */
export async function writeAlertBatch(db, {
  topic_slug, date_key, cluster_label,
  headline, summary_text, source_url, source_name,
  severity_score, importance_score, confidence_score,
  event_at, item_id, secondary_topics, alert_reason
}) {
  // Statement 1: Upsert event cluster
  const clusterStmt = db.prepare(UPSERT_EVENT_CLUSTER_SQL)
    .bind(topic_slug, date_key, cluster_label, importance_score)

  // Statement 2: Insert alert (uses subquery to resolve cluster_id from the
  // event_clusters row upserted in statement 1, since batch statements
  // execute sequentially within the same transaction)
  const alertStmt = db.prepare(INSERT_ALERT_WITH_SUBQUERY_SQL)
    .bind(
      topic_slug, date_key,
      topic_slug, date_key, cluster_label,
      headline, summary_text, source_url, source_name,
      severity_score, importance_score, confidence_score,
      event_at,
      item_id,
      JSON.stringify(secondary_topics ?? []),
      alert_reason
    )

  // Statement 3: Upsert daily_status
  const dailyStatusStmt = db.prepare(UPSERT_DAILY_STATUS_FOR_ALERT_SQL)
    .bind(topic_slug, date_key)

  const [clusterResult, alertResult] = await db.batch([
    clusterStmt, alertStmt, dailyStatusStmt
  ])

  const clusterRow = clusterResult.results?.[0]
  if (!clusterRow || clusterRow.id == null) {
    throw new Error('Failed to upsert event cluster: no id returned from D1')
  }

  const alertRow = alertResult.results?.[0]
  if (!alertRow || alertRow.id == null) {
    throw new Error('Failed to insert alert: no id returned from D1')
  }

  return { alert_id: alertRow.id, cluster_id: clusterRow.id }
}

/**
 * Upsert a daily_status row.
 *
 * On first insert for a (topic_slug, date_key), sets the provided counts.
 * On conflict, updates page_state, keeps the maximum of the existing and
 * provided count/availability fields, and refreshes updated_at.
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
 * Insert a new publish_jobs row.
 *
 * Sets started_at when creating with status 'running', and sets
 * completed_at / error_message when creating with a terminal status.
 *
 * @param {D1Database} db
 * @param {{ topic_slug: string, date_key: string, status?: string, triggered_by?: string|null, workflow_run_id?: string|null, error_message?: string|null }} params
 * @returns {Promise<{ id: number }>}
 */
export async function createPublishJob(db, {
  topic_slug, date_key, status = 'pending',
  triggered_by = null, workflow_run_id = null, error_message = null
}) {
  const sql = `
    INSERT INTO publish_jobs
      (topic_slug, date_key, status, triggered_by, workflow_run_id,
       error_message, started_at, completed_at)
    VALUES (
      ?, ?, ?, ?, ?, ?,
      CASE WHEN ? IN ('running', 'success', 'failed')
        THEN strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        ELSE NULL
      END,
      CASE WHEN ? IN ('success', 'failed')
        THEN strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        ELSE NULL
      END
    )
    RETURNING id`

  const row = await db.prepare(sql)
    .bind(topic_slug, date_key, status, triggered_by, workflow_run_id,
      error_message, status, status)
    .first()

  if (!row || row.id == null) {
    throw new Error('Failed to create publish job: no id returned from D1')
  }

  return { id: row.id }
}

/**
 * Update an existing publish_jobs row.
 *
 * Sets started_at when transitioning to 'running', and sets
 * completed_at when transitioning to 'success' or 'failed'.
 *
 * @param {D1Database} db
 * @param {{ id: number, status: string, error_message?: string|null }} params
 * @returns {Promise<{ success: boolean }>}
 */
export async function updatePublishJob(db, { id, status, error_message = null }) {
  const sql = `
    UPDATE publish_jobs SET
      status        = ?,
      error_message = ?,
      started_at    = CASE WHEN ? = 'running' AND started_at IS NULL
                        THEN strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
                        ELSE started_at END,
      completed_at  = CASE WHEN ? IN ('success', 'failed')
                        THEN strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
                        ELSE completed_at END,
      updated_at    = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE id = ?`

  const result = await db.prepare(sql)
    .bind(status, error_message, status, status, id)
    .run()

  return { success: result.success ?? true }
}
