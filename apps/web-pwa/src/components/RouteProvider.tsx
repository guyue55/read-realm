"use client";

import React, { useEffect, useState, useSyncExternalStore } from "react";
import { virtualRouter, RouteState, parseHash } from "@/lib/route-store";
import { isRouteState } from "@/lib/navigation-state";
import {
  checkAndRestoreFromBackup,
  db,
  describeLocalDataMigrationError,
  executeStorageGarbageCollection,
  shouldSweepLegacyImportTask,
} from "@reader/storage-core";

interface SafeWindow {
  requestIdleCallback?: (
    callback: (deadline: {
      didTimeout: boolean;
      timeRemaining: () => number;
    }) => void,
    options?: { timeout?: number },
  ) => number;
  cancelIdleCallback?: (id: number) => void;
}

// 注入 Safari / iOS / WKWebView 高精度 requestIdleCallback / cancelIdleCallback 帧自愈垫片
if (typeof window !== "undefined") {
  const safeWindow = window as unknown as SafeWindow;
  if (!safeWindow.requestIdleCallback) {
    safeWindow.requestIdleCallback = function (cb) {
      const start = performance.now();
      return window.setTimeout(() => {
        cb({
          didTimeout: false,
          timeRemaining: () => Math.max(0, 50 - (performance.now() - start)),
        });
      }, 1) as unknown as number;
    };
    safeWindow.cancelIdleCallback = function (id) {
      window.clearTimeout(id);
    };
  }
}

// 定义固定的服务端 Snapshot 及其获取函数，确保引用一致性，防 React 18 水合死锁与无限循环
const SERVER_SNAPSHOT: RouteState = {
  currentView: "library",
  activeBookId: null,
  activeChapterIndex: null,
  activePanel: null,
  activeTaskId: null,
};

const getServerSnapshot = () => SERVER_SNAPSHOT;

// 导出全局 hook：用于全站任何组件秒级、无感、防多余重绘地订阅虚拟路由
export function useRouteStore(): RouteState {
  return useSyncExternalStore(
    virtualRouter.subscribe,
    virtualRouter.getSnapshot,
    getServerSnapshot,
  );
}

