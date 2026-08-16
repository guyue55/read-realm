"use client";

import dynamic from "next/dynamic";
import type { ErrorInfo, ReactNode } from "react";
import { Component, useEffect } from "react";
import { AlertTriangle, Library, RotateCcw } from "lucide-react";
import { RouteProvider, useRouteStore } from "@/components/RouteProvider";
import { ViewLoading } from "@/components/ViewLoading";
import { virtualRouter } from "@/lib/route-store";

const LibraryPage = dynamic(
  () => import("./library/page"),
  {
    loading: () => <ViewLoading label="正在打开书架" />,
    ssr: false,
  },
);
const ReaderPage = dynamic(
  () => import("./reader/[bookId]/ReaderClient"),
  {
    loading: () => <ViewLoading label="正在打开阅读器" />,
    ssr: false,
  },
);
const BookDetailPage = dynamic(
  () => import("./book/[bookId]/BookDetailClient"),
  {
    loading: () => <ViewLoading label="正在读取书籍详情" />,
    ssr: false,
  },
);
const SearchPage = dynamic(
  () => import("./search/page"),
  {
    loading: () => <ViewLoading label="正在打开寻书" />,
    ssr: false,
  },
);
const NotesPage = dynamic(
  () => import("./notes/page"),
  {
    loading: () => <ViewLoading label="正在打开笺注" />,
    ssr: false,
  },
);
const SettingsPage = dynamic(
  () => import("./settings/page"),
  {
    loading: () => <ViewLoading label="正在打开设置" />,
    ssr: false,
  },
);
const ImportPage = dynamic(
  () => import("./import/page"),
  {
    loading: () => <ViewLoading label="正在打开导入" />,
    ssr: false,
  },
);
const ImportPreviewPage = dynamic(
  () => import("./import/preview/[taskId]/PreviewClient"),
  {
    loading: () => <ViewLoading label="正在读取导入预览" />,
    ssr: false,
  },
);
const PublicLibraryPage = dynamic(
  () => import("./public-library/page"),
  {
    loading: () => <ViewLoading label="正在打开藏经阁" />,
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

function ActiveView() {
  const { currentView, activeBookId, activeTaskId } = useRouteStore();
  let view: ReactNode;

  switch (currentView) {
    case "reader":
      view = activeBookId ? (
        <ReaderPage params={{ bookId: activeBookId }} />
      ) : (
        <LibraryPage />
      );
      break;
    case "book-detail":
      view = activeBookId ? (
        <BookDetailPage params={{ bookId: activeBookId }} />
      ) : (
        <LibraryPage />
      );
      break;
    case "search":
      view = <SearchPage />;
      break;
    case "notes":
      view = <NotesPage />;
      break;
    case "settings":
      view = <SettingsPage />;
      break;
    case "import":
      view = <ImportPage />;
      break;
    case "import-preview":
      view = activeTaskId ? (
        <ImportPreviewPage params={{ taskId: activeTaskId }} />
      ) : (
        <ImportPage />
      );
      break;
    case "public-library":
      view = <PublicLibraryPage />;
      break;
    default:
      view = <LibraryPage />;
  }

  const viewKey = `${currentView}:${activeBookId ?? activeTaskId ?? "root"}`;
  return (
    <div className="view-enter h-[100dvh] overflow-hidden" key={viewKey}>
      {view}
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
    const timer = window.setTimeout(preload, 600);
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
