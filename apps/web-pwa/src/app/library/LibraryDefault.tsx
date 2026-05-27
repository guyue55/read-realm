"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@reader/storage-core";
import { useRouter } from "next/navigation";
import { apiUrl } from "@/lib/api";
import { strings } from "@/lib/i18n";
import { AppShell } from "@/components/AppShell";
import { BookCover } from "@/components/BookCover";

export function LibraryDefault() {
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
        await fetch(apiUrl(`/books/${bookId}`), { method: "DELETE" });
      } catch (e) {
        console.error("Backend delete failed", e);
      }
    } catch (e) {
      console.error(`Delete error: ${(e as Error).message}`);
    }
  };

  const bookCount = books?.length || 0;
  const continueBook = books?.[0];

  return (
    <AppShell
      title={strings.shelf.libraryTitle}
      subtitle="沉浸阅读，智能相伴"
      rightNodes={
        <>
          <button
            onClick={() => router.push("/search")}
            className="ui-focus-ring hidden rounded-full border border-[var(--ui-border)] bg-white/70 px-4 py-2 text-sm font-semibold text-[var(--ui-text)] transition-colors hover:bg-white sm:inline-flex"
          >
            搜索
          </button>
          <button
            onClick={() => router.push("/import")}
            className="ui-focus-ring rounded-full bg-[var(--ui-accent)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#527047]"
          >
            导入
          </button>
        </>
      }
    >
      <section className="relative overflow-hidden rounded-[18px] border border-[var(--ui-border)] bg-[linear-gradient(135deg,#FFFDF8_0%,#F1ECE2_58%,#E7E0D3_100%)] p-5 shadow-[0_18px_50px_rgba(80,65,45,0.07)] md:p-7">
        <div className="absolute inset-y-0 right-0 hidden w-1/2 opacity-75 md:block">
          <div className="absolute bottom-0 right-0 h-40 w-72 rounded-tl-[120px] bg-[linear-gradient(135deg,rgba(95,125,82,0.11),rgba(154,106,58,0.11))]" />
          <div className="absolute bottom-10 right-16 h-12 w-48 rounded-full bg-[rgba(47,42,36,0.06)] blur-xl" />
          <div className="absolute bottom-16 right-20 h-24 w-36 rounded-t-full border-t border-[rgba(95,125,82,0.24)]" />
        </div>
        <div className="relative z-10 max-w-xl">
          <h2 className="font-reading-title text-3xl font-semibold leading-tight text-[var(--ui-text)] md:text-4xl">
            大道无形，清天可期
          </h2>
          <p className="mt-3 max-w-md text-sm leading-6 text-[var(--ui-muted)]">
            管理本地书籍、继续上次阅读，也可以把新的 TXT / EPUB 放进这间安静书房。
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              onClick={() => continueBook && router.push(`/reader/${continueBook.id}`)}
              disabled={!continueBook}
              className="ui-focus-ring rounded-full bg-[var(--ui-accent)] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#527047] disabled:cursor-not-allowed disabled:bg-[rgba(80,65,45,0.18)]"
            >
              继续阅读
            </button>
            <button
              onClick={() => router.push("/search")}
              className="ui-focus-ring rounded-full border border-[var(--ui-border)] bg-white/70 px-5 py-2.5 text-sm font-semibold text-[var(--ui-text)] transition-colors hover:bg-white"
            >
              去发现
            </button>
          </div>
        </div>
      </section>

      {continueBook && (
        <section className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
          <div className="ui-card rounded-[16px] p-4 md:p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold">最近阅读</h2>
                <p className="mt-1 text-sm text-[var(--ui-muted)]">
                  继续回到上次停下的位置
                </p>
              </div>
              <button
                onClick={() => router.push(`/reader/${continueBook.id}`)}
                className="ui-focus-ring rounded-full bg-[var(--ui-accent)] px-4 py-2 text-sm font-semibold text-white"
              >
                继续
              </button>
            </div>
            <div className="mt-4 flex gap-4 rounded-[14px] bg-[rgba(248,246,240,0.72)] p-3">
              <BookCover title={continueBook.title} className="h-[132px] w-[90px]" />
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-lg font-bold">{continueBook.title}</h3>
                <p className="mt-1 text-sm text-[var(--ui-muted)]">
                  第 1 章 · 阅读进度 68%
                </p>
                <div className="mt-5 h-2 overflow-hidden rounded-full bg-[rgba(80,65,45,0.08)]">
                  <div className="h-full w-2/3 rounded-full bg-[var(--ui-accent)]" />
                </div>
                <p className="mt-3 line-clamp-2 text-sm leading-6 text-[var(--ui-muted)]">
                  文字会保留在本地书架中，离线时也能继续阅读。
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              ["导入书籍", "/import"],
              ["搜索书库", "/search"],
              ["阅读设置", "/settings"],
            ].map(([label, href]) => (
              <button
                key={label}
                onClick={() => router.push(href)}
                className="ui-focus-ring ui-soft-card flex min-h-[120px] flex-col items-center justify-center gap-3 rounded-[16px] p-3 text-center text-sm font-semibold text-[var(--ui-text)] transition-colors hover:bg-white"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--ui-accent-soft)] text-[var(--ui-accent)]">
                  {label.slice(0, 1)}
                </span>
                {label}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="mt-7">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-[var(--ui-text)]">
              热门书架 ({bookCount})
            </h2>
            <p className="mt-1 text-sm text-[var(--ui-muted)]">
              封面、进度和本地状态集中在一个安静列表里。
            </p>
          </div>
          <div className="inline-flex w-fit rounded-full border border-[var(--ui-border)] bg-white/64 p-1 text-sm">
            <button
              onClick={() => setSortBy("title")}
              className={`rounded-full px-3 py-1.5 transition-colors ${
                sortBy === "title"
                  ? "bg-[var(--ui-accent)] font-semibold text-white"
                  : "text-[var(--ui-muted)] hover:text-[var(--ui-text)]"
              }`}
            >
              {strings.shelf.sortTitle}
            </button>
            <button
              onClick={() => setSortBy("createdAt")}
              className={`rounded-full px-3 py-1.5 transition-colors ${
                sortBy === "createdAt"
                  ? "bg-[var(--ui-accent)] font-semibold text-white"
                  : "text-[var(--ui-muted)] hover:text-[var(--ui-text)]"
              }`}
            >
              {strings.shelf.sortRecent}
            </button>
          </div>
        </div>

        {!books || books.length === 0 ? (
          <div className="ui-card flex flex-col items-center justify-center rounded-[16px] p-10 text-center text-[var(--ui-text)]">
            <div className="mb-6 flex h-24 w-32 items-end justify-center rounded-[40px] bg-[rgba(95,125,82,0.07)]">
              <div className="mb-5 h-8 w-14 rounded-t-[14px] border border-[rgba(95,125,82,0.28)] bg-white/70" />
              <div className="-ml-3 mb-5 h-12 w-4 rounded-full border border-[rgba(95,125,82,0.22)] bg-[var(--ui-accent-soft)]" />
            </div>
            <h2 className="mb-2 text-xl font-bold">书架还是空的</h2>
            <p className="mb-6 max-w-sm text-sm leading-6 text-[var(--ui-muted)]">
              拖入一本 TXT / EPUB，或先去发现页找找想读的作品。
            </p>
            <button
              onClick={() => router.push("/import")}
              className="ui-focus-ring rounded-full bg-[var(--ui-accent)] px-6 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#527047]"
            >
              导入本地书籍
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <button
              onClick={() => router.push("/import")}
              className="ui-focus-ring flex min-h-[188px] flex-col items-center justify-center rounded-[16px] border-2 border-dashed border-[rgba(95,125,82,0.28)] bg-white/45 p-6 text-[var(--ui-muted)] transition-all hover:border-[var(--ui-accent)] hover:bg-[var(--ui-accent-soft)] hover:text-[var(--ui-accent)]"
            >
              <span className="mb-3 text-3xl font-light">＋</span>
              <span className="text-sm font-semibold">导入书籍</span>
            </button>
            {books.map((book) => (
              <div
                key={book.id}
                className="group ui-card flex min-h-[188px] flex-col justify-between rounded-[16px] p-4 transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_38px_rgba(80,65,45,0.09)]"
              >
                <div className="flex gap-4">
                  <BookCover title={book.title} className="h-[112px] w-[76px]" compact />
                  <div className="min-w-0 flex-1">
                    <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-[var(--ui-text)]">
                      {book.title}
                    </h3>
                    <p className="mt-1 truncate text-xs text-[var(--ui-muted)]">
                      {book.author || "本地书籍"}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-md bg-[var(--ui-accent-soft)] px-2 py-0.5 text-[11px] font-semibold uppercase text-[var(--ui-accent)]">
                        {book.format}
                      </span>
                      <span className="rounded-md bg-[rgba(80,65,45,0.05)] px-2 py-0.5 text-[11px] text-[var(--ui-muted)]">
                        {strings.reader.chapterCount.replace(
                          "{count}",
                          book.chapterCount?.toString() || "0",
                        )}
                      </span>
                    </div>
                    <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[rgba(80,65,45,0.08)]">
                      <div className="h-full w-1/3 rounded-full bg-[var(--ui-accent)]" />
                    </div>
                    <p className="mt-1 text-[11px] text-[var(--ui-quiet)]">阅读进度 33%</p>
                  </div>
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => router.push(`/reader/${book.id}`)}
                    className="ui-focus-ring flex-1 rounded-full bg-[var(--ui-accent)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#527047]"
                  >
                    {strings.shelf.read}
                  </button>
                  <button
                    onClick={() => handleDelete(book.id, book.title)}
                    className="ui-focus-ring rounded-full border border-[rgba(184,107,92,0.22)] bg-white px-3 py-2 text-sm font-semibold text-[var(--ui-danger)] transition-colors hover:bg-[#FFF0EC]"
                    title={strings.shelf.delete}
                  >
                    {strings.shelf.delete}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
