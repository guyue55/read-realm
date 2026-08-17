#!/usr/bin/env bash
#
# 阅读世界 —— 一键启动脚本（支持局域网访问）
# 同时启动本地 API 与 Web 前端，并自动打开浏览器。
# 默认监听 0.0.0.0，局域网内其他设备（手机/平板/另一台电脑）可通过
# 打印出的局域网地址访问书架；检测不到局域网 IP 时自动回退为仅本机访问。
#
# 用法：
#   bash scripts/start-app.sh            # 开发模式（快速启动，默认局域网可访问）
#   bash scripts/start-app.sh --prod     # 生产模式（先构建再启动）
#   bash scripts/start-app.sh --local    # 仅本机访问（强制 127.0.0.1）
#
# 可用环境变量：
#   API_PORT  API 端口（默认 4000）
#   WEB_PORT  前端端口（默认 3000）
#   READING_WORLD_NO_OPEN=1  启动后不自动打开浏览器
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_PORT="${API_PORT:-4000}"
WEB_PORT="${WEB_PORT:-3000}"
MODE="${1:-dev}"
LOG_DIR="$ROOT/.tmp"
mkdir -p "$LOG_DIR"
API_LOG="$LOG_DIR/app-api.log"
WEB_LOG="$LOG_DIR/app-web.log"

# ---- 检测局域网 IP（macOS en0/en1/en2 → Linux hostname -I）----
detect_lan_ip() {
  local ip=""
  if command -v ipconfig >/dev/null 2>&1; then
    for iface in en0 en1 en2; do
      ip="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
      [ -n "$ip" ] && break
    done
  fi
  if [ -z "$ip" ] && command -v hostname >/dev/null 2>&1; then
    ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  fi
  printf '%s' "$ip"
}

LAN_IP="$(detect_lan_ip)"

# ---- 决定监听地址与对外地址 ----
if [ "$MODE" = "--local" ]; then
  # 强制仅本机
  HOST="127.0.0.1"
  PUBLIC_BASE="http://127.0.0.1:${WEB_PORT}"
  API_BASE="http://127.0.0.1:${API_PORT}"
  LAN_ENABLED=0
elif [ -n "$LAN_IP" ] && [ "$LAN_IP" != "127.0.0.1" ]; then
  # 局域网模式：监听所有网卡，API/前端对外地址用局域网 IP
  HOST="0.0.0.0"
  PUBLIC_BASE="http://${LAN_IP}:${WEB_PORT}"
  API_BASE="http://${LAN_IP}:${API_PORT}"
  LAN_ENABLED=1
else
  # 未检测到局域网 IP，回退仅本机
  HOST="127.0.0.1"
  PUBLIC_BASE="http://127.0.0.1:${WEB_PORT}"
  API_BASE="http://127.0.0.1:${API_PORT}"
  LAN_ENABLED=0
fi

# 藏经阁维护口令：默认提供一个本机/局域网自用口令，可用
# READER_PUBLIC_LIBRARY_MAINTENANCE_KEY 环境变量覆盖。
# 前端「藏经阁 → 入阁」需要把「设置 → 同步口令」填成同一个值才会放行。
# 「无限制入阁」默认开启：任何人都可入阁（跳过口令校验），可用
# READER_PUBLIC_LIBRARY_MAINTENANCE_ALLOW_ANY=0 关闭。
MAINTENANCE_KEY="${READER_PUBLIC_LIBRARY_MAINTENANCE_KEY:-reader-lan-maintenance}"
ALLOW_ANY="${READER_PUBLIC_LIBRARY_MAINTENANCE_ALLOW_ANY:-1}"

echo "🟢 阅读世界 · 一键启动（$MODE 模式）"
if [ "$LAN_ENABLED" = "1" ]; then
  echo "  🌐 局域网可访问 → ${PUBLIC_BASE}"
  echo "  💻 本机访问     → http://127.0.0.1:${WEB_PORT}"
  echo "  🔌 API          → ${API_BASE}"
else
  echo "  💻 本机访问 → ${PUBLIC_BASE}（未检测到局域网 IP，仅本机可访问）"
fi
echo "  🔑 藏经阁入阁口令 → ${MAINTENANCE_KEY}（请在设置页把同步口令填成此值即可入阁）"
if [ "$ALLOW_ANY" = "1" ]; then
  echo "  🚪 无限制入阁已开启 → 任何人都可入阁（关闭：READER_PUBLIC_LIBRARY_MAINTENANCE_ALLOW_ANY=0）"
fi
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

# ---- 启动 API（监听 0.0.0.0 / 127.0.0.1）----
PORT="$API_PORT" API_HOST="$HOST" \
  READER_PUBLIC_LIBRARY_MAINTENANCE_KEY="$MAINTENANCE_KEY" \
  READER_PUBLIC_LIBRARY_MAINTENANCE_ALLOW_ANY="$ALLOW_ANY" \
  corepack pnpm --dir "$ROOT/apps/api" dev >"$API_LOG" 2>&1 &
API_PID=$!

# ---- 启动 Web ----
if [ "$MODE" = "--prod" ]; then
  echo "🔨 正在构建前端（生产模式）…"
  NEXT_PUBLIC_API_BASE_URL="$API_BASE" \
    corepack pnpm --dir "$ROOT/apps/web-pwa" build >"$LOG_DIR/app-web-build.log" 2>&1
  READING_WORLD_DISABLE_DEV_INDICATORS=1 NEXT_PUBLIC_API_BASE_URL="$API_BASE" \
    corepack pnpm --dir "$ROOT/apps/web-pwa" start --hostname "$HOST" --port "$WEB_PORT" >"$WEB_LOG" 2>&1 &
  WEB_PID=$!
else
  # 局域网模式设 READING_WORLD_LAN=1，触发 next.config 放行 dev 资源来源
  if [ "$LAN_ENABLED" = "1" ]; then
    READING_WORLD_LAN=1 READING_WORLD_DISABLE_DEV_INDICATORS=1 NEXT_PUBLIC_API_BASE_URL="$API_BASE" \
      corepack pnpm --dir "$ROOT/apps/web-pwa" dev --hostname "$HOST" --port "$WEB_PORT" >"$WEB_LOG" 2>&1 &
  else
    READING_WORLD_DISABLE_DEV_INDICATORS=1 NEXT_PUBLIC_API_BASE_URL="$API_BASE" \
      corepack pnpm --dir "$ROOT/apps/web-pwa" dev --hostname "$HOST" --port "$WEB_PORT" >"$WEB_LOG" 2>&1 &
  fi
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
  echo "✅ 就绪！${PUBLIC_BASE}"
  if [ "$LAN_ENABLED" = "1" ]; then
    echo "   局域网设备请访问：${PUBLIC_BASE}（同一 Wi-Fi/局域网内）"
  fi
  echo "   （按 Ctrl+C 可停止全部服务）"
  # 尽力打开浏览器（失败不阻塞；CI 或 READING_WORLD_NO_OPEN=1 时跳过）
  if [ -z "${CI:-}" ] && [ -z "${READING_WORLD_NO_OPEN:-}" ]; then
    { command -v open >/dev/null 2>&1 && open "${PUBLIC_BASE}"; } || true
  fi
else
  echo "⚠️  90 秒内未检测到全部服务就绪，请检查日志。"
fi

wait
