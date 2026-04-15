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
 *   AI_PROVIDER                          — AI provider slug (default: 'openai')
 *   OPENAI_MODEL_ALERT_CLASSIFICATION    — model for alert classification (default: 'gpt-4o-mini')
 *   OPENAI_MODEL_TIMELINE_FORMATTING     — model for timeline entry formatting (default: 'gpt-4o-mini')
 *   OPENAI_MODEL_DAILY_SUMMARY           — model for daily summary generation (default: 'gpt-4o')
 *   OPENAI_MODEL_ARTICLE_GENERATION      — model for article generation (default: 'gpt-4o')
 *   OPENAI_MODEL_EXPECTATION_CHECK       — model for expectation check (default: 'gpt-4o')
 *   OPENAI_MODEL_TOMORROW_OUTLOOK        — model for tomorrow outlook generation (default: 'gpt-4o')
 *   OPENAI_MODEL_VIDEO_SCRIPT            — model for video script generation (default: 'gpt-4o')
 *   OPENAI_MODEL_YOUTUBE_METADATA        — model for YouTube metadata generation (default: 'gpt-4o-mini')
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
 * See docs/architecture/openai-cost-controls.md for cost controls and guardrails.
 * See app/src/utils/validateAiOutput.js for per-task output validation.
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
 *   - minHeadlineOrBodyLength: items whose headline AND body are both shorter
 *     than this character count are dropped (nothing meaningful to classify).
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

/**
 * Parses and validates the OpenAI configuration from an env-vars-like object.
 *
 * Resolves each per-task model override, falling back to the default for that
 * task tier when the override is absent or empty.
 *
 * @param {Object} env
 * @param {string}  [env.OPENAI_API_KEY]                       - Required OpenAI API key
 * @param {string}  [env.AI_PROVIDER]                          - AI provider slug (default: 'openai')
 * @param {string}  [env.OPENAI_MODEL_ALERT_CLASSIFICATION]    - Per-task model override
 * @param {string}  [env.OPENAI_MODEL_TIMELINE_FORMATTING]     - Per-task model override
 * @param {string}  [env.OPENAI_MODEL_DAILY_SUMMARY]           - Per-task model override
 * @param {string}  [env.OPENAI_MODEL_ARTICLE_GENERATION]      - Per-task model override
 * @param {string}  [env.OPENAI_MODEL_EXPECTATION_CHECK]       - Per-task model override
 * @param {string}  [env.OPENAI_MODEL_TOMORROW_OUTLOOK]        - Per-task model override
 * @param {string}  [env.OPENAI_MODEL_VIDEO_SCRIPT]            - Per-task model override
 * @param {string}  [env.OPENAI_MODEL_YOUTUBE_METADATA]        - Per-task model override
 *
 * @returns {{
 *   apiKey: string,
 *   provider: string,
 *   models: {
 *     alertClassification: string,
 *     timelineFormatting: string,
 *     dailySummary: string,
 *     articleGeneration: string,
 *     expectationCheck: string,
 *     tomorrowOutlook: string,
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
      timelineFormatting: resolveModel(
        env.OPENAI_MODEL_TIMELINE_FORMATTING,
        OPENAI_MODEL_DEFAULTS.timelineFormatting
      ),
      dailySummary: resolveModel(
        env.OPENAI_MODEL_DAILY_SUMMARY,
        OPENAI_MODEL_DEFAULTS.dailySummary
      ),
      articleGeneration: resolveModel(
        env.OPENAI_MODEL_ARTICLE_GENERATION,
        OPENAI_MODEL_DEFAULTS.articleGeneration
      ),
      expectationCheck: resolveModel(
        env.OPENAI_MODEL_EXPECTATION_CHECK,
        OPENAI_MODEL_DEFAULTS.expectationCheck
      ),
      tomorrowOutlook: resolveModel(
        env.OPENAI_MODEL_TOMORROW_OUTLOOK,
        OPENAI_MODEL_DEFAULTS.tomorrowOutlook
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
