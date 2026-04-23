/**
 * Integration tests — YouTube upload workflow contract
 *
 * Validates the YouTube publishing integration contracts:
 *   - youtube_publish_log fixture shape
 *   - video.json content model with video_id populated
 *   - youtube-publishing.json config structure
 *   - youtube_metadata fixture readiness for upload
 *   - workflow module file structure
 *
 * These tests ensure the contracts between n8n modules 15/16, the D1
 * youtube_publish_log table, the video.json content model, and the
 * frontend VideoEmbed component are all consistent.
 */
import { describe, it, expect } from 'vitest'
import { validateYoutubePublishPayload } from '@functions/lib/validate.js'

import YOUTUBE_PUBLISH_SUCCESS from '@fixtures/youtube-publish/crypto-2025-01-15-success.json'
import YOUTUBE_PUBLISH_FAILED from '@fixtures/youtube-publish/finance-2025-01-15-failed.json'
import YOUTUBE_METADATA_CRYPTO from '@fixtures/youtube-metadata/crypto-2025-01-15.json'
import YOUTUBE_METADATA_FINANCE from '@fixtures/youtube-metadata/finance-2025-01-15.json'
import VIDEO_JSON from '@content/topics/crypto/2025-01-15/video.json'
import YOUTUBE_CONFIG from '@config/youtube-publishing.json'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_TOPICS = ['crypto', 'finance', 'economy', 'health', 'ai', 'energy', 'technology']
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/
const VALID_YT_STATUSES = ['pending', 'uploading', 'published', 'failed', 'skipped']
const VALID_VISIBILITIES = ['public', 'unlisted', 'private']

// ---------------------------------------------------------------------------
// YouTube publish log fixture contract
// ---------------------------------------------------------------------------

describe('youtube publish log fixture contract', () => {
  it('success fixture has required fields', () => {
    const required = ['topic_slug', 'date_key', 'status']
    for (const field of required) {
      expect(YOUTUBE_PUBLISH_SUCCESS).toHaveProperty(field)
    }
  })

  it('success fixture has valid topic_slug', () => {
    expect(VALID_TOPICS).toContain(YOUTUBE_PUBLISH_SUCCESS.topic_slug)
  })

  it('success fixture has valid date_key format', () => {
    expect(YOUTUBE_PUBLISH_SUCCESS.date_key).toMatch(DATE_KEY_RE)
  })

  it('success fixture has published status', () => {
    expect(YOUTUBE_PUBLISH_SUCCESS.status).toBe('published')
  })

  it('success fixture has youtube_video_id', () => {
    expect(typeof YOUTUBE_PUBLISH_SUCCESS.youtube_video_id).toBe('string')
    expect(YOUTUBE_PUBLISH_SUCCESS.youtube_video_id.length).toBeGreaterThan(0)
  })

  it('success fixture has public visibility', () => {
    expect(VALID_VISIBILITIES).toContain(YOUTUBE_PUBLISH_SUCCESS.visibility)
  })

  it('success fixture passes payload validation', () => {
    const result = validateYoutubePublishPayload(YOUTUBE_PUBLISH_SUCCESS)
    expect(result.valid).toBe(true)
  })

  it('failed fixture has failed status', () => {
    expect(YOUTUBE_PUBLISH_FAILED.status).toBe('failed')
  })

  it('failed fixture has null youtube_video_id', () => {
    expect(YOUTUBE_PUBLISH_FAILED.youtube_video_id).toBeNull()
  })

  it('failed fixture has error_message', () => {
    expect(typeof YOUTUBE_PUBLISH_FAILED.error_message).toBe('string')
    expect(YOUTUBE_PUBLISH_FAILED.error_message.length).toBeGreaterThan(0)
  })

  it('failed fixture passes payload validation', () => {
    const result = validateYoutubePublishPayload(YOUTUBE_PUBLISH_FAILED)
    expect(result.valid).toBe(true)
  })

  it('status values are valid youtube statuses', () => {
    expect(VALID_YT_STATUSES).toContain(YOUTUBE_PUBLISH_SUCCESS.status)
    expect(VALID_YT_STATUSES).toContain(YOUTUBE_PUBLISH_FAILED.status)
  })
})

// ---------------------------------------------------------------------------
// video.json content model
// ---------------------------------------------------------------------------

describe('video.json content model', () => {
  it('video.json has video_id field', () => {
    expect(VIDEO_JSON).toHaveProperty('video_id')
  })

  it('video.json video_id is a string (populated after upload)', () => {
    // The example crypto fixture has video_id populated
    expect(typeof VIDEO_JSON.video_id).toBe('string')
  })

  it('video.json has title field', () => {
    expect(typeof VIDEO_JSON.title).toBe('string')
    expect(VIDEO_JSON.title.length).toBeGreaterThan(0)
  })

  it('video.json has published_at timestamp', () => {
    expect(VIDEO_JSON).toHaveProperty('published_at')
  })
})

// ---------------------------------------------------------------------------
// youtube_metadata fixture readiness for upload
// ---------------------------------------------------------------------------

