#!/bin/zsh

set -euo pipefail

if [ ! -f .env.local ]; then
  echo ".env.local not found. Create it before running npm run dev:local." >&2
  exit 1
fi

set -a
. ./.env.local
set +a

port="${PORT:-3030}"
listen_pids="$(lsof -tiTCP:${port} -sTCP:LISTEN 2>/dev/null || true)"

# dev:local is a convenience command, so it reclaims the fixed local port first.
if [ -n "${listen_pids}" ]; then
  echo "Port ${port} is already in use. Stopping existing listener(s): ${listen_pids}"
  kill ${=listen_pids} 2>/dev/null || true
  sleep 1

  remaining_pids="$(lsof -tiTCP:${port} -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "${remaining_pids}" ]; then
    echo "Port ${port} is still busy. Force stopping listener(s): ${remaining_pids}"
    kill -9 ${=remaining_pids}
    sleep 1
  fi
fi

exec tsx watch src/main.ts
