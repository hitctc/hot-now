#!/bin/zsh

set -euo pipefail

mode="${1:-standard}"

# npm run dev 现在只认根目录 .env，避免双文件并存时到底哪份生效变得不透明。
if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

if [ -f .env.local ]; then
  echo "Ignoring deprecated .env.local; please move all local settings into .env." >&2
fi

if [ "${mode}" = "local" ]; then
  echo "npm run dev:local 已退回兼容入口，后续开发和调试请直接使用 npm run dev。"
fi

echo "Preparing client bundle..."
npm run build:client

# 开发态默认把 Vite dev server 挪到一个不常和现有前端工具链冲突的高位端口，减少本机端口撞车。
export HOT_NOW_CLIENT_DEV_ORIGIN="${HOT_NOW_CLIENT_DEV_ORIGIN:-http://127.0.0.1:35173}"
resolver_autostart="false"

if [ -z "${WECHAT_RESOLVER_BASE_URL:-}" ] && [ -z "${WECHAT_RESOLVER_TOKEN:-}" ]; then
  export WECHAT_RESOLVER_BASE_URL="http://127.0.0.1:4040"
  export WECHAT_RESOLVER_TOKEN="hot-now-dev-resolver-token"
  resolver_autostart="true"
  echo "Using built-in local wechat resolver at ${WECHAT_RESOLVER_BASE_URL}."
elif [ -n "${WECHAT_RESOLVER_BASE_URL:-}" ] && [ -n "${WECHAT_RESOLVER_TOKEN:-}" ]; then
  echo "Using configured wechat resolver at ${WECHAT_RESOLVER_BASE_URL}."
else
  echo "WECHAT_RESOLVER_BASE_URL and WECHAT_RESOLVER_TOKEN must be provided together." >&2
  exit 1
fi

client_dev_host="$(
  node -e "const url = new URL(process.argv[1]); console.log(url.hostname);" "${HOT_NOW_CLIENT_DEV_ORIGIN}"
)"
client_dev_port="$(
  node -e "const url = new URL(process.argv[1]); console.log(url.port || (url.protocol === 'https:' ? '443' : '80'));" "${HOT_NOW_CLIENT_DEV_ORIGIN}"
)"
resolver_host="$(
  node -e "const url = new URL(process.argv[1]); console.log(url.hostname === 'localhost' ? '127.0.0.1' : url.hostname);" "${WECHAT_RESOLVER_BASE_URL}"
)"
resolver_port="$(
  node -e "const url = new URL(process.argv[1]); console.log(url.port || (url.protocol === 'https:' ? '443' : '80'));" "${WECHAT_RESOLVER_BASE_URL}"
)"
server_port="${PORT:-3030}"

reclaim_listen_port() {
  local port="$1"
  local listen_pids
  local remaining_pids

  listen_pids="$(lsof -tiTCP:${port} -sTCP:LISTEN 2>/dev/null || true)"

  if [ -z "${listen_pids}" ]; then
    return 0
  fi

  echo "Port ${port} is already in use. Stopping existing listener(s): ${listen_pids}"
  kill ${=listen_pids} 2>/dev/null || true

  # 先给开发进程一个短暂的清理窗口；如果还占着端口，再强制停止，避免 npm run dev 卡在旧监听上。
  for _ in {1..10}; do
    remaining_pids="$(lsof -tiTCP:${port} -sTCP:LISTEN 2>/dev/null || true)"

    if [ -z "${remaining_pids}" ]; then
      return 0
    fi

    sleep 0.2
  done

  remaining_pids="$(lsof -tiTCP:${port} -sTCP:LISTEN 2>/dev/null || true)"

  if [ -n "${remaining_pids}" ]; then
    echo "Port ${port} is still busy. Force stopping listener(s): ${remaining_pids}"
    kill -9 ${=remaining_pids}
  fi

  for _ in {1..10}; do
    remaining_pids="$(lsof -tiTCP:${port} -sTCP:LISTEN 2>/dev/null || true)"

    if [ -z "${remaining_pids}" ]; then
      return 0
    fi

    sleep 0.2
  done

  remaining_pids="$(lsof -tiTCP:${port} -sTCP:LISTEN 2>/dev/null || true)"

  if [ -n "${remaining_pids}" ]; then
    echo "Port ${port} is still busy after cleanup: ${remaining_pids}" >&2
    exit 1
  fi
}

client_pid=""
server_pid=""
resolver_pid=""

cleanup() {
  if [ -n "${server_pid}" ] && kill -0 "${server_pid}" 2>/dev/null; then
    kill "${server_pid}" 2>/dev/null || true
  fi

  if [ -n "${resolver_pid}" ] && kill -0 "${resolver_pid}" 2>/dev/null; then
    kill "${resolver_pid}" 2>/dev/null || true
  fi

  if [ -n "${client_pid}" ] && kill -0 "${client_pid}" 2>/dev/null; then
    kill "${client_pid}" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

reclaim_listen_port "${server_port}"
reclaim_listen_port "${client_dev_port}"

if [ "${resolver_autostart}" = "true" ]; then
  reclaim_listen_port "${resolver_port}"
fi

if [ "${resolver_autostart}" = "true" ]; then
  echo "Starting local wechat resolver on ${WECHAT_RESOLVER_BASE_URL}..."
  npm run dev:wechat-resolver &
  resolver_pid=$!
fi

if [ -n "${resolver_pid}" ]; then
  for _ in {1..60}; do
    if curl -fsS "${WECHAT_RESOLVER_BASE_URL}/health" >/dev/null 2>&1; then
      break
    fi

    if ! kill -0 "${resolver_pid}" 2>/dev/null; then
      wait "${resolver_pid}"
      exit $?
    fi

    sleep 0.5
  done

  if ! curl -fsS "${WECHAT_RESOLVER_BASE_URL}/health" >/dev/null 2>&1; then
    echo "Timed out waiting for local wechat resolver at ${WECHAT_RESOLVER_BASE_URL}/health" >&2
    exit 1
  fi
fi

echo "Starting Vite dev server on ${HOT_NOW_CLIENT_DEV_ORIGIN}..."
npm run dev:client -- --host "${client_dev_host}" --port "${client_dev_port}" --strictPort &
client_pid=$!

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
  if [ -n "${resolver_pid}" ] && ! kill -0 "${resolver_pid}" 2>/dev/null; then
    wait "${resolver_pid}"
    exit $?
  fi

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
