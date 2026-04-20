/**
 * metaSocialFormat.js
 *
 * Platform-specific formatting utilities for Meta (Instagram/Facebook) social content.
 *
 * These functions mirror the logic in the n8n workflow Code nodes so that
 * the formatting behaviour can be tested in isolation.
 *
 * Rules applied:
 *   - Instagram: caption max 2200 chars, hashtags appended at end
 *   - Facebook:  caption max 63206 chars, hashtags appended at end
 *   - Hashtags:  always prefixed with #, deduplicated, capped at 30
 *   - Story captions: max 200 chars
 */

/**
 * Topic-level base hashtags always appended to AI-generated hashtags
 * to ensure minimum discoverability per topic.
 *
 * @type {Record<string, string[]>}
 */
export const TOPIC_BASE_HASHTAGS = {
  crypto:     ['#crypto', '#blockchain', '#digitalassets', '#web3'],
  finance:    ['#finance', '#investing', '#markets', '#stocks'],
  economy:    ['#economy', '#macroeconomics', '#fed', '#inflation'],
  health:     ['#health', '#wellness', '#medicine', '#healthcare'],
  ai:         ['#AI', '#artificialintelligence', '#machinelearning', '#tech'],
  energy:     ['#energy', '#renewableenergy', '#oilandgas', '#cleanenergy'],
  technology: ['#technology', '#tech', '#innovation', '#software']
}

/** Maximum caption length for Instagram feed posts (characters). */
export const INSTAGRAM_CAPTION_MAX = 2200

/** Maximum caption length for Facebook feed posts (characters). */
export const FACEBOOK_CAPTION_MAX = 63206

/** Maximum story caption length for both platforms (characters). */
export const STORY_CAPTION_MAX = 200

/** Minimum importance_score for an alert to be eligible for story generation. */
export const ALERT_STORY_THRESHOLD_DEFAULT = 80

/**
 * Ensure a hashtag string has the # prefix.
 *
 * @param {string} tag
 * @returns {string}
 */
export function normalizeHashtag(tag) {
  if (typeof tag !== 'string') return tag
  return tag.startsWith('#') ? tag : '#' + tag
}

/**
 * Merge AI-generated hashtags with base topic hashtags.
 * Deduplicates and caps at 30 items.
 *
 * @param {string[]} aiHashtags
 * @param {string}   topicSlug
 * @returns {string[]}
 */
export function mergeHashtags(aiHashtags, topicSlug) {
  const base = TOPIC_BASE_HASHTAGS[topicSlug] || []
  const normalized = (aiHashtags || []).map(normalizeHashtag)
  return [...new Set([...normalized, ...base])].slice(0, 30)
}

/**
 * Build an Instagram feed caption from a base caption body, CTA, and hashtag list.
 * Truncates the caption body if needed to stay within 2200 characters total.
 *
 * @param {string}   body      Base caption text (no hashtags).
 * @param {string}   cta       Call-to-action line, or empty string.
 * @param {string[]} hashtags  Array of hashtag strings (with # prefix).
 * @returns {string}
 */
export function buildInstagramCaption(body, cta, hashtags) {
  const ctaBlock  = cta  ? '\n\n' + cta  : ''
  const hashBlock = hashtags.length > 0 ? '\n\n' + hashtags.join(' ') : ''
  const full = body + ctaBlock + hashBlock

  if (full.length <= INSTAGRAM_CAPTION_MAX) return full

  const overhead = ctaBlock.length + hashBlock.length
  const trimmed  = body.slice(0, INSTAGRAM_CAPTION_MAX - overhead - 4) + '...'
  return trimmed + ctaBlock + hashBlock
}

/**
 * Build a Facebook feed caption from a base caption body, CTA, and hashtag list.
 * Truncates at 63206 characters if needed (extremely rare in practice).
 *
 * @param {string}   body      Base caption text (no hashtags).
 * @param {string}   cta       Call-to-action line, or empty string.
 * @param {string[]} hashtags  Array of hashtag strings (with # prefix).
 * @returns {string}
 */
export function buildFacebookCaption(body, cta, hashtags) {
  const ctaBlock  = cta  ? '\n\n' + cta  : ''
  const hashBlock = hashtags.length > 0 ? '\n\n' + hashtags.join(' ') : ''
  const full = body + ctaBlock + hashBlock
  return full.length <= FACEBOOK_CAPTION_MAX ? full : full.slice(0, FACEBOOK_CAPTION_MAX - 3) + '...'
}

/**
 * Truncate a story caption to STORY_CAPTION_MAX characters.
 *
 * @param {string} text
 * @returns {string}
 */
export function truncateStoryCaption(text) {
  if (typeof text !== 'string') return ''
  return text.length <= STORY_CAPTION_MAX ? text : text.slice(0, STORY_CAPTION_MAX - 1) + '…'
}

