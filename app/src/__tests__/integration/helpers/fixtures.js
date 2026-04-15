/**
 * Fixture re-exports for integration tests.
 *
 * All fixtures are loaded from the canonical JSON files under fixtures/ at the
 * repository root.  Import named constants from this module rather than
 * importing the JSON files directly so that tests stay readable and fixture
 * paths are maintained in one place.
 *
 * Alias: @fixtures → <repo-root>/fixtures  (configured in app/vitest.config.js)
 *
 * Usage:
 *   import { CRYPTO_PUBLISHED_STATUS, CRYPTO_CLASSIFIED_ALERTS } from './helpers/fixtures.js'
 */

// ---- Page-state fixtures (day-status API response shapes) ----

export { default as CRYPTO_PUBLISHED_STATUS } from '@fixtures/page-states/crypto-2025-01-15-published.json'
export { default as FINANCE_PUBLISHED_STATUS } from '@fixtures/page-states/finance-2025-01-15-published.json'
export { default as AI_READY_STATUS } from '@fixtures/page-states/ai-2025-01-15-ready.json'
export { default as CRYPTO_PENDING_STATUS } from '@fixtures/page-states/crypto-2025-01-16-pending.json'

// ---- Classified alert sets (intraday_classified_alert arrays, per topic/day) ----

export { default as CRYPTO_CLASSIFIED_ALERTS } from '@fixtures/classified-alerts/crypto-2025-01-15.json'
export { default as CRYPTO_CLASSIFIED_ALERTS_X_SOURCE } from '@fixtures/classified-alerts/crypto-2025-01-15-x-source.json'
export { default as FINANCE_CLASSIFIED_ALERTS } from '@fixtures/classified-alerts/finance-2025-01-15.json'
export { default as AI_CLASSIFIED_ALERTS } from '@fixtures/classified-alerts/ai-2025-01-15.json'

// ---- Daily summaries (daily_summary AI output, per topic/day) ----

export { default as CRYPTO_DAILY_SUMMARY } from '@fixtures/daily-summaries/crypto-2025-01-15.json'
export { default as FINANCE_DAILY_SUMMARY } from '@fixtures/daily-summaries/finance-2025-01-15.json'

// ---- Video scripts (video_script AI output, per topic/day) ----

export { default as CRYPTO_VIDEO_SCRIPT } from '@fixtures/video-scripts/crypto-2025-01-15.json'
export { default as FINANCE_VIDEO_SCRIPT } from '@fixtures/video-scripts/finance-2025-01-15.json'

// ---- YouTube metadata (youtube_metadata AI output, per topic/day) ----

export { default as CRYPTO_YOUTUBE_METADATA } from '@fixtures/youtube-metadata/crypto-2025-01-15.json'
export { default as FINANCE_YOUTUBE_METADATA } from '@fixtures/youtube-metadata/finance-2025-01-15.json'

// ---- Source events (intraday_source_item, individual items) ----

export { default as CRYPTO_SOURCE_EVENT_BTC_ETF } from '@fixtures/source-events/crypto-2025-01-15-btc-etf-inflows.json'
export { default as FINANCE_SOURCE_EVENT_FED_MINUTES } from '@fixtures/source-events/finance-2025-01-15-fed-minutes.json'
export { default as AI_SOURCE_EVENT_OPEN_WEIGHT_MODEL } from '@fixtures/source-events/ai-2025-01-15-open-weight-model.json'
export { default as CRYPTO_SOURCE_EVENT_X_WHALE_ALERT } from '@fixtures/source-events/crypto-2025-01-15-x-whale-alert.json'
export { default as ECONOMY_SOURCE_EVENT_BLS_CPI } from '@fixtures/source-events/economy-2025-01-15-bls-cpi.json'
export { default as CRYPTO_SOURCE_EVENT_X_QUERY_BTC } from '@fixtures/source-events/crypto-2025-01-15-x-query-btc-breakout.json'
export { default as CRYPTO_SOURCE_EVENT_SOCIAL_TELEGRAM } from '@fixtures/source-events/crypto-2025-01-15-social-telegram.json'
export { default as CRYPTO_SOURCE_EVENT_WEBHOOK_LIQUIDATION } from '@fixtures/source-events/crypto-2025-01-15-webhook-liquidation.json'
export { default as CRYPTO_SOURCE_EVENT_NEWSAPI } from '@fixtures/source-events/crypto-2025-01-15-newsapi.json'

// ---- Normalized items (intraday_normalized_item, individual items) ----

export { default as CRYPTO_NORMALIZED_ITEM_BTC_ETF } from '@fixtures/normalized-items/crypto-2025-01-15-btc-etf-inflows.json'
export { default as FINANCE_NORMALIZED_ITEM_FED_MINUTES } from '@fixtures/normalized-items/finance-2025-01-15-fed-minutes.json'
export { default as AI_NORMALIZED_ITEM_OPEN_WEIGHT_MODEL } from '@fixtures/normalized-items/ai-2025-01-15-open-weight-model.json'
export { default as CRYPTO_NORMALIZED_ITEM_X_WHALE_ALERT } from '@fixtures/normalized-items/crypto-2025-01-15-x-whale-alert.json'
export { default as ECONOMY_NORMALIZED_ITEM_BLS_CPI } from '@fixtures/normalized-items/economy-2025-01-15-bls-cpi.json'
export { default as CRYPTO_NORMALIZED_ITEM_X_QUERY_BTC } from '@fixtures/normalized-items/crypto-2025-01-15-x-query-btc-breakout.json'
export { default as CRYPTO_NORMALIZED_ITEM_SOCIAL_TELEGRAM } from '@fixtures/normalized-items/crypto-2025-01-15-social-telegram.json'
export { default as CRYPTO_NORMALIZED_ITEM_WEBHOOK_LIQUIDATION } from '@fixtures/normalized-items/crypto-2025-01-15-webhook-liquidation.json'
export { default as CRYPTO_NORMALIZED_ITEM_NEWSAPI } from '@fixtures/normalized-items/crypto-2025-01-15-newsapi.json'

// ---- Provider config fixtures (env objects + expected outcomes for parseProviderConfig) ----

export { default as PROVIDER_CONFIG_X_ONLY } from '@fixtures/provider-configs/x-only.json'
export { default as PROVIDER_CONFIG_NEWSAPI_ONLY } from '@fixtures/provider-configs/newsapi-only.json'
export { default as PROVIDER_CONFIG_HYBRID } from '@fixtures/provider-configs/hybrid.json'
export { default as PROVIDER_CONFIG_X_ONLY_NEWSAPI_KEY_IGNORED } from '@fixtures/provider-configs/x-only-newsapi-key-ignored.json'
export { default as PROVIDER_CONFIG_INVALID_BOTH_DISABLED } from '@fixtures/provider-configs/invalid-both-disabled.json'
export { default as PROVIDER_CONFIG_INVALID_X_MISSING_KEY } from '@fixtures/provider-configs/invalid-x-missing-key.json'
export { default as PROVIDER_CONFIG_INVALID_NEWSAPI_MISSING_KEY } from '@fixtures/provider-configs/invalid-newsapi-missing-key.json'
