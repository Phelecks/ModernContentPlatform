/**
 * Integration tests — GET /api/internal/operator-dashboard
 *
 * Tests the operator dashboard read endpoint using a seeded in-memory D1 mock.
 * Validates: authentication, response structure, data aggregation, and empty states.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { onRequestGet } from '@functions/api/internal/operator-dashboard.js'
import { createSeededDb } from './helpers/mockD1.js'

const OPS_KEY = 'test-ops-read-key-secret'

function makeRequest(headers = {}) {
  return new Request('http://localhost/api/internal/operator-dashboard', {
    method: 'GET',
    headers: { ...headers }
  })
}

function makeCtx(db, headers = {}) {
  return {
    request: makeRequest(headers),
    env: { DB: db, OPS_READ_KEY: OPS_KEY }
  }
}

describe('GET /api/internal/operator-dashboard', () => {
  let db

  beforeEach(() => {
    db = createSeededDb()
  })

  // --- Authentication ---

  it('returns 401 when X-Ops-Key header is missing', async () => {
    const ctx = makeCtx(db)
    const res = await onRequestGet(ctx)
    expect(res.status).toBe(401)
  })

  it('returns 403 when X-Ops-Key header is wrong', async () => {
    const ctx = makeCtx(db, { 'X-Ops-Key': 'wrong-key' })
    const res = await onRequestGet(ctx)
    expect(res.status).toBe(403)
  })

  it('returns 503 when OPS_READ_KEY is not configured', async () => {
    const ctx = {
      request: makeRequest({ 'X-Ops-Key': OPS_KEY }),
      env: { DB: db }
    }
    const res = await onRequestGet(ctx)
    expect(res.status).toBe(503)
  })

  it('returns 503 when DB is not configured', async () => {
    const ctx = {
      request: makeRequest({ 'X-Ops-Key': OPS_KEY }),
      env: { OPS_READ_KEY: OPS_KEY }
    }
    const res = await onRequestGet(ctx)
    expect(res.status).toBe(503)
  })

  it('does not accept X-Write-Key (requires dedicated X-Ops-Key)', async () => {
    const ctx = {
      request: makeRequest({ 'X-Write-Key': OPS_KEY }),
      env: { DB: db, OPS_READ_KEY: OPS_KEY }
    }
    const res = await onRequestGet(ctx)
    expect(res.status).toBe(401)
  })

  // --- Response structure ---

  it('returns 200 with correct response shape', async () => {
    const ctx = makeCtx(db, { 'X-Ops-Key': OPS_KEY })
    const res = await onRequestGet(ctx)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('recent_workflow_runs')
    expect(body).toHaveProperty('failed_workflow_events')
    expect(body).toHaveProperty('pending_publish_jobs')
    expect(body).toHaveProperty('failed_publish_jobs')
    expect(body).toHaveProperty('last_publish_per_topic')
    expect(body).toHaveProperty('social_publish_failures')
    expect(body).toHaveProperty('ai_usage_summary')
  })

  it('returns JSON Content-Type header', async () => {
    const ctx = makeCtx(db, { 'X-Ops-Key': OPS_KEY })
    const res = await onRequestGet(ctx)
    expect(res.headers.get('Content-Type')).toContain('application/json')
  })

  it('returns no-store cache header', async () => {
    const ctx = makeCtx(db, { 'X-Ops-Key': OPS_KEY })
    const res = await onRequestGet(ctx)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  // --- Empty state ---

  it('returns empty arrays when no workflow logs exist', async () => {
    const ctx = makeCtx(db, { 'X-Ops-Key': OPS_KEY })
    const res = await onRequestGet(ctx)
    const body = await res.json()
    expect(body.recent_workflow_runs).toEqual([])
    expect(body.failed_workflow_events).toEqual([])
  })

  it('returns empty arrays for social failures when none exist', async () => {
    const ctx = makeCtx(db, { 'X-Ops-Key': OPS_KEY })
    const res = await onRequestGet(ctx)
    const body = await res.json()
    expect(body.social_publish_failures).toEqual([])
  })

  it('returns empty arrays for publish jobs when none exist', async () => {
    const ctx = makeCtx(db, { 'X-Ops-Key': OPS_KEY })
    const res = await onRequestGet(ctx)
    const body = await res.json()
    expect(body.pending_publish_jobs).toEqual([])
    expect(body.failed_publish_jobs).toEqual([])
  })

  // --- AI usage summary structure ---

  it('returns ai_usage_summary with correct shape', async () => {
    const ctx = makeCtx(db, { 'X-Ops-Key': OPS_KEY })
    const res = await onRequestGet(ctx)
    const body = await res.json()
    expect(body.ai_usage_summary).toHaveProperty('total_calls')
    expect(body.ai_usage_summary).toHaveProperty('total_tokens')
    expect(body.ai_usage_summary).toHaveProperty('error_count')
    expect(body.ai_usage_summary).toHaveProperty('recent')
    expect(typeof body.ai_usage_summary.total_calls).toBe('number')
    expect(typeof body.ai_usage_summary.total_tokens).toBe('number')
    expect(typeof body.ai_usage_summary.error_count).toBe('number')
    expect(Array.isArray(body.ai_usage_summary.recent)).toBe(true)
  })

  it('returns zero AI usage when no records exist', async () => {
    const ctx = makeCtx(db, { 'X-Ops-Key': OPS_KEY })
    const res = await onRequestGet(ctx)
    const body = await res.json()
    expect(body.ai_usage_summary.total_calls).toBe(0)
    expect(body.ai_usage_summary.total_tokens).toBe(0)
    expect(body.ai_usage_summary.error_count).toBe(0)
    expect(body.ai_usage_summary.recent).toEqual([])
  })

  // --- Last publish per topic ---

  it('returns published topics from seeded daily_status', async () => {
    const ctx = makeCtx(db, { 'X-Ops-Key': OPS_KEY })
    const res = await onRequestGet(ctx)
    const body = await res.json()
    // Seeded daily_status has crypto and finance as published
    const slugs = body.last_publish_per_topic.map((r) => r.topic_slug)
    expect(slugs).toContain('crypto')
    expect(slugs).toContain('finance')
  })

  it('excludes non-published topics from last_publish_per_topic', async () => {
    const ctx = makeCtx(db, { 'X-Ops-Key': OPS_KEY })
    const res = await onRequestGet(ctx)
    const body = await res.json()
    // AI topic is 'ready' not 'published' in seeded data
    const slugs = body.last_publish_per_topic.map((r) => r.topic_slug)
    expect(slugs).not.toContain('ai')
  })

  it('deduplicates to one entry per topic in last_publish_per_topic', async () => {
    const ctx = makeCtx(db, { 'X-Ops-Key': OPS_KEY })
    const res = await onRequestGet(ctx)
    const body = await res.json()
    const slugs = body.last_publish_per_topic.map((r) => r.topic_slug)
    expect(slugs.length).toBe(new Set(slugs).size)
  })

  // --- Seeded data with workflow logs ---

  it('returns workflow logs when seeded', async () => {
    db.seed('workflow_logs', [
      {
        id: 1,
        workflow_name: 'Daily — Orchestrator',
        execution_id: 'exec-1',
        topic_slug: 'crypto',
        date_key: '2025-01-15',
        event_type: 'completed',
        module_name: '09 Publish to GitHub',
        error_message: null,
        created_at: '2025-01-15T23:00:00Z'
      },
      {
        id: 2,
        workflow_name: 'Intraday — Orchestrator',
        execution_id: 'exec-2',
        topic_slug: 'crypto',
        date_key: '2025-01-15',
        event_type: 'error',
        module_name: '07 D1 Persistence',
        error_message: 'D1 write timeout',
        created_at: '2025-01-15T22:00:00Z'
      }
    ])

    const ctx = makeCtx(db, { 'X-Ops-Key': OPS_KEY })
    const res = await onRequestGet(ctx)
    const body = await res.json()
    expect(body.recent_workflow_runs.length).toBe(2)
    expect(body.failed_workflow_events.length).toBe(1)
    expect(body.failed_workflow_events[0].error_message).toBe('D1 write timeout')
  })

  it('returns seeded publish job failures', async () => {
    db.seed('publish_jobs', [
      {
        id: 1,
        topic_slug: 'crypto',
        date_key: '2025-01-15',
        status: 'failed',
        attempt: 2,
        triggered_by: 'schedule',
        error_message: 'GitHub API timeout',
        created_at: '2025-01-15T23:30:00Z'
      },
      {
        id: 2,
        topic_slug: 'finance',
        date_key: '2025-01-15',
        status: 'pending',
        attempt: 1,
        triggered_by: 'schedule',
        error_message: null,
        created_at: '2025-01-15T22:00:00Z'
      }
    ])

    const ctx = makeCtx(db, { 'X-Ops-Key': OPS_KEY })
    const res = await onRequestGet(ctx)
    const body = await res.json()
    expect(body.failed_publish_jobs.length).toBe(1)
    expect(body.failed_publish_jobs[0].error_message).toBe('GitHub API timeout')
    expect(body.pending_publish_jobs.length).toBe(1)
    expect(body.pending_publish_jobs[0].topic_slug).toBe('finance')
  })

  it('returns seeded AI usage summary', async () => {
    db.seed('openai_usage_log', [
      {
        id: 1,
        task: 'dailySummary',
        model: 'gpt-4o',
        topic_slug: 'crypto',
        date_key: '2025-01-15',
        total_tokens: 1500,
        status: 'ok',
        created_at: '2025-01-15T20:00:00Z'
      },
      {
        id: 2,
        task: 'alertClassification',
        model: 'gpt-4o-mini',
        topic_slug: 'crypto',
        date_key: '2025-01-15',
        total_tokens: 500,
        status: 'error',
        created_at: '2025-01-15T19:00:00Z'
      }
    ])

    const ctx = makeCtx(db, { 'X-Ops-Key': OPS_KEY })
    const res = await onRequestGet(ctx)
    const body = await res.json()
    expect(body.ai_usage_summary.total_calls).toBe(2)
    expect(body.ai_usage_summary.total_tokens).toBe(2000)
    expect(body.ai_usage_summary.error_count).toBe(1)
    expect(body.ai_usage_summary.recent.length).toBe(2)
  })

  it('returns seeded social publish failures', async () => {
    db.seed('social_publish_log', [
      {
        id: 1,
        topic_slug: 'crypto',
        date_key: '2025-01-15',
        platform: 'telegram',
        post_type: 'alert',
        status: 'failed',
        attempt: 1,
        error_message: 'Telegram API timeout',
        created_at: '2025-01-15T14:00:00Z'
      }
    ])

    db.seed('youtube_publish_log', [
      {
        id: 1,
        topic_slug: 'crypto',
        date_key: '2025-01-15',
        status: 'failed',
        attempt: 2,
        error_message: 'YouTube quota exceeded',
        created_at: '2025-01-15T23:00:00Z'
      }
    ])

    const ctx = makeCtx(db, { 'X-Ops-Key': OPS_KEY })
    const res = await onRequestGet(ctx)
    const body = await res.json()
    expect(body.social_publish_failures.length).toBe(2)
    // Sorted by created_at DESC
    expect(body.social_publish_failures[0].source).toBe('youtube')
    expect(body.social_publish_failures[1].source).toBe('social')
  })

  // --- All arrays are arrays ---

  it('returns all top-level fields as arrays', async () => {
    const ctx = makeCtx(db, { 'X-Ops-Key': OPS_KEY })
    const res = await onRequestGet(ctx)
    const body = await res.json()
    expect(Array.isArray(body.recent_workflow_runs)).toBe(true)
    expect(Array.isArray(body.failed_workflow_events)).toBe(true)
    expect(Array.isArray(body.pending_publish_jobs)).toBe(true)
    expect(Array.isArray(body.failed_publish_jobs)).toBe(true)
    expect(Array.isArray(body.last_publish_per_topic)).toBe(true)
    expect(Array.isArray(body.social_publish_failures)).toBe(true)
  })
})
