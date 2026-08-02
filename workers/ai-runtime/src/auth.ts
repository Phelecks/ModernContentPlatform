import { createRemoteJWKSet, jwtVerify } from 'jose'
import { ApiError } from './errors.js'
import type { Env } from './types.js'

const jwksByIssuer = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

function bearerToken(request: Request): string | null {
  const value = request.headers.get('authorization') || ''
  return value.toLowerCase().startsWith('bearer ') ? value.slice(7).trim() : null
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let result = 0
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return result === 0
}

export async function authenticate(request: Request, env: Env): Promise<void> {
  if (env.ALLOW_LOCAL_AUTH === 'true' && env.LOCAL_DEV_TOKEN) {
    const token = bearerToken(request)
    if (token && constantTimeEqual(token, env.LOCAL_DEV_TOKEN)) return
  }

  const assertion = request.headers.get('cf-access-jwt-assertion')
  if (!assertion) {
    throw new ApiError('UNAUTHORIZED', 'A valid Cloudflare Access assertion is required.', 401, false)
  }

  const teamDomain = env.ACCESS_TEAM_DOMAIN.replace(/^https?:\/\//, '').replace(/\/$/, '')
  if (!teamDomain || !env.ACCESS_AUD) {
    throw new ApiError('AUTH_CONFIGURATION_ERROR', 'Cloudflare Access is not configured.', 503, false)
  }

  try {
    const issuer = `https://${teamDomain}`
    let jwks = jwksByIssuer.get(issuer)
    if (!jwks) {
      jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`))
      jwksByIssuer.set(issuer, jwks)
    }
    await jwtVerify(assertion, jwks, {
      issuer,
      audience: env.ACCESS_AUD
    })
  } catch (error) {
    throw new ApiError('UNAUTHORIZED', 'The Cloudflare Access assertion is invalid.', 401, false, error)
  }
}
