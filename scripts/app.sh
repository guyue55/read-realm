#!/usr/bin/env bash
# 阅读世界 —— 统一运维入口（初始化 / 启动 / 停止 / 重启 / 状态 / 日志）
#
# 用法：
#   bash scripts/app.sh <命令> [选项]
#
# 命令：
#   init                  环境检查 + 安装依赖 + 准备数据目录 + 生成 .env
#   start                 后台启动 API + Web（默认）
#   stop [api|web|all]    停止服务（默认 all）
#   restart               先停止再启动（选项透传给 start）
#   status                查看进程 / 端口 / 健康检查
#   logs [api|web|all]    查看日志（默认同时跟随 API 与 Web）
#   help                  显示本帮助
#
# start / restart 选项：
#   --prod        生产模式（先构建 Web 再启动）
#   --local       仅本机访问（强制 127.0.0.1）
#   --scan        就绪后自动扫描藏经阁维护目录并入阁
#   --foreground  前台运行，Ctrl+C 停止
#   --no-open     启动后不自动打开浏览器
#   --force       启动前清理占用端口的本项目残留进程（默认遇占用直接报错）
#
# init 选项：
#   --frozen        使用 --frozen-lockfile 严格安装（CI / 可复现）
#   --skip-install  只检查环境与目录，不安装依赖
#   --build         安装后额外构建全部工作区
#   --force-env     已存在 .env 时覆盖为默认模板
#
# logs 选项：
#   -n <行数>      显示最近 N 行（默认 50）
#   --no-follow    只打印不跟随
#
# 环境变量：API_PORT（默认 4000）/ WEB_PORT（默认 3000）/
#           READING_WORLD_NO_OPEN / READER_AUTO_SCAN /
#           READER_PUBLIC_LIBRARY_MAINTENANCE_KEY /
#           READER_PUBLIC_LIBRARY_MAINTENANCE_ALLOW_ANY /
#           READER_PUBLIC_LIBRARY_MAINTENANCE_ROOTS[_FILE]
#
# 说明：scripts/start-app.sh 是兼容旧命令的转发壳，等价于
#       `bash scripts/app.sh start --foreground`。
#
set -euo pipefail

usage() {
  awk 'NR>1 && /^#/ {sub(/^# ?/, ""); print; next} NR>1 {exit}' "$0"
}

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ---- 自动加载根目录 .env 与 .env.local（如存在）----
if [ -f "${ROOT}/.env" ]; then
  set -a
  # shellcheck source=/dev/null
  source "${ROOT}/.env"
  set +a
fi
if [ -f "${ROOT}/.env.local" ]; then
  set -a
  # shellcheck source=/dev/null
  source "${ROOT}/.env.local"
  set +a
fi

API_PORT="${API_PORT:-4000}"
WEB_PORT="${WEB_PORT:-3000}"

RUN_DIR="${ROOT}/.tmp"
PID_API="${RUN_DIR}/api.pid"
PID_WEB="${RUN_DIR}/web.pid"
LOG_API="${RUN_DIR}/api.log"
LOG_WEB="${RUN_DIR}/web.log"
BUILD_LOG="${RUN_DIR}/web-build.log"

# =====================================================================
# 共享工具
# =====================================================================

mkdir -p "${RUN_DIR}"

# pnpm 解析结果（仅 init / start 需要，故惰性解析；stop 必须不依赖 pnpm）
PNPM_BIN=()
PNPM_LABEL=""

resolve_pnpm() {
  if command -v corepack >/dev/null 2>&1 && corepack pnpm --version >/dev/null 2>&1; then
    PNPM_BIN=(corepack pnpm)
    PNPM_LABEL="corepack pnpm $(corepack pnpm --version 2>/dev/null)"
    return 0
  fi
  if command -v pnpm >/dev/null 2>&1; then
    PNPM_BIN=(pnpm)
    PNPM_LABEL="pnpm $(pnpm --version 2>/dev/null)"
    return 0
  fi
  return 1
}

# 仅匹配监听套接字，避免误伤浏览器/客户端在该端口上的连接
listeners_on() {
  lsof -ti "tcp:$1" -sTCP:LISTEN 2>/dev/null || true
}

process_command() {
  ps -o command= -p "$1" 2>/dev/null || true
}

