"use client";

import React, { useEffect, useState } from "react";
import { loadReaderSettings } from "@/lib/reader-settings";
import { AppHeader } from "@/components/AppHeader";
import { Sidebar } from "@/components/Sidebar";

export interface PageLayoutProps {
  title: string;
  onBack?: () => void;
  rightNodes?: React.ReactNode;
  children: React.ReactNode;
  headerContent?: React.ReactNode; // For the desktop header in default mode
}

export function PageLayout({ title, onBack, rightNodes, children, headerContent }: PageLayoutProps) {
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
          {children}
        </main>
      </div>
    );
  }

  // Default Mode (Rich Texture, Sidebar)
  return (
    <div className="min-h-screen bg-[#F7F1E6] flex justify-center">
      <div className="w-full max-w-[1448px] flex xl:flex-row flex-col p-4 md:p-8 gap-8">
        <Sidebar />
        <main className="flex-1 overflow-y-auto xl:py-4">
          {/* Mobile Fallback Header */}
          <div className="xl:hidden mb-8">
            <AppHeader title={title} onBack={onBack} rightNodes={rightNodes} />
          </div>

          {/* Desktop Rich Header */}
          <header className="hidden xl:flex items-center gap-8 mb-12">
            {onBack && (
              <button onClick={onBack} className="text-sm font-medium text-[#6F665B] hover:text-[#2F2A24]">
                ← 返回
              </button>
            )}
            <h2 className="text-2xl font-bold text-[#2F2A24] font-serif shrink-0">{title}</h2>
            {headerContent}
          </header>

          {children}
        </main>
      </div>
    </div>
  );
}