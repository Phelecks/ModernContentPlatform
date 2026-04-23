#!/usr/bin/env bash
# ==============================================================================
# n8n Workflow Import Script
#
# Imports all platform workflow JSON files into a running n8n instance using
# the n8n CLI (executed inside the Docker container).
#
# Usage:
#
#   # Import into production/staging stack
#   bash scripts/n8n-workflow-import.sh production
#
#   # Import into the local development stack
#   bash scripts/n8n-workflow-import.sh local
#
# Prerequisites:
#   - The target n8n stack must be running (docker compose up).
#   - Workflow JSON files must exist in workflows/n8n/.
#
# What this script does:
#   1. Detects the n8n container name from the chosen compose file.
#   2. Copies each workflow JSON file into the container.
#   3. Runs `n8n import:workflow --input=<file>` for each file.
#   4. Prints a summary of imported workflows.
#
# After import:
#   - Open the n8n editor and note the assigned workflow IDs.
#   - Set the workflow ID variables in n8n Settings → Variables.
#   - Activate the orchestrators.
#
# See docs/operations/n8n-deployment.md for the full deployment guide.
# ==============================================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKFLOW_DIR="${REPO_ROOT}/workflows/n8n"

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
ENV="${1:-}"

if [[ -z "$ENV" ]]; then
  echo "Usage: bash scripts/n8n-workflow-import.sh <environment>"
  echo ""
  echo "Environments:"
  echo "  local       — import into the local Docker n8n (docker-compose.yml)"
  echo "  production  — import into the production Docker n8n (docker-compose.production.yml)"
  exit 1
fi

case "$ENV" in
  local)
    COMPOSE_FILE="${REPO_ROOT}/n8n/docker-compose.yml"
    SERVICE_NAME="n8n"
    ;;
  production)
    COMPOSE_FILE="${REPO_ROOT}/n8n/docker-compose.production.yml"
    SERVICE_NAME="n8n"
    ;;
  *)
    echo "Error: Unknown environment '${ENV}'. Use 'local' or 'production'."
    exit 1
    ;;
esac

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Error: Compose file not found: ${COMPOSE_FILE}"
  exit 1
fi

# ---------------------------------------------------------------------------
# Detect the running container
# ---------------------------------------------------------------------------
CONTAINER_ID=$(docker compose -f "$COMPOSE_FILE" ps -q "$SERVICE_NAME" 2>/dev/null || true)

if [[ -z "$CONTAINER_ID" ]]; then
  echo "Error: n8n container is not running. Start it first:"
  echo ""
  if [[ "$ENV" == "local" ]]; then
    echo "  docker compose -f n8n/docker-compose.yml --env-file .env up -d"
  else
    echo "  docker compose -f n8n/docker-compose.production.yml --env-file n8n/.env.production up -d"
  fi
  exit 1
fi

echo "=== n8n Workflow Import ==="
echo "Environment:  ${ENV}"
echo "Container:    ${CONTAINER_ID:0:12}"
echo "Workflow dir: ${WORKFLOW_DIR}"
echo ""

# ---------------------------------------------------------------------------
# Collect workflow JSON files in the recommended import order:
#   1. shared/ (failure notifier — referenced by all other workflows)
#   2. intraday/ modules (01-11, excluding orchestrator and adapters)
#   3. intraday/ orchestrator
#   4. daily/ modules (01-14, excluding orchestrator)
#   5. daily/ orchestrator
# ---------------------------------------------------------------------------
IMPORT_FILES=()
IMPORT_ORDER=()

# 1. Shared workflows
for f in "${WORKFLOW_DIR}"/shared/*.json; do
  [[ -f "$f" ]] && IMPORT_FILES+=("$f") && IMPORT_ORDER+=("shared/$(basename "$f")")
done

# 2. Intraday modules (not orchestrator, not adapters, not README)
for f in "${WORKFLOW_DIR}"/intraday/[0-9]*.json; do
  [[ -f "$f" ]] && IMPORT_FILES+=("$f") && IMPORT_ORDER+=("intraday/$(basename "$f")")
done

# 3. Intraday orchestrator
if [[ -f "${WORKFLOW_DIR}/intraday/orchestrator.json" ]]; then
  IMPORT_FILES+=("${WORKFLOW_DIR}/intraday/orchestrator.json")
  IMPORT_ORDER+=("intraday/orchestrator.json")
fi

# 4. Daily modules (not orchestrator)
for f in "${WORKFLOW_DIR}"/daily/[0-9]*.json; do
  [[ -f "$f" ]] && IMPORT_FILES+=("$f") && IMPORT_ORDER+=("daily/$(basename "$f")")
done

# 5. Daily orchestrator
if [[ -f "${WORKFLOW_DIR}/daily/orchestrator.json" ]]; then
  IMPORT_FILES+=("${WORKFLOW_DIR}/daily/orchestrator.json")
  IMPORT_ORDER+=("daily/orchestrator.json")
fi

if [[ ${#IMPORT_FILES[@]} -eq 0 ]]; then
  echo "Error: No workflow JSON files found in ${WORKFLOW_DIR}."
  exit 1
fi

echo "Found ${#IMPORT_FILES[@]} workflow file(s) to import."
echo ""

# ---------------------------------------------------------------------------
# Import each workflow
# ---------------------------------------------------------------------------
IMPORTED=0
FAILED=0

for i in "${!IMPORT_FILES[@]}"; do
  FILE="${IMPORT_FILES[$i]}"
  LABEL="${IMPORT_ORDER[$i]}"
  BASENAME="$(basename "$FILE")"

  # Copy file into the container
  docker cp "$FILE" "${CONTAINER_ID}:/tmp/${BASENAME}"

  # Import via the n8n CLI
  if docker exec "$CONTAINER_ID" n8n import:workflow --input="/tmp/${BASENAME}" 2>/dev/null; then
    echo "  ✓ ${LABEL}"
    IMPORTED=$((IMPORTED + 1))
  else
    echo "  ✗ ${LABEL} — import failed"
    FAILED=$((FAILED + 1))
  fi

  # Clean up the temp file inside the container
  docker exec "$CONTAINER_ID" rm -f "/tmp/${BASENAME}" 2>/dev/null || true
done

echo ""
echo "=== Import Summary ==="
echo "Imported: ${IMPORTED}"
echo "Failed:   ${FAILED}"
echo "Total:    ${#IMPORT_FILES[@]}"
echo ""

if [[ $FAILED -gt 0 ]]; then
  echo "⚠  Some workflows failed to import. Check the output above for details."
  echo "   Common causes: duplicate workflow IDs, invalid JSON, or n8n version mismatch."
  exit 1
fi

echo "✓ All workflows imported successfully."
echo ""
echo "Next steps:"
echo "  1. Open the n8n editor and note the workflow IDs assigned to each module."
echo "  2. Set the workflow ID variables in n8n Settings → Variables."
echo "     See workflows/n8n/intraday/README.md and docs/architecture/workflow-runtime-variables.md"
echo "     for the full list of required variables."
echo "  3. Configure credentials (CloudflareD1Api, OpenAiApi, TelegramBotApi, etc.)."
echo "  4. Activate the intraday and daily orchestrators."
