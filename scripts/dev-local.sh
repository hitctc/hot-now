#!/bin/zsh

set -euo pipefail

echo "启动本地后端模式，不代理 HotNow 正式 API；这不等同断网，数据库路径仍由环境变量和配置决定。"
exec zsh ./scripts/dev.sh local
