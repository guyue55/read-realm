"use client";

import { useState, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@reader/storage-core";
import { strings } from "@/lib/i18n";
import { BookCard } from "@/components/BookCard";
import type { Book } from "@reader/shared-types";
import { EmptyState } from "@/components/EmptyState";
import { AppHeader } from "@/components/AppHeader";
import { useVirtualRouter } from "@/lib/route-store";
import { apiUrl, getShareHeaders } from "@/lib/api";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export default function LibraryPage() {
  const router = useVirtualRouter();
  const [sortBy, setSortBy] = useState<"title" | "createdAt">("createdAt");
  const [toastMsg, setToastMsg] = useState("");
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    isDanger: boolean;
    onConfirm: () => void | Promise<void>;
  }>({
    isOpen: false,
    title: "",
    message: "",
    isDanger: false,
    onConfirm: () => {},
  });

  useEffect(() => {
    if (toastMsg) {
      const timer = setTimeout(() => setToastMsg(""), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMsg]);

  const books = useLiveQuery(async () => {
    const allBooks = await db.books.toArray();
    return allBooks.sort((a, b) => {
      if (sortBy === "title") {
        return a.title.localeCompare(b.title);
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [sortBy]);

  const totalNotesCount = useLiveQuery(() => db.bookmarks.count(), []);

  const cachedBookIdsSet = useLiveQuery(async () => {
    const allKeys = await db.chapters.orderBy("bookId").uniqueKeys() as string[];
    return new Set(allKeys);
  }, []);

  const handleSpaceOffload = (book: Book) => {
    setConfirmState({
      isOpen: true,
      title: "释放本地空间",
      message: `确定要释放「${book.title}」的本地章节正文空间吗？释放后，再次阅读时将通过按需 network 静默缓存。`,
      isDanger: false,
      onConfirm: async () => {
        try {
          await db.chapters.where("bookId").equals(book.id).delete();
          setToastMsg(`☁️ 成功释放「${book.title}」的本地正文，该书已归于云端。`);
        } catch (e) {
          console.error("Failed to offload space:", e);
          setToastMsg("🌧️ 释放空间失败，请稍后重试。");
        }
      }
    });
  };

  const handleDelete = (bookId: string, title: string) => {
    setConfirmState({
      isOpen: true,
      title: "物理删除典籍",
      message: strings.shelf.deleteConfirm.replace("{title}", title),
      isDanger: true,
      onConfirm: async () => {
        try {
          await db.transaction(
            "rw",
            [db.books, db.chapters, db.progress, db.bookmarks],
            async () => {
              await db.chapters.where("bookId").equals(bookId).delete();
              await db.progress.where("bookId").equals(bookId).delete();
              await db.bookmarks.where("bookId").equals(bookId).delete();
              await db.books.delete(bookId);
            },
          );

          try {
            await fetch(apiUrl(`/books/${bookId}`), {
              method: "DELETE",
              headers: getShareHeaders(),
            });
          } catch (e) {
            console.error("Backend delete failed", e);
          }
          setToastMsg(`🗑️ 「${title}」已从书架中物理删除。`);
        } catch (e) {
          console.error(`Delete error: ${(e as Error).message}`);
          setToastMsg("🌧️ 删除典籍失败，请稍后重试。");
        }
      }
    });
  };

  return (
    <div className="min-h-screen bg-[#F8F8F5] flex flex-col">
      <AppHeader
        title={strings.shelf.title}
        rightNodes={
          <>
            <button
              onClick={() => router.push("/search")}
              className="rounded-full border border-[#DED6C8] bg-[#FFFDF8] px-4 py-1.5 text-sm font-semibold text-[#2F2A24] shadow-sm hover:bg-[#F4ECD8] transition-colors hidden sm:block"
            >
              搜索
            </button>
            <button
              onClick={() => router.push("/search")}
              className="p-2 sm:hidden text-[#6F665B] hover:bg-[#E8E3DA] rounded-full transition-colors"
            >
              🔍
            </button>
            <button
              onClick={() => router.push("/notes")}
              className="rounded-full border border-[#DED6C8] bg-white px-4 py-1.5 text-sm font-semibold text-[#2F2A24] shadow-sm hover:bg-[#F4ECD8] transition-colors hidden sm:block"
            >
              笔记
            </button>
            <button
              onClick={() => router.push("/notes")}
              className="p-2 sm:hidden text-[#6F665B] hover:bg-[#E8E3DA] rounded-full transition-colors"
            >
              📝
            </button>
            <button
              onClick={() => router.push("/settings")}
              className="rounded-full border border-[#DED6C8] bg-white px-4 py-1.5 text-sm font-semibold text-[#2F2A24] shadow-sm hover:bg-[#F4ECD8] transition-colors hidden sm:block"
            >
              {strings.shelf.settings}
            </button>
            <button
              onClick={() => router.push("/settings")}
              className="p-2 sm:hidden text-[#6F665B] hover:bg-[#E8E3DA] rounded-full transition-colors"
            >
              ⚙️
            </button>
          </>
        }
      />
      <main className="flex-1 w-full max-w-5xl mx-auto p-4 md:p-8 flex flex-col">
        <div className="flex justify-between items-center mb-6 mt-2">
          <h2 className="text-xl font-bold text-[#2F2A24]">
            {strings.shelf.libraryTitle} ({books?.length || 0})
          </h2>
          <div className="flex gap-2 text-sm">
            <button
              onClick={() => setSortBy("title")}
              className={`px-3 md:px-4 py-1 md:py-1.5 rounded-full border transition-colors ${sortBy === "title" ? "bg-[#3A2D22] text-white border-[#3A2D22]" : "bg-white text-[#6F665B] border-[#DED6C8]"}`}
            >
              {strings.shelf.sortTitle}
            </button>
            <button
              onClick={() => setSortBy("createdAt")}
              className={`px-3 md:px-4 py-1 md:py-1.5 rounded-full border transition-colors ${sortBy === "createdAt" ? "bg-[#3A2D22] text-white border-[#3A2D22]" : "bg-white text-[#6F665B] border-[#DED6C8]"}`}
            >
              {strings.shelf.sortRecent}
            </button>
          </div>
        </div>

        {/* 🏮 「墨问修行」简易修行卡 */}
        <div
          onClick={() => router.push("/notes")}
          className="mb-6 group cursor-pointer rounded-[14px] border border-[#E4D7C2]/60 p-4 shadow-[0_8px_24px_rgba(80,65,45,0.03)] bg-gradient-to-r from-[#FAF6EE] to-[#F3EBD3] dark:from-[#25231F] dark:to-[#1A1916] flex items-center justify-between transition-all duration-300 hover:shadow-[0_12px_32px_rgba(80,65,45,0.06)] hover:-translate-y-0.5 relative overflow-hidden"
        >
          <div className="absolute -right-6 -top-6 w-20 h-20 rounded-full bg-[radial-gradient(circle,rgba(103,128,85,0.05)_0%,transparent_70%)] pointer-events-none select-none" />
          <div className="flex items-center gap-3 relative z-10">
            {/* 拟物小印章 */}
            <div className="w-10 h-10 rounded-full border border-double border-[#B86B5C] bg-[#B86B5C]/5 dark:bg-[#B86B5C]/10 flex items-center justify-center font-serif text-[#B86B5C] dark:text-[#E29B8C] font-bold text-[10px] leading-tight rotate-[-4deg] shrink-0">
              修行
            </div>
            <div>
              <p className="text-xs font-bold text-[var(--ui-text)] flex items-center gap-1.5 font-reading-title">
                💮 墨问修行 · 展卷 18 天
              </p>
              <p className="text-[11px] text-[var(--ui-muted)] mt-0.5 font-serif">
                藏书 {books?.length || 0} 册 / 已落笔 {totalNotesCount || 0} 处随手批注
              </p>
            </div>
          </div>
          <div className="text-xs font-bold text-[var(--ui-accent)] opacity-80 group-hover:translate-x-0.5 transition-transform font-serif flex items-center gap-1 z-10">
            <span>移步 ➔</span>
          </div>
        </div>

        {!books || books.length === 0 ? (
          <div className="mt-12">
            <EmptyState
              title="空书架"
              description="拖入一本 TXT / EPUB，开始你的私人书库"
              actionLabel="去导入"
              onAction={() => router.push("/import")}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            <button
              onClick={() => router.push("/import")}
              className="bg-[#FFFDF8] border-2 border-dashed border-[#DED6C8] rounded-[16px] p-6 flex flex-col items-center justify-center text-[#6F665B] hover:border-[#678055] hover:text-[#678055] hover:bg-[#EEF2E9] transition-all min-h-[160px] sm:min-h-full"
            >
              <span className="text-4xl mb-2 font-light">＋</span>
              <span className="font-semibold text-sm">导入书籍</span>
            </button>
            {books.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                onRead={(id) => router.push(`/reader/${id}`)}
                onDelete={handleDelete}
                hasChaptersLocal={cachedBookIdsSet?.has(book.id)}
                onSpaceOffload={handleSpaceOffload}
              />
            ))}
          </div>
        )}
      </main>

      <ConfirmDialog
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        isDanger={confirmState.isDanger}
        onConfirm={confirmState.onConfirm}
        onClose={() => setConfirmState((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* 优雅宣纸毛玻璃 Toast 提示 */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-[rgba(80,65,45,0.15)] bg-[rgba(255,252,245,0.85)] px-5 py-2.5 text-xs font-bold text-[var(--ui-text)] shadow-lg backdrop-blur-md physics-spring flex items-center gap-2 animate-bounce-short">
          <span>🍃</span> {toastMsg}
        </div>
      )}
    </div>
  );
}
