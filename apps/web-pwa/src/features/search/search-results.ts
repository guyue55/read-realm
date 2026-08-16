import type { Book } from "@reader/shared-types";

export type RemoteSearchResult = {
  status: "idle" | "loading" | "ready" | "failed";
  items: Book[];
};

export type LocalSearchFilter =
  | "综合"
  | "书名"
  | "作者"
  | "标签"
  | "连载中"
  | "已完结";

export function searchLocalBooks(
  books: readonly Book[],
  inputQuery: string,
  filter: LocalSearchFilter,
  limit = 12,
): Book[] {
  const query = inputQuery.trim().toLocaleLowerCase("zh-CN");
  if (!query) return [];
  return books
    .filter((book) => {
      const titleMatch = book.title.toLocaleLowerCase("zh-CN").includes(query);
      const authorMatch = book.author
        ?.toLocaleLowerCase("zh-CN")
        .includes(query) ?? false;
      // 历史导入或备份恢复的书籍可能缺少 tags / status 字段，缺失时按空处理，避免整页崩溃。
      const tags = Array.isArray(book.tags) ? book.tags : [];
      const status = book.status ?? "";
      const tagsMatch = tags.some((tag) =>
        tag.toLocaleLowerCase("zh-CN").includes(query),
      );
      if (filter === "书名") return titleMatch;
      if (filter === "作者") return authorMatch;
      if (filter === "标签") return tagsMatch;
      if (filter === "已完结") {
        return (titleMatch || authorMatch || tagsMatch) && status === "finished";
      }
      if (filter === "连载中") {
        return (titleMatch || authorMatch || tagsMatch) && status !== "finished";
      }
      return titleMatch || authorMatch || tagsMatch;
    })
    .slice(0, Math.max(0, Math.floor(limit)));
}

export function mergeSearchResults(local: Book[], remote: RemoteSearchResult) {
  return { local, remote: remote.items, remoteStatus: remote.status };
}
