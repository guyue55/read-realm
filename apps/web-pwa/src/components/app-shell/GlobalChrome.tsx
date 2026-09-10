"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { useRouteStore } from "@/components/RouteProvider";
import {
  APP_NAV_ITEMS,
  type AppNavItem,
} from "@/components/app-shell/nav-items";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { PRODUCT_LANGUAGE } from "@/lib/product-language";
import { useVirtualRouter } from "@/lib/route-store";
import type { AppView } from "@/lib/navigation-state";

/**
 * 全局导航 chrome（桌面侧边栏 + 移动端底部导航）。
 * 常驻于 keep-alive 视图之外，切换视图时永不消失——
 * 视图切换只刷新内容区，消除"整页空白/刷新"感。
 * 侧边栏高亮与底部导航均以路由状态驱动（与视图内 AppShell 同源）。
 */

function isActiveItem(currentView: AppView, item: AppNavItem): boolean {
  if (currentView === item.view) return true;
  if (
    item.view === "library" &&
    (currentView === "book-detail" || currentView === "reader")
  ) {
    return true;
  }
  return item.view === "import" && currentView === "import-preview";
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-stamp)] bg-[var(--color-primary)] [font-family:var(--font-display)] font-semibold text-white ${
        compact ? "h-11 w-11 text-base" : "h-10 w-10 text-lg"
      }`}
    >
      墨
    </span>
  );
}

export function GlobalChrome() {
  const routeStore = useRouteStore();
  const currentView = routeStore?.currentView ?? "library";
  const router = useVirtualRouter();
  const isOnline = useOnlineStatus();

  // 挂载后静默预载全部导航视图分块，保证切换菜单零"正在打开…"占位（无刷新感）。
  // 全局 chrome 常驻，只做一次。
  const prefetchedRef = useRef(false);
  useEffect(() => {
    if (prefetchedRef.current) return;
    prefetchedRef.current = true;
    APP_NAV_ITEMS.forEach((item) => router.prefetch(item.href));
  }, [router]);

  const navigate = (href: string) => {
    router.push(href);
  };

  // 阅读器为全屏沉浸视图（无 AppShell、无主导航），全局导航 chrome 应隐藏，
  // 避免常驻底栏/侧边栏侵入阅读器布局。
  if (currentView === "reader") return null;

  return (
    <>
      {/* 桌面侧边栏 */}
      <aside className="hidden h-full w-[var(--shell-sidebar-width)] shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-5 md:flex">
        <Link
          aria-label="返回书架"
          className="ui-focus-ring mb-7 flex items-center gap-2.5 rounded-[var(--radius-control)] px-1 py-1"
          href="/#/library"
          onClick={(event) => {
            event.preventDefault();
            navigate("/library");
          }}
        >
          <BrandMark />
          <span className="min-w-0">
            <span className="block [font-family:var(--font-display)] text-lg font-semibold leading-5">
              {PRODUCT_LANGUAGE.brand.label}
            </span>
            <span className="mt-1 block truncate text-[10px] text-[var(--color-muted)]">
              {PRODUCT_LANGUAGE.brand.plain}
            </span>
          </span>
        </Link>

        <nav aria-label="主导航" className="flex flex-1 flex-col gap-1">
          {APP_NAV_ITEMS.map((item) => {
            const active = isActiveItem(currentView, item);
            const Icon = item.icon;

            return (
              <Link
                aria-current={active ? "page" : undefined}
                aria-label={item.term.plain}
                className={`ui-focus-ring flex min-h-11 items-center gap-2.5 rounded-[var(--radius-control)] border-l-2 px-3 py-2 text-sm transition-colors ${
                  active
                    ? "border-[var(--color-stamp)] bg-[var(--color-primary-soft)] font-semibold text-[var(--color-primary)]"
                    : "border-transparent text-[var(--color-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)]"
                }`}
                href={`/#${item.href}`}
                key={item.href}
                onClick={(event) => {
                  event.preventDefault();
                  navigate(item.href);
                }}
                title={item.term.plain}
              >
                <Icon
                  aria-hidden="true"
                  className="h-[18px] w-[18px] shrink-0"
                  strokeWidth={1.7}
                />
                <span>{item.term.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-[var(--color-border-soft)] px-1 pt-4">
          <div className="flex items-start gap-2 text-[var(--color-muted)]">
            {isOnline ? (
              <Wifi
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-info)]"
              />
            ) : (
              <WifiOff
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-danger)]"
              />
            )}
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-[var(--color-text)]">
                {isOnline
                  ? PRODUCT_LANGUAGE.states.online.label
                  : PRODUCT_LANGUAGE.states.offline.label}
              </span>
              <span className="mt-1 block text-[10px] leading-4">
                {isOnline
                  ? "内容优先保存在本机"
                  : PRODUCT_LANGUAGE.states.offline.plain}
              </span>
            </span>
          </div>
        </div>
      </aside>

      {/* 移动端底部导航 */}
      <nav
        aria-label="主导航"
        className="fixed inset-x-2 bottom-[calc(8px+env(safe-area-inset-bottom))] z-50 grid grid-cols-6 gap-1 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-[var(--shadow-raised)] md:hidden"
      >
        {APP_NAV_ITEMS.map((item) => {
          const active = isActiveItem(currentView, item);
          const Icon = item.icon;

          return (
            <Link
              aria-current={active ? "page" : undefined}
              aria-label={item.term.plain}
              className={`ui-focus-ring flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-[var(--radius-control)] px-1 text-xs font-semibold transition-colors ${
                active
                  ? "bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
                  : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
              }`}
              href={`/#${item.href}`}
              key={item.href}
              onClick={(event) => {
                event.preventDefault();
                navigate(item.href);
              }}
              title={item.term.plain}
            >
              <Icon
                aria-hidden="true"
                className="h-[18px] w-[18px]"
                strokeWidth={1.8}
              />
              <span className="max-w-full truncate">{item.term.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
