/**
 * normalizeItem — pure normalization utility for intraday source items.
 *
 * Mirrors the "Normalize Item" and "Has Valid Headline?" node logic in
 * workflows/n8n/intraday/02_normalization.json so that the transformation
 * can be imported and unit/integration tested outside of n8n.
 *
 * Uses the Node.js built-in crypto module (available in Vitest/Node tests).
 * This module lives in app/src/utils/ rather than functions/ because it is
 * not deployed as a Cloudflare Pages Function — it is a test utility that
 * mirrors the equivalent n8n node logic.
 *
 * Contract:
 *   Input  — intraday_source_item   (workflows/contracts/intraday_source_item.json)
 *   Output — intraday_normalized_item (workflows/contracts/intraday_normalized_item.json)
 */

import { createHash } from 'node:crypto'

// ---- Topic keyword map -------------------------------------------------------
// Mirrors the topicKeywords object in the "Normalize Item" n8n node.

const TOPIC_KEYWORDS = {
  crypto:     ['bitcoin', 'ethereum', 'crypto', 'blockchain', 'defi', 'nft', 'altcoin', 'btc', 'eth', 'solana', 'token', 'wallet', 'exchange'],
  finance:    ['stock', 'equity', 'bond', 'yield', 'interest rate', 'market', 'nasdaq', 'nyse', 's&p', 'dow', 'etf', 'dividend', 'earnings'],
  economy:    ['gdp', 'inflation', 'recession', 'trade', 'tariff', 'unemployment', 'central bank', 'federal reserve', 'ecb', 'imf', 'world bank'],
  health:     ['vaccine', 'clinical trial', 'fda', 'drug', 'cancer', 'pandemic', 'disease', 'hospital', 'biotech', 'pharma', 'health'],
  ai:         ['artificial intelligence', 'machine learning', 'llm', 'openai', 'gpt', 'neural network', 'deep learning', 'foundation model', 'chatbot', 'automation'],
  energy:     ['oil', 'gas', 'renewable', 'solar', 'wind', 'opec', 'battery', 'ev', 'electric vehicle', 'carbon', 'energy', 'power grid'],
  technology: ['apple', 'google', 'microsoft', 'meta', 'amazon', 'semiconductor', 'chip', 'software', 'cloud', 'cybersecurity', 'regulation', 'antitrust']
}

// ---- Helpers -----------------------------------------------------------------

/**
 * Strip HTML tags and collapse whitespace.
 *
 * Applies the tag-removal regex repeatedly until the output stabilises,
 * preventing bypass via nested or split tags (e.g. <<b>script></b>).
 */
export function stripHtml(str) {
  let s = (str || '')
  let prev
  do {
    prev = s
    s = s.replace(/<[^>]*>/g, '')
  } while (s !== prev)
  return s.replace(/\s+/g, ' ').trim()
}

/**
 * Compute the deterministic item_id for a source item.
 * SHA-256( source_name + ':' + source_id ), hex-encoded.
 */
export function computeItemId(sourceName, sourceId) {
  return createHash('sha256').update(`${sourceName}:${sourceId}`).digest('hex')
}

/**
 * Run lightweight keyword-based topic candidate detection.
 * Returns up to 3 topic slugs whose keywords appear in the combined text.
 */
export function detectTopicCandidates(headline, body) {
  const searchText = `${headline} ${body || ''}`.toLowerCase()
  return Object.entries(TOPIC_KEYWORDS)
    .filter(([, kw]) => kw.some(k => searchText.includes(k)))
    .map(([topic]) => topic)
    .slice(0, 3)
}

// ---- Main normalizer ---------------------------------------------------------

/**
 * Normalize a single source_item into the intraday_normalized_item contract.
 *
 * Returns null when the headline is shorter than 5 characters (the item
 * should be discarded, mirroring the "Has Valid Headline?" filter node).
 *
 * @param {Object} item - A source_item object conforming to intraday_source_item.json
 * @returns {Object|null} normalized_item or null if the headline is too short
 */
export function normalizeItem(item) {
  const item_id = computeItemId(item.source_name, item.source_id)

  const headline = stripHtml(item.title || '').slice(0, 250)
  const body = item.body ? stripHtml(item.body).slice(0, 2000) : null
  const author = item.author ? stripHtml(item.author).slice(0, 200) || null : null

  // Discard items whose headline is too short (mirrors "Has Valid Headline?" node)
  if (headline.length < 5) return null

  let published_at
  try {
    published_at = item.published_at
      ? new Date(item.published_at).toISOString()
      : item.fetched_at
  } catch {
    published_at = item.fetched_at
  }

  const topic_candidates = detectTopicCandidates(headline, body)

  // Propagate trust fields — null when not present
  const trust_tier = item.trust_tier || null

  // Coerce trust_score to integer 0-100; null when invalid or absent
  let trust_score = null
  if (item.trust_score != null && item.trust_score !== '') {
    const parsed = Number(item.trust_score)
    if (Number.isFinite(parsed)) {
      trust_score = Math.max(0, Math.min(100, Math.trunc(parsed)))
    }
  }

  return {
    item_id,
    source_id:        item.source_id,
    source_slug:      item.source_slug || null,
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
