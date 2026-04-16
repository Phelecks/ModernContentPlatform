/**
 * openaiConfig.js
 *
 * Provider-agnostic AI configuration for Modern Content Platform.
 *
 * Reads environment variables and resolves per-task model overrides, falling
 * back to per-task defaults when a task-specific override is not set.
 *
 * Required variable:
 *   OPENAI_API_KEY (when AI_PROVIDER=openai)
 *   GOOGLE_API_KEY (when AI_PROVIDER=google)
 *
 * Optional variables (defaults shown):
 *   AI_PROVIDER                          — AI provider slug (default: 'openai')
 *   OPENAI_MODEL_* and GOOGLE_MODEL_*    — per-task model overrides
 *
 * Usage:
 *   import { parseAIProviderConfig } from '@/utils/openaiConfig.js'
 *   const config = parseAIProviderConfig(import.meta.env)   // throws on invalid config
 *
 * The function accepts any plain object with the relevant keys so that it can
 * be called with process.env, import.meta.env, Vite env, or test fixtures
 * without modification.
 *
 * All functions are side-effect-free and do not depend on any runtime globals.
 *
 * See docs/architecture/ai-provider.md for the full AI provider guide.
 * See docs/architecture/openai-cost-controls.md for cost controls and guardrails.
 * See app/src/utils/validateAiOutput.js for per-task output validation.
 */

// ---------------------------------------------------------------------------
// Supported providers
// ---------------------------------------------------------------------------

/** First-class AI providers in v1. */
export const PROVIDER_OPENAI = 'openai'
export const PROVIDER_GOOGLE = 'google'

/** All valid AI_PROVIDER values. */
export const VALID_PROVIDERS = [PROVIDER_OPENAI, PROVIDER_GOOGLE]

// ---------------------------------------------------------------------------
// Default model values
// ---------------------------------------------------------------------------

/**
 * Default models per task.
 * Used when the matching OPENAI_MODEL_* override is absent or empty.
 *
 * Fast tier  (gpt-4o-mini) — high-volume or short-output tasks; cost-sensitive.
 * Standard tier (gpt-4o)   — editorial and analytical tasks; quality matters.
 */
export const OPENAI_MODEL_DEFAULTS = {
  /** High-volume intraday classification. Short prompts, cost-sensitive. */
  alertClassification: 'gpt-4o-mini',
  /** Per-alert timeline entry formatting. Short structured output, runs per alert. */
  timelineFormatting: 'gpt-4o-mini',
  /** Editorial quality daily summary generation. Longer output, quality matters. */
  dailySummary: 'gpt-4o',
  /** Long-form Markdown article generation. Needs strong reasoning. */
  articleGeneration: 'gpt-4o',
  /** Analytical expectation check. Compares predictions to outcomes. */
  expectationCheck: 'gpt-4o',
  /** Forward-looking editorial tomorrow outlook. */
  tomorrowOutlook: 'gpt-4o',
  /** Spoken-word video script generation. Longer output, quality matters. */
  videoScript: 'gpt-4o',
  /** Short structured YouTube metadata generation. Cost-sensitive. */
  youtubeMetadata: 'gpt-4o-mini',
  /** Image generation task (not yet wired in workflows). */
  imageGeneration: 'gpt-image-1',
  /** Text-to-speech task (not yet wired in workflows). */
  tts: 'gpt-4o-mini-tts',
}

/**
 * Default Google models per task.
 * Fast tier  (gemini-2.5-flash) — high-volume or short-output tasks.
 * Standard tier (gemini-2.5-pro) — longer editorial tasks.
 * Image generation uses Imagen 3 via the Gemini REST API.
 */
export const GOOGLE_MODEL_DEFAULTS = {
  alertClassification: 'gemini-2.5-flash',
  timelineFormatting: 'gemini-2.5-flash',
  dailySummary: 'gemini-2.5-pro',
  articleGeneration: 'gemini-2.5-pro',
  expectationCheck: 'gemini-2.5-pro',
  tomorrowOutlook: 'gemini-2.5-pro',
  videoScript: 'gemini-2.5-pro',
  youtubeMetadata: 'gemini-2.5-flash',
  /** Imagen 3 via the Gemini REST API for daily media asset generation. */
  imageGeneration: 'imagen-3.0-generate-001',
  /** Reserved for future Google TTS wiring. */
  tts: 'gemini-2.5-flash',
}

