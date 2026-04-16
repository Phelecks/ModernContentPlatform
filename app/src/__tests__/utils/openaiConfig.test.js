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
 *   - OPENAI_MODEL_DEFAULTS — correct default values exported for all 8 tasks
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  PROVIDER_OPENAI,
  PROVIDER_GOOGLE,
  VALID_PROVIDERS,
  OPENAI_MODEL_DEFAULTS,
  GOOGLE_MODEL_DEFAULTS,
  OPENAI_STRUCTURED_OUTPUT_TASKS,
  GOOGLE_STRUCTURED_OUTPUT_TASKS,
  OPENAI_COST_CONTROLS,
  AI_TASK_CONTRACTS,
  TASK_SUPPORT_MATRIX,
  parseAIProviderConfig,
  parseOpenAIConfig,
  resolveTaskProvider,
} from '@/utils/openaiConfig.js'

// ---------------------------------------------------------------------------
// Helper — load the n8n-readable JSON mirror from config/
// ---------------------------------------------------------------------------

const REPO_ROOT = join(process.cwd(), '..')
const costControlsJson = JSON.parse(
  readFileSync(join(REPO_ROOT, 'config', 'openai-cost-controls.json'), 'utf8')
)

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

  it('provider constants include openai and google', () => {
    expect(PROVIDER_OPENAI).toBe('openai')
    expect(PROVIDER_GOOGLE).toBe('google')
    expect(VALID_PROVIDERS).toEqual(['openai', 'google'])
  })

  it('OPENAI_MODEL_DEFAULTS has correct default models for all 8 tasks', () => {
    expect(OPENAI_MODEL_DEFAULTS.alertClassification).toBe('gpt-4o-mini')
    expect(OPENAI_MODEL_DEFAULTS.timelineFormatting).toBe('gpt-4o-mini')
    expect(OPENAI_MODEL_DEFAULTS.dailySummary).toBe('gpt-4o')
    expect(OPENAI_MODEL_DEFAULTS.articleGeneration).toBe('gpt-4o')
    expect(OPENAI_MODEL_DEFAULTS.expectationCheck).toBe('gpt-4o')
    expect(OPENAI_MODEL_DEFAULTS.tomorrowOutlook).toBe('gpt-4o')
    expect(OPENAI_MODEL_DEFAULTS.videoScript).toBe('gpt-4o')
    expect(OPENAI_MODEL_DEFAULTS.youtubeMetadata).toBe('gpt-4o-mini')
  })
})

// ---------------------------------------------------------------------------
// Structured output tasks
// ---------------------------------------------------------------------------

describe('OPENAI_STRUCTURED_OUTPUT_TASKS', () => {
  it('exports a config object for every JSON-output task', () => {
    const expectedTasks = [
      'alertClassification',
      'timelineFormatting',
      'dailySummary',
      'expectationCheck',
      'tomorrowOutlook',
      'videoScript',
      'youtubeMetadata',
    ]
    expectedTasks.forEach(task => {
      expect(OPENAI_STRUCTURED_OUTPUT_TASKS).toHaveProperty(task)
    })
  })

  it('sets responseFormat to "json_object" for all tasks', () => {
    Object.values(OPENAI_STRUCTURED_OUTPUT_TASKS).forEach(cfg => {
      expect(cfg.responseFormat).toBe('json_object')
    })
  })

  it('does not include articleGeneration because it returns Markdown, not JSON', () => {
    expect(OPENAI_STRUCTURED_OUTPUT_TASKS).not.toHaveProperty('articleGeneration')
  })

  it('covers exactly 7 tasks', () => {
    expect(Object.keys(OPENAI_STRUCTURED_OUTPUT_TASKS)).toHaveLength(7)
  })
})

describe('GOOGLE_STRUCTURED_OUTPUT_TASKS', () => {
  it('covers the same JSON-output tasks as OpenAI', () => {
    expect(Object.keys(GOOGLE_STRUCTURED_OUTPUT_TASKS).sort())
      .toEqual(Object.keys(OPENAI_STRUCTURED_OUTPUT_TASKS).sort())
  })

  it('uses prompt_and_validate for every JSON-output task', () => {
    Object.values(GOOGLE_STRUCTURED_OUTPUT_TASKS).forEach(cfg => {
      expect(cfg.responseFormat).toBe('prompt_and_validate')
    })
  })
})

