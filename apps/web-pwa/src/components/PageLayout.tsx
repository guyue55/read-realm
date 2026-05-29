"use client";

import React, { useEffect, useState } from "react";
import { loadReaderSettings } from "@/lib/reader-settings";
import { AppHeader } from "@/components/AppHeader";
import { Sidebar } from "@/components/Sidebar";

export interface PageLayoutProps {
  title: string;
  subtitle?: string; // 新增人文副标题支持
  onBack?: () => void;
  rightNodes?: React.ReactNode;
  children: React.ReactNode;
  headerContent?: React.ReactNode; // For the desktop header in default mode
  hideSidebar?: boolean; // 是否隐藏左侧大屏侧边栏
}

export function PageLayout({
  title,
  subtitle,
  onBack,
  rightNodes,
  children,
  headerContent,
  hideSidebar = false,
}: PageLayoutProps) {
  const [uiMode, setUiMode] = useState<"default" | "simple">("default");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setUiMode(loadReaderSettings().uiMode || "default");
    setMounted(true);
  }, []);

  if (!mounted) return null;

  if (uiMode === "simple") {
    return (
      <div className="min-h-screen bg-[#F8F8F5] flex flex-col">
        <AppHeader title={title} onBack={onBack} rightNodes={rightNodes} />
        <main className="flex-1 w-full max-w-5xl mx-auto p-4 md:p-8 flex flex-col">
          {subtitle && (
            <p className="text-xs text-[#8C8375] mb-6 -mt-2 pl-1 font-serif">
              {subtitle}
            </p>
          )}
          {children}
        </main>
      </div>
    );
  }

  // Default Mode (Rich Texture, Sidebar)
  return (
    <div className="min-h-screen bg-[#F7F1E6] flex justify-center">
      <div className="w-full max-w-[1448px] flex xl:flex-row flex-col p-4 md:p-8 gap-8">
        {!hideSidebar && <Sidebar />}
        <main className="flex-1 overflow-y-auto xl:py-4">
          {/* Mobile Fallback Header */}
          <div className="xl:hidden mb-8">
            <AppHeader title={title} onBack={onBack} rightNodes={rightNodes} />
            {subtitle && (
              <p className="text-xs text-[#8C8375] mt-2 px-1 font-serif">
                {subtitle}
              </p>
            )}
          </div>

          {/* Desktop Rich Header */}
          <header className="hidden xl:flex items-center justify-between gap-8 mb-12">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-4">
                {onBack && (
                  <button
                    onClick={onBack}
                    className="text-xs font-semibold text-[#8C8375] hover:text-[#2F2A24] bg-[rgba(80,65,45,0.04)] px-3 py-1 rounded-full transition-all hover:scale-105 active:scale-95"
                  >
                    ← 返回
                  </button>
                )}
                <h2 className="text-2xl font-bold text-[#2F2A24] font-serif shrink-0">
                  {title}
                </h2>
              </div>
              {subtitle && (
                <p className="text-xs text-[#8C8375] font-serif mt-1 pl-1">
                  {subtitle}
                </p>
              )}
            </div>
            {headerContent}
          </header>

          {children}
        </main>
      </div>
    </div>
  );
}