# 判断某个 PID 是否属于本仓库启动的服务（命令行含仓库绝对路径）。
# 用于避免误杀恰好占用同一端口的其他项目进程。
looks_like_ours() {
  local cmd
  cmd="$(process_command "$1")"
  if [ -z "${cmd}" ]; then
    return 1
  fi
  case "${cmd}" in
    *"${ROOT}"*) return 0 ;;
  esac
  return 1
}

# 递归收集某个 PID 的全部后代（pnpm → nest/next → node server）
descendants() {
  local parent="$1" child
  for child in $(pgrep -P "${parent}" 2>/dev/null || true); do
    printf '%s\n' "${child}"
    descendants "${child}"
  done
}

dedupe() {
  printf '%s\n' $1 | awk 'NF && !seen[$0]++' | tr '\n' ' ' | sed 's/ *$//'
}

running_pid() {
  local pidfile="$1" pid=""
  if [ -f "${pidfile}" ]; then
    pid="$(cat "${pidfile}" 2>/dev/null || true)"
  fi
  if [ -n "${pid}" ] && kill -0 "${pid}" 2>/dev/null; then
    printf '%s' "${pid}"
    return 0
  fi
  return 1
}

# 检测局域网 IP（macOS en0/en1/en2 → Linux hostname -I）
detect_lan_ip() {
  local ip=""
  if command -v ipconfig >/dev/null 2>&1; then
    for iface in en0 en1 en2; do
      ip="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
      if [ -n "$ip" ]; then break; fi
    done
  fi
  if [ -z "$ip" ] && command -v hostname >/dev/null 2>&1; then
    ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  fi
  printf '%s' "$ip"
}

print_maintenance_roots() {
  if [ -n "${READER_PUBLIC_LIBRARY_MAINTENANCE_ROOTS_FILE:-}" ] && [ -f "${READER_PUBLIC_LIBRARY_MAINTENANCE_ROOTS_FILE}" ]; then
    echo "  📁 维护目录配置 → ${READER_PUBLIC_LIBRARY_MAINTENANCE_ROOTS_FILE}"
  elif [ -f "${ROOT}/data/public-library-roots.json" ]; then
    echo "  📁 维护目录配置 → data/public-library-roots.json"
  elif [ -f "${ROOT}/library-roots.json" ]; then
    echo "  📁 维护目录配置 → library-roots.json"
  elif [ -n "${READER_PUBLIC_LIBRARY_MAINTENANCE_ROOTS:-}" ]; then
    echo "  📁 维护目录配置 → 环境变量（READER_PUBLIC_LIBRARY_MAINTENANCE_ROOTS）"
  fi
}

