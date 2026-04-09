#!/usr/bin/env node
/**
 * scripts/generate-daily-summary.js
 *
 * Local daily summary generation script.
 *
 * Reads alerts and clusters for a topic/date from local D1, generates a
 * structured summary and article (using deterministic mock logic in place of
 * AI), writes the content files to the GitHub-backed content directory, and
 * updates the local daily_status row so the frontend can switch from
 * placeholder state to final summary state.
 *
 * Usage:
 *   node scripts/generate-daily-summary.js --topic <topic_slug> --date <YYYY-MM-DD>
 *
 * Example:
 *   node scripts/generate-daily-summary.js --topic ai --date 2025-01-15
 *
 * Prerequisites:
 *   - Run scripts/local-reset.sh first to initialise local D1 with seed data.
 *   - Wrangler CLI ≥3 installed (npm install -g wrangler).
 *   - Run from the repository root directory.
 *
 * What it does:
 *   1. Reads active alerts + event clusters from local D1 for the given topic/date.
 *   2. Generates a structured summary.json conforming to schemas/ai/daily_summary.json.
 *   3. Generates an article.md using the summary content.
 *   4. Writes metadata.json (page state, paths, generated timestamp).
 *   5. Updates the daily_status row in local D1:
 *        summary_available=1, article_available=1, page_state='ready'.
 *
 * Repeatability:
 *   Re-running the script for the same topic/date overwrites existing content
 *   files and updates the D1 row in-place — safe for iterative local testing.
 */

const { execSync } = require('node:child_process')
const { mkdirSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

// ---------------------------------------------------------------------------
// Resolve repo root regardless of working directory
// ---------------------------------------------------------------------------
const SCRIPT_DIR = __dirname
const REPO_ROOT = join(SCRIPT_DIR, '..')
const DB_NAME = 'modern-content-platform-db'

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = {}
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--topic' && argv[i + 1]) args.topic = argv[++i]
    if (argv[i] === '--date' && argv[i + 1]) args.date = argv[++i]
  }
  return args
}

function validateArgs(args) {
  if (!args.topic) {
    console.error('Error: --topic <topic_slug> is required')
    process.exit(1)
  }
  if (!args.date) {
    console.error('Error: --date <YYYY-MM-DD> is required')
    process.exit(1)
  }
  if (!/^[a-z0-9-]+$/.test(args.topic)) {
    console.error(`Error: invalid topic slug "${args.topic}" — use lowercase letters, digits, and hyphens only`)
    process.exit(1)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    console.error(`Error: invalid date "${args.date}" — expected YYYY-MM-DD`)
    process.exit(1)
  }
}

// ---------------------------------------------------------------------------
// D1 helpers — thin wrappers around wrangler d1 execute
// ---------------------------------------------------------------------------

/**
 * Execute a SQL query against the local D1 database via Wrangler.
 * Throws an Error on failure; returns the first result set's rows on success.
 *
 * @param {string} sql
 * @returns {Array<Object>}
 */
function d1Query(sql) {
  try {
    const raw = execSync(
      `npx wrangler d1 execute "${DB_NAME}" --local --json --command ${JSON.stringify(sql)}`,
      { cwd: REPO_ROOT, stdio: ['pipe', 'pipe', 'pipe'] }
    ).toString()

    // Wrangler outputs an array of result sets; pick the first one.
    const parsed = JSON.parse(raw)
    const first = Array.isArray(parsed) ? parsed[0] : parsed
    return first?.results ?? []
  } catch (err) {
    const stderr = err.stderr?.toString() ?? ''
    throw new Error(`D1 query failed.\n  SQL: ${sql}\n  Reason: ${stderr || err.message}`)
  }
}

/**
 * Execute a SQL statement against the local D1 database (write path).
 *
 * @param {string} sql
 */
