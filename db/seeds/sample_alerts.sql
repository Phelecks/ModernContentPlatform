-- Seed: sample_alerts.sql
-- Inserts sample event clusters and alerts for local development and testing.
-- Covers three topics (crypto, finance, ai) for the sample date 2025-01-15.
--
-- Run after applying all migrations and seeding topics:
--   wrangler d1 execute modern-content-platform-db --file=db/seeds/topics.sql --local
--   wrangler d1 execute modern-content-platform-db --file=db/seeds/sample_alerts.sql --local
--
-- Safe to re-run: existing clusters use INSERT OR IGNORE; alerts are inserted fresh.
-- To reset sample data, run scripts/local-reset.sh instead.

-- ============================================================
-- Sample event clusters
-- Three topics × one cluster each for 2025-01-15
-- ============================================================

INSERT OR IGNORE INTO event_clusters
  (topic_slug, date_key, cluster_label, summary_text, alert_count, importance_score)
VALUES
  (
    'crypto',
    '2025-01-15',
    'Bitcoin ETF Inflows',
    'Spot Bitcoin ETF products recorded significant inflows on January 15, driving renewed bullish sentiment across the broader crypto market.',
    3,
    82
  ),
  (
    'finance',
    '2025-01-15',
    'Fed Rate Decision',
    'Federal Reserve officials signalled a cautious stance on rate cuts, pushing equity markets lower and strengthening the US dollar index.',
    3,
    90
  ),
  (
    'ai',
    '2025-01-15',
    'Open-Source Model Release',
    'A major AI lab released a new open-weight large language model, triggering rapid community benchmarking and competitive comparisons.',
    3,
    78
  );

-- ============================================================
-- Sample alerts — crypto / 2025-01-15
-- ============================================================

INSERT INTO alerts
  (topic_slug, date_key, cluster_id,
   headline, summary_text,
   source_url, source_name,
   severity_score, importance_score, confidence_score,
   status, delivered_telegram, delivered_discord,
   event_at)
SELECT
  'crypto', '2025-01-15',
  (SELECT id FROM event_clusters WHERE topic_slug = 'crypto' AND date_key = '2025-01-15' AND cluster_label = 'Bitcoin ETF Inflows'),
  'Spot Bitcoin ETFs record $500 M inflows in a single session',
  'US-listed spot Bitcoin ETFs attracted more than $500 million in net inflows on January 15, the largest single-day figure since the products launched, according to data from multiple tracking services.',
  'https://example.com/crypto/btc-etf-inflows',
  'CryptoNews',
  60, 82, 90,
  'active', 1, 1,
  '2025-01-15T14:30:00Z'
WHERE NOT EXISTS (
  SELECT 1 FROM alerts WHERE topic_slug = 'crypto' AND date_key = '2025-01-15'
    AND headline = 'Spot Bitcoin ETFs record $500 M inflows in a single session'
);

INSERT INTO alerts
  (topic_slug, date_key, cluster_id,
   headline, summary_text,
   source_url, source_name,
   severity_score, importance_score, confidence_score,
   status, delivered_telegram, delivered_discord,
   event_at)
SELECT
  'crypto', '2025-01-15',
  (SELECT id FROM event_clusters WHERE topic_slug = 'crypto' AND date_key = '2025-01-15' AND cluster_label = 'Bitcoin ETF Inflows'),
  'Bitcoin price crosses $50,000 briefly on ETF demand',
  'Bitcoin touched $50,000 briefly during the Asian session before pulling back to $49,400. Analysts attributed the move to anticipation of continued institutional inflows via spot ETF products.',
  'https://example.com/crypto/btc-50k',
  'BlockDesk',
  50, 74, 88,
  'active', 1, 1,
  '2025-01-15T07:15:00Z'
WHERE NOT EXISTS (
  SELECT 1 FROM alerts WHERE topic_slug = 'crypto' AND date_key = '2025-01-15'
    AND headline = 'Bitcoin price crosses $50,000 briefly on ETF demand'
);

