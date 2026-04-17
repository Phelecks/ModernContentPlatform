/**
 * Unit tests — app/src/utils/mediaMode.js
 *
 * Validates media mode configuration parsing and validation logic.
 *
 * Covers:
 *   constants
 *     - MODE_IMAGE_VIDEO, MODE_FULL_VIDEO, VALID_MEDIA_MODES exported correctly
 *     - MEDIA_MODE_DEFINITIONS has correct shape for all modes
 *     - MEDIA_PROVIDER_CAPABILITIES has correct flags for openai and google
 *
 *   validateMediaModeForProvider
 *     - returns valid: true for image_video with openai
 *     - returns valid: true for image_video with google
 *     - returns valid: false with missing capabilities for full_video with openai
 *     - returns valid: false with missing capabilities for full_video with google
 *     - returns valid: false for unknown mode
 *     - returns valid: false for unknown provider (no capabilities map)
 *
 *   parseMediaModeConfig
 *     - returns correct config for image_video + openai
 *     - returns correct config for image_video + google
 *     - defaults to image_video when MEDIA_MODE is not set
 *     - defaults to openai when AI_PROVIDER is not set
 *     - defaults to image_video when MEDIA_MODE is empty string
 *     - defaults to openai when AI_PROVIDER is empty string
 *     - defaults to image_video when MEDIA_MODE is whitespace-only
 *     - throws MEDIA_MODE_CONFIG_ERROR for unknown mode
 *     - error message for unknown mode lists valid modes
 *     - error message for unknown mode includes the invalid value
 *     - throws MEDIA_MODE_CONFIG_ERROR for unknown AI_PROVIDER
 *     - error message for unknown AI_PROVIDER lists supported providers
 *     - error message for unknown AI_PROVIDER includes the invalid value
 *     - throws MEDIA_MODE_CONFIG_ERROR for full_video with openai (missing capability)
 *     - throws MEDIA_MODE_CONFIG_ERROR for full_video with google (missing capability)
 *     - error message for incompatible mode names required and missing capabilities
 *     - error message for incompatible mode names the provider
 *
 *   fixture files
 *     - image-video-openai fixture matches parseMediaModeConfig output
 *     - image-video-google fixture matches parseMediaModeConfig output
 *     - default-no-mode-set fixture matches parseMediaModeConfig output
 *     - invalid-full-video-openai fixture causes parseMediaModeConfig to throw
 *     - invalid-unknown-mode fixture causes parseMediaModeConfig to throw
 *     - invalid-unknown-provider fixture causes parseMediaModeConfig to throw
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  MODE_IMAGE_VIDEO,
  MODE_FULL_VIDEO,
  VALID_MEDIA_MODES,
  MEDIA_MODE_DEFINITIONS,
  MEDIA_PROVIDER_CAPABILITIES,
  validateMediaModeForProvider,
  parseMediaModeConfig,
} from '@/utils/mediaMode.js'

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const REPO_ROOT = join(process.cwd(), '..')
const FIXTURES_DIR = join(REPO_ROOT, 'fixtures', 'media-mode')

function loadFixture(name) {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf8'))
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('constants', () => {
  it('MODE_IMAGE_VIDEO is "image_video"', () => {
    expect(MODE_IMAGE_VIDEO).toBe('image_video')
  })

  it('MODE_FULL_VIDEO is "full_video"', () => {
    expect(MODE_FULL_VIDEO).toBe('full_video')
  })

  it('VALID_MEDIA_MODES contains both modes', () => {
    expect(VALID_MEDIA_MODES).toEqual(['image_video', 'full_video'])
  })
})

// ---------------------------------------------------------------------------
// MEDIA_MODE_DEFINITIONS
// ---------------------------------------------------------------------------

describe('MEDIA_MODE_DEFINITIONS', () => {
  it('image_video definition has correct shape', () => {
    const def = MEDIA_MODE_DEFINITIONS[MODE_IMAGE_VIDEO]
    expect(def).toBeDefined()
    expect(def.workflowSteps).toEqual([
      '06_video_script',
      '06b_generate_images',
      '06c_generate_narration',
    ])
    expect(def.requiredCapabilities).toEqual(['imageGeneration', 'tts'])
    expect(def.available).toBe(true)
  })

  it('full_video definition has correct shape', () => {
    const def = MEDIA_MODE_DEFINITIONS[MODE_FULL_VIDEO]
    expect(def).toBeDefined()
    expect(def.workflowSteps).toEqual([
      '06_video_script',
      '06_full_video_generation',
    ])
    expect(def.requiredCapabilities).toEqual(['fullVideoGeneration'])
    expect(def.available).toBe(false)
  })

  it('every mode in VALID_MEDIA_MODES has a definition', () => {
    for (const mode of VALID_MEDIA_MODES) {
      expect(MEDIA_MODE_DEFINITIONS[mode]).toBeDefined()
    }
  })

  it('every definition has a non-empty description', () => {
    for (const [, def] of Object.entries(MEDIA_MODE_DEFINITIONS)) {
      expect(typeof def.description).toBe('string')
      expect(def.description.length).toBeGreaterThan(10)
    }
  })
})

// ---------------------------------------------------------------------------
// MEDIA_PROVIDER_CAPABILITIES
// ---------------------------------------------------------------------------

describe('MEDIA_PROVIDER_CAPABILITIES', () => {
  it('openai supports imageGeneration and tts', () => {
    expect(MEDIA_PROVIDER_CAPABILITIES.openai.imageGeneration).toBe(true)
    expect(MEDIA_PROVIDER_CAPABILITIES.openai.tts).toBe(true)
  })

  it('google supports imageGeneration and tts', () => {
    expect(MEDIA_PROVIDER_CAPABILITIES.google.imageGeneration).toBe(true)
    expect(MEDIA_PROVIDER_CAPABILITIES.google.tts).toBe(true)
  })

  it('openai does not support fullVideoGeneration in v1', () => {
    expect(MEDIA_PROVIDER_CAPABILITIES.openai.fullVideoGeneration).toBe(false)
  })

  it('google does not support fullVideoGeneration in v1', () => {
    expect(MEDIA_PROVIDER_CAPABILITIES.google.fullVideoGeneration).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// validateMediaModeForProvider
// ---------------------------------------------------------------------------

describe('validateMediaModeForProvider', () => {
  it('returns valid: true for image_video with openai', () => {
    const result = validateMediaModeForProvider(MODE_IMAGE_VIDEO, 'openai')
    expect(result.valid).toBe(true)
    expect(result.missingCapabilities).toEqual([])
  })

  it('returns valid: true for image_video with google', () => {
    const result = validateMediaModeForProvider(MODE_IMAGE_VIDEO, 'google')
    expect(result.valid).toBe(true)
    expect(result.missingCapabilities).toEqual([])
  })

  it('returns valid: false for full_video with openai — fullVideoGeneration is missing', () => {
    const result = validateMediaModeForProvider(MODE_FULL_VIDEO, 'openai')
    expect(result.valid).toBe(false)
    expect(result.missingCapabilities).toContain('fullVideoGeneration')
  })

  it('returns valid: false for full_video with google — fullVideoGeneration is missing', () => {
    const result = validateMediaModeForProvider(MODE_FULL_VIDEO, 'google')
    expect(result.valid).toBe(false)
    expect(result.missingCapabilities).toContain('fullVideoGeneration')
  })

  it('returns valid: false for an unknown mode', () => {
    const result = validateMediaModeForProvider('gif_only', 'openai')
    expect(result.valid).toBe(false)
    expect(result.missingCapabilities).toEqual([])
  })

  it('returns valid: false for an unknown provider (no capability map)', () => {
    const result = validateMediaModeForProvider(MODE_FULL_VIDEO, 'unknown_provider')
    expect(result.valid).toBe(false)
    expect(result.missingCapabilities).toContain('fullVideoGeneration')
  })
})

// ---------------------------------------------------------------------------
// parseMediaModeConfig — valid configurations
// ---------------------------------------------------------------------------

describe('parseMediaModeConfig — valid configurations', () => {
  it('returns correct config for image_video + openai', () => {
    const result = parseMediaModeConfig({ MEDIA_MODE: 'image_video', AI_PROVIDER: 'openai' })
    expect(result.mode).toBe('image_video')
    expect(result.provider).toBe('openai')
    expect(result.workflowSteps).toEqual([
      '06_video_script',
      '06b_generate_images',
      '06c_generate_narration',
    ])
    expect(result.requiredCapabilities).toEqual(['imageGeneration', 'tts'])
    expect(result.available).toBe(true)
  })

  it('returns correct config for image_video + google', () => {
    const result = parseMediaModeConfig({ MEDIA_MODE: 'image_video', AI_PROVIDER: 'google' })
    expect(result.mode).toBe('image_video')
    expect(result.provider).toBe('google')
    expect(result.available).toBe(true)
  })

  it('defaults to image_video when MEDIA_MODE is not set', () => {
    const result = parseMediaModeConfig({ AI_PROVIDER: 'openai' })
    expect(result.mode).toBe('image_video')
  })

  it('defaults to openai when AI_PROVIDER is not set', () => {
    const result = parseMediaModeConfig({ MEDIA_MODE: 'image_video' })
    expect(result.provider).toBe('openai')
  })

  it('defaults to image_video when MEDIA_MODE is an empty string', () => {
    const result = parseMediaModeConfig({ MEDIA_MODE: '', AI_PROVIDER: 'openai' })
    expect(result.mode).toBe('image_video')
  })

  it('defaults to openai when AI_PROVIDER is an empty string', () => {
    const result = parseMediaModeConfig({ MEDIA_MODE: 'image_video', AI_PROVIDER: '' })
    expect(result.provider).toBe('openai')
  })

  it('defaults to image_video when MEDIA_MODE is whitespace-only', () => {
    const result = parseMediaModeConfig({ MEDIA_MODE: '   ', AI_PROVIDER: 'openai' })
    expect(result.mode).toBe('image_video')
  })

  it('returns correct config when called with an empty env object', () => {
    const result = parseMediaModeConfig({})
    expect(result.mode).toBe('image_video')
    expect(result.provider).toBe('openai')
    expect(result.available).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// parseMediaModeConfig — invalid configurations
// ---------------------------------------------------------------------------

describe('parseMediaModeConfig — invalid configurations', () => {
  it('throws MEDIA_MODE_CONFIG_ERROR for an unknown mode', () => {
    expect(() => parseMediaModeConfig({ MEDIA_MODE: 'gif_only', AI_PROVIDER: 'openai' }))
      .toThrow('MEDIA_MODE_CONFIG_ERROR')
  })

  it('error message for unknown mode lists valid modes', () => {
    expect(() => parseMediaModeConfig({ MEDIA_MODE: 'gif_only', AI_PROVIDER: 'openai' }))
      .toThrow('image_video')
  })

  it('error message for unknown mode includes the invalid value', () => {
    expect(() => parseMediaModeConfig({ MEDIA_MODE: 'gif_only', AI_PROVIDER: 'openai' }))
      .toThrow('gif_only')
  })

  it('throws MEDIA_MODE_CONFIG_ERROR for an unknown AI_PROVIDER', () => {
    expect(() => parseMediaModeConfig({ MEDIA_MODE: 'image_video', AI_PROVIDER: 'anthropic' }))
      .toThrow('MEDIA_MODE_CONFIG_ERROR')
  })

  it('error message for unknown AI_PROVIDER lists supported providers', () => {
    expect(() => parseMediaModeConfig({ MEDIA_MODE: 'image_video', AI_PROVIDER: 'anthropic' }))
      .toThrow('openai')
  })

  it('error message for unknown AI_PROVIDER includes the invalid value', () => {
    expect(() => parseMediaModeConfig({ MEDIA_MODE: 'image_video', AI_PROVIDER: 'anthropic' }))
      .toThrow('anthropic')
  })

  it('throws MEDIA_MODE_CONFIG_ERROR for full_video with openai — no fullVideoGeneration', () => {
    expect(() => parseMediaModeConfig({ MEDIA_MODE: 'full_video', AI_PROVIDER: 'openai' }))
      .toThrow('MEDIA_MODE_CONFIG_ERROR')
  })

  it('throws MEDIA_MODE_CONFIG_ERROR for full_video with google — no fullVideoGeneration', () => {
    expect(() => parseMediaModeConfig({ MEDIA_MODE: 'full_video', AI_PROVIDER: 'google' }))
      .toThrow('MEDIA_MODE_CONFIG_ERROR')
  })

  it('error message for incompatible mode names the missing capability', () => {
    expect(() => parseMediaModeConfig({ MEDIA_MODE: 'full_video', AI_PROVIDER: 'openai' }))
      .toThrow('fullVideoGeneration')
  })

  it('error message for incompatible mode names the required capabilities', () => {
    expect(() => parseMediaModeConfig({ MEDIA_MODE: 'full_video', AI_PROVIDER: 'openai' }))
      .toThrow('fullVideoGeneration')
  })

  it('error message for incompatible mode names the provider', () => {
    expect(() => parseMediaModeConfig({ MEDIA_MODE: 'full_video', AI_PROVIDER: 'openai' }))
      .toThrow('openai')
  })
})

// ---------------------------------------------------------------------------
// Fixture files
// ---------------------------------------------------------------------------

describe('fixture files', () => {
  it('image-video-openai fixture matches parseMediaModeConfig output', () => {
    const fixture = loadFixture('image-video-openai.json')
    const result = parseMediaModeConfig(fixture.env)
    expect(result).toEqual(fixture.expected)
  })

  it('image-video-google fixture matches parseMediaModeConfig output', () => {
    const fixture = loadFixture('image-video-google.json')
    const result = parseMediaModeConfig(fixture.env)
    expect(result).toEqual(fixture.expected)
  })

  it('default-no-mode-set fixture matches parseMediaModeConfig output', () => {
    const fixture = loadFixture('default-no-mode-set.json')
    const result = parseMediaModeConfig(fixture.env)
    expect(result).toEqual(fixture.expected)
  })

  it('invalid-full-video-openai fixture causes parseMediaModeConfig to throw', () => {
    const fixture = loadFixture('invalid-full-video-openai.json')
    expect(() => parseMediaModeConfig(fixture.env)).toThrow(fixture.expected.errorPrefix)
  })

  it('invalid-unknown-mode fixture causes parseMediaModeConfig to throw', () => {
    const fixture = loadFixture('invalid-unknown-mode.json')
    expect(() => parseMediaModeConfig(fixture.env)).toThrow(fixture.expected.errorPrefix)
  })

  it('invalid-unknown-provider fixture causes parseMediaModeConfig to throw', () => {
    const fixture = loadFixture('invalid-unknown-provider.json')
    expect(() => parseMediaModeConfig(fixture.env)).toThrow(fixture.expected.errorPrefix)
  })
})
