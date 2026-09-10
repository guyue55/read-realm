"use client";

import dynamic from "next/dynamic";
import type { ErrorInfo, ReactNode } from "react";
import { Component, useEffect, useRef } from "react";
import { AlertTriangle, Library, RotateCcw } from "lucide-react";
import { RouteProvider, useRouteStore } from "@/components/RouteProvider";
import { ViewLoading } from "@/components/ViewLoading";
import { virtualRouter } from "@/lib/route-store";
import type { AppView } from "@/lib/navigation-state";

const LibraryPage = dynamic(
  () => import("./library/page"),
  {
    loading: () => <ViewLoading label="正在打开书架" silent />,
    ssr: false,
  },
);
const ReaderPage = dynamic(
  () => import("./reader/[bookId]/ReaderClient"),
  {
    loading: () => <ViewLoading label="正在打开阅读器" silent />,
    ssr: false,
  },
);
const BookDetailPage = dynamic(
  () => import("./book/[bookId]/BookDetailClient"),
  {
    loading: () => <ViewLoading label="正在读取书籍详情" silent />,
    ssr: false,
  },
);
const SearchPage = dynamic(
  () => import("./search/page"),
  {
    loading: () => <ViewLoading label="正在打开寻书" silent />,
    ssr: false,
  },
);
const NotesPage = dynamic(
  () => import("./notes/page"),
  {
    loading: () => <ViewLoading label="正在打开笺注" silent />,
    ssr: false,
  },
);
const SettingsPage = dynamic(
  () => import("./settings/page"),
  {
    loading: () => <ViewLoading label="正在打开设置" silent />,
    ssr: false,
  },
);
const ImportPage = dynamic(
  () => import("./import/page"),
  {
    loading: () => <ViewLoading label="正在打开导入" silent />,
    ssr: false,
  },
);
const ImportPreviewPage = dynamic(
  () => import("./import/preview/[taskId]/PreviewClient"),
  {
    loading: () => <ViewLoading label="正在读取导入预览" silent />,
    ssr: false,
  },
);
const PublicLibraryPage = dynamic(
  () => import("./public-library/page"),
  {
    loading: () => <ViewLoading label="正在打开藏经阁" silent />,
    ssr: false,
  },
);

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

class GlobalErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  public state: ErrorBoundaryState = { error: null };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("页面渲染失败:", error, errorInfo);
  }

  private returnToLibrary = () => {
    window.localStorage.removeItem("read_realm_virtual_route_snapshot");
    virtualRouter.replaceTo("library");
    this.setState({ error: null });
  };

  private reloadPage = () => {
    window.location.reload();
  };

  public render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[var(--color-background)] p-5 text-[var(--color-text)]">
        <section
          aria-labelledby="app-error-title"
          className="w-full max-w-lg rounded-[var(--radius-card)] border border-[var(--color-danger)]/30 bg-[var(--color-surface)] p-6 shadow-[var(--shadow-raised)] sm:p-8"
          role="alert"
        >
          <AlertTriangle
            aria-hidden="true"
            className="mb-4 h-8 w-8 text-[var(--color-danger)]"
          />
          <h1
            className="[font-family:var(--font-display)] text-2xl font-semibold"
            id="app-error-title"
          >
            页面暂时无法打开
          </h1>
          <p className="mt-3 text-sm leading-6 text-[var(--color-muted)]">
            当前页面发生运行错误。你可以返回书架继续使用，或重新加载页面后再试。
          </p>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <button
              className="ui-focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--color-primary-strong)]"
              onClick={this.returnToLibrary}
              type="button"
            >
              <Library aria-hidden="true" className="h-4 w-4" />
              返回书架
            </button>
            <button
              className="ui-focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-border)] px-4 text-sm font-semibold hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
              onClick={this.reloadPage}
              type="button"
            >
              <RotateCcw aria-hidden="true" className="h-4 w-4" />
              重新加载页面
            </button>
          </div>

          <details className="mt-5 border-t border-[var(--color-border-soft)] pt-4 text-xs text-[var(--color-muted)]">
            <summary className="cursor-pointer font-medium">查看错误信息</summary>
            <p className="mt-2 break-words font-mono leading-5">
              {this.state.error.message || "未知运行错误"}
            </p>
          </details>
        </section>
      </div>
    );
  }
}

/** 固定视图：首次访问后常驻挂载（keep-alive），切换仅切 display，状态与滚动位置全保留 */
const KEEP_ALIVE_VIEWS = [
  "library",
  "search",
  "notes",
  "settings",
  "import",
  "public-library",
] as const;

