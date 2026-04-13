/**
 * Unit tests — app/src/utils/sourceConfig.js
 *
 * Validates config parsing and validation for source-provider toggle flags.
 *
 * Covers:
 *   - parseProviderFlag  — all input types and edge cases
 *   - parseProviderConfig — all valid modes (x_only, newsapi_only, hybrid)
 *   - parseProviderConfig — missing API key errors
 *   - parseProviderConfig — no-provider-enabled error
 *   - parseProviderConfig — invalid / missing input
 */
import { describe, it, expect } from 'vitest'
import {
  MODE_HYBRID,
  MODE_X_ONLY,
  MODE_NEWSAPI_ONLY,
  parseProviderFlag,
  parseProviderConfig
} from '@/utils/sourceConfig.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('sourceConfig — mode constants', () => {
  it('MODE_HYBRID is "hybrid"', () => {
    expect(MODE_HYBRID).toBe('hybrid')
  })

  it('MODE_X_ONLY is "x_only"', () => {
    expect(MODE_X_ONLY).toBe('x_only')
  })

  it('MODE_NEWSAPI_ONLY is "newsapi_only"', () => {
    expect(MODE_NEWSAPI_ONLY).toBe('newsapi_only')
  })
})

// ---------------------------------------------------------------------------
// parseProviderFlag
// ---------------------------------------------------------------------------