function d1Execute(sql) {
  try {
    execSync(
      `npx wrangler d1 execute "${DB_NAME}" --local --command ${JSON.stringify(sql)}`,
      { cwd: REPO_ROOT, stdio: ['pipe', 'pipe', 'pipe'] }
    )
  } catch (err) {
    const stderr = err.stderr?.toString() ?? ''
    throw new Error(`D1 execute failed.\n  SQL: ${sql}\n  Reason: ${stderr || err.message}`)
  }
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

function loadAlerts(topicSlug, dateKey) {
  return d1Query(
    `SELECT id, headline, summary_text, source_name, source_url,
            importance_score, severity_score, event_at
     FROM alerts
     WHERE topic_slug = '${topicSlug}'
       AND date_key   = '${dateKey}'
       AND status     = 'active'
     ORDER BY importance_score DESC`
  )
}

function loadClusters(topicSlug, dateKey) {
  return d1Query(
    `SELECT id, cluster_label, summary_text, alert_count, importance_score
     FROM event_clusters
     WHERE topic_slug = '${topicSlug}'
       AND date_key   = '${dateKey}'
     ORDER BY importance_score DESC`
  )
}

function loadTopic(topicSlug) {
  const rows = d1Query(
    `SELECT topic_slug, display_name FROM topics WHERE topic_slug = '${topicSlug}'`
  )
  return rows[0] ?? null
}

// ---------------------------------------------------------------------------
// Mock summary generation
//
// In production this step is replaced by an AI prompt call.
// Locally we derive a deterministic structured summary from the raw alert
// and cluster data — good enough to validate the editorial path end-to-end.
// ---------------------------------------------------------------------------

/**
 * Derive an overall sentiment label from an average importance score.
 *
 * @param {number} avgScore
 * @param {Array<Object>} alerts
 * @returns {'bullish'|'bearish'|'neutral'|'mixed'}
 */
function deriveSentiment(avgScore, alerts) {
  // Use headline keywords as a simple heuristic.
  const text = alerts.map((a) => a.headline.toLowerCase()).join(' ')
  const bullishWords = ['surge', 'rally', 'record', 'high', 'gain', 'rise', 'inflow', 'soar', 'jump']
  const bearishWords = ['fall', 'drop', 'decline', 'dip', 'fear', 'risk', 'lower', 'sell', 'loss']
  const bullCount = bullishWords.filter((w) => text.includes(w)).length
  const bearCount = bearishWords.filter((w) => text.includes(w)).length
  if (bullCount > bearCount + 1) return 'bullish'
  if (bearCount > bullCount + 1) return 'bearish'
  if (bullCount > 0 && bearCount > 0) return 'mixed'
  return 'neutral'
}

/**
 * Generate a structured daily summary object from alerts and clusters.
 * Conforms to schemas/ai/daily_summary.json.
 *
 * @param {string} topicSlug
 * @param {string} dateKey
 * @param {string} displayName
 * @param {Array<Object>} alerts
 * @param {Array<Object>} clusters
 * @returns {Object}
 */
function generateSummary(topicSlug, dateKey, displayName, alerts, clusters) {
  const topCluster = clusters[0]
  const topAlert = alerts[0]

  // Headline — prefer cluster label, fall back to top alert headline.
  const headline = topCluster
    ? `${displayName}: ${topCluster.cluster_label}`
    : topAlert?.headline ?? `${displayName} Daily Summary — ${dateKey}`

  // Overview — combine cluster summary texts or alert summaries.
  const overviewParts = clusters.length > 0
    ? clusters.map((c) => c.summary_text).filter(Boolean)
    : alerts.slice(0, 3).map((a) => a.summary_text).filter(Boolean)
  const overview = overviewParts.length > 0
    ? overviewParts.join(' ')
    : `No significant alerts were recorded for ${displayName} on ${dateKey}.`

  // Key events — one entry per alert (up to 7).
  const key_events = alerts.slice(0, 7).map((a) => ({
    title: a.headline,
    significance: a.summary_text ?? `Reported by ${a.source_name ?? 'an external source'}.`,
    importance_score: a.importance_score ?? 50,
    sources: a.source_name
      ? [{ source_name: a.source_name, source_url: a.source_url ?? null, source_role: 'primary' }]
      : null
  }))

  // Scores.
  const avgImportance = alerts.length > 0
    ? Math.round(alerts.reduce((s, a) => s + (a.importance_score ?? 0), 0) / alerts.length)
    : 0
  const sentiment = deriveSentiment(avgImportance, alerts)

  // Article-level sources — deduplicated from alert sources.
  const seenSourceNames = new Set()
  const sources = alerts
    .filter((a) => a.source_name)
    .reduce((acc, a) => {
      if (!seenSourceNames.has(a.source_name)) {
        seenSourceNames.add(a.source_name)
        acc.push({ source_name: a.source_name, source_url: a.source_url ?? null, source_role: 'primary' })
      }
      return acc
    }, [])

  // Source confidence note.
  const sourceCount = sources.length
  const source_confidence_note = sourceCount === 0
    ? null
    : sourceCount === 1
      ? 'Limited confidence: summary based on a single source.'
      : `Moderate confidence: summary draws from ${sourceCount} sources.`

  return {
    topic_slug: topicSlug,
    date_key: dateKey,
    headline,
    overview,
    key_events,
    market_context: null,
    sentiment,
    topic_score: avgImportance,
    sources: sources.length > 0 ? sources : null,
    source_confidence_note,
    generated_at: new Date().toISOString()
  }
}

// ---------------------------------------------------------------------------
// Article generation
//
// Produces a Markdown article from the structured summary.
// In production this is a separate AI prompt step; locally we template it.
// ---------------------------------------------------------------------------

/**
 * Format YYYY-MM-DD as a human-readable date string.
 *
 * @param {string} dateKey
 * @returns {string}
 */
function formatDate(dateKey) {
  const [year, month, day] = dateKey.split('-')
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]
  return `${months[parseInt(month, 10) - 1]} ${parseInt(day, 10)}, ${year}`
}

