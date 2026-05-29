"use client";

import React, { useEffect, useState } from "react";

// 禅意人文提示词，舒缓读者心情，缓解等待焦虑
const ZEN_QUOTES = [
  "江上清风已至，正文正在赶来...",
  "水流心不竞，云在意俱迟。正为您载入书卷...",
  "读书之乐乐何如，绿满窗前草不除。书籍装帧中...",
  "风翻白浪花千片，雁点青天字一行。正在整理书页...",
  "清夜无尘，月色如银。静心片刻，马上读到...",
  "万卷古今消永日，一窗昏晓送流年。书架正在摆放..."
];

interface SkeletonLoaderProps {
  type?: "grid" | "list";
  count?: number; // 骨架卡片的数量
}

/**
 * 宣纸微光扫光骨架屏组件 (SkeletonLoader)
 * 支持网格 (Grid) 和列表 (List) 两种预设版面，以及人文随机文案
 * 复用 globals.css 中的 pulse-sweep 斜向匀速扫光呼吸动画
 */
export function SkeletonLoader({ type = "grid", count = 4 }: SkeletonLoaderProps) {
  const [quote, setZenQuote] = useState("");

  useEffect(() => {
    // 随机选择一句充满温度的禅意古诗词
    const randomIndex = Math.floor(Math.random() * ZEN_QUOTES.length);
    setZenQuote(ZEN_QUOTES[randomIndex]);
  }, []);

  return (
    <div className="w-full space-y-6">
      {/* 1. 禅意人文等待提示，优雅温润 */}
      <div className="flex flex-col items-center justify-center py-4 text-center">
        <span className="text-xs font-semibold tracking-widest text-[var(--ui-accent)] uppercase animate-pulse">
          🍃 墨问静思
        </span>
        <p className="mt-2 text-sm font-medium text-[var(--ui-muted)] font-reading-title">
          {quote || "水流心不竞，云在意俱迟..."}
        </p>
      </div>

      {/* 2. 骨架排版核心区域 */}
      {type === "grid" ? (
        // 网格骨架：模拟经典的书架书本矩阵
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: count }).map((_, index) => (
            <div
              key={index}
              className="ui-card flex flex-col justify-between rounded-[18px] p-5 border border-[rgba(80,65,45,0.06)] bg-white/60 min-h-[188px] relative overflow-hidden"
            >
              <div className="flex gap-4">
                {/* 仿真书籍封皮骨架 */}
                <div className="relative h-[116px] w-[78px] shrink-0 overflow-hidden rounded-[10px] bg-[rgba(80,65,45,0.05)]">
                  {/* 复用全局 pulse-sweep 扫光 */}
                  <div className="absolute inset-0 pulse-sweep" />
                </div>

                {/* 仿真文本段落骨架 */}
                <div className="flex-1 space-y-3 pt-1">
                  {/* 书名长条 */}
                  <div className="relative h-5 w-3/4 overflow-hidden rounded-md bg-[rgba(80,65,45,0.05)]">
                    <div className="absolute inset-0 pulse-sweep" />
                  </div>
                  {/* 作者中条 */}
                  <div className="relative h-4 w-1/2 overflow-hidden rounded-md bg-[rgba(80,65,45,0.03)]">
                    <div className="absolute inset-0 pulse-sweep" />
                  </div>
                  {/* 元数据标签骨架 */}
                  <div className="flex gap-2 pt-2">
                    <div className="relative h-4.5 w-10 overflow-hidden rounded bg-[rgba(80,65,45,0.04)]">
                      <div className="absolute inset-0 pulse-sweep" />
                    </div>
                    <div className="relative h-4.5 w-14 overflow-hidden rounded bg-[rgba(80,65,45,0.04)]">
                      <div className="absolute inset-0 pulse-sweep" />
                    </div>
                  </div>
                </div>
              </div>

              {/* 底部按钮栏骨架 */}
              <div className="mt-4 flex gap-2">
                <div className="relative h-9 flex-1 overflow-hidden rounded-full bg-[rgba(80,65,45,0.04)]">
                  <div className="absolute inset-0 pulse-sweep" />
                </div>
                <div className="relative h-9 w-12 overflow-hidden rounded-full bg-[rgba(80,65,45,0.04)]">
                  <div className="absolute inset-0 pulse-sweep" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        // 列表骨架：模拟扁平的书本项
        <div className="space-y-3">
          {Array.from({ length: count }).map((_, index) => (
            <div
              key={index}
              className="ui-card flex items-center justify-between rounded-[14px] px-4 py-3 border border-[rgba(80,65,45,0.05)] bg-white/60 min-h-[64px] relative overflow-hidden"
            >
              <div className="flex items-center gap-4 flex-1">
                {/* 扁平微缩图书骨架 */}
                <div className="relative h-10 w-7 shrink-0 overflow-hidden rounded-[4px] bg-[rgba(80,65,45,0.05)]">
                  <div className="absolute inset-0 pulse-sweep" />
                </div>

                <div className="flex-1 space-y-2">
                  {/* 书名 */}
                  <div className="relative h-4 w-1/3 overflow-hidden rounded bg-[rgba(80,65,45,0.05)]">
                    <div className="absolute inset-0 pulse-sweep" />
                  </div>
                  {/* 进度/字数 */}
                  <div className="relative h-3 w-1/4 overflow-hidden rounded bg-[rgba(80,65,45,0.03)]">
                    <div className="absolute inset-0 pulse-sweep" />
                  </div>
                </div>
              </div>

              {/* 右侧进度条与状态骨架 */}
              <div className="flex items-center gap-6">
                <div className="w-24 space-y-1.5 hidden sm:block">
                  <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-[rgba(80,65,45,0.04)]">
                    <div className="absolute inset-0 pulse-sweep" />
                  </div>
                  <div className="relative h-3 w-16 overflow-hidden rounded bg-[rgba(80,65,45,0.03)]">
                    <div className="absolute inset-0 pulse-sweep" />
                  </div>
                </div>
                <div className="relative h-8 w-16 overflow-hidden rounded-full bg-[rgba(80,65,45,0.04)]">
                  <div className="absolute inset-0 pulse-sweep" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