# =====================================================================
# init —— 初始化
# =====================================================================
cmd_init() {
  local FROZEN=0 SKIP_INSTALL=0 DO_BUILD=0 FORCE_ENV=0

  while [ "$#" -gt 0 ]; do
    case "$1" in
      --frozen) FROZEN=1; shift ;;
      --skip-install) SKIP_INSTALL=1; shift ;;
      --build) DO_BUILD=1; shift ;;
      --force-env) FORCE_ENV=1; shift ;;
      -h|--help) usage; return 0 ;;
      *) echo "❌ init 未知参数：$1（可用：--frozen / --skip-install / --build / --force-env）" >&2; return 2 ;;
    esac
  done

  echo "🧰 阅读世界 · 初始化"
  echo "   仓库根目录 → ${ROOT}"

  # 1. Node.js
  if ! command -v node >/dev/null 2>&1; then
    echo "❌ 未检测到 node，请先安装 Node.js 20 或更高版本：https://nodejs.org" >&2
    return 1
  fi
  local node_major
  node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  if [ "${node_major}" -lt 20 ]; then
    echo "❌ 当前 Node 版本为 $(node -v)，本项目要求 Node.js 20+（CI 亦使用 20）" >&2
    return 1
  fi
  echo "  ✅ Node $(node -v)"

  # 2. pnpm
  if ! resolve_pnpm; then
    echo "❌ 未检测到 pnpm，也没有可用的 corepack。" >&2
    echo "   Node.js 20+ 自带 corepack；也可执行：npm i -g pnpm@9" >&2
    return 1
  fi
  echo "  ✅ ${PNPM_LABEL}"

  if [ ! -f "${ROOT}/pnpm-workspace.yaml" ]; then
    echo "❌ 未找到 pnpm-workspace.yaml，请确认本脚本位于仓库 scripts/ 目录内。" >&2
    return 1
  fi

  # 3. 依赖
  if [ "${SKIP_INSTALL}" = "1" ]; then
    echo "  ⏭  跳过依赖安装（--skip-install）"
  else
    if [ "${FROZEN}" = "1" ]; then
      echo "📦 安装依赖：pnpm install --frozen-lockfile"
      ( cd "${ROOT}" && "${PNPM_BIN[@]}" install --frozen-lockfile )
    else
      echo "📦 安装依赖：pnpm install"
      ( cd "${ROOT}" && "${PNPM_BIN[@]}" install )
    fi
    echo "  ✅ 依赖安装完成"
  fi

  # 4. 数据目录
  local data_dir="${ROOT}/data" sub
  for sub in chapter_blobs covers ai_blobs exports url_cache original_files; do
    mkdir -p "${data_dir}/storage/${sub}"
  done
  mkdir -p "${data_dir}/public-library/objects"
  echo "  ✅ 数据目录就绪"
  echo "       SQLite    → data/app.sqlite、data/public-library/catalog.sqlite"
  echo "       Blob 沙盒 → data/storage/、data/public-library/objects/"
  echo "       运行日志  → .tmp/"

  # 5. .env 模板
  local env_file="${ROOT}/.env"
  if [ -f "${env_file}" ] && [ "${FORCE_ENV}" != "1" ]; then
    echo "  ⏭  .env 已存在，保留原文件（需覆盖请加 --force-env）"
  else
    cat > "${env_file}" <<'ENVEOF'
# 阅读世界 —— 本地运行配置（由 scripts/app.sh init 生成，可按需修改）
# 本文件已被 .gitignore 忽略，不会提交到仓库。

# ---- 端口 ----
API_PORT=4000
WEB_PORT=3000

# ---- 藏经阁入阁 ----
# 前端「设置 → 同步口令」需填入同一口令才能入阁。
READER_PUBLIC_LIBRARY_MAINTENANCE_KEY=reader-lan-maintenance
# 1 = 无限制入阁（任何人可入阁，跳过口令）；0 = 仅口令匹配者可入阁。
READER_PUBLIC_LIBRARY_MAINTENANCE_ALLOW_ANY=1

# ---- 启动行为 ----
# READING_WORLD_NO_OPEN=1            # 启动后不自动打开浏览器
# READER_AUTO_SCAN=1                 # 启动后就绪即自动扫描藏经阁维护目录

# ---- 可选：数据目录与维护目录 ----
# READER_SQLITE_DB_PATH=
# READER_BLOB_STORAGE_PATH=
# READER_PUBLIC_LIBRARY_MAINTENANCE_ROOTS_FILE=./data/public-library-roots.json

# ---- 可选：跨域来源（逗号分隔，覆盖默认的本机 + 局域网私网放行策略）----
# CORS_ORIGIN=
ENVEOF
    echo "  ✅ 已生成默认配置 → .env"
  fi

  # 6. 可选构建
  if [ "${DO_BUILD}" = "1" ]; then
    echo "🔨 构建全部工作区（pnpm build）…"
    ( cd "${ROOT}" && "${PNPM_BIN[@]}" build )
    echo "  ✅ 构建完成（PWA 产物与 Service Worker 位于 apps/web-pwa/public）"
  else
    echo "  ⏭  跳过构建（需要生产产物请加 --build，或使用 app.sh start --prod）"
  fi

  echo ""
  echo "✅ 初始化完成。"
  echo "   启动 → bash scripts/app.sh start"
  echo "   状态 → bash scripts/app.sh status"
}

# =====================================================================
# start —— 启动
# =====================================================================
force_clean_port() {
  local port="$1" lp cleaned=""
  for lp in $(listeners_on "${port}"); do
    if looks_like_ours "${lp}"; then
      kill -TERM "${lp}" 2>/dev/null || true
      cleaned="${cleaned} ${lp}"
    fi
  done
  if [ -n "${cleaned}" ]; then
    sleep 1
    for lp in $(listeners_on "${port}"); do
      if looks_like_ours "${lp}"; then
        kill -KILL "${lp}" 2>/dev/null || true
      fi
    done
    echo "  🧹 已清理端口 ${port} 上的本项目残留：${cleaned}"
  fi
}

