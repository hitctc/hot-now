#!/usr/bin/env bash
set -euo pipefail

# Read the bearer token through stdin so it never appears in this process's arguments.
SERVICE="hot-now-prod-api-token"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v security >/dev/null 2>&1; then
  printf 'This helper requires the macOS Keychain security command.\n' >&2
  exit 2
fi

security find-generic-password -s "$SERVICE" -w | node "$SCRIPT_DIR/hotnow-api.mjs" "$@"
