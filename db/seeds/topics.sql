-- Seed: topics.sql
-- Inserts the initial set of supported platform topics.
-- Run after applying 0001_init.sql to bootstrap a fresh D1 database.
-- Safe to re-run: INSERT OR IGNORE will not duplicate rows.

INSERT OR IGNORE INTO topics (topic_slug, display_name, description, is_active, sort_order)
VALUES
  ('crypto',     'Crypto',     'Cryptocurrency markets, blockchain technology, and digital assets.',         1, 1),
  ('finance',    'Finance',    'Global financial markets, equities, bonds, and macroeconomic indicators.',   1, 2),
  ('economy',    'Economy',    'Macroeconomic trends, central bank policy, trade, and economic data.',       1, 3),
  ('health',     'Health',     'Healthcare developments, medical research, public health, and biotech.',     1, 4),
  ('ai',         'AI',         'Artificial intelligence breakthroughs, research, products, and policy.',     1, 5),
  ('energy',     'Energy',     'Energy markets, renewables, oil and gas, and climate-related developments.', 1, 6),
  ('technology', 'Technology', 'Technology industry news, products, infrastructure, and regulation.',        1, 7);
