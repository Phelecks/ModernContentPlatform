/**
 * Unit tests — app/src/utils/editorialQualityCheck.js
 *
 * Validates the editorial quality gate that runs after schema validation
 * (08_validate_outputs) and before GitHub publish (09_publish_to_github).
 *
 * Covers:
 *   - happy path (no blocks, no warnings)
 *   - missing source attribution → block
 *   - weak title (length + all-caps warning) → block / warning
 *   - weak overview → block / warning
 *   - low-information article (length + paragraph count) → block
 *   - inconsistent youtube metadata (title/description/topic mention) → block / warning
 *   - empty key_events → block; per-event missing sources → warning
 *   - overly confident unsupported language → block when no URLs / warning when sources have URLs
 *   - duplicate / sparse youtube tags → warning
 *   - tomorrow outlook + expectation alignment heuristics → warning
 *   - threshold overrides
 */

import { describe, it, expect } from 'vitest'
import {
  runEditorialQualityChecks,
  EDITORIAL_QUALITY_THRESHOLDS,
} from '../../utils/editorialQualityCheck.js'

const PARAGRAPH = 'Bitcoin posted a measured advance during the New York session as macro positioning shifted away from defensive trades. Order books on Coinbase deepened above $70k while perpetual funding stayed neutral, suggesting spot-led demand rather than leverage-driven momentum. Analysts at multiple desks framed the move as consolidation rather than breakout, citing limited follow-through above the prior swing high.'

function buildGoodCtx(overrides = {}) {
  const ctx = {
    topic_slug: 'crypto',
    date_key: '2026-05-07',
    summary: {
      headline: 'Crypto markets advance on steady spot demand and neutral funding',
      overview:
        'Bitcoin and large-cap altcoins traded higher on the day as spot order books deepened across major US venues. ' +
        'Funding rates remained neutral, suggesting the move was led by cash buyers rather than leveraged positioning. ' +
        'Macro flows continued to rotate out of defensive assets, reinforcing the constructive intraday tone across the sector. ' +
        'Desk commentary framed the session as orderly consolidation rather than a leverage-driven breakout, with limited follow-through above prior swing highs.',
      key_events: [
        {
          title: 'BTC breaks intraday range',
          summary: 'BTC pushed above the prior swing high on Coinbase spot.',
          sources: [
            { source_name: 'Coinbase', source_url: 'https://www.coinbase.com/markets/btc' },
          ],
        },
        {
          title: 'ETH spot ETFs see net inflows',
          summary: 'US-listed ETH spot ETFs reported aggregate net inflows.',
          sources: [
            { source_name: 'Bloomberg', source_url: 'https://www.bloomberg.com/news/sample' },
          ],
        },
      ],
      sources: [
        { source_name: 'Reuters', source_url: 'https://www.reuters.com/markets/sample' },
      ],
      sentiment: 'bullish',
      topic_score: 72,
    },
    article_md:
      '# Crypto markets advance on steady spot demand\n\n' +
      PARAGRAPH +
      '\n\n' +
      PARAGRAPH +
      '\n\n' +
      PARAGRAPH,
    expectation_check: {
      expectations_checked: [],
      surprise_events: [],
      alignment_score: 65,
    },
    tomorrow_outlook: {
      key_watchpoints: [{ topic: 'CPI release' }],
      outlook_summary:
        'Tomorrow brings the US CPI release, which is the dominant macro catalyst on the calendar and will likely set the directional tone across digital assets through the European session and into the New York open.',
      risk_level: 'medium',
    },
    video_script: {
      intro: 'Hello and welcome to the daily crypto wrap, brought to you by Modern Content Platform.',
      segments: [
        {
          heading: 'Markets',
          script: 'BTC ground higher through the session.',
          sources: [{ source_name: 'Coinbase' }],
        },
        {
          heading: 'Flows',
          script: 'ETH ETFs saw net inflows again.',
          sources: [{ source_name: 'Bloomberg' }],
        },
      ],
      outro: 'Thanks for watching — see you again tomorrow with another daily crypto briefing.',
    },
    youtube_metadata: {
      title: 'Crypto daily wrap: spot demand lifts BTC and ETH',
      description:
        'A concise daily briefing on crypto markets covering BTC price action, ETH ETF flows, ' +
        'and the macro setup heading into tomorrow’s CPI print. Includes source attribution and ' +
        'links to the underlying market data discussed in the video.',
      tags: ['crypto', 'bitcoin', 'btc', 'ethereum', 'eth', 'markets', 'daily', 'macro'],
    },
  }
  return { ...ctx, ...overrides }
}

describe('runEditorialQualityChecks — happy path', () => {
  it('returns no blocks and no warnings on a fully populated context', () => {
    const result = runEditorialQualityChecks(buildGoodCtx())
    expect(result.blocks).toEqual([])
    expect(result.warnings).toEqual([])
  })
})