INSERT INTO alerts
  (topic_slug, date_key, cluster_id,
   headline, summary_text,
   source_url, source_name,
   severity_score, importance_score, confidence_score,
   status, delivered_telegram, delivered_discord,
   event_at)
SELECT
  'crypto', '2025-01-15',
  (SELECT id FROM event_clusters WHERE topic_slug = 'crypto' AND date_key = '2025-01-15' AND cluster_label = 'Bitcoin ETF Inflows'),
  'Ethereum ETF products see parallel inflow surge',
  'Ethereum spot ETFs mirrored Bitcoin ETF activity, recording their second-highest day of inflows since approval, suggesting broad institutional appetite for crypto exposure.',
  'https://example.com/crypto/eth-etf-inflows',
  'CoinWire',
  40, 68, 85,
  'active', 1, 0,
  '2025-01-15T16:45:00Z'
WHERE NOT EXISTS (
  SELECT 1 FROM alerts WHERE topic_slug = 'crypto' AND date_key = '2025-01-15'
    AND headline = 'Ethereum ETF products see parallel inflow surge'
);

-- ============================================================
-- Sample alerts — finance / 2025-01-15
-- ============================================================

INSERT INTO alerts
  (topic_slug, date_key, cluster_id,
   headline, summary_text,
   source_url, source_name,
   severity_score, importance_score, confidence_score,
   status, delivered_telegram, delivered_discord,
   event_at)
SELECT
  'finance', '2025-01-15',
  (SELECT id FROM event_clusters WHERE topic_slug = 'finance' AND date_key = '2025-01-15' AND cluster_label = 'Fed Rate Decision'),
  'Fed minutes reveal no urgency to cut rates in Q1 2025',
  'Minutes from the December FOMC meeting published on January 15 showed officials broadly agreed that there was no reason to lower the federal funds rate until inflation data showed sustained progress toward the 2% target.',
  'https://example.com/finance/fed-minutes',
  'MarketWatch',
  70, 90, 95,
  'active', 1, 1,
  '2025-01-15T19:00:00Z'
WHERE NOT EXISTS (
  SELECT 1 FROM alerts WHERE topic_slug = 'finance' AND date_key = '2025-01-15'
    AND headline = 'Fed minutes reveal no urgency to cut rates in Q1 2025'
);

INSERT INTO alerts
  (topic_slug, date_key, cluster_id,
   headline, summary_text,
   source_url, source_name,
   severity_score, importance_score, confidence_score,
   status, delivered_telegram, delivered_discord,
   event_at)
SELECT
  'finance', '2025-01-15',
  (SELECT id FROM event_clusters WHERE topic_slug = 'finance' AND date_key = '2025-01-15' AND cluster_label = 'Fed Rate Decision'),
  'S&P 500 falls 1.2% as rate-cut hopes fade',
  'US equities declined sharply after the Fed minutes were released, with the S&P 500 closing 1.2% lower and rate-sensitive sectors such as real estate and utilities leading losses.',
  'https://example.com/finance/sp500-decline',
  'Bloomberg',
  65, 80, 92,
  'active', 1, 1,
  '2025-01-15T21:00:00Z'
WHERE NOT EXISTS (
  SELECT 1 FROM alerts WHERE topic_slug = 'finance' AND date_key = '2025-01-15'
    AND headline = 'S&P 500 falls 1.2% as rate-cut hopes fade'
);

INSERT INTO alerts
  (topic_slug, date_key, cluster_id,
   headline, summary_text,
   source_url, source_name,
   severity_score, importance_score, confidence_score,
   status, delivered_telegram, delivered_discord,
   event_at)
SELECT
  'finance', '2025-01-15',
  (SELECT id FROM event_clusters WHERE topic_slug = 'finance' AND date_key = '2025-01-15' AND cluster_label = 'Fed Rate Decision'),
  'US dollar index hits two-month high after Fed signal',
  'The DXY dollar index climbed to its highest level in two months as traders repriced rate expectations, with EUR/USD briefly dipping below 1.09.',
  'https://example.com/finance/dxy-two-month-high',
  'Reuters',
  55, 72, 88,
  'active', 1, 1,
  '2025-01-15T20:10:00Z'
