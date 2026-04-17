/**
 * Media Task Contract Tests
 *
 * Verifies that the image generation and TTS/narration validators enforce the
 * contracts defined in schemas/ai/image_generation_asset.json and
 * schemas/ai/narration_asset.json.
 *
 * These tests parallel the structure of openai-task-contracts.test.js for the
 * two binary-output media tasks that are specific to the image_video pipeline:
 *   - 06b_generate_images  → image generation asset
 *   - 06c_generate_narration → narration (TTS) asset
 *
 * Covers:
 *
 *   1. Schema example fixtures
 *      Canonical examples from the schema files pass the matching validator.
 *
 *   2. Required-field enforcement
 *      Removing each required field produces a validation error.
 *
 *   3. Provider-specific format validation
 *      - OpenAI images use format='url' and a non-null url field.
 *      - Google images use format='b64_json' and a non-null b64_json field.
 *      - OpenAI TTS uses voice='alloy' and audio_encoding='mp3'.
 *      - Google TTS uses voice='en-US-Chirp3-HD-Aoede' and audio_encoding='mp3'.
 *
 *   4. Invalid / incomplete output handling
 *      Non-object, empty-object, and malformed inputs are rejected.
 *
 *   5. Optional-field robustness
 *      Outputs that omit every optional field are still accepted.
 *
 *   6. parseAndValidate* error handling
 *      parseAndValidateImageGenerationAsset and parseAndValidateNarrationAsset
 *      throw AI_VALIDATION_ERROR on invalid input.
 *
 *   7. image_count / images.length consistency
 *      image_count must equal images.length or validation fails.
 *
 *   8. audio_b64=null support (TTS partial-failure contract)
 *      A narration asset with audio_b64=null is valid — it signals that TTS
 *      generation failed non-fatally and the pipeline continues without audio.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  validateImageGenerationAsset,
  parseAndValidateImageGenerationAsset,
  VALID_IMAGE_FORMATS,
  VALID_IMAGE_PROVIDERS,
  VALID_IMAGE_MIME_TYPES,
  validateNarrationAsset,
  parseAndValidateNarrationAsset,
  VALID_NARRATION_PROVIDERS,
  VALID_NARRATION_FORMATS,
  VALID_NARRATION_AUDIO_ENCODINGS,
} from '@/utils/validateAiOutput.js'
import {
  OPENAI_MODEL_DEFAULTS,
  GOOGLE_MODEL_DEFAULTS,
  TTS_VOICE_DEFAULTS,
} from '@/utils/openaiConfig.js'

// ---------------------------------------------------------------------------
// Helpers — load schema example fixtures
// ---------------------------------------------------------------------------

const SCHEMAS_DIR = join(process.cwd(), '..', 'schemas', 'ai')

function loadSchema(schemaFile) {
  return JSON.parse(readFileSync(join(SCHEMAS_DIR, schemaFile), 'utf8'))
}

function loadSchemaExamples(schemaFile) {
  return loadSchema(schemaFile).examples ?? []
}

function loadSchemaRequired(schemaFile) {
  return loadSchema(schemaFile).required ?? []
}

// Strip internal meta keys (e.g. `_topic`) that exist only as schema annotations
function stripMetaKeys(obj) {
  const result = { ...obj }
  for (const key of Object.keys(result)) {
    if (key.startsWith('_')) delete result[key]
  }
  return result
}

// ---------------------------------------------------------------------------
// Minimal valid objects (required fields only)
// ---------------------------------------------------------------------------

const MINIMAL_IMAGE_ASSET_OPENAI = {
  images: [
    {
      index: 0,
      prompt: 'Professional finance news thumbnail with rising charts',
      provider: 'openai',
      model: 'gpt-image-1',
      format: 'url',
      url: 'https://oaidalleapiprodscus.blob.core.windows.net/private/example-url',
      generated_at: '2025-01-15T10:00:00.000Z',
    },
  ],
  image_count: 1,
  provider: 'openai',
  model: 'gpt-image-1',
  generated_at: '2025-01-15T10:00:00.000Z',
}

const MINIMAL_IMAGE_ASSET_GOOGLE = {
  images: [
    {
      index: 0,
      prompt: 'Cryptocurrency market visualization with Bitcoin symbols',
      provider: 'google',
      model: 'imagen-3.0-generate-001',
      format: 'b64_json',
      b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      mime_type: 'image/png',
      generated_at: '2025-01-15T10:00:00.000Z',
    },
  ],
  image_count: 1,
  provider: 'google',
  model: 'imagen-3.0-generate-001',
  generated_at: '2025-01-15T10:00:00.000Z',
}

const MINIMAL_NARRATION_ASSET_OPENAI = {
  provider: 'openai',
  model: 'gpt-4o-mini-tts',
  voice: 'alloy',
  format: 'b64_json',
  audio_encoding: 'mp3',
  audio_b64: 'SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjYwLjE2LjEwMAAAAAAAAAAAAAAA',
  char_count: 842,
  generated_at: '2025-01-15T10:00:00.000Z',
  warning: null,
}

const MINIMAL_NARRATION_ASSET_GOOGLE = {
  provider: 'google',
  model: 'en-US-Chirp3-HD-Aoede',
  voice: 'en-US-Chirp3-HD-Aoede',
  format: 'b64_json',
  audio_encoding: 'mp3',
  audio_b64: 'SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjYwLjE2LjEwMAAAAAAAAAAAAAAA',
  char_count: 934,
  generated_at: '2025-01-15T10:00:00.000Z',
  warning: null,
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('image generation constants', () => {
  it('VALID_IMAGE_FORMATS contains url and b64_json', () => {
    expect(VALID_IMAGE_FORMATS).toContain('url')
    expect(VALID_IMAGE_FORMATS).toContain('b64_json')
  })

  it('VALID_IMAGE_PROVIDERS contains openai and google', () => {
    expect(VALID_IMAGE_PROVIDERS).toContain('openai')
    expect(VALID_IMAGE_PROVIDERS).toContain('google')
  })

  it('VALID_IMAGE_MIME_TYPES contains image/png, image/jpeg, image/webp', () => {
    expect(VALID_IMAGE_MIME_TYPES).toContain('image/png')
    expect(VALID_IMAGE_MIME_TYPES).toContain('image/jpeg')
    expect(VALID_IMAGE_MIME_TYPES).toContain('image/webp')
  })

  it('OPENAI_MODEL_DEFAULTS.imageGeneration is gpt-image-1', () => {
    expect(OPENAI_MODEL_DEFAULTS.imageGeneration).toBe('gpt-image-1')
  })

  it('GOOGLE_MODEL_DEFAULTS.imageGeneration is the Imagen 3 model', () => {
    expect(GOOGLE_MODEL_DEFAULTS.imageGeneration).toBe('imagen-3.0-generate-001')
  })
})

describe('TTS/narration constants', () => {
  it('VALID_NARRATION_PROVIDERS contains openai and google', () => {
    expect(VALID_NARRATION_PROVIDERS).toContain('openai')
    expect(VALID_NARRATION_PROVIDERS).toContain('google')
  })

  it('VALID_NARRATION_FORMATS contains b64_json', () => {
    expect(VALID_NARRATION_FORMATS).toContain('b64_json')
    expect(VALID_NARRATION_FORMATS).toHaveLength(1)
  })

  it('VALID_NARRATION_AUDIO_ENCODINGS includes mp3, opus, aac, flac, wav, pcm', () => {
    expect(VALID_NARRATION_AUDIO_ENCODINGS).toContain('mp3')
    expect(VALID_NARRATION_AUDIO_ENCODINGS).toContain('opus')
    expect(VALID_NARRATION_AUDIO_ENCODINGS).toContain('aac')
    expect(VALID_NARRATION_AUDIO_ENCODINGS).toContain('flac')
    expect(VALID_NARRATION_AUDIO_ENCODINGS).toContain('wav')
    expect(VALID_NARRATION_AUDIO_ENCODINGS).toContain('pcm')
  })

  it('OPENAI_MODEL_DEFAULTS.tts is gpt-4o-mini-tts', () => {
    expect(OPENAI_MODEL_DEFAULTS.tts).toBe('gpt-4o-mini-tts')
  })

  it('GOOGLE_MODEL_DEFAULTS.tts is the Google Cloud TTS Chirp3 HD voice identifier', () => {
    expect(GOOGLE_MODEL_DEFAULTS.tts).toBe('en-US-Chirp3-HD-Aoede')
  })

  it('TTS_VOICE_DEFAULTS.openai is alloy', () => {
    expect(TTS_VOICE_DEFAULTS.openai).toBe('alloy')
  })

  it('TTS_VOICE_DEFAULTS.google matches GOOGLE_MODEL_DEFAULTS.tts', () => {
    expect(TTS_VOICE_DEFAULTS.google).toBe(GOOGLE_MODEL_DEFAULTS.tts)
  })
})

// ---------------------------------------------------------------------------
// 1. Schema example fixtures — image generation asset
// ---------------------------------------------------------------------------

describe('schema example fixtures — image generation asset', () => {
  const examples = loadSchemaExamples('image_generation_asset.json')

  it('at least one example is defined in the schema', () => {
    expect(examples.length).toBeGreaterThan(0)
  })

  examples.forEach((example, i) => {
    const fixture = stripMetaKeys(example)
    it(`example[${i}] passes validateImageGenerationAsset`, () => {
      const result = validateImageGenerationAsset(fixture)
      expect(result.ok).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it(`example[${i}] passes parseAndValidateImageGenerationAsset`, () => {
      expect(() => parseAndValidateImageGenerationAsset(fixture)).not.toThrow()
    })
  })
})

// ---------------------------------------------------------------------------
// 1. Schema example fixtures — narration asset
// ---------------------------------------------------------------------------

describe('schema example fixtures — narration asset', () => {
  const examples = loadSchemaExamples('narration_asset.json')

  it('at least one example is defined in the schema', () => {
    expect(examples.length).toBeGreaterThan(0)
  })

  examples.forEach((example, i) => {
    const fixture = stripMetaKeys(example)
    it(`example[${i}] passes validateNarrationAsset`, () => {
      const result = validateNarrationAsset(fixture)
      expect(result.ok).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it(`example[${i}] passes parseAndValidateNarrationAsset`, () => {
      expect(() => parseAndValidateNarrationAsset(fixture)).not.toThrow()
    })
  })
})

// ---------------------------------------------------------------------------
// 2. Required-field enforcement — image generation asset
// ---------------------------------------------------------------------------

describe('required-field enforcement — image generation asset', () => {
  const REQUIRED = loadSchemaRequired('image_generation_asset.json')

  REQUIRED.forEach(field => {
    it(`removing top-level "${field}" produces a validation error`, () => {
      const obj = { ...MINIMAL_IMAGE_ASSET_OPENAI }
      delete obj[field]
      const { ok, errors } = validateImageGenerationAsset(obj)
      expect(ok).toBe(false)
      expect(errors.length).toBeGreaterThan(0)
    })
  })

  it('removing images[0].index produces a validation error', () => {
    const img = { ...MINIMAL_IMAGE_ASSET_OPENAI.images[0] }
    delete img.index
    const obj = { ...MINIMAL_IMAGE_ASSET_OPENAI, images: [img] }
    const { ok, errors } = validateImageGenerationAsset(obj)
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('index'))).toBe(true)
  })

  it('removing images[0].prompt produces a validation error', () => {
    const img = { ...MINIMAL_IMAGE_ASSET_OPENAI.images[0] }
    delete img.prompt
    const obj = { ...MINIMAL_IMAGE_ASSET_OPENAI, images: [img] }
    const { ok, errors } = validateImageGenerationAsset(obj)
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('prompt'))).toBe(true)
  })

  it('removing images[0].provider produces a validation error', () => {
    const img = { ...MINIMAL_IMAGE_ASSET_OPENAI.images[0] }
    delete img.provider
    const obj = { ...MINIMAL_IMAGE_ASSET_OPENAI, images: [img] }
    const { ok, errors } = validateImageGenerationAsset(obj)
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('provider'))).toBe(true)
  })

  it('removing images[0].model produces a validation error', () => {
    const img = { ...MINIMAL_IMAGE_ASSET_OPENAI.images[0] }
    delete img.model
    const obj = { ...MINIMAL_IMAGE_ASSET_OPENAI, images: [img] }
    const { ok, errors } = validateImageGenerationAsset(obj)
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('model'))).toBe(true)
  })

  it('removing images[0].format produces a validation error', () => {
    const img = { ...MINIMAL_IMAGE_ASSET_OPENAI.images[0] }
    delete img.format
    const obj = { ...MINIMAL_IMAGE_ASSET_OPENAI, images: [img] }
    const { ok, errors } = validateImageGenerationAsset(obj)
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('format'))).toBe(true)
  })

  it('removing images[0].generated_at produces a validation error', () => {
    const img = { ...MINIMAL_IMAGE_ASSET_OPENAI.images[0] }
    delete img.generated_at
    const obj = { ...MINIMAL_IMAGE_ASSET_OPENAI, images: [img] }
    const { ok, errors } = validateImageGenerationAsset(obj)
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('generated_at'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 2. Required-field enforcement — narration asset
// ---------------------------------------------------------------------------

describe('required-field enforcement — narration asset', () => {
  const REQUIRED = loadSchemaRequired('narration_asset.json')

  REQUIRED.forEach(field => {
    it(`removing "${field}" produces a validation error`, () => {
      const obj = { ...MINIMAL_NARRATION_ASSET_OPENAI }
      delete obj[field]
      const { ok, errors } = validateNarrationAsset(obj)
      expect(ok).toBe(false)
      expect(errors.length).toBeGreaterThan(0)
    })
  })
})

// ---------------------------------------------------------------------------
// 3. Provider-specific format validation — image generation asset
// ---------------------------------------------------------------------------

describe('provider-specific format — OpenAI image asset', () => {
  it('accepts format=url with a non-null url field', () => {
    const { ok } = validateImageGenerationAsset(MINIMAL_IMAGE_ASSET_OPENAI)
    expect(ok).toBe(true)
  })

  it('rejects format=url when url is missing', () => {
    const img = { ...MINIMAL_IMAGE_ASSET_OPENAI.images[0] }
    delete img.url
    const obj = { ...MINIMAL_IMAGE_ASSET_OPENAI, images: [img] }
    const { ok, errors } = validateImageGenerationAsset(obj)
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('url'))).toBe(true)
  })

  it('rejects format=url when url is an empty string', () => {
    const img = { ...MINIMAL_IMAGE_ASSET_OPENAI.images[0], url: '' }
    const obj = { ...MINIMAL_IMAGE_ASSET_OPENAI, images: [img] }
    const { ok, errors } = validateImageGenerationAsset(obj)
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('url'))).toBe(true)
  })

  it('uses gpt-image-1 as the default OpenAI image generation model', () => {
    expect(MINIMAL_IMAGE_ASSET_OPENAI.model).toBe(OPENAI_MODEL_DEFAULTS.imageGeneration)
  })
})

describe('provider-specific format — Google image asset', () => {
  it('accepts format=b64_json with non-null b64_json and valid mime_type', () => {
    const { ok } = validateImageGenerationAsset(MINIMAL_IMAGE_ASSET_GOOGLE)
    expect(ok).toBe(true)
  })

  it('rejects format=b64_json when b64_json is missing', () => {
    const img = { ...MINIMAL_IMAGE_ASSET_GOOGLE.images[0] }
    delete img.b64_json
    const obj = { ...MINIMAL_IMAGE_ASSET_GOOGLE, images: [img] }
    const { ok, errors } = validateImageGenerationAsset(obj)
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('b64_json'))).toBe(true)
  })

  it('rejects format=b64_json when b64_json is an empty string', () => {
    const img = { ...MINIMAL_IMAGE_ASSET_GOOGLE.images[0], b64_json: '' }
    const obj = { ...MINIMAL_IMAGE_ASSET_GOOGLE, images: [img] }
    const { ok, errors } = validateImageGenerationAsset(obj)
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('b64_json'))).toBe(true)
  })

  it('rejects an invalid mime_type for b64_json format', () => {
    const img = { ...MINIMAL_IMAGE_ASSET_GOOGLE.images[0], mime_type: 'image/gif' }
    const obj = { ...MINIMAL_IMAGE_ASSET_GOOGLE, images: [img] }
    const { ok, errors } = validateImageGenerationAsset(obj)
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('mime_type'))).toBe(true)
  })

  it('uses imagen-3.0-generate-001 as the default Google image generation model', () => {
    expect(MINIMAL_IMAGE_ASSET_GOOGLE.model).toBe(GOOGLE_MODEL_DEFAULTS.imageGeneration)
  })
})

// ---------------------------------------------------------------------------
// 3. Provider-specific format validation — narration asset
// ---------------------------------------------------------------------------

describe('provider-specific format — OpenAI narration asset', () => {
  it('accepts a valid OpenAI narration asset', () => {
    const { ok } = validateNarrationAsset(MINIMAL_NARRATION_ASSET_OPENAI)
    expect(ok).toBe(true)
  })

  it('uses gpt-4o-mini-tts as the default OpenAI TTS model', () => {
    expect(MINIMAL_NARRATION_ASSET_OPENAI.model).toBe(OPENAI_MODEL_DEFAULTS.tts)
  })

  it('uses alloy as the default OpenAI TTS voice', () => {
    expect(MINIMAL_NARRATION_ASSET_OPENAI.voice).toBe(TTS_VOICE_DEFAULTS.openai)
  })

  it('rejects an invalid audio_encoding for OpenAI asset', () => {
    const obj = { ...MINIMAL_NARRATION_ASSET_OPENAI, audio_encoding: 'wma' }
    const { ok, errors } = validateNarrationAsset(obj)
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('audio_encoding'))).toBe(true)
  })
})

describe('provider-specific format — Google narration asset', () => {
  it('accepts a valid Google narration asset', () => {
    const { ok } = validateNarrationAsset(MINIMAL_NARRATION_ASSET_GOOGLE)
    expect(ok).toBe(true)
  })

  it('uses the Chirp3 HD voice identifier as the default Google TTS model/voice', () => {
    expect(MINIMAL_NARRATION_ASSET_GOOGLE.model).toBe(GOOGLE_MODEL_DEFAULTS.tts)
    expect(MINIMAL_NARRATION_ASSET_GOOGLE.voice).toBe(TTS_VOICE_DEFAULTS.google)
  })

  it('rejects an invalid provider value on Google asset', () => {
    const obj = { ...MINIMAL_NARRATION_ASSET_GOOGLE, provider: 'anthropic' }
    const { ok, errors } = validateNarrationAsset(obj)
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('provider'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 4. Invalid / incomplete output handling — image generation asset
// ---------------------------------------------------------------------------

describe('invalid output handling — image generation asset', () => {
  const CASES = [null, undefined, 42, 'string', [], true]

  CASES.forEach(input => {
    it(`returns ok=false for input: ${JSON.stringify(input)}`, () => {
      const { ok } = validateImageGenerationAsset(input)
      expect(ok).toBe(false)
    })
  })

  it('returns ok=false for an empty object', () => {
    const { ok, errors } = validateImageGenerationAsset({})
    expect(ok).toBe(false)
    expect(errors.length).toBeGreaterThan(0)
  })

  it('rejects an unknown format value in images[0]', () => {
    const img = { ...MINIMAL_IMAGE_ASSET_OPENAI.images[0], format: 'svg' }
    const obj = { ...MINIMAL_IMAGE_ASSET_OPENAI, images: [img] }
    const { ok, errors } = validateImageGenerationAsset(obj)
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('format'))).toBe(true)
  })

  it('rejects an unknown provider at the asset level', () => {
    const obj = { ...MINIMAL_IMAGE_ASSET_OPENAI, provider: 'midjourney' }
    const { ok, errors } = validateImageGenerationAsset(obj)
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('provider'))).toBe(true)
  })

  it('rejects images array with more than 4 entries', () => {
    const images = Array.from({ length: 5 }, (_, i) => ({
      ...MINIMAL_IMAGE_ASSET_OPENAI.images[0],
      index: i,
    }))
    const obj = { ...MINIMAL_IMAGE_ASSET_OPENAI, images, image_count: 5 }
    const { ok, errors } = validateImageGenerationAsset(obj)
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('images'))).toBe(true)
  })

  it('rejects image_count=0', () => {
    const obj = { ...MINIMAL_IMAGE_ASSET_OPENAI, image_count: 0 }
    const { ok, errors } = validateImageGenerationAsset(obj)
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('image_count'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 4. Invalid / incomplete output handling — narration asset
// ---------------------------------------------------------------------------

describe('invalid output handling — narration asset', () => {
  const CASES = [null, undefined, 42, 'string', [], true]

  CASES.forEach(input => {
    it(`returns ok=false for input: ${JSON.stringify(input)}`, () => {
      const { ok } = validateNarrationAsset(input)
      expect(ok).toBe(false)
    })
  })

  it('returns ok=false for an empty object', () => {
    const { ok, errors } = validateNarrationAsset({})
    expect(ok).toBe(false)
    expect(errors.length).toBeGreaterThan(0)
  })

  it('rejects an unknown audio_encoding', () => {
    const obj = { ...MINIMAL_NARRATION_ASSET_OPENAI, audio_encoding: 'wma' }
    const { ok, errors } = validateNarrationAsset(obj)
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('audio_encoding'))).toBe(true)
  })

  it('rejects an unknown format', () => {
    const obj = { ...MINIMAL_NARRATION_ASSET_OPENAI, format: 'url' }
    const { ok, errors } = validateNarrationAsset(obj)
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('format'))).toBe(true)
  })

  it('rejects char_count=0', () => {
    const obj = { ...MINIMAL_NARRATION_ASSET_OPENAI, char_count: 0 }
    const { ok, errors } = validateNarrationAsset(obj)
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('char_count'))).toBe(true)
  })

  it('rejects a negative duration_seconds', () => {
    const obj = { ...MINIMAL_NARRATION_ASSET_OPENAI, duration_seconds: -1 }
    const { ok, errors } = validateNarrationAsset(obj)
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('duration_seconds'))).toBe(true)
  })

  it('rejects a warning longer than 500 characters', () => {
    const obj = { ...MINIMAL_NARRATION_ASSET_OPENAI, warning: 'x'.repeat(501) }
    const { ok, errors } = validateNarrationAsset(obj)
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('warning'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 5. Optional-field robustness — image generation asset
// ---------------------------------------------------------------------------

describe('optional-field robustness — image generation asset', () => {
  it('accepts an OpenAI image without revised_prompt', () => {
    const img = { ...MINIMAL_IMAGE_ASSET_OPENAI.images[0] }
    delete img.revised_prompt
    const obj = { ...MINIMAL_IMAGE_ASSET_OPENAI, images: [img] }
    const { ok } = validateImageGenerationAsset(obj)
    expect(ok).toBe(true)
  })

  it('accepts an OpenAI image with revised_prompt=null', () => {
    const img = { ...MINIMAL_IMAGE_ASSET_OPENAI.images[0], revised_prompt: null }
    const obj = { ...MINIMAL_IMAGE_ASSET_OPENAI, images: [img] }
    const { ok } = validateImageGenerationAsset(obj)
    expect(ok).toBe(true)
  })

  it('accepts an OpenAI image without size', () => {
    const img = { ...MINIMAL_IMAGE_ASSET_OPENAI.images[0] }
    delete img.size
    const obj = { ...MINIMAL_IMAGE_ASSET_OPENAI, images: [img] }
    const { ok } = validateImageGenerationAsset(obj)
    expect(ok).toBe(true)
  })

  it('accepts a Google image with mime_type=null', () => {
    const img = { ...MINIMAL_IMAGE_ASSET_GOOGLE.images[0], mime_type: null }
    const obj = { ...MINIMAL_IMAGE_ASSET_GOOGLE, images: [img] }
    const { ok } = validateImageGenerationAsset(obj)
    expect(ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 5. Optional-field robustness — narration asset
// ---------------------------------------------------------------------------

describe('optional-field robustness — narration asset', () => {
  it('accepts a narration asset with duration_seconds=null', () => {
    const obj = { ...MINIMAL_NARRATION_ASSET_OPENAI, duration_seconds: null }
    const { ok } = validateNarrationAsset(obj)
    expect(ok).toBe(true)
  })

  it('accepts a narration asset without duration_seconds field', () => {
    const obj = { ...MINIMAL_NARRATION_ASSET_OPENAI }
    delete obj.duration_seconds
    const { ok } = validateNarrationAsset(obj)
    expect(ok).toBe(true)
  })

  it('accepts a valid positive duration_seconds', () => {
    const obj = { ...MINIMAL_NARRATION_ASSET_OPENAI, duration_seconds: 45.5 }
    const { ok } = validateNarrationAsset(obj)
    expect(ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 6. parseAndValidate* — AI_VALIDATION_ERROR on invalid input
// ---------------------------------------------------------------------------

describe('parseAndValidateImageGenerationAsset — AI_VALIDATION_ERROR on invalid input', () => {
  it('throws AI_VALIDATION_ERROR for an empty object', () => {
    expect(() => parseAndValidateImageGenerationAsset({})).toThrow('AI_VALIDATION_ERROR')
  })

  it('throws AI_VALIDATION_ERROR for null', () => {
    expect(() => parseAndValidateImageGenerationAsset(null)).toThrow('AI_VALIDATION_ERROR')
  })

  it('throws AI_VALIDATION_ERROR when images array is empty', () => {
    const obj = { ...MINIMAL_IMAGE_ASSET_OPENAI, images: [], image_count: 0 }
    expect(() => parseAndValidateImageGenerationAsset(obj)).toThrow('AI_VALIDATION_ERROR')
  })

  it('returns the asset unmodified on success', () => {
    const result = parseAndValidateImageGenerationAsset(MINIMAL_IMAGE_ASSET_OPENAI)
    expect(result).toBe(MINIMAL_IMAGE_ASSET_OPENAI)
  })
})

describe('parseAndValidateNarrationAsset — AI_VALIDATION_ERROR on invalid input', () => {
  it('throws AI_VALIDATION_ERROR for an empty object', () => {
    expect(() => parseAndValidateNarrationAsset({})).toThrow('AI_VALIDATION_ERROR')
  })

  it('throws AI_VALIDATION_ERROR for null', () => {
    expect(() => parseAndValidateNarrationAsset(null)).toThrow('AI_VALIDATION_ERROR')
  })

  it('throws AI_VALIDATION_ERROR for missing audio_b64 key', () => {
    const obj = { ...MINIMAL_NARRATION_ASSET_OPENAI }
    delete obj.audio_b64
    expect(() => parseAndValidateNarrationAsset(obj)).toThrow('AI_VALIDATION_ERROR')
  })

  it('returns the asset unmodified on success', () => {
    const result = parseAndValidateNarrationAsset(MINIMAL_NARRATION_ASSET_OPENAI)
    expect(result).toBe(MINIMAL_NARRATION_ASSET_OPENAI)
  })
})

// ---------------------------------------------------------------------------
// 7. image_count / images.length consistency
// ---------------------------------------------------------------------------

describe('image_count / images.length consistency', () => {
  it('rejects asset where image_count does not match images.length', () => {
    const obj = { ...MINIMAL_IMAGE_ASSET_OPENAI, image_count: 2 }
    const { ok, errors } = validateImageGenerationAsset(obj)
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('image_count'))).toBe(true)
  })

  it('accepts asset where image_count exactly matches images.length', () => {
    const { ok } = validateImageGenerationAsset(MINIMAL_IMAGE_ASSET_OPENAI)
    expect(ok).toBe(true)
  })

  it('accepts an asset with 4 images when image_count=4', () => {
    const images = Array.from({ length: 4 }, (_, i) => ({
      ...MINIMAL_IMAGE_ASSET_OPENAI.images[0],
      index: i,
    }))
    const obj = { ...MINIMAL_IMAGE_ASSET_OPENAI, images, image_count: 4 }
    const { ok } = validateImageGenerationAsset(obj)
    expect(ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 8. audio_b64=null support (TTS partial-failure contract)
// ---------------------------------------------------------------------------

describe('audio_b64=null support — TTS partial-failure contract', () => {
  it('accepts audio_b64=null with a warning message', () => {
    const obj = {
      ...MINIMAL_NARRATION_ASSET_OPENAI,
      audio_b64: null,
      warning: 'TTS generation failed: upstream API unavailable. Continuing without audio.',
    }
    const { ok } = validateNarrationAsset(obj)
    expect(ok).toBe(true)
  })

  it('rejects an asset where audio_b64 key is entirely absent', () => {
    const obj = { ...MINIMAL_NARRATION_ASSET_OPENAI }
    delete obj.audio_b64
    const { ok, errors } = validateNarrationAsset(obj)
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('audio_b64'))).toBe(true)
  })

  it('accepts a Google narration asset with audio_b64=null and a warning', () => {
    const obj = {
      ...MINIMAL_NARRATION_ASSET_GOOGLE,
      audio_b64: null,
      warning: 'Google Cloud TTS quota exceeded.',
    }
    const { ok } = validateNarrationAsset(obj)
    expect(ok).toBe(true)
  })

  it('warning must be present as explicit null when no warning', () => {
    const obj = { ...MINIMAL_NARRATION_ASSET_OPENAI }
    delete obj.warning
    const { ok, errors } = validateNarrationAsset(obj)
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('warning'))).toBe(true)
  })
})