/**
 * Format a daily summary into a Meta social asset.
 * Returns the per-platform formatted payloads.
 *
 * @param {object} params
 * @param {string}   params.topicSlug
 * @param {string}   params.dateKey
 * @param {object}   params.aiOutput       Validated meta_social_post AI output.
 * @param {boolean}  params.instagramEnabled
 * @param {boolean}  params.facebookEnabled
 * @param {boolean}  params.igStoriesEnabled
 * @param {boolean}  params.fbStoriesEnabled
 * @param {number|null} params.publishJobId
 * @returns {object}  meta_social_asset contract object
 */
export function formatDailySocialAsset({
  topicSlug,
  dateKey,
  aiOutput,
  instagramEnabled,
  facebookEnabled,
  igStoriesEnabled,
  fbStoriesEnabled,
  publishJobId = null
}) {
  const allHashtags  = mergeHashtags(aiOutput.hashtags, topicSlug)
  const ctaText      = aiOutput.cta || `Follow for daily ${topicSlug} updates.`
  const captionBody  = (aiOutput.post_caption || '').trim()

  return {
    topic_slug:     topicSlug,
    date_key:       dateKey,
    asset_type:     'daily_post',
    source_type:    'daily_summary',
    source_id:      null,
    publish_job_id: publishJobId,
    ai_output: {
      post_caption:          aiOutput.post_caption,
      hashtags:              aiOutput.hashtags,
      image_prompt:          aiOutput.image_prompt,
      story_caption:         aiOutput.story_caption    || null,
      story_background_hint: aiOutput.story_background_hint || null,
      cta:                   aiOutput.cta              || null
    },
    instagram: {
      enabled:       instagramEnabled,
      caption:       buildInstagramCaption(captionBody, ctaText, allHashtags),
      story_caption: aiOutput.story_caption ? truncateStoryCaption(aiOutput.story_caption) : null,
      story_enabled: instagramEnabled && igStoriesEnabled
    },
    facebook: {
      enabled:       facebookEnabled,
      caption:       buildFacebookCaption(captionBody, ctaText, allHashtags),
      story_caption: aiOutput.story_caption ? truncateStoryCaption(aiOutput.story_caption) : null,
      story_enabled: facebookEnabled && fbStoriesEnabled
    },
    generated_at: new Date().toISOString()
  }
}

/**
 * Format a high-priority alert into a Meta story asset.
 *
 * @param {object} alert   Classified alert item (intraday_classified_alert shape).
 * @param {object} params
 * @param {boolean} params.igStoryEnabled
 * @param {boolean} params.fbStoryEnabled
 * @returns {object}  meta_social_asset contract object (asset_type: 'story')
 */
export function formatAlertStoryAsset(alert, { igStoryEnabled, fbStoryEnabled }) {
  const topicEmoji = {
    crypto: '🪙', finance: '📈', economy: '🏦',
    health: '🏥', ai: '🤖', energy: '⚡', technology: '💻'
  }
  const emoji = topicEmoji[alert.topic_slug] || '📰'
  const rawCaption  = `${emoji} ${alert.headline || ''}`
  const storyCaption = truncateStoryCaption(rawCaption)
  const dateKey = alert.event_at ? alert.event_at.slice(0, 10) : new Date().toISOString().slice(0, 10)

  return {
    topic_slug:     alert.topic_slug,
    date_key:       dateKey,
    asset_type:     'story',
    source_type:    'alert',
    source_id:      alert.item_id || null,
    publish_job_id: null,
    ai_output: {
      post_caption:          alert.summary_text || alert.headline,
      hashtags:              [`#${alert.topic_slug}`, '#breakingnews'],
      image_prompt:          `Urgent news background for ${alert.topic_slug} story`,
      story_caption:         storyCaption,
      story_background_hint: `High-impact ${alert.topic_slug} news visual`,
      cta:                   null
    },
    instagram: {
      enabled:       igStoryEnabled,
      caption:       igStoryEnabled ? storyCaption : '',
      story_caption: igStoryEnabled ? storyCaption : null,
      story_enabled: igStoryEnabled
    },
    facebook: {
      enabled:       fbStoryEnabled,
      caption:       fbStoryEnabled ? storyCaption : '',
      story_caption: fbStoryEnabled ? storyCaption : null,
      story_enabled: fbStoryEnabled
    },
    generated_at: new Date().toISOString()
  }
}

/**
 * Check whether an alert is eligible for Meta story generation.
 *
 * @param {object} alert
 * @param {number} [threshold]  Minimum importance_score. Defaults to ALERT_STORY_THRESHOLD_DEFAULT.
 * @returns {boolean}
 */
export function isAlertStoryEligible(alert, threshold = ALERT_STORY_THRESHOLD_DEFAULT) {
  return (
    typeof alert.importance_score === 'number' &&
    alert.importance_score >= threshold
  )
}
