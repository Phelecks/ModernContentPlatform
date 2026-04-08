/**
 * Integration tests — POST /api/internal/workflow-logs
 *
 * Tests the workflow_logs write endpoint using a seeded in-memory D1 mock.
 * Validates: authentication, payload validation, successful writes, and error states.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { onRequestPost } from '@functions/api/internal/workflow-logs.js'
import { createSeededDb } from './helpers/mockD1.js'

const WRITE_KEY = 'test-write-key-secret'

function makeRequest(body, headers = {}) {
  return new Request('http://localhost/api/internal/workflow-logs', {
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
    workflow_name: 'Daily — Orchestrator',
    execution_id: 'exec-abc123',
    topic_slug: 'crypto',
    date_key: '2025-01-15',
    event_type: 'error',
    module_name: '09 Publish to GitHub',
    error_message: 'GitHub API rate limit exceeded',
    error_details: 'HTTP 403 from GitHub API',
    metadata_json: '{"publish_job_id": 42}',
    ...overrides
  }
}

describe('POST /api/internal/workflow-logs', () => {
  let db

  beforeEach(() => {
    db = createSeededDb()
  })

  // --- Authentication ---

  it('returns 401 when X-Write-Key header is missing', async () => {
    const ctx = makeCtx(db, validPayload())
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(401)
  })

  it('returns 403 when X-Write-Key header is wrong', async () => {
    const ctx = makeCtx(db, validPayload(), { 'X-Write-Key': 'wrong-key' })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(403)
  })

  it('returns 503 when WRITE_API_KEY is not configured', async () => {
    const ctx = {
      request: makeRequest(validPayload(), { 'X-Write-Key': WRITE_KEY }),
      env: { DB: db }
    }
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(503)
  })

  it('returns 503 when DB is not configured', async () => {
    const ctx = {
      request: makeRequest(validPayload(), { 'X-Write-Key': WRITE_KEY }),
      env: { WRITE_API_KEY: WRITE_KEY }
    }
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(503)
  })

  // --- Payload validation ---

  it('returns 400 when workflow_name is missing', async () => {
    const payload = validPayload()
    delete payload.workflow_name
    const ctx = makeCtx(db, payload, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/workflow_name/i)
  })

  it('returns 400 when workflow_name is empty string', async () => {
    const ctx = makeCtx(db, validPayload({ workflow_name: '' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
  })

  it('returns 400 when event_type is invalid', async () => {
    const ctx = makeCtx(db, validPayload({ event_type: 'unknown' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/event_type/i)
  })

  it('returns 400 when topic_slug is invalid', async () => {
    const ctx = makeCtx(db, validPayload({ topic_slug: 'invalid' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/topic_slug/i)
  })

  it('returns 400 when date_key format is wrong', async () => {
    const ctx = makeCtx(db, validPayload({ date_key: '2025/01/15' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/date_key/i)
  })

  it('returns 400 when unknown fields are present', async () => {
    const ctx = makeCtx(db, validPayload({ extra_field: 'value' }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/unknown/i)
  })

  it('returns 400 when body is not valid JSON', async () => {
    const ctx = {
      request: new Request('http://localhost/api/internal/workflow-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Write-Key': WRITE_KEY },
        body: 'not-json'
      }),
      env: { DB: db, WRITE_API_KEY: WRITE_KEY }
    }
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
  })

  // --- Successful writes ---

  it('returns 201 with id on successful error log', async () => {
    const ctx = makeCtx(db, validPayload(), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toHaveProperty('id')
    expect(body.workflow_name).toBe('Daily — Orchestrator')
    expect(body.event_type).toBe('error')
  })

  it('returns 201 with only required workflow_name provided', async () => {
    const ctx = makeCtx(db, { workflow_name: 'Intraday — Orchestrator' }, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toHaveProperty('id')
    expect(body.event_type).toBe('info')
  })

  it('returns 201 for a completed event with topic context', async () => {
    const ctx = makeCtx(db, {
      workflow_name: 'Daily — Orchestrator',
      execution_id: 'exec-done789',
      topic_slug: 'finance',
      date_key: '2025-01-15',
      event_type: 'completed',
      module_name: '10 Update D1 State',
      metadata_json: '{"publish_job_id": 17}'
    }, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.event_type).toBe('completed')
  })

  it('returns 201 for a retry event', async () => {
    const ctx = makeCtx(db, {
      workflow_name: 'Intraday — Orchestrator',
      event_type: 'retry',
      module_name: '07 D1 Persistence',
      error_message: 'D1 write timeout, retrying',
      metadata_json: '{"attempt": 2}'
    }, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.event_type).toBe('retry')
  })

  it('returns 201 when topic_slug and date_key are null (non-topic workflow)', async () => {
    const ctx = makeCtx(db, {
      workflow_name: 'Shared — Failure Notifier',
      topic_slug: null,
      date_key: null,
      event_type: 'error',
      error_message: 'Telegram delivery failed'
    }, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(201)
  })

  it('returns JSON Content-Type header', async () => {
    const ctx = makeCtx(db, validPayload(), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.headers.get('Content-Type')).toContain('application/json')
  })

  // --- execution_id accepts numbers ---

  it('returns 201 when execution_id is a number (normalizes to string)', async () => {
    const ctx = makeCtx(db, validPayload({ execution_id: 12345 }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(201)
  })

  it('returns 400 when execution_id is a boolean', async () => {
    const ctx = makeCtx(db, validPayload({ execution_id: true }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
  })

  // --- error_message required for error/retry events ---

  it('returns 400 when event_type is "error" but error_message is missing', async () => {
    const payload = validPayload({ event_type: 'error' })
    delete payload.error_message
    const ctx = makeCtx(db, payload, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/error_message/i)
  })

  it('returns 400 when event_type is "error" but error_message is null', async () => {
    const ctx = makeCtx(db, validPayload({ event_type: 'error', error_message: null }), { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/error_message/i)
  })

  it('returns 400 when event_type is "retry" but error_message is missing', async () => {
    const ctx = makeCtx(db, {
      workflow_name: 'Intraday — Orchestrator',
      event_type: 'retry',
      module_name: '07 D1 Persistence'
    }, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/error_message/i)
  })

  it('returns 201 for event_type "info" with no error_message (not required)', async () => {
    const ctx = makeCtx(db, { workflow_name: 'Daily — Orchestrator', event_type: 'info' }, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(201)
  })

  it('returns 201 for event_type "warning" with no error_message (not required)', async () => {
    const ctx = makeCtx(db, { workflow_name: 'Daily — Orchestrator', event_type: 'warning' }, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(201)
  })

  it('returns 201 for event_type "completed" with no error_message (not required)', async () => {
    const ctx = makeCtx(db, {
      workflow_name: 'Daily — Orchestrator',
      event_type: 'completed',
      topic_slug: 'crypto',
      date_key: '2025-01-15'
    }, { 'X-Write-Key': WRITE_KEY })
    const res = await onRequestPost(ctx)
    expect(res.status).toBe(201)
  })

  // --- All valid event_type values ---

  it.each(['info', 'warning', 'error', 'retry', 'completed'])(
    'returns 201 for event_type "%s"',
    async (event_type) => {
      const ctx = makeCtx(db, validPayload({ event_type }), { 'X-Write-Key': WRITE_KEY })
      const res = await onRequestPost(ctx)
      expect(res.status).toBe(201)
    }
  )

  // --- All valid topic slugs ---

  it.each(['crypto', 'finance', 'economy', 'health', 'ai', 'energy', 'technology'])(
    'returns 201 for topic_slug "%s"',
    async (topic_slug) => {
      const ctx = makeCtx(db, { workflow_name: 'Daily — Orchestrator', topic_slug, event_type: 'info' }, { 'X-Write-Key': WRITE_KEY })
      const res = await onRequestPost(ctx)
      expect(res.status).toBe(201)
    }
  )
})
