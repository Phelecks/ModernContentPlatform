/**
 * Lightweight in-memory D1 mock for integration testing.
 *
 * Supports the SQL subset used in the platform's Pages Functions:
 *   - SELECT <column list> from a single table with WHERE, ORDER BY, LIMIT
 *   - SELECT COUNT(*) AS alias
 *   - Two-table LEFT JOIN (topics + daily_status pattern in day-status handler)
 *   - Positional ? parameter binding
 *
 * Column projection: returned rows contain only the columns listed in SELECT,
 * mirroring real D1 behavior so missing field bugs are caught in tests.
 *
 * Unsupported SQL patterns throw immediately so tests fail with a clear message
 * rather than silently passing with wrong data.
 *
 * Seed data mirrors db/seeds/topics.sql and db/seeds/sample_alerts.sql.
 */

// ---- SQL clause extractors ----

function extractTable(sql) {
  const m = sql.match(/\bFROM\s+(\w+)/i)
  return m ? m[1].toLowerCase() : null
}

function extractWhere(sql) {
  const m = sql.match(/\bWHERE\s+(.+?)(?=\s+ORDER\s+BY|\s+LIMIT\b|\s*$)/is)
  return m ? m[1].trim() : null
}

function extractOrderBy(sql) {
  const m = sql.match(/\bORDER\s+BY\s+(.+?)(?=\s+LIMIT\b|\s*$)/is)
  return m ? m[1].trim() : null
}

function extractLimit(sql) {
  const m = sql.match(/\bLIMIT\s+(\?|\d+)/i)
  return m ? m[1] : null
}

function extractCountAlias(sql) {
  const m = sql.match(/\bSELECT\s+COUNT\(\*\)\s+(?:AS\s+)?(\w+)/i)
  return m ? m[1] : null
}

// ---- WHERE condition parser ----

/**
 * Parse a WHERE clause into typed conditions, consuming ? params in left-to-right order.
 * Supports: col = ?, col = 'str', col = N, col < ?, col > ?
 * Table-qualified names (t.col, ds.col) are simplified to the bare column name.
 * @returns {{ conditions: Array<{col,op,val}>, paramCount: number }}
 */