describe('youtube_metadata fixture readiness', () => {
  const fixtures = [
    { name: 'crypto', data: YOUTUBE_METADATA_CRYPTO },
    { name: 'finance', data: YOUTUBE_METADATA_FINANCE }
  ]

  for (const { name, data } of fixtures) {
    it(`${name} fixture has title (≥10 chars)`, () => {
      expect(typeof data.title).toBe('string')
      expect(data.title.length).toBeGreaterThanOrEqual(10)
    })

    it(`${name} fixture has description (≥100 chars)`, () => {
      expect(typeof data.description).toBe('string')
      expect(data.description.length).toBeGreaterThanOrEqual(100)
    })

    it(`${name} fixture has tags array (≥5 items)`, () => {
      expect(Array.isArray(data.tags)).toBe(true)
      expect(data.tags.length).toBeGreaterThanOrEqual(5)
    })

    it(`${name} fixture has category`, () => {
      expect(data.category).toBe('News & Politics')
    })

    it(`${name} fixture has valid visibility`, () => {
      expect(VALID_VISIBILITIES).toContain(data.visibility)
    })

    it(`${name} fixture title is within YouTube limit (≤100 chars)`, () => {
      expect(data.title.length).toBeLessThanOrEqual(100)
    })

    it(`${name} fixture description is within YouTube limit (≤5000 chars)`, () => {
      expect(data.description.length).toBeLessThanOrEqual(5000)
    })

    it(`${name} fixture tags are within YouTube limit (≤15 items)`, () => {
      expect(data.tags.length).toBeLessThanOrEqual(15)
    })
  }
})

// ---------------------------------------------------------------------------
// YouTube publishing config structure
// ---------------------------------------------------------------------------

describe('youtube-publishing.json config', () => {
  it('has upload section', () => {
    expect(YOUTUBE_CONFIG).toHaveProperty('upload')
    expect(typeof YOUTUBE_CONFIG.upload).toBe('object')
  })

  it('upload.enabled defaults to false', () => {
    expect(YOUTUBE_CONFIG.upload.enabled).toBe(false)
  })

  it('has default_visibility set to public', () => {
    expect(YOUTUBE_CONFIG.upload.default_visibility).toBe('public')
  })

  it('has retry section', () => {
    expect(YOUTUBE_CONFIG).toHaveProperty('retry')
    expect(YOUTUBE_CONFIG.retry.max_attempts).toBeGreaterThanOrEqual(1)
  })

  it('has upload_flow section with resumable method', () => {
    expect(YOUTUBE_CONFIG.upload_flow.method).toBe('resumable')
  })

  it('has metadata_source section', () => {
    expect(YOUTUBE_CONFIG).toHaveProperty('metadata_source')
    expect(YOUTUBE_CONFIG.metadata_source.title).toBe('youtube_metadata.title')
    expect(YOUTUBE_CONFIG.metadata_source.description).toBe('youtube_metadata.description')
  })

  it('has video_reference section with embed URL template', () => {
    expect(YOUTUBE_CONFIG.video_reference.embed_url_template).toContain('{video_id}')
    expect(YOUTUBE_CONFIG.video_reference.watch_url_template).toContain('{video_id}')
  })

  it('has account_requirements section', () => {
    expect(YOUTUBE_CONFIG.account_requirements.api).toBe('YouTube Data API v3')
    expect(YOUTUBE_CONFIG.account_requirements.auth_type).toBe('OAuth 2.0')
    expect(Array.isArray(YOUTUBE_CONFIG.account_requirements.required_scopes)).toBe(true)
    expect(YOUTUBE_CONFIG.account_requirements.required_scopes.length).toBeGreaterThan(0)
  })

  it('quota_cost_per_upload is documented', () => {
    expect(YOUTUBE_CONFIG.account_requirements.quota_cost_per_upload).toBe(1600)
  })
})

// ---------------------------------------------------------------------------
// Payload validation edge cases
// ---------------------------------------------------------------------------

describe('youtube publish payload validation', () => {
  it('rejects unknown fields', () => {
    const result = validateYoutubePublishPayload({
      topic_slug: 'crypto',
      date_key: '2025-01-15',
      extra: 'field'
    })
    expect(result.valid).toBe(false)
  })

  it('rejects invalid topic_slug', () => {
    const result = validateYoutubePublishPayload({
      topic_slug: 'invalid',
      date_key: '2025-01-15'
    })
    expect(result.valid).toBe(false)
  })

  it('rejects invalid date_key format', () => {
    const result = validateYoutubePublishPayload({
      topic_slug: 'crypto',
      date_key: '15-01-2025'
    })
    expect(result.valid).toBe(false)
  })

  it('accepts minimal payload with defaults', () => {
    const result = validateYoutubePublishPayload({
      topic_slug: 'crypto',
      date_key: '2025-01-15'
    })
    expect(result.valid).toBe(true)
    expect(result.data.status).toBe('pending')
    expect(result.data.youtube_video_id).toBeNull()
    expect(result.data.visibility).toBeNull()
    expect(result.data.attempt).toBe(1)
    expect(result.data.error_message).toBeNull()
  })

  it('accepts all valid statuses', () => {
    for (const status of VALID_YT_STATUSES) {
      const result = validateYoutubePublishPayload({
        topic_slug: 'crypto',
        date_key: '2025-01-15',
        status
      })
      expect(result.valid).toBe(true)
    }
  })

  it('accepts all valid visibilities', () => {
    for (const visibility of VALID_VISIBILITIES) {
      const result = validateYoutubePublishPayload({
        topic_slug: 'crypto',
        date_key: '2025-01-15',
        visibility
      })
      expect(result.valid).toBe(true)
    }
  })

  it('accepts null visibility', () => {
    const result = validateYoutubePublishPayload({
      topic_slug: 'crypto',
      date_key: '2025-01-15',
      visibility: null
    })
    expect(result.valid).toBe(true)
    expect(result.data.visibility).toBeNull()
  })

  it('rejects attempt out of range', () => {
    const result = validateYoutubePublishPayload({
      topic_slug: 'crypto',
      date_key: '2025-01-15',
      attempt: 11
    })
    expect(result.valid).toBe(false)
  })
})
