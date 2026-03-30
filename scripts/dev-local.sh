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
  echo "Port ${port} is already in use. Asking existing listener(s) to exit cleanly: ${listen_pids}"
  kill ${=listen_pids} 2>/dev/null || true

  for _ in {1..20}; do
    remaining_pids="$(lsof -tiTCP:${port} -sTCP:LISTEN 2>/dev/null || true)"

    if [ -z "${remaining_pids}" ]; then
      break
    fi

    sleep 0.5
  done

  remaining_pids="$(lsof -tiTCP:${port} -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "${remaining_pids}" ]; then
    echo "Port ${port} is still busy. Force stopping listener(s): ${remaining_pids}"
    kill -9 ${=remaining_pids}
    sleep 1
  fi
fi

exec tsx watch src/main.ts
