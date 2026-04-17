/**
 * Integration tests — provider selection and media mode workflow branching
 *
 * Validates how the combination of AI provider configuration and media mode
 * configuration determines which workflow steps run and which tasks execute.
 *
 * These tests exercise the two configuration layers together:
 *   1. parseAIProviderConfig (openaiConfig.js) — resolves provider, API key, models
 *   2. parseMediaModeConfig (mediaMode.js)      — resolves mode, workflowSteps, capabilities
 *
 * Covers:
 *
 *   provider selection
 *     - OpenAI-only configuration resolves correctly from env and fixture
 *     - Google-only configuration resolves correctly from env and fixture
 *     - invalid provider configuration throws AI_PROVIDER_CONFIG_ERROR
 *     - invalid provider fixture causes expected error
 *     - default provider is openai when AI_PROVIDER is not set
 *     - both providers can coexist in env; the selected one is used
 *
 *   media mode selection
 *     - image_video mode with openai produces the expected workflow steps
 *     - image_video mode with google produces the expected workflow steps
 *     - full_video mode throws MEDIA_MODE_CONFIG_ERROR for all current providers
 *     - default mode is image_video when MEDIA_MODE is not set
 *     - invalid mode throws MEDIA_MODE_CONFIG_ERROR
 *
 *   workflow branching logic
 *     - image_video + openai → 06_video_script, 06b_generate_images, 06c_generate_narration
 *     - image_video + google → same three steps
 *     - required workflow capabilities for image_video are imageGeneration and tts
 *     - resolveTaskAIConfig selects correct provider and model for imageGeneration step
 *     - resolveTaskAIConfig selects correct provider and model for tts step
 *     - resolveTaskAIConfig selects correct API key for openai imageGeneration
 *     - resolveTaskAIConfig selects correct API key for google imageGeneration
 *     - resolveTaskAIConfig selects correct API key for openai tts
 *     - resolveTaskAIConfig selects correct API key for google tts
 *
 *   invalid provider/mode combinations
 *     - full_video + openai fails at media mode validation
 *     - full_video + google fails at media mode validation
 *     - image_video + unknown provider fails at media mode validation
 *
 *   fixture-driven coverage
 *     - openai-only fixture resolves matching config
 *     - google-only fixture resolves matching config
 *     - invalid-provider fixture causes parseAIProviderConfig to throw
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  parseAIProviderConfig,
  resolveTaskAIConfig,
  OPENAI_MODEL_DEFAULTS,
  GOOGLE_MODEL_DEFAULTS,
  VALID_PROVIDERS,
} from '@/utils/openaiConfig.js'
import {
  parseMediaModeConfig,
  MODE_IMAGE_VIDEO,
  MODE_FULL_VIDEO,
  MEDIA_MODE_DEFINITIONS,
} from '@/utils/mediaMode.js'

// ---------------------------------------------------------------------------
// Helpers — load fixtures
// ---------------------------------------------------------------------------

const REPO_ROOT = join(process.cwd(), '..')
const AI_PROVIDER_FIXTURES_DIR = join(REPO_ROOT, 'fixtures', 'ai-provider-configs')

function loadAIProviderFixture(name) {
  return JSON.parse(readFileSync(join(AI_PROVIDER_FIXTURES_DIR, name), 'utf8'))
}

// ---------------------------------------------------------------------------
// Provider selection — OpenAI-only
// ---------------------------------------------------------------------------

describe('provider selection — OpenAI-only', () => {
  const OPENAI_ENV = {
    OPENAI_API_KEY: 'sk-test-openai-key',
    AI_PROVIDER: 'openai',
  }

  it('resolves provider to openai', () => {
    const config = parseAIProviderConfig(OPENAI_ENV)
    expect(config.provider).toBe('openai')
  })

  it('resolves apiKey from OPENAI_API_KEY', () => {
    const config = parseAIProviderConfig(OPENAI_ENV)
    expect(config.apiKey).toBe('sk-test-openai-key')
  })

  it('resolves all 10 task models from OpenAI defaults', () => {
    const config = parseAIProviderConfig(OPENAI_ENV)
    expect(config.models.alertClassification).toBe(OPENAI_MODEL_DEFAULTS.alertClassification)
    expect(config.models.dailySummary).toBe(OPENAI_MODEL_DEFAULTS.dailySummary)
    expect(config.models.imageGeneration).toBe(OPENAI_MODEL_DEFAULTS.imageGeneration)
    expect(config.models.tts).toBe(OPENAI_MODEL_DEFAULTS.tts)
  })

  it('resolves imageGeneration model to gpt-image-1 by default', () => {
    const config = parseAIProviderConfig(OPENAI_ENV)
    expect(config.models.imageGeneration).toBe('gpt-image-1')
  })

  it('resolves tts model to gpt-4o-mini-tts by default', () => {
    const config = parseAIProviderConfig(OPENAI_ENV)
    expect(config.models.tts).toBe('gpt-4o-mini-tts')
  })

  it('fixture openai-only.json resolves matching config', () => {
    const fixture = loadAIProviderFixture('openai-only.json')
    const config = parseAIProviderConfig(fixture.env)
    expect(config.provider).toBe(fixture.expected.provider)
    expect(config.apiKey).toBe(fixture.env.OPENAI_API_KEY)
    Object.entries(fixture.expected.defaultModels).forEach(([task, expectedModel]) => {
      expect(config.models[task]).toBe(expectedModel)
    })
  })
})

// ---------------------------------------------------------------------------
// Provider selection — Google-only
// ---------------------------------------------------------------------------

describe('provider selection — Google-only', () => {
  const GOOGLE_ENV = {
    GOOGLE_API_KEY: 'google-test-key',
    AI_PROVIDER: 'google',
  }

  it('resolves provider to google', () => {
    const config = parseAIProviderConfig(GOOGLE_ENV)
    expect(config.provider).toBe('google')
  })

  it('resolves apiKey from GOOGLE_API_KEY', () => {
    const config = parseAIProviderConfig(GOOGLE_ENV)
    expect(config.apiKey).toBe('google-test-key')
  })

  it('resolves all 10 task models from Google defaults', () => {
    const config = parseAIProviderConfig(GOOGLE_ENV)
    expect(config.models.alertClassification).toBe(GOOGLE_MODEL_DEFAULTS.alertClassification)
    expect(config.models.dailySummary).toBe(GOOGLE_MODEL_DEFAULTS.dailySummary)
    expect(config.models.imageGeneration).toBe(GOOGLE_MODEL_DEFAULTS.imageGeneration)
    expect(config.models.tts).toBe(GOOGLE_MODEL_DEFAULTS.tts)
  })

  it('resolves imageGeneration model to Imagen 3 by default', () => {
    const config = parseAIProviderConfig(GOOGLE_ENV)
    expect(config.models.imageGeneration).toBe('imagen-3.0-generate-001')
  })

  it('resolves tts model to the Chirp3 HD voice identifier by default', () => {
    const config = parseAIProviderConfig(GOOGLE_ENV)
    expect(config.models.tts).toBe('en-US-Chirp3-HD-Aoede')
  })

  it('fixture google-only.json resolves matching config', () => {
    const fixture = loadAIProviderFixture('google-only.json')
    const config = parseAIProviderConfig(fixture.env)
    expect(config.provider).toBe(fixture.expected.provider)
    expect(config.apiKey).toBe(fixture.env.GOOGLE_API_KEY)
    Object.entries(fixture.expected.defaultModels).forEach(([task, expectedModel]) => {
      expect(config.models[task]).toBe(expectedModel)
    })
  })
})

// ---------------------------------------------------------------------------
// Provider selection — invalid configuration
// ---------------------------------------------------------------------------

describe('provider selection — invalid configuration', () => {
  it('throws AI_PROVIDER_CONFIG_ERROR for an unsupported AI_PROVIDER', () => {
    expect(() => parseAIProviderConfig({ OPENAI_API_KEY: 'sk-key', AI_PROVIDER: 'anthropic' }))
      .toThrow('AI_PROVIDER_CONFIG_ERROR')
  })

  it('error message includes the invalid provider name', () => {
    expect(() => parseAIProviderConfig({ OPENAI_API_KEY: 'sk-key', AI_PROVIDER: 'anthropic' }))
      .toThrow('anthropic')
  })

  it('throws AI_PROVIDER_CONFIG_ERROR when OPENAI_API_KEY is missing and provider is openai', () => {
    expect(() => parseAIProviderConfig({ AI_PROVIDER: 'openai' }))
      .toThrow('AI_PROVIDER_CONFIG_ERROR')
  })

  it('throws AI_PROVIDER_CONFIG_ERROR when GOOGLE_API_KEY is missing and provider is google', () => {
    expect(() => parseAIProviderConfig({ AI_PROVIDER: 'google' }))
      .toThrow('AI_PROVIDER_CONFIG_ERROR')
  })

  it('fixture invalid-provider.json causes parseAIProviderConfig to throw', () => {
    const fixture = loadAIProviderFixture('invalid-provider.json')
    expect(() => parseAIProviderConfig(fixture.env)).toThrow(fixture.expected.errorPrefix)
  })

  it('fixture invalid-provider.json error message includes expected strings', () => {
    const fixture = loadAIProviderFixture('invalid-provider.json')
    try {
      parseAIProviderConfig(fixture.env)
    } catch (e) {
      fixture.expected.errorIncludes.forEach(term => {
        expect(e.message).toContain(term)
      })
    }
  })

  it('VALID_PROVIDERS only includes openai and google', () => {
    expect(VALID_PROVIDERS).toEqual(['openai', 'google'])
  })

  it('defaults to openai when AI_PROVIDER is not set', () => {
    const config = parseAIProviderConfig({ OPENAI_API_KEY: 'sk-key' })
    expect(config.provider).toBe('openai')
  })
})

// ---------------------------------------------------------------------------
// Provider coexistence — both credentials present
// ---------------------------------------------------------------------------

describe('provider coexistence — both OpenAI and Google credentials in env', () => {
  const BOTH_ENV = {
    OPENAI_API_KEY: 'sk-openai-key',
    GOOGLE_API_KEY: 'google-key',
  }

  it('uses OPENAI_API_KEY when AI_PROVIDER=openai', () => {
    const config = parseAIProviderConfig({ ...BOTH_ENV, AI_PROVIDER: 'openai' })
    expect(config.apiKey).toBe('sk-openai-key')
    expect(config.provider).toBe('openai')
  })

  it('uses GOOGLE_API_KEY when AI_PROVIDER=google', () => {
    const config = parseAIProviderConfig({ ...BOTH_ENV, AI_PROVIDER: 'google' })
    expect(config.apiKey).toBe('google-key')
    expect(config.provider).toBe('google')
  })

  it('resolves independent model sets for each provider', () => {
    const openaiConfig = parseAIProviderConfig({ ...BOTH_ENV, AI_PROVIDER: 'openai' })
    const googleConfig = parseAIProviderConfig({ ...BOTH_ENV, AI_PROVIDER: 'google' })
    expect(openaiConfig.models.imageGeneration).toBe(OPENAI_MODEL_DEFAULTS.imageGeneration)
    expect(googleConfig.models.imageGeneration).toBe(GOOGLE_MODEL_DEFAULTS.imageGeneration)
    expect(openaiConfig.models.tts).toBe(OPENAI_MODEL_DEFAULTS.tts)
    expect(googleConfig.models.tts).toBe(GOOGLE_MODEL_DEFAULTS.tts)
  })
})

// ---------------------------------------------------------------------------
// Media mode selection
// ---------------------------------------------------------------------------

describe('media mode selection', () => {
  it('defaults to image_video when MEDIA_MODE is not set', () => {
    const config = parseMediaModeConfig({ AI_PROVIDER: 'openai' })
    expect(config.mode).toBe(MODE_IMAGE_VIDEO)
  })

  it('defaults to openai when AI_PROVIDER is not set', () => {
    const config = parseMediaModeConfig({ MEDIA_MODE: 'image_video' })
    expect(config.provider).toBe('openai')
  })

  it('returns available=true for image_video mode', () => {
    const config = parseMediaModeConfig({ MEDIA_MODE: 'image_video', AI_PROVIDER: 'openai' })
    expect(config.available).toBe(true)
  })

  it('returns available=false in MEDIA_MODE_DEFINITIONS for full_video mode', () => {
    expect(MEDIA_MODE_DEFINITIONS[MODE_FULL_VIDEO].available).toBe(false)
  })

  it('throws MEDIA_MODE_CONFIG_ERROR for full_video with openai', () => {
    expect(() => parseMediaModeConfig({ MEDIA_MODE: 'full_video', AI_PROVIDER: 'openai' }))
      .toThrow('MEDIA_MODE_CONFIG_ERROR')
  })

  it('throws MEDIA_MODE_CONFIG_ERROR for full_video with google', () => {
    expect(() => parseMediaModeConfig({ MEDIA_MODE: 'full_video', AI_PROVIDER: 'google' }))
      .toThrow('MEDIA_MODE_CONFIG_ERROR')
  })

  it('throws MEDIA_MODE_CONFIG_ERROR for an unknown mode', () => {
    expect(() => parseMediaModeConfig({ MEDIA_MODE: 'gif_only', AI_PROVIDER: 'openai' }))
      .toThrow('MEDIA_MODE_CONFIG_ERROR')
  })
})

// ---------------------------------------------------------------------------
// Workflow branching logic — image_video + openai
// ---------------------------------------------------------------------------

describe('workflow branching — image_video + openai', () => {
  const ENV = {
    MEDIA_MODE: 'image_video',
    AI_PROVIDER: 'openai',
    OPENAI_API_KEY: 'sk-openai-key',
  }

  it('produces the three image_video workflow steps', () => {
    const mediaCfg = parseMediaModeConfig(ENV)
    expect(mediaCfg.workflowSteps).toEqual([
      '06_video_script',
      '06b_generate_images',
      '06c_generate_narration',
    ])
  })

  it('resolveTaskAIConfig selects openai for imageGeneration step', () => {
    const resolved = resolveTaskAIConfig(ENV, 'imageGeneration')
    expect(resolved.provider).toBe('openai')
    expect(resolved.usedFallback).toBe(false)
  })

  it('resolveTaskAIConfig uses openai API key for imageGeneration step', () => {
    const resolved = resolveTaskAIConfig(ENV, 'imageGeneration')
    expect(resolved.apiKey).toBe('sk-openai-key')
  })

  it('resolveTaskAIConfig uses gpt-image-1 for imageGeneration step', () => {
    const resolved = resolveTaskAIConfig(ENV, 'imageGeneration')
    expect(resolved.model).toBe(OPENAI_MODEL_DEFAULTS.imageGeneration)
  })

  it('resolveTaskAIConfig selects openai for tts step', () => {
    const resolved = resolveTaskAIConfig(ENV, 'tts')
    expect(resolved.provider).toBe('openai')
    expect(resolved.usedFallback).toBe(false)
  })

  it('resolveTaskAIConfig uses openai API key for tts step', () => {
    const resolved = resolveTaskAIConfig(ENV, 'tts')
    expect(resolved.apiKey).toBe('sk-openai-key')
  })

  it('resolveTaskAIConfig uses gpt-4o-mini-tts for tts step', () => {
    const resolved = resolveTaskAIConfig(ENV, 'tts')
    expect(resolved.model).toBe(OPENAI_MODEL_DEFAULTS.tts)
  })
})

// ---------------------------------------------------------------------------
// Workflow branching logic — image_video + google
// ---------------------------------------------------------------------------

describe('workflow branching — image_video + google', () => {
  const ENV = {
    MEDIA_MODE: 'image_video',
    AI_PROVIDER: 'google',
    GOOGLE_API_KEY: 'google-key',
  }

  it('produces the same three image_video workflow steps as openai', () => {
    const mediaCfg = parseMediaModeConfig(ENV)
    expect(mediaCfg.workflowSteps).toEqual([
      '06_video_script',
      '06b_generate_images',
      '06c_generate_narration',
    ])
  })

  it('resolveTaskAIConfig selects google for imageGeneration step', () => {
    const resolved = resolveTaskAIConfig(ENV, 'imageGeneration')
    expect(resolved.provider).toBe('google')
    expect(resolved.usedFallback).toBe(false)
  })

  it('resolveTaskAIConfig uses google API key for imageGeneration step', () => {
    const resolved = resolveTaskAIConfig(ENV, 'imageGeneration')
    expect(resolved.apiKey).toBe('google-key')
  })

  it('resolveTaskAIConfig uses Imagen 3 model for imageGeneration step', () => {
    const resolved = resolveTaskAIConfig(ENV, 'imageGeneration')
    expect(resolved.model).toBe(GOOGLE_MODEL_DEFAULTS.imageGeneration)
  })

  it('resolveTaskAIConfig selects google for tts step', () => {
    const resolved = resolveTaskAIConfig(ENV, 'tts')
    expect(resolved.provider).toBe('google')
    expect(resolved.usedFallback).toBe(false)
  })

  it('resolveTaskAIConfig uses google API key for tts step', () => {
    const resolved = resolveTaskAIConfig(ENV, 'tts')
    expect(resolved.apiKey).toBe('google-key')
  })

  it('resolveTaskAIConfig uses the Chirp3 HD voice model for tts step', () => {
    const resolved = resolveTaskAIConfig(ENV, 'tts')
    expect(resolved.model).toBe(GOOGLE_MODEL_DEFAULTS.tts)
  })
})

// ---------------------------------------------------------------------------
// Workflow branching logic — default environment (no env vars set)
// ---------------------------------------------------------------------------

describe('workflow branching — default environment (no MEDIA_MODE or AI_PROVIDER set)', () => {
  const DEFAULT_ENV = { OPENAI_API_KEY: 'sk-key' }

  it('defaults to image_video mode', () => {
    const mediaCfg = parseMediaModeConfig(DEFAULT_ENV)
    expect(mediaCfg.mode).toBe(MODE_IMAGE_VIDEO)
  })

  it('defaults to openai provider', () => {
    const mediaCfg = parseMediaModeConfig(DEFAULT_ENV)
    expect(mediaCfg.provider).toBe('openai')
  })

  it('defaults to the three image_video workflow steps', () => {
    const mediaCfg = parseMediaModeConfig(DEFAULT_ENV)
    expect(mediaCfg.workflowSteps).toEqual([
      '06_video_script',
      '06b_generate_images',
      '06c_generate_narration',
    ])
  })

  it('requires imageGeneration and tts capabilities', () => {
    const mediaCfg = parseMediaModeConfig(DEFAULT_ENV)
    expect(mediaCfg.requiredCapabilities).toContain('imageGeneration')
    expect(mediaCfg.requiredCapabilities).toContain('tts')
  })

  it('resolveTaskAIConfig defaults to openai for imageGeneration', () => {
    const resolved = resolveTaskAIConfig(DEFAULT_ENV, 'imageGeneration')
    expect(resolved.provider).toBe('openai')
    expect(resolved.model).toBe(OPENAI_MODEL_DEFAULTS.imageGeneration)
  })

  it('resolveTaskAIConfig defaults to openai for tts', () => {
    const resolved = resolveTaskAIConfig(DEFAULT_ENV, 'tts')
    expect(resolved.provider).toBe('openai')
    expect(resolved.model).toBe(OPENAI_MODEL_DEFAULTS.tts)
  })
})

// ---------------------------------------------------------------------------
// Invalid provider/mode combinations
// ---------------------------------------------------------------------------

describe('invalid provider/mode combinations', () => {
  it('full_video + openai — fails at media mode validation with MEDIA_MODE_CONFIG_ERROR', () => {
    expect(() => parseMediaModeConfig({ MEDIA_MODE: 'full_video', AI_PROVIDER: 'openai' }))
      .toThrow('MEDIA_MODE_CONFIG_ERROR')
  })

  it('full_video + google — fails at media mode validation with MEDIA_MODE_CONFIG_ERROR', () => {
    expect(() => parseMediaModeConfig({ MEDIA_MODE: 'full_video', AI_PROVIDER: 'google' }))
      .toThrow('MEDIA_MODE_CONFIG_ERROR')
  })

  it('full_video error message mentions fullVideoGeneration capability', () => {
    expect(() => parseMediaModeConfig({ MEDIA_MODE: 'full_video', AI_PROVIDER: 'openai' }))
      .toThrow('fullVideoGeneration')
  })

  it('image_video + unknown provider — fails at media mode validation with MEDIA_MODE_CONFIG_ERROR', () => {
    expect(() => parseMediaModeConfig({ MEDIA_MODE: 'image_video', AI_PROVIDER: 'unknown' }))
      .toThrow('MEDIA_MODE_CONFIG_ERROR')
  })

  it('unknown mode — fails at media mode validation with MEDIA_MODE_CONFIG_ERROR', () => {
    expect(() => parseMediaModeConfig({ MEDIA_MODE: 'animated_gif', AI_PROVIDER: 'openai' }))
      .toThrow('MEDIA_MODE_CONFIG_ERROR')
  })
})

// ---------------------------------------------------------------------------
// Per-task model override propagation for media tasks
// ---------------------------------------------------------------------------

describe('per-task model override propagation — media tasks', () => {
  it('applies OPENAI_MODEL_IMAGE_GENERATION override when set', () => {
    const resolved = resolveTaskAIConfig({
      AI_PROVIDER: 'openai',
      OPENAI_API_KEY: 'sk-key',
      OPENAI_MODEL_IMAGE_GENERATION: 'dall-e-3',
    }, 'imageGeneration')
    expect(resolved.model).toBe('dall-e-3')
  })

  it('applies OPENAI_MODEL_TTS override when set', () => {
    const resolved = resolveTaskAIConfig({
      AI_PROVIDER: 'openai',
      OPENAI_API_KEY: 'sk-key',
      OPENAI_MODEL_TTS: 'tts-1-hd',
    }, 'tts')
    expect(resolved.model).toBe('tts-1-hd')
  })

  it('applies GOOGLE_MODEL_IMAGE_GENERATION override when set', () => {
    const resolved = resolveTaskAIConfig({
      AI_PROVIDER: 'google',
      GOOGLE_API_KEY: 'google-key',
      GOOGLE_MODEL_IMAGE_GENERATION: 'imagen-4.0-generate-001',
    }, 'imageGeneration')
    expect(resolved.model).toBe('imagen-4.0-generate-001')
  })

  it('applies GOOGLE_MODEL_TTS override when set', () => {
    const resolved = resolveTaskAIConfig({
      AI_PROVIDER: 'google',
      GOOGLE_API_KEY: 'google-key',
      GOOGLE_MODEL_TTS: 'en-US-Chirp3-HD-Custom',
    }, 'tts')
    expect(resolved.model).toBe('en-US-Chirp3-HD-Custom')
  })

  it('falls back to default imageGeneration model when override is empty', () => {
    const resolved = resolveTaskAIConfig({
      AI_PROVIDER: 'openai',
      OPENAI_API_KEY: 'sk-key',
      OPENAI_MODEL_IMAGE_GENERATION: '',
    }, 'imageGeneration')
    expect(resolved.model).toBe(OPENAI_MODEL_DEFAULTS.imageGeneration)
  })

  it('falls back to default tts model when override is empty', () => {
    const resolved = resolveTaskAIConfig({
      AI_PROVIDER: 'openai',
      OPENAI_API_KEY: 'sk-key',
      OPENAI_MODEL_TTS: '',
    }, 'tts')
    expect(resolved.model).toBe(OPENAI_MODEL_DEFAULTS.tts)
  })
})
