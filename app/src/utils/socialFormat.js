/**
 * socialFormat.js
 *
 * Platform-specific formatting utilities for X, Telegram, and Discord
 * social content publishing.
 *
 * These functions reuse the same shared AI output (post_caption, hashtags,
 * story_caption, cta) that Meta publishing uses, applying per-platform
 * formatting rules at the publishing layer.
 *
 * Rules applied:
 *   - X:        post max 280 chars, optional thread, hashtags inline
 *   - Telegram: HTML-formatted message max 4096 chars, bold/link support
 *   - Discord:  embed object with title, description, color, fields, footer
 */

import {
  TOPIC_BASE_HASHTAGS,
  mergeHashtags,
  normalizeHashtag,
  truncateStoryCaption,
  ALERT_STORY_THRESHOLD_DEFAULT
} from './metaSocialFormat.js'

// Re-export shared constants and utilities for convenience
export {
  TOPIC_BASE_HASHTAGS,
  mergeHashtags,
  normalizeHashtag,
  truncateStoryCaption,
  ALERT_STORY_THRESHOLD_DEFAULT
}

// ── Platform limits ─────────────────────────────────────────────────

/** Maximum post length for X (characters). */
export const X_POST_MAX = 280

/** Maximum message length for Telegram messages (characters). */
export const TELEGRAM_MESSAGE_MAX = 4096

/** Maximum embed description length for Discord (characters). */
export const DISCORD_EMBED_DESCRIPTION_MAX = 4096

/** Maximum embed title length for Discord (characters). */
export const DISCORD_EMBED_TITLE_MAX = 256

// ── Topic emoji map ─────────────────────────────────────────────────

/** @type {Record<string, string>} */
export const TOPIC_EMOJI = {
  crypto:     '🪙',
  finance:    '📈',
  economy:    '🏦',
  health:     '🏥',
  ai:         '🤖',
  energy:     '⚡',
  technology: '💻'
}

/** @type {Record<string, number>} */
export const DISCORD_TOPIC_COLOR = {
  crypto:     0xF7931A,
  finance:    0x2ECC71,
  economy:    0x3498DB,
  health:     0xE74C3C,
  ai:         0x9B59B6,
  energy:     0xF1C40F,
  technology: 0x1ABC9C
}

// ── X formatting ────────────────────────────────────────────────────

/**
 * Build an X post from a base caption body and hashtag list.
 * Truncates the caption body if needed to stay within 280 characters total.
 *
 * @param {string}   body       Base caption text.
 * @param {string[]} hashtags   Array of hashtag strings (with # prefix).
 * @param {string}   topicSlug  Topic slug for emoji prefix.
 * @returns {string}
 */
export function buildXPost(body, hashtags, topicSlug) {
  const emoji = TOPIC_EMOJI[topicSlug] || '📰'
  const prefix = `${emoji} `
  const hashBlock = hashtags.length > 0 ? '\n\n' + hashtags.slice(0, 5).join(' ') : ''

  const full = prefix + body + hashBlock
  if (full.length <= X_POST_MAX) return full

  const overhead = prefix.length + hashBlock.length
  const available = X_POST_MAX - overhead - 1
  if (available <= 0) return (prefix + body).slice(0, X_POST_MAX - 1) + '…'
  const trimmed = body.slice(0, available) + '…'
  return prefix + trimmed + hashBlock
}

/**
 * Build an X alert post from an alert headline.
 *
 * @param {string} headline   Alert headline.
 * @param {string} topicSlug  Topic slug for emoji prefix.
 * @param {string|null} sourceUrl  Optional source link.
 * @returns {string}
 */
export function buildXAlertPost(headline, topicSlug, sourceUrl) {
  const emoji = TOPIC_EMOJI[topicSlug] || '📰'
  const prefix = `${emoji} `
  const suffix = sourceUrl ? `\n\n${sourceUrl}` : ''
  const full = prefix + headline + suffix
  if (full.length <= X_POST_MAX) return full

  const overhead = prefix.length + suffix.length
  const available = X_POST_MAX - overhead - 1
  if (available <= 0) return (prefix + headline).slice(0, X_POST_MAX - 1) + '…'
  return prefix + headline.slice(0, available) + '…' + suffix
}

