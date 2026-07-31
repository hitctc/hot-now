#!/usr/bin/env bash
set -euo pipefail

# One-time production helper: back up the active HotNow site, enable HTTP/2, validate, then reload.
CONFIG_FILE="${1:-/etc/nginx/sites-enabled/hot-now}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo: sudo bash $0" >&2
  exit 1
fi

if [[ ! -f "${CONFIG_FILE}" ]]; then
  echo "Nginx config not found: ${CONFIG_FILE}" >&2
  exit 1
fi

# sites-enabled 通常是符号链接；修改真实目标可避免 sed -i 把链接替换成普通文件。
TARGET_FILE="$(readlink -f "${CONFIG_FILE}")"
if [[ -z "${TARGET_FILE}" || ! -f "${TARGET_FILE}" ]]; then
  echo "Unable to resolve Nginx config target: ${CONFIG_FILE}" >&2
  exit 1
fi

BACKUP_FILE="${TARGET_FILE}.pre-http2-$(date +%Y%m%d-%H%M%S)"
cp --preserve=mode,ownership,timestamps "${TARGET_FILE}" "${BACKUP_FILE}"

# The replacement is idempotent and only touches the two HotNow TLS listen directives.
sed -i \
  -e 's/listen 443 ssl;/listen 443 ssl http2;/' \
  -e 's/listen \[::\]:443 ssl;/listen [::]:443 ssl http2;/' \
  "${TARGET_FILE}"

rollback() {
  cp --preserve=mode,ownership,timestamps "${BACKUP_FILE}" "${TARGET_FILE}"
  nginx -t
  systemctl reload nginx
}

if ! nginx -t; then
  echo "Nginx validation failed; restoring ${BACKUP_FILE}" >&2
  rollback
  exit 1
fi

if ! systemctl reload nginx; then
  echo "Nginx reload failed; restoring ${BACKUP_FILE}" >&2
  rollback
  exit 1
fi

echo "HTTP/2 enabled. Backup: ${BACKUP_FILE}"
