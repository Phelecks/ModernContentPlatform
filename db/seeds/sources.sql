-- Seed: sources.sql
-- Inserts v1 starter sources into the source registry.
-- Derived from config/sources/*.json and docs/source-strategy.md.
-- Run after applying 0004_source_registry.sql to bootstrap source data.
-- Safe to re-run: INSERT OR IGNORE will not duplicate rows (source_slug is UNIQUE).
--
-- Trust score mapping:
--   T1 (Official)          = 90
--   T2 (Wire / Newswire)   = 75
--   T3 (Specialist news)   = 50
--   T4 (Signal / Social)   = 25

-- ============================================================
-- Crypto sources
-- ============================================================
INSERT OR IGNORE INTO sources
  (source_slug, source_name, topic_slug, source_type, trust_tier, trust_score, priority_weight, url, is_active, poll_interval_minutes, ingestion_method, metadata_json)
VALUES
  ('coingecko-api', 'CoinGecko API', 'crypto', 'api', 'T1', 90, 90, 'https://api.coingecko.com/api/v3/news', 0, 15, 'poll', '{"notes":"Placeholder pending module 01 Parse API Items support for the CoinGecko response shape"}'),
  ('coindesk-rss', 'CoinDesk RSS', 'crypto', 'rss', 'T3', 50, 70, 'https://www.coindesk.com/arc/outboundfeeds/rss/', 1, 15, 'poll', NULL),
  ('reuters-crypto-rss', 'Reuters Crypto RSS', 'crypto', 'rss', 'T2', 75, 80, 'https://feeds.reuters.com/reuters/technologyNews', 1, 15, 'poll', NULL);

-- ============================================================
-- AI sources
-- ============================================================
INSERT OR IGNORE INTO sources
  (source_slug, source_name, topic_slug, source_type, trust_tier, trust_score, priority_weight, url, is_active, poll_interval_minutes, ingestion_method, metadata_json)
VALUES
  ('ars-technica-rss', 'Ars Technica RSS', 'ai', 'rss', 'T3', 50, 70, 'https://feeds.arstechnica.com/arstechnica/index', 1, 15, 'poll', NULL),
  ('hacker-news-api', 'Hacker News API', 'ai', 'api', 'T4', 25, 50, 'https://hacker-news.firebaseio.com/v0/topstories.json', 1, 15, 'poll', '{"notes":"Community signal — cap severity at 50"}'),
  ('openai-blog-rss', 'OpenAI Blog RSS', 'ai', 'rss', 'T2', 75, 80, 'https://openai.com/blog/rss.xml', 1, 15, 'poll', '{"notes":"Official company blog — treat as T2; confirm high-severity items with wire"}'),
  ('mit-tech-review-rss', 'MIT Technology Review RSS', 'ai', 'rss', 'T3', 50, 60, 'https://www.technologyreview.com/feed/', 1, 15, 'poll', NULL);

-- ============================================================
-- Finance sources
-- ============================================================
INSERT OR IGNORE INTO sources
  (source_slug, source_name, topic_slug, source_type, trust_tier, trust_score, priority_weight, url, is_active, poll_interval_minutes, ingestion_method, metadata_json)
VALUES
  ('reuters-business-rss', 'Reuters Business RSS', 'finance', 'rss', 'T2', 75, 80, 'https://feeds.reuters.com/reuters/businessNews', 1, 15, 'poll', NULL),
  ('sec-edgar-rss', 'SEC EDGAR RSS', 'finance', 'rss', 'T1', 90, 90, 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&dateb=&owner=include&count=20&search_text=&output=atom', 1, 30, 'poll', NULL),
  ('federal-reserve-news-rss', 'Federal Reserve News RSS', 'finance', 'rss', 'T1', 90, 90, 'https://www.federalreserve.gov/feeds/press_all.xml', 1, 30, 'poll', NULL);

-- ============================================================
-- Economy sources
-- ============================================================
INSERT OR IGNORE INTO sources
  (source_slug, source_name, topic_slug, source_type, trust_tier, trust_score, priority_weight, url, is_active, poll_interval_minutes, ingestion_method, metadata_json)
VALUES
  ('bls-news-rss', 'BLS News RSS', 'economy', 'rss', 'T1', 90, 90, 'https://www.bls.gov/feed/bls_latest.rss', 1, 30, 'poll', NULL),
  ('fred-api', 'Federal Reserve FRED API', 'economy', 'api', 'T1', 90, 90, 'https://api.stlouisfed.org/fred/releases/news?api_key=REPLACE_WITH_FRED_API_KEY&file_type=json', 1, 60, 'poll', '{"notes":"Operators must replace REPLACE_WITH_FRED_API_KEY with a real key before use"}'),
  ('reuters-economy-rss', 'Reuters General News RSS', 'economy', 'rss', 'T2', 75, 70, 'https://feeds.reuters.com/reuters/companyNews', 1, 15, 'poll', '{"notes":"Generic Reuters companyNews feed; replace with a topic-specific economy feed when available"}');

-- ============================================================
-- Health sources
-- ============================================================
INSERT OR IGNORE INTO sources
  (source_slug, source_name, topic_slug, source_type, trust_tier, trust_score, priority_weight, url, is_active, poll_interval_minutes, ingestion_method, metadata_json)
VALUES
  ('who-news-rss', 'WHO News RSS', 'health', 'rss', 'T1', 90, 90, 'https://www.who.int/rss-feeds/news-english.xml', 1, 30, 'poll', NULL),
  ('cdc-newsroom-rss', 'CDC Newsroom RSS', 'health', 'rss', 'T1', 90, 90, 'https://tools.cdc.gov/api/v2/resources/media/403372.rss', 1, 30, 'poll', NULL),
  ('reuters-health-rss', 'Reuters Health RSS', 'health', 'rss', 'T2', 75, 80, 'https://feeds.reuters.com/reuters/healthNews', 1, 15, 'poll', NULL);

-- ============================================================
-- Energy sources
-- ============================================================
INSERT OR IGNORE INTO sources
  (source_slug, source_name, topic_slug, source_type, trust_tier, trust_score, priority_weight, url, is_active, poll_interval_minutes, ingestion_method, metadata_json)
VALUES
  ('iea-news-rss', 'IEA News RSS', 'energy', 'rss', 'T1', 90, 90, 'https://www.iea.org/news.xml', 1, 30, 'poll', NULL),
  ('eia-news-rss', 'EIA News RSS', 'energy', 'rss', 'T1', 90, 90, 'https://www.eia.gov/rss/todayinenergy.xml', 1, 30, 'poll', NULL),
  ('reuters-energy-rss', 'Reuters General News RSS', 'energy', 'rss', 'T2', 75, 70, 'https://feeds.reuters.com/reuters/companyNews', 1, 15, 'poll', '{"notes":"Generic Reuters companyNews feed; replace with a topic-specific energy feed when available"}');
