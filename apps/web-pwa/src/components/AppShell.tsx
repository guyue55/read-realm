"use client";

import React, { useEffect, useRef } from "react";
import { ArrowLeft, WifiOff } from "lucide-react";
import { useRouteStore } from "@/components/RouteProvider";
import { IconButton } from "@/components/ui/IconButton";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { PRODUCT_LANGUAGE } from "@/lib/product-language";
import {
  readViewScrollPosition,
  readViewSourceFocus,
  rememberViewScrollPosition,
  parseHash,
  useVirtualRouter,
} from "@/lib/route-store";
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
  const restoringScrollRef = useRef(true);
  const isOnline = useOnlineStatus();
  const scrollKey = getScrollKey(currentView, activeBookId, activeTaskId);

  useEffect(() => {
    const container = mainRef.current;
    if (!container) return;

    restoringScrollRef.current = true;
    const desiredScrollTop = readViewScrollPosition(scrollKey);
    let attempts = 0;
    let cancelled = false;
    let timer = 0;
    const restoreScroll = () => {
      if (cancelled) return;
      container.scrollTop = desiredScrollTop;
      attempts += 1;
      const availableScroll = Math.max(
        0,
        container.scrollHeight - container.clientHeight,
      );
      if (
        desiredScrollTop === 0 ||
        availableScroll >= desiredScrollTop ||
        attempts >= 40
      ) {
        window.requestAnimationFrame(() => {
          restoringScrollRef.current = false;
        });
        return;
      }
      timer = window.setTimeout(restoreScroll, 50);
    };
    timer = window.setTimeout(restoreScroll, 60);
    return () => {
      cancelled = true;
      restoringScrollRef.current = true;
      window.clearTimeout(timer);
    };
  }, [scrollKey]);

  useEffect(() => {
    const container = mainRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (restoringScrollRef.current) return;
      if (parseHash(window.location.hash).currentView !== currentView) return;
      rememberViewScrollPosition(scrollKey, container.scrollTop);
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [currentView, scrollKey]);

  useEffect(() => {
    if (currentView !== "library") return;
    const sourceId = readViewSourceFocus("library");
    if (!sourceId) return;

    let attempts = 0;
    let cancelled = false;
    const restoreFocus = () => {
      if (cancelled) return;
      const target = Array.from(
        document.querySelectorAll<HTMLElement>("[data-book-id]"),
      ).find((element) => element.dataset.bookId === sourceId);
      if (target) {
        const focusTarget =
          target.querySelector<HTMLElement>("[data-library-entry-primary]") ??
          target;
        focusTarget.focus({ preventScroll: true });
        return;
      }
      attempts += 1;
      if (attempts < 40) window.setTimeout(restoreFocus, 50);
    };
    const timer = window.setTimeout(restoreFocus, 80);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [currentView, scrollKey]);

  const navigate = (href: string) => {
    router.push(href);
  };

  return (
    <div className="h-full min-w-0 flex-1 bg-[var(--color-background)] text-[var(--color-text)]">
      <main
        className="h-full min-w-0 flex-1 overflow-y-auto pb-[calc(104px+env(safe-area-inset-bottom))] md:pb-0"
        data-app-main
        ref={mainRef}
        tabIndex={-1}
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
                  <p className="mt-1 line-clamp-2 text-xs leading-4 text-[var(--color-muted)]">
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
          className={`mx-auto w-full max-w-[var(--content-max-width)] px-4 py-5 sm:px-6 lg:px-8 lg:py-7 ${contentClassName}`}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
