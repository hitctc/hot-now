#!/bin/zsh

set -euo pipefail

echo "启动本地离线开发模式，不会访问正式 API。"
exec zsh ./scripts/dev.sh local
