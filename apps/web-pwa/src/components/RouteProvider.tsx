"use client";

import React, { useEffect, useSyncExternalStore } from "react";
import { virtualRouter, RouteState, parseHash } from "@/lib/route-store";
import { checkAndRestoreFromBackup, executeStorageGarbageCollection } from "@reader/storage-core";

interface SafeWindow {
  requestIdleCallback?: (
    callback: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void,
    options?: { timeout?: number }
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
    getServerSnapshot
  );
}

// 虚拟路由副作用容器，接管 popstate、持久特权申请与防蒸发降卷自愈
export function RouteProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    let active = true;

    async function initPlatformAndHeal() {
      // A. 自动申请 navigator.storage.persist() 存储持久化特权 (E07-S03)
      if (typeof navigator !== "undefined" && navigator.storage && navigator.storage.persist) {
        try {
          const isPersisted = await navigator.storage.persist();
          console.log(`[Storage] 首次冷启动持久化特权状态: ${isPersisted ? "已获得物理保护 (Persisted)" : "未批准物理保护 (Best Effort)"}`);
        } catch (err) {
          console.warn("[Storage] 持久化特权申请受限:", err);
        }
      }

      // B. 校验并执行防清除双轨冗余镜像自愈 (E07-S04)
      try {
        const didRestore = await checkAndRestoreFromBackup();
        if (didRestore && active) {
          console.log("[Storage] 冷启动自愈引擎：拦截到数据空虚！已完美还原书架镜像及进度、书签。");
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

    }

    initPlatformAndHeal();

    // D. 挂载浏览器 popstate 拦截桥
    const handlePopState = (e: PopStateEvent) => {
      if (e.state) {
        virtualRouter.emitChange(e.state);
      } else {
        // 后退到了无状态节点，再次高灵敏读取 Hash 匹配
        const hash = window.location.hash;
        const matchedState = parseHash(hash);
        virtualRouter.emitChange(matchedState);
      }
    };

    window.addEventListener("popstate", handlePopState);

    // E. 挂载断联/切后台即时物理自愈 GC 垃圾回收器 (E07-S06-1)
    const handleVisibilityChange = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        try {
          const { db } = await import("@reader/storage-core");
          const now = Date.now();
          const minimumAgeMs = 2 * 60 * 1000; // 2分钟安全期，避免误杀正在流式导入的活跃任务
          const ghosts = await db.importTasks
            .filter(t => t.chapters.length === 0 && (now - new Date(t.createdAt).getTime() > minimumAgeMs))
            .toArray();
          if (ghosts.length > 0) {
            await db.importTasks.bulkDelete(ghosts.map(g => g.id));
            console.log(`[Storage GC] 🧹 离场清算！在切后台/断联瞬间物理驱逐了 ${ghosts.length} 个空壳草稿任务。`);
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
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };
  }, []);

  return <>{children}</>;
}
export default RouteProvider;