function parseConditions(whereClause, params) {
  let pi = 0
  const parts = whereClause.split(/\bAND\b/i)
  const conditions = parts.map((part) => {
    part = part.trim()
    const m = part.match(/^([\w.]+)\s*(=|!=|<|>)\s*(\?|'[^']*'|-?\d+(?:\.\d+)?)$/)
    if (!m) {
      throw new Error(`MockD1: unsupported WHERE condition: "${part}"`)
    }
    const col = m[1].includes('.') ? m[1].split('.').pop() : m[1]
    const op = m[2]
    let val
    if (m[3] === '?') {
      val = params[pi++]
    } else if (m[3].startsWith("'")) {
      val = m[3].slice(1, -1)
    } else {
      val = Number(m[3])
    }
    return { col, op, val }
  })
  return { conditions, paramCount: pi }
}

function applyConditions(rows, conditions) {
  return rows.filter((row) =>
    conditions.every(({ col, op, val }) => {
      const rv = row[col]
      switch (op) {
        case '=': return String(rv) === String(val)
        case '!=': return String(rv) !== String(val)
        case '<': return rv < val
        case '>': return rv > val
        default: return true
      }
    })
  )
}

// ---- SELECT column projection ----

/**
 * Parse the SELECT column list (the text between SELECT and FROM) into an array
 * of descriptors, each with:
 *   { sourceCol: string|null, alias: string, literal?: number }
 *
 * Returns null to signal "return full rows" when SELECT * or an unrecognized
 * expression is encountered.
 *
 * Skips:
 *   - COUNT(*) — handled upstream by extractCountAlias
 *   - `? AS alias` — used in the JOIN handler, projection is done by _runJoin
 *   - `COALESCE(…) AS alias` — same as above
 */
function extractSelectColumns(sql) {
  const m = sql.match(/^SELECT\s+(.+?)\s+FROM\b/i)
  if (!m) return null
  const selectList = m[1]

  if (/COUNT\s*\(\s*\*\s*\)/i.test(selectList)) return null
  if (selectList.trim() === '*') return null

  const cols = []
  for (const raw of selectList.split(',')) {
    const t = raw.trim()
    if (t.startsWith('?')) continue
    if (/^COALESCE\s*\(/i.test(t)) continue

    // col AS alias  or  table.col AS alias
    const aliasM = t.match(/^([\w.]+)\s+AS\s+(\w+)$/i)
    if (aliasM) {
      const sourceCol = aliasM[1].includes('.') ? aliasM[1].split('.').pop() : aliasM[1]
      cols.push({ sourceCol, alias: aliasM[2] })
      continue
    }

    // bare col, table.col, or integer literal (e.g. SELECT 1)
    const bareM = t.match(/^([\w.]+)$/)
    if (bareM) {
      if (/^\d+$/.test(bareM[1])) {
        cols.push({ sourceCol: null, alias: bareM[1], literal: Number(bareM[1]) })
      } else {
        const sourceCol = bareM[1].includes('.') ? bareM[1].split('.').pop() : bareM[1]
        cols.push({ sourceCol, alias: sourceCol })
      }
      continue
    }

    // Unrecognized expression — fall back to full rows
    return null
  }

  return cols.length > 0 ? cols : null
}

/**
 * Project an array of full seed rows down to only the columns in the SELECT list.
 * When cols is null (SELECT * or unrecognized), rows are returned as-is.
 */
function projectRows(rows, cols) {
  if (!cols) return rows
  return rows.map((row) => {
    const projected = {}
    for (const { sourceCol, alias, literal } of cols) {
      projected[alias] = sourceCol === null ? literal : row[sourceCol]
    }
    return projected
  })
}

// ---- ORDER BY handler ----

function applyOrder(rows, orderClause) {
  if (!orderClause) return rows
  const parts = orderClause.split(',').map((s) => s.trim())
  return [...rows].sort((a, b) => {
    for (const part of parts) {
      const m = part.match(/^([\w.]+)(?:\s+(ASC|DESC))?$/i)
      if (!m) continue
      const col = m[1].includes('.') ? m[1].split('.').pop() : m[1]
      const dir = (m[2] || 'ASC').toUpperCase()
      const av = a[col] ?? ''
      const bv = b[col] ?? ''
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      if (cmp !== 0) return dir === 'ASC' ? cmp : -cmp
    }
    return 0
  })
}

// ---- Statement ----

class MockStatement {
  constructor(sql, tables) {
    this._sql = sql.replace(/\s+/g, ' ').trim()
    this._tables = tables
    this._params = []
  }

  bind(...params) {
    this._params = params
    return this
  }

  async first() {
    return this._run()[0] ?? null
  }

  async all() {
    return { results: this._run() }
  }

  async run() {
    this._run()
    return { success: true, meta: {} }
  }

  _run() {
    const sql = this._sql

    // Handle INSERT / UPDATE for write endpoint testing
    if (/^\s*INSERT\b/i.test(sql)) return this._runInsert()
    if (/^\s*UPDATE\b/i.test(sql)) return this._runUpdate()

    const params = this._params

    if (/\bJOIN\b/i.test(sql)) return this._runJoin()

    const tableName = extractTable(sql)
    if (!tableName) return []
    let rows = [...(this._tables[tableName] ?? [])]

    let paramIdx = 0
    const whereClause = extractWhere(sql)
    if (whereClause) {
      const { conditions, paramCount } = parseConditions(whereClause, params)
      rows = applyConditions(rows, conditions)
      paramIdx += paramCount
    }

    rows = applyOrder(rows, extractOrderBy(sql))

    const limitStr = extractLimit(sql)
    if (limitStr) {
      const limit = limitStr === '?' ? Number(params[paramIdx]) : Number(limitStr)
      if (Number.isFinite(limit)) rows = rows.slice(0, limit)
    }

    const countAlias = extractCountAlias(sql)
    if (countAlias) return [{ [countAlias]: rows.length }]

    return projectRows(rows, extractSelectColumns(sql))
  }

  /**
   * INSERT handler for write endpoint testing.
   * Validates target table against known schema tables, auto-increments an ID,
   * and returns it when the SQL contains a RETURNING clause.
   */
  _runInsert() {
    const m = this._sql.match(/\bINTO\s+(\w+)/i)
    const tableName = m ? m[1].toLowerCase() : null

    if (!tableName || !KNOWN_TABLES.has(tableName)) {
      throw new Error(`MockD1: INSERT into unknown table "${tableName ?? 'null'}"`)
    }

    if (!this._tables._counters) this._tables._counters = {}
    if (!this._tables._counters[tableName]) this._tables._counters[tableName] = 100
    const id = ++this._tables._counters[tableName]

    if (/\bRETURNING\s+id\b/i.test(this._sql)) {
      return [{ id }]
    }
    return []
  }

  /**
   * UPDATE handler for write endpoint testing.
   * Validates target table against known schema tables.
   * Returns an empty result set (updates don't return rows unless RETURNING).
   */
  _runUpdate() {
    const m = this._sql.match(/\bUPDATE\s+(\w+)/i)
    const tableName = m ? m[1].toLowerCase() : null

    if (!tableName || !KNOWN_TABLES.has(tableName)) {
      throw new Error(`MockD1: UPDATE on unknown table "${tableName ?? 'null'}"`)
    }

    if (/\bRETURNING\b/i.test(this._sql)) {
      return [{ changes: 1 }]
    }
    return []
  }

  /**
   * Handle the specific LEFT JOIN pattern used in the day-status handler.
   *
   * SQL structure:
   *   SELECT t.*, ds.* FROM topics t
   *   LEFT JOIN daily_status ds ON ds.topic_slug = t.topic_slug AND ds.date_key = ?
   *   WHERE t.topic_slug = ?
   *
   * Bound params: [dateKey, dateKey, topicSlug]
   *   params[0] — used as the literal "? AS date_key" in SELECT
   *   params[1] — ON ds.date_key = ?
   *   params[2] — WHERE t.topic_slug = ?
   */
  _runJoin() {
    const [dateKey, , topicSlug] = this._params

    const topics = this._tables['topics'] ?? []
    const dailyStatus = this._tables['daily_status'] ?? []

    const topic = topics.find((t) => t.topic_slug === topicSlug)
    if (!topic) return []

    const ds = dailyStatus.find(
      (d) => d.topic_slug === topicSlug && d.date_key === dateKey
    ) ?? null

    return [{
      topic_slug: topic.topic_slug,
      date_key: dateKey,
      page_state: ds?.page_state ?? 'pending',
      display_name: topic.display_name,
      alert_count: ds?.alert_count ?? 0,
      cluster_count: ds?.cluster_count ?? 0,
      summary_available: ds?.summary_available ?? 0,
      video_available: ds?.video_available ?? 0,
      article_available: ds?.article_available ?? 0,
      prev_date_key: ds?.prev_date_key ?? null,
      next_date_key: ds?.next_date_key ?? null,
      published_at: ds?.published_at ?? null
    }]
  }
}

// ---- Database ----

const KNOWN_TABLES = new Set([
  'topics', 'alerts', 'event_clusters', 'daily_status', 'publish_jobs'
])

export class MockD1Database {
  constructor() {
    this._tables = {}
  }

  /**
   * Seed a table with an array of row objects. Replaces any existing rows.
   * @param {string} tableName
   * @param {Array<Object>} rows
   * @returns {MockD1Database} for chaining
   */
  seed(tableName, rows) {
    this._tables[tableName] = [...rows]
    return this
  }

  prepare(sql) {
    return new MockStatement(sql, this._tables)
  }

  /**
   * Execute multiple statements as a batch (mimics D1 transactional batch).
   * Each statement is executed sequentially. Returns an array of results.
   * @param {MockStatement[]} statements
   * @returns {Promise<Array<{ results: Array, success: boolean }>>}
   */
  async batch(statements) {
    const results = []
    for (const stmt of statements) {
      const rows = stmt._run()
      results.push({ results: rows, success: true, meta: {} })
    }
    return results
  }
}

// ---- Canonical seed data (mirrors db/seeds/topics.sql + sample_alerts.sql) ----

/**
 * Create a MockD1Database pre-seeded with the same data as the local seed files.
 * Covers topics, alerts, and daily_status for the sample date 2025-01-15.
 * @returns {MockD1Database}
 */
export function createSeededDb() {
  const db = new MockD1Database()

  db.seed('topics', [
    {
      topic_slug: 'crypto',
      display_name: 'Crypto',
      description: 'Cryptocurrency markets, blockchain technology, and digital assets.',
      is_active: 1,
      sort_order: 1
    },
    {
      topic_slug: 'finance',
      display_name: 'Finance',
      description: 'Global financial markets, equities, bonds, and macroeconomic indicators.',
      is_active: 1,
      sort_order: 2
    },
    {
      topic_slug: 'economy',
      display_name: 'Economy',
      description: 'Macroeconomic trends, central bank policy, trade, and economic data.',
      is_active: 1,
      sort_order: 3
    },
    {
      topic_slug: 'health',
      display_name: 'Health',
      description: 'Healthcare developments, medical research, public health, and biotech.',
      is_active: 1,
      sort_order: 4
    },
    {
      topic_slug: 'ai',
      display_name: 'AI',
      description: 'Artificial intelligence breakthroughs, research, products, and policy.',
      is_active: 1,
      sort_order: 5
    },
    {
      topic_slug: 'energy',
      display_name: 'Energy',
      description: 'Energy markets, renewables, oil and gas, and climate-related developments.',
      is_active: 1,
      sort_order: 6
    },
    {
      topic_slug: 'technology',
      display_name: 'Technology',
      description: 'Technology industry news, products, infrastructure, and regulation.',
      is_active: 1,
      sort_order: 7
    }
  ])

  db.seed('alerts', [
    {
      id: 1,
      topic_slug: 'crypto',
      date_key: '2025-01-15',
      headline: 'Spot Bitcoin ETFs record $500 M inflows in a single session',
      summary_text: 'US-listed spot Bitcoin ETFs attracted more than $500 million in net inflows on January 15.',
      source_name: 'CryptoNews',
      source_url: 'https://example.com/crypto/btc-etf-inflows',
      severity_score: 60,
      importance_score: 82,
      confidence_score: 90,
      status: 'active',
      event_at: '2025-01-15T14:30:00Z'
    },
    {
      id: 2,
      topic_slug: 'crypto',
      date_key: '2025-01-15',
      headline: 'Bitcoin price crosses $50,000 briefly on ETF demand',
      summary_text: 'Bitcoin touched $50,000 briefly during the Asian session.',
      source_name: 'BlockDesk',
      source_url: 'https://example.com/crypto/btc-50k',
      severity_score: 50,
      importance_score: 74,
      confidence_score: 88,
      status: 'active',
      event_at: '2025-01-15T07:15:00Z'
    },
    {
      id: 3,
      topic_slug: 'crypto',
      date_key: '2025-01-15',
      headline: 'Ethereum ETF products see parallel inflow surge',
      summary_text: 'Ethereum spot ETFs mirrored Bitcoin ETF activity.',
      source_name: 'CoinWire',
      source_url: 'https://example.com/crypto/eth-etf-inflows',
      severity_score: 40,
      importance_score: 68,
      confidence_score: 85,
      status: 'active',
      event_at: '2025-01-15T16:45:00Z'
    },
    {
      id: 4,
      topic_slug: 'finance',
      date_key: '2025-01-15',
      headline: 'Fed minutes reveal no urgency to cut rates in Q1 2025',
      summary_text: 'Minutes from the December FOMC meeting showed officials agreed not to lower rates.',
      source_name: 'MarketWatch',
      source_url: 'https://example.com/finance/fed-minutes',
      severity_score: 70,
      importance_score: 90,
      confidence_score: 95,
      status: 'active',
      event_at: '2025-01-15T19:00:00Z'
    },
    {
      id: 5,
      topic_slug: 'finance',
      date_key: '2025-01-15',
      headline: "S&P 500 falls 1.2% as rate-cut hopes fade",
      summary_text: 'US equities declined sharply after the Fed minutes were released.',
      source_name: 'Bloomberg',
      source_url: 'https://example.com/finance/sp500-decline',
      severity_score: 65,
      importance_score: 80,
      confidence_score: 92,
      status: 'active',
      event_at: '2025-01-15T21:00:00Z'
    },
    {
      id: 6,
      topic_slug: 'finance',
      date_key: '2025-01-15',
      headline: 'US dollar index hits two-month high after Fed signal',
      summary_text: 'The DXY dollar index climbed to its highest level in two months.',
      source_name: 'Reuters',
      source_url: 'https://example.com/finance/dxy-two-month-high',
      severity_score: 55,
      importance_score: 72,
      confidence_score: 88,
      status: 'active',
      event_at: '2025-01-15T20:10:00Z'
    },
    {
      id: 7,
      topic_slug: 'ai',
      date_key: '2025-01-15',
      headline: 'Major AI lab releases 70B open-weight model under permissive licence',
      summary_text: 'A prominent AI research organisation released a 70-billion parameter language model.',
      source_name: 'AIInsider',
      source_url: 'https://example.com/ai/open-weight-70b',
      severity_score: 45,
      importance_score: 78,
      confidence_score: 92,
      status: 'active',
      event_at: '2025-01-15T10:00:00Z'
    },
    {
      id: 8,
      topic_slug: 'ai',
      date_key: '2025-01-15',
      headline: 'Community benchmarks show new model rivals GPT-4 on coding tasks',
      summary_text: 'Community members published benchmark comparisons.',
      source_name: 'HuggingFace Blog',
      source_url: 'https://example.com/ai/benchmark-results',
      severity_score: 35,
      importance_score: 70,
      confidence_score: 80,
      status: 'active',
      event_at: '2025-01-15T13:30:00Z'
    },
    {
      id: 9,
      topic_slug: 'ai',
      date_key: '2025-01-15',
      headline: 'Shares of closed AI model companies dip on open-source competition fears',
      summary_text: 'Publicly traded companies offering proprietary AI APIs saw share prices slip 2–4%.',
      source_name: 'TechCrunch',
      source_url: 'https://example.com/ai/ai-stocks-open-source',
      severity_score: 50,
      importance_score: 65,
      confidence_score: 75,
      status: 'active',
      event_at: '2025-01-15T17:00:00Z'
    }
  ])

  db.seed('daily_status', [
    {
      topic_slug: 'crypto',
      date_key: '2025-01-15',
      page_state: 'published',
      alert_count: 3,
      cluster_count: 1,
      summary_available: 1,
      video_available: 1,
      article_available: 1,
      prev_date_key: null,
      next_date_key: null,
      published_at: '2025-01-15T23:00:00Z'
    },
    {
      topic_slug: 'finance',
      date_key: '2025-01-15',
      page_state: 'published',
      alert_count: 3,
      cluster_count: 1,
      summary_available: 1,
      video_available: 0,
      article_available: 1,
      prev_date_key: null,
      next_date_key: null,
      published_at: '2025-01-15T23:00:00Z'
    },
    {
      topic_slug: 'ai',
      date_key: '2025-01-15',
      page_state: 'ready',
      alert_count: 3,
      cluster_count: 1,
      summary_available: 1,
      video_available: 0,
      article_available: 0,
      prev_date_key: null,
      next_date_key: null,
      published_at: null
    }
  ])

  return db
}
