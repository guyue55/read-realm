"use client";

import Link from "next/link";
import React, { useEffect, useRef } from "react";
import { ArrowLeft, Wifi, WifiOff } from "lucide-react";
import { useRouteStore } from "@/components/RouteProvider";
import { APP_NAV_ITEMS, type AppNavItem } from "@/components/app-shell/nav-items";
import { IconButton } from "@/components/ui/IconButton";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { PRODUCT_LANGUAGE } from "@/lib/product-language";
import { useVirtualRouter, viewScrollMemory } from "@/lib/route-store";
import type { AppView } from "@/lib/navigation-state";

export interface AppShellProps {
  children: React.ReactNode;
  contentClassName?: string;
  onBack?: () => void;
  rightNodes?: React.ReactNode;
  subtitle?: React.ReactNode;
  title: React.ReactNode;
}

function getScrollKey(
  currentView: AppView,
  activeBookId: string,
  activeTaskId: string,
): string {
  if (currentView === "book-detail" && activeBookId) {
    return `book-detail-${activeBookId}`;
  }
  if (currentView === "import-preview" && activeTaskId) {
    return `import-preview-${activeTaskId}`;
  }
  return currentView;
}

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
        compact ? "h-9 w-9 text-base" : "h-10 w-10 text-lg"
      }`}
    >
      墨
    </span>
  );
}

export function AppShell({
  children,
  contentClassName = "",
  onBack,
  rightNodes,
  subtitle,
  title,
}: AppShellProps) {
  const routeStore = useRouteStore();
  const currentView = routeStore?.currentView ?? "library";
  const activeBookId = routeStore?.activeBookId ?? "";
  const activeTaskId = routeStore?.activeTaskId ?? "";
  const router = useVirtualRouter();
  const mainRef = useRef<HTMLElement | null>(null);
  const isOnline = useOnlineStatus();
  const scrollKey = getScrollKey(currentView, activeBookId, activeTaskId);

  useEffect(() => {
    const container = mainRef.current;
    if (!container) return;

    const timer = window.setTimeout(() => {
      container.scrollTop = viewScrollMemory[scrollKey] ?? 0;
    }, 60);
    return () => window.clearTimeout(timer);
  }, [scrollKey]);

  useEffect(() => {
    const container = mainRef.current;
    if (!container) return;

    const handleScroll = () => {
      viewScrollMemory[scrollKey] = container.scrollTop;
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [scrollKey]);

  const navigate = (href: string) => {
    router.push(href);
  };

  return (
    <div className="flex h-[100dvh] min-h-screen w-full overflow-hidden bg-[var(--color-background)] text-[var(--color-text)]">
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
                <Icon aria-hidden="true" className="h-[18px] w-[18px] shrink-0" strokeWidth={1.7} />
                <span>{item.term.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-[var(--color-border-soft)] px-1 pt-4">
          <div className="flex items-start gap-2 text-[var(--color-muted)]">
            {isOnline ? (
              <Wifi aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-info)]" />
            ) : (
              <WifiOff aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-danger)]" />
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

      <main
        className="h-full min-w-0 flex-1 overflow-y-auto pb-[calc(78px+env(safe-area-inset-bottom))] md:pb-0"
        ref={mainRef}
      >
        <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[var(--color-background)]">
          <div className="mx-auto flex min-h-16 w-full max-w-[var(--content-max-width)] items-center justify-between gap-3 px-4 py-2 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              {onBack ? (
                <IconButton
                  className="md:hidden"
                  icon={<ArrowLeft aria-hidden="true" />}
                  label="返回上一页"
                  onClick={onBack}
                />
              ) : (
                <button
                  aria-label="返回书架"
                  className="ui-focus-ring rounded-[var(--radius-control)] md:hidden"
                  onClick={() => navigate("/library")}
                  title="返回书架"
                  type="button"
                >
                  <BrandMark compact />
                </button>
              )}

              <div className="min-w-0">
                <h1 className="flex min-w-0 items-center gap-2 [font-family:var(--font-display)] text-xl font-semibold leading-tight sm:text-[22px]">
                  <span className="truncate">{title}</span>
                  {!isOnline && (
                    <span
                      aria-label={PRODUCT_LANGUAGE.states.offline.plain}
                      className="flex shrink-0 items-center gap-1 text-xs font-medium text-[var(--color-danger)]"
                      title={PRODUCT_LANGUAGE.states.offline.plain}
                    >
                      <WifiOff aria-hidden="true" className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">离线</span>
                    </span>
                  )}
                </h1>
                {subtitle && (
                  <p className="mt-1 truncate text-xs text-[var(--color-muted)]">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>

            {rightNodes && (
              <div className="flex shrink-0 items-center gap-2">{rightNodes}</div>
            )}
          </div>
        </header>

        <div
          className={`mx-auto w-full max-w-[var(--content-max-width)] px-4 py-5 sm:px-6 lg:px-8 lg:py-7 ${contentClassName}`}
        >
          {children}
        </div>
      </main>

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
              className={`ui-focus-ring flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-[var(--radius-control)] px-1 text-[11px] font-semibold transition-colors ${
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
              <Icon aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.8} />
              <span className="max-w-full truncate">{item.term.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
