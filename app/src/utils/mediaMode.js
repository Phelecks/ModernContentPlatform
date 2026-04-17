/**
 * mediaMode.js
 *
 * Configurable media mode support for Modern Content Platform.
 *
 * Two media output modes are supported:
 *   image_video  — image-based video (default). Generates still images via an
 *                  image provider and TTS narration, then assembles them into a
 *                  video. Cheaper and more reliable; the v1 production strategy.
 *   full_video   — full AI-generated video. Not yet available from any
 *                  supported provider in v1. Reserved for future use.
 *
 * The active mode is selected via the MEDIA_MODE environment variable.
 * It defaults to 'image_video' when not set.
 *
 * Validation rules:
 *   - MEDIA_MODE must be a known mode ('image_video' or 'full_video').
 *   - The selected mode must be compatible with the active AI provider.
 *     If the provider lacks the required capabilities, parsing throws a
 *     clear MEDIA_MODE_CONFIG_ERROR.
 *
 * Usage:
 *   import { parseMediaModeConfig } from '@/utils/mediaMode.js'
 *   const config = parseMediaModeConfig(import.meta.env)   // throws on invalid config
 *
 * The function accepts any plain object with the relevant keys so that it can
 * be called with process.env, import.meta.env, Vite env, or test fixtures
 * without modification.
 *
 * All functions are side-effect-free and do not depend on any runtime globals.
 *
 * See config/media-mode.json for the n8n-readable canonical config mirror.
 */

// ---------------------------------------------------------------------------
// Media mode constants
// ---------------------------------------------------------------------------

/** Image-based video mode. Default v1 strategy. */
export const MODE_IMAGE_VIDEO = 'image_video'

/** Full AI-generated video mode. Reserved for future use. */
export const MODE_FULL_VIDEO = 'full_video'

/** All valid MEDIA_MODE values. */
export const VALID_MEDIA_MODES = [MODE_IMAGE_VIDEO, MODE_FULL_VIDEO]

// ---------------------------------------------------------------------------
// Mode definitions
// ---------------------------------------------------------------------------

/**
 * Per-mode definitions: which workflow steps run, which provider capabilities
 * are required, and whether the mode is available in v1.
 *
 * workflowSteps
 *   Ordered list of workflow module identifiers that must run for this mode.
 *   Used by the orchestrator's media mode branch to decide which sub-workflows
 *   to execute and which to skip.
 *
 * requiredCapabilities
 *   Provider capability flags that must be true for the active AI provider.
 *   Validated by parseMediaModeConfig at startup.
 *
 * available
 *   Whether this mode is ready for use. Modes with available: false still
 *   validate normally (clear error on incompatible provider) but are not
 *   expected to produce a successful run in v1.
 */
export const MEDIA_MODE_DEFINITIONS = {
  [MODE_IMAGE_VIDEO]: {
    description:
      'Image-based video. Generates still images via an image provider and TTS narration, ' +
      'then assembles them into a video. Default v1 strategy — cheaper and more reliable.',
    workflowSteps: ['06_video_script', '06b_generate_images', '06c_generate_narration'],
    requiredCapabilities: ['imageGeneration', 'tts'],
    available: true,
  },
  [MODE_FULL_VIDEO]: {
    description:
      'Full AI-generated video. Requires a provider with native video generation capability. ' +
      'Not yet supported by any v1 provider. Reserved for future use.',
    workflowSteps: ['06_video_script', '06_full_video_generation'],
    requiredCapabilities: ['fullVideoGeneration'],
    available: false,
  },
}

// ---------------------------------------------------------------------------
// Provider capability flags
// ---------------------------------------------------------------------------

/**
 * Media capability flags per AI provider.
 *
 * These are the capabilities relevant to media mode validation.
 * Both first-class v1 providers (openai, google) support image generation and
 * TTS, but neither supports full AI video generation yet.
 *
 * This map is intentionally separate from the base PROVIDER_CAPABILITIES in
 * openaiConfig.js so that media mode logic remains self-contained and easy
 * to extend when new video-generation providers become available.
 */
export const MEDIA_PROVIDER_CAPABILITIES = {
  openai: {
    imageGeneration: true,
    tts: true,
    fullVideoGeneration: false,
  },
  google: {
    imageGeneration: true,
    tts: true,
    fullVideoGeneration: false,
  },
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Checks whether a media mode is compatible with the given AI provider.
 *
 * @param {string} mode      A VALID_MEDIA_MODES value.
 * @param {string} provider  An AI provider slug (e.g. 'openai', 'google').
 * @returns {{ valid: boolean, missingCapabilities: string[] }}
 */
export function validateMediaModeForProvider(mode, provider) {
  const modeDef = MEDIA_MODE_DEFINITIONS[mode]
  if (!modeDef) {
    return { valid: false, missingCapabilities: [] }
  }

  const caps = MEDIA_PROVIDER_CAPABILITIES[provider] || {}
  const missing = modeDef.requiredCapabilities.filter(cap => !caps[cap])
  return { valid: missing.length === 0, missingCapabilities: missing }
}

// ---------------------------------------------------------------------------
// Config parsing  (main entry point)
// ---------------------------------------------------------------------------

/**
 * Parses and validates media mode configuration.
 *
 * Reads MEDIA_MODE from env (defaults to 'image_video').
 * Reads AI_PROVIDER from env (defaults to 'openai').
 * Validates the mode is a known value and compatible with the AI provider.
 *
 * @param {Object} env  Any plain object with the relevant keys.
 *   MEDIA_MODE  — media output mode (default: 'image_video')
 *   AI_PROVIDER — AI provider slug (default: 'openai')
 * @returns {{
 *   mode: string,
 *   provider: string,
 *   workflowSteps: string[],
 *   requiredCapabilities: string[],
 *   available: boolean
 * }}
 * @throws {Error} MEDIA_MODE_CONFIG_ERROR on invalid or incompatible config.
 */
export function parseMediaModeConfig(env = {}) {
  const mode = (typeof env.MEDIA_MODE === 'string' && env.MEDIA_MODE.trim() !== '')
    ? env.MEDIA_MODE.trim()
    : MODE_IMAGE_VIDEO

  const provider = (typeof env.AI_PROVIDER === 'string' && env.AI_PROVIDER.trim() !== '')
    ? env.AI_PROVIDER.trim()
    : 'openai'

  if (!VALID_MEDIA_MODES.includes(mode)) {
    throw new Error(
      `MEDIA_MODE_CONFIG_ERROR: Invalid MEDIA_MODE "${mode}". ` +
      `Supported values: ${VALID_MEDIA_MODES.join(', ')}.`
    )
  }

  const { valid, missingCapabilities } = validateMediaModeForProvider(mode, provider)

  if (!valid) {
    const modeDef = MEDIA_MODE_DEFINITIONS[mode]
    throw new Error(
      `MEDIA_MODE_CONFIG_ERROR: Media mode "${mode}" is not compatible with provider "${provider}". ` +
      `Required capabilities: ${modeDef.requiredCapabilities.join(', ')}. ` +
      `Missing: ${missingCapabilities.join(', ')}.`
    )
  }

  const modeDef = MEDIA_MODE_DEFINITIONS[mode]
  return {
    mode,
    provider,
    workflowSteps: modeDef.workflowSteps,
    requiredCapabilities: modeDef.requiredCapabilities,
    available: modeDef.available,
  }
}
