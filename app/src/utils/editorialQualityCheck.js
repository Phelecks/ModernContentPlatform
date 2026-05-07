/**
 * editorialQualityCheck.js
 *
 * Editorial quality gate for the daily publishing pipeline.
 *
 * This module **complements** (does not replace) the structural schema
 * validation performed in `08_validate_outputs`.  Where schema validation
 * answers "is the JSON shape correct?", these checks answer "is the editorial
 * content actually publishable?".
 *
 * Two severity tiers are emitted:
 *
 *   - `blocks`   — hard publish-block conditions.  A single block in the
 *                  return value should cause the caller (n8n Code node,
 *                  CI script, etc.) to throw and prevent GitHub publishing.
 *
 *   - `warnings` — soft signals that should be surfaced for operator
 *                  review but never block daily publishing on their own.
 *
 * The function never throws.  Callers decide how to react to the result.
 *
 * Typical usage from an n8n Code node:
 *
 *     const { runEditorialQualityChecks } = require('editorialQualityCheck')
 *     const { blocks, warnings } = runEditorialQualityChecks(ctx)
 *     if (blocks.length > 0) {
 *       throw new Error(`Editorial quality block: ${blocks.join('; ')}`)
 *     }
 *     return [{ json: { ...ctx, editorial_quality_warnings: warnings } }]
 *
 * The same logic lives inline (copy-paste) inside the
 * `08b_editorial_quality_check.json` n8n workflow so the workflow remains
 * self-contained, mirroring the convention used for `validateAiOutput.js`.
 *
 * See `docs/architecture/editorial-quality-checks.md` for the full design.
 */

// ---------------------------------------------------------------------------
// Tunable thresholds
// ---------------------------------------------------------------------------

export const EDITORIAL_QUALITY_THRESHOLDS = Object.freeze({
  // Block thresholds (publish-blocking)
  MIN_HEADLINE_CHARS: 20,
  MIN_OVERVIEW_CHARS: 200,
  MIN_KEY_EVENTS: 2,
  MIN_ARTICLE_CHARS: 500,
  MIN_ARTICLE_PARAGRAPHS: 3,
  MIN_YT_TITLE_CHARS: 20,
  MIN_YT_DESCRIPTION_CHARS: 200,

  // Warning thresholds (advisory only)
  WARN_ARTICLE_CHARS: 800,
  WARN_OVERVIEW_CHARS: 350,
  WARN_OUTLOOK_SUMMARY_CHARS: 100,
  WARN_MIN_YT_TAGS: 8,
  // Phrases that signal overly confident, unsupported claims.
  // Lowercased; whole-word matched against article + summary text.
  CONFIDENT_PHRASES: [
    'guaranteed',
    'guarantee',
    '100% certain',
    '100 percent certain',
    'definitely will',
    'will definitely',
    'will moon',
    'cannot fail',
    "can't fail",
    'no risk',
    'risk-free',
    'risk free',
    'always wins',
    'never loses',
    'sure thing',
    'certain to',
    'absolutely will',
  ],
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0
}

function charLen(v) {
  return typeof v === 'string' ? v.trim().length : 0
}

function isAllUppercaseLetters(s) {
  if (typeof s !== 'string') return false
  // Consider strings with at least 4 letters and all letters uppercase.
  const letters = s.replace(/[^A-Za-z]/g, '')
  if (letters.length < 4) return false
  return letters === letters.toUpperCase()
}

function countParagraphs(md) {
  if (typeof md !== 'string') return 0
  return md
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0).length
}

function collectAllSources(ctx) {
  const sources = []
  const summary = ctx && ctx.summary
  if (summary && typeof summary === 'object') {
    if (Array.isArray(summary.sources)) sources.push(...summary.sources)
    if (Array.isArray(summary.key_events)) {
      summary.key_events.forEach((e) => {
        if (e && Array.isArray(e.sources)) sources.push(...e.sources)
      })
    }
  }
  const vs = ctx && ctx.video_script
  if (vs && Array.isArray(vs.segments)) {
    vs.segments.forEach((seg) => {
      if (seg && Array.isArray(seg.sources)) sources.push(...seg.sources)
    })
  }
  return sources.filter((s) => s && typeof s === 'object')
}

