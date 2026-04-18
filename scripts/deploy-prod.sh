#!/usr/bin/env bash
set -euo pipefail

# This deploy entry only updates the code tree under /srv/hot-now/app.
# shared/data and shared/.env stay manual so production state cannot be overwritten by release syncs.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEPLOY_LOCAL_ENV_FILE="${REPO_ROOT}/.deploy.local.env"

# Load local deploy defaults from an ignored file so daily release can stay a one-command workflow.
if [[ -f "${DEPLOY_LOCAL_ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${DEPLOY_LOCAL_ENV_FILE}"
fi

DEPLOY_HOST="${HOT_NOW_DEPLOY_HOST:-}"
DEPLOY_USER="${HOT_NOW_DEPLOY_USER:-}"
DEPLOY_APP_DIR="${HOT_NOW_DEPLOY_APP_DIR:-/srv/hot-now/app}"
DEPLOY_SERVICE="${HOT_NOW_DEPLOY_SERVICE:-hot-now}"
DEPLOY_HEALTH_URL="${HOT_NOW_DEPLOY_HEALTH_URL:-http://127.0.0.1:3030/health}"
REMOTE_TARGET="${DEPLOY_USER}@${DEPLOY_HOST}"

if [[ -z "${DEPLOY_HOST}" ]]; then
  echo "Missing required env: HOT_NOW_DEPLOY_HOST" >&2
  exit 1
fi

if [[ -z "${DEPLOY_USER}" ]]; then
  echo "Missing required env: HOT_NOW_DEPLOY_USER" >&2
  exit 1
fi

echo "Deploy target: ${REMOTE_TARGET}:${DEPLOY_APP_DIR}"

cd "${REPO_ROOT}"

rsync -az --delete \
  --exclude ".git" \
  --exclude ".vscode" \
  --exclude "node_modules" \
  --exclude "dist" \
  --exclude "data" \
  --exclude ".env" \
  --exclude ".DS_Store" \
  ./ "${REMOTE_TARGET}:${DEPLOY_APP_DIR}/"

ssh "${REMOTE_TARGET}" \
  "set -euo pipefail
  cd '${DEPLOY_APP_DIR}'
  npm ci
  npm run build
  if ! sudo -n systemctl restart '${DEPLOY_SERVICE}'; then
    echo 'Passwordless sudo for systemctl restart is not configured.' >&2
    echo 'Install the deploy sudoers rule from deploy/sudoers/hot-now-systemctl.' >&2
    exit 1
  fi
  sudo -n systemctl status '${DEPLOY_SERVICE}' --no-pager
  for attempt in 1 2 3 4 5; do
    if curl -fsS '${DEPLOY_HEALTH_URL}'; then
      exit 0
    fi
    sleep 2
  done
  echo 'Health check failed after restart' >&2
  exit 1"
