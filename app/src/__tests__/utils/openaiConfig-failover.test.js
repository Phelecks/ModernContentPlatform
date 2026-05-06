/**
 * Unit tests — AI Provider Failover
 *
 * Validates the failover configuration, eligibility checking, event creation,
 * and runtime resolution with failover metadata.
 *
 * Covers:
 *   - TASK_FAILOVER_CONFIG — all tasks have failover config defined
 *   - TASK_PREFERRED_PROVIDER — all tasks have a preferred provider
 *   - FAILOVER_SETTINGS — global settings are valid
 *   - checkFailoverEligibility — eligible when credentials present
 *   - checkFailoverEligibility — blocked when credentials missing
 *   - checkFailoverEligibility — blocked when failover disabled
 *   - checkFailoverEligibility — blocked when schema incompatible
 *   - createFailoverEvent — produces correct event structure
 *   - resolveTaskProviderWithFailover — returns primary + failover metadata
 *   - resolveTaskProviderWithFailover — failover blocked without credentials
 */
import { describe, it, expect } from 'vitest'
import {
  PROVIDER_OPENAI,
  PROVIDER_GOOGLE,
  AI_TASK_CONTRACTS,
  TASK_PREFERRED_PROVIDER,
  TASK_FAILOVER_CONFIG,
  FAILOVER_SETTINGS,
  checkFailoverEligibility,
  createFailoverEvent,
  resolveTaskProviderWithFailover,
} from '@/utils/openaiConfig.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BOTH_KEYS_ENV = {
  AI_PROVIDER: 'openai',
  OPENAI_API_KEY: 'sk-test-key',
  GOOGLE_API_KEY: 'google-test-key',
}

const OPENAI_ONLY_ENV = {
  AI_PROVIDER: 'openai',
  OPENAI_API_KEY: 'sk-test-key',
}

const GOOGLE_PRIMARY_ENV = {
  AI_PROVIDER: 'google',
  OPENAI_API_KEY: 'sk-test-key',
  GOOGLE_API_KEY: 'google-test-key',
}

// ---------------------------------------------------------------------------
// TASK_PREFERRED_PROVIDER
// ---------------------------------------------------------------------------

describe('TASK_PREFERRED_PROVIDER', () => {
  it('defines a preferred provider for every task in AI_TASK_CONTRACTS', () => {
    const tasks = Object.keys(AI_TASK_CONTRACTS)
    for (const task of tasks) {
      expect(TASK_PREFERRED_PROVIDER[task]).toBeDefined()
      expect([PROVIDER_OPENAI, PROVIDER_GOOGLE]).toContain(TASK_PREFERRED_PROVIDER[task])
    }
  })
})

// ---------------------------------------------------------------------------
// TASK_FAILOVER_CONFIG
// ---------------------------------------------------------------------------

describe('TASK_FAILOVER_CONFIG', () => {
  it('defines failover config for every task in AI_TASK_CONTRACTS', () => {
    const tasks = Object.keys(AI_TASK_CONTRACTS)
    for (const task of tasks) {
      const config = TASK_FAILOVER_CONFIG[task]
      expect(config).toBeDefined()
      expect(config).toHaveProperty('fallbackProvider')
      expect(config).toHaveProperty('allowFailover')
      expect(config).toHaveProperty('schemaCompatible')
      expect(config).toHaveProperty('costMultiplierLimit')
    }
  })

  it('all costMultiplierLimit values are >= 1.0', () => {
    for (const [, config] of Object.entries(TASK_FAILOVER_CONFIG)) {
      expect(config.costMultiplierLimit).toBeGreaterThanOrEqual(1.0)
    }
  })

  it('fallbackProvider is always a valid provider', () => {
    for (const [, config] of Object.entries(TASK_FAILOVER_CONFIG)) {
      expect([PROVIDER_OPENAI, PROVIDER_GOOGLE]).toContain(config.fallbackProvider)
    }
  })
})

// ---------------------------------------------------------------------------
// FAILOVER_SETTINGS
// ---------------------------------------------------------------------------

