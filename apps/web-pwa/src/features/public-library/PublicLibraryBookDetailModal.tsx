"use client";

import { useEffect, useMemo, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  ArrowUpDown,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Compass,
  Download,
  FileText,
  List,
  Loader2,
  RefreshCw,
  Search,
  Type,
  X,
} from "lucide-react";
import { BookCover } from "@/components/BookCover";
import { ReaderDialogSurface } from "@/components/reader/ReaderDialogSurface";
import { useVirtualRouter } from "@/lib/route-store";
import {
  publicLibraryApiClient,
  type PublicLibraryBook,
  type PublicLibraryPackage,
} from "./public-library-client";
import {
  getLocalStateForPublicBook,
  publicLibraryJoinService,
  type PublicBookLocalState,
} from "./dexie-public-library-local";

export interface PublicLibraryBookDetailModalProps {
  book: PublicLibraryBook | null;
  fallbackFocus: RefObject<HTMLElement | null>;
  onClose: () => void;
  onJoined?: (book: PublicLibraryBook, localBookId: string) => void;
}

type PreviewTheme = "paper" | "light" | "dark";

export function PublicLibraryBookDetailModal({
  book,
  fallbackFocus,
  onClose,
  onJoined,
}: PublicLibraryBookDetailModalProps) {
  const router = useVirtualRouter();
  const [tab, setTab] = useState<"preview" | "toc">("preview");
  const [loadingPackage, setLoadingPackage] = useState(false);
  const [packageData, setPackageData] = useState<PublicLibraryPackage | null>(
    null,
  );
  const [loadError, setLoadError] = useState("");
  const [selectedChapterIndex, setSelectedChapterIndex] = useState(0);
  const [localState, setLocalState] = useState<PublicBookLocalState>({
    localBook: undefined,
    progress: undefined,
  });
  const [joining, setJoining] = useState(false);
  const [readingActionPending, setReadingActionPending] = useState(false);
  const [actionMessage, setActionMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  // 目录搜索与排序
  const [tocSearch, setTocSearch] = useState("");
  const [isTocReverse, setIsTocReverse] = useState(false);

  // 试读器排版偏好
  const [previewFontSize, setPreviewFontSize] = useState<14 | 16 | 18 | 20>(16);
  const [previewTheme, setPreviewTheme] = useState<PreviewTheme>("paper");

  // 载入图书包数据与本地书架状态
  useEffect(() => {
    if (!book) {
      setPackageData(null);
      setLoadError("");
      setSelectedChapterIndex(0);
      setLocalState({ localBook: undefined, progress: undefined });
      setActionMessage(null);
      setTocSearch("");
      setIsTocReverse(false);
      return;
    }

    let isMounted = true;
    setLoadingPackage(true);
    setLoadError("");
    setActionMessage(null);
    setTocSearch("");
    setIsTocReverse(false);

    // 检查本地收录与阅读进度
    void getLocalStateForPublicBook(book).then((state) => {
      if (!isMounted) return;
      setLocalState(state);
      if (state.progress && typeof state.progress.chapterIndex === "number") {
        setSelectedChapterIndex(state.progress.chapterIndex);
      } else {
        setSelectedChapterIndex(0);
      }
    });

    // 获取完整图书包（用于目录浏览与章节试读）
    publicLibraryApiClient
      .getPackage(book.id)
      .then((data) => {
        if (!isMounted) return;
        setPackageData(data);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error("[PublicLibrary] 加载图书包失败:", err);
        setLoadError("无法加载典籍手卷内容，请检查网络或后端服务。");
      })
      .finally(() => {
        if (isMounted) setLoadingPackage(false);
      });

    return () => {
      isMounted = false;
    };
  }, [book]);

  // 过滤与排序目录
  const filteredChapters = useMemo(() => {
    if (!packageData?.chapters) return [];
    let list = packageData.chapters;
    if (tocSearch.trim()) {
      const q = tocSearch.trim().toLowerCase();
      list = list.filter(
        (ch) =>
          ch.title.toLowerCase().includes(q) ||
          String(ch.index + 1).includes(q),
      );
    }
    if (isTocReverse) {
      list = [...list].reverse();
    }
    return list;
  }, [packageData?.chapters, tocSearch, isTocReverse]);

  if (typeof document === "undefined" || !book) return null;

  const localBook = localState.localBook;
  const localProgress = localState.progress;

  // 加入书架（仅保存到本地，不跳转）
  const handleAddToShelf = async () => {
    if (joining || readingActionPending || localBook) return;
    setJoining(true);
    setActionMessage(null);
    try {
      const result = await publicLibraryJoinService.join(book.id);
      const updatedState = await getLocalStateForPublicBook(book);
      setLocalState(updatedState);
      setActionMessage({
        text: `《${book.title}》已完整收录入本地书架。`,
        type: "success",
      });
      onJoined?.(book, result.localBookId);
    } catch (error) {
      console.error("[PublicLibrary] 加入书架失败:", error);
      setActionMessage({
        text: "整本正文未能完整加入，本地书架没有留下半本书。请稍后重试。",
        type: "error",
      });
    } finally {
      setJoining(false);
    }
  };

  // 即刻开卷 / 继续阅读（如未在本地先加入，然后跳转到阅读器并附带 from=public-library）
  const handleDirectRead = async () => {
    if (joining || readingActionPending) return;
    setReadingActionPending(true);
    setActionMessage(null);
    try {
      let targetId = localBook?.id;
      if (!targetId) {
        const result = await publicLibraryJoinService.join(book.id);
        targetId = result.localBookId;
        onJoined?.(book, targetId);
      }
      onClose();
      router.push(`/reader/${targetId}?from=public-library`);
    } catch (error) {
      console.error("[PublicLibrary] 准备阅读失败:", error);
      setActionMessage({
        text: "未能准备就绪阅读正文，请稍后重试。",
        type: "error",
      });
      setReadingActionPending(false);
    }
  };

  const currentChapter =
    packageData?.chapters.find((ch) => ch.index === selectedChapterIndex) ||
    packageData?.chapters[0] ||
    null;

  // 估算阅读时长（假设 400 字/分钟）
  const estimatedReadHours = (book.wordCount / (400 * 60)).toFixed(1);

  // 试读背景样式
  const previewThemeClasses =
    previewTheme === "paper"
      ? "bg-[#F7F3E8] text-[#2C241B] border-[#E5DAC6]"
      : previewTheme === "dark"
        ? "bg-[#18181A] text-[#D8D8DE] border-[#2A2A2E]"
        : "bg-[#FFFFFF] text-[#222224] border-[#E8E8EC]";

  return createPortal(
    <ReaderDialogSurface
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1612]/55 p-2 backdrop-blur-md sm:p-5"
      fallbackFocus={() => fallbackFocus.current}
      label={`典籍手卷《${book.title}》`}
      onClose={() => {
        if (!joining && !readingActionPending) onClose();
      }}
      open={Boolean(book)}
    >
      <div className="ui-surface flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl">
        {/* 顶部 Header：典籍装帧与元数据 */}
        <div className="relative border-b border-[var(--color-border)] bg-[var(--color-surface-muted)]/20 p-4 sm:p-5">
          <div className="flex min-w-0 items-start gap-4">
            <BookCover
              className="h-28 w-20 shrink-0 rounded-md shadow-md ring-1 ring-black/5"
              compact
              title={book.title}
            />
            <div className="flex min-w-0 flex-1 flex-col justify-between self-stretch">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[var(--color-primary)]/10 px-2.5 py-0.5 text-xs font-semibold text-[var(--color-primary)]">
                    {book.category}
                  </span>
                  {localBook && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                      <Check className="h-3 w-3" />
                      已在书架
                    </span>
                  )}
                  {localProgress && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                      <Compass className="h-3 w-3" />
                      已读至第 {localProgress.chapterIndex + 1} 章 ({Math.round(localProgress.percentage)}%)
                    </span>
                  )}
                </div>
                <h2 className="mt-1 line-clamp-1 [font-family:var(--font-display)] text-lg font-bold text-[var(--color-foreground)] sm:text-xl">
                  {book.title}
                </h2>
                <p className="mt-0.5 text-xs text-[var(--color-muted)] sm:text-sm">
                  {book.author || "佚名"} 著 · {book.chapterCount} 章节 · 约 {(book.wordCount / 10000).toFixed(1)} 万字
                </p>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-[var(--color-muted)]">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  预计阅读 {estimatedReadHours} 小时
                </span>
                {book.maintainerLabel && (
                  <span className="rounded border border-[var(--color-border)] px-1.5 py-0.5 text-[10px]">
                    {book.maintainerLabel}
                  </span>
                )}
                {book.tags?.slice(0, 3).map((tag) => (
                  <span
                    className="rounded border border-[var(--color-border)] px-1.5 py-0.5 text-[10px]"
                    key={tag.id}
                  >
                    #{tag.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <button
            aria-label="关闭详情手卷"
            className="ui-focus-ring absolute right-3 top-3 rounded-full p-1.5 text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-hover)]"
            onClick={onClose}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 选项卡导航栏 */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface-muted)]/30 px-4">
          <div className="flex">
            <button
              className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors sm:text-sm ${
                tab === "preview"
                  ? "border-[var(--color-primary)] text-[var(--color-primary)]"
                  : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
              }`}
              onClick={() => setTab("preview")}
              type="button"
            >
              <FileText className="h-4 w-4" />
              典籍简介与试读
            </button>
            <button
              className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors sm:text-sm ${
                tab === "toc"
                  ? "border-[var(--color-primary)] text-[var(--color-primary)]"
                  : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
              }`}
              onClick={() => setTab("toc")}
              type="button"
            >
              <List className="h-4 w-4" />
              目录手卷 ({packageData?.chapters.length ?? book.chapterCount})
            </button>
          </div>

          {/* 试读排版快捷微调（仅在 preview 选项卡时显示） */}
          {tab === "preview" && (
            <div className="hidden items-center gap-1.5 sm:flex">
              {/* 字号调节 */}
              <div className="flex items-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5 text-xs">
                <button
                  aria-label="缩小字号"
                  className="px-1.5 py-0.5 hover:text-[var(--color-primary)] disabled:opacity-30"
                  disabled={previewFontSize <= 14}
                  onClick={() =>
                    setPreviewFontSize(
                      (s) => Math.max(14, s - 2) as 14 | 16 | 18 | 20,
                    )
                  }
                  type="button"
                >
                  <Type className="h-3 w-3" />-
                </button>
                <span className="px-1 text-[10px] text-[var(--color-muted)]">
                  {previewFontSize}
                </span>
                <button
                  aria-label="放大字号"
                  className="px-1.5 py-0.5 hover:text-[var(--color-primary)] disabled:opacity-30"
                  disabled={previewFontSize >= 20}
                  onClick={() =>
                    setPreviewFontSize(
                      (s) => Math.min(20, s + 2) as 14 | 16 | 18 | 20,
                    )
                  }
                  type="button"
                >
                  <Type className="h-3.5 w-3.5" />+
                </button>
              </div>

              {/* 主题底色切换 */}
              <div className="flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5">
                <button
                  aria-label="宣纸纸色"
                  className={`h-5 w-5 rounded-sm border ${
                    previewTheme === "paper"
                      ? "border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]"
                      : "border-transparent"
                  } bg-[#F7F3E8]`}
                  onClick={() => setPreviewTheme("paper")}
                  title="宣纸"
                  type="button"
                />
                <button
                  aria-label="白昼晨光"
                  className={`h-5 w-5 rounded-sm border ${
                    previewTheme === "light"
                      ? "border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]"
                      : "border-transparent"
                  } bg-white`}
                  onClick={() => setPreviewTheme("light")}
                  title="白昼"
                  type="button"
                />
                <button
                  aria-label="水墨暗夜"
                  className={`h-5 w-5 rounded-sm border ${
                    previewTheme === "dark"
                      ? "border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]"
                      : "border-transparent"
                  } bg-[#18181A]`}
                  onClick={() => setPreviewTheme("dark")}
                  title="水墨"
                  type="button"
                />
              </div>
            </div>
          )}
        </div>

        {/* 状态消息通知 */}
        {actionMessage && (
          <div
            className={`px-4 py-2 text-xs transition-all sm:text-sm ${
              actionMessage.type === "success"
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "bg-rose-500/10 text-rose-700 dark:text-rose-300"
            }`}
          >
            {actionMessage.text}
          </div>
        )}

        {/* 内容展示区 */}
        <div className="min-h-[280px] flex-1 overflow-y-auto p-4 sm:p-5">
          {loadingPackage ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 text-[var(--color-muted)]">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary)]" />
              <p className="text-xs tracking-wider">正在展开典籍手卷…</p>
            </div>
          ) : loadError ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
              <p className="text-xs text-[var(--color-danger)] sm:text-sm">
                {loadError}
              </p>
              <button
                className="ui-focus-ring inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3.5 py-1.5 text-xs font-medium text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)]"
                onClick={() => {
                  setLoadingPackage(true);
                  setLoadError("");
                  publicLibraryApiClient
                    .getPackage(book.id)
                    .then((data) => setPackageData(data))
                    .catch(() => setLoadError("重新载入失败，请检查服务。"))
                    .finally(() => setLoadingPackage(false));
                }}
                type="button"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                重新展开手卷
              </button>
            </div>
          ) : tab === "preview" ? (
            <div className="space-y-4">
              {/* 简介卡片 */}
              {book.description ? (
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)]/30 p-3.5 text-xs leading-relaxed text-[var(--color-muted)] sm:text-sm">
                  <span className="font-semibold text-[var(--color-foreground)]">
                    内容提要：
                  </span>
                  {book.description}
                </div>
              ) : null}

              {/* 章节试读器 */}
              {currentChapter ? (
                <div
                  className={`rounded-xl border p-4 shadow-inner transition-colors sm:p-5 ${previewThemeClasses}`}
                >
                  {/* 试读章节导航条 */}
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-black/10 pb-2.5 dark:border-white/10">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-[var(--color-primary)]/15 px-2 py-0.5 text-[11px] font-bold text-[var(--color-primary)]">
                        试读 · 第 {currentChapter.index + 1} 章
                      </span>
                      <h3 className="text-sm font-bold sm:text-base">
                        {currentChapter.title}
                      </h3>
                    </div>

                    {/* 上下章快速切换试读 */}
                    <div className="flex items-center gap-1">
                      <button
                        aria-label="试读上一章"
                        className="rounded p-1 hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/10"
                        disabled={currentChapter.index <= 0}
                        onClick={() =>
                          setSelectedChapterIndex(
                            Math.max(0, currentChapter.index - 1),
                          )
                        }
                        title="上一章"
                        type="button"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        aria-label="试读下一章"
                        className="rounded p-1 hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/10"
                        disabled={
                          !packageData ||
                          currentChapter.index >=
                            packageData.chapters.length - 1
                        }
                        onClick={() =>
                          setSelectedChapterIndex((i) => i + 1)
                        }
                        title="下一章"
                        type="button"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* 试读正文内容 */}
                  <div
                    className="max-h-80 overflow-y-auto whitespace-pre-wrap [font-family:var(--font-reader-serif,serif)] leading-relaxed tracking-wide [text-indent:2em]"
                    style={{ fontSize: `${previewFontSize}px` }}
                  >
                    {currentChapter.content}
                  </div>

                  {/* 试读底部引导 */}
                  <div className="mt-4 flex items-center justify-between border-t border-black/5 pt-3 text-xs text-[var(--color-muted)] dark:border-white/5">
                    <span>正文共 {currentChapter.content.length} 字</span>
                    <button
                      className="font-medium text-[var(--color-primary)] hover:underline"
                      onClick={() => void handleDirectRead()}
                      type="button"
                    >
                      开卷沉浸阅读全书 →
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-[var(--color-muted)]">
                  暂无章节预览正文。
                </p>
              )}
            </div>
          ) : (
            /* 目录手卷列表 */
            <div className="space-y-3">
              {/* 目录搜索与排序工具栏 */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-muted)]" />
                  <input
                    className="ui-input w-full rounded-lg py-1.5 pl-8 pr-7 text-xs"
                    onChange={(e) => setTocSearch(e.target.value)}
                    placeholder="搜索目录章节…"
                    type="text"
                    value={tocSearch}
                  />
                  {tocSearch && (
                    <button
                      aria-label="清空搜索"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
                      onClick={() => setTocSearch("")}
                      type="button"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <button
                  className="ui-focus-ring inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-foreground)]"
                  onClick={() => setIsTocReverse((v) => !v)}
                  title={isTocReverse ? "切换为正序" : "切换为倒序"}
                  type="button"
                >
                  <ArrowUpDown className="h-3.5 w-3.5" />
                  {isTocReverse ? "倒序" : "正序"}
                </button>
              </div>

              {/* 章节条目 */}
              <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
                {filteredChapters.length === 0 ? (
                  <p className="py-8 text-center text-xs text-[var(--color-muted)]">
                    未找到匹配章节
                  </p>
                ) : (
                  filteredChapters.map((chapter) => {
                    const isSelected = selectedChapterIndex === chapter.index;
                    const isReadingChapter =
                      localProgress?.chapterIndex === chapter.index;
                    return (
                      <button
                        className={`ui-focus-ring flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-colors sm:text-sm ${
                          isSelected
                            ? "bg-[var(--color-primary)]/10 font-semibold text-[var(--color-primary)]"
                            : "text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)]"
                        }`}
                        key={chapter.id}
                        onClick={() => {
                          setSelectedChapterIndex(chapter.index);
                          setTab("preview");
                        }}
                        type="button"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="w-10 shrink-0 text-[10px] text-[var(--color-muted)]">
                            #{chapter.index + 1}
                          </span>
                          <span className="truncate">{chapter.title}</span>
                          {isReadingChapter && (
                            <span className="rounded bg-amber-500/15 px-1.5 py-0.2 text-[9px] font-bold text-amber-700 dark:text-amber-300">
                              读至此
                            </span>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1 text-[11px] text-[var(--color-muted)]">
                          <span>{chapter.content.length} 字</span>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* 底部操作工具栏 */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] bg-[var(--color-surface-muted)]/40 p-4 sm:p-5">
          <div className="text-xs text-[var(--color-muted)]">
            {localProgress ? (
              <span>已读至第 {localProgress.chapterIndex + 1} 章，随时可无缝续读</span>
            ) : localBook ? (
              <span>典籍已在本地书架，随时可开启阅读</span>
            ) : (
              <span>支持即刻阅读，无需等待漫长同步</span>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {!localBook ? (
              <button
                className="ui-focus-ring inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-xs font-semibold text-[var(--color-foreground)] shadow-sm hover:bg-[var(--color-surface-hover)] disabled:opacity-50 sm:text-sm"
                disabled={joining || readingActionPending}
                onClick={() => void handleAddToShelf()}
                type="button"
              >
                {joining ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {joining ? "收录中…" : "放入书架"}
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <Check className="h-3.5 w-3.5" />
                已收录
              </span>
            )}

            <button
              className="ui-focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-6 text-xs font-semibold text-white shadow-md transition-transform hover:opacity-95 active:scale-95 disabled:opacity-50 sm:text-sm"
              disabled={joining || readingActionPending}
              onClick={() => void handleDirectRead()}
              type="button"
            >
              {readingActionPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <BookOpen className="h-4 w-4" />
              )}
              {readingActionPending
                ? "正在开卷…"
                : localProgress
                  ? `继续阅读 (第 ${localProgress.chapterIndex + 1} 章)`
                  : localBook
                    ? "进入阅读"
                    : "📖 即刻开卷"}
            </button>
          </div>
        </div>
      </div>
    </ReaderDialogSurface>,
    document.body,
  );
}
