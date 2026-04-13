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
 *   - parseProviderConfig — fixture-driven tests (all provider-configs fixtures)
 */
import { describe, it, expect } from 'vitest'
import {
  MODE_HYBRID,
  MODE_X_ONLY,
  MODE_NEWSAPI_ONLY,
  parseProviderFlag,
  parseProviderConfig
} from '@/utils/sourceConfig.js'
import xOnlyFixture from '@fixtures/provider-configs/x-only.json'
import newsapiOnlyFixture from '@fixtures/provider-configs/newsapi-only.json'
import hybridFixture from '@fixtures/provider-configs/hybrid.json'
import xOnlyNewsapiKeyIgnoredFixture from '@fixtures/provider-configs/x-only-newsapi-key-ignored.json'
import invalidBothDisabledFixture from '@fixtures/provider-configs/invalid-both-disabled.json'
import invalidXMissingKeyFixture from '@fixtures/provider-configs/invalid-x-missing-key.json'
import invalidNewsapiMissingKeyFixture from '@fixtures/provider-configs/invalid-newsapi-missing-key.json'

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

  it('throws when ENABLE_X=true and X_BEARER_TOKEN is whitespace-only', () => {
    expect(() =>
      parseProviderConfig({ ENABLE_X: 'true', X_BEARER_TOKEN: '   ' })
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

  it('throws when ENABLE_NEWSAPI=true and NEWS_API_KEY is whitespace-only', () => {
    expect(() =>
      parseProviderConfig({ ENABLE_NEWSAPI: 'true', NEWS_API_KEY: '\t  ' })
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

// ---------------------------------------------------------------------------
// parseProviderConfig — fixture-driven tests
//
// Each fixture in fixtures/provider-configs/ carries an `env` object and an
// `expected` descriptor.  These tests import the canonical fixtures and
// validate them against parseProviderConfig, ensuring the fixtures stay in
// sync with the implementation and serve as living documentation.
// ---------------------------------------------------------------------------

/** Escapes all RegExp metacharacters in a plain string. */
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

describe('parseProviderConfig — fixture: x-only', () => {
  it('resolves to x_only mode', () => {
    const { mode } = parseProviderConfig(xOnlyFixture.env)
    expect(mode).toBe(xOnlyFixture.expected.mode)
  })

  it('returns enableX=true and enableNewsapi=false', () => {
    const { enableX, enableNewsapi } = parseProviderConfig(xOnlyFixture.env)
    expect(enableX).toBe(xOnlyFixture.expected.enableX)
    expect(enableNewsapi).toBe(xOnlyFixture.expected.enableNewsapi)
  })
})

describe('parseProviderConfig — fixture: newsapi-only', () => {
  it('resolves to newsapi_only mode', () => {
    const { mode } = parseProviderConfig(newsapiOnlyFixture.env)
    expect(mode).toBe(newsapiOnlyFixture.expected.mode)
  })

  it('returns enableX=false and enableNewsapi=true', () => {
    const { enableX, enableNewsapi } = parseProviderConfig(newsapiOnlyFixture.env)
    expect(enableX).toBe(newsapiOnlyFixture.expected.enableX)
    expect(enableNewsapi).toBe(newsapiOnlyFixture.expected.enableNewsapi)
  })
})

describe('parseProviderConfig — fixture: hybrid', () => {
  it('resolves to hybrid mode', () => {
    const { mode } = parseProviderConfig(hybridFixture.env)
    expect(mode).toBe(hybridFixture.expected.mode)
  })

  it('returns enableX=true and enableNewsapi=true', () => {
    const { enableX, enableNewsapi } = parseProviderConfig(hybridFixture.env)
    expect(enableX).toBe(hybridFixture.expected.enableX)
    expect(enableNewsapi).toBe(hybridFixture.expected.enableNewsapi)
  })
})

describe('parseProviderConfig — fixture: x-only-newsapi-key-ignored', () => {
  it('resolves to x_only mode even when a NewsAPI key is present in env', () => {
    const { mode } = parseProviderConfig(xOnlyNewsapiKeyIgnoredFixture.env)
    expect(mode).toBe(xOnlyNewsapiKeyIgnoredFixture.expected.mode)
  })

  it('does not enable NewsAPI when ENABLE_NEWSAPI=false regardless of key presence', () => {
    const { enableNewsapi } = parseProviderConfig(xOnlyNewsapiKeyIgnoredFixture.env)
    expect(enableNewsapi).toBe(xOnlyNewsapiKeyIgnoredFixture.expected.enableNewsapi)
  })
})

describe('parseProviderConfig — fixture: invalid-both-disabled', () => {
  it('throws PROVIDER_CONFIG_ERROR when both providers are disabled', () => {
    expect(() => parseProviderConfig(invalidBothDisabledFixture.env))
      .toThrow(invalidBothDisabledFixture.expected.error)
  })

  it('error message matches expected pattern', () => {
    expect(() => parseProviderConfig(invalidBothDisabledFixture.env))
      .toThrow(new RegExp(invalidBothDisabledFixture.expected.errorPattern))
  })
})

describe('parseProviderConfig — fixture: invalid-x-missing-key', () => {
  it('throws PROVIDER_CONFIG_ERROR when X is enabled but X_BEARER_TOKEN is absent', () => {
    expect(() => parseProviderConfig(invalidXMissingKeyFixture.env))
      .toThrow(invalidXMissingKeyFixture.expected.error)
  })

  it('error message matches expected pattern', () => {
    expect(() => parseProviderConfig(invalidXMissingKeyFixture.env))
      .toThrow(new RegExp(escapeRegExp(invalidXMissingKeyFixture.expected.errorPattern)))
  })
})

describe('parseProviderConfig — fixture: invalid-newsapi-missing-key', () => {
  it('throws PROVIDER_CONFIG_ERROR when NewsAPI is enabled but NEWS_API_KEY is absent', () => {
    expect(() => parseProviderConfig(invalidNewsapiMissingKeyFixture.env))
      .toThrow(invalidNewsapiMissingKeyFixture.expected.error)
  })

  it('error message matches expected pattern', () => {
    expect(() => parseProviderConfig(invalidNewsapiMissingKeyFixture.env))
      .toThrow(new RegExp(escapeRegExp(invalidNewsapiMissingKeyFixture.expected.errorPattern)))
  })
})