run_auto_scan() {
  local roots_json
  roots_json="$(curl -s -H "x-public-library-maintenance-key: ${MAINTENANCE_KEY}" \
    "http://127.0.0.1:${API_PORT}/public-library/maintenance/scan-roots" 2>/dev/null || true)"
  ROOTS_JSON="${roots_json}" MAINT_KEY="${MAINTENANCE_KEY}" API_PORT="${API_PORT}" node -e '
    const roots = (() => {
      try { return JSON.parse(process.env.ROOTS_JSON || "{}"); } catch { return {}; }
    })();
    const items = Array.isArray(roots.items) ? roots.items : [];
    if (items.length === 0) {
      console.log("   ℹ️ 未检测到配置的维护目录，跳过自动扫描。");
      process.exit(0);
    }
    (async () => {
      for (const item of items) {
        try {
          const res = await fetch(`http://127.0.0.1:${process.env.API_PORT}/public-library/maintenance/scans`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-public-library-maintenance-key": process.env.MAINT_KEY,
            },
            body: JSON.stringify({ rootId: item.rootId, rightsConfirmed: true }),
          });
          if (res.ok) console.log(`   🚀 已触发后台扫描任务 [${item.label}]`);
          else console.log(`   ⚠️ 扫描任务启动失败 [${item.label}]：HTTP ${res.status}`);
        } catch (err) {
          console.log(`   ⚠️ 扫描任务启动失败 [${item.label}]：${err.message}`);
        }
      }
    })();
  ' 2>/dev/null || true
}

# 全局：前台模式收尾时需要
API_PID=""
WEB_PID=""

