/**
 * openaiConfig.js
 *
 * OpenAI configuration parsing and validation for Modern Content Platform.
 *
 * Reads environment variables and resolves per-task model overrides, falling
 * back to per-task defaults when a task-specific override is not set.
 *
 * Required variable:
 *   OPENAI_API_KEY — OpenAI API key.  Missing or empty value triggers a
 *                    OPENAI_CONFIG_ERROR at validation time.
 *
 * Optional variables (defaults shown):
 *   AI_PROVIDER                        — AI provider slug (default: 'openai')
 *   OPENAI_MODEL_ALERT_CLASSIFICATION  — model for alert classification (default: 'gpt-4o-mini')
 *   OPENAI_MODEL_DAILY_SUMMARY         — model for daily summary generation (default: 'gpt-4o')
 *   OPENAI_MODEL_VIDEO_SCRIPT          — model for video script generation (default: 'gpt-4o')
 *   OPENAI_MODEL_YOUTUBE_METADATA      — model for YouTube metadata generation (default: 'gpt-4o-mini')
 *
 * Usage:
 *   import { parseOpenAIConfig } from '@/utils/openaiConfig.js'
 *   const config = parseOpenAIConfig(import.meta.env)   // throws on invalid config
 *
 * The function accepts any plain object with the relevant keys so that it can
 * be called with process.env, import.meta.env, Vite env, or test fixtures
 * without modification.
 *
 * All functions are side-effect-free and do not depend on any runtime globals.
 *
 * See docs/architecture/ai-provider.md for the full AI provider guide.
 */

// ---------------------------------------------------------------------------
// Supported providers
// ---------------------------------------------------------------------------

/** The only AI provider supported in v1. */
export const PROVIDER_OPENAI = 'openai'

/** All valid AI_PROVIDER values. */
export const VALID_PROVIDERS = [PROVIDER_OPENAI]

// ---------------------------------------------------------------------------
// Default model values
// ---------------------------------------------------------------------------

/**
 * Default models per task.
 * Used when the matching OPENAI_MODEL_* override is absent or empty.
 */
export const OPENAI_MODEL_DEFAULTS = {
  /** High-volume, cost-sensitive classification task. */
  alertClassification: 'gpt-4o-mini',
  /** Editorial quality summary generation. */
  dailySummary: 'gpt-4o',
  /** Spoken-word video script generation. */
  videoScript: 'gpt-4o',
  /** Short structured metadata generation. */
  youtubeMetadata: 'gpt-4o-mini',
}

// ---------------------------------------------------------------------------
// Config parsing
// ---------------------------------------------------------------------------

/**
 * Resolves a model string from an env-var value, falling back to a default.
 *
 * @param {string|undefined} envValue
 * @param {string} defaultValue
 * @returns {string}
 */
function resolveModel(envValue, defaultValue) {
  return (typeof envValue === 'string' && envValue.trim() !== '')
    ? envValue.trim()
    : defaultValue
}

/**
 * Parses and validates the OpenAI configuration from an env-vars-like object.
 *
 * Resolves each per-task model override, falling back to the default for that
 * task tier when the override is absent or empty.
 *
 * @param {Object} env
 * @param {string}  [env.OPENAI_API_KEY]                     - Required OpenAI API key
 * @param {string}  [env.AI_PROVIDER]                        - AI provider slug (default: 'openai')
 * @param {string}  [env.OPENAI_MODEL_ALERT_CLASSIFICATION]  - Per-task model override
 * @param {string}  [env.OPENAI_MODEL_DAILY_SUMMARY]         - Per-task model override
 * @param {string}  [env.OPENAI_MODEL_VIDEO_SCRIPT]          - Per-task model override
 * @param {string}  [env.OPENAI_MODEL_YOUTUBE_METADATA]      - Per-task model override
 *
 * @returns {{
 *   apiKey: string,
 *   provider: string,
 *   models: {
 *     alertClassification: string,
 *     dailySummary: string,
 *     videoScript: string,
 *     youtubeMetadata: string
 *   }
 * }}
 *
 * @throws {Error} OPENAI_CONFIG_ERROR  when OPENAI_API_KEY is missing or empty
 * @throws {Error} OPENAI_CONFIG_ERROR  when AI_PROVIDER is set to an unsupported value
 */
export function parseOpenAIConfig(env = {}) {
  const apiKey = typeof env.OPENAI_API_KEY === 'string' ? env.OPENAI_API_KEY.trim() : ''
  const provider = (typeof env.AI_PROVIDER === 'string' && env.AI_PROVIDER.trim() !== '')
    ? env.AI_PROVIDER.trim()
    : PROVIDER_OPENAI

  const errors = []

  if (!apiKey) {
    errors.push('OPENAI_API_KEY is required but is missing or empty.')
  }

  if (!VALID_PROVIDERS.includes(provider)) {
    errors.push(
      `AI_PROVIDER "${provider}" is not supported. ` +
      `Supported values: ${VALID_PROVIDERS.join(', ')}.`
    )
  }

  if (errors.length > 0) {
    throw new Error(
      'OPENAI_CONFIG_ERROR: Invalid OpenAI configuration.\n' +
      errors.join('\n')
    )
  }

  return {
    apiKey,
    provider,
    models: {
      alertClassification: resolveModel(
        env.OPENAI_MODEL_ALERT_CLASSIFICATION,
        OPENAI_MODEL_DEFAULTS.alertClassification
      ),
      dailySummary: resolveModel(
        env.OPENAI_MODEL_DAILY_SUMMARY,
        OPENAI_MODEL_DEFAULTS.dailySummary
      ),
      videoScript: resolveModel(
        env.OPENAI_MODEL_VIDEO_SCRIPT,
        OPENAI_MODEL_DEFAULTS.videoScript
      ),
      youtubeMetadata: resolveModel(
        env.OPENAI_MODEL_YOUTUBE_METADATA,
        OPENAI_MODEL_DEFAULTS.youtubeMetadata
      ),
    },
  }
}
