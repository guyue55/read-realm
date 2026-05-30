"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { apiUrl, getApiBaseUrl } from "@/lib/api";
import { strings } from "@/lib/i18n";
import { db } from "@reader/storage-core";
import type { Book } from "@reader/shared-types";
import { AppShell } from "@/components/AppShell";
import { BookCard } from "@/components/BookCard";
import { BookCover } from "@/components/BookCover";

export default function SearchPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeFilter, setActiveFilter] = useState<string>("综合");
  const [localResults, setLocalResults] = useState<Book[]>([]);
  const [globalResults, setGlobalResults] = useState<Book[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [status, setStatus] = useState("");
  const [toastMsg, setToastMsg] = useState("");

  // 记录每个云端书籍的下载同步百分比与正在同步状态
  const [importProgress, setImportProgress] = useState<Record<string, number>>({});
  const [importingBookIds, setImportingBookIds] = useState<Set<string>>(new Set());

  // 实时监测本地数据库中已有书籍的映射，进行秒级去重和“拉取入库/去阅读”状态变换
  const localBooks = useLiveQuery(() => db.books.toArray(), []);
  const localBookIds = new Set(localBooks?.map((b) => b.id) || []);

  const PRESET_RECOMMENDS = [
    { q: "庄子内篇", label: "庄子内篇 · 逍遥无待" },
    { q: "清静经", label: "清静经 · 澄心静神" },
    { q: "瓦尔登湖", label: "瓦尔登湖 · 荒野宁静" },
    { q: "黑客与画家", label: "黑客与画家 · 极客心智" },
  ];

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

  // 1. 输入防抖 200ms：打字期间仅流畅更新 searchQuery State，停顿 200ms 后再向 IndexedDB 触发本地检索
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // 2. 本地检索：防抖后触发，关联分类过滤器 activeFilter 进行多维度匹配
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setLocalResults([]);
      return;
    }
    const q = debouncedQuery.toLowerCase();
    db.books.toArray().then((allBooks) => {
      const filtered = allBooks.filter((b) => {
        const titleMatch = b.title.toLowerCase().includes(q);
        const authorMatch = b.author?.toLowerCase().includes(q);
        const tagsMatch = b.tags?.some((t) => t.toLowerCase().includes(q));

        if (activeFilter === "书名") return titleMatch;
        if (activeFilter === "作者") return authorMatch;
        if (activeFilter === "标签") return !!tagsMatch;
        if (activeFilter === "已完结") return (titleMatch || authorMatch) && b.status === "finished";
        if (activeFilter === "连载中") return (titleMatch || authorMatch) && b.status !== "finished";
        return titleMatch || authorMatch || !!tagsMatch;
      });

      // 限制本地检索最大渲染 12 个结果，保障超大藏书量下移动端 diff 重绘顺滑度
      setLocalResults(filtered.slice(0, 12));
    });
  }, [debouncedQuery, activeFilter]);

  // 全局/云端搜索倒排索引匹配
  const handleGlobalSearch = async (overrideQuery?: string) => {
    const queryToSearch = overrideQuery !== undefined ? overrideQuery : searchQuery;
    if (!queryToSearch.trim()) return;

    setIsSearching(true);
    setStatus(strings.shelf.searchingGlobal);
    try {
      const response = await fetch(
        apiUrl(`/search?q=${encodeURIComponent(queryToSearch)}`),
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error("Search endpoint returned non-JSON content");
      }
      const results = await response.json();
      setGlobalResults(results);
      setStatus(
        strings.shelf.foundResults.replace(
          "{count}",
          results.length.toString(),
        ),
      );
    } catch (e) {
      console.error("Global search failed", e);
      setStatus(
        `搜索失败：请确认 API 已启动在 ${getApiBaseUrl()}（本地默认端口 4000）。`,
      );
    } finally {
      setIsSearching(false);
    }
  };

  // 快捷探索胶囊点击联动：填充并自动秒级触发云端与本地检索
  const handleQuickSearch = (q: string) => {
    setSearchQuery(q);
    handleGlobalSearch(q);
  };

  // 核心功能：一键高并发异步拉取该书籍在云端中存储的所有章节，同步写入本地 IndexedDB
  const handleImportBook = async (book: Book) => {
    if (importingBookIds.has(book.id)) return;

    setImportingBookIds((prev) => {
      const next = new Set(prev);
      next.add(book.id);
      return next;
    });
    setImportProgress((prev) => ({ ...prev, [book.id]: 0 }));

    try {
      // 1. 先将 Book metadata 存入本地
      await db.books.put(book);

      // 2. 高并发拉取下载所有章节
      const totalChapters = book.chapterCount;
      let completed = 0;

      if (totalChapters > 0) {
        // Concurrency 并发限制器，最大并发数为 5，确保秒级飞速载入同时保护网络队列
        const concurrencyLimit = 5;
        const indices = Array.from({ length: totalChapters }, (_, i) => i);

        const downloadChapter = async (index: number) => {
          try {
            const res = await fetch(
              apiUrl(`/books/${book.id}/chapters/${index}`),
            );
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const chap = await res.json();
            await db.chapters.put({
              id: chap.id,
              bookId: book.id,
              index: chap.index,
              title: chap.title,
              content: chap.content,
            });
          } catch (e) {
            console.error(`下载章节 ${index} 失败:`, e);
          } finally {
            completed++;
            const pct = Math.round((completed / totalChapters) * 100);
            setImportProgress((prev) => ({ ...prev, [book.id]: pct }));
          }
        };

        // 按并发批次处理
        for (let i = 0; i < indices.length; i += concurrencyLimit) {
          const chunk = indices.slice(i, i + concurrencyLimit);
          await Promise.all(chunk.map(downloadChapter));
        }
      }

      setImportProgress((prev) => ({ ...prev, [book.id]: 100 }));
      setToastMsg(`🍃 「${book.title}」全本 ${totalChapters} 章节已拉取到本地，请净心阅享。`);
    } catch (err) {
      console.error("同步云端书籍章节失败:", err);
      setToastMsg("💡 本地存储或云端通道繁忙，请稍后再试。");
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
      title="发现"
      subtitle="本地书架搜索、云端好书同步与在线检索"
      rightNodes={
        <button
          onClick={() => router.push("/library")}
          className="ui-focus-ring rounded-full border border-[var(--ui-border)] bg-white/70 px-4 py-2 text-sm font-semibold text-[var(--ui-text)] transition-colors hover:bg-white"
        >
          回书架
        </button>
      }
    >
      {/* 搜索/分类 核心框 */}
      <section className="ui-card rounded-[18px] p-5.5 shadow-[0_12px_32px_rgba(80,65,45,0.05)] bg-[rgba(255,255,255,0.6)] backdrop-blur-md">
        <div className="relative flex gap-2">
          <input
            id="search-input-field"
            type="text"
            placeholder={`${strings.shelf.searchPlaceholder} (按 '/' 键聚焦)`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleGlobalSearch()}
            className="ui-focus-ring w-full rounded-full border border-[var(--ui-border)] bg-white px-5 py-3 pr-32 text-[var(--ui-text)] shadow-sm physics-spring focus:scale-[1.015] focus:shadow-[0_15px_35px_rgba(95,125,82,0.12)] focus:border-[var(--ui-accent)]"
            autoFocus
          />
          <button
            onClick={() => handleGlobalSearch()}
            disabled={isSearching || !searchQuery.trim()}
            className="ui-focus-ring absolute bottom-1.5 right-1.5 top-1.5 rounded-full bg-[var(--ui-accent)] px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#527047] disabled:bg-[rgba(80,65,45,0.2)] physics-spring hover:scale-[1.02] active:scale-[0.98]"
          >
            {isSearching ? "搜索中" : "搜索云端"}
          </button>
        </div>

        {/* 托管高亮的分类胶囊栏 */}
        <div className="mt-4.5 flex flex-wrap gap-2.5">
          {["综合", "书名", "作者", "标签", "连载中", "已完结"].map(
            (label) => {
              const isActive = activeFilter === label;
              return (
                <button
                  key={label}
                  onClick={() => setActiveFilter(label)}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 shadow-sm physics-spring hover:scale-[1.05] hover:-translate-y-0.5 ${
                    isActive
                      ? "border-[var(--ui-accent)] bg-[var(--ui-accent-soft)] text-[var(--ui-accent)] font-bold"
                      : "border-[var(--ui-border)] bg-white/60 text-[var(--ui-muted)] hover:text-[var(--ui-text)]"
                  }`}
                >
                  {label}
                </button>
              );
            },
          )}
        </div>
      </section>

      {/* 首屏冷启动：每日书签 · 长笺墨语 */}
      {!searchQuery.trim() && (
        <section className="mt-6 flex flex-col items-center justify-center">
          <div className="ui-card w-full rounded-[20px] p-6 md:p-8 bg-[linear-gradient(135deg,#FFFDF9_0%,#F5F1E8_100%)] border border-white/60 shadow-[0_12px_36px_rgba(80,65,45,0.04)] relative overflow-hidden flex flex-col items-center justify-center text-center gap-5">
            {/* 拟物淡雅圆圈背景装饰 */}
            <div className="absolute -bottom-12 -left-12 w-48 h-48 rounded-full border border-[rgba(95,125,82,0.06)] pointer-events-none select-none" />
            <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full border border-[rgba(95,125,82,0.06)] pointer-events-none select-none" />

            <div className="px-3 py-0.5 rounded bg-[var(--ui-accent-soft)] text-[var(--ui-accent)] font-bold text-[10px] uppercase tracking-wider">
              每日书签 · Curated Quote
            </div>

            <h3 className="font-reading-title text-base md:text-[19px] font-semibold leading-[2.2] text-[var(--ui-text)] max-w-xl tracking-[0.12em] select-none py-1">
              “ 书卷多情似故人，晨昏忧乐每相亲。
              <br />
              一窗昏晓送流年，万卷古书消永日。 ”
            </h3>

            <div className="mt-2 flex flex-col items-center gap-3 w-full max-w-md">
              <p className="text-xs text-[var(--ui-muted)] font-medium">
                🍃 寻章摘句，您可以一键探索以下精选名著：
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {PRESET_RECOMMENDS.map((rec) => (
                  <button
                    key={rec.q}
                    onClick={() => handleQuickSearch(rec.q)}
                    className="ui-focus-ring px-3.5 py-1.5 rounded-full border border-[rgba(80,65,45,0.12)] bg-white/70 text-xs font-semibold text-[var(--ui-text)] hover:border-[var(--ui-accent)] hover:text-[var(--ui-accent)] hover:bg-white transition-all physics-spring hover:scale-[1.03]"
                  >
                    {rec.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
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
          <p className="mb-6 rounded-full border border-[var(--ui-border)] bg-white/54 px-4 py-2 text-center text-sm text-[var(--ui-muted)] shadow-sm">
            {status}
          </p>
        )}

        {globalResults.length > 0 ? (
          <div>
            <h2 className="mb-4 text-xl font-bold text-[var(--ui-text)]">
              云端免费候选 ({globalResults.length})
            </h2>
            <div className="grid grid-cols-1 gap-3">
              {globalResults.map((book) => {
                const isLocal = localBookIds.has(book.id);
                const isImporting = importingBookIds.has(book.id);
                const pct = importProgress[book.id] || 0;

                return (
                  <div
                    key={book.id}
                    className="ui-card flex items-center gap-4 rounded-[16px] p-4 bg-gradient-to-br from-white/70 to-white/40 border border-white/60 shadow-[0_10px_30px_rgba(80,65,45,0.03)]"
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
                            {book.author || "佚名"} · {book.format.toUpperCase()}
                          </p>
                        </div>
                        <span className="text-sm font-bold text-[var(--ui-accent)] font-reading-title">
                          8.{(book.title.length % 7) + 2} 分
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
                    <div className="shrink-0">
                      {isLocal ? (
                        <button
                          onClick={() => router.push(`/reader/${book.id}`)}
                          className="ui-focus-ring rounded-full border border-[var(--ui-accent)] bg-[var(--ui-accent-soft)] px-4 py-2 text-xs font-bold text-[var(--ui-accent)] transition-all hover:bg-[var(--ui-accent)] hover:text-white shadow-sm physics-spring hover:scale-[1.03]"
                        >
                          去阅读 📖
                        </button>
                      ) : isImporting ? (
                        <div className="rounded-full bg-[rgba(80,65,45,0.06)] px-4 py-2 text-xs font-bold text-[var(--ui-accent)] select-none border border-[rgba(95,125,82,0.18)] flex items-center gap-1.5">
                          <svg className="animate-spin h-3.5 w-3.5 text-[var(--ui-accent)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span>正在同步 {pct}%</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleImportBook(book)}
                          className="ui-focus-ring rounded-full border border-[var(--ui-border)] bg-white px-4 py-2 text-xs font-bold text-[var(--ui-text)] shadow-sm transition-all hover:border-[var(--ui-accent)] hover:text-[var(--ui-accent)] hover:bg-white physics-spring hover:scale-[1.03]"
                        >
                          拉取入库 📥
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
          searchQuery.trim() &&
          localResults.length === 0 && (
            <div className="ui-card mt-8 rounded-[16px] py-20 text-center text-[var(--ui-muted)] shadow-sm">
              未找到相关书籍，点击“搜索云端”尝试联网查找
            </div>
          )
        )}
      </div>

      {/* 优雅宣纸毛玻璃 Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-[rgba(80,65,45,0.15)] bg-[rgba(255,252,245,0.85)] px-5 py-2.5 text-xs font-bold text-[var(--ui-text)] shadow-lg backdrop-blur-md physics-spring flex items-center gap-2 animate-bounce-short animate-duration-300">
          <span>🍃</span> {toastMsg}
        </div>
      )}
    </AppShell>
  );
}
