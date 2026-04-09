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

-- ============================================================
-- X (Twitter) sources — account monitoring
-- Trust tier T4 (Signal / Social), trust_score 25.
-- Severity caps per topic are enforced in module 06 (alert decision).
-- metadata_json carries x_user_id and monitoring type.
-- ============================================================

-- Crypto X accounts
INSERT OR IGNORE INTO sources
  (source_slug, source_name, topic_slug, source_type, trust_tier, trust_score, priority_weight, url, is_active, poll_interval_minutes, ingestion_method, metadata_json)
VALUES
  ('x-account-whale-alert', 'Whale Alert (X)', 'crypto', 'x_account', 'T4', 25, 40, 'https://x.com/whale_alert', 0, 5, 'poll', '{"x_user_id":"whale_alert","monitor_type":"account"}'),
  ('x-account-cz-binance', 'CZ Binance (X)', 'crypto', 'x_account', 'T4', 25, 35, 'https://x.com/caborea', 0, 10, 'poll', '{"x_user_id":"caborea","monitor_type":"account"}');

-- AI X accounts
INSERT OR IGNORE INTO sources
  (source_slug, source_name, topic_slug, source_type, trust_tier, trust_score, priority_weight, url, is_active, poll_interval_minutes, ingestion_method, metadata_json)
VALUES
  ('x-account-openai', 'OpenAI (X)', 'ai', 'x_account', 'T4', 25, 40, 'https://x.com/OpenAI', 0, 10, 'poll', '{"x_user_id":"OpenAI","monitor_type":"account"}'),
  ('x-account-anthropic', 'Anthropic (X)', 'ai', 'x_account', 'T4', 25, 35, 'https://x.com/AnthropicAI', 0, 10, 'poll', '{"x_user_id":"AnthropicAI","monitor_type":"account"}');

-- Energy X accounts
INSERT OR IGNORE INTO sources
  (source_slug, source_name, topic_slug, source_type, trust_tier, trust_score, priority_weight, url, is_active, poll_interval_minutes, ingestion_method, metadata_json)
VALUES
  ('x-account-iea', 'IEA (X)', 'energy', 'x_account', 'T4', 25, 30, 'https://x.com/IEA', 0, 15, 'poll', '{"x_user_id":"IEA","monitor_type":"account"}');

-- ============================================================
-- X (Twitter) sources — keyword/hashtag query monitoring
-- Uses X recent search API to find posts matching queries.
-- metadata_json carries search_query and monitor_type.
-- ============================================================

-- Crypto X queries
INSERT OR IGNORE INTO sources
  (source_slug, source_name, topic_slug, source_type, trust_tier, trust_score, priority_weight, url, is_active, poll_interval_minutes, ingestion_method, metadata_json)
VALUES
  ('x-query-btc-breakout', 'X Search: BTC Breakout', 'crypto', 'x_query', 'T4', 25, 30, 'https://api.twitter.com/2/tweets/search/recent', 0, 10, 'poll', '{"search_query":"(#Bitcoin OR #BTC) (breakout OR ATH OR crash) -is:retweet lang:en","monitor_type":"query","max_results":20}');

-- AI X queries
INSERT OR IGNORE INTO sources
  (source_slug, source_name, topic_slug, source_type, trust_tier, trust_score, priority_weight, url, is_active, poll_interval_minutes, ingestion_method, metadata_json)
VALUES
  ('x-query-ai-launch', 'X Search: AI Model Launch', 'ai', 'x_query', 'T4', 25, 30, 'https://api.twitter.com/2/tweets/search/recent', 0, 10, 'poll', '{"search_query":"(#GPT OR #LLM OR #AI) (launched OR released OR announced) -is:retweet lang:en","monitor_type":"query","max_results":20}');

-- Finance X queries
INSERT OR IGNORE INTO sources
  (source_slug, source_name, topic_slug, source_type, trust_tier, trust_score, priority_weight, url, is_active, poll_interval_minutes, ingestion_method, metadata_json)
VALUES
  ('x-query-fed-decision', 'X Search: Fed Decision', 'finance', 'x_query', 'T4', 25, 20, 'https://api.twitter.com/2/tweets/search/recent', 0, 15, 'poll', '{"search_query":"(Federal Reserve OR #FOMC) (rate OR decision OR cut OR hike) -is:retweet lang:en","monitor_type":"query","max_results":10}');