/**
 * Build an optional X thread from a longer caption body.
 * Returns null if the body fits in a single post. Otherwise, splits into
 * thread posts of up to 280 characters each.
 *
 * @param {string}   body       Full caption text (may be longer than 280).
 * @param {string[]} hashtags   Hashtag list for the last thread post.
 * @returns {string[]|null}
 */
export function buildXThread(body, hashtags) {
  if (body.length <= X_POST_MAX) return null

  const posts = []
  let remaining = body
  while (remaining.length > 0) {
    if (remaining.length <= X_POST_MAX) {
      posts.push(remaining)
      break
    }
    // Split at last space within limit to avoid breaking words
    let splitAt = remaining.lastIndexOf(' ', X_POST_MAX - 4)
    if (splitAt <= 0) splitAt = X_POST_MAX - 4
    posts.push(remaining.slice(0, splitAt) + ' ...')
    remaining = remaining.slice(splitAt).trim()
  }

  // Append hashtags to last post if room
  if (posts.length > 0 && hashtags.length > 0) {
    const hashBlock = '\n\n' + hashtags.slice(0, 5).join(' ')
    const last = posts[posts.length - 1]
    if (last.length + hashBlock.length <= X_POST_MAX) {
      posts[posts.length - 1] = last + hashBlock
    }
  }

  return posts.length > 1 ? posts : null
}

// ── Telegram formatting ─────────────────────────────────────────────

/**
 * Escape text for Telegram HTML parse mode.
 *
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text) {
  return (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Build a Telegram daily digest message in HTML format.
 *
 * @param {object} params
 * @param {string} params.topicSlug
 * @param {string} params.dateKey
 * @param {string} params.captionBody  Base caption text.
 * @param {string} params.cta          Call-to-action text.
 * @param {string[]} params.hashtags   Hashtag list.
 * @returns {string}
 */
export function buildTelegramDailyMessage({ topicSlug, dateKey, captionBody, cta, hashtags }) {
  const emoji = TOPIC_EMOJI[topicSlug] || '📰'
  const topicLabel = topicSlug.charAt(0).toUpperCase() + topicSlug.slice(1)
  const hashLine = hashtags.length > 0 ? '\n\n' + hashtags.join(' ') : ''
  const ctaLine = cta ? `\n\n${escapeHtml(cta)}` : ''

  const text = [
    `${emoji} <b>${topicLabel} Daily Briefing</b> — ${escapeHtml(dateKey)}`,
    '',
    escapeHtml(captionBody),
    ctaLine ? ctaLine : '',
    hashLine
  ].filter(Boolean).join('\n')

  return text.length <= TELEGRAM_MESSAGE_MAX
    ? text
    : text.slice(0, TELEGRAM_MESSAGE_MAX - 1) + '…'
}

/**
 * Build a Telegram alert message in HTML format.
 *
 * @param {object} alert  Classified alert item.
 * @returns {string}
 */
export function buildTelegramAlertMessage(alert) {
  const emoji = TOPIC_EMOJI[alert.topic_slug] || '📰'
  const importanceBar = '🟩'.repeat(Math.round((alert.importance_score || 0) / 20))
    + '⬜'.repeat(5 - Math.round((alert.importance_score || 0) / 20))
  const sourceLink = alert.source_url
    ? `\n<a href="${escapeHtml(alert.source_url)}">Source: ${escapeHtml(alert.source_name || 'Unknown')}</a>`
    : `\nSource: ${escapeHtml(alert.source_name || 'Unknown')}`

  const text = [
    `${emoji} <b>${(alert.topic_slug || '').toUpperCase()}</b>  |  Importance: ${importanceBar} ${alert.importance_score}/100`,
    '',
    `<b>${escapeHtml(alert.headline || '')}</b>`,
    '',
    escapeHtml(alert.summary_text || ''),
    sourceLink
  ].join('\n')

  return text.length <= TELEGRAM_MESSAGE_MAX
    ? text
    : text.slice(0, TELEGRAM_MESSAGE_MAX - 1) + '…'
}

