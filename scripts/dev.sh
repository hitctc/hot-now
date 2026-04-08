#!/bin/zsh

set -euo pipefail

mode="${1:-standard}"

if [ "${mode}" = "local" ] && [ ! -f .env.local ]; then
  echo ".env.local not found. Create it before running npm run dev:local." >&2
  exit 1
fi

if [ -f .env.local ]; then
  # 本地开发默认沿用 .env.local，避免 dev 和 dev:local 在环境装载上出现两套语义。
  set -a
  . ./.env.local
  set +a
fi

echo "Preparing client bundle..."
npm run build:client

export HOT_NOW_CLIENT_DEV_ORIGIN="${HOT_NOW_CLIENT_DEV_ORIGIN:-http://127.0.0.1:5173}"

client_dev_host="$(
  node -e "const url = new URL(process.argv[1]); console.log(url.hostname);" "${HOT_NOW_CLIENT_DEV_ORIGIN}"
)"
client_dev_port="$(
  node -e "const url = new URL(process.argv[1]); console.log(url.port || (url.protocol === 'https:' ? '443' : '80'));" "${HOT_NOW_CLIENT_DEV_ORIGIN}"
)"
server_port="${PORT:-3030}"

has_listening_port() {
  local port="$1"
  local listen_pids

  listen_pids="$(lsof -tiTCP:${port} -sTCP:LISTEN 2>/dev/null || true)"
  [ -n "${listen_pids}" ]
}

reclaim_listen_port() {
  local port="$1"
  local listen_pids

  listen_pids="$(lsof -tiTCP:${port} -sTCP:LISTEN 2>/dev/null || true)"

  if [ -z "${listen_pids}" ]; then
    return 0
  fi

  echo "Port ${port} is already in use. Asking existing listener(s) to exit cleanly: ${listen_pids}"
  kill ${=listen_pids} 2>/dev/null || true

  for _ in {1..20}; do
    local remaining_pids
    remaining_pids="$(lsof -tiTCP:${port} -sTCP:LISTEN 2>/dev/null || true)"

    if [ -z "${remaining_pids}" ]; then
      return 0
    fi

    sleep 0.5
  done

  local remaining_pids
  remaining_pids="$(lsof -tiTCP:${port} -sTCP:LISTEN 2>/dev/null || true)"

  if [ -n "${remaining_pids}" ]; then
    echo "Port ${port} is still busy. Force stopping listener(s): ${remaining_pids}"
    kill -9 ${=remaining_pids}
    sleep 1
  fi
}

if [ "${mode}" = "local" ]; then
  # dev:local 是固定端口的便捷入口，所以前后端两个监听端口都要抢回。
  reclaim_listen_port "${server_port}"
  reclaim_listen_port "${client_dev_port}"
fi

client_pid=""
server_pid=""
reused_client_dev_server="false"

cleanup() {
  if [ -n "${server_pid}" ] && kill -0 "${server_pid}" 2>/dev/null; then
    kill "${server_pid}" 2>/dev/null || true
  fi

  if [ -n "${client_pid}" ] && kill -0 "${client_pid}" 2>/dev/null; then
    kill "${client_pid}" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

if [ "${mode}" != "local" ] && has_listening_port "${client_dev_port}"; then
  if curl -fsS "${HOT_NOW_CLIENT_DEV_ORIGIN}/client/@vite/client" >/dev/null 2>&1; then
    echo "Reusing existing Vite dev server at ${HOT_NOW_CLIENT_DEV_ORIGIN}."
    reused_client_dev_server="true"
  else
    echo "Port ${client_dev_port} is already in use, but it is not the expected HotNow Vite dev server." >&2
    echo "Please free that port or change HOT_NOW_CLIENT_DEV_ORIGIN before running npm run dev." >&2
    exit 1
  fi
fi

if [ "${reused_client_dev_server}" != "true" ]; then
  echo "Starting Vite dev server on ${HOT_NOW_CLIENT_DEV_ORIGIN}..."
  npm run dev:client -- --host "${client_dev_host}" --port "${client_dev_port}" --strictPort &
  client_pid=$!
fi

for _ in {1..60}; do
  if curl -fsS "${HOT_NOW_CLIENT_DEV_ORIGIN}/client/" >/dev/null 2>&1; then
    break
  fi

  if [ -n "${client_pid}" ] && ! kill -0 "${client_pid}" 2>/dev/null; then
    wait "${client_pid}"
    exit $?
  fi

  sleep 0.5
done

if ! curl -fsS "${HOT_NOW_CLIENT_DEV_ORIGIN}/client/" >/dev/null 2>&1; then
  echo "Timed out waiting for Vite dev server at ${HOT_NOW_CLIENT_DEV_ORIGIN}/client/" >&2
  exit 1
fi

echo "Starting backend server on http://127.0.0.1:${server_port}..."
tsx watch src/main.ts &
server_pid=$!

while true; do
  if [ -n "${client_pid}" ] && ! kill -0 "${client_pid}" 2>/dev/null; then
    wait "${client_pid}"
    exit $?
  fi

  if ! kill -0 "${server_pid}" 2>/dev/null; then
    wait "${server_pid}"
    exit $?
  fi

  sleep 1
done
