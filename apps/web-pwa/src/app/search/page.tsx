"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiUrl } from "@/lib/api";
import { strings } from "@/lib/i18n";
import { db } from "@reader/storage-core";
import type { Book } from "@reader/shared-types";
import { AppHeader } from "@/components/AppHeader";
import { BookCard } from "@/components/BookCard";

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
    <div className="min-h-screen bg-[#F8F8F5] flex flex-col">
      <AppHeader
        title="发现与搜索"
        onBack={() => router.push("/library")}
      />
      <main className="flex-1 w-full max-w-5xl mx-auto p-4 md:p-8 flex flex-col items-center">
        <div className="w-full max-w-2xl mb-8 flex gap-2 relative mt-4">
          <input
            type="text"
            placeholder={strings.shelf.searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleGlobalSearch()}
            className="w-full px-6 py-4 rounded-full border border-[#DED6C8] focus:outline-none focus:border-[#9A6A3A] bg-white shadow-sm pr-24 text-[#2F2A24]"
            autoFocus
          />
          <button
            onClick={handleGlobalSearch}
            disabled={isSearching || !searchQuery.trim()}
            className="absolute right-2 top-2 bottom-2 px-6 bg-[#678055] text-white rounded-full font-semibold hover:bg-[#526047] transition-colors disabled:bg-gray-300 shadow-sm"
          >
            搜索云端
          </button>
        </div>

        <div className="w-full">
          {/* Local Results */}
          {searchQuery.trim() && localResults.length > 0 && (
            <div className="mb-10">
              <h2 className="text-xl font-bold mb-6 text-[#2F2A24]">本地书架命中 ({localResults.length})</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
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

          {/* Global Results */}
          {status && <p className="mb-6 text-sm text-[#6F665B] text-center border-t border-[rgba(80,65,45,0.12)] pt-6">{status}</p>}
          
          {globalResults.length > 0 ? (
            <div>
              <h2 className="text-xl font-bold mb-6 text-[#2F2A24]">云端免费候选 ({globalResults.length})</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                {globalResults.map((book) => (
                  <div key={book.id} className="bg-white p-6 rounded-[16px] shadow-sm border border-[rgba(80,65,45,0.12)] flex flex-col justify-between">
                    <div>
                      <h3 className="font-bold text-lg mb-2 text-[#2F2A24]">{book.title}</h3>
                      <div className="flex gap-2 mb-4">
                        <span className="text-xs px-2 py-0.5 bg-[#EEF2E9] text-[#678055] rounded uppercase border border-[#CDD8C5]">书库候选</span>
                        <span className="text-xs text-[#6F665B] px-2 py-0.5 bg-[#E8E3DA] rounded uppercase">{book.format}</span>
                      </div>
                    </div>
                    <button
                      disabled
                      className="w-full bg-[#F4ECD8] text-[#9A6A3A] py-2 rounded-full font-semibold cursor-not-allowed opacity-70"
                    >
                      暂不支持直接导入
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            !isSearching && searchQuery.trim() && localResults.length === 0 && (
              <div className="text-center py-20 bg-white rounded-[16px] border border-[rgba(80,65,45,0.12)] text-[#6F665B] mt-8">
                未找到相关书籍，点击“搜索云端”尝试联网查找
              </div>
            )
          )}
        </div>
      </main>
    </div>
  );
}
