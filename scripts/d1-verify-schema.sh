#!/usr/bin/env bash
# scripts/d1-verify-schema.sh
#
# Verify the schema state of a remote or local Cloudflare D1 database.
# Checks that all expected tables, indexes, and migration records exist.
#
# Usage:
#   bash scripts/d1-verify-schema.sh staging      # verify remote staging
#   bash scripts/d1-verify-schema.sh production    # verify remote production
#   bash scripts/d1-verify-schema.sh local         # verify local D1
#
# Requirements:
#   - Wrangler CLI 3.x or later  (npm install -g wrangler)
#   - For remote: authenticated via `wrangler login` or CLOUDFLARE_API_TOKEN
#   - Run from the repository root directory
#
# Exit codes:
#   0 — all checks passed
#   1 — one or more checks failed

set -euo pipefail

# ---------------------------------------------------------------------------
# Resolve repo root
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${REPO_ROOT}"

# ---------------------------------------------------------------------------
# Parse environment argument
# ---------------------------------------------------------------------------
ENV="${1:-}"

if [[ -z "${ENV}" ]]; then
  echo "Error: environment argument required."
  echo ""
  echo "Usage:"
  echo "  bash scripts/d1-verify-schema.sh staging"
  echo "  bash scripts/d1-verify-schema.sh production"
  echo "  bash scripts/d1-verify-schema.sh local"
  exit 1
fi

case "${ENV}" in
  staging)
    DB_NAME="modern-content-platform-staging-db"
    WRANGLER_ENV="--env staging"
    LOCATION_FLAG="--remote"
    ;;
  production)
    DB_NAME="modern-content-platform-db"
    WRANGLER_ENV=""
    LOCATION_FLAG="--remote"
    ;;
  local)
    DB_NAME="modern-content-platform-db"
    WRANGLER_ENV=""
    LOCATION_FLAG="--local"
    ;;
  *)
    echo "Error: unknown environment '${ENV}'."
    echo "Allowed values: staging, production, local"
    exit 1
    ;;
esac

echo ""
echo "========================================"
echo "  D1 Schema Verification — ${ENV}"
echo "========================================"
echo ""

ERRORS=0

# ---------------------------------------------------------------------------
# Helper: run a SQL command against the target D1 database
# ---------------------------------------------------------------------------
run_sql() {
  local sql="$1"
  # shellcheck disable=SC2086
  wrangler d1 execute ${DB_NAME} ${WRANGLER_ENV} ${LOCATION_FLAG} --command "${sql}" 2>&1
}

# ---------------------------------------------------------------------------
# Check 1: Expected tables exist
# ---------------------------------------------------------------------------
EXPECTED_TABLES=(
  topics
  alerts
  event_clusters
  daily_status
  publish_jobs
  workflow_logs
  sources
  openai_usage_log
  meta_social_publish_log
  social_publish_log
)

echo "Check 1: Expected tables"
echo "------------------------"

TABLE_LIST=$(run_sql "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'd1_%' AND name NOT LIKE 'sqlite_%' ORDER BY name;")

for TABLE in "${EXPECTED_TABLES[@]}"; do
  if echo "${TABLE_LIST}" | grep -qw "${TABLE}"; then
    echo "  ✓ ${TABLE}"
  else
    echo "  ✗ ${TABLE} — MISSING"
    ERRORS=$((ERRORS + 1))
  fi
done

echo ""

# ---------------------------------------------------------------------------
# Check 2: Migration tracking state
# ---------------------------------------------------------------------------
echo "Check 2: Applied migrations"
echo "----------------------------"

MIGRATION_LIST=$(run_sql "SELECT name FROM d1_migrations ORDER BY id;")
echo "${MIGRATION_LIST}"
echo ""

# Count expected migration files (exclude .gitkeep)
EXPECTED_COUNT=$(find "${REPO_ROOT}/db/migrations" -name '*.sql' | wc -l | tr -d ' ')
# Count applied migrations from d1_migrations table
APPLIED_COUNT=$(run_sql "SELECT COUNT(*) AS cnt FROM d1_migrations;" | grep -oE '[0-9]+' | tail -1)

if [[ "${APPLIED_COUNT}" -ge "${EXPECTED_COUNT}" ]]; then
  echo "  ✓ Applied migrations (${APPLIED_COUNT}) >= expected files (${EXPECTED_COUNT})"
else
  echo "  ✗ Applied migrations (${APPLIED_COUNT}) < expected files (${EXPECTED_COUNT})"
  ERRORS=$((ERRORS + 1))
fi

echo ""

# ---------------------------------------------------------------------------
# Check 3: Expected indexes exist
# ---------------------------------------------------------------------------
EXPECTED_INDEXES=(
  idx_topics_active_sort
  idx_alerts_topic_date_event
  idx_alerts_date_event
  idx_alerts_cluster
  idx_alerts_delivery
  idx_alerts_trust_tier
  idx_event_clusters_topic_date
  idx_event_clusters_date
  idx_daily_status_topic_date
  idx_daily_status_topic_state
  idx_daily_status_state_date
  idx_publish_jobs_topic_date
  idx_publish_jobs_status
  idx_workflow_logs_workflow_created
  idx_workflow_logs_event_type_created
  idx_workflow_logs_topic_date_created
  idx_sources_topic_active
  idx_sources_type_active
  idx_sources_trust_tier
  idx_openai_usage_task_created
  idx_openai_usage_model_created
  idx_openai_usage_topic_date
  idx_openai_usage_status_created
  idx_openai_usage_task_status_created
  idx_openai_usage_retry_created
  idx_meta_social_publish_log_topic_date
  idx_meta_social_publish_log_status
  idx_social_publish_log_topic_date
  idx_social_publish_log_status
  idx_social_publish_log_platform
)

echo "Check 3: Expected indexes"
echo "-------------------------"

INDEX_LIST=$(run_sql "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name;")

for IDX in "${EXPECTED_INDEXES[@]}"; do
  if echo "${INDEX_LIST}" | grep -qw "${IDX}"; then
    echo "  ✓ ${IDX}"
  else
    echo "  ✗ ${IDX} — MISSING"
    ERRORS=$((ERRORS + 1))
  fi
done

echo ""

# ---------------------------------------------------------------------------
# Check 4: Row counts for key tables (informational)
# ---------------------------------------------------------------------------
echo "Check 4: Row counts (informational)"
echo "------------------------------------"

for TABLE in topics alerts event_clusters daily_status; do
  COUNT=$(run_sql "SELECT COUNT(*) AS cnt FROM ${TABLE};" | grep -oE '[0-9]+' | tail -1)
  echo "  ${TABLE}: ${COUNT:-0} rows"
done

echo ""

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
if [[ "${ERRORS}" -eq 0 ]]; then
  echo "========================================"
  echo "  ✓ All checks passed — ${ENV}"
  echo "========================================"
else
  echo "========================================"
  echo "  ✗ ${ERRORS} check(s) failed — ${ENV}"
  echo "========================================"
  exit 1
fi

echo ""
