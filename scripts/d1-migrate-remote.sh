#!/usr/bin/env bash
# scripts/d1-migrate-remote.sh
#
# Apply D1 migrations to a remote Cloudflare D1 database (staging or production).
#
# Usage:
#   bash scripts/d1-migrate-remote.sh staging
#   bash scripts/d1-migrate-remote.sh production
#
# Requirements:
#   - Wrangler CLI 3.x or later  (npm install -g wrangler)
#   - Authenticated: run `wrangler login` or set CLOUDFLARE_API_TOKEN
#   - wrangler.toml database_id values must be set for the target environment
#   - Run from the repository root directory
#
# What this script does:
#   1. Validates the target environment argument.
#   2. Lists pending migrations for the target database.
#   3. Applies all pending migrations in filename order.
#   4. Runs the verification script to confirm schema state.
#
# See docs/operations/d1-provisioning.md for the full operational guide.

set -euo pipefail

# ---------------------------------------------------------------------------
# Resolve repo root
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${REPO_ROOT}"

# ---------------------------------------------------------------------------
# Parse and validate environment argument
# ---------------------------------------------------------------------------
ENV="${1:-}"

if [[ -z "${ENV}" ]]; then
  echo "Error: environment argument required."
  echo ""
  echo "Usage:"
  echo "  bash scripts/d1-migrate-remote.sh staging"
  echo "  bash scripts/d1-migrate-remote.sh production"
  exit 1
fi

case "${ENV}" in
  staging)
    DB_NAME="modern-content-platform-staging-db"
    WRANGLER_ENV="--env staging"
    ;;
  production)
    DB_NAME="modern-content-platform-db"
    WRANGLER_ENV=""
    ;;
  *)
    echo "Error: unknown environment '${ENV}'."
    echo "Allowed values: staging, production"
    exit 1
    ;;
esac

echo ""
echo "========================================"
echo "  D1 Remote Migration — ${ENV}"
echo "========================================"
echo ""

# ---------------------------------------------------------------------------
# Pre-flight: check that database_id is configured
# ---------------------------------------------------------------------------
if [[ "${ENV}" == "staging" ]]; then
  PLACEHOLDER="YOUR_STAGING_D1_DATABASE_ID"
else
  PLACEHOLDER="YOUR_PRODUCTION_D1_DATABASE_ID"
fi

if grep -q "${PLACEHOLDER}" "${REPO_ROOT}/wrangler.toml"; then
  echo "Error: wrangler.toml still contains the placeholder '${PLACEHOLDER}'."
  echo "Provision the D1 database first and update wrangler.toml."
  echo ""
  echo "  wrangler d1 create ${DB_NAME}"
  echo ""
  echo "See docs/operations/d1-provisioning.md for instructions."
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 1: List pending migrations
# ---------------------------------------------------------------------------
echo "Step 1/3  Listing pending migrations..."
echo ""
# shellcheck disable=SC2086
wrangler d1 migrations list ${DB_NAME} ${WRANGLER_ENV} --remote
echo ""

# ---------------------------------------------------------------------------
# Step 2: Apply migrations
# ---------------------------------------------------------------------------
echo "Step 2/3  Applying migrations to ${ENV}..."
echo ""
# shellcheck disable=SC2086
wrangler d1 migrations apply ${DB_NAME} ${WRANGLER_ENV} --remote
echo ""
echo "          Migrations applied."
echo ""

# ---------------------------------------------------------------------------
# Step 3: Verify schema
# ---------------------------------------------------------------------------
echo "Step 3/3  Verifying schema..."
echo ""
bash "${REPO_ROOT}/scripts/d1-verify-schema.sh" "${ENV}"

echo ""
echo "========================================"
echo "  Migration complete — ${ENV}"
echo "========================================"
echo ""
