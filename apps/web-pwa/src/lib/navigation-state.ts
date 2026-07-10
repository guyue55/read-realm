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
  activePanel: string | null;
  activeTaskId: string | null;
}

export const DEFAULT_ROUTE_STATE: RouteState = {
  currentView: "library",
  activeBookId: null,
  activeChapterIndex: null,
  activePanel: null,
  activeTaskId: null,
};

const READER_PANELS = new Set(["settings", "toc", "ai", "progress"]);
const APP_VIEWS = new Set<AppView>([
  "library",
  "reader",
  "search",
  "notes",
  "settings",
  "book-detail",
  "import",
  "import-preview",
]);
const SIMPLE_VIEWS = new Set<AppView>(["search", "notes", "settings", "import"]);

function defaultRouteState(): RouteState {
  return { ...DEFAULT_ROUTE_STATE };
}

function decodePathValue(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function normalizeChapterIndex(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "string" && value.trim() === "") return null;

  const index = Number(value);
  return Number.isSafeInteger(index) && index >= 0 ? index : null;
}

function normalizeIdentifier(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

export function normalizeRouteState(input: unknown): RouteState {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return defaultRouteState();
  }

  const state = input as Record<string, unknown>;
  const view = state.currentView;
  if (typeof view !== "string" || !APP_VIEWS.has(view as AppView)) {
    return defaultRouteState();
  }

  if (view === "reader") {
    const activeBookId = normalizeIdentifier(state.activeBookId);
    if (!activeBookId) return defaultRouteState();

    const panel = state.activePanel;
    return {
      currentView: "reader",
      activeBookId,
      activeChapterIndex: normalizeChapterIndex(state.activeChapterIndex),
      activePanel:
        typeof panel === "string" && READER_PANELS.has(panel) ? panel : null,
      activeTaskId: null,
    };
  }

  if (view === "book-detail") {
    const activeBookId = normalizeIdentifier(state.activeBookId);
    return activeBookId
      ? { ...defaultRouteState(), currentView: "book-detail", activeBookId }
      : defaultRouteState();
  }

  if (view === "import-preview") {
    const activeTaskId = normalizeIdentifier(state.activeTaskId);
    return activeTaskId
      ? { ...defaultRouteState(), currentView: "import-preview", activeTaskId }
      : defaultRouteState();
  }

  return { ...defaultRouteState(), currentView: view as AppView };
}

export function parseAppLocation(raw: string): RouteState {
  const location = raw.startsWith("#") ? raw.slice(1) : raw;
  if (!location || location === "/" || location === "/library") {
    return defaultRouteState();
  }

  const [path, query = ""] = location.split("?", 2);
  const readerMatch = path.match(/^\/reader\/([^?#]+)/);
  if (readerMatch) {
    const activeBookId = decodePathValue(readerMatch[1]);
    if (!activeBookId) return defaultRouteState();

    const searchParams = new URLSearchParams(query);
    const panel = searchParams.get("panel");
    return {
      currentView: "reader",
      activeBookId,
      activeChapterIndex: normalizeChapterIndex(searchParams.get("chapter")),
      activePanel: panel && READER_PANELS.has(panel) ? panel : null,
      activeTaskId: null,
    };
  }

  const bookDetailMatch = path.match(/^\/book\/([^?#]+)/);
  if (bookDetailMatch) {
    const activeBookId = decodePathValue(bookDetailMatch[1]);
    return activeBookId
      ? { ...defaultRouteState(), currentView: "book-detail", activeBookId }
      : defaultRouteState();
  }

  const importPreviewMatch = path.match(/^\/import\/preview\/([^?#]+)/);
  if (importPreviewMatch) {
    const activeTaskId = decodePathValue(importPreviewMatch[1]);
    return activeTaskId
      ? { ...defaultRouteState(), currentView: "import-preview", activeTaskId }
      : defaultRouteState();
  }

  const view = path.slice(1);
  return SIMPLE_VIEWS.has(view as AppView)
    ? { ...defaultRouteState(), currentView: view as AppView }
    : defaultRouteState();
}

export function serializeAppLocation(state: RouteState): string {
  state = normalizeRouteState(state);
  if (state.currentView === "library") return "/library";

  if (state.currentView === "reader" && state.activeBookId) {
    const params = new URLSearchParams();
    if (
      state.activeChapterIndex !== null &&
      Number.isSafeInteger(state.activeChapterIndex) &&
      state.activeChapterIndex >= 0
    ) {
      params.set("chapter", state.activeChapterIndex.toString());
    }
    if (state.activePanel && READER_PANELS.has(state.activePanel)) {
      params.set("panel", state.activePanel);
    }

    const path = `/reader/${encodeURIComponent(state.activeBookId)}`;
    const query = params.toString();
    return query ? `${path}?${query}` : path;
  }

  if (state.currentView === "book-detail" && state.activeBookId) {
    return `/book/${encodeURIComponent(state.activeBookId)}`;
  }

  if (state.currentView === "import-preview" && state.activeTaskId) {
    return `/import/preview/${encodeURIComponent(state.activeTaskId)}`;
  }

  return `/${state.currentView}`;
}
