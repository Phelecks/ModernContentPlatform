/**
 * Authentication helper for internal write endpoints.
 *
 * Validates that the request includes a valid API key in the
 * X-Write-Key header, matched against the WRITE_API_KEY secret
 * bound in the Pages Functions environment.
 *
 * Usage:
 *   import { authenticateWrite } from '../../lib/auth.js'
 *
 *   export async function onRequestPost(ctx) {
 *     const authError = authenticateWrite(ctx)
 *     if (authError) return authError
 *     // … proceed with write logic
 *   }
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
