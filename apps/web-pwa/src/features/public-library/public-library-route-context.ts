import {
  PUBLIC_LIBRARY_CATEGORIES,
  PUBLIC_LIBRARY_TAGS,
  type PublicLibraryCategoryId,
  type PublicLibraryTagId,
} from "@reader/shared-types";

export type PublicLibraryCatalogView =
  | "books"
  | "maintainers"
  | "categories"
  | "tags";

export interface PublicLibraryRouteContext {
  view: PublicLibraryCatalogView;
  query: string;
  categoryId: PublicLibraryCategoryId | "";
  tagId: PublicLibraryTagId | "";
  maintainerId: string;
  page: number;
}

const VIEWS = new Set<PublicLibraryCatalogView>([
  "books",
  "maintainers",
  "categories",
  "tags",
]);
const CATEGORY_IDS = new Set(PUBLIC_LIBRARY_CATEGORIES.map((item) => item.id));
const TAG_IDS = new Set(PUBLIC_LIBRARY_TAGS.map((item) => item.id));

function queryFrom(raw: string) {
  const normalized = raw.startsWith("#") ? raw.slice(1) : raw;
  const queryIndex = normalized.indexOf("?");
  return new URLSearchParams(queryIndex >= 0 ? normalized.slice(queryIndex + 1) : "");
}

function boundedText(value: string | null, maxLength: number): string {
  if (!value) return "";
  const normalized = value.normalize("NFKC").trim();
  return normalized.length <= maxLength && !/[\u0000-\u001f\u007f]/u.test(normalized)
    ? normalized
    : "";
}

export function parsePublicLibraryRouteContext(
  raw: string,
): PublicLibraryRouteContext {
  const params = queryFrom(raw);
  const requestedView = params.get("view") as PublicLibraryCatalogView | null;
  const requestedCategory = params.get("category") as PublicLibraryCategoryId | null;
  const requestedTag = params.get("tag") as PublicLibraryTagId | null;
  const requestedPage = Number(params.get("page"));

  return {
    view: requestedView && VIEWS.has(requestedView) ? requestedView : "books",
    query: boundedText(params.get("q"), 120),
    categoryId:
      requestedCategory && CATEGORY_IDS.has(requestedCategory)
        ? requestedCategory
        : "",
    tagId: requestedTag && TAG_IDS.has(requestedTag) ? requestedTag : "",
    maintainerId: boundedText(params.get("maintainer"), 64),
    page:
      Number.isSafeInteger(requestedPage) && requestedPage >= 1 && requestedPage <= 100_000
        ? requestedPage
        : 1,
  };
}

export function serializePublicLibraryRouteContext(
  context: PublicLibraryRouteContext,
): string {
  const params = new URLSearchParams();
  if (context.view !== "books") params.set("view", context.view);
  const queryText = boundedText(context.query, 120);
  const maintainerId = boundedText(context.maintainerId, 64);
  if (queryText) params.set("q", queryText);
  if (context.categoryId) params.set("category", context.categoryId);
  if (context.tagId) params.set("tag", context.tagId);
  if (maintainerId) params.set("maintainer", maintainerId);
  if (context.page > 1) params.set("page", String(context.page));
  const query = params.toString();
  return query ? `/public-library?${query}` : "/public-library";
}