/** Provider capability flags used for explicit task fallback behavior. */
export const PROVIDER_CAPABILITIES = {
  [PROVIDER_OPENAI]: {
    nativeJsonObjectMode: true,
    imageGeneration: true,
    tts: true,
  },
  [PROVIDER_GOOGLE]: {
    nativeJsonObjectMode: false,
    imageGeneration: true,
    tts: false,
  },
}

// ---------------------------------------------------------------------------
// Structured output configuration
// ---------------------------------------------------------------------------

/**
 * Per-task structured output configuration.
 *
 * `responseFormat: 'json_object'` instructs the OpenAI API to return a
 * guaranteed-valid JSON object (no markdown, no surrounding text).  It maps
 * to `response_format: { type: "json_object" }` in the OpenAI Chat
 * Completions API and to the `responseFormat` option in the n8n OpenAI node.
 *
 * Article generation is intentionally excluded because it returns Markdown,
 * not JSON, and is validated with Markdown-specific rules instead.
 *
 * All other AI tasks produce JSON and must enable JSON mode.
 */
export const OPENAI_STRUCTURED_OUTPUT_TASKS = {
  /** Intraday alert classification — must return JSON matching alert_classification schema. */
  alertClassification: { responseFormat: 'json_object' },
  /** Timeline entry formatting — must return JSON matching timeline_entry schema. */
  timelineFormatting: { responseFormat: 'json_object' },
  /** Daily summary generation — must return JSON matching daily_summary schema. */
  dailySummary: { responseFormat: 'json_object' },
  /** Expectation check — must return JSON matching expectation_check schema. */
  expectationCheck: { responseFormat: 'json_object' },
  /** Tomorrow outlook — must return JSON matching tomorrow_outlook schema. */
  tomorrowOutlook: { responseFormat: 'json_object' },
  /** Video script generation — must return JSON matching video_script schema. */
  videoScript: { responseFormat: 'json_object' },
  /** YouTube metadata generation — must return JSON matching youtube_metadata schema. */
  youtubeMetadata: { responseFormat: 'json_object' },
}

/**
 * Google structured output handling for JSON-output tasks.
 * Uses prompt-enforced JSON + deterministic validator fallback in v1.
 */
export const GOOGLE_STRUCTURED_OUTPUT_TASKS = {
  alertClassification: { responseFormat: 'prompt_and_validate' },
  timelineFormatting: { responseFormat: 'prompt_and_validate' },
  dailySummary: { responseFormat: 'prompt_and_validate' },
  expectationCheck: { responseFormat: 'prompt_and_validate' },
  tomorrowOutlook: { responseFormat: 'prompt_and_validate' },
  videoScript: { responseFormat: 'prompt_and_validate' },
  youtubeMetadata: { responseFormat: 'prompt_and_validate' },
}

function getStructuredTaskResponseFormat(provider, task) {
  const source = provider === PROVIDER_GOOGLE
    ? GOOGLE_STRUCTURED_OUTPUT_TASKS
    : OPENAI_STRUCTURED_OUTPUT_TASKS
  return source[task]?.responseFormat
}

/**
 * Internal task contracts and per-provider support/fallback handling.
 */
