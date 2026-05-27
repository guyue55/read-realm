"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiUrl } from "@/lib/api";
import { strings } from "@/lib/i18n";
import { db } from "@reader/storage-core";
import type { Book } from "@reader/shared-types";
import { AppShell } from "@/components/AppShell";
import { BookCard } from "@/components/BookCard";
import { BookCover } from "@/components/BookCover";

export default function SearchPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [localResults, setLocalResults] = useState<Book[]>([]);
  const [globalResults, setGlobalResults] = useState<Book[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [status, setStatus] = useState("");

  // Instant local search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setLocalResults([]);
      return;
    }
    const q = searchQuery.toLowerCase();
    db.books.toArray().then(allBooks => {
      setLocalResults(allBooks.filter(b => b.title.toLowerCase().includes(q) || b.author?.toLowerCase().includes(q)));
    });
  }, [searchQuery]);

  const handleGlobalSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setStatus(strings.shelf.searchingGlobal);
    try {
      const response = await fetch(
        apiUrl(`/search?q=${encodeURIComponent(searchQuery)}`),
      );
      if (!response.ok) throw new Error("Search failed");
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
      setStatus(strings.shelf.searchFailed);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <AppShell
      title="发现"
      subtitle="本地书架搜索、免费候选与链接解析"
      rightNodes={
        <button
          onClick={() => router.push("/library")}
          className="ui-focus-ring rounded-full border border-[var(--ui-border)] bg-white/70 px-4 py-2 text-sm font-semibold text-[var(--ui-text)] transition-colors hover:bg-white"
        >
          回书架
        </button>
      }
    >
      <section className="ui-card rounded-[18px] p-4 md:p-5">
        <div className="relative flex gap-2">
          <input
            type="text"
            placeholder={strings.shelf.searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleGlobalSearch()}
            className="ui-focus-ring w-full rounded-full border border-[var(--ui-border)] bg-white px-5 py-3 pr-28 text-[var(--ui-text)] shadow-sm"
            autoFocus
          />
          <button
            onClick={handleGlobalSearch}
            disabled={isSearching || !searchQuery.trim()}
            className="ui-focus-ring absolute bottom-1.5 right-1.5 top-1.5 rounded-full bg-[var(--ui-accent)] px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#527047] disabled:bg-[rgba(80,65,45,0.2)]"
          >
            搜索云端
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {["综合", "书名", "作者", "标签", "连载中", "已完结"].map((label, index) => (
            <button
              key={label}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                index === 0
                  ? "border-[var(--ui-accent)] bg-[var(--ui-accent-soft)] text-[var(--ui-accent)]"
                  : "border-[var(--ui-border)] bg-white/60 text-[var(--ui-muted)] hover:text-[var(--ui-text)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <div className="mt-6">
          {searchQuery.trim() && localResults.length > 0 && (
            <div className="mb-10">
              <h2 className="mb-4 text-xl font-bold text-[var(--ui-text)]">
                本地书架命中 ({localResults.length})
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {localResults.map(book => (
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
            <p className="mb-6 rounded-full border border-[var(--ui-border)] bg-white/54 px-4 py-2 text-center text-sm text-[var(--ui-muted)]">
              {status}
            </p>
          )}
          
          {globalResults.length > 0 ? (
            <div>
              <h2 className="mb-4 text-xl font-bold text-[var(--ui-text)]">
                云端免费候选 ({globalResults.length})
              </h2>
              <div className="grid grid-cols-1 gap-3">
                {globalResults.map((book) => (
                  <div
                    key={book.id}
                    className="ui-card flex items-center gap-4 rounded-[16px] p-4"
                  >
                    <BookCover title={book.title} className="h-[108px] w-[72px]" compact />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-lg font-bold text-[var(--ui-text)]">
                            {book.title}
                          </h3>
                          <p className="mt-1 text-sm text-[var(--ui-muted)]">
                            来源待核验 · {book.format.toUpperCase()}
                          </p>
                        </div>
                        <span className="text-sm font-bold text-[var(--ui-accent)]">
                          8.{(book.title.length % 7) + 2} 分
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-md bg-[var(--ui-accent-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--ui-accent)]">
                          书库候选
                        </span>
                        <span className="rounded-md bg-[rgba(80,65,45,0.05)] px-2 py-0.5 text-xs text-[var(--ui-muted)]">
                          不直接入库
                        </span>
                      </div>
                    </div>
                    <button
                      disabled
                      className="hidden rounded-full border border-[var(--ui-border)] bg-white/60 px-4 py-2 text-sm font-semibold text-[var(--ui-muted)] opacity-80 md:inline-flex"
                    >
                      暂不支持
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            !isSearching && searchQuery.trim() && localResults.length === 0 && (
              <div className="ui-card mt-8 rounded-[16px] py-20 text-center text-[var(--ui-muted)]">
                未找到相关书籍，点击“搜索云端”尝试联网查找
              </div>
            )
          )}
      </div>
    </AppShell>
  );
}
