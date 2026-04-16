import { describe, it, expect, beforeEach } from 'vitest'
import { onRequestPost } from '@functions/api/internal/openai-usage-log.js'
import { createSeededDb } from './helpers/mockD1.js'

const WRITE_KEY = 'test-write-key-secret'

function makeRequest(body, headers = {}) {
  return new Request('http://localhost/api/internal/openai-usage-log', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify(body)
  })
}

function makeCtx(db, body, headers = {}) {
  return {
    request: makeRequest(body, headers),
    env: { DB: db, WRITE_API_KEY: WRITE_KEY }
  }
}

function validPayload(overrides = {}) {
  return {
    task: 'dailySummary',
    model: 'gpt-4o',
    workflow_name: 'Daily — 02 Generate Summary',
    execution_id: 'exec-abc123',
    topic_slug: 'finance',
    date_key: '2026-04-16',
    prompt_tokens: 1200,
    completion_tokens: 600,
    total_tokens: 1800,
    status: 'ok',
    retry_count: 0,
    request_latency_ms: 2800,
    estimated_cost_usd: 0.0175,
    metadata_json: '{"n8n_node":"Generate Summary with AI"}',
    ...overrides
  }
}

describe('POST /api/internal/openai-usage-log', () => {
  let db

  beforeEach(() => {
    db = createSeededDb()
  })

  it('returns 401 when X-Write-Key header is missing', async () => {
    const ctx = makeCtx(db, validPayload())
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(401)
  })

  it('returns 400 for unknown fields', async () => {
    const ctx = makeCtx(db, validPayload({ extra: true }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
  })

  it('returns 400 when task is invalid', async () => {
    const ctx = makeCtx(db, validPayload({ task: 'invalidTask' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/task/i)
  })

  it('returns 400 when status is retry and error_message is missing', async () => {
    const ctx = makeCtx(db, validPayload({ status: 'retry', error_message: undefined }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/error_message/i)
  })

  it('returns 201 for successful usage log write', async () => {
    const ctx = makeCtx(db, validPayload(), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toHaveProperty('id')
    expect(body.task).toBe('dailySummary')
    expect(body.model).toBe('gpt-4o')
    expect(body.status).toBe('ok')
  })

  it('returns 201 for retry usage log with failure details', async () => {
    const ctx = makeCtx(db, validPayload({
      task: 'alertClassification',
      model: 'gpt-4o-mini',
      status: 'retry',
      retry_count: 1,
      error_code: 'rate_limit_exceeded',
      error_message: '429 rate limit, retry scheduled',
      topic_slug: null,
      date_key: null
    }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.status).toBe('retry')
  })

  it('defaults status and token fields when omitted', async () => {
    const ctx = makeCtx(db, {
      task: 'youtubeMetadata',
      model: 'gpt-4o-mini'
    }, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.status).toBe('ok')
  })
})