cmd_start() {
  local MODE="dev" FOREGROUND=0 NO_OPEN="${READING_WORLD_NO_OPEN:-0}"
  local AUTO_SCAN="${READER_AUTO_SCAN:-0}" FORCE=0

  while [ "$#" -gt 0 ]; do
    case "$1" in
      --prod) MODE="prod"; shift ;;
      --local) MODE="local"; shift ;;
      --scan) AUTO_SCAN=1; shift ;;
      --foreground|-f) FOREGROUND=1; shift ;;
      --no-open) NO_OPEN=1; shift ;;
      --force) FORCE=1; shift ;;
      dev) MODE="dev"; shift ;;
      -h|--help) usage; return 0 ;;
      *) echo "❌ start 未知参数：$1" >&2; return 2 ;;
    esac
  done

  if ! resolve_pnpm; then
    echo "❌ 未检测到 pnpm / corepack，请先执行：bash scripts/app.sh init" >&2
    return 1
  fi

  # 清理失效 PID 文件
  local pidfile
  for pidfile in "${PID_API}" "${PID_WEB}"; do
    if [ -f "${pidfile}" ]; then
      if ! running_pid "${pidfile}" >/dev/null 2>&1; then
        rm -f "${pidfile}"
      fi
    fi
  done

  if running_pid "${PID_API}" >/dev/null 2>&1 || running_pid "${PID_WEB}" >/dev/null 2>&1; then
    echo "⚠️  检测到阅读世界服务已在运行。"
    echo "    重启：bash scripts/app.sh restart    停止：bash scripts/app.sh stop"
    return 0
  fi

  # 端口占用检查（--force 时先清理本项目残留）
  local pair name port occupied
  for pair in "API:${API_PORT}" "Web:${WEB_PORT}"; do
    name="${pair%%:*}"
    port="${pair##*:}"
    occupied="$(listeners_on "${port}")"
    if [ -n "${occupied}" ] && [ "${FORCE}" = "1" ]; then
      force_clean_port "${port}"
      occupied="$(listeners_on "${port}")"
    fi
    if [ -n "${occupied}" ]; then
      echo "❌ 端口 ${port}（${name}）已被占用（PID: ${occupied}）。" >&2
      echo "   若是本项目残留可加 --force 清理；否则请改 .env 端口或手动处理。" >&2
      return 1
    fi
  done

  # 监听地址
  local LAN_IP HOST PUBLIC_BASE API_BASE LAN_ENABLED
  LAN_IP="$(detect_lan_ip)"
  if [ "${MODE}" = "local" ]; then
    HOST="127.0.0.1"
    PUBLIC_BASE="http://127.0.0.1:${WEB_PORT}"
    API_BASE="http://127.0.0.1:${API_PORT}"
    LAN_ENABLED=0
  elif [ -n "${LAN_IP}" ] && [ "${LAN_IP}" != "127.0.0.1" ]; then
    HOST="0.0.0.0"
    PUBLIC_BASE="http://${LAN_IP}:${WEB_PORT}"
    API_BASE="http://${LAN_IP}:${API_PORT}"
    LAN_ENABLED=1
  else
    HOST="127.0.0.1"
    PUBLIC_BASE="http://127.0.0.1:${WEB_PORT}"
    API_BASE="http://127.0.0.1:${API_PORT}"
    LAN_ENABLED=0
  fi

  # 藏经阁口令与无限制入阁开关
  local MAINTENANCE_KEY="${READER_PUBLIC_LIBRARY_MAINTENANCE_KEY:-reader-lan-maintenance}"
  local ALLOW_ANY="${READER_PUBLIC_LIBRARY_MAINTENANCE_ALLOW_ANY:-1}"

  local mode_label="开发模式"
  if [ "${MODE}" = "prod" ]; then mode_label="生产模式"; fi
  if [ "${FOREGROUND}" = "1" ]; then mode_label="${mode_label}, 前台"; fi

  echo "🟢 阅读世界 · 启动（${mode_label}）"
  if [ "${LAN_ENABLED}" = "1" ]; then
    echo "  🌐 局域网可访问 → ${PUBLIC_BASE}"
    echo "  💻 本机访问     → http://127.0.0.1:${WEB_PORT}"
    echo "  🔌 API          → ${API_BASE}"
  else
    echo "  💻 本机访问 → ${PUBLIC_BASE}（仅本机可访问）"
  fi
  echo "  🔑 藏经阁入阁口令 → ${MAINTENANCE_KEY}（请在设置页把同步口令填成此值）"
  if [ "${ALLOW_ANY}" = "1" ]; then
    echo "  🚪 无限制入阁已开启（关闭：READER_PUBLIC_LIBRARY_MAINTENANCE_ALLOW_ANY=0）"
  fi
  print_maintenance_roots
  if [ "${AUTO_SCAN}" = "1" ]; then
    echo "  ⚡ 自动扫描已开启 → 服务就绪后将自动扫描维护目录并入阁"
  fi
  echo "  日志 → ${LOG_API} / ${LOG_WEB}"

  : > "${LOG_API}"
  : > "${LOG_WEB}"

  # 启动 API
  nohup env \
    PORT="${API_PORT}" \
    API_HOST="${HOST}" \
    READER_PUBLIC_LIBRARY_MAINTENANCE_KEY="${MAINTENANCE_KEY}" \
    READER_PUBLIC_LIBRARY_MAINTENANCE_ALLOW_ANY="${ALLOW_ANY}" \
    READER_PUBLIC_LIBRARY_MAINTENANCE_ROOTS="${READER_PUBLIC_LIBRARY_MAINTENANCE_ROOTS:-}" \
    READER_PUBLIC_LIBRARY_MAINTENANCE_ROOTS_FILE="${READER_PUBLIC_LIBRARY_MAINTENANCE_ROOTS_FILE:-}" \
    "${PNPM_BIN[@]}" --dir "${ROOT}/apps/api" dev \
    >>"${LOG_API}" 2>&1 </dev/null &
  API_PID=$!
  echo "${API_PID}" > "${PID_API}"

  # 启动 Web
  if [ "${MODE}" = "prod" ]; then
    echo "🔨 构建前端（生产模式）…"
    if ! NEXT_PUBLIC_API_BASE_URL="${API_BASE}" \
        "${PNPM_BIN[@]}" --dir "${ROOT}/apps/web-pwa" build >"${BUILD_LOG}" 2>&1; then
      echo "❌ 前端构建失败，日志：${BUILD_LOG}" >&2
      tail -n 20 "${BUILD_LOG}" 2>/dev/null >&2 || true
      kill "${API_PID}" 2>/dev/null || true
      rm -f "${PID_API}"
      return 1
    fi
    echo "  ✅ 构建完成"
    nohup env \
      READING_WORLD_DISABLE_DEV_INDICATORS=1 \
      NEXT_PUBLIC_API_BASE_URL="${API_BASE}" \
      "${PNPM_BIN[@]}" --dir "${ROOT}/apps/web-pwa" start --hostname "${HOST}" --port "${WEB_PORT}" \
      >>"${LOG_WEB}" 2>&1 </dev/null &
    WEB_PID=$!
  elif [ "${LAN_ENABLED}" = "1" ]; then
    nohup env \
      READING_WORLD_LAN=1 \
      READING_WORLD_DISABLE_DEV_INDICATORS=1 \
      NEXT_PUBLIC_API_BASE_URL="${API_BASE}" \
      "${PNPM_BIN[@]}" --dir "${ROOT}/apps/web-pwa" dev --hostname "${HOST}" --port "${WEB_PORT}" \
      >>"${LOG_WEB}" 2>&1 </dev/null &
    WEB_PID=$!
  else
    nohup env \
      READING_WORLD_DISABLE_DEV_INDICATORS=1 \
      NEXT_PUBLIC_API_BASE_URL="${API_BASE}" \
      "${PNPM_BIN[@]}" --dir "${ROOT}/apps/web-pwa" dev --hostname "${HOST}" --port "${WEB_PORT}" \
      >>"${LOG_WEB}" 2>&1 </dev/null &
    WEB_PID=$!
  fi
  echo "${WEB_PID}" > "${PID_WEB}"

  # 等待就绪
  echo "⏳ 等待服务就绪…"
  local READY=0 api_ok web_ok
  for _ in $(seq 1 90); do
    api_ok=0
    web_ok=0
    if curl -sf -o /dev/null "http://127.0.0.1:${API_PORT}/ai/status"; then api_ok=1; fi
    if curl -sf -o /dev/null "http://127.0.0.1:${WEB_PORT}"; then web_ok=1; fi
    if [ "${api_ok}" = "1" ] && [ "${web_ok}" = "1" ]; then
      READY=1
      break
    fi
    if ! kill -0 "${API_PID}" 2>/dev/null; then
      echo "❌ API 进程已退出，日志：${LOG_API}" >&2
      tail -n 20 "${LOG_API}" 2>/dev/null >&2 || true
      rm -f "${PID_API}" "${PID_WEB}"
      return 1
    fi
    if ! kill -0 "${WEB_PID}" 2>/dev/null; then
      echo "❌ Web 进程已退出，日志：${LOG_WEB}" >&2
      tail -n 20 "${LOG_WEB}" 2>/dev/null >&2 || true
      rm -f "${PID_API}" "${PID_WEB}"
      return 1
    fi
    sleep 1
  done

  if [ "${READY}" = "1" ]; then
    echo "✅ 就绪！${PUBLIC_BASE}"
    if [ "${LAN_ENABLED}" = "1" ]; then
      echo "   局域网设备请访问：${PUBLIC_BASE}（同一 Wi-Fi/局域网内）"
    fi
  else
    echo "⚠️  90 秒内未检测到全部服务就绪，服务仍在后台运行。"
    echo "   请查看日志：${LOG_API} / ${LOG_WEB}"
  fi

  # 自动扫描
  if [ "${AUTO_SCAN}" = "1" ]; then
    echo "🔍 正在自动触发藏经阁目录扫描…"
    run_auto_scan
  fi

  # 打开浏览器（失败不阻塞；CI 或 --no-open 时跳过）
  if [ "${NO_OPEN}" != "1" ] && [ -z "${CI:-}" ]; then
    if command -v open >/dev/null 2>&1; then
      open "${PUBLIC_BASE}" >/dev/null 2>&1 || true
    fi
  fi

  if [ "${FOREGROUND}" = "1" ]; then
    echo "   （前台模式：按 Ctrl+C 停止全部服务）"
    cleanup_fg() {
      echo ""
      echo "🛑 正在关闭服务…"
      kill "${API_PID}" "${WEB_PID}" 2>/dev/null || true
      sleep 1
      local port
      for port in "${API_PORT}" "${WEB_PORT}"; do
        lsof -ti "tcp:${port}" -sTCP:LISTEN 2>/dev/null | xargs kill -9 2>/dev/null || true
      done
      rm -f "${PID_API}" "${PID_WEB}"
      echo "已关闭。"
    }
    trap cleanup_fg INT TERM
    wait
  else
    echo "   已在后台运行。停止：bash scripts/app.sh stop    重启：bash scripts/app.sh restart"
  fi
}

