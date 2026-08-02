import { ApiError } from './errors.js'
import type { Env, TaskRequest } from './types.js'

const encoder = new TextEncoder()

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value))
  return base64Url(new Uint8Array(signature))
}

function safeKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9._/-]/g, '_').replace(/\.\./g, '_')
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let result = 0
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return result === 0
}

export async function createAssetUrl(env: Env, key: string, ttlSeconds = 3600): Promise<string> {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds
  const pathname = `/v1/assets/${safeKey(key)}`
  const signature = await hmac(`${pathname}\n${expires}`, env.ASSET_SIGNING_KEY)
  const url = new URL(pathname, env.PUBLIC_BASE_URL)
  url.searchParams.set('expires', String(expires))
  url.searchParams.set('sig', signature)
  return url.toString()
}

export async function serveAsset(request: Request, env: Env, key: string): Promise<Response> {
  const url = new URL(request.url)
  const expires = Number(url.searchParams.get('expires'))
  const signature = url.searchParams.get('sig') || ''
  const pathname = `/v1/assets/${safeKey(key)}`
  if (!Number.isInteger(expires) || expires <= Math.floor(Date.now() / 1000)) {
    throw new ApiError('ASSET_URL_EXPIRED', 'The asset URL has expired.', 403, false)
  }
  const expected = await hmac(`${pathname}\n${expires}`, env.ASSET_SIGNING_KEY)
  if (!constantTimeEqual(signature, expected)) {
    throw new ApiError('ASSET_SIGNATURE_INVALID', 'The asset signature is invalid.', 403, false)
  }

  const object = await env.AI_ASSETS.get(safeKey(key))
  if (!object) throw new ApiError('ASSET_NOT_FOUND', 'The requested asset was not found.', 404, false)
  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  headers.set('cache-control', 'private, max-age=300')
  return new Response(object.body, { headers })
}

export function assetKey(request: TaskRequest, extension: string): string {
  const topic = safeKey(request.topic_slug || 'global')
  const date = safeKey(request.date_key || new Date().toISOString().slice(0, 10))
  return `temporary/${topic}/${date}/${safeKey(request.request_id)}/${crypto.randomUUID()}.${extension}`
}

export function decodeBase64(value: string): Uint8Array {
  const binary = atob(value)
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}
