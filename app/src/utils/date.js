/**
 * Date utility helpers.
 * All functions operate on YYYY-MM-DD date key strings used throughout the platform.
 */

/**
 * Format a YYYY-MM-DD date key for display (e.g. "April 5, 2026").
 * @param {string} dateKey - YYYY-MM-DD
 * @returns {string}
 */
export function formatDateKey(dateKey) {
  if (!dateKey) return ''
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC'
  })
}

/**
 * Return today's date as a YYYY-MM-DD key.
 * @returns {string}
 */
export function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Return true if the given date key is today.
 * @param {string} dateKey - YYYY-MM-DD
 * @returns {boolean}
 */
export function isToday(dateKey) {
  return dateKey === todayKey()
}

/**
 * Format an ISO-8601 timestamp for display (e.g. "2:34 PM").
 * @param {string} isoTimestamp
 * @returns {string}
 */
export function formatTime(isoTimestamp) {
  if (!isoTimestamp) return ''
  return new Date(isoTimestamp).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
}

/**
 * Format an ISO-8601 timestamp as a relative label like "3 minutes ago".
 * @param {string} isoTimestamp
 * @returns {string}
 */
export function timeAgo(isoTimestamp) {
  if (!isoTimestamp) return ''
  const diffMs = Date.now() - new Date(isoTimestamp).getTime()
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