/**
 * Generate a Markdown article from a structured summary.
 *
 * @param {string} displayName
 * @param {string} dateKey
 * @param {Object} summary
 * @returns {string}
 */
function generateArticle(displayName, dateKey, summary) {
  const formattedDate = formatDate(dateKey)

  const keyEventsSection = summary.key_events
    .map((e, i) => `### ${i + 1}. ${e.title}\n\n${e.significance}`)
    .join('\n\n')

  const sentimentLabel = {
    bullish: '🟢 Bullish',
    bearish: '🔴 Bearish',
    neutral: '⚪ Neutral',
    mixed: '🟡 Mixed'
  }[summary.sentiment] ?? summary.sentiment

  return `# ${displayName} — ${formattedDate}

## ${summary.headline}

${summary.overview}

## Key Events

${keyEventsSection}

## Daily Sentiment

**${sentimentLabel}** — Topic score: ${summary.topic_score}/100
`.trimEnd() + '\n'
}

// ---------------------------------------------------------------------------
// Content file writer
// ---------------------------------------------------------------------------

/**
 * Write a topic/day content package to content/topics/{topicSlug}/{dateKey}/.
 *
 * @param {string} topicSlug
 * @param {string} dateKey
 * @param {Object} summary - structured summary object
 * @param {string} articleMd - article markdown
 */
function writeContentFiles(topicSlug, dateKey, summary, articleMd) {
  const dir = join(REPO_ROOT, 'content', 'topics', topicSlug, dateKey)
  mkdirSync(dir, { recursive: true })

  // summary.json — structured daily summary
  writeFileSync(
    join(dir, 'summary.json'),
    JSON.stringify(summary, null, 2) + '\n',
    'utf8'
  )
  console.log(`  ✔  Written: content/topics/${topicSlug}/${dateKey}/summary.json`)

  // article.md — full Markdown article
  writeFileSync(join(dir, 'article.md'), articleMd, 'utf8')
  console.log(`  ✔  Written: content/topics/${topicSlug}/${dateKey}/article.md`)

  // metadata.json — publish metadata
  const metadata = {
    topic_slug: topicSlug,
    date_key: dateKey,
    page_state: 'ready',
    generated_at: new Date().toISOString(),
    article_path: `topics/${topicSlug}/${dateKey}/article.md`,
    summary_path: `topics/${topicSlug}/${dateKey}/summary.json`,
    video_path: null
  }
  writeFileSync(
    join(dir, 'metadata.json'),
    JSON.stringify(metadata, null, 2) + '\n',
    'utf8'
  )
  console.log(`  ✔  Written: content/topics/${topicSlug}/${dateKey}/metadata.json`)
}

// ---------------------------------------------------------------------------
// D1 state update
// ---------------------------------------------------------------------------

/**
 * Update the daily_status row for the given topic/date to reflect that
 * summary and article content is now available.
 *
 * Uses INSERT ... ON CONFLICT(topic_slug, date_key) DO UPDATE so the
 * operation is safe whether or not a row already exists.
 *
 * @param {string} topicSlug
 * @param {string} dateKey
 * @param {number} alertCount
 * @param {number} clusterCount
 */