describe('parseProviderFlag', () => {
  it('returns true for boolean true', () => {
    expect(parseProviderFlag(true)).toBe(true)
  })

  it('returns false for boolean false', () => {
    expect(parseProviderFlag(false)).toBe(false)
  })

  it('returns true for string "true"', () => {
    expect(parseProviderFlag('true')).toBe(true)
  })

  it('returns true for string "TRUE" (case-insensitive)', () => {
    expect(parseProviderFlag('TRUE')).toBe(true)
  })

  it('returns true for string "True"', () => {
    expect(parseProviderFlag('True')).toBe(true)
  })

  it('returns false for string "false"', () => {
    expect(parseProviderFlag('false')).toBe(false)
  })

  it('returns false for string "FALSE"', () => {
    expect(parseProviderFlag('FALSE')).toBe(false)
  })

  it('returns false for string "0"', () => {
    expect(parseProviderFlag('0')).toBe(false)
  })

  it('returns false for string "1"', () => {
    expect(parseProviderFlag('1')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(parseProviderFlag('')).toBe(false)
  })

  it('returns false for string with only whitespace', () => {
    expect(parseProviderFlag('   ')).toBe(false)
  })

  it('returns true for "  true  " (trimmed)', () => {
    expect(parseProviderFlag('  true  ')).toBe(true)
  })

  it('returns false for null', () => {
    expect(parseProviderFlag(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(parseProviderFlag(undefined)).toBe(false)
  })

  it('returns false for a number', () => {
    expect(parseProviderFlag(1)).toBe(false)
  })

  it('returns false for an object', () => {
    expect(parseProviderFlag({})).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// parseProviderConfig — x_only mode
// ---------------------------------------------------------------------------

describe('parseProviderConfig — x_only mode', () => {
  const validEnv = {
    ENABLE_X: 'true',
    ENABLE_NEWSAPI: 'false',
    X_BEARER_TOKEN: 'token-abc123'
  }

  it('returns mode "x_only" when only X is enabled', () => {
    const { mode } = parseProviderConfig(validEnv)
    expect(mode).toBe('x_only')
  })

  it('returns enableX=true', () => {
    const { enableX } = parseProviderConfig(validEnv)
    expect(enableX).toBe(true)
  })

  it('returns enableNewsapi=false', () => {
    const { enableNewsapi } = parseProviderConfig(validEnv)
    expect(enableNewsapi).toBe(false)
  })

  it('works when ENABLE_NEWSAPI is omitted entirely', () => {
    const { mode, enableX, enableNewsapi } = parseProviderConfig({
      ENABLE_X: 'true',
      X_BEARER_TOKEN: 'token-abc'
    })
    expect(mode).toBe('x_only')
    expect(enableX).toBe(true)
    expect(enableNewsapi).toBe(false)
  })

  it('works with boolean true for ENABLE_X', () => {
    const { mode } = parseProviderConfig({
      ENABLE_X: true,
      X_BEARER_TOKEN: 'token-abc'
    })
    expect(mode).toBe('x_only')
  })
})

// ---------------------------------------------------------------------------
// parseProviderConfig — newsapi_only mode
// ---------------------------------------------------------------------------

describe('parseProviderConfig — newsapi_only mode', () => {
  const validEnv = {
    ENABLE_X: 'false',
    ENABLE_NEWSAPI: 'true',
    NEWS_API_KEY: 'newskey-xyz'
  }

  it('returns mode "newsapi_only" when only NewsAPI is enabled', () => {
    const { mode } = parseProviderConfig(validEnv)
    expect(mode).toBe('newsapi_only')
  })

  it('returns enableX=false', () => {
    const { enableX } = parseProviderConfig(validEnv)
    expect(enableX).toBe(false)
  })

  it('returns enableNewsapi=true', () => {
    const { enableNewsapi } = parseProviderConfig(validEnv)
    expect(enableNewsapi).toBe(true)
  })

  it('works when ENABLE_X is omitted entirely', () => {
    const { mode } = parseProviderConfig({
      ENABLE_NEWSAPI: 'true',
      NEWS_API_KEY: 'key-abc'
    })
    expect(mode).toBe('newsapi_only')
  })

  it('works with boolean true for ENABLE_NEWSAPI', () => {
    const { mode } = parseProviderConfig({
      ENABLE_NEWSAPI: true,
      NEWS_API_KEY: 'key-abc'
    })
    expect(mode).toBe('newsapi_only')
  })
})

// ---------------------------------------------------------------------------
// parseProviderConfig — hybrid mode
// ---------------------------------------------------------------------------

describe('parseProviderConfig — hybrid mode', () => {
  const validEnv = {
    ENABLE_X: 'true',
    ENABLE_NEWSAPI: 'true',
    X_BEARER_TOKEN: 'token-abc123',
    NEWS_API_KEY: 'newskey-xyz'
  }

  it('returns mode "hybrid" when both providers are enabled', () => {
    const { mode } = parseProviderConfig(validEnv)
    expect(mode).toBe('hybrid')
  })

  it('returns enableX=true', () => {
    const { enableX } = parseProviderConfig(validEnv)
    expect(enableX).toBe(true)
  })

  it('returns enableNewsapi=true', () => {
    const { enableNewsapi } = parseProviderConfig(validEnv)
    expect(enableNewsapi).toBe(true)
  })

  it('works with boolean true for both flags', () => {
    const { mode } = parseProviderConfig({
      ENABLE_X: true,
      ENABLE_NEWSAPI: true,
      X_BEARER_TOKEN: 'tok',
      NEWS_API_KEY: 'key'
    })
    expect(mode).toBe('hybrid')
  })
})

// ---------------------------------------------------------------------------
// parseProviderConfig — no provider enabled (invalid)
// ---------------------------------------------------------------------------

describe('parseProviderConfig — no provider enabled', () => {
  it('throws when both flags are false', () => {
    expect(() =>
      parseProviderConfig({ ENABLE_X: 'false', ENABLE_NEWSAPI: 'false' })
    ).toThrow('PROVIDER_CONFIG_ERROR')
  })

  it('throws when both flags are omitted', () => {
    expect(() => parseProviderConfig({})).toThrow('PROVIDER_CONFIG_ERROR')
  })

  it('throws when called with no arguments', () => {
    expect(() => parseProviderConfig()).toThrow('PROVIDER_CONFIG_ERROR')
  })

  it('error message mentions ENABLE_X', () => {
    expect(() => parseProviderConfig({})).toThrow(/ENABLE_X/)
  })

  it('error message mentions ENABLE_NEWSAPI', () => {
    expect(() => parseProviderConfig({})).toThrow(/ENABLE_NEWSAPI/)
  })
})

// ---------------------------------------------------------------------------
// parseProviderConfig — missing API keys (invalid)
// ---------------------------------------------------------------------------

describe('parseProviderConfig — missing X_BEARER_TOKEN', () => {
  it('throws when ENABLE_X=true and X_BEARER_TOKEN is absent', () => {
    expect(() =>
      parseProviderConfig({ ENABLE_X: 'true' })
    ).toThrow('PROVIDER_CONFIG_ERROR')
  })

  it('throws when ENABLE_X=true and X_BEARER_TOKEN is empty string', () => {
    expect(() =>
      parseProviderConfig({ ENABLE_X: 'true', X_BEARER_TOKEN: '' })
    ).toThrow('PROVIDER_CONFIG_ERROR')
  })

  it('error message names X_BEARER_TOKEN', () => {
    expect(() =>
      parseProviderConfig({ ENABLE_X: 'true' })
    ).toThrow(/X_BEARER_TOKEN/)
  })
})

describe('parseProviderConfig — missing NEWS_API_KEY', () => {
  it('throws when ENABLE_NEWSAPI=true and NEWS_API_KEY is absent', () => {
    expect(() =>
      parseProviderConfig({ ENABLE_NEWSAPI: 'true' })
    ).toThrow('PROVIDER_CONFIG_ERROR')
  })

  it('throws when ENABLE_NEWSAPI=true and NEWS_API_KEY is empty string', () => {
    expect(() =>
      parseProviderConfig({ ENABLE_NEWSAPI: 'true', NEWS_API_KEY: '' })
    ).toThrow('PROVIDER_CONFIG_ERROR')
  })

  it('error message names NEWS_API_KEY', () => {
    expect(() =>
      parseProviderConfig({ ENABLE_NEWSAPI: 'true' })
    ).toThrow(/NEWS_API_KEY/)
  })
})

describe('parseProviderConfig — both API keys missing in hybrid', () => {
  it('throws when both providers are enabled but both keys are missing', () => {
    expect(() =>
      parseProviderConfig({ ENABLE_X: 'true', ENABLE_NEWSAPI: 'true' })
    ).toThrow('PROVIDER_CONFIG_ERROR')
  })

  it('error message mentions X_BEARER_TOKEN when X key is missing', () => {
    expect(() =>
      parseProviderConfig({ ENABLE_X: 'true', ENABLE_NEWSAPI: 'true' })
    ).toThrow(/X_BEARER_TOKEN/)
  })

  it('error message mentions NEWS_API_KEY when NewsAPI key is missing', () => {
    expect(() =>
      parseProviderConfig({ ENABLE_X: 'true', ENABLE_NEWSAPI: 'true' })
    ).toThrow(/NEWS_API_KEY/)
  })
})

// ---------------------------------------------------------------------------
// parseProviderConfig — does not require keys for disabled providers
// ---------------------------------------------------------------------------

describe('parseProviderConfig — keys only required for enabled providers', () => {
  it('does not require X_BEARER_TOKEN when ENABLE_X=false', () => {
    expect(() =>
      parseProviderConfig({ ENABLE_NEWSAPI: 'true', NEWS_API_KEY: 'key' })
    ).not.toThrow()
  })

  it('does not require NEWS_API_KEY when ENABLE_NEWSAPI=false', () => {
    expect(() =>
      parseProviderConfig({ ENABLE_X: 'true', X_BEARER_TOKEN: 'tok' })
    ).not.toThrow()
  })
})
