import { describe, it, expect, vi, afterEach } from 'vitest'
import { formatDateKey, todayKey, isToday, formatTime, timeAgo } from '@/utils/date.js'

describe('formatDateKey', () => {
  it('formats a YYYY-MM-DD key as a human-readable date', () => {
    expect(formatDateKey('2025-01-15')).toBe('January 15, 2025')
  })

  it('handles month and day padding correctly', () => {
    expect(formatDateKey('2026-04-06')).toBe('April 6, 2026')
  })

  it('returns an empty string for a falsy value', () => {
    expect(formatDateKey('')).toBe('')
    expect(formatDateKey(null)).toBe('')
    expect(formatDateKey(undefined)).toBe('')
  })
})

describe('todayKey', () => {
  it('returns a YYYY-MM-DD formatted string', () => {
    expect(todayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('isToday', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns true when the date key matches today', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-06T12:00:00Z'))
    expect(isToday('2026-04-06')).toBe(true)
  })

  it('returns false when the date key does not match today', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-06T12:00:00Z'))
    expect(isToday('2025-01-15')).toBe(false)
  })
})

describe('formatTime', () => {
  it('returns an empty string for a falsy value', () => {
    expect(formatTime('')).toBe('')
    expect(formatTime(null)).toBe('')
    expect(formatTime(undefined)).toBe('')
  })

  it('returns a non-empty time string for a valid ISO timestamp', () => {
    const result = formatTime('2026-04-06T14:34:00Z')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })
})

describe('timeAgo', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns an empty string for a falsy value', () => {
    expect(timeAgo('')).toBe('')
    expect(timeAgo(null)).toBe('')
    expect(timeAgo(undefined)).toBe('')
  })

  it('returns "just now" for timestamps less than a minute ago', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-06T12:00:30Z'))
    expect(timeAgo('2026-04-06T12:00:00Z')).toBe('just now')
  })

  it('returns minutes ago for timestamps within an hour', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-06T12:03:00Z'))
    expect(timeAgo('2026-04-06T12:00:00Z')).toBe('3m ago')
  })

  it('returns hours ago for timestamps within a day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-06T14:00:00Z'))
    expect(timeAgo('2026-04-06T12:00:00Z')).toBe('2h ago')
  })

  it('returns days ago for timestamps older than a day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-08T12:00:00Z'))
    expect(timeAgo('2026-04-06T12:00:00Z')).toBe('2d ago')
  })
})
