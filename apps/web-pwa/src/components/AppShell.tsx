"use client";

import Link from "next/link";
import React, { useEffect, useRef } from "react";
import { useRouteStore } from "@/components/RouteProvider";
import { useVirtualRouter, viewScrollMemory } from "@/lib/route-store";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export interface AppShellProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  rightNodes?: React.ReactNode;
  children: React.ReactNode;
  contentClassName?: string;
}

const navItems = [
  {
    label: "发现",
    href: "/search",
    icon: <path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm5.5-2.5L21 21" />,
  },
  {
    label: "书架",
    href: "/library",
    icon: (
      <>
        <path d="M5 5h4.5v14H5z" />
        <path d="M9.5 5H14v14H9.5z" />
        <path d="m15.5 5 3.5 1.2-4.2 13-3.5-1.1z" />
      </>
    ),
  },
  {
    label: "导入",
    href: "/import",
    icon: (
      <>
        <path d="M12 3v11" />
        <path d="m8 7 4-4 4 4" />
        <path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
      </>
    ),
  },
  {
    label: "设置",
    href: "/settings",
    icon: (
      <>
        <path d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.05.05a2.06 2.06 0 0 1-2.91 2.91l-.05-.05A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .92 1.7 1.7 0 0 1-1.56 1.04h-.88A1.7 1.7 0 0 1 10 20.32a1.7 1.7 0 0 0-1-.92 1.7 1.7 0 0 0-1.87.34l-.05.05a2.06 2.06 0 0 1-2.91-2.91l.05-.05A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.92-1 1.7 1.7 0 0 1-1.04-1.56v-.88A1.7 1.7 0 0 1 3.68 10a1.7 1.7 0 0 0 .92-1 1.7 1.7 0 0 0-.34-1.87l-.05-.05a2.06 2.06 0 0 1 2.91-2.91l.05.05A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.92 1.7 1.7 0 0 1 1.56-1.04h.88A1.7 1.7 0 0 1 14 3.68a1.7 1.7 0 0 0 1 .92 1.7 1.7 0 0 0 1.87-.34l.05-.05a2.06 2.06 0 0 1 2.91 2.91l-.05.05A1.7 1.7 0 0 0 19.4 9c.4.18.72.5.92 1a1.7 1.7 0 0 1 1.04 1.56v.88A1.7 1.7 0 0 1 20.32 14a1.7 1.7 0 0 0-.92 1Z" />
      </>
    ),
  },
];

function LeafMark() {
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[var(--ui-accent-soft)] text-[var(--ui-accent)]">
      <svg
        aria-hidden="true"
        className="h-5 w-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 15c7.5.7 12.1-3.8 14-10-6.2.7-11.6 3.5-14 10Z" />
        <path d="M5 15c2.2-2.2 5-3.6 8.6-4.2" />
        <path d="M4 20c.8-2.2 2.2-4 4.2-5.3" />
      </svg>
    </span>
  );
}

function NavIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function AppShell({
  title,
  subtitle,
  rightNodes,
  children,
  contentClassName = "",
}: AppShellProps) {
  const routeStore = useRouteStore();
  const currentView = routeStore?.currentView || "library";
  const activeBookId = routeStore?.activeBookId || "";
  const activeTaskId = routeStore?.activeTaskId || "";
  const router = useVirtualRouter();
  const mainRef = useRef<HTMLElement | null>(null);
  const isOnline = useOnlineStatus();

  // 📝 融汇生成独一无二之滚动空间标识，以隔绝不同页面与多本书籍详情、导入预览的滚动交叉污染
  let scrollKey = currentView as string;
  if (currentView === "book-detail" && activeBookId) {
    scrollKey = `book-detail-${activeBookId}`;
  } else if (currentView === "import-preview" && activeTaskId) {
    scrollKey = `import-preview-${activeTaskId}`;
  }

  // 1. 自动对齐与咬合恢复滚动条高度
  useEffect(() => {
    const container = mainRef.current;
    if (!container) return;

    const previousScroll = viewScrollMemory[scrollKey] || 0;
    if (previousScroll > 0) {
      // 60ms 黄金缓冲：确保 Dexie 数据读取及 DOM 高度异步渲染已稳定就绪
      const timer = setTimeout(() => {
        container.scrollTop = previousScroll;
      }, 60);
      return () => clearTimeout(timer);
    } else {
      container.scrollTop = 0;
    }
  }, [scrollKey]);

  // 2. 满帧监听：实时将当前视图的 scrollTop 备份入库
  useEffect(() => {
    const container = mainRef.current;
    if (!container) return;

    const handleScroll = () => {
      viewScrollMemory[scrollKey] = container.scrollTop;
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [scrollKey]);

  return (
    <div className="h-screen w-full bg-[var(--ui-bg)] text-[var(--ui-text)] md:flex overflow-hidden">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-32 flex-col border-r border-[var(--ui-border)] bg-[rgba(255,252,245,0.72)] px-4 py-5 backdrop-blur-xl md:flex">
        <Link
          href="/#/library"
          onClick={(e) => {
            e.preventDefault();
            router.push("/library");
          }}
          className="mb-8 flex items-center gap-2"
        >
          <LeafMark />
          <span className="text-sm font-bold tracking-[0.02em] text-[var(--ui-text)]">
            墨问
          </span>
        </Link>

        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => {
            const active =
              currentView === item.href.slice(1) ||
              (item.href === "/library" && currentView === "library");
            return (
              <Link
                key={item.href}
                href={`/#${item.href}`}
                onClick={(e) => {
                  e.preventDefault();
                  router.push(item.href);
                }}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-[var(--ui-accent-soft)] font-semibold text-[var(--ui-accent)]"
                    : "text-[var(--ui-muted)] hover:bg-white/70 hover:text-[var(--ui-text)]"
                }`}
              >
                <NavIcon>{item.icon}</NavIcon>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* 极简底栏条：无杂乱文字，极致留白，悬浮展开详情卡 */}
        <div className="group relative rounded-xl border border-[var(--ui-border)] bg-white/55 p-2 px-2.5 flex items-center justify-between gap-3 shadow-sm transition-all duration-300 hover:bg-white/85 hover:shadow-[0_4px_16px_rgba(80, 65, 45, 0.04)] cursor-pointer select-none">
          {/* 左侧极其素雅圆形头像 */}
          <div className="h-6 w-6 rounded-full bg-[#678055] flex items-center justify-center text-white font-serif text-[9px] font-bold shadow-sm shrink-0 transition-transform duration-300 group-hover:scale-105">
            墨
          </div>
          
          {/* 右侧极其克制、细长的水平进度线指示器 */}
          <div className="flex-1 flex flex-col gap-1 pr-1">
            <div className="h-1 overflow-hidden rounded-full bg-[rgba(80,65,45,0.06)]">
              <div className="h-full w-2/5 rounded-full bg-[#E7B77A] transition-all duration-500 ease-out" />
            </div>
          </div>

          {/* 向上展开的磨砂宣纸卡片 (Tooltip) */}
          <div className="absolute bottom-[115%] left-0 w-52 p-4 rounded-xl border border-[#E4D9C9] bg-[rgba(251,248,240,0.96)] shadow-[0_12px_36px_rgba(80,65,45,0.12)] backdrop-blur-md scale-95 opacity-0 pointer-events-none group-hover:scale-100 group-hover:opacity-100 group-hover:pointer-events-auto transition-all duration-300 origin-bottom z-50">
            {/* 卡片下置小三角装饰 */}
            <div className="absolute -bottom-1 left-6 w-2 h-2 rotate-45 border-r border-b border-[#E4D9C9] bg-[#FBF8F0]" />
            
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

              {/* 阅读数据指标 */}
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
                  <div className="h-1 w-full bg-[rgba(80,65,45,0.06)] rounded-full overflow-hidden">
                    <div className="h-full w-1/3 bg-[#E7B77A] rounded-full" />
                  </div>
                </div>
                
                {/* 本地状态与离线/在线呼吸灯 */}
                <div className="flex items-center justify-between border-t border-[#E4D9C9]/30 pt-2 text-[9px] text-[#8C8375]">
                  <span>📚 藏书：12 册</span>
                  <span className="text-[#678055] flex items-center gap-1">
                    {!isOnline ? (
                      <>
                        <span className="inline-block w-1 h-1 rounded-full bg-[#9A6A3A] animate-pulse" />
                        <span className="text-[#9A6A3A] font-bold">离线</span>
                      </>
                    ) : (
                      <>
                        <span className="inline-block w-1 h-1 rounded-full bg-[#678055] animate-pulse" />
                        <span>在线</span>
                      </>
                    )}
                  </span>
                </div>

                {/* 🎴 一键直达阅历物理传送门 */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push("/notes");
                  }}
                  className="mt-3 w-full py-1.5 rounded-lg border border-[#B86B5C]/30 bg-[#678055] text-white hover:bg-[#5a6e4a] active:scale-[0.98] transition-all text-[10px] font-bold tracking-wide flex items-center justify-center gap-1 font-serif shadow-sm"
                >
                  <span>🎴</span> 瞻仰阁主阅历
                </button>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <main ref={mainRef} className="h-full overflow-y-auto flex-1 pb-[calc(78px+env(safe-area-inset-bottom))] md:pb-0 md:pl-32">
        <header className="sticky top-0 z-30 border-b border-[var(--ui-border)] bg-[rgba(248,246,240,0.82)] backdrop-blur-xl">
          <div className="mx-auto flex h-16 w-full max-w-[1240px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                onClick={() => router.push("/library")}
                className="ui-focus-ring flex h-10 w-10 items-center justify-center rounded-[12px] text-[var(--ui-accent)] md:hidden"
                aria-label="返回书架"
              >
                <LeafMark />
              </button>
              <div className="min-w-0">
                <h1 className="truncate text-[22px] font-bold leading-tight tracking-normal text-[var(--ui-text)] flex items-center gap-2">
                  <span>{title}</span>
                  {!isOnline && (
                    <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-[#FAF4EB] border border-[#E5C9A6]/50 text-[#8C6239] tracking-wider animate-fade-in shrink-0">
                      离线模式
                    </span>
                  )}
                </h1>
                {subtitle && (
                  <p className="mt-0.5 truncate text-xs text-[var(--ui-muted)]">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>
            {rightNodes && (
              <div className="flex shrink-0 items-center gap-2">
                {rightNodes}
              </div>
            )}
          </div>
        </header>

        <div
          className={`mx-auto w-full max-w-[1240px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7 ${contentClassName}`}
        >
          {children}
        </div>
      </main>

      <nav
        className="fixed inset-x-3 bottom-[calc(10px+env(safe-area-inset-bottom))] z-50 grid rounded-[22px] border border-[var(--ui-border)] bg-[rgba(255,252,245,0.94)] p-2 shadow-[0_18px_50px_rgba(47,42,36,0.16)] backdrop-blur-xl md:hidden"
        style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}
      >
        {navItems.map((item) => {
          const active =
            currentView === item.href.slice(1) ||
            (item.href === "/library" && currentView === "library");
          return (
            <Link
              key={item.href}
              href={`/#${item.href}`}
              onClick={(e) => {
                e.preventDefault();
                router.push(item.href);
              }}
              className={`ui-focus-ring flex min-h-[54px] flex-col items-center justify-center gap-1 rounded-[16px] text-xs font-semibold transition-colors ${
                active
                  ? "bg-[var(--ui-accent-soft)] text-[var(--ui-accent)]"
                  : "text-[var(--ui-muted)] hover:bg-white/70 hover:text-[var(--ui-text)]"
              }`}
            >
              <NavIcon>{item.icon}</NavIcon>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