function updateDailyStatus(topicSlug, dateKey, alertCount, clusterCount) {
  const now = new Date().toISOString()
  d1Execute(
    `INSERT INTO daily_status
       (topic_slug, date_key, page_state,
        alert_count, cluster_count,
        summary_available, video_available, article_available,
        published_at, updated_at)
     VALUES
       ('${topicSlug}', '${dateKey}', 'ready',
        ${alertCount}, ${clusterCount},
        1, 0, 1,
        NULL, '${now}')
     ON CONFLICT(topic_slug, date_key) DO UPDATE SET
       page_state        = 'ready',
       summary_available = 1,
       article_available = 1,
       alert_count       = ${alertCount},
       cluster_count     = ${clusterCount},
       updated_at        = '${now}'`
  )
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv)
  validateArgs(args)

  const { topic: topicSlug, date: dateKey } = args

  console.log('')
  console.log('======================================================')
  console.log('  Modern Content Platform — Local Summary Generation  ')
  console.log('======================================================')
  console.log(`  Topic : ${topicSlug}`)
  console.log(`  Date  : ${dateKey}`)
  console.log('')

  // ── Step 1: Load topic metadata ──────────────────────────────────────────
  console.log('Step 1/5  Loading topic metadata from D1…')
  let topic
  try {
    topic = loadTopic(topicSlug)
  } catch (err) {
    console.error(`\nFailed to load topic data.\n${err.message}`)
    console.error('\nMake sure local D1 is initialised: bash scripts/local-reset.sh')
    process.exit(1)
  }
  if (!topic) {
    console.error(`\nTopic "${topicSlug}" not found in local D1.`)
    console.error('Available topics: crypto, finance, economy, health, ai, energy, technology')
    console.error('Run scripts/local-reset.sh to seed the topics table.')
    process.exit(1)
  }
  console.log(`          Topic: ${topic.display_name}`)

  // ── Step 2: Load alerts and clusters ─────────────────────────────────────
  console.log('')
  console.log('Step 2/5  Loading alerts and clusters from D1…')
  let alerts, clusters
  try {
    alerts = loadAlerts(topicSlug, dateKey)
    clusters = loadClusters(topicSlug, dateKey)
  } catch (err) {
    console.error(`\nFailed to load alert data.\n${err.message}`)
    process.exit(1)
  }
  console.log(`          Alerts  : ${alerts.length}`)
  console.log(`          Clusters: ${clusters.length}`)

  if (alerts.length === 0) {
    console.warn('\nWarning: no active alerts found for this topic/date.')
    console.warn('The generated summary will be minimal. Seed alerts first:')
    console.warn('  bash scripts/local-reset.sh')
  }

  // ── Step 3: Generate summary and article ─────────────────────────────────
  console.log('')
  console.log('Step 3/5  Generating summary and article…')
  const summary = generateSummary(topicSlug, dateKey, topic.display_name, alerts, clusters)
  const articleMd = generateArticle(topic.display_name, dateKey, summary)
  console.log(`          Headline  : ${summary.headline}`)
  console.log(`          Sentiment : ${summary.sentiment}`)
  console.log(`          Score     : ${summary.topic_score}/100`)
  console.log(`          Key events: ${summary.key_events.length}`)

  // ── Step 4: Write content files ───────────────────────────────────────────
  console.log('')
  console.log('Step 4/5  Writing content files…')
  try {
    writeContentFiles(topicSlug, dateKey, summary, articleMd)
  } catch (err) {
    console.error(`\nFailed to write content files.\n${err.message}`)
    process.exit(1)
  }

  // ── Step 5: Update D1 daily_status ───────────────────────────────────────
  console.log('')
  console.log('Step 5/5  Updating daily_status in local D1…')
  try {
    updateDailyStatus(topicSlug, dateKey, alerts.length, clusters.length)
    console.log(`          daily_status updated: page_state=ready, article_available=1, summary_available=1`)
  } catch (err) {
    console.error(`\nFailed to update D1 daily_status.\n${err.message}`)
    process.exit(1)
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  console.log('')
  console.log('Done. Summary generation complete.')
  console.log('')
  console.log('Frontend transition:')
  console.log(`  Before: SummaryPlaceholder (placeholder state)`)
  console.log(`  After:  SummarySection with article content (ready state)`)
  console.log('')
  console.log('To verify locally:')
  console.log('  1. Start the local dev server: cd app && npm run dev')
  console.log(`  2. Open: http://localhost:5173/topics/${topicSlug}/${dateKey}`)
  console.log('  3. The page should display the generated article and a "Summary ready" banner.')
  console.log('')
  console.log('To verify the D1 update:')
  console.log(`  npx wrangler d1 execute ${DB_NAME} --local \\`)
  console.log(`    --command "SELECT page_state, summary_available, article_available FROM daily_status WHERE topic_slug='${topicSlug}' AND date_key='${dateKey}'"`)
  console.log('')
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
