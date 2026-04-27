/**
 * API service — thin wrappers around Cloudflare Pages Functions endpoints.
 *
 * All endpoints return JSON and throw on non-OK responses.
 */

const BASE = import.meta.env.VITE_API_BASE ?? ''

async function get(path) {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) {
    throw new Error(`API error ${res.status} for ${path}`)
  }
  return res.json()
}

/**
 * Fetch the list of active topics.
 * @returns {Promise<Array<{topic_slug, display_name, description, sort_order}>>}
 */
export function fetchTopics() {
  return get('/api/topics')
}

/**
 * Fetch the publish state and readiness for a topic/day.
 * @param {string} topicSlug
 * @param {string} dateKey - YYYY-MM-DD
 * @returns {Promise<{page_state, summary_available, video_available, article_available, prev_date_key, next_date_key}>}
 */
export function fetchDayStatus(topicSlug, dateKey) {
  return get(`/api/day-status/${topicSlug}/${dateKey}`)
}

/**
 * Fetch the alert timeline for a topic/day.
 * @param {string} topicSlug
 * @param {string} dateKey - YYYY-MM-DD
 * @param {Object} [opts]
 * @param {number} [opts.limit=50]
 * @param {string} [opts.before] - ISO-8601 cursor for pagination
 * @returns {Promise<{alerts: Array, total: number}>}
 */
export function fetchTimeline(topicSlug, dateKey, opts = {}) {
  const params = new URLSearchParams()
  if (opts.limit) params.set('limit', String(opts.limit))
  if (opts.before) params.set('before', opts.before)
  const qs = params.toString() ? `?${params}` : ''
  return get(`/api/timeline/${topicSlug}/${dateKey}${qs}`)
}

/**
 * Fetch previous/next navigation for a topic/day.
 * @param {string} topicSlug
 * @param {string} dateKey - YYYY-MM-DD
 * @returns {Promise<{prev_date_key: string|null, next_date_key: string|null}>}
 */
export function fetchNavigation(topicSlug, dateKey) {
  return get(`/api/navigation/${topicSlug}/${dateKey}`)
}

/**
 * Fetch operator dashboard data (workflow health, publish status, failures).
 * Requires write key authentication.
 * @param {string} writeKey - the X-Write-Key value
 * @returns {Promise<Object>}
 */
export async function fetchOperatorDashboard(writeKey) {
  const res = await fetch(`${BASE}/api/internal/operator-dashboard`, {
    headers: { 'X-Write-Key': writeKey }
  })
  if (!res.ok) {
    throw new Error(`API error ${res.status} for /api/internal/operator-dashboard`)
  }
  return res.json()
}