describe('runEditorialQualityChecks — context guard', () => {
  it('blocks when ctx is missing or not an object', () => {
    expect(runEditorialQualityChecks(null).blocks.length).toBeGreaterThan(0)
    expect(runEditorialQualityChecks(undefined).blocks.length).toBeGreaterThan(0)
    expect(runEditorialQualityChecks('nope').blocks.length).toBeGreaterThan(0)
  })
})

describe('runEditorialQualityChecks — source attribution', () => {
  it('blocks when no named sources exist anywhere', () => {
    const ctx = buildGoodCtx()
    ctx.summary.sources = []
    ctx.summary.key_events.forEach((e) => (e.sources = []))
    ctx.video_script.segments.forEach((s) => (s.sources = []))
    const { blocks } = runEditorialQualityChecks(ctx)
    expect(blocks.some((b) => b.includes('missing source attribution'))).toBe(true)
  })

  it('warns when sources exist but none provide a URL', () => {
    const ctx = buildGoodCtx()
    ctx.summary.sources = [{ source_name: 'Reuters' }]
    ctx.summary.key_events.forEach((e) => {
      e.sources = [{ source_name: 'Bloomberg' }]
    })
    const { blocks, warnings } = runEditorialQualityChecks(ctx)
    expect(blocks).toEqual([])
    expect(warnings.some((w) => w.includes('no source_url'))).toBe(true)
  })

  it('warns when an individual key_event is missing sources', () => {
    const ctx = buildGoodCtx()
    ctx.summary.key_events[1].sources = []
    const { blocks, warnings } = runEditorialQualityChecks(ctx)
    expect(blocks).toEqual([])
    expect(warnings.some((w) => w.includes('summary.key_events[1] has no sources'))).toBe(true)
  })
})

describe('runEditorialQualityChecks — title and overview', () => {
  it('blocks on a short summary headline', () => {
    const ctx = buildGoodCtx()
    ctx.summary.headline = 'Short title'
    const { blocks } = runEditorialQualityChecks(ctx)
    expect(blocks.some((b) => b.includes('weak title') && b.includes('summary.headline'))).toBe(true)
  })

  it('warns on an all-uppercase headline', () => {
    const ctx = buildGoodCtx()
    ctx.summary.headline = 'CRYPTO MARKETS ADVANCE ON STEADY SPOT DEMAND'
    const { warnings } = runEditorialQualityChecks(ctx)
    expect(warnings.some((w) => w.includes('summary.headline is all uppercase'))).toBe(true)
  })

  it('blocks on a short overview', () => {
    const ctx = buildGoodCtx()
    ctx.summary.overview = 'Too short.'
    const { blocks } = runEditorialQualityChecks(ctx)
    expect(blocks.some((b) => b.includes('weak summary'))).toBe(true)
  })

  it('warns when overview is between block and warn thresholds', () => {
    const ctx = buildGoodCtx()
    // Length 250 is below WARN_OVERVIEW_CHARS (350) but above MIN_OVERVIEW_CHARS (200).
    ctx.summary.overview = 'a'.repeat(250)
    const { blocks, warnings } = runEditorialQualityChecks(ctx)
    expect(blocks).toEqual([])
    expect(warnings.some((w) => w.includes('summary.overview is short'))).toBe(true)
  })
})

describe('runEditorialQualityChecks — key events', () => {
  it('blocks when fewer than two key events are present', () => {
    const ctx = buildGoodCtx()
    ctx.summary.key_events = ctx.summary.key_events.slice(0, 1)
    const { blocks } = runEditorialQualityChecks(ctx)
    expect(blocks.some((b) => b.includes('summary.key_events fewer than'))).toBe(true)
  })
})

describe('runEditorialQualityChecks — article body', () => {
  it('blocks on a missing article', () => {
    const ctx = buildGoodCtx()
    ctx.article_md = ''
    const { blocks } = runEditorialQualityChecks(ctx)
    expect(blocks.some((b) => b.includes('article_md missing'))).toBe(true)
  })

  it('blocks on a too-short article', () => {
    const ctx = buildGoodCtx()
    ctx.article_md = '# Title\n\nShort.\n\nAlso short.\n\nStill short.'
    const { blocks } = runEditorialQualityChecks(ctx)
    expect(blocks.some((b) => b.includes('article_md shorter than'))).toBe(true)
  })

  it('blocks when article has fewer than required paragraphs', () => {
    const ctx = buildGoodCtx()
    ctx.article_md = '# Title\n\n' + PARAGRAPH + ' ' + PARAGRAPH
    const { blocks } = runEditorialQualityChecks(ctx)
    expect(blocks.some((b) => b.includes('fewer than') && b.includes('paragraphs'))).toBe(true)
  })

  it('warns when article is short but above the block threshold', () => {
    const ctx = buildGoodCtx()
    // Three paragraphs of moderate length: above 500 chars, below 800 chars.
    const p = 'a'.repeat(170)
    ctx.article_md = `# Title\n\n${p}\n\n${p}\n\n${p}`
    const { blocks, warnings } = runEditorialQualityChecks(ctx)
    expect(blocks).toEqual([])
    expect(warnings.some((w) => w.includes('article_md is short'))).toBe(true)
  })
})