# =====================================================================
# stop —— 停止
# =====================================================================
stop_one() {
  local name="$1" pidfile="$2" port="$3"
  local pid="" targets="" extra="" tree="" p="" children=""

  if [ -f "${pidfile}" ]; then
    pid="$(cat "${pidfile}" 2>/dev/null || true)"
    rm -f "${pidfile}"
  fi

  # 1) PID 文件记录的进程及其全部后代
  if [ -n "${pid}" ] && kill -0 "${pid}" 2>/dev/null; then
    tree="${pid}"
    children="$(descendants "${pid}")"
    if [ -n "${children}" ]; then
      tree="${tree}
${children}"
    fi
  fi
  tree="$(dedupe "${tree}")"

  # 2) 端口监听者：属于本进程树或本仓库的直接纳入，其余跳过并提示
  local lp
  for lp in $(listeners_on "${port}"); do
    case " ${tree} " in
      *" ${lp} "*)
        extra="${extra}
${lp}"
        ;;
      *)
        if looks_like_ours "${lp}"; then
          extra="${extra}
${lp}"
        else
          echo "  ⚠️  端口 ${port} 被非本项目进程占用（PID ${lp}），已跳过：$(process_command "${lp}" | cut -c1-90)"
        fi
        ;;
    esac
  done
  targets="$(dedupe "${tree}