function findConfidentPhrases(text, phrases) {
  if (typeof text !== 'string' || text.length === 0) return []
  const haystack = text.toLowerCase()
  const hits = []
  for (const phrase of phrases) {
    if (haystack.includes(phrase)) hits.push(phrase)
  }
  return hits
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Runs editorial quality checks against a daily publish context.
 *
 * The context object should be the post-validation payload emitted by
 * `08_validate_outputs` and is expected (but not required) to include:
 *   - summary, article_md, expectation_check, tomorrow_outlook,
 *     video_script, youtube_metadata, topic_slug, date_key
 *
 * @param {object} ctx
 * @param {object} [options]
 * @param {object} [options.thresholds] - Override any field of
 *   `EDITORIAL_QUALITY_THRESHOLDS`.
 * @returns {{ blocks: string[], warnings: string[] }}
 */
export function runEditorialQualityChecks(ctx, options = {}) {
  const T = { ...EDITORIAL_QUALITY_THRESHOLDS, ...(options.thresholds || {}) }
  const blocks = []
  const warnings = []

  if (!ctx || typeof ctx !== 'object') {
    blocks.push('context object missing or not an object')
    return { blocks, warnings }
  }

  // -------------------- summary --------------------
  const summary = ctx.summary
  if (!summary || typeof summary !== 'object') {
    blocks.push('summary object missing')
  } else {
    if (charLen(summary.headline) < T.MIN_HEADLINE_CHARS) {
      blocks.push(
        `weak title: summary.headline shorter than ${T.MIN_HEADLINE_CHARS} chars`,
      )
    }
    if (isAllUppercaseLetters(summary.headline)) {
      warnings.push('summary.headline is all uppercase')
    }
    if (charLen(summary.overview) < T.MIN_OVERVIEW_CHARS) {
      blocks.push(
        `weak summary: summary.overview shorter than ${T.MIN_OVERVIEW_CHARS} chars`,
      )
    } else if (charLen(summary.overview) < T.WARN_OVERVIEW_CHARS) {
      warnings.push(
        `summary.overview is short (under ${T.WARN_OVERVIEW_CHARS} chars)`,
      )
    }
    const keyEvents = Array.isArray(summary.key_events) ? summary.key_events : []
    if (keyEvents.length < T.MIN_KEY_EVENTS) {
      blocks.push(
        `low-information: summary.key_events fewer than ${T.MIN_KEY_EVENTS}`,
      )
    }
    keyEvents.forEach((e, i) => {
      if (!e || !Array.isArray(e.sources) || e.sources.length === 0) {
        warnings.push(`summary.key_events[${i}] has no sources attached`)
      }
    })
  }

  // -------------------- source attribution --------------------
  const allSources = collectAllSources(ctx)
  const namedSources = allSources.filter((s) => isNonEmptyString(s.source_name))
  if (namedSources.length === 0) {
    blocks.push(
      'missing source attribution: no named sources found across summary, key_events, or video_script',
    )
  }
  const urlSources = namedSources.filter((s) => isNonEmptyString(s.source_url))
  if (namedSources.length > 0 && urlSources.length === 0) {
    warnings.push('no source_url provided on any source (only names supplied)')
  }

  // -------------------- article --------------------
  const article = ctx.article_md
  if (!isNonEmptyString(article)) {
    blocks.push('low-information: article_md missing')
  } else {
    if (charLen(article) < T.MIN_ARTICLE_CHARS) {
      blocks.push(
        `low-information: article_md shorter than ${T.MIN_ARTICLE_CHARS} chars`,
      )
    } else if (charLen(article) < T.WARN_ARTICLE_CHARS) {
      warnings.push(`article_md is short (under ${T.WARN_ARTICLE_CHARS} chars)`)
    }
    if (countParagraphs(article) < T.MIN_ARTICLE_PARAGRAPHS) {
      blocks.push(
        `low-information: article_md has fewer than ${T.MIN_ARTICLE_PARAGRAPHS} paragraphs`,
      )
    }
  }

  // -------------------- youtube metadata consistency --------------------
  const ym = ctx.youtube_metadata
  if (!ym || typeof ym !== 'object') {
    blocks.push('inconsistent metadata: youtube_metadata missing')
  } else {
    if (charLen(ym.title) < T.MIN_YT_TITLE_CHARS) {
      blocks.push(
        `weak title: youtube_metadata.title shorter than ${T.MIN_YT_TITLE_CHARS} chars`,
      )
    }
    if (isAllUppercaseLetters(ym.title)) {
      warnings.push('youtube_metadata.title is all uppercase')
    }
    if (charLen(ym.description) < T.MIN_YT_DESCRIPTION_CHARS) {
      blocks.push(
        `inconsistent metadata: youtube_metadata.description shorter than ${T.MIN_YT_DESCRIPTION_CHARS} chars`,
      )
    }
    const tags = Array.isArray(ym.tags) ? ym.tags : []
    if (tags.length < T.WARN_MIN_YT_TAGS) {
      warnings.push(
        `youtube_metadata.tags fewer than ${T.WARN_MIN_YT_TAGS} entries`,
      )
    }
    const lower = tags
      .filter((t) => typeof t === 'string')
      .map((t) => t.trim().toLowerCase())
    const seen = new Set()
    const dupes = new Set()
    for (const t of lower) {
      if (seen.has(t)) dupes.add(t)
      else seen.add(t)
    }
    if (dupes.size > 0) {
      warnings.push(
        `youtube_metadata.tags contain duplicates: ${[...dupes].join(', ')}`,
      )
    }
    // Topic-vs-title sanity: title should mention the topic slug or one of its
    // common variants so YouTube discovery stays consistent.
    if (
      isNonEmptyString(ctx.topic_slug) &&
      isNonEmptyString(ym.title) &&
      !ym.title.toLowerCase().includes(String(ctx.topic_slug).toLowerCase())
    ) {
      warnings.push(
        `inconsistent metadata: youtube_metadata.title does not reference topic_slug "${ctx.topic_slug}"`,
      )
    }
  }

  // -------------------- tomorrow outlook depth --------------------
  const outlook = ctx.tomorrow_outlook
  if (
    outlook &&
    typeof outlook === 'object' &&
    isNonEmptyString(outlook.outlook_summary) &&
    charLen(outlook.outlook_summary) < T.WARN_OUTLOOK_SUMMARY_CHARS
  ) {
    warnings.push(
      `tomorrow_outlook.outlook_summary is short (under ${T.WARN_OUTLOOK_SUMMARY_CHARS} chars)`,
    )
  }

  // -------------------- expectation check confidence --------------------
  const ec = ctx.expectation_check
  if (
    ec &&
    typeof ec === 'object' &&
    typeof ec.alignment_score === 'number' &&
    (ec.alignment_score === 100 || ec.alignment_score === 0)
  ) {
    warnings.push(
      `expectation_check.alignment_score is suspiciously absolute (${ec.alignment_score})`,
    )
  }

  // -------------------- overly confident unsupported language --------------------
  const confidentTexts = []
  if (summary && isNonEmptyString(summary.overview)) confidentTexts.push(summary.overview)
  if (isNonEmptyString(article)) confidentTexts.push(article)
  if (
    outlook &&
    typeof outlook === 'object' &&
    isNonEmptyString(outlook.outlook_summary)
  ) {
    confidentTexts.push(outlook.outlook_summary)
  }
  const confidentHits = new Set()
  for (const text of confidentTexts) {
    findConfidentPhrases(text, T.CONFIDENT_PHRASES).forEach((p) =>
      confidentHits.add(p),
    )
  }
  if (confidentHits.size > 0) {
    const phraseList = [...confidentHits].join(', ')
    if (urlSources.length === 0) {
      blocks.push(
        `overly confident unsupported language without source URLs: ${phraseList}`,
      )
    } else {
      warnings.push(`overly confident language detected: ${phraseList}`)
    }
  }

  return { blocks, warnings }
}
