"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@reader/storage-core";
import { strings } from "@/lib/i18n";
import { BookCard } from "@/components/BookCard";
import { EmptyState } from "@/components/EmptyState";
import { AppHeader } from "@/components/AppHeader";
import { useRouter } from "next/navigation";
import { apiUrl } from "@/lib/api";

export default function LibraryPage() {
  const router = useRouter();
  const [sortBy, setSortBy] = useState<"title" | "createdAt">("createdAt");

  const books = useLiveQuery(async () => {
    const allBooks = await db.books.toArray();
    return allBooks.sort((a, b) => {
      if (sortBy === "title") {
        return a.title.localeCompare(b.title);
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [sortBy]);

  const handleDelete = async (bookId: string, title: string) => {
    if (!confirm(strings.shelf.deleteConfirm.replace("{title}", title))) return;

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
        });
      } catch (e) {
        console.error("Backend delete failed", e);
      }
    } catch (e) {
      console.error(`Delete error: ${(e as Error).message}`);
    }
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
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