${extra}")"

  if [ -z "${targets}" ]; then
    echo "  ⚪ ${name} 未在运行"
    return 0
  fi

  echo "  🛑 停止 ${name}（PID: ${targets}）…"
  kill -TERM ${targets} 2>/dev/null || true

  local i alive
  for i in $(seq 1 20); do
    alive=0
    for p in ${targets}; do
      if kill -0 "${p}" 2>/dev/null; then
        alive=1
      fi
    done
    if [ "${alive}" = "0" ]; then
      break
    fi
    sleep 0.5
  done

  local still=""
  for p in ${targets}; do
    if kill -0 "${p}" 2>/dev/null; then
      still="${still} ${p}"
    fi
  done
  still="$(dedupe "${still}")"

  if [ -n "${still}" ]; then
    echo "  ⚠️  ${name} 未在 10 秒内退出，强制结束：${still}"
    kill -KILL ${still} 2>/dev/null || true
    sleep 1
  fi

  # 3) 兜底：本项目进程若在端口上重生（新 PID），同样清理
  local reborn
  reborn="$(our_listeners_on "${port}" "${tree}")"
  if [ -n "${reborn}" ]; then
    echo "  🧹 清理端口 ${port} 上残留的本项目监听：${reborn}"
    kill -TERM ${reborn} 2>/dev/null || true
    sleep 1
    reborn="$(our_listeners_on "${port}" "${tree}")"
    if [ -n "${reborn}" ]; then
      kill -KILL ${reborn} 2>/dev/null || true
    fi
  fi

  echo "  ✅ ${name} 已停止"
}

our_listeners_on() {
  local port="$1" tree="$2" lp out=""
  for lp in $(listeners_on "${port}"); do
    case " ${tree} " in
      *" ${lp} "*)
        out="${out}
${lp}"
        continue
        ;;
    esac
    if looks_like_ours "${lp}"; then
      out="${out}
${lp}"
    fi
  done
  dedupe "${out}"
}

cmd_stop() {
  local TARGET="all"
  while [ "$#" -gt 0 ]; do
    case "$1" in
      all|api|web) TARGET="$1"; shift ;;
      -h|--help) usage; return 0 ;;
      *) echo "❌ stop 未知参数：$1（可用：api / web / all）" >&2; return 2 ;;
    esac
  done

  echo "🛑 阅读世界 · 停止"
  case "${TARGET}" in
    all)
      stop_one "API" "${PID_API}" "${API_PORT}"
      stop_one "Web" "${PID_WEB}" "${WEB_PORT}"
      ;;
    api) stop_one "API" "${PID_API}" "${API_PORT}" ;;
    web) stop_one "Web" "${PID_WEB}" "${WEB_PORT}" ;;
  esac
  echo "✅ 完成。"
}

