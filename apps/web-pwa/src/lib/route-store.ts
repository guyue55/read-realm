"use client";

export type AppView =
  | "library"
  | "reader"
  | "search"
  | "notes"
  | "settings"
  | "book-detail"
  | "import"
  | "import-preview";

export interface RouteState {
  currentView: AppView;
  activeBookId: string | null;
  activeChapterIndex: number | null;
  activePanel: string | null; // e.g. "settings", "toc", "ai", "progress"
  activeTaskId: string | null;
}

const DEFAULT_STATE: RouteState = {
  currentView: "library",
  activeBookId: null,
  activeChapterIndex: null,
  activePanel: null,
  activeTaskId: null,
};

// 内存单例缓存
let currentState: RouteState = { ...DEFAULT_STATE };
const listeners = new Set<() => void>();

// 内存中常驻的滚动位置记忆字典，key 为 view 标识符，value 为滚动高度
export const viewScrollMemory: Record<string, number> = {};


// 浏览器 Hash 解析器
export function parseHash(hashString: string): RouteState {
  const cleanHash = hashString.startsWith("#") ? hashString.slice(1) : hashString;
  if (!cleanHash || cleanHash === "/" || cleanHash === "/library") {
    return { ...DEFAULT_STATE, currentView: "library" };
  }

  // 匹配 #/reader/[bookId] 或 #/reader/[bookId]?chapter=x
  const readerRegex = /^\/reader\/([^?#]+)/;
  const bookDetailRegex = /^\/book\/([^?#]+)/;
  const importPreviewRegex = /^\/import\/preview\/([^?#]+)/;

  if (readerRegex.test(cleanHash)) {
    const match = cleanHash.match(readerRegex);
    const bookId = match ? match[1] : null;

    // 解析 query parameters
    let activeChapterIndex: number | null = null;
    let activePanel: string | null = null;

    const queryIndex = cleanHash.indexOf("?");
    if (queryIndex !== -1) {
      const searchParams = new URLSearchParams(cleanHash.slice(queryIndex));
      const ch = searchParams.get("chapter");
      if (ch !== null) {
        activeChapterIndex = parseInt(ch, 10);
      }
      activePanel = searchParams.get("panel");
    }

    return {
      currentView: "reader",
      activeBookId: bookId,
      activeChapterIndex: (activeChapterIndex === null || isNaN(activeChapterIndex)) ? null : activeChapterIndex,
      activePanel,
      activeTaskId: null,
    };
  }

  if (bookDetailRegex.test(cleanHash)) {
    const match = cleanHash.match(bookDetailRegex);
    const bookId = match ? match[1] : null;
    return {
      ...DEFAULT_STATE,
      currentView: "book-detail",
      activeBookId: bookId,
    };
  }

  if (importPreviewRegex.test(cleanHash)) {
    const match = cleanHash.match(importPreviewRegex);
    const taskId = match ? match[1] : null;
    return {
      ...DEFAULT_STATE,
      currentView: "import-preview",
      activeTaskId: taskId,
    };
  }

  // 匹配简单视图
  const simpleViews: AppView[] = ["search", "notes", "settings", "import"];
  const matchedView = simpleViews.find((v) => cleanHash.startsWith(`/${v}`));

  if (matchedView) {
    return {
      ...DEFAULT_STATE,
      currentView: matchedView,
    };
  }

  return { ...DEFAULT_STATE, currentView: "library" };
}

// 状态序列化并生成目标 Hash 字符串
export function serializeState(state: RouteState): string {
  if (state.currentView === "library") {
    return "/library";
  }
  if (state.currentView === "reader" && state.activeBookId) {
    const hash = `/reader/${state.activeBookId}`;
    const params = new URLSearchParams();
    if (state.activeChapterIndex !== null) {
      params.set("chapter", state.activeChapterIndex.toString());
    }
    if (state.activePanel !== null) {
      params.set("panel", state.activePanel);
    }
    const paramStr = params.toString();
    return paramStr ? `${hash}?${paramStr}` : hash;
  }
  if (state.currentView === "book-detail" && state.activeBookId) {
    return `/book/${state.activeBookId}`;
  }
  if (state.currentView === "import-preview" && state.activeTaskId) {
    return `/import/preview/${state.activeTaskId}`;
  }
  return `/${state.currentView}`;
}

// 保存快照至 LocalStorage 确保刷新零丢失自愈
const STORAGE_KEY = "read_realm_virtual_route_snapshot";

export function saveRouteSnapshot(state: RouteState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("Failed to save route snapshot:", e);
  }
}

export function loadRouteSnapshot(): RouteState | null {
  if (typeof window === "undefined") return null;
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : null;
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
    currentState = { ...currentState, ...newState };
    saveRouteSnapshot(currentState);
    listeners.forEach((listener) => listener());
  },

  // 进行虚拟跳转，物理上只更改 hash，绝对零页面重载
  navigateTo(
    view: AppView,
    params?: { bookId?: string; chapterIndex?: number; panel?: string | null; taskId?: string }
  ) {
    if (typeof window === "undefined") return;

    const nextState: RouteState = {
      currentView: view,
      activeBookId: params?.bookId ?? null,
      activeChapterIndex: params?.chapterIndex ?? null,
      activePanel: params?.panel ?? null,
      activeTaskId: params?.taskId ?? null,
    };

    const targetHash = serializeState(nextState);
    
    // 静默推入 History State 栈
    window.history.pushState(nextState, "", `#${targetHash}`);
    
    // 刷新状态机并触发订阅广播
    this.emitChange(nextState);
  },

  // 替换当前历史记录（通常用于重定向、避免返回死循环）
  replaceTo(
    view: AppView,
    params?: { bookId?: string; chapterIndex?: number; panel?: string | null; taskId?: string }
  ) {
    if (typeof window === "undefined") return;

    const nextState: RouteState = {
      currentView: view,
      activeBookId: params?.bookId ?? null,
      activeChapterIndex: params?.chapterIndex ?? null,
      activePanel: params?.panel ?? null,
      activeTaskId: params?.taskId ?? null,
    };

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
      currentState = urlState;
    } else {
      const snapshot = loadRouteSnapshot();
      if (snapshot && snapshot.currentView !== "library") {
        currentState = snapshot;
        // 同步更新地址栏，达到完美的刷新回归体验
        const targetHash = serializeState(currentState);
        window.history.replaceState(currentState, "", `#${targetHash}`);
      } else {
        currentState = { ...DEFAULT_STATE, currentView: "library" };
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

      // 1. 处理阅读器页面跳转 /reader/[bookId] 或 /reader/[bookId]?chapter=x
      if (url.startsWith("/reader/")) {
        const bookIdAndQuery = url.split("/reader/")[1];
        const queryIndex = bookIdAndQuery.indexOf("?");
        if (queryIndex !== -1) {
          const bookId = bookIdAndQuery.slice(0, queryIndex);
          const searchParams = new URLSearchParams(bookIdAndQuery.slice(queryIndex));
          const chapter = searchParams.get("chapter");
          virtualRouter.navigateTo("reader", {
            bookId,
            chapterIndex: chapter ? parseInt(chapter, 10) : undefined,
          });
        } else {
          virtualRouter.navigateTo("reader", { bookId: bookIdAndQuery });
        }
      } 
      // 2. 处理书籍详情页面跳转 /book/[bookId]
      else if (url.startsWith("/book/")) {
        const bookId = url.split("/book/")[1];
        virtualRouter.navigateTo("book-detail", { bookId });
      } 
      // 3. 处理导入预览跳转 /import/preview/[taskId]
      else if (url.startsWith("/import/preview/")) {
        const taskId = url.split("/import/preview/")[1];
        virtualRouter.navigateTo("import-preview", { taskId });
      }
      // 4. 处理其他基础页面跳转 /library, /search, /settings, /notes, /import 等
      else {
        const cleanUrl = url.startsWith("/") ? url.slice(1) : url;
        virtualRouter.navigateTo(cleanUrl as AppView);
      }
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