describe('AI task contracts and support matrix', () => {
  it('exposes internal contracts for core and extended tasks', () => {
    expect(AI_TASK_CONTRACTS).toHaveProperty('alertClassification')
    expect(AI_TASK_CONTRACTS).toHaveProperty('articleGeneration')
    expect(AI_TASK_CONTRACTS).toHaveProperty('imageGeneration')
    expect(AI_TASK_CONTRACTS).toHaveProperty('tts')
  })

  it('exposes per-provider matrix entries for each task', () => {
    expect(TASK_SUPPORT_MATRIX.alertClassification.openai.supported).toBe(true)
    expect(TASK_SUPPORT_MATRIX.alertClassification.google.supported).toBe(true)
  })

  it('falls back from google to openai when task support differs (imageGeneration)', () => {
    const resolved = resolveTaskProvider('imageGeneration', 'google')
    expect(resolved.requestedProvider).toBe('google')
    expect(resolved.provider).toBe('openai')
    expect(resolved.usedFallback).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Cost controls
// ---------------------------------------------------------------------------

describe('OPENAI_COST_CONTROLS', () => {
  it('exports a maxTokens object with an entry for all 8 tasks', () => {
    const expectedTasks = [
      'alertClassification',
      'timelineFormatting',
      'dailySummary',
      'articleGeneration',
      'expectationCheck',
      'tomorrowOutlook',
      'videoScript',
      'youtubeMetadata',
    ]
    expectedTasks.forEach(task => {
      expect(OPENAI_COST_CONTROLS.maxTokens).toHaveProperty(task)
    })
  })

  it('all maxTokens values are positive integers', () => {
    Object.entries(OPENAI_COST_CONTROLS.maxTokens).forEach(([, limit]) => {
      expect(typeof limit).toBe('number')
      expect(Number.isInteger(limit)).toBe(true)
      expect(limit).toBeGreaterThan(0)
    })
  })

  it('fast-tier tasks have lower maxTokens than standard-tier tasks', () => {
    expect(OPENAI_COST_CONTROLS.maxTokens.alertClassification)
      .toBeLessThanOrEqual(OPENAI_COST_CONTROLS.maxTokens.dailySummary)
    expect(OPENAI_COST_CONTROLS.maxTokens.youtubeMetadata)
      .toBeLessThanOrEqual(OPENAI_COST_CONTROLS.maxTokens.articleGeneration)
  })

  it('exports a preFilter object with maxItemsPerBatch and minContentLength', () => {
    expect(OPENAI_COST_CONTROLS.preFilter).toHaveProperty('maxItemsPerBatch')
    expect(OPENAI_COST_CONTROLS.preFilter).toHaveProperty('minContentLength')
  })

  it('maxItemsPerBatch is a positive integer', () => {
    const { maxItemsPerBatch } = OPENAI_COST_CONTROLS.preFilter
    expect(typeof maxItemsPerBatch).toBe('number')
    expect(Number.isInteger(maxItemsPerBatch)).toBe(true)
    expect(maxItemsPerBatch).toBeGreaterThan(0)
  })

  it('minContentLength is a non-negative integer', () => {
    const { minContentLength } = OPENAI_COST_CONTROLS.preFilter
    expect(typeof minContentLength).toBe('number')
    expect(Number.isInteger(minContentLength)).toBe(true)
    expect(minContentLength).toBeGreaterThanOrEqual(0)
  })

  it('exports maxRetries as a non-negative integer', () => {
    expect(typeof OPENAI_COST_CONTROLS.maxRetries).toBe('number')
    expect(Number.isInteger(OPENAI_COST_CONTROLS.maxRetries)).toBe(true)
    expect(OPENAI_COST_CONTROLS.maxRetries).toBeGreaterThanOrEqual(0)
  })

  it('exports an outputLimits object', () => {
    expect(OPENAI_COST_CONTROLS).toHaveProperty('outputLimits')
    expect(typeof OPENAI_COST_CONTROLS.outputLimits).toBe('object')
  })

  it('all outputLimits values are positive integers', () => {
    Object.entries(OPENAI_COST_CONTROLS.outputLimits).forEach(([, limit]) => {
      expect(typeof limit).toBe('number')
      expect(Number.isInteger(limit)).toBe(true)
      expect(limit).toBeGreaterThan(0)
    })
  })

  it('outputLimits.headline matches the classification schema max (250)', () => {
    expect(OPENAI_COST_CONTROLS.outputLimits.headline).toBe(250)
  })

  it('outputLimits.summaryText matches the classification schema max (500)', () => {
    expect(OPENAI_COST_CONTROLS.outputLimits.summaryText).toBe(500)
  })

  it('outputLimits.youtubeTitle matches the YouTube metadata schema max (100)', () => {
    expect(OPENAI_COST_CONTROLS.outputLimits.youtubeTitle).toBe(100)
  })
})

// ---------------------------------------------------------------------------
// config/openai-cost-controls.json parity check
// ---------------------------------------------------------------------------

describe('config/openai-cost-controls.json parity with OPENAI_COST_CONTROLS', () => {
  it('JSON file preFilter.maxItemsPerBatch matches JS export', () => {
    expect(costControlsJson.preFilter.maxItemsPerBatch)
      .toBe(OPENAI_COST_CONTROLS.preFilter.maxItemsPerBatch)
  })

  it('JSON file preFilter.minContentLength matches JS export', () => {
    expect(costControlsJson.preFilter.minContentLength)
      .toBe(OPENAI_COST_CONTROLS.preFilter.minContentLength)
  })

  it('JSON file maxRetries matches JS export', () => {
    expect(costControlsJson.maxRetries).toBe(OPENAI_COST_CONTROLS.maxRetries)
  })

  it('JSON file maxTokens values all match JS export', () => {
    const jsTokens = OPENAI_COST_CONTROLS.maxTokens
    const jsonTokens = { ...costControlsJson.maxTokens }
    delete jsonTokens._comment
    expect(Object.keys(jsonTokens).sort()).toEqual(Object.keys(jsTokens).sort())
    Object.keys(jsTokens).forEach(task => {
      expect(jsonTokens[task]).toBe(jsTokens[task])
    })
  })

  it('JSON file outputLimits values all match JS export', () => {
    const jsLimits = OPENAI_COST_CONTROLS.outputLimits
    const jsonLimits = { ...costControlsJson.outputLimits }
    delete jsonLimits._comment
    expect(Object.keys(jsonLimits).sort()).toEqual(Object.keys(jsLimits).sort())
    Object.keys(jsLimits).forEach(key => {
      expect(jsonLimits[key]).toBe(jsLimits[key])
    })
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

  it('resolves all eight model keys', () => {
    const config = parseOpenAIConfig(VALID_ENV)
    expect(config.models).toHaveProperty('alertClassification')
    expect(config.models).toHaveProperty('timelineFormatting')
    expect(config.models).toHaveProperty('dailySummary')
    expect(config.models).toHaveProperty('articleGeneration')
    expect(config.models).toHaveProperty('expectationCheck')
    expect(config.models).toHaveProperty('tomorrowOutlook')
    expect(config.models).toHaveProperty('videoScript')
    expect(config.models).toHaveProperty('youtubeMetadata')
  })

  it('falls back to default models when overrides are absent', () => {
    const config = parseOpenAIConfig(VALID_ENV)
    expect(config.models.alertClassification).toBe(OPENAI_MODEL_DEFAULTS.alertClassification)
    expect(config.models.timelineFormatting).toBe(OPENAI_MODEL_DEFAULTS.timelineFormatting)
    expect(config.models.dailySummary).toBe(OPENAI_MODEL_DEFAULTS.dailySummary)
    expect(config.models.articleGeneration).toBe(OPENAI_MODEL_DEFAULTS.articleGeneration)
    expect(config.models.expectationCheck).toBe(OPENAI_MODEL_DEFAULTS.expectationCheck)
    expect(config.models.tomorrowOutlook).toBe(OPENAI_MODEL_DEFAULTS.tomorrowOutlook)
    expect(config.models.videoScript).toBe(OPENAI_MODEL_DEFAULTS.videoScript)
    expect(config.models.youtubeMetadata).toBe(OPENAI_MODEL_DEFAULTS.youtubeMetadata)
  })

  it('applies per-task model overrides when provided', () => {
    const config = parseOpenAIConfig({
      ...VALID_ENV,
      OPENAI_MODEL_ALERT_CLASSIFICATION: 'gpt-4o',
      OPENAI_MODEL_TIMELINE_FORMATTING: 'gpt-4o',
      OPENAI_MODEL_DAILY_SUMMARY: 'gpt-4o-mini',
      OPENAI_MODEL_ARTICLE_GENERATION: 'gpt-4o-mini',
      OPENAI_MODEL_EXPECTATION_CHECK: 'gpt-4o-mini',
      OPENAI_MODEL_TOMORROW_OUTLOOK: 'gpt-4o-mini',
      OPENAI_MODEL_VIDEO_SCRIPT: 'gpt-4-turbo',
      OPENAI_MODEL_YOUTUBE_METADATA: 'gpt-4o',
    })
    expect(config.models.alertClassification).toBe('gpt-4o')
    expect(config.models.timelineFormatting).toBe('gpt-4o')
    expect(config.models.dailySummary).toBe('gpt-4o-mini')
    expect(config.models.articleGeneration).toBe('gpt-4o-mini')
    expect(config.models.expectationCheck).toBe('gpt-4o-mini')
    expect(config.models.tomorrowOutlook).toBe('gpt-4o-mini')
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
    expect(config.models.timelineFormatting).toBe(OPENAI_MODEL_DEFAULTS.timelineFormatting)
    expect(config.models.articleGeneration).toBe(OPENAI_MODEL_DEFAULTS.articleGeneration)
    expect(config.models.expectationCheck).toBe(OPENAI_MODEL_DEFAULTS.expectationCheck)
    expect(config.models.tomorrowOutlook).toBe(OPENAI_MODEL_DEFAULTS.tomorrowOutlook)
    expect(config.models.videoScript).toBe(OPENAI_MODEL_DEFAULTS.videoScript)
    expect(config.models.youtubeMetadata).toBe(OPENAI_MODEL_DEFAULTS.youtubeMetadata)
  })

  it('trims whitespace from the API key', () => {
    const config = parseOpenAIConfig({ ...VALID_ENV, OPENAI_API_KEY: '  sk-trimmed  ' })
    expect(config.apiKey).toBe('sk-trimmed')
  })

  it('defaults AI_PROVIDER to "openai" when not set', () => {
    const envWithoutProvider = { ...VALID_ENV }
    delete envWithoutProvider.AI_PROVIDER
    const config = parseOpenAIConfig(envWithoutProvider)
    expect(config.provider).toBe('openai')
  })

  it('accepts an empty env object if API key is present and provider defaults correctly', () => {
    const config = parseOpenAIConfig({ OPENAI_API_KEY: 'sk-key' })
    expect(config.provider).toBe('openai')
    expect(config.models.alertClassification).toBe(OPENAI_MODEL_DEFAULTS.alertClassification)
  })

  it('supports google provider through the provider-agnostic parser', () => {
    const config = parseAIProviderConfig({
      AI_PROVIDER: 'google',
      GOOGLE_API_KEY: 'google-key',
    })
    expect(config.provider).toBe('google')
    expect(config.apiKey).toBe('google-key')
    expect(config.models.alertClassification).toBe(GOOGLE_MODEL_DEFAULTS.alertClassification)
    expect(config.models.dailySummary).toBe(GOOGLE_MODEL_DEFAULTS.dailySummary)
  })

  it('applies google per-task model overrides when provided', () => {
    const config = parseAIProviderConfig({
      AI_PROVIDER: 'google',
      GOOGLE_API_KEY: 'google-key',
      GOOGLE_MODEL_VIDEO_SCRIPT: 'gemini-2.5-flash',
    })
    expect(config.models.videoScript).toBe('gemini-2.5-flash')
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

  it('falls back to default when OPENAI_MODEL_TIMELINE_FORMATTING is an empty string', () => {
    const config = parseOpenAIConfig({
      ...VALID_ENV,
      OPENAI_MODEL_TIMELINE_FORMATTING: '',
    })
    expect(config.models.timelineFormatting).toBe(OPENAI_MODEL_DEFAULTS.timelineFormatting)
  })

  it('falls back to default when override is whitespace-only', () => {
    const config = parseOpenAIConfig({
      ...VALID_ENV,
      OPENAI_MODEL_DAILY_SUMMARY: '   ',
    })
    expect(config.models.dailySummary).toBe(OPENAI_MODEL_DEFAULTS.dailySummary)
  })

  it('falls back to default when OPENAI_MODEL_ARTICLE_GENERATION is whitespace-only', () => {
    const config = parseOpenAIConfig({
      ...VALID_ENV,
      OPENAI_MODEL_ARTICLE_GENERATION: '   ',
    })
    expect(config.models.articleGeneration).toBe(OPENAI_MODEL_DEFAULTS.articleGeneration)
  })

  it('falls back to default when OPENAI_MODEL_EXPECTATION_CHECK is undefined', () => {
    const config = parseOpenAIConfig({
      ...VALID_ENV,
      OPENAI_MODEL_EXPECTATION_CHECK: undefined,
    })
    expect(config.models.expectationCheck).toBe(OPENAI_MODEL_DEFAULTS.expectationCheck)
  })

  it('falls back to default when OPENAI_MODEL_TOMORROW_OUTLOOK is undefined', () => {
    const config = parseOpenAIConfig({
      ...VALID_ENV,
      OPENAI_MODEL_TOMORROW_OUTLOOK: undefined,
    })
    expect(config.models.tomorrowOutlook).toBe(OPENAI_MODEL_DEFAULTS.tomorrowOutlook)
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
  it('throws AI_PROVIDER_CONFIG_ERROR when OPENAI_API_KEY is absent', () => {
    expect(() => parseOpenAIConfig({})).toThrow('AI_PROVIDER_CONFIG_ERROR')
  })

  it('throws AI_PROVIDER_CONFIG_ERROR when OPENAI_API_KEY is an empty string', () => {
    expect(() => parseOpenAIConfig({ OPENAI_API_KEY: '' })).toThrow('AI_PROVIDER_CONFIG_ERROR')
  })

  it('throws AI_PROVIDER_CONFIG_ERROR when OPENAI_API_KEY is whitespace-only', () => {
    expect(() => parseOpenAIConfig({ OPENAI_API_KEY: '   ' })).toThrow('AI_PROVIDER_CONFIG_ERROR')
  })

  it('throws AI_PROVIDER_CONFIG_ERROR when AI_PROVIDER is unsupported', () => {
    expect(() => parseOpenAIConfig({ OPENAI_API_KEY: 'sk-key', AI_PROVIDER: 'anthropic' }))
      .toThrow('AI_PROVIDER_CONFIG_ERROR')
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
      .toThrow('AI_PROVIDER_CONFIG_ERROR')
  })

  it('invalid provider error does not include provider key-missing errors', () => {
    try {
      parseOpenAIConfig({ AI_PROVIDER: 'bad-provider' })
    } catch (error) {
      expect(error.message).not.toContain('OPENAI_API_KEY')
      expect(error.message).not.toContain('GOOGLE_API_KEY')
    }
  })

  it('requires GOOGLE_API_KEY when AI_PROVIDER=google', () => {
    expect(() => parseAIProviderConfig({ AI_PROVIDER: 'google' })).toThrow('GOOGLE_API_KEY')
  })
})
