#!/usr/bin/env bash
set -euo pipefail

# This helper keeps local debugging on a pulled production-like snapshot
# without pointing development directly at the live server data directory.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOCAL_SYNC_DIR="${HOT_NOW_PULL_LOCAL_DIR:-${REPO_ROOT}/data/prod-sync}"
LOCAL_DB_FILE="${LOCAL_SYNC_DIR}/hot-now.sqlite"
LOCAL_REPORTS_DIR="${LOCAL_SYNC_DIR}/reports"

# Fail fast with an explicit next step so the workflow stays one obvious command
# after the user has pulled the latest production snapshot.
if [[ ! -f "${LOCAL_DB_FILE}" ]]; then
  echo "Missing prod-sync database: ${LOCAL_DB_FILE}" >&2
  echo "Run ./scripts/pull-prod-data.sh first." >&2
  exit 1
fi

# Reports are optional for startup correctness, but keeping the directory check
# helps catch a half-synced snapshot before the user starts debugging.
if [[ ! -d "${LOCAL_REPORTS_DIR}" ]]; then
  echo "Missing prod-sync reports directory: ${LOCAL_REPORTS_DIR}" >&2
  echo "Run ./scripts/pull-prod-data.sh first." >&2
  exit 1
fi

cd "${REPO_ROOT}"

export HOT_NOW_DATABASE_FILE="${LOCAL_DB_FILE}"
export HOT_NOW_REPORT_DATA_DIR="${LOCAL_REPORTS_DIR}"

echo "Starting local dev against prod-sync snapshot:"
echo "  HOT_NOW_DATABASE_FILE=${HOT_NOW_DATABASE_FILE}"
echo "  HOT_NOW_REPORT_DATA_DIR=${HOT_NOW_REPORT_DATA_DIR}"

exec npm run dev
