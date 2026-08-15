"use client";

import {
  DEFAULT_ROUTE_STATE,
  normalizeRouteState,
  parseAppLocation,
  serializeAppLocation,
  type AppView,
  type RouteState,
} from "./navigation-state";

export type { AppView, RouteState } from "./navigation-state";
export const parseHash = parseAppLocation;
export const serializeState = serializeAppLocation;

// 内存单例缓存
let currentState: RouteState = { ...DEFAULT_ROUTE_STATE };
const listeners = new Set<() => void>();

// 内存中常驻的滚动位置记忆字典，key 为 view 标识符，value 为滚动高度
export const viewScrollMemory: Record<string, number> = {};
export const ROUTE_CONTEXT_EVENT = "reading-world-route-context";

const VIEW_SCROLL_STORAGE_PREFIX = "reading_world_view_scroll:";
const VIEW_FOCUS_STORAGE_PREFIX = "reading_world_view_focus:";

export function rememberViewScrollPosition(
  viewKey: string,
  scrollTop: number,
): void {
  const normalized =
    Number.isFinite(scrollTop) && scrollTop >= 0 ? scrollTop : 0;
  viewScrollMemory[viewKey] = normalized;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      `${VIEW_SCROLL_STORAGE_PREFIX}${viewKey}`,
      String(normalized),
    );
  } catch {
    // Session storage can be unavailable in hardened/private browser contexts.
  }
}

export function readViewScrollPosition(viewKey: string): number {
  if (viewScrollMemory[viewKey] !== undefined) return viewScrollMemory[viewKey];
  if (typeof window === "undefined") return 0;
  try {
    const value = Number(
      window.sessionStorage.getItem(`${VIEW_SCROLL_STORAGE_PREFIX}${viewKey}`),
    );
    return Number.isFinite(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

export function rememberViewSourceFocus(
  viewKey: string,
  sourceId: string,
): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      `${VIEW_FOCUS_STORAGE_PREFIX}${viewKey}`,
      sourceId,
    );
  } catch {
    // Focus restoration is a progressive enhancement when storage is unavailable.
  }
}

export function readViewSourceFocus(viewKey: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(
      `${VIEW_FOCUS_STORAGE_PREFIX}${viewKey}`,
    );
  } catch {
    return null;
  }
}

// 保存快照至 LocalStorage 确保刷新零丢失自愈
const STORAGE_KEY = "read_realm_virtual_route_snapshot";

export function saveRouteSnapshot(state: RouteState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(normalizeRouteState(state)),
    );
  } catch (e) {
    console.error("Failed to save route snapshot:", e);
  }
}

export function loadRouteSnapshot(): RouteState | null {
  if (typeof window === "undefined") return null;
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? normalizeRouteState(JSON.parse(data)) : null;
  } catch {
    return null;
  }
}

// 虚拟路由的核心控制中心 (Publisher)
export const virtualRouter = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot(): RouteState {
    return currentState;
  },

  // 强制同步最新状态并广播
  emitChange(newState: Partial<RouteState>) {
    currentState = normalizeRouteState({ ...currentState, ...newState });
    saveRouteSnapshot(currentState);
    listeners.forEach((listener) => listener());
  },

  // 进行虚拟跳转，物理上只更改 hash，绝对零页面重载
  navigateTo(
    view: AppView,
    params?: {
      bookId?: string;
      chapterIndex?: number;
      panel?: string | null;
      taskId?: string;
    },
  ) {
    if (typeof window === "undefined") return;

    const nextState = normalizeRouteState({
      currentView: view,
      activeBookId: params?.bookId ?? null,
      activeChapterIndex: params?.chapterIndex ?? null,
      activePanel: params?.panel ?? null,
      activeTaskId: params?.taskId ?? null,
    });

    const targetHash = serializeState(nextState);

    // 静默推入 History State 栈
    window.history.pushState(nextState, "", `#${targetHash}`);

    // 刷新状态机并触发订阅广播
    this.emitChange(nextState);
  },

  // 替换当前历史记录（通常用于重定向、避免返回死循环）
  replaceTo(
    view: AppView,
    params?: {
      bookId?: string;
      chapterIndex?: number;
      panel?: string | null;
      taskId?: string;
    },
  ) {
    if (typeof window === "undefined") return;

    const nextState = normalizeRouteState({
      currentView: view,
      activeBookId: params?.bookId ?? null,
      activeChapterIndex: params?.chapterIndex ?? null,
      activePanel: params?.panel ?? null,
      activeTaskId: params?.taskId ?? null,
    });

    const targetHash = serializeState(nextState);
    window.history.replaceState(nextState, "", `#${targetHash}`);
    this.emitChange(nextState);
  },

  // 物理返回，接轨 popstate 机制
  goBack() {
    if (typeof window === "undefined") return;
    window.history.back();
  },

  // 初始化方法，刷新时通过 Hash 或是本地缓存自愈
  initialize() {
    if (typeof window === "undefined") return;

    const hash = window.location.hash;
    const urlState = parseHash(hash);

    // 双通道结合自愈
    if (hash) {
      currentState = normalizeRouteState(urlState);
    } else {
      const snapshot = loadRouteSnapshot();
      if (snapshot && snapshot.currentView !== "library") {
        currentState = snapshot;
        // 同步更新地址栏，达到完美的刷新回归体验
        const targetHash = serializeState(currentState);
        window.history.replaceState(currentState, "", `#${targetHash}`);
      } else {
        currentState = { ...DEFAULT_ROUTE_STATE, currentView: "library" };
        window.history.replaceState(currentState, "", "#/library");
      }
    }

    this.emitChange(currentState);
  },
};

// 极客级「外科手术式代理 Hook」
// 无缝替代 Next.js 的 useRouter，将物理跳转以纳秒级响应直接映射为虚拟路由状态机的跳转
export function useVirtualRouter() {
  return {
    push(url: string) {
      if (typeof window === "undefined") return;

      const nextState = parseAppLocation(url);
      const location = url.startsWith("#") ? url.slice(1) : url;
      const [path, query = ""] = location.split("?", 2);
      if (
        nextState.currentView === path.slice(1) &&
        (path === "/library" ||
          path === "/public-library" ||
          path === "/search")
      ) {
        const target = query ? `${path}?${query}` : path;
        window.history.pushState(nextState, "", `#${target}`);
        virtualRouter.emitChange(nextState);
        window.dispatchEvent(new Event(ROUTE_CONTEXT_EVENT));
        return;
      }

      virtualRouter.navigateTo(nextState.currentView, {
        bookId: nextState.activeBookId ?? undefined,
        chapterIndex: nextState.activeChapterIndex ?? undefined,
        panel: nextState.activePanel,
        taskId: nextState.activeTaskId ?? undefined,
      });
    },
    replace(url: string) {
      this.push(url);
    },
    prefetch(url: string) {
      // 虚拟路由下页面完全处于同一 React 树中，无 prefetch 损耗
      void url;
    },
    back() {
      virtualRouter.goBack();
    },
  };
}