export const AI_TASK_CONTRACTS = {
  alertClassification: {
    output: 'json',
    providers: {
      [PROVIDER_OPENAI]: {
        supported: true,
        responseFormat: getStructuredTaskResponseFormat(PROVIDER_OPENAI, 'alertClassification'),
      },
      [PROVIDER_GOOGLE]: {
        supported: true,
        responseFormat: getStructuredTaskResponseFormat(PROVIDER_GOOGLE, 'alertClassification'),
      },
    },
  },
  timelineFormatting: {
    output: 'json',
    providers: {
      [PROVIDER_OPENAI]: {
        supported: true,
        responseFormat: getStructuredTaskResponseFormat(PROVIDER_OPENAI, 'timelineFormatting'),
      },
      [PROVIDER_GOOGLE]: {
        supported: true,
        responseFormat: getStructuredTaskResponseFormat(PROVIDER_GOOGLE, 'timelineFormatting'),
      },
    },
  },
  dailySummary: {
    output: 'json',
    providers: {
      [PROVIDER_OPENAI]: {
        supported: true,
        responseFormat: getStructuredTaskResponseFormat(PROVIDER_OPENAI, 'dailySummary'),
      },
      [PROVIDER_GOOGLE]: {
        supported: true,
        responseFormat: getStructuredTaskResponseFormat(PROVIDER_GOOGLE, 'dailySummary'),
      },
    },
  },
  articleGeneration: {
    output: 'markdown',
    providers: {
      [PROVIDER_OPENAI]: { supported: true },
      [PROVIDER_GOOGLE]: { supported: true },
    },
  },
  expectationCheck: {
    output: 'json',
    providers: {
      [PROVIDER_OPENAI]: {
        supported: true,
        responseFormat: getStructuredTaskResponseFormat(PROVIDER_OPENAI, 'expectationCheck'),
      },
      [PROVIDER_GOOGLE]: {
        supported: true,
        responseFormat: getStructuredTaskResponseFormat(PROVIDER_GOOGLE, 'expectationCheck'),
      },
    },
  },
  tomorrowOutlook: {
    output: 'json',
    providers: {
      [PROVIDER_OPENAI]: {
        supported: true,
        responseFormat: getStructuredTaskResponseFormat(PROVIDER_OPENAI, 'tomorrowOutlook'),
      },
      [PROVIDER_GOOGLE]: {
        supported: true,
        responseFormat: getStructuredTaskResponseFormat(PROVIDER_GOOGLE, 'tomorrowOutlook'),
      },
    },
  },
  videoScript: {
    output: 'json',
    providers: {
      [PROVIDER_OPENAI]: {
        supported: true,
        responseFormat: getStructuredTaskResponseFormat(PROVIDER_OPENAI, 'videoScript'),
      },
      [PROVIDER_GOOGLE]: {
        supported: true,
        responseFormat: getStructuredTaskResponseFormat(PROVIDER_GOOGLE, 'videoScript'),
      },
    },
  },
  youtubeMetadata: {
    output: 'json',
    providers: {
      [PROVIDER_OPENAI]: {
        supported: true,
        responseFormat: getStructuredTaskResponseFormat(PROVIDER_OPENAI, 'youtubeMetadata'),
      },
      [PROVIDER_GOOGLE]: {
        supported: true,
        responseFormat: getStructuredTaskResponseFormat(PROVIDER_GOOGLE, 'youtubeMetadata'),
      },
    },
  },
  imageGeneration: {
    output: 'binary',
    providers: {
      [PROVIDER_OPENAI]: { supported: true },
      [PROVIDER_GOOGLE]: {
        supported: true,
        note: 'uses Imagen 3 via the Gemini REST API (imagen-3.0-generate-001)',
      },
    },
  },
  tts: {
    output: 'binary',
    providers: {
      [PROVIDER_OPENAI]: { supported: true },
      [PROVIDER_GOOGLE]: {
        supported: false,
        fallbackProvider: PROVIDER_OPENAI,
        reason: 'google tts is not wired in v1',
      },
    },
  },
}

/** Flattened per-task support matrix for docs/tests and orchestration logic. */
export const TASK_SUPPORT_MATRIX = Object.fromEntries(
  Object.entries(AI_TASK_CONTRACTS).map(([task, cfg]) => ([task, cfg.providers]))
)

/**
 * Resolve the effective provider for a task and return explicit fallback info.
 *
 * @param {string} task
 * @param {string} requestedProvider
 * @returns {{
 *   task: string,
 *   requestedProvider: string,
 *   provider: string,
 *   usedFallback: boolean,
 *   support: Object
 * }}
 */
export function resolveTaskProvider(task, requestedProvider = PROVIDER_OPENAI) {
  if (!VALID_PROVIDERS.includes(requestedProvider)) {
    throw new Error(
      `AI_PROVIDER_ERROR: Unsupported provider "${requestedProvider}". ` +
      `Supported values: ${VALID_PROVIDERS.join(', ')}.`
    )
  }

  const taskConfig = AI_TASK_CONTRACTS[task]
  if (!taskConfig) {
    throw new Error(`AI_PROVIDER_ERROR: Unknown AI task "${task}".`)
  }

  const support = taskConfig.providers?.[requestedProvider]
  if (support?.supported) {
    if (taskConfig.output === 'json' && !support.responseFormat) {
      throw new Error(
        `AI_PROVIDER_CONFIG_ERROR: Missing structured output mapping for task "${task}" on provider "${requestedProvider}".`
      )
    }
    return {
      task,
      requestedProvider,
      provider: requestedProvider,
      usedFallback: false,
      support,
    }
  }

  const fallbackProvider = support?.fallbackProvider
  if (fallbackProvider && VALID_PROVIDERS.includes(fallbackProvider)) {
    const fallbackSupport = taskConfig.providers?.[fallbackProvider]
    if (fallbackSupport?.supported) {
      return {
        task,
        requestedProvider,
        provider: fallbackProvider,
        usedFallback: true,
        support: fallbackSupport,
      }
    }
  }

  throw new Error(
    `AI_PROVIDER_ERROR: Task "${task}" is not supported for provider "${requestedProvider}" and has no valid fallback.`
  )
}

