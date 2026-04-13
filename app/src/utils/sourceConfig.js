/**
 * sourceConfig.js
 *
 * Config parsing and validation for source-provider toggle flags.
 *
 * Two provider toggles control which providers are active at runtime:
 *
 *   ENABLE_X=true|false        — Enable/disable the X (Twitter) provider.
 *                                Requires X_BEARER_TOKEN when true.
 *   ENABLE_NEWSAPI=true|false   — Enable/disable the NewsAPI provider.
 *                                Requires NEWS_API_KEY when true.
 *
 * Supported modes:
 *   hybrid       — ENABLE_X=true,  ENABLE_NEWSAPI=true   (both providers active)
 *   x_only       — ENABLE_X=true,  ENABLE_NEWSAPI=false  (X sources only)
 *   newsapi_only — ENABLE_X=false, ENABLE_NEWSAPI=true   (NewsAPI sources only)
 *   (error)      — ENABLE_X=false, ENABLE_NEWSAPI=false  → throws PROVIDER_CONFIG_ERROR
 *
 * Required API keys per enabled provider:
 *   X provider      → X_BEARER_TOKEN must be a non-empty string
 *   NewsAPI provider → NEWS_API_KEY   must be a non-empty string
 *
 * Usage:
 *   import { parseProviderConfig } from '@/utils/sourceConfig.js'
 *   const { mode, enableX, enableNewsapi } = parseProviderConfig(import.meta.env)
 *
 * The function accepts any plain object with the relevant keys so that it can
 * be called with process.env, import.meta.env, Vite env, or test fixtures
 * without modification.
 *
 * The logic here is mirrored in the n8n 'Build Source List' node inside
 * workflows/n8n/intraday/01_source_ingestion.json so that the two stay in sync.
 * All functions are side-effect-free and do not depend on any runtime globals.
 *
 * See docs/source-provider-modes.md for the authoritative configuration guide.
 */

// ---------------------------------------------------------------------------
// Provider mode constants
// ---------------------------------------------------------------------------

/** Provider mode when both X and NewsAPI are enabled. */
export const MODE_HYBRID = 'hybrid'

/** Provider mode when only X is enabled. */
export const MODE_X_ONLY = 'x_only'

/** Provider mode when only NewsAPI is enabled. */
export const MODE_NEWSAPI_ONLY = 'newsapi_only'

// ---------------------------------------------------------------------------
// Flag parsing
// ---------------------------------------------------------------------------

/**
 * Parses a provider toggle flag value into a boolean.
 *
 * Accepts:
 *   - boolean true/false (pass-through)
 *   - string  'true'  (case-insensitive) → true
 *   - string  'false' / any other string → false
 *   - null / undefined                   → false
 *
 * @param {string|boolean|null|undefined} value
 * @returns {boolean}
 */
export function parseProviderFlag(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return value.trim().toLowerCase() === 'true'
  return false
}

// ---------------------------------------------------------------------------
// Config parsing and validation  (main entry point)
// ---------------------------------------------------------------------------

/**
 * Parses and validates the source-provider configuration from an env-vars-like
 * object.
 *
 * Reads ENABLE_X and ENABLE_NEWSAPI toggle flags, validates that the
 * required API key is present for each enabled provider, rejects combinations
 * where no provider is enabled, and returns the resolved mode.
 *
 * @param {Object} env
 * @param {string|boolean} [env.ENABLE_X]       - Enable X provider ('true'/'false'/boolean)
 * @param {string|boolean} [env.ENABLE_NEWSAPI]  - Enable NewsAPI provider ('true'/'false'/boolean)
 * @param {string}         [env.X_BEARER_TOKEN]  - Required when ENABLE_X=true
 * @param {string}         [env.NEWS_API_KEY]    - Required when ENABLE_NEWSAPI=true
 *
 * @returns {{ mode: 'hybrid'|'x_only'|'newsapi_only', enableX: boolean, enableNewsapi: boolean }}
 *
 * @throws {Error} PROVIDER_CONFIG_ERROR  when no provider is enabled
 * @throws {Error} PROVIDER_CONFIG_ERROR  when a required API key is missing
 */
export function parseProviderConfig(env = {}) {
  const enableX = parseProviderFlag(env.ENABLE_X)
  const enableNewsapi = parseProviderFlag(env.ENABLE_NEWSAPI)

  // Reject combinations where neither provider is enabled first, before
  // checking API keys, so the operator gets the most actionable error.
  if (!enableX && !enableNewsapi) {
    throw new Error(
      'PROVIDER_CONFIG_ERROR: No source providers are enabled. ' +
      'Set ENABLE_X=true and/or ENABLE_NEWSAPI=true. ' +
      'At least one provider must be enabled to run the intraday pipeline.'
    )
  }

  // Validate required API keys for each enabled provider.
  // Whitespace-only values are treated the same as absent (effectively empty).
  const missing = []
  if (enableX && !(typeof env.X_BEARER_TOKEN === 'string' && env.X_BEARER_TOKEN.trim() !== '')) {
    missing.push('X_BEARER_TOKEN is required when ENABLE_X=true')
  }
  if (enableNewsapi && !(typeof env.NEWS_API_KEY === 'string' && env.NEWS_API_KEY.trim() !== '')) {
    missing.push('NEWS_API_KEY is required when ENABLE_NEWSAPI=true')
  }

  if (missing.length > 0) {
    throw new Error(
      'PROVIDER_CONFIG_ERROR: Missing required API keys.\n' +
      missing.join('\n')
    )
  }

  const mode = enableX && enableNewsapi
    ? MODE_HYBRID
    : enableX
      ? MODE_X_ONLY
      : MODE_NEWSAPI_ONLY

  return { mode, enableX, enableNewsapi }
}
