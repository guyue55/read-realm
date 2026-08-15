export type LibraryRouteSort = "recent" | "title";
export type LibraryRouteView = "cover" | "compact" | "list";

export interface LibraryRouteContext {
  folderId: string | undefined;
  page: number;
  sort: LibraryRouteSort;
  view: LibraryRouteView;
}

export function canClampLibraryRoutePage(input: {
  localInventoryReady: boolean;
  activeShareToken: string;
  verifiedCloudToken: string | null;
}): boolean {
  return (
    input.localInventoryReady &&
    (!input.activeShareToken ||
      input.verifiedCloudToken === input.activeShareToken)
  );
}

export function canCommitCloudInventory(input: {
  activeShareToken: string;
  activeGeneration: number;
  requestShareToken: string;
  requestGeneration: number;
}): boolean {
  return (
    input.activeShareToken === input.requestShareToken &&
    input.activeGeneration === input.requestGeneration
  );
}

const MAX_LIBRARY_PAGE = 100_000;
const MAX_FOLDER_ID_LENGTH = 256;

function readQuery(raw: string): URLSearchParams {
  const normalized = raw.startsWith("#") ? raw.slice(1) : raw;
  const queryIndex = normalized.indexOf("?");
  return new URLSearchParams(
    queryIndex >= 0 ? normalized.slice(queryIndex + 1) : "",
  );
}

function normalizeFolderId(value: string | null): string | undefined {
  if (
    !value ||
    value.length > MAX_FOLDER_ID_LENGTH ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    return undefined;
  }
  return value;
}

function normalizePage(value: string | null): number {
  if (!value || !/^\d+$/u.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 1 && page <= MAX_LIBRARY_PAGE
    ? page
    : 1;
}

export function parseLibraryRouteContext(
  raw: string,
  fallbackView: LibraryRouteView = "cover",
): LibraryRouteContext {
  const params = readQuery(raw);
  const view = params.get("view");
  const sort = params.get("sort");

  return {
    folderId: normalizeFolderId(params.get("folder") ?? params.get("folderId")),
    page: normalizePage(params.get("page")),
    sort: sort === "title" ? "title" : "recent",
    view:
      view === "compact" || view === "list" || view === "cover"
        ? view
        : fallbackView,
  };
}

export function serializeLibraryRouteContext(
  context: LibraryRouteContext,
): string {
  const params = new URLSearchParams();
  const folderId = normalizeFolderId(context.folderId ?? null);
  if (folderId) params.set("folder", folderId);
  if (context.page > 1 && context.page <= MAX_LIBRARY_PAGE) {
    params.set("page", String(context.page));
  }
  if (context.sort === "title") params.set("sort", "title");
  params.set("view", context.view);

  const query = params.toString();
  return query ? `/library?${query}` : "/library";
}