// ---------------------------------------------------------------------------
// Cost controls and usage guardrails
// ---------------------------------------------------------------------------

/**
 * Per-task cost controls and usage guardrails.
 *
 * These are the canonical v1 defaults for all OpenAI cost controls across
 * the platform.  The same values are mirrored in config/openai-cost-controls.json
 * for n8n workflow consumption.
 *
 * maxTokens
 *   Hard cap on the number of completion tokens the OpenAI API may return per
 *   call.  Maps to the `max_tokens` / `maxTokens` parameter in the API.
 *   Setting this prevents runaway output that inflates cost unexpectedly.
 *
 * preFilter
 *   Controls applied *before* items are sent to AI, reducing the number of
 *   API calls made.  Applied inside the intraday pre-filter Code node.
 *   - maxItemsPerBatch: maximum number of items that may be sent to AI in
 *     one workflow execution.  Excess items are dropped before the AI call.
 *   - minContentLength: items whose combined headline + body character count
 *     is shorter than this threshold are dropped (nothing meaningful to classify).
 *
 * maxRetries
 *   Maximum retry attempts on transient AI failures before the workflow
 *   gives up and fires the failure notifier.  Maps to `maxTries` in n8n
 *   OpenAI nodes.
 *
 * outputLimits
 *   Maximum character lengths enforced by the validation Code nodes after
 *   each AI call.  These bounds are already applied by the workflows; this
 *   object documents them as a single canonical reference so that new tasks
 *   can be added consistently.
 */