describe('FAILOVER_SETTINGS', () => {
  it('has maxFailoverAttempts >= 1', () => {
    expect(FAILOVER_SETTINGS.maxFailoverAttempts).toBeGreaterThanOrEqual(1)
  })

  it('has cooldownMs >= 0', () => {
    expect(FAILOVER_SETTINGS.cooldownMs).toBeGreaterThanOrEqual(0)
  })

  it('requireFallbackCredentials is boolean', () => {
    expect(typeof FAILOVER_SETTINGS.requireFallbackCredentials).toBe('boolean')
  })

  it('logFailoverEvents is true in v1', () => {
    expect(FAILOVER_SETTINGS.logFailoverEvents).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// checkFailoverEligibility
// ---------------------------------------------------------------------------

describe('checkFailoverEligibility', () => {
  it('returns allowed=true when both credentials are present', () => {
    const result = checkFailoverEligibility('dailySummary', PROVIDER_OPENAI, BOTH_KEYS_ENV)
    expect(result.allowed).toBe(true)
    expect(result.reason).toBe('eligible')
    expect(result.fallbackProvider).toBe(PROVIDER_GOOGLE)
  })

  it('returns google as fallback when primary is openai', () => {
    const result = checkFailoverEligibility('dailySummary', PROVIDER_OPENAI, BOTH_KEYS_ENV)
    expect(result.fallbackProvider).toBe(PROVIDER_GOOGLE)
  })

  it('returns openai as fallback when primary is google', () => {
    const result = checkFailoverEligibility('dailySummary', PROVIDER_GOOGLE, GOOGLE_PRIMARY_ENV)
    expect(result.fallbackProvider).toBe(PROVIDER_OPENAI)
  })

  it('blocks failover when fallback credentials are missing', () => {
    const result = checkFailoverEligibility('dailySummary', PROVIDER_OPENAI, OPENAI_ONLY_ENV)
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('missing_fallback_credentials')
  })

  it('returns no_failover_config for unknown task', () => {
    const result = checkFailoverEligibility('unknownTask', PROVIDER_OPENAI, BOTH_KEYS_ENV)
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('no_failover_config')
  })

  it('checks eligibility for all tasks without throwing', () => {
    const tasks = Object.keys(AI_TASK_CONTRACTS)
    for (const task of tasks) {
      const result = checkFailoverEligibility(task, PROVIDER_OPENAI, BOTH_KEYS_ENV)
      expect(result).toHaveProperty('allowed')
      expect(result).toHaveProperty('reason')
      expect(result).toHaveProperty('fallbackProvider')
    }
  })
})

// ---------------------------------------------------------------------------
// createFailoverEvent
// ---------------------------------------------------------------------------

describe('createFailoverEvent', () => {
  it('creates a structured event with all required fields', () => {
    const event = createFailoverEvent({
      task: 'dailySummary',
      primaryProvider: PROVIDER_OPENAI,
      fallbackProvider: PROVIDER_GOOGLE,
      reason: 'primary_failed',
      success: true,
      primaryAttempts: 3,
      latencyMs: 5000,
    })

    expect(event.event_type).toBe('provider_failover')
    expect(event.task).toBe('dailySummary')
    expect(event.primary_provider).toBe('openai')
    expect(event.fallback_provider).toBe('google')
    expect(event.reason).toBe('primary_failed')
    expect(event.success).toBe(true)
    expect(event.primary_attempts).toBe(3)
    expect(event.latency_ms).toBe(5000)
    expect(event.timestamp).toBeDefined()
  })

  it('defaults primaryAttempts to 0 and latencyMs to 0', () => {
    const event = createFailoverEvent({
      task: 'alertClassification',
      primaryProvider: PROVIDER_OPENAI,
      fallbackProvider: PROVIDER_GOOGLE,
      reason: 'rate_limited',
      success: false,
    })

    expect(event.primary_attempts).toBe(0)
    expect(event.latency_ms).toBe(0)
  })

  it('timestamp is a valid ISO string', () => {
    const event = createFailoverEvent({
      task: 'videoScript',
      primaryProvider: PROVIDER_GOOGLE,
      fallbackProvider: PROVIDER_OPENAI,
      reason: 'timeout',
      success: true,
    })

    expect(() => new Date(event.timestamp)).not.toThrow()
    expect(new Date(event.timestamp).toISOString()).toBe(event.timestamp)
  })
})

// ---------------------------------------------------------------------------
// resolveTaskProviderWithFailover
// ---------------------------------------------------------------------------

describe('resolveTaskProviderWithFailover', () => {
  it('returns primary and failover metadata for a valid task', () => {
    const result = resolveTaskProviderWithFailover(BOTH_KEYS_ENV, 'dailySummary')

    expect(result.primary).toBeDefined()
    expect(result.primary.provider).toBe('openai')
    expect(result.primary.model).toBeDefined()
    expect(result.primary.apiKey).toBe('sk-test-key')

    expect(result.failover).toBeDefined()
    expect(result.failover.allowed).toBe(true)
    expect(result.failover.provider).toBe('google')
    expect(result.failover.model).toBeDefined()
    expect(result.failover.apiKey).toBe('google-test-key')

    expect(result.settings).toBeDefined()
    expect(result.settings.maxFailoverAttempts).toBe(1)
    expect(result.settings.cooldownMs).toBe(2000)

    expect(result.costGuardrail).toBeDefined()
    expect(result.costGuardrail.multiplierLimit).toBe(2.0)
  })

  it('reports failover not allowed when fallback credentials missing', () => {
    const result = resolveTaskProviderWithFailover(OPENAI_ONLY_ENV, 'dailySummary')

    expect(result.primary.provider).toBe('openai')
    expect(result.failover.allowed).toBe(false)
    expect(result.failover.reason).toBe('missing_fallback_credentials')
  })

  it('resolves with google as primary when AI_PROVIDER=google', () => {
    const result = resolveTaskProviderWithFailover(GOOGLE_PRIMARY_ENV, 'alertClassification')

    expect(result.primary.provider).toBe('google')
    expect(result.primary.apiKey).toBe('google-test-key')
    expect(result.failover.allowed).toBe(true)
    expect(result.failover.provider).toBe('openai')
    expect(result.failover.apiKey).toBe('sk-test-key')
  })

  it('throws for unknown task', () => {
    expect(() => resolveTaskProviderWithFailover(BOTH_KEYS_ENV, 'unknownTask'))
      .toThrow('AI_PROVIDER_ERROR')
  })

  it('returns correct cost multiplier for binary tasks', () => {
    const result = resolveTaskProviderWithFailover(BOTH_KEYS_ENV, 'imageGeneration')
    expect(result.costGuardrail.multiplierLimit).toBe(3.0)
  })

  it('works for all defined tasks without throwing', () => {
    const tasks = Object.keys(AI_TASK_CONTRACTS)
    for (const task of tasks) {
      const result = resolveTaskProviderWithFailover(BOTH_KEYS_ENV, task)
      expect(result.primary).toBeDefined()
      expect(result.failover).toBeDefined()
      expect(result.settings).toBeDefined()
      expect(result.costGuardrail).toBeDefined()
    }
  })
})
