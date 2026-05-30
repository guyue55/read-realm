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
  const [showDrawer, setShowDrawer] = useState(false);

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
      title="「 墨问 」"
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
      <section className="relative overflow-hidden rounded-[18px] border border-[var(--ui-border)] bg-[linear-gradient(135deg,#FFFDF8_0%,#F6F2E9_100%)] py-9 px-8 md:py-12 md:px-12 shadow-[0_12px_32px_rgba(80,65,45,0.04)]">
        {/* 右侧淡雅中式工笔淡墨竹影 SVG 装饰，营造长卷惊艳画境 */}
        <div className="absolute inset-y-0 right-8 hidden w-64 opacity-[0.16] md:block pointer-events-none select-none">
          <svg className="w-full h-full text-[var(--ui-accent)]" viewBox="0 0 200 200" fill="currentColor">
            <path d="M180,30 c-12,3 -30,16 -36,28 c-3,7 -2,15 -5,22 c-5,12 -18,22 -30,29 c-2,1 5,-6 7,-9 c14,-12 21,-30 26,-46 c3,-11 14,-22 26,-26 Z" />
            <path d="M140,75 c-10,5 -22,19 -24,30 c-1,6 3,11 1,17 c-3,10 -12,17 -21,22 c1,0 4,-4 5,-6 c8,-10 12,-24 14,-36 c1,-9 10,-17 18,-20 Z" />
            <path d="M105,120 c-6,4 -14,12 -15,20 c-1,4 1,7 0,11 c-2,6 -8,11 -14,14 c1,0 3,-3 4,-4 c5,-6 8,-15 9,-22 c1,-5 6,-11 12,-12 Z" />
          </svg>
        </div>
        <div className="relative z-10 flex flex-col items-center justify-center text-center gap-3">
          <h2 className="font-reading-title text-base md:text-[20px] font-bold leading-[2.2] text-[var(--ui-text)] max-w-2xl tracking-[0.16em] select-none">
            「 大道无形，清天可期。
            <br />
            日日晨昏与书相伴，是一场内心的宁静修行。 」
          </h2>
        </div>
      </section>

      {continueBook && (
        <section className="mt-5 max-w-4xl">
          <div
            onClick={() => router.push(`/reader/${continueBook.id}`)}
            className="group cursor-pointer rounded-[18px] border p-5 shadow-[0_12px_36px_rgba(80,65,45,0.05)] backdrop-blur-md relative overflow-hidden transition-all duration-300 hover:shadow-[0_18px_48px_rgba(80,65,45,0.09)] hover:-translate-y-0.5"
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
                  className="text-xs font-bold font-reading-title tracking-wide uppercase flex items-center gap-1.5"
                  style={{ color: extractedColors?.accentColor || "var(--ui-accent)" }}
                >
                  <span>🍃</span> 最近阅读 · Current Flow
                </h2>
                <p
                  className="mt-1 text-xs font-medium opacity-80"
                  style={{ color: extractedColors?.textColor || "var(--ui-text)" }}
                >
                  回到上次停下的地方，继续心流之旅
                </p>
              </div>
              <div 
                className="text-xs font-bold flex items-center gap-1 transition-transform duration-300 group-hover:translate-x-1"
                style={{ color: extractedColors?.accentColor || "var(--ui-accent)" }}
              >
                <span>继续阅读</span>
                <span>→</span>
              </div>
            </div>
            <div className="mt-5 flex gap-5 items-center">
              {/* 拟物旋转叠层阴影封面 */}
              <div className="relative shrink-0 select-none transition-transform duration-300 group-hover:scale-[1.02] group-hover:rotate-[1deg]">
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
                  className="mt-4 text-xs leading-relaxed line-clamp-1 font-medium opacity-80"
                  style={{ color: extractedColors?.accentColor || "var(--ui-quiet)" }}
                >
                  💡 系统已将所有内容和微秒级进度安全保存在本地。
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="mt-7">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-[var(--ui-text)]">
              我的私人藏书 ({bookCount})
            </h2>
            <p className="mt-1 text-sm text-[var(--ui-muted)]">
              封面、进度和本地状态集中在一个安静列表里。
            </p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
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
          <div className="space-y-1">
            <button
              onClick={() => router.push("/import")}
              className="ui-focus-ring flex min-h-[52px] w-full items-center justify-center rounded-[16px] border border-dashed border-[rgba(95,125,82,0.2)] bg-white/30 px-4 mb-4 text-sm font-semibold text-[var(--ui-muted)] transition-all duration-300 hover:border-[var(--ui-accent)] hover:bg-[var(--ui-accent-soft)] hover:text-[var(--ui-accent)]"
            >
              ＋ 导入书籍
            </button>
            {books.map((book) => {
              const progress = progressByBookId?.[book.id];
              const percent = getProgressPercent(book, progress);
              return (
                <div
                  key={book.id}
                  onClick={() => router.push(`/reader/${book.id}`)}
                  className="group relative cursor-pointer ui-card flex items-center justify-between gap-4 rounded-[16px] px-5 py-4 mb-3 border border-white/60 bg-[linear-gradient(135deg,#FFFDF9_0%,#F5F1E8_100%)] shadow-[0_10px_30px_rgba(80,65,45,0.03)] backdrop-blur-md transition-all duration-300 hover:shadow-[0_16px_40px_rgba(80,65,45,0.07)] hover:-translate-y-0.5"
                >
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    {/* 实体比例微型 3D 封面，支持 hover 物理弹簧微幅倾斜抬升 */}
                    <div className="relative shrink-0 select-none transition-transform duration-300 group-hover:scale-[1.03] group-hover:rotate-[1deg]">
                      {/* 仿真书后叠层漫反射微阴影 */}
                      <div className="absolute -left-1 top-1 w-full h-full rounded-[4px] bg-black/8 blur-[2px] -z-10" />
                      <BookCover
                        title={book.title}
                        className="h-[68px] w-[46px] rounded-[4px] shadow-[1px_4px_12px_rgba(47,42,36,0.14)]"
                        compact
                      />
                    </div>
                    
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-reading-title text-[15.5px] font-bold text-[var(--ui-text)] group-hover:text-[var(--ui-accent)] transition-colors tracking-wide">
                        {book.title}
                      </h3>
                      <p className="mt-1.5 flex items-center gap-2 text-xs text-[var(--ui-muted)]">
                        <span>{book.author || "本地书籍"}</span>
                        <span className="text-[var(--ui-quiet)]">•</span>
                        <span className="uppercase text-[10px] font-bold text-[var(--ui-accent)] bg-[var(--ui-accent-soft)] px-2 py-0.5 rounded-md">
                          {book.format}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 shrink-0 pr-8 sm:pr-10">
                    {/* 极细微型进度条与百分比 */}
                    <div className="flex items-center gap-3">
                      <div className="w-20 h-1 overflow-hidden rounded-full bg-[rgba(80,65,45,0.06)] relative hidden sm:block">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[var(--ui-accent)] to-[#81a073] transition-[width]"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-bold text-[var(--ui-quiet)] w-10 text-right">
                        {percent}%
                      </span>
                    </div>

                    {/* 悬展删除操作：PC 端 Hover 淡出，移动端小屏常驻 */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(book.id, book.title);
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 z-20 flex h-7 w-7 items-center justify-center rounded-full border border-[rgba(184,107,92,0.12)] bg-white/95 text-xs font-bold text-[var(--ui-danger)] shadow-sm opacity-100 transition-opacity duration-200 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-[#FFF0EC]"
                      title={strings.shelf.delete}
                    >
                      ×
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
              className={`ui-focus-ring flex flex-col items-center justify-center rounded-[16px] border-2 border-dashed border-[rgba(95,125,82,0.2)] bg-white/30 p-6 text-[var(--ui-muted)] transition-all hover:border-[var(--ui-accent)] hover:bg-[var(--ui-accent-soft)] hover:text-[var(--ui-accent)] ${
                viewMode === "compact" ? "min-h-[110px]" : "min-h-[148px]"
              }`}
            >
              <span className="mb-2 text-2xl font-light">＋</span>
              <span className="text-sm font-semibold">导入书籍</span>
            </button>
            {books.map((book) => {
              const progress = progressByBookId?.[book.id];
              const percent = getProgressPercent(book, progress);
              return (
                <div
                  key={book.id}
                  onClick={() => router.push(`/reader/${book.id}`)}
                  className={`group relative overflow-hidden cursor-pointer ui-card flex flex-col justify-between rounded-[18px] p-4 physics-spring hover:-translate-y-1 hover:shadow-[0_16px_36px_rgba(80,65,45,0.07)] ${
                    viewMode === "compact" ? "min-h-[110px]" : "min-h-[148px]"
                  }`}
                >
                  {/* Delete button: visible on mobile, hover-fade-in on desktop */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(book.id, book.title);
                    }}
                    className="absolute right-2 top-2 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-[rgba(184,107,92,0.12)] bg-white/95 text-xs font-bold text-[var(--ui-danger)] opacity-100 transition-opacity duration-200 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-[#FFF0EC]"
                    title={strings.shelf.delete}
                  >
                    ×
                  </button>

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
                      <h3 className="line-clamp-2 text-[15px] font-bold leading-snug font-reading-title text-[var(--ui-text)] group-hover:text-[var(--ui-accent)] transition-colors">
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
                        <div className="h-1 overflow-hidden rounded-full bg-[rgba(80,65,45,0.06)] relative">
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
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 4. 精选推荐主题书单：仅在空书架时作为温馨新手引导展示 */}
      {bookCount === 0 && (
        <section className="mt-10 border-t border-[rgba(80,65,45,0.08)] pt-7">
          <div>
            <h2 className="text-xl font-bold text-[var(--ui-text)]">
              精选推荐书单
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
      )}

      {/* 4. 当书架有藏书时，底部低调显示一个雅致的推荐阁入口引流装饰线 */}
      {bookCount > 0 && (
        <div className="mt-14 mb-4 flex justify-center text-center select-none">
          <button
            onClick={() => setShowDrawer(true)}
            className="group flex items-center gap-2 text-xs font-medium text-[var(--ui-quiet)] transition-colors hover:text-[var(--ui-accent)]"
          >
            <span className="opacity-30">——————</span>
            <span className="flex items-center gap-1">🍃 案头书尽？可往「推荐阁 ↗」寻新书</span>
            <span className="opacity-30">——————</span>
          </button>
        </div>
      )}

      {/* 5. 推荐阁侧边抽屉组件 */}
      <CuratedDrawer 
        isOpen={showDrawer}
        onClose={() => setShowDrawer(false)}
        onCollect={handleCollectBookList}
      />

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
  isCompact?: boolean;
}

function StackingBookListCard({
  title,
  description,
  bookTitles,
  onClick,
  isCompact,
}: StackingBookListCardProps) {
  return (
    <div
      onClick={onClick}
      className={`group ui-card flex items-center justify-between rounded-[18px] bg-gradient-to-br from-white/70 to-white/40 border border-white/60 shadow-[0_12px_32px_rgba(80,65,45,0.05)] cursor-pointer physics-spring hover:shadow-[0_18px_40px_rgba(80,65,45,0.07)] hover:-translate-y-0.5 relative overflow-hidden ${
        isCompact ? "p-4" : "p-6"
      }`}
    >
      <div className="flex-1 min-w-0 pr-2">
        <span className="px-2 py-0.5 rounded bg-[var(--ui-accent-soft)] text-[var(--ui-accent)] font-bold text-[9px] uppercase tracking-wider">
          精选书单
        </span>
        <h3 className={`mt-2 font-bold font-reading-title text-[var(--ui-text)] truncate ${
          isCompact ? "text-sm" : "text-base"
        }`}>
          {title}
        </h3>
        <p className="mt-1.5 text-xs text-[var(--ui-muted)] leading-relaxed line-clamp-2">
          {description}
        </p>
        <p className="mt-3 text-[10px] font-bold text-[var(--ui-accent)] flex items-center gap-1">
          共 {bookTitles.length} 本经典 
          <span className="transition-transform group-hover:translate-x-1 duration-300">→</span>
        </p>
      </div>

      {/* 3D Stacking 叠放书籍效果 */}
      <div className={`relative shrink-0 select-none mr-1 ${
        isCompact ? "w-[90px] h-[110px]" : "w-[110px] h-[130px]"
      }`}>
        {/* 底层图书 (Book 3) */}
        {bookTitles[2] && (
          <div className={`absolute rounded-[8px] origin-bottom-right rotate-[12deg] translate-x-2 translate-y-1 scale-[0.88] opacity-50 transition-all duration-500 group-hover:translate-x-4 group-hover:rotate-[18deg] group-hover:opacity-70 z-10 ${
            isCompact ? "left-4 top-2.5 w-[56px] h-[82px]" : "left-6 top-3 w-[72px] h-[106px]"
          }`}>
            <div className="absolute -left-1 top-1 w-full h-full rounded-[8px] bg-black/10 blur-[3px] -z-10" />
            <BookCover title={bookTitles[2]} className="w-full h-full" compact />
          </div>
        )}

        {/* 中层图书 (Book 2) */}
        {bookTitles[1] && (
          <div className={`absolute rounded-[8px] origin-bottom-right rotate-[3deg] translate-x-1 translate-y-0.5 scale-[0.94] opacity-80 transition-all duration-500 group-hover:translate-x-2 group-hover:rotate-[7deg] group-hover:opacity-95 z-20 ${
            isCompact ? "left-2 top-1.5 w-[56px] h-[82px]" : "left-3 top-1.5 w-[72px] h-[106px]"
          }`}>
            <div className="absolute -left-1 top-1 w-full h-full rounded-[8px] bg-black/12 blur-[4px] -z-10" />
            <BookCover title={bookTitles[1]} className="w-full h-full" compact />
          </div>
        )}

        {/* 顶层图书 (Book 1) */}
        {bookTitles[0] && (
          <div className={`absolute rounded-[8px] origin-bottom-right rotate-[-5deg] transition-all duration-500 group-hover:translate-x-[-6px] group-hover:translate-y-[-1px] group-hover:rotate-[-10deg] group-hover:shadow-[0_12px_24px_rgba(47,42,36,0.18)] z-30 ${
            isCompact ? "left-0 top-0 w-[56px] h-[82px]" : "left-0 top-0 w-[72px] h-[106px]"
          }`}>
            <div className="absolute -left-1 top-1 w-full h-full rounded-[8px] bg-black/15 blur-[5px] -z-10" />
            <BookCover title={bookTitles[0]} className="w-full h-full" compact />
          </div>
        )}
      </div>
    </div>
  );
}

interface CuratedDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onCollect: (listTitle: string) => void;
}

function CuratedDrawer({ isOpen, onClose, onCollect }: CuratedDrawerProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* 注入滑出动画样式 */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in-right {
          animation: slideInRight 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}} />
      
      {/* Backshadow overlay */}
      <div 
        onClick={onClose}
        className="absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity duration-300"
      />
      {/* Drawer box */}
      <div className="relative w-full max-w-md h-full bg-[rgba(255,252,246,0.95)] border-l border-[rgba(80,65,45,0.1)] p-6 shadow-2xl flex flex-col backdrop-blur-xl animate-slide-in-right overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[rgba(80,65,45,0.08)] pb-4">
          <div>
            <span className="px-2 py-0.5 rounded bg-[var(--ui-accent-soft)] text-[var(--ui-accent)] font-bold text-[9px] uppercase tracking-wider">
              编辑推荐
            </span>
            <h3 className="mt-1 text-lg font-bold font-reading-title text-[var(--ui-text)]">
              墨问 · 推荐阁
            </h3>
          </div>
          <button 
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgba(80,65,45,0.05)] text-[var(--ui-muted)] transition-colors hover:bg-[rgba(80,65,45,0.1)]"
          >
            ×
          </button>
        </div>
        
        {/* Content */}
        <div className="mt-6 flex-1 space-y-6">
          <p className="text-xs text-[var(--ui-muted)] leading-relaxed">
            在这里，我们为您策划了数套传世经典与现代名著。点击一键收藏，书籍将直接置入您的本地书架，开启静心阅享。
          </p>
          
          <div className="space-y-4">
            <StackingBookListCard
              title="心灵幽谷与禅修静夜"
              description="搜集了瓦尔登湖、庄子内篇、清静经等经典书籍，融汇东西方宁静美学，带您在繁忙都市中找到片刻安详。"
              bookTitles={["瓦尔登湖", "庄子内篇", "清静经"]}
              onClick={() => {
                onCollect("心灵幽谷与禅修静夜");
                onClose();
              }}
              isCompact
            />
            <StackingBookListCard
              title="科技灯火与人类群星"
              description="从科技历史长河中汲取创新火花，寻回物理硬核与硅谷极客精神。包含了硅谷之谜与创新群星之作。"
              bookTitles={["硅谷之谜", "创新者", "黑客与画家"]}
              onClick={() => {
                onCollect("科技灯火与人类群星");
                onClose();
              }}
              isCompact
            />
          </div>
        </div>
        
        {/* Footer */}
        <div className="mt-8 border-t border-[rgba(80,65,45,0.06)] pt-4 text-center">
          <p className="text-[10px] text-[var(--ui-quiet)] font-medium">
            🍃 江上清风，山间明月，静享数字书室之美。
          </p>
        </div>
      </div>
    </div>
  );
}
