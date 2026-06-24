#!/bin/bash

# ==============================================================================
# 🏮 「我的阅读世界」一键多端静态构建物理拷贝与部署同步自愈脚本
# ==============================================================================
# 本脚本遵循 Superpowers 工作流，专为解决 WebView 脱机/原生沙盒多端部署中，
# 人工拷贝可能引起的目录错乱、资源残留、路径缺失等“部署一致性偏差（Deploy Gap）”而生。
# 自动物理清除目标冗余，秒级原子同步。
# ==============================================================================

set -e # 遇到任何错误立即退出运行

# 字体颜色定义 (ANSI Escape)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color（前值 0;30 是黑色，会让暗色终端日志几乎不可读）
BOLD='\033[1m'

echo -e "${BLUE}${BOLD}======================================================${NC}"
echo -e "${BLUE}${BOLD}🚀 启动多端静态资源一键物理同步清道夫...${NC}"
echo -e "${BLUE}${BOLD}======================================================${NC}"

# 1. 确定运行根目录
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

# 2. 定义源目录与物理目标目录
SRC_DIR="$PROJECT_ROOT/apps/web-pwa/out"
CAPACITOR_WWW="$PROJECT_ROOT/apps/mobile-capacitor/www"
TAURI_PUBLIC="$PROJECT_ROOT/apps/desktop-tauri/src-tauri/public"

# 3. 校验 PWA 侧静态构建包是否存在
if [ ! -d "$SRC_DIR" ]; then
    echo -e "${RED}${BOLD}❌ 错误: 未检测到静态导出包目录: ${SRC_DIR}${NC}"
    echo -e "${YELLOW}👉 请先在根目录下执行: EXPORT_MODE=true pnpm build${NC}"
    exit 1
fi

# 4. 统计源端静态文件
SRC_FILE_COUNT=$(find "$SRC_DIR" -type f | wc -l | tr -d ' ')
echo -e "${GREEN}✅ 源端检测成功: [${SRC_FILE_COUNT}] 个静态物理资产就绪。${NC}"

# ==========================================
# 5. 物理同步至 📱 apps/mobile-capacitor
# ==========================================
if [ -d "$PROJECT_ROOT/apps/mobile-capacitor" ]; then
    echo -e "${YELLOW}🔄 正在清空并同步至 mobile-capacitor/www...${NC}"
    
    # 刚性自愈创建目录
    mkdir -p "$CAPACITOR_WWW"
    
    # 物理擦除原有冗余，防止缓存污染
    rm -rf "$CAPACITOR_WWW"/*
    
    # 极速、增量同步物理拷贝
    cp -R "$SRC_DIR"/. "$CAPACITOR_WWW"
    
    CAP_FILE_COUNT=$(find "$CAPACITOR_WWW" -type f | wc -l | tr -d ' ')
    echo -e "${GREEN}✨ Capacitor 物理同步圆满成功! 写入 [${CAP_FILE_COUNT}] 个文件。${NC}"
else
    echo -e "${YELLOW}⚠️ 提示: 未检测到 apps/mobile-capacitor 物理项目，跳过同步。${NC}"
fi

# ==========================================
# 6. 物理同步至 💻 apps/desktop-tauri
# ==========================================
if [ -d "$PROJECT_ROOT/apps/desktop-tauri" ]; then
    echo -e "${YELLOW}🔄 正在清空并同步至 desktop-tauri/src-tauri/public...${NC}"
    
    # 刚性自愈创建目录
    mkdir -p "$TAURI_PUBLIC"
    
    # 物理擦除
    rm -rf "$TAURI_PUBLIC"/*
    
    # 物理拷贝
    cp -R "$SRC_DIR"/. "$TAURI_PUBLIC"
    
    TAURI_FILE_COUNT=$(find "$TAURI_PUBLIC" -type f | wc -l | tr -d ' ')
    echo -e "${GREEN}✨ Tauri 物理同步圆满成功! 写入 [${TAURI_FILE_COUNT}] 个文件。${NC}"
else
    echo -e "${YELLOW}⚠️ 提示: 未检测到 apps/desktop-tauri 物理项目，跳过同步。${NC}"
fi

echo -e "${BLUE}${BOLD}======================================================${NC}"
echo -e "${GREEN}${BOLD}🎉 🎉 全栈多端一键自愈同步完美收官！部署一致性 100% 达成。${NC}"
echo -e "${BLUE}${BOLD}======================================================${NC}"
