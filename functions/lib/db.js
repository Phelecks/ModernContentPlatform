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
 * @returns {Response}
 */
export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
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
