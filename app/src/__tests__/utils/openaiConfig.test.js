/**
 * Unit tests — app/src/utils/openaiConfig.js
 *
 * Validates OpenAI configuration parsing and validation logic.
 *
 * Covers:
 *   - parseOpenAIConfig — valid config with all env vars set
 *   - parseOpenAIConfig — default model fallback when overrides are absent
 *   - parseOpenAIConfig — per-task model overrides are applied
 *   - parseOpenAIConfig — missing OPENAI_API_KEY throws OPENAI_CONFIG_ERROR
 *   - parseOpenAIConfig — empty OPENAI_API_KEY throws OPENAI_CONFIG_ERROR
 *   - parseOpenAIConfig — unsupported AI_PROVIDER throws OPENAI_CONFIG_ERROR
 *   - parseOpenAIConfig — default AI_PROVIDER resolves to 'openai'
 *   - parseOpenAIConfig — whitespace-only model override falls back to default
 *   - parseOpenAIConfig — empty env object throws on missing API key
 *   - OPENAI_MODEL_DEFAULTS — correct default values exported
 */
import { describe, it, expect } from 'vitest'
import {
  PROVIDER_OPENAI,
  VALID_PROVIDERS,
  OPENAI_MODEL_DEFAULTS,
  parseOpenAIConfig,
} from '@/utils/openaiConfig.js'

// ---------------------------------------------------------------------------
// Minimal valid env fixture
// ---------------------------------------------------------------------------

