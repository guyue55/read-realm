"use client";

import React, { useEffect, useState, useRef } from "react";
import { loadReaderSettings } from "@/lib/reader-settings";
import { AppHeader } from "@/components/AppHeader";
import { Sidebar } from "@/components/Sidebar";
import { useRouteStore } from "@/components/RouteProvider";
import { viewScrollMemory } from "@/lib/route-store";

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
  
  // 📚 挂载滚动主容器之引用，用以精细调控视口高度与进行自愈回弹
  const mainRef = useRef<HTMLElement>(null);
  
  // 🧭 接入虚拟路由订阅状态机，实时捕获当前视界与操作锚点
  const routeStore = useRouteStore();
  const currentView = routeStore?.currentView || "library";
  const activeBookId = routeStore?.activeBookId || "";
  const activeTaskId = routeStore?.activeTaskId || "";

  // 📝 融汇生成独一无二之滚动空间标识，以隔绝不同页面与多本书籍详情的滚动交叉污染
  let scrollKey = currentView as string;
  if (currentView === "book-detail" && activeBookId) {
    scrollKey = `book-detail-${activeBookId}`;
  } else if (currentView === "import-preview" && activeTaskId) {
    scrollKey = `import-preview-${activeTaskId}`;
  }

  useEffect(() => {
    setUiMode(loadReaderSettings().uiMode || "default");
    setMounted(true);
  }, []);

  // 🎣 一向：伏脉千里。监听主体视窗之滚动行为，无感实时落盘记录至非序列化滚动字典
  useEffect(() => {
    const mainEl = mainRef.current;
    if (!mainEl) return;

    const handleScroll = () => {
      viewScrollMemory[scrollKey] = mainEl.scrollTop;
    };

    // 加持 passive 监听以达成 60 帧满帧之丝滑顺畅滑动体验
    mainEl.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      mainEl.removeEventListener("scroll", handleScroll);
    };
  }, [scrollKey]);

  // 🎣 二向：破茧自愈。待路由场景切换后，微延迟 60ms 确保数据挂载及 DOM 物理高度就绪后瞬间咬合还原
  useEffect(() => {
    const mainEl = mainRef.current;
    if (!mainEl) return;

    const savedScrollTop = viewScrollMemory[scrollKey] || 0;
    
    // 延迟 60 毫秒之微瞬状态机：避开 IndexedDB 与 React 异步列表初渲染时骨架屏的高度缺失真空期
    const timer = setTimeout(() => {
      if (mainEl) {
        mainEl.scrollTop = savedScrollTop;
      }
    }, 60);

    return () => clearTimeout(timer);
  }, [scrollKey]);

  if (!mounted) return null;

  if (uiMode === "simple") {
    return (
      /* 刚性锁死视口高度：h-screen overflow-hidden 确保底层 ViewTransition 动效完美无瑕 */
      <div className="h-screen overflow-hidden bg-[#F8F8F5] flex flex-col">
        <AppHeader title={title} onBack={onBack} rightNodes={rightNodes} />
        {/* 正文容器局部启用滚动，彻底降服 Scroll Freeze 顽疾 */}
        <main 
          ref={mainRef} 
          className="flex-1 w-full max-w-5xl mx-auto p-4 md:p-8 flex flex-col overflow-y-auto h-full"
        >
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
    /* 经典山水水墨排版：最外层宿主牢牢锚定视口屏幕高度 */
    <div className="h-screen overflow-hidden bg-[#F7F1E6] flex justify-center w-full">
      {/* 限制内层整体高度，严防内容向外溢出导致整体视窗锁死 */}
      <div className="w-full max-w-[1448px] h-full flex xl:flex-row flex-col p-4 md:p-8 gap-8 overflow-hidden">
        {!hideSidebar && <Sidebar />}
        {/* 局部独立滚动之 main 视口，在自愈与性能间达成黄金黄金平横 */}
        <main 
          ref={mainRef} 
          className="flex-1 overflow-y-auto xl:py-4 h-full"
        >
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

