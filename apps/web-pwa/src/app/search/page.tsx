"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ROUTE_CONTEXT_EVENT, useVirtualRouter } from "@/lib/route-store";
import { normalizeShareToken } from "@/lib/api";
import { strings } from "@/lib/i18n";
import type { Book } from "@reader/shared-types";
import { Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { BookCard } from "@/components/BookCard";
import { BookCover } from "@/components/BookCover";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { libraryQueryService } from "@/features/library/dexie-library-query";
import {
  createLegacyPersonalSyncApiClient,
  type LegacyRemoteBook,
} from "@/features/library/legacy-personal-sync-api";
import { createPersonalSyncService } from "@/features/library/personal-sync-service";
import { clearSyncTask, markSyncTask } from "@/features/library/sync-tasks";
import {
  searchLocalBooks,
  type LocalSearchFilter,
} from "@/features/search/search-results";
import {
  parseSearchRouteContext,
  serializeSearchRouteContext,
} from "@/features/search/search-route-context";

export default function SearchPage() {
  const isOnline = useOnlineStatus();
  const router = useVirtualRouter();
  const [initialRouteContext] = useState(() =>
    parseSearchRouteContext(
      typeof window === "undefined" ? "/search" : window.location.hash,
    ),
  );
  const [searchQuery, setSearchQuery] = useState(initialRouteContext.query);
  const [activeFilter, setActiveFilter] = useState<LocalSearchFilter>(
    initialRouteContext.filter,
  );

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.pathname !== "/") {
      window.location.replace(
        `/#${window.location.pathname}${window.location.search}`,
      );
    }
  }, []);

  useEffect(() => {
    const targetHash = `#${serializeSearchRouteContext({
      query: searchQuery,
      filter: activeFilter,
    })}`;
    if (window.location.hash !== targetHash) {
      window.history.replaceState(window.history.state, "", targetHash);
    }
  }, [activeFilter, searchQuery]);

  const [inventoryGeneration, setInventoryGeneration] = useState(0);
  const [globalResults, setGlobalResults] = useState<LegacyRemoteBook[]>([]);
  const [remoteStatus, setRemoteStatus] = useState<
    "idle" | "loading" | "ready" | "failed"
  >("idle");
  const [isSearching, setIsSearching] = useState(false);
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState<"info" | "error">("info");
  const [toastMsg, setToastMsg] = useState("");
  const searchGenerationRef = useRef(0);

  const invalidateRemoteSearchResults = useCallback(() => {
    const generation = searchGenerationRef.current + 1;
    searchGenerationRef.current = generation;
    setGlobalResults([]);
    setRemoteStatus("idle");
    setIsSearching(false);
    setStatus("");
    setStatusTone("info");
    return generation;
  }, []);

  useEffect(() => {
    const restoreRouteContext = () => {
      const context = parseSearchRouteContext(window.location.hash);
      invalidateRemoteSearchResults();
      setSearchQuery(context.query);
      setActiveFilter(context.filter);
    };
    window.addEventListener("popstate", restoreRouteContext);
    window.addEventListener(ROUTE_CONTEXT_EVENT, restoreRouteContext);
    return () => {
      window.removeEventListener("popstate", restoreRouteContext);
      window.removeEventListener(ROUTE_CONTEXT_EVENT, restoreRouteContext);
    };
  }, [invalidateRemoteSearchResults]);

  // 记录每个云端书籍的下载同步百分比与正在同步状态
  const [importProgress, setImportProgress] = useState<Record<string, number>>(
    {},
  );
  const [importingBookIds, setImportingBookIds] = useState<Set<string>>(
    new Set(),
  );

  // Toast 优雅毛玻璃自动淡出
  useEffect(() => {
    if (toastMsg) {
      const timer = setTimeout(() => setToastMsg(""), 4000);
      return () => clearTimeout(timer);
    }
  }, [toastMsg]);

  // Global Geeky keyboard shortcuts: / to focus search, Esc to blur
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInputActive =
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.tagName === "SELECT" ||
          activeEl.getAttribute("contenteditable") === "true");

      if (isInputActive) {
        if (e.key === "Escape") {
          (activeEl as HTMLElement).blur();
        }
        return;
      }

      if (e.key === "/") {
        e.preventDefault();
        const searchInput = document.getElementById("search-input-field");
        if (searchInput) {
          searchInput.focus();
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  const [debouncedQuery, setDebouncedQuery] = useState("");

  const localInventory = useLiveQuery(
    async () => {
      try {
        return await libraryQueryService.readSyncInventory();
      } catch (error) {
        console.error("读取本地搜索快照失败", error);
        setStatusTone("error");
        setStatus("本地书架暂时无法读取，请刷新后重试。");
        return { books: [] as Book[], folders: [] };
      }
    },
    [inventoryGeneration],
    { books: [] as Book[], folders: [] },
  );
  const localBooks = localInventory.books;
  const localBookIds = useMemo(
    () => new Set(localBooks.map((book) => book.id)),
    [localBooks],
  );

  useEffect(() => {
    const refresh = () =>
      setInventoryGeneration((generation) => generation + 1);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  // 1. 输入防抖 200ms：打字期间仅流畅更新 searchQuery State，停顿 200ms 后再向 IndexedDB 触发本地检索
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const localResults = useMemo(
    () => searchLocalBooks(localBooks, debouncedQuery, activeFilter),
    [activeFilter, debouncedQuery, localBooks],
  );

  // 只搜索已绑定分享密钥的私人旧云端；公共馆藏留给 GATE-03。
  const handleGlobalSearch = async (overrideQuery?: string) => {
    const queryToSearch =
      overrideQuery !== undefined ? overrideQuery : searchQuery;
    if (!queryToSearch.trim()) return;

    const generation = invalidateRemoteSearchResults();

    if (!isOnline) {
      setStatusTone("info");
      setStatus(strings.network.offlineSearchHint);
      setIsSearching(false);
      return;
    }

    const shareToken = normalizeShareToken(
      window.localStorage.getItem("reader-share-token"),
    );
    if (!shareToken) {
      setGlobalResults([]);
      setRemoteStatus("failed");
      setStatusTone("error");
      setStatus("尚未绑定私人云端密钥；本地搜索仍可正常使用。");
      return;
    }

    setIsSearching(true);
    setRemoteStatus("loading");
    setStatusTone("info");
    setStatus(strings.shelf.searchingGlobal);
    try {
      const results =
        await createLegacyPersonalSyncApiClient(shareToken).searchBooks(
          queryToSearch,
        );
      if (
        generation !== searchGenerationRef.current ||
        normalizeShareToken(
          window.localStorage.getItem("reader-share-token"),
        ) !== shareToken
      ) {
        return;
      }
      setGlobalResults(results);
      setRemoteStatus("ready");
      setStatus(
        strings.shelf.foundResults.replace(
          "{count}",
          results.length.toString(),
        ),
      );
    } catch (e) {
      console.error("Global search failed", e);
      if (generation !== searchGenerationRef.current) return;
      setGlobalResults([]);
      setRemoteStatus("failed");
      setStatusTone("error");
      setStatus("私人云端暂时不可用；本地搜索和已下载阅读不受影响。");
    } finally {
      if (generation === searchGenerationRef.current) setIsSearching(false);
    }
  };

  const handleImportBook = async (book: LegacyRemoteBook) => {
    if (!isOnline) {
      setToastMsg(strings.network.offlineDownloadHint);
      return;
    }

    if (importingBookIds.has(book.id)) return;

    const shareToken = normalizeShareToken(
      window.localStorage.getItem("reader-share-token"),
    );
    if (!shareToken) {
      setToastMsg("私人云端密钥已变更，未写入本地书架。");
      return;
    }

    setImportingBookIds((prev) => {
      const next = new Set(prev);
      next.add(book.id);
      return next;
    });
    setImportProgress((prev) => ({ ...prev, [book.id]: 0 }));
    markSyncTask(window.localStorage, book.id, "download", shareToken);

    try {
      const api = createLegacyPersonalSyncApiClient(shareToken);
      const outcome = await createPersonalSyncService(api).downloadBook(book, {
        onPage: (loaded, total) => {
          setImportProgress((prev) => ({
            ...prev,
            [book.id]: Math.round((loaded / Math.max(1, total)) * 100),
          }));
        },
        shouldCommit: () =>
          normalizeShareToken(
            window.localStorage.getItem("reader-share-token"),
          ) === shareToken,
      });
      if (outcome.status === "failed") {
        setToastMsg(
          outcome.code === "sync_generation_changed"
            ? "私人云端密钥已变更，未写入本地书架。"
            : `「${book.title}」正文未完整下载，本地未留下半本书。`,
        );
        return;
      }
      clearSyncTask(window.localStorage, book.id, shareToken);
      if (outcome.status === "already_local") {
        setToastMsg(`「${book.title}」已在本地，保留现有正文与阅读进度。`);
        return;
      }
      setImportProgress((prev) => ({ ...prev, [book.id]: 100 }));
      setToastMsg(
        `「${book.title}」共 ${outcome.chapterCount} 章已完整下载到本地。`,
      );
    } catch (err) {
      console.error("同步云端书籍章节失败:", err);
      setToastMsg("本地存储或云端通道繁忙，请稍后再试。");
    } finally {
      setImportingBookIds((prev) => {
        const next = new Set(prev);
        next.delete(book.id);
        return next;
      });
    }
  };

  return (
    <AppShell
      title="搜索"
      subtitle="本地书架搜索与已绑定的私人云端"
      rightNodes={
        <button
          onClick={() => router.push("/library")}
          className="ui-focus-ring min-h-11 rounded-full border border-[var(--ui-border)] bg-white/70 px-4 py-2 text-sm font-semibold text-[var(--ui-text)] transition-colors hover:bg-white"
        >
          回书架
        </button>
      }
    >
      {/* 搜索/分类 核心框 */}
      <section className="ui-card rounded-[var(--radius-card)] p-4 sm:p-5">
        <form
          className="grid grid-cols-[minmax(0,1fr)_44px] gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            handleGlobalSearch();
          }}
        >
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">{strings.shelf.searchPlaceholder}</span>
            <Search
              aria-hidden="true"
              className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]"
            />
            <input
              id="search-input-field"
              type="text"
              placeholder={`${strings.shelf.searchPlaceholder} (按 '/' 键聚焦)`}
              value={searchQuery}
              onChange={(e) => {
                invalidateRemoteSearchResults();
                setSearchQuery(e.target.value);
              }}
              maxLength={120}
              className="ui-focus-ring min-h-11 w-full rounded-[var(--radius-field)] border border-[var(--color-border)] bg-white/80 pl-11 pr-4 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)]"
              autoFocus
            />
          </label>
          <button
            type="submit"
            disabled={isSearching || !searchQuery.trim()}
            title={
              !searchQuery.trim()
                ? "请输入书名、作者或标签关键词"
                : "搜索私人云端书架"
            }
            aria-label="检索私人云端"
            className="ui-focus-ring inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-primary)] text-sm font-semibold text-white disabled:opacity-45 sm:px-5"
          >
            <Search
              aria-hidden="true"
              className="h-[18px] w-[18px] sm:hidden"
              strokeWidth={1.75}
            />
            <span className="hidden sm:inline">
              {isSearching ? "搜索中" : "搜索私人云端"}
            </span>
          </button>
        </form>

        {/* 馆藏/本地分类过滤栏（完全对齐藏经阁样式与间距） */}
        <div
          aria-label="搜索范围分类"
          className="mt-4 grid grid-cols-3 gap-2 sm:flex sm:overflow-x-auto sm:pb-1"
          role="group"
        >
          {["综合", "书名", "作者", "标签", "连载中", "已完结"].map((label) => {
            const isActive = activeFilter === label;
            return (
              <button
                key={label}
                aria-pressed={isActive}
                onClick={() => {
                  if (activeFilter === label) return;
                  invalidateRemoteSearchResults();
                  setActiveFilter(label as LocalSearchFilter);
                }}
                className={`ui-focus-ring min-h-11 shrink-0 rounded-[var(--radius-control)] border px-3 text-xs font-semibold transition-colors duration-150 ${
                  isActive
                    ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
                    : "border-[var(--color-border)] bg-white/70 text-[var(--color-muted)] hover:bg-white"
                }`}
                type="button"
              >
                {label}
              </button>
            );
          })}
        </div>
      </section>

      {/* 空查询只解释真实搜索范围，不注入推荐书源。 */}
      {!searchQuery.trim() && (
        <section className="ui-card mt-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <h2 className="[font-family:var(--font-display)] text-lg font-semibold text-[var(--ui-text)]">
              搜索自己的书
            </h2>
            <p className="mt-1 text-sm leading-6 text-[var(--ui-muted)]">
              本地书架始终可搜索；绑定私有云密钥后，还可以检索自己的云端副本。
            </p>
          </div>
          <button
            className="ui-focus-ring min-h-11 shrink-0 rounded-[var(--radius-control)] border border-[var(--ui-border)] bg-white/70 px-4 text-sm font-semibold text-[var(--ui-text)]"
            onClick={() => router.push("/public-library")}
            type="button"
          >
            浏览藏经阁
          </button>
        </section>
      )}

      {/* 搜索展示结果区域 */}
      <div className="mt-6">
        {searchQuery.trim() && localResults.length > 0 && (
          <div className="mb-10">
            <h2 className="mb-4 text-xl font-bold text-[var(--ui-text)]">
              本地书架命中 ({localResults.length})
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {localResults.map((book) => (
                <BookCard
                  key={book.id}
                  book={book}
                  onRead={(id) => router.push(`/reader/${id}`)}
                />
              ))}
            </div>
          </div>
        )}

        {status && (
          <p
            role={statusTone === "error" ? "alert" : "status"}
            className="mb-6 rounded-2xl border border-[var(--ui-border)] bg-white/54 px-4 py-3 text-center text-sm text-[var(--ui-muted)] shadow-sm"
          >
            {status}
          </p>
        )}

        {globalResults.length > 0 ? (
          <div>
            <h2 className="mb-4 text-xl font-bold text-[var(--ui-text)]">
              私人云端结果 ({globalResults.length})
            </h2>
            <div className="grid grid-cols-1 gap-3">
              {globalResults.map((book) => {
                const isLocal = localBookIds.has(book.id);
                const isImporting = importingBookIds.has(book.id);
                const pct = importProgress[book.id] || 0;

                return (
                  <div
                    key={book.id}
                    className="ui-card flex flex-col items-stretch gap-4 rounded-[18px] border border-white/60 bg-gradient-to-br from-white/70 to-white/40 p-4 shadow-[0_10px_30px_rgba(80,65,45,0.03)] sm:flex-row sm:items-center"
                  >
                    <BookCover
                      title={book.title}
                      className="h-[108px] w-[72px]"
                      compact
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-lg font-bold text-[var(--ui-text)] font-reading-title">
                            {book.title}
                          </h3>
                          <p className="mt-1 text-sm text-[var(--ui-muted)]">
                            {book.author || "佚名"} ·{" "}
                            {book.format.toUpperCase()}
                          </p>
                        </div>
                        <span className="text-xs font-semibold text-[var(--ui-muted)]">
                          私人云端
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-md bg-[var(--ui-accent-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--ui-accent)]">
                          全本同步
                        </span>
                        <span className="rounded-md bg-[rgba(80,65,45,0.05)] px-2 py-0.5 text-xs text-[var(--ui-muted)]">
                          共 {book.chapterCount} 章节
                        </span>
                      </div>
                    </div>

                    {/* 云端一键同步批量拉取入库控制钮 */}
                    <div className="w-full shrink-0 sm:w-auto">
                      {isLocal ? (
                        <button
                          onClick={() => router.push(`/reader/${book.id}`)}
                          className="ui-focus-ring min-h-11 w-full rounded-full border border-[var(--ui-accent)] bg-[var(--ui-accent-soft)] px-4 py-2 text-xs font-bold text-[var(--ui-accent)] shadow-sm transition-colors hover:bg-[var(--ui-accent)] hover:text-white sm:w-auto"
                        >
                          去阅读
                        </button>
                      ) : isImporting ? (
                        <div
                          role="status"
                          className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full border border-[rgba(95,125,82,0.18)] bg-[rgba(80,65,45,0.06)] px-4 py-2 text-xs font-bold text-[var(--ui-accent)] select-none sm:w-auto"
                        >
                          <svg
                            className="animate-spin h-3.5 w-3.5 text-[var(--ui-accent)]"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            ></circle>
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                          </svg>
                          <span>正在同步 {pct}%</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleImportBook(book)}
                          className="ui-focus-ring min-h-11 w-full rounded-full border border-[var(--ui-border)] bg-white px-4 py-2 text-xs font-bold text-[var(--ui-text)] shadow-sm transition-colors hover:border-[var(--ui-accent)] hover:bg-white hover:text-[var(--ui-accent)] sm:w-auto"
                        >
                          拉取入库
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          !isSearching &&
          remoteStatus !== "failed" &&
          searchQuery.trim() &&
          localResults.length === 0 && (
            <div className="ui-card mt-8 rounded-[16px] py-20 text-center text-[var(--ui-muted)] shadow-sm">
              本地未找到相关书籍；可搜索已绑定的私人云端
            </div>
          )
        )}
      </div>

      {/* 优雅宣纸毛玻璃 Toast */}
      {toastMsg && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center rounded-2xl border border-[rgba(80,65,45,0.15)] bg-[rgba(255,252,245,0.9)] px-5 py-3 text-xs font-bold text-[var(--ui-text)] shadow-lg backdrop-blur-md"
        >
          {toastMsg}
        </div>
      )}
    </AppShell>
  );
}
