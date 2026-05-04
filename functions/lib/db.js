/**
 * Shared D1 query helpers for Pages Functions.
 *
 * Usage:
 *   import { queryOne, queryAll } from '../lib/db.js'
 */

/**
 * Run a prepared D1 statement and return a single row or null.
 * @param {D1Database} db
 * @param {string} sql
 * @param {Array} params
 * @returns {Promise<Object|null>}
 */
export async function queryOne(db, sql, params = []) {
  const stmt = db.prepare(sql).bind(...params)
  const result = await stmt.first()
  return result ?? null
}

/**
 * Run a prepared D1 statement and return all rows.
 * @param {D1Database} db
 * @param {string} sql
 * @param {Array} params
 * @returns {Promise<Array>}
 */
export async function queryAll(db, sql, params = []) {
  const stmt = db.prepare(sql).bind(...params)
  const result = await stmt.all()
  return result.results ?? []
}

/**
 * Return a JSON response with CORS headers.
 * @param {*} data
 * @param {number} [status=200]
 * @param {object} [options]
 * @param {number} [options.cacheTtl] - Cache-Control max-age in seconds (0 or omit for no-store)
 * @param {boolean} [options.staleWhileRevalidate] - Add stale-while-revalidate directive
 * @returns {Response}
 */
export function jsonResponse(data, status = 200, options = {}) {
  const { cacheTtl = 0, staleWhileRevalidate = false } = options
  let cacheControl = 'no-store'
  if (cacheTtl > 0) {
    cacheControl = `public, max-age=${cacheTtl}`
    if (staleWhileRevalidate) {
      cacheControl += `, stale-while-revalidate=${cacheTtl}`
    }
  }

  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': cacheControl
    }
  })
}

/**
 * Return a standard error JSON response.
 * @param {string} message
 * @param {number} [status=500]
 * @returns {Response}
 */
export function errorResponse(message, status = 500) {
  return jsonResponse({ error: message }, status)
}

/**
 * Validate that a date key is in YYYY-MM-DD format.
 * @param {string} value
 * @returns {boolean}
 */
export function isValidDateKey(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

/**
 * Validate that a topic slug contains only lowercase letters, digits, and hyphens.
 * @param {string} value
 * @returns {boolean}
 */
export function isValidTopicSlug(value) {
  return typeof value === 'string' && /^[a-z0-9-]+$/.test(value)
}

/**
 * Validate that a value is a well-formed ISO-8601 date-time string.
 * Accepts the subset used as event_at cursors: YYYY-MM-DDTHH:MM:SS[.sss]Z
 * @param {string} value
 * @returns {boolean}
 */
export function isValidISOTimestamp(value) {
  if (typeof value !== 'string') return false
  const ts = Date.parse(value)
  return Number.isFinite(ts) && value.includes('T')
}
