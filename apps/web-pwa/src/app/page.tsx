"use client";

import React, { useEffect, useState, Component, ErrorInfo, ReactNode } from "react";
import dynamic from "next/dynamic";
import { RouteProvider, useRouteStore } from "@/components/RouteProvider";

// 惰性异步动态导入视图组件，极大减少首屏 bundle 体积，保障极致瞬间水合 (Hydration)
const LibraryPage = dynamic(() => import("./library/page"), {
  loading: () => <PageLoadingSkeleton text="正在展卷书架..." />,
  ssr: false,
});

const ReaderPageSwitch = dynamic(() => import("./reader/[bookId]/page"), {
  loading: () => <PageLoadingSkeleton text="正在载入书册..." />,
  ssr: false,
});

const BookDetailPage = dynamic(() => import("./book/[bookId]/page"), {
  loading: () => <PageLoadingSkeleton text="正在检索典籍详情..." />,
  ssr: false,
});

const SearchPage = dynamic(() => import("./search/page"), {
  loading: () => <PageLoadingSkeleton text="正在开启检索室..." />,
  ssr: false,
});

const NotesPage = dynamic(() => import("./notes/page"), {
  loading: () => <PageLoadingSkeleton text="正在检索读书笔记..." />,
  ssr: false,
});

const SettingsPage = dynamic(() => import("./settings/page"), {
  loading: () => <PageLoadingSkeleton text="正在进入藏书设置..." />,
  ssr: false,
});

const ImportPage = dynamic(() => import("./import/page"), {
  loading: () => <PageLoadingSkeleton text="正在连接导入港口..." />,
  ssr: false,
});

const ImportPreviewPage = dynamic(() => import("./import/preview/[taskId]/page"), {
  loading: () => <PageLoadingSkeleton text="正在展卷解析预览..." />,
  ssr: false,
});

// 精美的宣纸中式骨架加载组件
function PageLoadingSkeleton({ text }: { text: string }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-[#F4EFE6] text-[#2C2621] dark:bg-[#151516] dark:text-[#A3A3AC]">
      <div className="flex flex-col items-center gap-5 scale-95">
        <div className="animate-spin text-[#678055] text-3xl font-light">↻</div>
        <div className="text-xs font-medium tracking-widest text-[#6F665B] dark:text-[#8F8F8F] animate-pulse">
          {text}
        </div>
      </div>
    </div>
  );
}

// 奢华 3D 阻尼高斯模糊转场动画容器
function TransitionView({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  const [shouldRender, setShouldRender] = useState(active);

  useEffect(() => {
    if (active) {
      setShouldRender(true);
    } else {
      // 延迟 500ms 等卸载动效完成，防惰性白屏
      const timer = setTimeout(() => setShouldRender(false), 500);
      return () => clearTimeout(timer);
    }
  }, [active]);

  return (
    <div
      className={`absolute inset-0 w-full h-full transition-all duration-500 ease-out reader-gpu-accelerated ${
        active
          ? "opacity-100 scale-100 blur-0 pointer-events-auto z-10"
          : "opacity-0 scale-[0.985] blur-md pointer-events-none z-0"
      }`}
      style={{
        transform: !active ? "scale(0.985) translateY(8px)" : "scale(1) translateY(0)",
      }}
    >
      {shouldRender && children}
    </div>
  );
}

// ==========================================
// 🏮 「自愈阁」全局防爆与离线自愈边界 (Global Error Boundary)
// ==========================================
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  showDetails: boolean;
}

class GlobalErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    showDetails: false,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, showDetails: false };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("「自愈阁」深度捕获客户端 React 树崩溃:", error, errorInfo);
  }

  private handleGlobalError = (event: ErrorEvent) => {
    console.error("「自愈阁」全局捕获未处理 JS 运行时报错:", event.error);
    this.setState({
      hasError: true,
      error: event.error || new Error(event.message || "未知 JS 运行时错误"),
    });
  };

  private handlePromiseRejection = (event: PromiseRejectionEvent) => {
    console.error("「自愈阁」全局捕获未处理 Promise 异步拒绝:", event.reason);
    const rawReason = event.reason;
    const error = rawReason instanceof Error ? rawReason : new Error(String(rawReason));
    this.setState({
      hasError: true,
      error,
    });
  };

  public componentDidMount() {
    if (typeof window !== "undefined") {
      window.addEventListener("error", this.handleGlobalError);
      window.addEventListener("unhandledrejection", this.handlePromiseRejection);
    }
  }

  public componentWillUnmount() {
    if (typeof window !== "undefined") {
      window.removeEventListener("error", this.handleGlobalError);
      window.removeEventListener("unhandledrejection", this.handlePromiseRejection);
    }
  }

  private handleResetAndBackToLibrary = () => {
    try {
      localStorage.removeItem("read_realm_virtual_route_snapshot");
      window.location.hash = "/library";
      setTimeout(() => {
        window.location.reload();
      }, 300);
    } catch (e) {
      console.error("重置快照失败:", e);
      window.location.reload();
    }
  };

  private handleReload = () => {
    window.location.reload();
  };

  private toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev }));
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full min-h-screen flex flex-col items-center justify-center p-6 bg-[#F4EFE6] text-[#2C2621] dark:bg-[#151516] dark:text-[#A3A3AC] overflow-y-auto">
          <div className="max-w-md w-full flex flex-col items-center text-center gap-6 p-8 rounded-2xl bg-white/40 dark:bg-black/20 backdrop-blur-md border border-[#678055]/10 shadow-lg scale-95 transition-all duration-300">
            {/* 顶部的中式印章标志 */}
            <div className="w-16 h-16 rounded-full border border-[#678055]/30 flex items-center justify-center bg-[#678055]/10 animate-pulse">
              <span className="text-[#678055] text-2xl font-serif">愈</span>
            </div>

            {/* 标题 */}
            <h1 className="text-xl font-medium tracking-widest text-[#2C2621] dark:text-[#E3E3E3] font-serif">
              自 愈 阁
            </h1>

            {/* 优雅释义 */}
            <p className="text-sm leading-relaxed text-[#6F665B] dark:text-[#8F8F8F] font-serif max-w-sm">
              书卷微染尘埃，秩序发生紊乱。
              <br />
              或因古籍残缺、墨迹斑驳，致使当下展卷失败。
            </p>

            {/* 功能按钮群 */}
            <div className="w-full flex flex-col gap-3 mt-4">
              <button
                onClick={this.handleResetAndBackToLibrary}
                className="w-full py-3 px-4 rounded-xl text-sm font-medium tracking-wide bg-[#678055] hover:bg-[#566c46] text-white active:scale-95 transition-all duration-200 shadow-md shadow-[#678055]/20"
              >
                重置快照并回书架
              </button>

              <button
                onClick={this.handleReload}
                className="w-full py-3 px-4 rounded-xl text-sm font-medium tracking-wide bg-white/60 hover:bg-white/80 dark:bg-white/10 dark:hover:bg-white/15 text-[#2C2621] dark:text-[#E3E3E3] border border-[#678055]/20 active:scale-95 transition-all duration-200"
              >
                静默尝试重新展卷
              </button>

              <button
                onClick={this.toggleDetails}
                className="w-full py-2 px-4 rounded-lg text-xs tracking-wider text-[#6F665B] dark:text-[#8F8F8F] hover:text-[#2C2621] dark:hover:text-[#E3E3E3] transition-colors"
              >
                {this.state.showDetails ? "▲ 收起诊断案卷" : "▼ 查阅诊断案卷"}
              </button>
            </div>

            {/* 诊断案卷（朱砂色详细错误堆栈） */}
            {this.state.showDetails && (
              <div className="w-full mt-2 p-4 rounded-xl bg-red-50/50 dark:bg-red-950/20 border border-red-200/50 dark:border-red-900/30 text-left overflow-hidden transition-all duration-300">
                <div className="text-xs font-bold text-[#B22222] dark:text-red-400 mb-2 tracking-widest border-b border-red-200/50 dark:border-red-900/30 pb-1">
                  【 诊断案卷 · 故障明细 】
                </div>
                <div className="text-xs font-semibold text-[#B22222] dark:text-red-400 font-mono break-all mb-2">
                  {this.state.error?.name || "Exception"}: {this.state.error?.message || "未捕获的运行时异常"}
                </div>
                {this.state.error?.stack && (
                  <pre className="text-[10px] font-mono leading-relaxed text-[#8B0000] dark:text-red-300/80 overflow-y-auto max-h-40 whitespace-pre-wrap break-all pr-1">
                    {this.state.error.stack}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// 全站虚拟路由主控制台
function SpaDashboard() {
  const { currentView, activeBookId, activeTaskId } = useRouteStore();

  // 🧪 【极客诊断插桩】：当 URL 或 Hash 中含有 poison-test 时，强行注入运行时崩溃，
  // 旨在实测与展示「自愈阁」在发生灾难性 JS 崩溃时的 100% 防爆拦截与救赎能力！
  if (typeof window !== "undefined" && window.location.href.includes("poison-test")) {
    throw new Error("极客级白盒测试：模拟 React 客户端组件树运行时崩溃。来自「自愈阁」深度体检大厅。");
  }

  return (
    <main className="relative w-full h-screen overflow-hidden bg-inherit">
      <TransitionView active={currentView === "library"}>
        <LibraryPage />
      </TransitionView>

      <TransitionView active={currentView === "reader" && activeBookId !== null}>
        {activeBookId ? (
          <ReaderPageSwitch params={{ bookId: activeBookId }} />
        ) : null}
      </TransitionView>

      <TransitionView active={currentView === "book-detail" && activeBookId !== null}>
        {activeBookId ? (
          <BookDetailPage params={{ bookId: activeBookId }} />
        ) : null}
      </TransitionView>

      <TransitionView active={currentView === "search"}>
        <SearchPage />
      </TransitionView>

      <TransitionView active={currentView === "notes"}>
        <NotesPage />
      </TransitionView>

      <TransitionView active={currentView === "settings"}>
        <SettingsPage />
      </TransitionView>

      <TransitionView active={currentView === "import"}>
        <ImportPage />
      </TransitionView>

      <TransitionView active={currentView === "import-preview" && activeTaskId !== null}>
        {activeTaskId ? (
          <ImportPreviewPage params={{ taskId: activeTaskId }} />
        ) : null}
      </TransitionView>
    </main>
  );
}

// SPA物理唯一入口，挂载客户端延迟空降自愈锁，彻底绝杀一切服务端/客户端水合属性与时差冲突
export default function Page() {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return <PageLoadingSkeleton text="正在启封书册..." />;
  }

  return (
    <GlobalErrorBoundary>
      <RouteProvider>
        <SpaDashboard />
      </RouteProvider>
    </GlobalErrorBoundary>
  );
}