describe('runEditorialQualityChecks — youtube metadata', () => {
  it('blocks when youtube_metadata is missing entirely', () => {
    const ctx = buildGoodCtx()
    delete ctx.youtube_metadata
    const { blocks } = runEditorialQualityChecks(ctx)
    expect(blocks.some((b) => b.includes('youtube_metadata missing'))).toBe(true)
  })

  it('blocks on a short youtube title and description', () => {
    const ctx = buildGoodCtx()
    ctx.youtube_metadata.title = 'short'
    ctx.youtube_metadata.description = 'too brief'
    const { blocks } = runEditorialQualityChecks(ctx)
    expect(blocks.some((b) => b.includes('youtube_metadata.title shorter'))).toBe(true)
    expect(blocks.some((b) => b.includes('youtube_metadata.description shorter'))).toBe(true)
  })

  it('warns when youtube title omits topic slug', () => {
    const ctx = buildGoodCtx()
    ctx.youtube_metadata.title = 'Daily wrap on the markets and macro setup ahead'
    const { warnings } = runEditorialQualityChecks(ctx)
    expect(warnings.some((w) => w.includes('does not reference topic_slug'))).toBe(true)
  })

  it('warns on duplicate or sparse tags', () => {
    const ctx = buildGoodCtx()
    ctx.youtube_metadata.tags = ['crypto', 'btc', 'BTC', 'eth']
    const { warnings } = runEditorialQualityChecks(ctx)
    expect(warnings.some((w) => w.includes('duplicates'))).toBe(true)
    expect(warnings.some((w) => w.includes('youtube_metadata.tags fewer than'))).toBe(true)
  })
})

describe('runEditorialQualityChecks — confidence heuristics', () => {
  it('warns on overly confident language when sources have URLs', () => {
    const ctx = buildGoodCtx()
    ctx.summary.overview =
      ctx.summary.overview + ' This trade is guaranteed to outperform the rest of the market.'
    const { blocks, warnings } = runEditorialQualityChecks(ctx)
    expect(blocks).toEqual([])
    expect(warnings.some((w) => w.includes('overly confident language detected'))).toBe(true)
  })

  it('blocks on overly confident language when no source URLs are provided', () => {
    const ctx = buildGoodCtx()
    ctx.summary.sources = [{ source_name: 'Reuters' }]
    ctx.summary.key_events.forEach((e) => {
      e.sources = [{ source_name: 'Bloomberg' }]
    })
    ctx.summary.overview =
      ctx.summary.overview + ' This is a sure thing — the trade cannot fail.'
    const { blocks } = runEditorialQualityChecks(ctx)
    expect(blocks.some((b) => b.includes('overly confident unsupported language'))).toBe(true)
  })

  it('warns on suspiciously absolute alignment_score', () => {
    const ctx = buildGoodCtx()
    ctx.expectation_check.alignment_score = 100
    const { warnings } = runEditorialQualityChecks(ctx)
    expect(warnings.some((w) => w.includes('alignment_score is suspiciously absolute'))).toBe(true)
  })
})

describe('runEditorialQualityChecks — tomorrow outlook depth', () => {
  it('warns on a thin outlook summary', () => {
    const ctx = buildGoodCtx()
    ctx.tomorrow_outlook.outlook_summary = 'Mixed setup tomorrow.'
    const { warnings } = runEditorialQualityChecks(ctx)
    expect(warnings.some((w) => w.includes('tomorrow_outlook.outlook_summary is short'))).toBe(true)
  })
})

describe('runEditorialQualityChecks — threshold overrides', () => {
  it('respects custom thresholds via options', () => {
    const ctx = buildGoodCtx()
    const { blocks } = runEditorialQualityChecks(ctx, {
      thresholds: { MIN_HEADLINE_CHARS: ctx.summary.headline.length + 10 },
    })
    expect(blocks.some((b) => b.includes('weak title'))).toBe(true)
  })

  it('exposes default thresholds as a frozen object', () => {
    expect(Object.isFrozen(EDITORIAL_QUALITY_THRESHOLDS)).toBe(true)
    expect(EDITORIAL_QUALITY_THRESHOLDS.MIN_ARTICLE_CHARS).toBeGreaterThan(0)
  })
})
