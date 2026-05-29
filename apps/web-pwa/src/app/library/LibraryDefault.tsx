"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@reader/storage-core";
import { useRouter } from "next/navigation";
import { apiUrl } from "@/lib/api";
import { strings } from "@/lib/i18n";
import { AppShell } from "@/components/AppShell";
import { BookCover } from "@/components/BookCover";
import { SkeletonLoader } from "@/components/SkeletonLoader";
import { extractColorsFromTitle } from "@/lib/color-extraction";
import type { Book, ReadingProgress } from "@reader/shared-types";
import { PRESET_BOOKLISTS } from "./presetBooks";

type LibraryViewMode = "cover" | "compact" | "list";

const LIBRARY_VIEW_KEY = "library-view-mode";

function loadLibraryViewMode(): LibraryViewMode {
  if (typeof window === "undefined") return "cover";
  const value = window.localStorage.getItem(LIBRARY_VIEW_KEY);
  return value === "compact" || value === "list" ? value : "cover";
}

function getBookTimestamp(book: Book) {
  return new Date(
    book.lastReadAt || book.updatedAt || book.createdAt,
  ).getTime();
}

function getProgressPercent(book: Book, progress?: ReadingProgress) {
  if (!progress || book.chapterCount <= 0) return 0;
  const chapterProgress =
    ((progress.chapterIndex + 1) / book.chapterCount) * 100;
  return Math.max(
    0,
    Math.min(100, Math.round(progress.percentage || chapterProgress)),
  );
}

function getChapterSummary(progress?: ReadingProgress) {
  if (!progress) return "未开始";
  return `第 ${progress.chapterIndex + 1} 章`;
}

function getFriendlyRelativeTime(dateInput?: string | Date) {
  if (!dateInput) return "未开始";
  const date = new Date(dateInput);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "刚刚读过";
  if (diffMins < 60) return `${diffMins} 分钟前`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} 小时前`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays} 天前`;
  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" }) + "读过";
}

