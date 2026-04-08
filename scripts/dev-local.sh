#!/bin/zsh

set -euo pipefail

echo "npm run dev:local 已退回兼容入口，后续开发和调试请直接使用 npm run dev。"
exec zsh ./scripts/dev.sh local
