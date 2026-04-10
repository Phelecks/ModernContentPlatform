/**
 * sourceTrust.js
 *
 * Pure utility functions for source normalization, trust scoring, and
 * confirmation rule evaluation.  Logic extracted from:
 *   - workflows/n8n/intraday/02_normalization.json  (Normalize Item node)
 *   - workflows/n8n/intraday/06_alert_decision.json (Apply Thresholds node)
 *   - config/trust-rules.json
 *
 * All functions are side-effect-free and do not depend on the n8n runtime.
 * See docs/architecture/trust-scoring.md for the authoritative specification.
 */

// ---------------------------------------------------------------------------
// Base trust scores — mirrors config/trust-rules.json base_trust_scores
// ---------------------------------------------------------------------------

export const BASE_TRUST_SCORES = {
  T1: { label: 'Official',         score: 90, confidenceAdjustment:   0 },
  T2: { label: 'Wire / Newswire',  score: 75, confidenceAdjustment:   0 },
  T3: { label: 'Specialist news',  score: 50, confidenceAdjustment: -10 },
  T4: { label: 'Signal / Social',  score: 25, confidenceAdjustment: -20 },
  unknown: { label: 'Unknown',     score:  0, confidenceAdjustment: -25 }
}

// ---------------------------------------------------------------------------
// Source type → trust tier mapping
// Source types that are always T4 (signal/social); everything else can carry
// any tier depending on registry configuration.
// ---------------------------------------------------------------------------

export const X_SOURCE_TYPES = ['x_account', 'x_query']
export const SOCIAL_SOURCE_TYPES = ['social', 'x_account', 'x_query']

/**
 * Returns the default trust tier for a given source_type when no registry
 * override is present.
 *
 * @param {string|null} sourceType
 * @returns {'T1'|'T2'|'T3'|'T4'|null}
 */
export function getDefaultTrustTierForSourceType(sourceType) {
  if (!sourceType) return null
  if (X_SOURCE_TYPES.includes(sourceType)) return 'T4'
  if (sourceType === 'social') return 'T4'
  if (sourceType === 'api') return 'T1'
  if (sourceType === 'rss') return 'T3'
  if (sourceType === 'webhook') return 'T2'
  return null
}

// ---------------------------------------------------------------------------
// HTML stripping — extracted from 02_normalization.json Normalize Item node
// ---------------------------------------------------------------------------

/**
 * Strips HTML-like markup delimiters from a string and collapses whitespace.
 *
 * @param {string|null|undefined} str
 * @returns {string}
 */