WHERE NOT EXISTS (
  SELECT 1 FROM alerts WHERE topic_slug = 'finance' AND date_key = '2025-01-15'
    AND headline = 'US dollar index hits two-month high after Fed signal'
);

-- ============================================================
-- Sample alerts — ai / 2025-01-15
-- ============================================================

INSERT INTO alerts
  (topic_slug, date_key, cluster_id,
   headline, summary_text,
   source_url, source_name,
   severity_score, importance_score, confidence_score,
   status, delivered_telegram, delivered_discord,
   event_at)
SELECT
  'ai', '2025-01-15',
  (SELECT id FROM event_clusters WHERE topic_slug = 'ai' AND date_key = '2025-01-15' AND cluster_label = 'Open-Source Model Release'),
  'Major AI lab releases 70B open-weight model under permissive licence',
  'A prominent AI research organisation released a 70-billion parameter language model under an Apache 2.0 licence, enabling unrestricted commercial use and drawing immediate interest from enterprise developers.',
  'https://example.com/ai/open-weight-70b',
  'AIInsider',
  45, 78, 92,
  'active', 1, 1,
  '2025-01-15T10:00:00Z'
WHERE NOT EXISTS (
  SELECT 1 FROM alerts WHERE topic_slug = 'ai' AND date_key = '2025-01-15'
    AND headline = 'Major AI lab releases 70B open-weight model under permissive licence'
);

INSERT INTO alerts
  (topic_slug, date_key, cluster_id,
   headline, summary_text,
   source_url, source_name,
   severity_score, importance_score, confidence_score,
   status, delivered_telegram, delivered_discord,
   event_at)
SELECT
  'ai', '2025-01-15',
  (SELECT id FROM event_clusters WHERE topic_slug = 'ai' AND date_key = '2025-01-15' AND cluster_label = 'Open-Source Model Release'),
  'Community benchmarks show new model rivals GPT-4 on coding tasks',
  'Within hours of release, community members published benchmark comparisons showing the new open-weight model matching or exceeding proprietary models on HumanEval and MBPP coding benchmarks.',
  'https://example.com/ai/benchmark-results',
  'HuggingFace Blog',
  35, 70, 80,
  'active', 1, 0,
  '2025-01-15T13:30:00Z'
WHERE NOT EXISTS (
  SELECT 1 FROM alerts WHERE topic_slug = 'ai' AND date_key = '2025-01-15'
    AND headline = 'Community benchmarks show new model rivals GPT-4 on coding tasks'
);

INSERT INTO alerts
  (topic_slug, date_key, cluster_id,
   headline, summary_text,
   source_url, source_name,
   severity_score, importance_score, confidence_score,
   status, delivered_telegram, delivered_discord,
   event_at)
SELECT
  'ai', '2025-01-15',
  (SELECT id FROM event_clusters WHERE topic_slug = 'ai' AND date_key = '2025-01-15' AND cluster_label = 'Open-Source Model Release'),
  'Shares of closed AI model companies dip on open-source competition fears',
  'Publicly traded companies offering proprietary AI APIs saw their share prices slip 2–4% as investors weighed the competitive implications of a powerful freely available model entering the market.',
  'https://example.com/ai/ai-stocks-open-source',
  'TechCrunch',
  50, 65, 75,
  'active', 0, 0,
  '2025-01-15T17:00:00Z'
WHERE NOT EXISTS (
  SELECT 1 FROM alerts WHERE topic_slug = 'ai' AND date_key = '2025-01-15'
    AND headline = 'Shares of closed AI model companies dip on open-source competition fears'
);

-- ============================================================
-- Sample daily_status rows for seeded topic/day combinations
-- ============================================================

INSERT OR IGNORE INTO daily_status
  (topic_slug, date_key, page_state, alert_count, cluster_count,
   summary_available, video_available, article_available)
VALUES
  ('crypto',  '2025-01-15', 'published', 3, 1, 1, 1, 1),
  ('finance', '2025-01-15', 'published', 3, 1, 1, 0, 1),
  ('ai',      '2025-01-15', 'ready',     3, 1, 1, 0, 0);
