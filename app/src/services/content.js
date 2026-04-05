/**
 * Content service — loads GitHub-backed editorial content files.
 *
 * Final editorial content is served as static files from the `content/` directory
 * deployed alongside the Vue app via Cloudflare Pages.
 *
 * File paths follow the convention:
 *   /content/topics/{topicSlug}/{dateKey}/summary.json
 *   /content/topics/{topicSlug}/{dateKey}/metadata.json
 *   /content/topics/{topicSlug}/{dateKey}/video.json
 *   /content/topics/{topicSlug}/{dateKey}/article.md
 */

const CONTENT_BASE = '/content/topics'

async function getFile(path) {
  const res = await fetch(path)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Content error ${res.status} for ${path}`)
  return res
}

/**
 * Load the structured daily summary for a topic/day.
 * @param {string} topicSlug
 * @param {string} dateKey - YYYY-MM-DD
 * @returns {Promise<Object|null>} Parsed summary.json or null if not published yet
 */
export async function fetchSummary(topicSlug, dateKey) {
  const res = await getFile(`${CONTENT_BASE}/${topicSlug}/${dateKey}/summary.json`)
  if (!res) return null
  return res.json()
}

/**
 * Load the final article markdown text for a topic/day.
 * @param {string} topicSlug
 * @param {string} dateKey - YYYY-MM-DD
 * @returns {Promise<string|null>} Raw markdown string or null if not published yet
 */
export async function fetchArticle(topicSlug, dateKey) {
  const res = await getFile(`${CONTENT_BASE}/${topicSlug}/${dateKey}/article.md`)
  if (!res) return null
  return res.text()
}

/**
 * Load YouTube video metadata for a topic/day.
 * @param {string} topicSlug
 * @param {string} dateKey - YYYY-MM-DD
 * @returns {Promise<{video_id, title, published_at}|null>}
 */
export async function fetchVideoMeta(topicSlug, dateKey) {
  const res = await getFile(`${CONTENT_BASE}/${topicSlug}/${dateKey}/video.json`)
  if (!res) return null
  return res.json()
}

/**
 * Load publish metadata for a topic/day.
 * @param {string} topicSlug
 * @param {string} dateKey - YYYY-MM-DD
 * @returns {Promise<Object|null>}
 */
export async function fetchMetadata(topicSlug, dateKey) {
  const res = await getFile(`${CONTENT_BASE}/${topicSlug}/${dateKey}/metadata.json`)
  if (!res) return null
  return res.json()
}
