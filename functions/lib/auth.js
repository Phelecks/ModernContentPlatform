/**
 * Authentication helpers for internal endpoints.
 *
 * authenticateWrite — validates X-Write-Key against env.WRITE_API_KEY
 *                     (used by write endpoints: alerts, publish-jobs, etc.)
 *
 * authenticateOpsRead — validates X-Ops-Key against env.OPS_READ_KEY
 *                       (used by read-only operator dashboard)
 *
 * Usage:
 *   import { authenticateWrite, authenticateOpsRead } from '../../lib/auth.js'
 */
import { errorResponse } from './db.js'

/**
 * Check the X-Write-Key header against env.WRITE_API_KEY.
 * Returns an error Response if authentication fails, or null if valid.
 *
 * @param {{ request: Request, env: Record<string, unknown> }} ctx
 * @returns {Response|null} error response or null when authenticated
 */
export function authenticateWrite({ request, env }) {
  const secret = env.WRITE_API_KEY
  if (!secret) {
    return errorResponse('Write API key not configured', 503)
  }

  const provided = request.headers.get('X-Write-Key')
  if (!provided) {
    return errorResponse('Missing X-Write-Key header', 401)
  }

  if (provided !== secret) {
    return errorResponse('Invalid write key', 403)
  }

  return null
}

/**
 * Check the X-Ops-Key header against env.OPS_READ_KEY.
 * This is a dedicated read-only key for the operator dashboard,
 * separate from the write key to limit blast radius if compromised.
 *
 * Returns an error Response if authentication fails, or null if valid.
 *
 * @param {{ request: Request, env: Record<string, unknown> }} ctx
 * @returns {Response|null} error response or null when authenticated
 */
export function authenticateOpsRead({ request, env }) {
  const secret = env.OPS_READ_KEY
  if (!secret) {
    return errorResponse('Ops read key not configured', 503)
  }

  const provided = request.headers.get('X-Ops-Key')
  if (!provided) {
    return errorResponse('Missing X-Ops-Key header', 401)
  }

  if (provided !== secret) {
    return errorResponse('Invalid ops key', 403)
  }

  return null
}