const VALID_ENV = {
  OPENAI_API_KEY: 'sk-test-key',
  AI_PROVIDER: 'openai',
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('constants', () => {
  it('PROVIDER_OPENAI is "openai"', () => {
    expect(PROVIDER_OPENAI).toBe('openai')
  })

  it('VALID_PROVIDERS contains only "openai"', () => {
    expect(VALID_PROVIDERS).toEqual(['openai'])
  })

  it('OPENAI_MODEL_DEFAULTS has correct default models', () => {
    expect(OPENAI_MODEL_DEFAULTS.alertClassification).toBe('gpt-4o-mini')
    expect(OPENAI_MODEL_DEFAULTS.dailySummary).toBe('gpt-4o')
    expect(OPENAI_MODEL_DEFAULTS.videoScript).toBe('gpt-4o')
    expect(OPENAI_MODEL_DEFAULTS.youtubeMetadata).toBe('gpt-4o-mini')
  })
})

// ---------------------------------------------------------------------------
// Valid configurations
// ---------------------------------------------------------------------------

describe('parseOpenAIConfig — valid configurations', () => {
  it('returns a config object for a minimal valid env', () => {
    const config = parseOpenAIConfig(VALID_ENV)
    expect(config.apiKey).toBe('sk-test-key')
    expect(config.provider).toBe('openai')
  })

  it('resolves all four model keys', () => {
    const config = parseOpenAIConfig(VALID_ENV)
    expect(config.models).toHaveProperty('alertClassification')
    expect(config.models).toHaveProperty('dailySummary')
    expect(config.models).toHaveProperty('videoScript')
    expect(config.models).toHaveProperty('youtubeMetadata')
  })

  it('falls back to default models when overrides are absent', () => {
    const config = parseOpenAIConfig(VALID_ENV)
    expect(config.models.alertClassification).toBe(OPENAI_MODEL_DEFAULTS.alertClassification)
    expect(config.models.dailySummary).toBe(OPENAI_MODEL_DEFAULTS.dailySummary)
    expect(config.models.videoScript).toBe(OPENAI_MODEL_DEFAULTS.videoScript)
    expect(config.models.youtubeMetadata).toBe(OPENAI_MODEL_DEFAULTS.youtubeMetadata)
  })

  it('applies per-task model overrides when provided', () => {
    const config = parseOpenAIConfig({
      ...VALID_ENV,
      OPENAI_MODEL_ALERT_CLASSIFICATION: 'gpt-4o',
      OPENAI_MODEL_DAILY_SUMMARY: 'gpt-4o-mini',
      OPENAI_MODEL_VIDEO_SCRIPT: 'gpt-4-turbo',
      OPENAI_MODEL_YOUTUBE_METADATA: 'gpt-4o',
    })
    expect(config.models.alertClassification).toBe('gpt-4o')
    expect(config.models.dailySummary).toBe('gpt-4o-mini')
    expect(config.models.videoScript).toBe('gpt-4-turbo')
    expect(config.models.youtubeMetadata).toBe('gpt-4o')
  })

  it('applies only the overrides that are explicitly set, leaving others at default', () => {
    const config = parseOpenAIConfig({
      ...VALID_ENV,
      OPENAI_MODEL_DAILY_SUMMARY: 'gpt-4o-mini',
    })
    expect(config.models.dailySummary).toBe('gpt-4o-mini')
    expect(config.models.alertClassification).toBe(OPENAI_MODEL_DEFAULTS.alertClassification)
    expect(config.models.videoScript).toBe(OPENAI_MODEL_DEFAULTS.videoScript)
    expect(config.models.youtubeMetadata).toBe(OPENAI_MODEL_DEFAULTS.youtubeMetadata)
  })

  it('trims whitespace from the API key', () => {
    const config = parseOpenAIConfig({ ...VALID_ENV, OPENAI_API_KEY: '  sk-trimmed  ' })
    expect(config.apiKey).toBe('sk-trimmed')
  })

  it('defaults AI_PROVIDER to "openai" when not set', () => {
    const { AI_PROVIDER: _, ...envWithoutProvider } = VALID_ENV
    const config = parseOpenAIConfig(envWithoutProvider)
    expect(config.provider).toBe('openai')
  })

  it('accepts an empty env object if API key is present and provider defaults correctly', () => {
    const config = parseOpenAIConfig({ OPENAI_API_KEY: 'sk-key' })
    expect(config.provider).toBe('openai')
    expect(config.models.alertClassification).toBe(OPENAI_MODEL_DEFAULTS.alertClassification)
  })
})

// ---------------------------------------------------------------------------
// Model override edge cases
// ---------------------------------------------------------------------------

describe('parseOpenAIConfig — model override edge cases', () => {
  it('falls back to default when override is an empty string', () => {
    const config = parseOpenAIConfig({
      ...VALID_ENV,
      OPENAI_MODEL_ALERT_CLASSIFICATION: '',
    })
    expect(config.models.alertClassification).toBe(OPENAI_MODEL_DEFAULTS.alertClassification)
  })

  it('falls back to default when override is whitespace-only', () => {
    const config = parseOpenAIConfig({
      ...VALID_ENV,
      OPENAI_MODEL_DAILY_SUMMARY: '   ',
    })
    expect(config.models.dailySummary).toBe(OPENAI_MODEL_DEFAULTS.dailySummary)
  })

  it('falls back to default when override is undefined', () => {
    const config = parseOpenAIConfig({
      ...VALID_ENV,
      OPENAI_MODEL_VIDEO_SCRIPT: undefined,
    })
    expect(config.models.videoScript).toBe(OPENAI_MODEL_DEFAULTS.videoScript)
  })
})

// ---------------------------------------------------------------------------
// Validation errors
// ---------------------------------------------------------------------------

describe('parseOpenAIConfig — validation errors', () => {
  it('throws OPENAI_CONFIG_ERROR when OPENAI_API_KEY is absent', () => {
    expect(() => parseOpenAIConfig({})).toThrow('OPENAI_CONFIG_ERROR')
  })

  it('throws OPENAI_CONFIG_ERROR when OPENAI_API_KEY is an empty string', () => {
    expect(() => parseOpenAIConfig({ OPENAI_API_KEY: '' })).toThrow('OPENAI_CONFIG_ERROR')
  })

  it('throws OPENAI_CONFIG_ERROR when OPENAI_API_KEY is whitespace-only', () => {
    expect(() => parseOpenAIConfig({ OPENAI_API_KEY: '   ' })).toThrow('OPENAI_CONFIG_ERROR')
  })

  it('throws OPENAI_CONFIG_ERROR when AI_PROVIDER is unsupported', () => {
    expect(() => parseOpenAIConfig({ OPENAI_API_KEY: 'sk-key', AI_PROVIDER: 'anthropic' }))
      .toThrow('OPENAI_CONFIG_ERROR')
  })

  it('error message mentions the unsupported provider name', () => {
    expect(() => parseOpenAIConfig({ OPENAI_API_KEY: 'sk-key', AI_PROVIDER: 'unknown' }))
      .toThrow('unknown')
  })

  it('error message mentions OPENAI_API_KEY when it is missing', () => {
    expect(() => parseOpenAIConfig({})).toThrow('OPENAI_API_KEY')
  })

  it('throws on both missing API key and invalid provider in the same call', () => {
    expect(() => parseOpenAIConfig({ AI_PROVIDER: 'bad-provider' }))
      .toThrow('OPENAI_CONFIG_ERROR')
  })
})
