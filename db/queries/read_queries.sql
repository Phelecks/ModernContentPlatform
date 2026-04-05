-- Reusable Read Queries for Modern Content Platform D1
-- These are reference examples for use in Cloudflare Pages Functions.
-- All queries are optimized for the indexes defined in 0001_init.sql.

-- ============================================================
-- TIMELINE: Latest alerts for a topic on a given day
-- Used by: /api/timeline?topic=crypto&date=2025-01-15
-- ============================================================
-- SELECT
--   id, headline, summary_text, source_url, source_name,
--   severity_score, importance_score, event_at, cluster_id
-- FROM alerts
-- WHERE topic_slug = :topic_slug
--   AND date_key   = :date_key
--   AND status     = 'active'
-- ORDER BY event_at DESC
-- LIMIT 50;


-- ============================================================
-- TIMELINE: Latest alerts across all topics (global feed)
-- Used by: homepage or global feed widget
-- ============================================================
-- SELECT
--   id, topic_slug, headline, summary_text,
--   severity_score, importance_score, event_at
-- FROM alerts
-- WHERE date_key = :date_key
--   AND status   = 'active'
-- ORDER BY event_at DESC
-- LIMIT 100;


-- ============================================================
-- DAY STATUS: Readiness and navigation for a topic/day page
-- Used by: /api/day-status?topic=crypto&date=2025-01-15
-- ============================================================
-- SELECT
--   page_state, alert_count, cluster_count,
--   summary_available, video_available, article_available,
--   prev_date_key, next_date_key, published_at
-- FROM daily_status
-- WHERE topic_slug = :topic_slug
--   AND date_key   = :date_key;


-- ============================================================
-- NAVIGATION: Latest published day per topic (homepage cards)
-- Used by: /api/topics or homepage topic card rendering
-- ============================================================
-- SELECT
--   ds.topic_slug,
--   t.display_name,
--   ds.date_key,
--   ds.alert_count,
--   ds.summary_available,
--   ds.video_available,
--   ds.published_at
-- FROM daily_status ds
-- JOIN topics t ON t.topic_slug = ds.topic_slug
-- WHERE ds.page_state = 'published'
-- GROUP BY ds.topic_slug
-- HAVING ds.date_key = MAX(ds.date_key)
-- ORDER BY t.sort_order ASC;


-- ============================================================
-- NAVIGATION: All published days for a topic (topic archive)
-- Used by: /api/navigation?topic=crypto
-- ============================================================
-- SELECT date_key, page_state, summary_available, video_available
-- FROM daily_status
-- WHERE topic_slug = :topic_slug
--   AND page_state = 'published'
-- ORDER BY date_key DESC
-- LIMIT 90;


-- ============================================================
-- TOPICS: Active topic list
-- Used by: /api/topics
-- ============================================================
-- SELECT
--   topic_slug, display_name, description, sort_order
-- FROM topics
-- WHERE is_active = 1
-- ORDER BY sort_order ASC;


-- ============================================================
-- EVENT CLUSTERS: Clusters for a topic/day
-- Used by: timeline grouping view
-- ============================================================
-- SELECT
--   id, cluster_label, summary_text, alert_count, importance_score
-- FROM event_clusters
-- WHERE topic_slug = :topic_slug
--   AND date_key   = :date_key
-- ORDER BY importance_score DESC;


-- ============================================================
-- PUBLISH JOBS: Latest job for a topic/day
-- Used by: n8n status check before triggering a new run
-- ============================================================
-- SELECT
--   id, status, attempt, triggered_by, started_at, completed_at, error_message
-- FROM publish_jobs
-- WHERE topic_slug = :topic_slug
--   AND date_key   = :date_key
-- ORDER BY created_at DESC
-- LIMIT 1;


-- ============================================================
-- PUBLISH JOBS: All failed or pending jobs (retry queue)
-- Used by: n8n retry workflow trigger
-- ============================================================
-- SELECT
--   id, topic_slug, date_key, status, attempt, error_message, created_at
-- FROM publish_jobs
-- WHERE status IN ('failed', 'pending')
-- ORDER BY date_key DESC, created_at ASC;


-- ============================================================
-- ALERTS: Undelivered alerts pending Telegram/Discord delivery
-- Used by: n8n delivery retry workflow
-- ============================================================
-- SELECT
--   id, topic_slug, headline, summary_text, source_url,
--   severity_score, event_at
-- FROM alerts
-- WHERE status              = 'active'
--   AND (delivered_telegram = 0 OR delivered_discord = 0)
-- ORDER BY event_at ASC
-- LIMIT 50;
