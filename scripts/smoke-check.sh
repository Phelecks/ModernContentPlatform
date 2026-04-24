#!/usr/bin/env bash
# scripts/smoke-check.sh
#
# Run pre-promotion smoke checks against a target environment.
#
# Usage:
#   bash scripts/smoke-check.sh staging
#   bash scripts/smoke-check.sh production
#   bash scripts/smoke-check.sh local
#
# Requirements:
#   - Wrangler CLI 3.x or later (npm install -g wrangler)
#   - python3 (used by d1-verify-schema.sh to parse Wrangler JSON output)
#   - For remote environments: authenticated via `wrangler login` or CLOUDFLARE_API_TOKEN
#   - For API and frontend checks: curl
#   - Run from the repository root directory
#
# What this script does:
#   1. Runs D1 schema verification (delegates to d1-verify-schema.sh).
#   2. Tests API endpoint availability.
#   3. Tests frontend URL availability.
#   4. Prints a pass/fail summary.
#
# Environment variables (optional):
#   STAGING_URL    — override the staging preview URL
#                    (default: https://staging.modern-content-platform.pages.dev)
#   PRODUCTION_URL — override the production URL
#                    (default: https://modern-content-platform.pages.dev)
#
# Exit codes:
#   0 — all checks passed
#   1 — one or more checks failed
#
# See docs/operations/promotion-workflow.md for the full promotion process.

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
  echo "  bash scripts/smoke-check.sh staging"
  echo "  bash scripts/smoke-check.sh production"
  echo "  bash scripts/smoke-check.sh local"
  exit 1
fi

case "${ENV}" in
  staging)
    BASE_URL="${STAGING_URL:-https://staging.modern-content-platform.pages.dev}"
    ;;
  production)
    BASE_URL="${PRODUCTION_URL:-https://modern-content-platform.pages.dev}"
    ;;
  local)
    BASE_URL="http://localhost:8788"
    ;;
  *)
    echo "Error: unknown environment '${ENV}'."
    echo "Allowed values: staging, production, local"
    exit 1
    ;;
esac

# Strip trailing slash from BASE_URL to avoid double-slash in constructed URLs
BASE_URL="${BASE_URL%/}"

echo ""
echo "========================================"
echo "  Smoke Check — ${ENV}"
echo "========================================"
echo ""

ERRORS=0
WARNINGS=0

# ---------------------------------------------------------------------------
# Temp file for schema verification output — cleaned up on exit
# ---------------------------------------------------------------------------
SCHEMA_OUTPUT=$(mktemp)
cleanup() { rm -f "${SCHEMA_OUTPUT}"; }
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Helper: record a check result
# ---------------------------------------------------------------------------
pass() {
  echo "  ✓ $1"
}

fail() {
  echo "  ✗ $1"
  ERRORS=$((ERRORS + 1))
}

warn() {
  echo "  ⚠ $1"
  WARNINGS=$((WARNINGS + 1))
}

# ---------------------------------------------------------------------------
# Check 1: D1 schema verification
# ---------------------------------------------------------------------------
echo "Check 1: D1 schema verification"
echo "--------------------------------"

if bash "${REPO_ROOT}/scripts/d1-verify-schema.sh" "${ENV}" > "${SCHEMA_OUTPUT}" 2>&1; then
  pass "D1 schema verification passed"
else
  fail "D1 schema verification failed — review output below"
  cat "${SCHEMA_OUTPUT}"
fi

echo ""

# ---------------------------------------------------------------------------
# Check 2: API endpoint availability
# ---------------------------------------------------------------------------
echo "Check 2: API endpoint availability"
echo "-----------------------------------"

check_api() {
  local endpoint="$1"
  local description="$2"
  local url="${BASE_URL}${endpoint}"

  local http_code
  http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "${url}" 2>/dev/null || echo "000")

  if [[ "${http_code}" == "200" ]]; then
    pass "${description} (${endpoint}) — HTTP ${http_code}"
  elif [[ "${http_code}" == "000" ]]; then
    fail "${description} (${endpoint}) — connection failed"
  else
    fail "${description} (${endpoint}) — HTTP ${http_code}"
  fi
}

check_api "/api/topics" "Topics API"

echo ""

# ---------------------------------------------------------------------------
# Check 3: Frontend availability
# ---------------------------------------------------------------------------
echo "Check 3: Frontend availability"
echo "------------------------------"

FRONTEND_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "${BASE_URL}/" 2>/dev/null || echo "000")

if [[ "${FRONTEND_CODE}" == "200" ]]; then
  pass "Frontend loads (${BASE_URL}/) — HTTP ${FRONTEND_CODE}"
else
  if [[ "${FRONTEND_CODE}" == "000" ]]; then
    fail "Frontend unreachable (${BASE_URL}/) — connection failed"
  else
    fail "Frontend returned unexpected status (${BASE_URL}/) — HTTP ${FRONTEND_CODE}"
  fi
fi

# Check SPA routing — a deep link should return 200 via the _redirects fallback
SPA_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "${BASE_URL}/topics/crypto" 2>/dev/null || echo "000")

if [[ "${SPA_CODE}" == "200" ]]; then
  pass "SPA routing (/topics/crypto) — HTTP ${SPA_CODE}"
elif [[ "${ENV}" == "local" ]]; then
  # Local may not have a built app or _redirects; downgrade to warning
  if [[ "${SPA_CODE}" == "000" ]]; then
    warn "SPA routing (/topics/crypto) — connection failed (may be expected for local without build)"
  else
    warn "SPA routing (/topics/crypto) — HTTP ${SPA_CODE} (may be expected for local without build)"
  fi
else
  # Staging and production must have working SPA routing
  if [[ "${SPA_CODE}" == "000" ]]; then
    fail "SPA routing (/topics/crypto) — connection failed"
  else
    fail "SPA routing (/topics/crypto) — HTTP ${SPA_CODE}"
  fi
fi

echo ""

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
if [[ "${ERRORS}" -eq 0 ]]; then
  echo "========================================"
  if [[ "${WARNINGS}" -gt 0 ]]; then
    echo "  ✓ All checks passed — ${ENV} (${WARNINGS} warning(s))"
  else
    echo "  ✓ All checks passed — ${ENV}"
  fi
  echo "========================================"
else
  echo "========================================"
  echo "  ✗ ${ERRORS} check(s) failed — ${ENV}"
  if [[ "${WARNINGS}" -gt 0 ]]; then
    echo "    ${WARNINGS} warning(s)"
  fi
  echo "========================================"
  exit 1
fi

echo ""
