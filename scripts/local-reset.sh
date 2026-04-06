#!/usr/bin/env bash
# scripts/local-reset.sh
#
# Resets the local Wrangler D1 database, applies all migrations, and reseeds
# sample data. Run this whenever you want a clean local state for development.
#
# Usage:
#   bash scripts/local-reset.sh
#
# Requirements:
#   - Wrangler CLI 3.x or later  (npm install -g wrangler)
#   - Run from the repository root directory
#
# What this script does:
#   1. Deletes the local SQLite file used by Wrangler for D1 emulation.
#   2. Applies all migrations in db/migrations/ in filename order.
#   3. Seeds topics from db/seeds/topics.sql.
#   4. Seeds sample alerts from db/seeds/sample_alerts.sql.
#   5. Prints a verification summary.

set -euo pipefail

DB_NAME="modern-content-platform-db"

# ---------------------------------------------------------------------------
# Resolve repo root (works regardless of the working directory)
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${REPO_ROOT}"

echo ""
echo "========================================"
echo "  Modern Content Platform — Local Reset "
echo "========================================"
echo ""

# ---------------------------------------------------------------------------
# Step 1: Delete the local D1 SQLite file so Wrangler starts fresh.
#
# Wrangler stores local D1 databases under:
#   .wrangler/state/v3/d1/<database-uuid>/db.sqlite
#
# Wrangler 3.x also stores a local-only alias under the project name inside:
#   .wrangler/state/v3/d1/
#
# Deleting the entire .wrangler/state/v3/d1/ subtree is the safest reset.
# ---------------------------------------------------------------------------
echo "Step 1/4  Deleting local D1 state..."

if [ -d "${REPO_ROOT}/.wrangler/state/v3/d1" ]; then
  rm -rf "${REPO_ROOT}/.wrangler/state/v3/d1"
  echo "          Local D1 state deleted."
else
  echo "          No local D1 state found — skipping delete."
fi

echo ""

# ---------------------------------------------------------------------------
# Step 2: Apply all migrations in order.
# ---------------------------------------------------------------------------
echo "Step 2/4  Applying migrations..."
wrangler d1 migrations apply "${DB_NAME}" --local
echo "          Migrations applied."
echo ""

# ---------------------------------------------------------------------------
# Step 3: Seed topics.
# ---------------------------------------------------------------------------
echo "Step 3/4  Seeding topics..."
wrangler d1 execute "${DB_NAME}" --local --file=db/seeds/topics.sql
echo "          Topics seeded."
echo ""

# ---------------------------------------------------------------------------
# Step 4: Seed sample alerts and daily_status.
# ---------------------------------------------------------------------------
echo "Step 4/4  Seeding sample alerts..."
wrangler d1 execute "${DB_NAME}" --local --file=db/seeds/sample_alerts.sql
echo "          Sample alerts seeded."
echo ""

# ---------------------------------------------------------------------------
# Verification summary
# ---------------------------------------------------------------------------
echo "========================================"
echo "  Verification"
echo "========================================"
echo ""

echo "Topics:"
wrangler d1 execute "${DB_NAME}" --local \
  --command "SELECT topic_slug, display_name, is_active FROM topics ORDER BY sort_order;"

echo ""
echo "Event clusters:"
wrangler d1 execute "${DB_NAME}" --local \
  --command "SELECT topic_slug, date_key, cluster_label, alert_count FROM event_clusters ORDER BY topic_slug, date_key;"

echo ""
echo "Alerts (count by topic):"
wrangler d1 execute "${DB_NAME}" --local \
  --command "SELECT topic_slug, COUNT(*) AS alert_count FROM alerts GROUP BY topic_slug ORDER BY topic_slug;"

echo ""
echo "Daily status:"
wrangler d1 execute "${DB_NAME}" --local \
  --command "SELECT topic_slug, date_key, page_state, alert_count, summary_available FROM daily_status ORDER BY topic_slug, date_key;"

echo ""
echo "========================================"
echo "  Local reset complete."
echo "  Run the full stack with:"
echo "    cd app && npm run build && cd .."
echo "    wrangler pages dev app/dist --d1=DB"
echo "========================================"
echo ""
