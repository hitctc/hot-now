#!/usr/bin/env bash
set -euo pipefail

# This helper only pulls a safe local copy of production data for debugging.
# It never rewrites the server and never touches the live local data root used by development.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEPLOY_LOCAL_ENV_FILE="${REPO_ROOT}/.deploy.local.env"

# Reuse the same ignored local deploy defaults as the release script so daily usage stays one-command.
if [[ -f "${DEPLOY_LOCAL_ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${DEPLOY_LOCAL_ENV_FILE}"
fi

PROD_HOST="${HOT_NOW_DEPLOY_HOST:-}"
PROD_USER="${HOT_NOW_DEPLOY_USER:-}"
REMOTE_DATA_DIR="${HOT_NOW_PULL_REMOTE_DATA_DIR:-/srv/hot-now/shared/data}"
LOCAL_SYNC_DIR="${HOT_NOW_PULL_LOCAL_DIR:-${REPO_ROOT}/data/prod-sync}"
REMOTE_TARGET="${PROD_USER}@${PROD_HOST}"

if [[ -z "${PROD_HOST}" ]]; then
  echo "Missing required env: HOT_NOW_DEPLOY_HOST" >&2
  exit 1
fi

if [[ -z "${PROD_USER}" ]]; then
  echo "Missing required env: HOT_NOW_DEPLOY_USER" >&2
  exit 1
fi

echo "Pull target: ${REMOTE_TARGET}:${REMOTE_DATA_DIR}"
echo "Local sync dir: ${LOCAL_SYNC_DIR}"

mkdir -p "${LOCAL_SYNC_DIR}"

# Pull the database as a standalone file so the local prod-sync copy is always explicit.
scp "${REMOTE_TARGET}:${REMOTE_DATA_DIR}/hot-now.sqlite" "${LOCAL_SYNC_DIR}/hot-now.sqlite"

# Pull reports with rsync so deletions on the server are mirrored in the local prod-sync snapshot.
mkdir -p "${LOCAL_SYNC_DIR}/reports"
rsync -az --delete \
  "${REMOTE_TARGET}:${REMOTE_DATA_DIR}/reports/" \
  "${LOCAL_SYNC_DIR}/reports/"

echo "Production data snapshot updated under ${LOCAL_SYNC_DIR}"
