import type { LocalSearchFilter } from "./search-results";

const FILTERS = new Set<LocalSearchFilter>([
  "综合",
  "书名",
  "作者",
  "标签",
  "连载中",
  "已完结",
]);

export interface SearchRouteContext {
  query: string;
  filter: LocalSearchFilter;
}

function normalizeQuery(value: string | null) {
  if (!value) return "";
  const normalized = value.normalize("NFKC").trim();
  return normalized.length <= 120 && !/[\u0000-\u001f\u007f]/u.test(normalized)
    ? normalized
    : "";
}

export function parseSearchRouteContext(raw: string): SearchRouteContext {
  const queryIndex = raw.indexOf("?");
  const params = new URLSearchParams(queryIndex >= 0 ? raw.slice(queryIndex + 1) : "");
  const filter = params.get("filter") as LocalSearchFilter | null;
  return {
    query: normalizeQuery(params.get("q")),
    filter: filter && FILTERS.has(filter) ? filter : "综合",
  };
}

export function serializeSearchRouteContext(context: SearchRouteContext) {
  const params = new URLSearchParams();
  const query = normalizeQuery(context.query);
  if (query) params.set("q", query);
  if (context.filter !== "综合") params.set("filter", context.filter);
  const value = params.toString();
  return value ? `/search?${value}` : "/search";
}
