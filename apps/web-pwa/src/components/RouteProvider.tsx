"use client";

import React, { useEffect, useSyncExternalStore } from "react";
import { virtualRouter, RouteState, parseHash } from "@/lib/route-store";

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

// 虚拟路由副作用容器，接管 popstate 和自愈
export function RouteProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // 1. 唤醒双通道空降自愈
    virtualRouter.initialize();

    // 2. 挂载浏览器 popstate 拦截桥
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
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  return <>{children}</>;
}
export default RouteProvider;
