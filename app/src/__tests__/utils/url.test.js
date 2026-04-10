/**
 * Unit tests — utils/url.js
 *
 * Validates the isSafeUrl helper used across components.
 */
import { describe, it, expect } from 'vitest'
import { isSafeUrl } from '@/utils/url.js'

describe('isSafeUrl', () => {
  it('returns true for an https URL', () => {
    expect(isSafeUrl('https://example.com')).toBe(true)
  })

  it('returns true for an http URL', () => {
    expect(isSafeUrl('http://example.com')).toBe(true)
  })

  it('returns false for a javascript: URL', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false)
  })

  it('returns false for a data: URL', () => {
    expect(isSafeUrl('data:text/html,<h1>hi</h1>')).toBe(false)
  })

  it('returns false for null', () => {
    expect(isSafeUrl(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isSafeUrl(undefined)).toBe(false)
  })

  it('returns false for an empty string', () => {
    expect(isSafeUrl('')).toBe(false)
  })

  it('returns false for a non-string value', () => {
    expect(isSafeUrl(42)).toBe(false)
  })

  it('returns false for a malformed URL', () => {
    expect(isSafeUrl('not-a-url')).toBe(false)
  })
})
