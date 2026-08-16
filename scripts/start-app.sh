#!/usr/bin/env bash
#
# 阅读世界 —— 一键启动脚本
# 同时启动本地 API 与 Web 前端，并自动打开浏览器。
#
# 用法：
#   bash scripts/start-app.sh            # 开发模式（快速启动）
#   bash scripts/start-app.sh --prod     # 生产模式（先构建再启动）
#
# 可用环境变量：
#   API_PORT  Web 端口（默认 4000）
#   WEB_PORT  前端端口（默认 3000）
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_PORT="${API_PORT:-4000}"
WEB_PORT="${WEB_PORT:-3000}"
API_BASE="${API_BASE:-http://127.0.0.1:${API_PORT}}"
MODE="${1:-dev}"
LOG_DIR="$ROOT/.tmp"
mkdir -p "$LOG_DIR"
API_LOG="$LOG_DIR/app-api.log"
WEB_LOG="$LOG_DIR/app-web.log"

echo "🟢 阅读世界 · 一键启动（$MODE 模式）"
echo "  API → http://127.0.0.1:${API_PORT}"
echo "  Web → http://127.0.0.1:${WEB_PORT}"
echo "  日志 → ${LOG_DIR}/app-{api,web}.log"

# ---- 清理可能残留的旧进程 ----
pkill -f "nest start.*apps/api" 2>/dev/null || true
pkill -f "next dev.*apps/web-pwa" 2>/dev/null || true
sleep 1

cleanup() {
  echo ""
  echo "🛑 正在关闭服务…"
  kill "$API_PID" "$WEB_PID" 2>/dev/null || true
  # pnpm 可能已把 nest/next 作为子进程拉起来，pnpm 被杀后它们会残留；
  # 按端口精确清理（仅杀占用本脚本端口的进程，避免误伤其他项目）。
  sleep 1
  lsof -ti "tcp:${API_PORT}" 2>/dev/null | xargs kill -9 2>/dev/null || true
  lsof -ti "tcp:${WEB_PORT}" 2>/dev/null | xargs kill -9 2>/dev/null || true
  wait "$API_PID" "$WEB_PID" 2>/dev/null || true
  echo "已关闭。"
}
trap cleanup INT TERM

# ---- 启动 API ----
PORT="$API_PORT" API_HOST=127.0.0.1 \
  corepack pnpm --dir "$ROOT/apps/api" dev >"$API_LOG" 2>&1 &
API_PID=$!

# ---- 启动 Web ----
if [ "$MODE" = "--prod" ]; then
  echo "🔨 正在构建前端（生产模式）…"
  NEXT_PUBLIC_API_BASE_URL="$API_BASE" \
    corepack pnpm --dir "$ROOT/apps/web-pwa" build >"$LOG_DIR/app-web-build.log" 2>&1
  READING_WORLD_DISABLE_DEV_INDICATORS=1 NEXT_PUBLIC_API_BASE_URL="$API_BASE" \
    corepack pnpm --dir "$ROOT/apps/web-pwa" start --hostname 127.0.0.1 --port "$WEB_PORT" >"$WEB_LOG" 2>&1 &
  WEB_PID=$!
else
  READING_WORLD_DISABLE_DEV_INDICATORS=1 NEXT_PUBLIC_API_BASE_URL="$API_BASE" \
    corepack pnpm --dir "$ROOT/apps/web-pwa" dev --hostname 127.0.0.1 --port "$WEB_PORT" >"$WEB_LOG" 2>&1 &
  WEB_PID=$!
fi

# ---- 等待就绪 ----
echo "⏳ 等待服务就绪…"
ready=0
for _ in $(seq 1 90); do
  api_ok=0; web_ok=0
  curl -sf -o /dev/null "http://127.0.0.1:${API_PORT}/ai/status" && api_ok=1
  curl -sf -o /dev/null "http://127.0.0.1:${WEB_PORT}" && web_ok=1
  if [ "$api_ok" = "1" ] && [ "$web_ok" = "1" ]; then
    ready=1
    break
  fi
  # 若任一副进程退出则报错
  if ! kill -0 "$API_PID" 2>/dev/null || ! kill -0 "$WEB_PID" 2>/dev/null; then
    echo "❌ 服务异常退出，请查看日志："
    echo "  API: $API_LOG"
    echo "  Web: $WEB_LOG"
    exit 1
  fi
  sleep 1
done

if [ "$ready" = "1" ]; then
  echo "✅ 就绪！正在打开 http://127.0.0.1:${WEB_PORT}"
  echo "   （按 Ctrl+C 可停止全部服务）"
  # 尽力打开浏览器（失败不阻塞；CI 或 READING_WORLD_NO_OPEN=1 时跳过）
  if [ -z "${CI:-}" ] && [ -z "${READING_WORLD_NO_OPEN:-}" ]; then
    { command -v open >/dev/null 2>&1 && open "http://127.0.0.1:${WEB_PORT}"; } || true
  fi
else
  echo "⚠️  90 秒内未检测到全部服务就绪，请检查日志。"
fi

wait