export function stripHtml(str) {
  // Two-stage approach: remove complete HTML tags first, then strip any
  // remaining stray angle-bracket characters (defense-in-depth).
  return (str || '')
    .replace(/<[^>]*>/g, '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// ---------------------------------------------------------------------------
// Trust score coercion — extracted from 02_normalization.json Normalize Item node
// ---------------------------------------------------------------------------

/**
 * Coerces a raw trust_score value to an integer in [0, 100].
 * Returns null when the input is absent, empty, or non-finite.
 *
 * @param {*} value
 * @returns {number|null}
 */
export function coerceTrustScore(value) {
  if (value == null || value === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return Math.max(0, Math.min(100, Math.trunc(parsed)))
}

// ---------------------------------------------------------------------------
// Topic candidate detection — extracted from 02_normalization.json
// ---------------------------------------------------------------------------

const TOPIC_KEYWORDS = {
  crypto:     ['bitcoin', 'ethereum', 'crypto', 'blockchain', 'defi', 'nft', 'altcoin', 'btc', 'eth', 'solana', 'token', 'wallet', 'exchange'],
  finance:    ['stock', 'equity', 'bond', 'yield', 'interest rate', 'market', 'nasdaq', 'nyse', 's&p', 'dow', 'etf', 'dividend', 'earnings'],
  economy:    ['gdp', 'inflation', 'recession', 'trade', 'tariff', 'unemployment', 'central bank', 'federal reserve', 'ecb', 'imf', 'world bank'],
  health:     ['vaccine', 'clinical trial', 'fda', 'drug', 'cancer', 'pandemic', 'disease', 'hospital', 'biotech', 'pharma', 'health'],
  ai:         ['artificial intelligence', 'machine learning', 'llm', 'openai', 'gpt', 'neural network', 'deep learning', 'foundation model', 'chatbot', 'automation'],
  energy:     ['oil', 'gas', 'renewable', 'solar', 'wind', 'opec', 'battery', 'ev', 'electric vehicle', 'carbon', 'energy', 'power grid'],
  technology: ['apple', 'google', 'microsoft', 'meta', 'amazon', 'semiconductor', 'chip', 'software', 'cloud', 'cybersecurity', 'regulation', 'antitrust']
}

/**
 * Returns up to 3 topic slugs whose keywords appear in the given search text.
 *
 * @param {string} searchText  Lower-cased combined headline + body text.
 * @returns {string[]}
 */
export function detectTopicCandidates(searchText) {
  return Object.entries(TOPIC_KEYWORDS)
    .filter(([, kw]) => kw.some(k => searchText.includes(k)))
    .map(([topic]) => topic)
    .slice(0, 3)
}

// ---------------------------------------------------------------------------
// Normalized source item creation — extracted from 02_normalization.json
// (item_id hash computation omitted; caller must supply item_id)
// ---------------------------------------------------------------------------

/**
 * Builds a normalized source item from a raw intraday_source_item.
 * The item_id must be pre-computed by the caller (SHA-256 in n8n).
 *
 * @param {object} item   Raw source_item conforming to intraday_source_item contract.
 * @param {string} itemId Pre-computed deterministic item identifier.
 * @returns {object}      Normalized item conforming to intraday_normalized_item contract.
 */
export function createNormalizedItem(item, itemId) {
  const headline = stripHtml(item.title || '').slice(0, 250)
  const body = item.body ? stripHtml(item.body).slice(0, 2000) : null
  const author = item.author ? stripHtml(item.author).slice(0, 200) || null : null

  let published_at
  try {
    published_at = item.published_at ? new Date(item.published_at).toISOString() : item.fetched_at
  } catch {
    published_at = item.fetched_at
  }

  const searchText = `${headline} ${body || ''}`.toLowerCase()
  const topic_candidates = detectTopicCandidates(searchText)

  const trust_tier = item.trust_tier || null
  const trust_score = coerceTrustScore(item.trust_score)
  const source_slug = item.source_slug || null

  return {
    item_id:          itemId,
    source_id:        item.source_id,
    source_slug,
    source_name:      item.source_name,
    source_type:      item.source_type,
    source_url:       item.source_url || null,
    headline,
    body,
    author,
    topic_candidates,
    published_at,
    fetched_at:       item.fetched_at,
    trust_tier,
    trust_score,
    is_duplicate:     false
  }
}

// ---------------------------------------------------------------------------
// Topic policy normalization — extracted from 06_alert_decision.json
// ---------------------------------------------------------------------------

/**
 * Normalizes a raw topic T4 policy object into a canonical shape.
 * Accepts both camelCase and snake_case field names.
 *
 * @param {*} raw
 * @returns {{ t4Allowed: boolean, severityCap: number, canTrigger: boolean, confirmationRequired: boolean }}
 */
export function normalizeTopicPolicy(raw) {
  if (!raw || typeof raw !== 'object') {
    return { t4Allowed: false, severityCap: 0, canTrigger: false, confirmationRequired: false }
  }
  const toBoolean = (a, b) => typeof a === 'boolean' ? a : (typeof b === 'boolean' ? b : false)
  const toNumber  = (a, b) => (typeof a === 'number' && Number.isFinite(a)) ? a : ((typeof b === 'number' && Number.isFinite(b)) ? b : 0)
  return {
    t4Allowed:            toBoolean(raw.t4Allowed,            raw.t4_allowed),
    severityCap:          toNumber(raw.severityCap,            raw.severity_cap),
    canTrigger:           toBoolean(raw.canTrigger,            raw.can_trigger_alert),
    confirmationRequired: toBoolean(raw.confirmationRequired,  raw.confirmation_required)
  }
}

// ---------------------------------------------------------------------------
// Default per-topic T4 policies — mirrors 06_alert_decision.json defaults
// ---------------------------------------------------------------------------

export const DEFAULT_TOPIC_POLICIES = {
  crypto:     { t4Allowed: true,  severityCap: 60, canTrigger: true,  confirmationRequired: false },
  ai:         { t4Allowed: true,  severityCap: 50, canTrigger: true,  confirmationRequired: false },
  finance:    { t4Allowed: true,  severityCap: 30, canTrigger: false, confirmationRequired: true  },
  economy:    { t4Allowed: false, severityCap:  0, canTrigger: false, confirmationRequired: false },
  health:     { t4Allowed: false, severityCap:  0, canTrigger: false, confirmationRequired: false },
  energy:     { t4Allowed: true,  severityCap: 50, canTrigger: true,  confirmationRequired: true  },
  technology: { t4Allowed: true,  severityCap: 50, canTrigger: true,  confirmationRequired: false }
}

// Cap applied to items with unknown (null) trust tier.
export const UNKNOWN_SOURCE_SEVERITY_CAP = 30

// ---------------------------------------------------------------------------
// Alert decision — extracted from 06_alert_decision.json Apply Thresholds node
// ---------------------------------------------------------------------------

const DEFAULT_DECISION_POLICY = { t4Allowed: false, severityCap: 0, canTrigger: false, confirmationRequired: false }

/**
 * Applies trust-aware alert thresholds to a single classified item.
 *
 * @param {object} item        Classified alert item (intraday_classified_alert shape).
 * @param {object} policies    Per-topic T4 policies (defaults to DEFAULT_TOPIC_POLICIES).
 * @param {object} thresholds  Global threshold overrides.
 * @param {number} [thresholds.importance=60]
 * @param {number} [thresholds.severity=50]
 * @param {number} [thresholds.confidence=40]
 * @returns {{ result: 'approved'|'pending'|'rejected', item: object }}
 */
export function applyAlertDecision(item, policies = DEFAULT_TOPIC_POLICIES, thresholds = {}) {
  const importanceThreshold = thresholds.importance ?? 60
  const severityThreshold   = thresholds.severity   ?? 50
  const confidenceThreshold = thresholds.confidence ?? 40

  // Normalize the selected policy so callers can pass raw config/trust-rules.json
  // entries (snake_case fields like t4_allowed, severity_cap, etc.) directly without
  // needing to manually convert to camelCase first.
  const topicPolicy = normalizeTopicPolicy(policies[item.topic_slug] || DEFAULT_DECISION_POLICY)
  const trustTier     = item.trust_tier || null
  const isT4          = trustTier === 'T4'
  const isUnknownTier = trustTier === null
  const isLowTrust    = isT4 || isUnknownTier

  // Reject T4/unknown for topics that exclude T4 entirely
  if (isLowTrust && !topicPolicy.t4Allowed) {
    return { result: 'rejected', item }
  }

  const rawSeverity = item.severity_score
  let adjustedSeverity = rawSeverity

  if (isT4 && topicPolicy.severityCap > 0) {
    adjustedSeverity = Math.min(adjustedSeverity, topicPolicy.severityCap)
  }
  if (isUnknownTier) {
    adjustedSeverity = Math.min(adjustedSeverity, UNKNOWN_SOURCE_SEVERITY_CAP)
  }

  const rawPasses =
    item.send_alert === true &&
    item.importance_score >= importanceThreshold &&
    rawSeverity           >= severityThreshold   &&
    item.confidence_score >= confidenceThreshold

  const passes =
    item.send_alert === true &&
    item.importance_score >= importanceThreshold &&
    adjustedSeverity      >= severityThreshold   &&
    item.confidence_score >= confidenceThreshold

  // Hold for confirmation
  if (rawPasses && isLowTrust && topicPolicy.confirmationRequired) {
    const dateKey = item.event_at ? item.event_at.slice(0, 10) : new Date().toISOString().slice(0, 10)
    return {
      result: 'pending',
      item: {
        ...item,
        severity_score:       adjustedSeverity,
        alert_id:             null,
        cluster_id:           null,
        date_key:             dateKey,
        channels:             ['telegram', 'discord'],
        status:               'pending_confirmation',
        confirmation_status:  'pending'
      }
    }
  }

  // Reject when topic disallows independent triggering
  if (passes && isLowTrust && !topicPolicy.canTrigger) {
    return { result: 'rejected', item }
  }

  if (passes) {
    const dateKey = item.event_at ? item.event_at.slice(0, 10) : new Date().toISOString().slice(0, 10)
    return {
      result: 'approved',
      item: {
        ...item,
        severity_score:       adjustedSeverity,
        alert_id:             null,
        cluster_id:           null,
        date_key:             dateKey,
        channels:             ['telegram', 'discord'],
        status:               'active',
        confirmation_status:  isLowTrust ? 'unconfirmed' : 'confirmed'
      }
    }
  }

  return { result: 'rejected', item }
}

// ---------------------------------------------------------------------------
// Confirmation confidence boosts — mirrors config/trust-rules.json
// ---------------------------------------------------------------------------

const CONFIRMATION_BOOSTS = {
  T4_confirmed_by_T1: { confidenceBoost: 30, maxConfidence: 95 },
  T4_confirmed_by_T2: { confidenceBoost: 25, maxConfidence: 90 },
  T4_confirmed_by_T3: { confidenceBoost: 15, maxConfidence: 80 },
  T3_confirmed_by_T1: { confidenceBoost: 15, maxConfidence: 95 },
  T3_confirmed_by_T2: { confidenceBoost: 10, maxConfidence: 90 },
  T3_confirmed_by_T3: { confidenceBoost:  5, maxConfidence: 80 },
  T4_confirmed_by_T4: { confidenceBoost:  5, maxConfidence: 60 }
}

/**
 * Applies a confidence boost when a source of one trust tier is confirmed by
 * a source of another trust tier.
 *
 * @param {number} baseConfidence   Current confidence score (0–100).
 * @param {string} sourceTier       Trust tier of the original source ('T1'–'T4').
 * @param {string} confirmingTier   Trust tier of the confirming source.
 * @returns {number}                Boosted confidence score, capped by the rule max.
 */
export function applyConfidenceBoost(baseConfidence, sourceTier, confirmingTier) {
  const key = `${sourceTier}_confirmed_by_${confirmingTier}`
  const rule = CONFIRMATION_BOOSTS[key]
  if (!rule) return baseConfidence
  return Math.min(rule.maxConfidence, baseConfidence + rule.confidenceBoost)
}

// ---------------------------------------------------------------------------
// Wording style selection — mirrors config/trust-rules.json wording_thresholds
// ---------------------------------------------------------------------------

/**
 * Returns the wording style key for a given confidence score.
 *
 * @param {number} confidenceScore
 * @returns {'factual'|'attributed'|'hedged'|'flagged'}
 */
export function getWordingStyle(confidenceScore) {
  if (confidenceScore >= 80) return 'factual'
  if (confidenceScore >= 60) return 'attributed'
  if (confidenceScore >= 40) return 'hedged'
  return 'flagged'
}

// ---------------------------------------------------------------------------
// Source attribution payload shaping
// ---------------------------------------------------------------------------

/**
 * Builds a lightweight source attribution payload for inclusion in alert
 * metadata or summary attribution blocks.
 *
 * @param {object} item  Normalized or classified item.
 * @returns {object}
 */
export function buildSourceAttributionPayload(item) {
  return {
    source_name:   item.source_name   || null,
    source_slug:   item.source_slug   || null,
    source_type:   item.source_type   || null,
    source_url:    item.source_url    || null,
    trust_tier:    item.trust_tier    || null,
    trust_score:   typeof item.trust_score === 'number' ? item.trust_score : null,
    wording_style: typeof item.confidence_score === 'number'
      ? getWordingStyle(item.confidence_score)
      : null
  }
}