# =====================================================================
# restart —— 重启
# =====================================================================
cmd_restart() {
  echo "🔄 阅读世界 · 重启"
  cmd_stop all
  sleep 1
  cmd_start "$@"
}

# =====================================================================
# status —— 状态
# =====================================================================
status_one() {
  local name="$1" port="$2" pidfile="$3" path="$4" pid="" proc="stopped" listener="no" health="no"
  if [ -f "${pidfile}" ]; then
    pid="$(cat "${pidfile}" 2>/dev/null || true)"
  fi
  if [ -n "${pid}" ] && kill -0 "${pid}" 2>/dev/null; then
    proc="running (PID ${pid})"
  fi
  if [ -n "$(listeners_on "${port}")" ]; then
    listener="yes ($(listeners_on "${port}" | tr '\n' ' '))"
  fi
  if curl -sf -o /dev/null "http://127.0.0.1:${port}${path}" 2>/dev/null; then
    health="ok"
  fi
  printf '  %-4s 进程=%-20s 端口 %-5s 监听=%-16s 健康检查=%s\n' \
    "${name}" "${proc}" "${port}" "${listener}" "${health}"

  if [ "${proc}" = "stopped" ] || [ "${health}" != "ok" ]; then
    return 1
  fi
  return 0
}

cmd_status() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      -h|--help) usage; return 0 ;;
      *) echo "❌ status 未知参数：$1" >&2; return 2 ;;
    esac
  done

  echo "📊 阅读世界 · 状态"
  local rc=0
  if ! status_one "API" "${API_PORT}" "${PID_API}" "/ai/status"; then rc=1; fi
  if ! status_one "Web" "${WEB_PORT}" "${PID_WEB}" "/"; then rc=1; fi

  if [ "${rc}" = "0" ]; then
    echo "  → 服务正常。"
  else
    echo "  → 未完全运行（启动：bash scripts/app.sh start）"
  fi
  return "${rc}"
}

# =====================================================================
# logs —— 日志
# =====================================================================
cmd_logs() {
  local target="all" lines=50 follow=1
  while [ "$#" -gt 0 ]; do
    case "$1" in
      all|api|web) target="$1"; shift ;;
      -n)
        if [ "$#" -lt 2 ]; then
          echo "❌ logs -n 需要一个行数参数" >&2
          return 2
        fi
        lines="$2"
        shift 2
        ;;
      --no-follow) follow=0; shift ;;
      -h|--help) usage; return 0 ;;
      *) echo "❌ logs 未知参数：$1" >&2; return 2 ;;
    esac
  done

  touch "${LOG_API}" "${LOG_WEB}"
  if [ "${follow}" = "1" ]; then
    case "${target}" in
      api) tail -n "${lines}" -f "${LOG_API}" ;;
      web) tail -n "${lines}" -f "${LOG_WEB}" ;;
      all) tail -n "${lines}" -f "${LOG_API}" "${LOG_WEB}" ;;
    esac
  else
    case "${target}" in
      api) tail -n "${lines}" "${LOG_API}" ;;
      web) tail -n "${lines}" "${LOG_WEB}" ;;
      all) tail -n "${lines}" "${LOG_API}" "${LOG_WEB}" ;;
    esac
  fi
}

# =====================================================================
# 分发
# =====================================================================
COMMAND="${1:-help}"
if [ "$#" -gt 0 ]; then
  shift
fi

case "${COMMAND}" in
  init) cmd_init "$@" ;;
  start) cmd_start "$@" ;;
  stop) cmd_stop "$@" ;;
  restart) cmd_restart "$@" ;;
  status) cmd_status "$@" ;;
  logs) cmd_logs "$@" ;;
  help|-h|--help) usage ;;
  *)
    echo "❌ 未知命令：${COMMAND}" >&2
    echo "" >&2
    usage >&2
    exit 2
    ;;
esac