// 虚拟路由副作用容器，接管 popstate、持久特权申请与防蒸发降卷自愈
export function RouteProvider({ children }: { children: React.ReactNode }) {
  const [storageState, setStorageState] = useState<
    "opening" | "ready" | "failed"
  >("opening");
  const [storageError, setStorageError] = useState("");
  const [storageNotice, setStorageNotice] = useState("");
  const [storageAttempt, setStorageAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    async function initPlatformAndHeal() {
      setStorageState("opening");
      setStorageError("");
      setStorageNotice("");
      try {
        const connectDatabase = db["open"].bind(db);
        await connectDatabase();
      } catch (error) {
        if (active) {
          setStorageError(describeLocalDataMigrationError(error));
          setStorageState("failed");
        }
        return;
      }

      // A. 自动申请 navigator.storage.persist() 存储持久化特权 (E07-S03)
      if (
        typeof navigator !== "undefined" &&
        navigator.storage &&
        navigator.storage.persist
      ) {
        try {
          const isPersisted = await navigator.storage.persist();
          console.log(
            `[Storage] 首次冷启动持久化特权状态: ${isPersisted ? "已获得物理保护 (Persisted)" : "未批准物理保护 (Best Effort)"}`,
          );
        } catch (err) {
          console.warn("[Storage] 持久化特权申请受限:", err);
        }
      }

      // B. 校验并执行防清除双轨冗余镜像自愈 (E07-S04)
      try {
        const restoreResult = await checkAndRestoreFromBackup();
        if (restoreResult.status === "complete" && active) {
          console.log(
            `[Storage] 冷启动自愈完成：已核验恢复 ${restoreResult.restoredBookCount} 本书的全量元数据镜像。`,
          );
        } else if (restoreResult.status === "partial" && active) {
          const message = `检测到本地书架曾被清空。已从轻量应急备份恢复 ${restoreResult.restoredBookCount} / ${restoreResult.expectedBookCount} 本；其余内容需从您的完整备份恢复。`;
          setStorageNotice(message);
          console.warn(`[Storage] ${message}`);
        } else if (restoreResult.status === "recovery_gap" && active) {
          const message = `本地书架仍只有 ${restoreResult.restoredBookCount} / ${restoreResult.expectedBookCount} 本；缺失的书未被标记为已恢复，请从完整备份继续恢复。`;
          setStorageNotice(message);
          console.warn(`[Storage] ${message}`);
        } else if (restoreResult.status === "failed" && active) {
          setStorageNotice(
            "检测到本地书架恢复失败，没有把不完整数据标记为成功。请前往数据管理使用完整备份恢复。",
          );
        }
      } catch (err) {
        console.error("[Storage] 冷启动双轨自愈判定异常:", err);
      }

      // C. 唤醒虚拟路由双通道空降自愈
      if (active) {
        virtualRouter.initialize();
      }

      // D. 静默激活本地物理存储自动垃圾回收自愈引擎 (E07-S05)
      try {
        await executeStorageGarbageCollection();
      } catch (err) {
        console.warn("[Storage] 冷启动存储垃圾回收未完全成功:", err);
      }

      if (active) {
        setStorageState("ready");
      }
    }

    initPlatformAndHeal();

    // D. 挂载浏览器 popstate 拦截桥
    const handlePopState = (e: PopStateEvent) => {
      if (isRouteState(e.state)) {
        virtualRouter.emitChange(e.state);
      } else {
        // Next.js 会在 history.state 写入自己的字段；那不是虚拟路由真相。
        const hash = window.location.hash;
        const matchedState = parseHash(hash);
        virtualRouter.emitChange(matchedState);
      }
    };

    window.addEventListener("popstate", handlePopState);

    // E. 挂载断联/切后台即时物理自愈 GC 垃圾回收器 (E07-S06-1)
    const handleVisibilityChange = async () => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        if (!db.isOpen.call(db)) return;
        try {
          const now = Date.now();
          const minimumAgeMs = 2 * 60 * 1000; // 2分钟安全期，避免误杀正在流式导入的活跃任务
          const ghosts = await db.importTasks
            .filter((task) =>
              shouldSweepLegacyImportTask(
                {
                  createdAt: task.createdAt,
                  chapterCount: task.chapters.length,
                  hasLifecycle: Boolean(task.lifecycle),
                  lifecycleState: task.lifecycle?.state,
                },
                now,
                minimumAgeMs,
              ),
            )
            .toArray();
          if (ghosts.length > 0) {
            await db.importTasks.bulkDelete(ghosts.map((g) => g.id));
            console.log(
              `[Storage GC] 🧹 离场清算！在切后台/断联瞬间物理驱逐了 ${ghosts.length} 个空壳草稿任务。`,
            );
          }
        } catch (err) {
          console.warn("[Storage GC] 离场静默清扫遭遇意外阻碍:", err);
        }
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    return () => {
      active = false;
      window.removeEventListener("popstate", handlePopState);
      if (typeof document !== "undefined") {
        document.removeEventListener(
          "visibilitychange",
          handleVisibilityChange,
        );
      }
    };
  }, [storageAttempt]);

  if (storageState !== "ready") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--ui-bg)] px-6 text-[var(--ui-text)]">
        {storageState === "failed" ? (
          <section
            role="alert"
            className="w-full max-w-md rounded-2xl border border-[var(--ui-border)] bg-white/80 p-6 shadow-sm"
          >
            <h1 className="text-lg font-bold">本地数据暂时无法打开</h1>
            <p className="mt-3 text-sm leading-6 text-[var(--ui-text-secondary)]">
              {storageError}
            </p>
            <button
              type="button"
              className="mt-5 min-h-11 rounded-xl border border-[var(--ui-border)] px-4 text-sm font-bold"
              onClick={() => {
                db.close();
                setStorageAttempt((attempt) => attempt + 1);
              }}
            >
              重试打开本地数据
            </button>
          </section>
        ) : (
          <p role="status" aria-live="polite" className="text-sm font-medium">
            正在安全打开本地书架…
          </p>
        )}
      </main>
    );
  }

  return (
    <>
      {storageNotice && (
        <aside
          role="alert"
          aria-live="assertive"
          className="fixed inset-x-3 top-3 z-[120] mx-auto flex max-w-2xl items-start gap-3 rounded-2xl border border-amber-300/80 bg-[#FFF9E8]/95 p-4 text-[#6E5226] shadow-[0_14px_40px_rgba(80,65,45,0.16)] backdrop-blur"
        >
          <p className="flex-1 text-sm leading-6">{storageNotice}</p>
          <button
            type="button"
            aria-label="关闭恢复提示"
            className="ui-focus-ring min-h-11 min-w-11 rounded-xl text-lg"
            onClick={() => setStorageNotice("")}
          >
            ×
          </button>
        </aside>
      )}
      {children}
    </>
  );
}
export default RouteProvider;
