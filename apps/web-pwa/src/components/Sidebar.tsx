"use client";

import React from "react";
import { useRouteStore } from "@/components/RouteProvider";
import { useVirtualRouter } from "@/lib/route-store";

export function Sidebar() {
  const router = useVirtualRouter();
  const { currentView } = useRouteStore();

  const navItems = [
    {
      name: "书架",
      path: "library",
      icon: (
        <div className="w-2 h-2 rounded-full bg-[#678055] transition-opacity"></div>
      ),
    },
    {
      name: "发现",
      path: "search",
      icon: (
        <div className="w-2 h-2 rounded-full bg-[#678055] transition-opacity"></div>
      ),
    },
    {
      name: "导入",
      path: "import",
      icon: (
        <div className="w-2 h-2 rounded-full bg-[#678055] transition-opacity"></div>
      ),
    },
    {
      name: "笔记",
      path: "notes",
      icon: (
        <div className="w-2 h-2 rounded-full bg-[#678055] transition-opacity"></div>
      ),
    },
    {
      name: "设置",
      path: "settings",
      icon: (
        <div className="w-2 h-2 rounded-full bg-[#678055] transition-opacity"></div>
      ),
    },
  ];

  return (
    <aside className="hidden xl:flex w-[92px] h-[calc(100vh-64px)] bg-[#FBF8F0] border border-[#E4D9C9] rounded-[12px] flex-col items-center py-8 sticky top-8 shrink-0">
      <h1 className="text-xl font-bold text-[#526047] mb-8 font-serif">墨问</h1>

      <nav className="flex flex-col gap-6 items-center flex-1 w-full">
        {navItems.map((item) => {
          const isActive = currentView === item.path;
          return (
            <div
              key={item.path}
              onClick={() => router.push("/" + item.path)}
              className={`flex flex-col items-center gap-1 w-16 py-2 rounded-lg cursor-pointer transition-colors ${
                isActive ? "bg-[#E7EDE0]" : "hover:bg-[rgba(80,65,45,0.04)]"
              }`}
            >
              <div
                className={`w-2 h-2 rounded-full bg-[#678055] ${isActive ? "" : "opacity-0 group-hover:opacity-100"} transition-opacity`}
              ></div>
              <span className="text-[10px] text-[#526047] font-medium">
                {item.name}
              </span>
            </div>
          );
        })}
      </nav>

      {/* 侧边栏底部极简国风微章与悬浮卡（无任何折行文字） */}
      <div className="group relative flex flex-col items-center mt-auto cursor-pointer select-none">
        
        {/* 1. 墨香轮环微章：极细 SVG 环形进度条 + 松柏绿“墨”字圆形头像 */}
        <div className="relative w-12 h-12 flex items-center justify-center transition-transform duration-300 hover:scale-105 active:scale-95">
          {/* SVG 极细环形进度指示器（15 / 45 分钟即 33.3% 进度） */}
          <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 48 48">
            {/* 轨道背景：极其纤细淡雅的宣纸灰 */}
            <circle
              cx="24"
              cy="24"
              r="21"
              fill="none"
              stroke="rgba(80, 65, 45, 0.06)"
              strokeWidth="1.5"
            />
            {/* 进度弧线：淡雅暗金进度条 */}
            <circle
              cx="24"
              cy="24"
              r="21"
              fill="none"
              stroke="#E7B77A"
              strokeWidth="1.5"
              strokeDasharray={2 * Math.PI * 21}
              strokeDashoffset={2 * Math.PI * 21 * (1 - 15 / 45)}
              strokeLinecap="round"
              className="transition-all duration-500 ease-out"
            />
          </svg>
          
          {/* 内嵌的松柏绿极简圆形头像 */}
          <div className="w-9 h-9 rounded-full bg-[#678055] flex items-center justify-center text-white font-serif text-xs font-bold shadow-sm">
            墨
          </div>
        </div>

        {/* 2. 墨问阁详情 · 磨砂宣纸悬浮卡片（Hover 激活，大留白） */}
        <div className="absolute bottom-0 left-[110%] ml-4 w-56 p-4 rounded-xl border border-[#E4D9C9] bg-[rgba(251,248,240,0.96)] shadow-[0_12px_36px_rgba(80,65,45,0.12)] backdrop-blur-md scale-95 opacity-0 pointer-events-none group-hover:scale-100 group-hover:opacity-100 transition-all duration-300 origin-left z-50">
          {/* 小三角装饰 */}
          <div className="absolute top-1/2 -translate-y-1/2 -left-1 w-2 h-2 rotate-45 border-l border-b border-[#E4D9C9] bg-[#FBF8F0]" />
          
          <div className="relative font-serif">
            {/* 阁号与头像 */}
            <div className="flex items-center gap-3 pb-3 mb-3 border-b border-[#E4D9C9]/50">
              <div className="w-8 h-8 rounded-full bg-[#678055] flex items-center justify-center text-white text-[10px] font-bold">
                墨
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-[#2F2A24] truncate">漫游的夜</p>
                <p className="text-[9px] text-[#8C8375] tracking-wider">墨问阁主</p>
              </div>
            </div>

            {/* 阅读阅历多维数据 */}
            <div className="flex flex-col gap-2.5 text-[10px] text-[#526047]">
              <div className="flex items-center justify-between">
                <span className="text-[#8C8375]">🔥 连续展卷</span>
                <span className="font-semibold font-mono text-[#2F2A24]">18 天</span>
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-[#8C8375]">⏱️ 今日达成</span>
                  <span className="font-semibold font-mono text-[#2F2A24]">15 / 45 分钟</span>
                </div>
                {/* 卡片内嵌微型细进度条 */}
                <div className="h-1 w-full bg-[rgba(80,65,45,0.06)] rounded-full overflow-hidden">
                  <div className="h-full w-1/3 bg-[#E7B77A] rounded-full" />
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-[#E4D9C9]/30 pt-2 text-[9px] text-[#8C8375]">
                <span>📚 藏书：12 册</span>
                <span className="text-[#678055] flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-[#678055] animate-pulse" />
                  在线
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
