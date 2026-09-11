#!/usr/bin/env bash
# 兼容转发壳：保留旧的 `bash scripts/start-app.sh ...` 命令不变。
# 等价于 `bash scripts/app.sh start --foreground "$@"`（前台运行 + 自动打开浏览器）。
#
# 新代码请直接使用统一入口：
#   bash scripts/app.sh start|stop|restart|status|logs|init
#
set -euo pipefail

SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "${SCRIPTS_DIR}/app.sh" start --foreground "$@"
