/**
 * sourceProviders.js
 *
 * Source-provider selection logic for the intraday ingestion pipeline.
 *
 * Two managed provider types are recognised:
 *   - X provider  — sources with type 'x_account' or 'x_query'
 *   - NewsAPI provider — sources with type 'newsapi'
 *
 * Non-provider source types (rss, api, webhook, social) are always included
 * regardless of provider state and do not count toward the provider-presence
 * check.
 *
 * Provider mode behaviours:
 *   hybrid      — both X and NewsAPI are configured; all sources are returned.
 *   x_only      — only X is configured; NewsAPI sources are excluded.
 *   newsapi_only — only NewsAPI is configured; X sources are excluded.
 *   (error)     — neither X nor NewsAPI is configured; an error is thrown.
 *
 * The logic here is mirrored in the n8n 'Build Source List' node inside
 * workflows/n8n/intraday/01_source_ingestion.json so that the two stay in sync.
 * All functions are side-effect-free and do not depend on any runtime globals.
 *
 * See docs/source-strategy.md and workflows/n8n/intraday/README.md for the
 * authoritative provider configuration guide.
 */

// ---------------------------------------------------------------------------
// Provider constants
// ---------------------------------------------------------------------------

/** Identifier for the X (Twitter) source provider. */
export const PROVIDER_X = 'x'

/** Identifier for the NewsAPI source provider. */
export const PROVIDER_NEWSAPI = 'newsapi'

/** Source types that belong to the X provider. */
export const X_PROVIDER_SOURCE_TYPES = ['x_account', 'x_query']

/** Source type that belongs to the NewsAPI provider. */
export const NEWSAPI_SOURCE_TYPE = 'newsapi'

// ---------------------------------------------------------------------------
// Provider classification
// ---------------------------------------------------------------------------

/**
 * Returns the provider identifier for a given source type, or null when the
 * source type is not managed by a specific provider.
 *
 * @param {string|null|undefined} sourceType
 * @returns {'x'|'newsapi'|null}
 */
export function classifySourceProvider(sourceType) {
  if (X_PROVIDER_SOURCE_TYPES.includes(sourceType)) return PROVIDER_X
  if (sourceType === NEWSAPI_SOURCE_TYPE) return PROVIDER_NEWSAPI
  return null
}

// ---------------------------------------------------------------------------
// Provider detection
// ---------------------------------------------------------------------------

/**
 * Inspects a source list and returns which providers have at least one source.
 *
 * @param {Array<{type: string}>} sources
 * @returns {{ x: boolean, newsapi: boolean }}
 */
export function detectProviders(sources) {
  if (!Array.isArray(sources)) return { x: false, newsapi: false }
  let x = false
  let newsapi = false
  for (const s of sources) {
    const p = classifySourceProvider(s && s.type)
    if (p === PROVIDER_X) x = true
    if (p === PROVIDER_NEWSAPI) newsapi = true
    if (x && newsapi) break
  }
  return { x, newsapi }
}

// ---------------------------------------------------------------------------
// Source filtering
// ---------------------------------------------------------------------------

/**
 * Filters a source list to only the sources belonging to the enabled providers.
 * Non-provider sources (rss, api, webhook, social) are always kept.
 *
 * @param {Array<{type: string}>} sources
 * @param {{ x: boolean, newsapi: boolean }} providers
 * @returns {Array<{type: string}>}
 */
export function selectSourcesByProviders(sources, providers) {
  if (!Array.isArray(sources)) return []
  return sources.filter(s => {
    const provider = classifySourceProvider(s && s.type)
    if (provider === PROVIDER_X) return providers.x === true
    if (provider === PROVIDER_NEWSAPI) return providers.newsapi === true
    return true
  })
}

// ---------------------------------------------------------------------------
// Provider mode resolution  (main entry point)
// ---------------------------------------------------------------------------

/**
 * Determines the active provider mode from a source list and returns the
 * sources that should be fetched for this run.
 *
 * Behaviour by state:
 *   - X sources present, no NewsAPI sources → mode: 'x_only'
 *   - NewsAPI sources present, no X sources → mode: 'newsapi_only'
 *   - Both present                          → mode: 'hybrid'
 *   - Neither present                       → throws a configuration error
 *
 * Non-provider sources (rss, api, webhook, social) are always returned
 * alongside whichever provider sources are active.  They do not count
 * toward the "neither configured" check.
 *
 * @param {Array<{type: string}>} sources  Full source list from config.
 * @returns {{ mode: 'x_only'|'newsapi_only'|'hybrid', activeSources: Array }}
 * @throws {Error} when neither X nor NewsAPI sources are present.
 */
export function resolveProviderMode(sources) {
  if (!Array.isArray(sources)) {
    throw new Error(
      'PROVIDER_CONFIG_ERROR: sources must be an array. ' +
      'Configure at least one source provider (X or NewsAPI).'
    )
  }

  const providers = detectProviders(sources)

  if (!providers.x && !providers.newsapi) {
    throw new Error(
      'PROVIDER_CONFIG_ERROR: No source providers are configured. ' +
      'Add at least one X source (type: x_account or x_query) or ' +
      'one NewsAPI source (type: newsapi) to INTRADAY_SOURCES_JSON.'
    )
  }

  const mode = providers.x && providers.newsapi
    ? 'hybrid'
    : providers.x
      ? 'x_only'
      : 'newsapi_only'

  const activeSources = selectSourcesByProviders(sources, providers)

  return { mode, activeSources }
}