export function LibraryDefault() {
  const router = useRouter();
  const [sortBy, setSortBy] = useState<"title" | "createdAt">("createdAt");
  const [viewMode, setViewModeState] =
    useState<LibraryViewMode>(loadLibraryViewMode);
  const [toastMsg, setToastMsg] = useState("");

  useEffect(() => {
    if (toastMsg) {
      const timer = setTimeout(() => setToastMsg(""), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMsg]);

  const handleCollectBookList = async (listTitle: string) => {
    const list = PRESET_BOOKLISTS[listTitle];
    if (!list) return;

    try {
      await db.transaction(
        "rw",
        [db.books, db.chapters],
        async () => {
          for (const item of list) {
            // 用 put 防重，如已存在，自动平滑覆盖
            await db.books.put(item.book);
            for (const chap of item.chapters) {
              await db.chapters.put(chap);
            }
          }
        }
      );

      if (listTitle === "心灵幽谷与禅修静夜") {
        setToastMsg("🍃 书阁已纳「心灵幽谷与禅修静夜」！清静经、庄子等传世经典已备，静享墨香。");
      } else {
        setToastMsg("🚀 书阁已纳「科技灯火与人类群星」！黑客与画家等科技名篇已备，共探智慧。");
      }
    } catch (err) {
      console.error("一键收藏精选书单失败:", err);
      setToastMsg("💡 本地存储繁忙，请稍后再试。");
    }
  };

  const books = useLiveQuery(async () => {
    const allBooks = await db.books.toArray();
    return allBooks.sort((a, b) => {
      if (sortBy === "title") {
        return a.title.localeCompare(b.title);
      }
      return getBookTimestamp(b) - getBookTimestamp(a);
    });
  }, [sortBy]);

  const progressByBookId = useLiveQuery(async () => {
    const allProgress = await db.progress.toArray();
    return Object.fromEntries(
      allProgress.map((progress) => [progress.bookId, progress]),
    );
  }, []);

  const setViewMode = (mode: LibraryViewMode) => {
    setViewModeState(mode);
    window.localStorage.setItem(LIBRARY_VIEW_KEY, mode);
  };

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
  const continueProgress = continueBook
    ? progressByBookId?.[continueBook.id]
    : undefined;
  const continuePercent = continueBook
    ? getProgressPercent(continueBook, continueProgress)
    : 0;
  const extractedColors = continueBook
    ? extractColorsFromTitle(continueBook.title)
    : null;

  useEffect(() => {
    router.prefetch("/search");
    router.prefetch("/import");
    router.prefetch("/settings");
    books?.slice(0, 8).forEach((book) => router.prefetch(`/reader/${book.id}`));
  }, [books, router]);

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
            管理本地书籍、继续上次阅读，也可以把新的 TXT / EPUB
            放进这间安静书房。
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              onClick={() =>
                continueBook && router.push(`/reader/${continueBook.id}`)
              }
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
        <section className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
          <div
            className="group rounded-[18px] border p-5 shadow-[0_12px_36px_rgba(80,65,45,0.06)] backdrop-blur-md relative overflow-hidden transition-all duration-300"
            style={{
              background: extractedColors
                ? `linear-gradient(135deg, ${extractedColors.color1} 0%, ${extractedColors.color2} 100%)`
                : undefined,
              borderColor: extractedColors?.borderColor || "rgba(80, 65, 45, 0.12)",
            }}
          >
            {/* 拟物装饰高光线 */}
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />
            
            <div className="flex items-center justify-between gap-4 relative z-10">
              <div>
                <h2
                  className="text-lg font-bold font-reading-title tracking-wide"
                  style={{ color: extractedColors?.textColor || "var(--ui-text)" }}
                >
                  最近阅读
                </h2>
                <p
                  className="mt-1 text-xs font-medium"
                  style={{ color: extractedColors?.accentColor || "var(--ui-muted)" }}
                >
                  继续回到上次停下的位置
                </p>
              </div>
              <button
                onClick={() => router.push(`/reader/${continueBook.id}`)}
                className="ui-focus-ring rounded-full px-5 py-2 text-xs font-bold text-white shadow-sm physics-spring hover:scale-[1.03] transition-colors"
                style={{
                  backgroundColor: extractedColors?.accentColor || "var(--ui-accent)",
                }}
              >
                继续阅读
              </button>
            </div>
            <div className="mt-5 flex gap-5 items-center">
              {/* 拟物旋转叠层阴影封面 */}
              <div className="relative shrink-0 select-none transition-transform duration-300 group-hover:scale-[1.03] group-hover:rotate-[1deg]">
                {/* 仿真书后阴影叠层 */}
                <div className="absolute -left-1.5 top-1.5 w-full h-full rounded-[10px] bg-black/10 blur-[4px] -z-10" />
                <BookCover
                  title={continueBook.title}
                  className="h-[136px] w-[92px] rotate-[-3.5deg] shadow-[2px_12px_28px_rgba(47,42,36,0.22)]"
                  hoverLift={true}
                />
              </div>
              
              <div className="min-w-0 flex-1 h-full flex flex-col justify-center">
                <h3
                  className="truncate text-xl font-bold font-reading-title"
                  style={{ color: extractedColors?.textColor || "var(--ui-text)" }}
                >
                  {continueBook.title}
                </h3>
                <p
                  className="mt-1.5 text-xs font-medium flex items-center gap-2"
                  style={{ color: extractedColors?.accentColor || "var(--ui-muted)" }}
                >
                  <span
                    className="px-2 py-0.5 rounded font-semibold text-[10px] uppercase"
                    style={{
                      backgroundColor: extractedColors ? `${extractedColors.color2}` : "var(--ui-accent-soft)",
                      color: extractedColors?.accentColor || "var(--ui-accent)",
                    }}
                  >
                    {continueBook.format}
                  </span>
                  <span>{getChapterSummary(continueProgress)}</span>
                  <span className="text-[var(--ui-quiet)]">•</span>
                  <span>{getFriendlyRelativeTime(continueBook.lastReadAt || continueBook.updatedAt)}</span>
                </p>
                
                {/* 高级精细进度条 */}
                <div className="mt-6">
                  <div
                    className="flex justify-between text-[11px] font-bold mb-1.5"
                    style={{ color: extractedColors?.accentColor || "var(--ui-quiet)" }}
                  >
                    <span>阅读进度</span>
                    <span>{continuePercent}%</span>
                  </div>
                  <div
                    className="h-1.5 overflow-hidden rounded-full relative"
                    style={{ backgroundColor: extractedColors ? `${extractedColors.borderColor}40` : "rgba(80, 65, 45, 0.06)" }}
                  >
                    <div
                      className="h-full rounded-full transition-[width] duration-500 ease-out"
                      style={{
                        width: `${continuePercent}%`,
                        background: extractedColors
                          ? `linear-gradient(90deg, ${extractedColors.accentColor} 0%, ${extractedColors.borderColor} 100%)`
                          : "linear-gradient(90deg, var(--ui-accent) 0%, #81a073 100%)",
                      }}
                    />
                  </div>
                </div>
                
                <p
                  className="mt-4 text-xs leading-relaxed line-clamp-1 font-medium"
                  style={{ color: extractedColors?.accentColor || "var(--ui-quiet)" }}
                >
                  💡 系统已将所有内容和微秒级进度安全保存在本地。
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
          <div className="flex flex-wrap gap-2">
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
            <div className="inline-flex w-fit rounded-full border border-[var(--ui-border)] bg-white/64 p-1 text-sm">
              {[
                ["cover", "封面"],
                ["compact", "紧凑"],
                ["list", "列表"],
              ].map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode as LibraryViewMode)}
                  className={`rounded-full px-3 py-1.5 transition-colors ${
                    viewMode === mode
                      ? "bg-[var(--ui-accent)] font-semibold text-white"
                      : "text-[var(--ui-muted)] hover:text-[var(--ui-text)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {books === undefined ? (
          <SkeletonLoader type={viewMode === "list" ? "list" : "grid"} count={4} />
        ) : books.length === 0 ? (
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
        ) : viewMode === "list" ? (
          <div className="space-y-2">
            <button
              onClick={() => router.push("/import")}
              className="ui-focus-ring flex min-h-[56px] w-full items-center justify-center rounded-[14px] border border-dashed border-[rgba(95,125,82,0.3)] bg-white/45 px-4 text-sm font-semibold text-[var(--ui-muted)] transition-colors hover:border-[var(--ui-accent)] hover:bg-[var(--ui-accent-soft)] hover:text-[var(--ui-accent)]"
            >
              ＋ 导入书籍
            </button>
            {books.map((book) => {
              const progress = progressByBookId?.[book.id];
              const percent = getProgressPercent(book, progress);
              return (
                <div
                  key={book.id}
                  className="ui-card grid gap-3 rounded-[14px] px-4 py-3 sm:grid-cols-[minmax(0,1fr)_140px_128px] sm:items-center"
                >
                  <button
                    onClick={() => router.push(`/reader/${book.id}`)}
                    className="min-w-0 text-left"
                  >
                    <h3 className="truncate text-sm font-bold text-[var(--ui-text)]">
                      {book.title}
                    </h3>
                    <p className="mt-1 truncate text-xs text-[var(--ui-muted)]">
                      {book.author || "本地书籍"} · {book.format.toUpperCase()}{" "}
                      ·{" "}
                      {strings.reader.chapterCount.replace(
                        "{count}",
                        book.chapterCount?.toString() || "0",
                      )}
                    </p>
                  </button>
                  <div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[rgba(80,65,45,0.08)]">
                      <div
                        className="h-full rounded-full bg-[var(--ui-accent)] transition-[width]"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-[var(--ui-quiet)]">
                      {getChapterSummary(progress)} · {percent}%
                    </p>
                  </div>
                  <div className="flex gap-2 sm:justify-end">
                    <button
                      onClick={() => router.push(`/reader/${book.id}`)}
                      className="ui-focus-ring rounded-full bg-[var(--ui-accent)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#527047]"
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
              );
            })}
          </div>
        ) : (
          <div
            className={
              viewMode === "compact"
                ? "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
                : "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            }
          >
            <button
              onClick={() => router.push("/import")}
              className={`ui-focus-ring flex flex-col items-center justify-center rounded-[16px] border-2 border-dashed border-[rgba(95,125,82,0.28)] bg-white/45 p-6 text-[var(--ui-muted)] transition-all hover:border-[var(--ui-accent)] hover:bg-[var(--ui-accent-soft)] hover:text-[var(--ui-accent)] ${
                viewMode === "compact" ? "min-h-[132px]" : "min-h-[188px]"
              }`}
            >
              <span className="mb-3 text-3xl font-light">＋</span>
              <span className="text-sm font-semibold">导入书籍</span>
            </button>
            {books.map((book) => {
              const progress = progressByBookId?.[book.id];
              const percent = getProgressPercent(book, progress);
              return (
                <div
                  key={book.id}
                  className={`group ui-card flex flex-col justify-between rounded-[18px] p-4.5 physics-spring hover:-translate-y-1.5 hover:shadow-[0_20px_42px_rgba(80,65,45,0.09)] ${
                    viewMode === "compact" ? "min-h-[132px]" : "min-h-[188px]"
                  }`}
                >
                  <div className="flex gap-4">
                    {viewMode === "cover" && (
                      <div className="relative shrink-0 select-none">
                        {/* 仿真阴影叠层 */}
                        <div className="absolute -left-1 top-1 w-full h-full rounded-[10px] bg-black/8 blur-[3px] -z-10" />
                        <BookCover
                          title={book.title}
                          className="h-[116px] w-[78px] shadow-[1px_6px_16px_rgba(47,42,36,0.14)]"
                          compact
                          hoverLift={true}
                        />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="line-clamp-2 text-[15px] font-bold leading-snug font-reading-title text-[var(--ui-text)]">
                        {book.title}
                      </h3>
                      <p className="mt-1 truncate text-xs text-[var(--ui-muted)]">
                        {book.author || "本地书籍"}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded bg-[var(--ui-accent-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--ui-accent)]">
                          {book.format}
                        </span>
                        <span className="rounded bg-[rgba(80,65,45,0.05)] px-2 py-0.5 text-[10px] text-[var(--ui-muted)]">
                          {strings.reader.chapterCount.replace(
                            "{count}",
                            book.chapterCount?.toString() || "0",
                          )}
                        </span>
                      </div>
                      
                      {/* 精美细线进度条 */}
                      <div className="mt-4">
                        <div className="h-1.5 overflow-hidden rounded-full bg-[rgba(80,65,45,0.06)] relative">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[var(--ui-accent)] to-[#81a073] transition-[width]"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                      <p className="mt-1.5 text-[10px] text-[var(--ui-quiet)] font-medium">
                        {getChapterSummary(progress)} · 已读 {percent}%
                        {book.lastReadAt && ` · ${getFriendlyRelativeTime(book.lastReadAt)}`}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => router.push(`/reader/${book.id}`)}
                      className="ui-focus-ring flex-1 rounded-full bg-[var(--ui-accent)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#527047] physics-spring hover:scale-[1.02]"
                    >
                      {strings.shelf.read}
                    </button>
                    <button
                      onClick={() => handleDelete(book.id, book.title)}
                      className="ui-focus-ring rounded-full border border-[rgba(184,107,92,0.22)] bg-white px-3 py-2 text-sm font-semibold text-[var(--ui-danger)] transition-colors hover:bg-[#FFF0EC] physics-spring"
                      title={strings.shelf.delete}
                    >
                      {strings.shelf.delete}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 4. 精选推荐主题书单：3D Stacking 叠放微交互美学组件 */}
      <section className="mt-10 border-t border-[rgba(80,65,45,0.08)] pt-7">
        <div>
          <h2 className="text-xl font-bold text-[var(--ui-text)]">
            精选书单
          </h2>
          <p className="mt-1 text-sm text-[var(--ui-muted)]">
            人文历史、思想群星与禅意生活，一叠好书，静心阅享。
          </p>
        </div>

        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <StackingBookListCard
            title="心灵幽谷与禅修静夜"
            description="搜集了瓦尔登湖、庄子内篇、清静经等经典书籍，融汇东西方宁静美学，带您在繁忙都市中找到片刻安详。"
            bookTitles={["瓦尔登湖", "庄子内篇", "清静经"]}
            onClick={() => handleCollectBookList("心灵幽谷与禅修静夜")}
          />
          <StackingBookListCard
            title="科技灯火与人类群星"
            description="从科技历史长河中汲取创新火花，寻回物理硬核与硅谷极客精神。包含了硅谷之谜与创新群星之作。"
            bookTitles={["硅谷之谜", "创新者", "黑客与画家"]}
            onClick={() => handleCollectBookList("科技灯火与人类群星")}
          />
        </div>
      </section>

      {/* 优雅宣纸毛玻璃 Toast 提示 */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-[rgba(80,65,45,0.15)] bg-[rgba(255,252,245,0.85)] px-5 py-2.5 text-xs font-bold text-[var(--ui-text)] shadow-lg backdrop-blur-md physics-spring flex items-center gap-2 animate-bounce-short">
          <span>🍃</span> {toastMsg}
        </div>
      )}
    </AppShell>
  );
}

interface StackingBookListCardProps {
  title: string;
  description: string;
  bookTitles: string[];
  onClick?: () => void;
}

function StackingBookListCard({
  title,
  description,
  bookTitles,
  onClick,
}: StackingBookListCardProps) {
  return (
    <div
      onClick={onClick}
      className="group ui-card flex items-center justify-between rounded-[20px] p-6 bg-gradient-to-br from-white/70 to-white/40 border border-white/60 shadow-[0_12px_32px_rgba(80,65,45,0.05)] cursor-pointer physics-spring hover:shadow-[0_20px_48px_rgba(80,65,45,0.08)] hover:-translate-y-1 relative overflow-hidden"
    >
      <div className="flex-1 min-w-0 pr-4">
        <span className="px-2 py-0.5 rounded bg-[var(--ui-accent-soft)] text-[var(--ui-accent)] font-bold text-[10px] uppercase tracking-wider">
          精选书单
        </span>
        <h3 className="mt-2.5 text-base font-bold font-reading-title text-[var(--ui-text)] truncate">
          {title}
        </h3>
        <p className="mt-2 text-xs text-[var(--ui-muted)] leading-relaxed line-clamp-2">
          {description}
        </p>
        <p className="mt-4 text-[11px] font-bold text-[var(--ui-accent)] flex items-center gap-1">
          共 {bookTitles.length} 本经典 
          <span className="transition-transform group-hover:translate-x-1 duration-300">→</span>
        </p>
      </div>

      {/* 3D Stacking 叠放书籍效果 */}
      <div className="relative w-[110px] h-[130px] shrink-0 select-none mr-2">
        {/* 底层图书 (Book 3) */}
        {bookTitles[2] && (
          <div className="absolute left-6 top-3 w-[72px] h-[106px] rounded-[10px] origin-bottom-right rotate-[12deg] translate-x-2 translate-y-1 scale-[0.88] opacity-50 transition-all duration-500 group-hover:translate-x-6 group-hover:rotate-[18deg] group-hover:opacity-70 z-10">
            <div className="absolute -left-1 top-1 w-full h-full rounded-[10px] bg-black/10 blur-[3px] -z-10" />
            <BookCover title={bookTitles[2]} className="w-full h-full" compact />
          </div>
        )}

        {/* 中层图书 (Book 2) */}
        {bookTitles[1] && (
          <div className="absolute left-3 top-1.5 w-[72px] h-[106px] rounded-[10px] origin-bottom-right rotate-[3deg] translate-x-1 translate-y-0.5 scale-[0.94] opacity-80 transition-all duration-500 group-hover:translate-x-3 group-hover:rotate-[7deg] group-hover:opacity-95 z-20">
            <div className="absolute -left-1 top-1 w-full h-full rounded-[10px] bg-black/12 blur-[4px] -z-10" />
            <BookCover title={bookTitles[1]} className="w-full h-full" compact />
          </div>
        )}

        {/* 顶层图书 (Book 1) */}
        {bookTitles[0] && (
          <div className="absolute left-0 top-0 w-[72px] h-[106px] rounded-[10px] origin-bottom-right rotate-[-5deg] transition-all duration-500 group-hover:translate-x-[-10px] group-hover:translate-y-[-2px] group-hover:rotate-[-12deg] group-hover:shadow-[0_16px_32px_rgba(47,42,36,0.22)] z-30">
            <div className="absolute -left-1 top-1 w-full h-full rounded-[10px] bg-black/15 blur-[5px] -z-10" />
            <BookCover title={bookTitles[0]} className="w-full h-full" compact />
          </div>
        )}
      </div>
    </div>
  );
}