export const OPENAI_COST_CONTROLS = {
  /**
   * Maximum completion tokens per AI call, by task.
   * Keeping these tight reduces cost without sacrificing quality when the
   * prompt schema defines bounded output lengths.
   */
  maxTokens: {
    /** High-volume intraday classification.  Short structured JSON output. */
    alertClassification: 400,
    /** Per-alert timeline entry formatting.  Short structured JSON output. */
    timelineFormatting: 300,
    /** Daily summary JSON.  Medium-length structured output. */
    dailySummary: 1000,
    /** Long-form Markdown article.  Longest editorial output. */
    articleGeneration: 1500,
    /** Expectation check JSON.  Moderate structured output. */
    expectationCheck: 700,
    /** Tomorrow outlook JSON.  Moderate structured output. */
    tomorrowOutlook: 700,
    /** Video script JSON with multiple segments.  Longest structured output. */
    videoScript: 1500,
    /** YouTube metadata JSON.  Short structured output. */
    youtubeMetadata: 800,
  },

  /**
   * Pre-filter settings applied before items reach the AI classification step.
   * Reduces unnecessary API calls by dropping items that carry no useful
   * signal and by capping the batch size per workflow execution.
   */
  preFilter: {
    /**
     * Maximum items sent to AI per intraday batch execution.
     * Items beyond this cap are dropped before the Classify node.
     * Overridable via the n8n variable AI_MAX_ITEMS_PER_BATCH.
     */
    maxItemsPerBatch: 30,
    /**
     * Combined minimum character length for an item's headline + body.
     * Items whose headline and body together have fewer than this many
     * characters are dropped — they carry too little text to classify.
     */
    minContentLength: 10,
  },

  /**
   * Maximum retry attempts per AI node before the workflow fails.
   * Retries cover transient rate-limit (429) and network errors.
   * Set to 2 (not 3) so that three total attempts (1 + 2 retries) are made,
   * matching the current n8n maxTries: 3 setting in all AI nodes.
   */
  maxRetries: 2,

  /**
   * Maximum output string lengths enforced by validation Code nodes after
   * each AI call.  These match the slice() calls already in the workflows and
   * serve as the canonical reference for any future tasks.
   */
  outputLimits: {
    headline: 250,
    summaryText: 500,
    alertReason: 200,
    clusterLabel: 100,
    sourceConfidenceNote: 300,
    overviewText: 1000,
    marketContext: 500,
    articleMarkdown: 8000,
    outlookSummary: 600,
    videoIntro: 500,
    videoOutro: 400,
    videoSegmentScript: 1500,
    youtubeTitle: 100,
    youtubeDescription: 5000,
  },
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

function buildModels(env, provider) {
  const defaults = provider === PROVIDER_GOOGLE ? GOOGLE_MODEL_DEFAULTS : OPENAI_MODEL_DEFAULTS
  const prefix = provider === PROVIDER_GOOGLE ? 'GOOGLE_MODEL_' : 'OPENAI_MODEL_'
  return {
    alertClassification: resolveModel(
      env[`${prefix}ALERT_CLASSIFICATION`],
      defaults.alertClassification
    ),
    timelineFormatting: resolveModel(
      env[`${prefix}TIMELINE_FORMATTING`],
      defaults.timelineFormatting
    ),
    dailySummary: resolveModel(
      env[`${prefix}DAILY_SUMMARY`],
      defaults.dailySummary
    ),
    articleGeneration: resolveModel(
      env[`${prefix}ARTICLE_GENERATION`],
      defaults.articleGeneration
    ),
    expectationCheck: resolveModel(
      env[`${prefix}EXPECTATION_CHECK`],
      defaults.expectationCheck
    ),
    tomorrowOutlook: resolveModel(
      env[`${prefix}TOMORROW_OUTLOOK`],
      defaults.tomorrowOutlook
    ),
    videoScript: resolveModel(
      env[`${prefix}VIDEO_SCRIPT`],
      defaults.videoScript
    ),
    youtubeMetadata: resolveModel(
      env[`${prefix}YOUTUBE_METADATA`],
      defaults.youtubeMetadata
    ),
    imageGeneration: resolveModel(
      env[`${prefix}IMAGE_GENERATION`],
      defaults.imageGeneration
    ),
    tts: resolveModel(
      env[`${prefix}TTS`],
      defaults.tts
    ),
  }
}

/**
 * Parses and validates provider-agnostic AI configuration.
 *
 * @param {Object} env
 * @returns {{apiKey: string, provider: string, models: Object}}
 */
export function parseAIProviderConfig(env = {}) {
  const provider = (typeof env.AI_PROVIDER === 'string' && env.AI_PROVIDER.trim() !== '')
    ? env.AI_PROVIDER.trim()
    : PROVIDER_OPENAI

  const errors = []

  if (!VALID_PROVIDERS.includes(provider)) {
    throw new Error(
      `AI_PROVIDER_CONFIG_ERROR: Invalid AI provider configuration. AI_PROVIDER "${provider}" is not supported. Supported values: ${VALID_PROVIDERS.join(', ')}.`
    )
  }

  const apiKeyVarName = provider === PROVIDER_GOOGLE ? 'GOOGLE_API_KEY' : 'OPENAI_API_KEY'
  const apiKey = typeof env[apiKeyVarName] === 'string' ? env[apiKeyVarName].trim() : ''

  if (!apiKey) {
    errors.push(`${apiKeyVarName} is required but is missing or empty.`)
  }

  if (errors.length > 0) {
    throw new Error(
      'AI_PROVIDER_CONFIG_ERROR: Invalid AI provider configuration.\n' +
      errors.join('\n')
    )
  }

  return {
    apiKey,
    provider,
    models: buildModels(env, provider),
  }
}

/**
 * Resolves effective provider credentials and model for a specific AI task.
 *
 * This helper combines:
 * 1) provider + API key config parsing (`parseAIProviderConfig`)
 * 2) task support/fallback resolution (`resolveTaskProvider`)
 *
 * It prevents callers from accidentally using models from the originally
 * requested provider when the task contract falls back to another provider.
 *
 * @param {Object} env
 * @param {string} task
 * @returns {{
 *   task: string,
 *   requestedProvider: string,
 *   provider: string,
 *   usedFallback: boolean,
 *   apiKey: string,
 *   model: string,
 *   support: Object
 * }}
 */
export function resolveTaskAIConfig(env = {}, task) {
  const requestedConfig = parseAIProviderConfig(env)
  const resolved = resolveTaskProvider(task, requestedConfig.provider)

  const effectiveConfig = resolved.usedFallback
    ? parseAIProviderConfig({ ...env, AI_PROVIDER: resolved.provider })
    : requestedConfig

  const model = effectiveConfig.models?.[task]
  if (!model) {
    throw new Error(
      `AI_PROVIDER_CONFIG_ERROR: Missing model mapping for task "${task}" on provider "${resolved.provider}".`
    )
  }

  return {
    ...resolved,
    apiKey: effectiveConfig.apiKey,
    model,
  }
}

/** Backward-compatible alias retained for existing imports. */
export function parseOpenAIConfig(env = {}) {
  return parseAIProviderConfig(env)
}