/** 参数化视图：依赖 activeBookId/activeTaskId，切走即卸载（阅读进度/详情状态已由 DB 持久化，重进恢复） */
type ParameterizedView = "reader" | "book-detail" | "import-preview";

function ActiveView() {
  const { currentView, activeBookId, activeTaskId } = useRouteStore();
  // 已挂载的固定视图集合（首挂后常驻，保证切换无感、状态保留）。
  // 初始为空：只挂载当前激活视图，避免隐藏视图预挂载发起多余网络请求/副作用。
  const mountedViewsRef = useRef<Set<string>>(new Set());

  const renderView = (view: AppView): ReactNode => {
    switch (view) {
      case "reader":
        return activeBookId ? (
          <ReaderPage params={{ bookId: activeBookId }} />
        ) : null;
      case "book-detail":
        return activeBookId ? (
          <BookDetailPage params={{ bookId: activeBookId }} />
        ) : null;
      case "search":
        return <SearchPage />;
      case "notes":
        return <NotesPage />;
      case "settings":
        return <SettingsPage />;
      case "import":
        return <ImportPage />;
      case "import-preview":
        return activeTaskId ? (
          <ImportPreviewPage params={{ taskId: activeTaskId }} />
        ) : null;
      case "public-library":
        return <PublicLibraryPage />;
      default:
        return <LibraryPage />;
    }
  };

  // 参数化视图缺少参数（路由状态异常，如 reader 无 bookId）时回退到书架：
  // keep-alive 的 library 视图承担显示，避免与常驻书架重复渲染。
  const parameterizedReady =
    (currentView === "reader" && Boolean(activeBookId)) ||
    (currentView === "book-detail" && Boolean(activeBookId)) ||
    (currentView === "import-preview" && Boolean(activeTaskId));
  // 仅当当前视图是参数化视图且缺参时才回退书架；普通固定视图（如藏经阁）不受影响。
  const fallbackToLibrary =
    (currentView === "reader" ||
      currentView === "book-detail" ||
      currentView === "import-preview") &&
    !parameterizedReady;

  // 当前活动视图为固定视图时，标记为已挂载（保持常驻）；回退书架时也把书架记为已挂载。
  if (KEEP_ALIVE_VIEWS.includes(currentView as (typeof KEEP_ALIVE_VIEWS)[number])) {
    mountedViewsRef.current.add(currentView);
  }
  if (fallbackToLibrary) {
    mountedViewsRef.current.add("library");
  }

  // 固定视图全部常驻挂载，非活动隐藏（不卸载，DOM/state/滚动原位保留）；
  // 参数化视图仅当前渲染（切走即卸载，进度由 DB 恢复）。
  return (
    <div className="h-[100dvh] overflow-hidden">
      {KEEP_ALIVE_VIEWS.map((view) => {
        // 参数化视图缺少参数时，回退到常驻书架（将其作为活动视图显示）
        const isActive =
          currentView === view || (fallbackToLibrary && view === "library");
        if (!isActive && !mountedViewsRef.current.has(view)) return null;
        return (
          <div
            aria-hidden={!isActive}
            className={isActive ? "view-enter h-full" : "hidden h-full"}
            data-view-keepalive={view}
            key={view}
            role={isActive ? undefined : "presentation"}
          >
            {renderView(view)}
          </div>
        );
      })}
      {/* 参数化视图：reader / book-detail / import-preview（不常驻，按参数切换） */}
      {parameterizedReady && (
        <div className="view-enter h-full" data-view-parameterized={currentView}>
          {renderView(currentView as ParameterizedView)}
        </div>
      )}
    </div>
  );
}

export default function Page() {
  // 首屏挂载后静默预热全部业务视图分块，避免首次切换菜单时出现“正在打开…”占位闪烁。
  useEffect(() => {
    let cancelled = false;
    const preload = async () => {
      if (cancelled) return;
      try {
        await Promise.all([
          import("./library/page"),
          import("./search/page"),
          import("./notes/page"),
          import("./settings/page"),
          import("./import/page"),
          import("./public-library/page"),
          import("./reader/[bookId]/ReaderClient"),
          import("./book/[bookId]/BookDetailClient"),
          import("./import/preview/[taskId]/PreviewClient"),
        ]);
      } catch (error) {
        console.error("视图分块预热失败（不影响正常使用）", error);
      }
    };
    // 挂载后 100ms 即开始预热，尽可能赶在用户首次点击导航前把视图分块缓存好，
    // 避免首次切换时出现"正在打开…"占位（视觉刷新感）。
    const timer = window.setTimeout(preload, 100);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <GlobalErrorBoundary>
      <RouteProvider>
        <ActiveView />
      </RouteProvider>
    </GlobalErrorBoundary>
  );
}
