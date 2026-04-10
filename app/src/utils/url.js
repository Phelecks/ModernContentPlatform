/**
 * Only allow http: and https: URLs to be rendered as links.
 * Rejects javascript:, data:, and other potentially unsafe schemes.
 * @param {string|null} url
 * @returns {boolean}
 */
export function isSafeUrl(url) {
  if (!url || typeof url !== 'string') return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}