// ── Discord formatting ──────────────────────────────────────────────

/**
 * Build a Discord embed for a daily digest post.
 *
 * @param {object} params
 * @param {string} params.topicSlug
 * @param {string} params.dateKey
 * @param {string} params.captionBody  Base caption text.
 * @param {string} params.cta          Call-to-action text.
 * @param {string[]} params.hashtags   Hashtag list.
 * @param {string}   params.timestamp  ISO-8601 timestamp.
 * @returns {object}  Discord embed object.
 */
export function buildDiscordDailyEmbed({ topicSlug, dateKey, captionBody, cta, hashtags, timestamp }) {
  const emoji = TOPIC_EMOJI[topicSlug] || '📰'
  const topicLabel = topicSlug.charAt(0).toUpperCase() + topicSlug.slice(1)
  const color = DISCORD_TOPIC_COLOR[topicSlug] || 0x95A5A6

  const description = captionBody.length <= DISCORD_EMBED_DESCRIPTION_MAX
    ? captionBody
    : captionBody.slice(0, DISCORD_EMBED_DESCRIPTION_MAX - 1) + '…'

  const title = `${emoji} ${topicLabel} Daily Briefing — ${dateKey}`

  const fields = [
    { name: 'Topic', value: topicLabel, inline: true }
  ]
  if (cta) {
    fields.push({ name: 'CTA', value: cta, inline: false })
  }

  const embed = {
    title: title.slice(0, DISCORD_EMBED_TITLE_MAX),
    description,
    color,
    fields,
    footer: { text: hashtags.slice(0, 10).join(' ') },
    timestamp: timestamp || new Date().toISOString()
  }

  return embed
}

/**
 * Build a Discord embed for an alert/story message.
 *
 * @param {object} alert  Classified alert item.
 * @returns {object}  Discord embed object.
 */
export function buildDiscordAlertEmbed(alert) {
  const emoji = TOPIC_EMOJI[alert.topic_slug] || '📰'
  const topicLabel = (alert.topic_slug || '').charAt(0).toUpperCase() + (alert.topic_slug || '').slice(1)
  const color = DISCORD_TOPIC_COLOR[alert.topic_slug] || 0x95A5A6

  const tsRaw = alert.event_at
  const timestamp = (tsRaw && !isNaN(Date.parse(tsRaw)))
    ? tsRaw
    : new Date().toISOString()

  const embed = {
    title: `${emoji} ${(alert.headline || '').slice(0, DISCORD_EMBED_TITLE_MAX - 4)}`,
    description: (alert.summary_text || '').slice(0, DISCORD_EMBED_DESCRIPTION_MAX),
    color,
    fields: [
      { name: 'Topic', value: topicLabel, inline: true },
      { name: 'Importance', value: `${alert.importance_score}/100`, inline: true },
      { name: 'Severity', value: `${alert.severity_score}/100`, inline: true }
    ],
    footer: { text: alert.source_name || 'Unknown' },
    timestamp
  }

  if (alert.source_url) {
    embed.url = alert.source_url
  }

  return embed
}

// ── Asset formatters ────────────────────────────────────────────────

/**
 * Format a daily summary into a social content asset for X, Telegram, and Discord.
 *
 * @param {object} params
 * @param {string}   params.topicSlug
 * @param {string}   params.dateKey
 * @param {object}   params.aiOutput       Validated social_content_post AI output.
 * @param {boolean}  params.xEnabled
 * @param {boolean}  params.telegramEnabled
 * @param {boolean}  params.discordEnabled
 * @param {number|null} params.publishJobId
 * @returns {object}  social_content_asset contract object
 */
export function formatDailySocialContentAsset({
  topicSlug,
  dateKey,
  aiOutput,
  xEnabled,
  telegramEnabled,
  discordEnabled,
  publishJobId = null
}) {
  const allHashtags = mergeHashtags(aiOutput.hashtags, topicSlug)
  const ctaText = aiOutput.cta || `Follow for daily ${topicSlug} updates.`
  const captionBody = (aiOutput.post_caption || '').trim()
  const timestamp = new Date().toISOString()

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
    x: {
      enabled:    xEnabled,
      post_text:  buildXPost(captionBody, allHashtags, topicSlug),
      thread:     buildXThread(captionBody, allHashtags),
      alert_text: null
    },
    telegram: {
      enabled:     telegramEnabled,
      message_html: buildTelegramDailyMessage({
        topicSlug, dateKey, captionBody, cta: ctaText, hashtags: allHashtags
      }),
      alert_html:  null
    },
    discord: {
      enabled: discordEnabled,
      embed:   buildDiscordDailyEmbed({
        topicSlug, dateKey, captionBody, cta: ctaText,
        hashtags: allHashtags, timestamp
      }),
      alert_embed: null
    },
    generated_at: timestamp
  }
}

/**
 * Format a high-priority alert into a social content asset for X, Telegram, and Discord.
 *
 * @param {object} alert   Classified alert item (intraday_classified_alert shape).
 * @param {object} params
 * @param {boolean} params.xEnabled
 * @param {boolean} params.telegramEnabled
 * @param {boolean} params.discordEnabled
 * @returns {object}  social_content_asset contract object (asset_type: 'story')
 */
export function formatAlertSocialContentAsset(alert, { xEnabled, telegramEnabled, discordEnabled }) {
  const emoji = TOPIC_EMOJI[alert.topic_slug] || '📰'
  const rawCaption = `${emoji} ${alert.headline || ''}`
  const storyCaption = truncateStoryCaption(rawCaption)
  const dateKey = alert.event_at ? alert.event_at.slice(0, 10) : new Date().toISOString().slice(0, 10)
  const timestamp = new Date().toISOString()

  return {
    topic_slug:     alert.topic_slug,
    date_key:       dateKey,
    asset_type:     'story',
    source_type:    'alert',
    source_id:      alert.item_id || null,
    publish_job_id: null,
    ai_output: {
      post_caption:          alert.summary_text || alert.headline,
      hashtags:              [`#${alert.topic_slug}`, '#breakingnews', '#newsupdate'],
      image_prompt:          `Urgent news background for ${alert.topic_slug} story`,
      story_caption:         storyCaption,
      story_background_hint: `High-impact ${alert.topic_slug} news visual`,
      cta:                   null
    },
    x: {
      enabled:    xEnabled,
      post_text:  buildXAlertPost(alert.headline || '', alert.topic_slug, alert.source_url || null),
      thread:     null,
      alert_text: buildXAlertPost(alert.headline || '', alert.topic_slug, alert.source_url || null)
    },
    telegram: {
      enabled:      telegramEnabled,
      message_html: buildTelegramAlertMessage(alert),
      alert_html:   buildTelegramAlertMessage(alert)
    },
    discord: {
      enabled:     discordEnabled,
      embed:       buildDiscordAlertEmbed(alert),
      alert_embed: buildDiscordAlertEmbed(alert)
    },
    generated_at: timestamp
  }
}

/**
 * Check whether an alert is eligible for social story generation.
 *
 * @param {object} alert
 * @param {number} [threshold]  Minimum importance_score.
 * @returns {boolean}
 */
export function isAlertSocialEligible(alert, threshold = ALERT_STORY_THRESHOLD_DEFAULT) {
  return (
    typeof alert.importance_score === 'number' &&
    alert.importance_score >= threshold
  )
}
