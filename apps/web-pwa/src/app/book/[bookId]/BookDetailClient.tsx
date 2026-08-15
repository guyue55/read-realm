"use client";

import { BookCover } from "@/components/BookCover";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PageLayout } from "@/components/PageLayout";
import { SkeletonLoader } from "@/components/SkeletonLoader";
import { extractColorsFromTitle } from "@/lib/color-extraction";
import { describeAppError } from "@/lib/i18n";
import { useVirtualRouter } from "@/lib/route-store";
import { parseAuthorizedUrlSource } from "@/lib/url-source-client";
import {
  createDefaultSourceCheckPreference,
  createUrlSourceCheckPreview,
  isSourceCheckDue,
  type SourceCheckPreference,
} from "@/lib/url-source-policy";
import type { Book } from "@reader/shared-types";
import { db } from "@reader/storage-core";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";

export default function BookDetailPage({
  params,
}: {
  params: { bookId: string };
}) {
  const router = useVirtualRouter();
  const [book, setBook] = useState<Book | null>(null);
  const [showCacheSheet, setShowCacheSheet] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [sourceChecking, setSourceChecking] = useState(false);
  const [sourceCheckMessage, setSourceCheckMessage] = useState("");
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
    if (typeof window !== "undefined" && window.location.pathname !== "/") {
      window.location.replace(
        `/#${window.location.pathname}${window.location.search}`,
      );
    }
  }, []);

  useEffect(() => {
    db.books
      .get(params.bookId)
      .then((b) => {
        if (b) setBook(b);
        else router.push("/library");
      })
      .catch((error) => {
        console.error("载入书卷详情发生异常:", error);
        router.push("/library");
      });
  }, [params.bookId, router]);

  // 1. 实时获取真实阅读进度
  const progress = useLiveQuery(
    () => db.progress.get(params.bookId),
    [params.bookId],
  );

  // 2. 实时查询本地书签和笔记的总数
  const bookmarkCount = useLiveQuery(
    () => db.bookmarks.where("bookId").equals(params.bookId).count(),
    [params.bookId],
  );

  // Toast 自动消退
  useEffect(() => {
    if (toastMsg) {
      const timer = setTimeout(() => setToastMsg(""), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMsg]);

  const checkUrlSource = async (trigger: "manual" | "scheduled") => {
    if (!book?.sourceUrl || book.sourceType !== "url" || sourceChecking) return;
    if (!book.sourceRightsConfirmedAt) {
      setSourceCheckMessage(
        "此旧来源没有权利确认记录，请重新从导入页添加后再检查。",
      );
      return;
    }
    setSourceChecking(true);
    setSourceCheckMessage(
      trigger === "scheduled" ? "按已启用周期检查来源…" : "检查公开来源…",
    );
    try {
      const remote = await parseAuthorizedUrlSource(book.sourceUrl, true);
      const preview = createUrlSourceCheckPreview(book, remote);
      const nextBook: Book = {
        ...book,
        sourceLastCheckedAt: new Date().toISOString(),
        sourceCheckPreview: preview,
        updatedAt: book.updatedAt,
      };
      await db.books.put(nextBook);
      setBook(nextBook);
      setSourceCheckMessage(
        preview.status === "current"
          ? `已检查：来源仍为 ${preview.remoteChapterCount} 章，本地内容未改动。`
          : `发现 ${preview.differences.join("；")}。这只是预览，本地内容未改动。`,
      );
    } catch (error) {
      setSourceCheckMessage(`检查已停止：${describeAppError(error)}`);
    } finally {
      setSourceChecking(false);
    }
  };

  useEffect(() => {
    if (!book || sourceChecking || book.sourceType !== "url") return;
    const preference =
      book.sourceCheckPreference ?? createDefaultSourceCheckPreference();
    if (!isSourceCheckDue(preference, book.sourceLastCheckedAt)) return;
    void checkUrlSource("scheduled");
    // 一本书每次进入详情只会在到期时触发；成功写入时间会使下一轮不再到期。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    book?.id,
    book?.sourceLastCheckedAt,
    book?.sourceCheckPreference?.enabled,
    book?.sourceCheckPreference?.intervalHours,
  ]);

  const updateSourceCheckPreference = async (
    preference: SourceCheckPreference,
  ) => {
    if (!book || book.sourceType !== "url") return;
    const nextBook: Book = { ...book, sourceCheckPreference: preference };
    await db.books.put(nextBook);
    setBook(nextBook);
    setSourceCheckMessage(
      preference.enabled
        ? `已启用：打开本书详情且间隔到期时检查，每 ${preference.intervalHours} 小时最多一次。`
        : "定时检查已关闭；仍可手动检查。",
    );
  };

  if (!book) {
    return (
      <PageLayout title="载入书册..." onBack={() => router.push("/library")}>
        <div className="w-full max-w-4xl mx-auto mt-10 p-6 md:p-10 rounded-[28px] border border-[#E9DCC8] bg-[#FFFDF8] shadow-[0_16px_40px_rgba(80,65,45,0.02)] physics-spring animate-pulse">
          <SkeletonLoader type="list" count={1} />
        </div>
      </PageLayout>
    );
  }

  // 动态提取封面真彩配方
  const colors = extractColorsFromTitle(book.title);

  // 进度换算
  const progressPercent =
    progress && book.chapterCount > 0
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round(
              progress.percentage ||
                ((progress.chapterIndex + 1) / book.chapterCount) * 100,
            ),
          ),
        )
      : 0;
  const sourceLabels: Record<Book["sourceType"], string> = {
    upload: "本地导入",
    url: "网页导入",
    search: "云端同步",
    bookSource: "书源导入",
    manual: "手动创建",
    folder_index: "关联目录",
    folder_multi_file_book: "多文件目录",
    local_backend_directory: "服务端目录",
    cloud_cache: "云端缓存",
  };
  const canClearCache = [
    "folder_index",
    "folder_multi_file_book",
    "cloud_cache",
  ].includes(book.sourceType);

  // 清除本地缓存核心处理
  const handleClearCache = () => {
    setConfirmState({
      isOpen: true,
      title: "清空物理缓存",
      message: `确定要清空典籍「${book.title}」的本地章节正文缓存吗？\n\n（此操作将释放 IndexedDB 本地占用空间。我们将永久保留您的阅读进度、书签和全部高亮手记。再次阅读该书时会自动按需拉取）`,
      isDanger: true,
      onConfirm: async () => {
        try {
          await db.chapters.where("bookId").equals(book.id).delete();
          setToastMsg("🍃 本地章节正文缓存已成功清空，本地存储资源已释放。");
          setShowCacheSheet(false);
        } catch (e) {
          console.error("清空章节正文缓存发生故障:", e);
          setToastMsg("💡 本地存储繁忙，清理缓存失败。");
          throw e;
        }
      },
    });
  };

  return (
    <PageLayout title={book.title} onBack={() => router.push("/library")}>
      <div
        className="w-full max-w-4xl mx-auto flex flex-col md:flex-row gap-10 mt-4 p-6 md:p-10 rounded-[28px] border shadow-[0_16px_40px_rgba(80,65,45,0.04)] physics-spring"
        style={{
          background: `linear-gradient(135deg, ${colors.bgGradStart} 0%, ${colors.bgGradEnd} 100%)`,
          borderColor: colors.border,
        }}
      >
        {/* 3D 拟物触感书籍封面 */}
        <div className="group w-48 md:w-64 shrink-0 mx-auto md:mx-0 aspect-[2/3]">
          <BookCover
            title={book.title}
            hoverLift={true}
            className="w-full h-full"
          />
        </div>

        {/* Book Info Panel */}
        <div className="flex-1 flex flex-col pt-2">
          <h1
            className="text-3xl md:text-4xl font-bold font-serif mb-3 tracking-wide drop-shadow-sm"
            style={{ color: colors.text }}
          >
            {book.title}
          </h1>
          <p className="mb-8 text-sm" style={{ color: colors.muted }}>
            {book.author ? `作者：${book.author} · ` : ""}
            {sourceLabels[book.sourceType]} · {book.format.toUpperCase()}
          </p>

          <div className="flex flex-wrap gap-4 mb-10">
            <button
              onClick={() => router.push(`/reader/${book.id}`)}
              className="px-8 py-3 rounded-[12px] font-bold shadow-md hover:opacity-90 active:scale-95 transition-all"
              style={{
                backgroundColor: colors.accent,
                color: book.format === "epub" ? "#FFF" : colors.bgGradStart,
              }}
            >
              继续阅读
            </button>
            {canClearCache && (
              <button
                onClick={() => setShowCacheSheet(true)}
                className="px-6 py-3 border rounded-[8px] font-bold hover:bg-white/20 active:scale-95 transition-all"
                style={{ borderColor: colors.border, color: colors.text }}
              >
                缓存管理
              </button>
            )}
          </div>

          <div
            className="grid grid-cols-2 md:grid-cols-3 gap-6 p-6 rounded-[20px] border shadow-[0_8px_24px_rgba(0,0,0,0.02)]"
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.45)",
              borderColor: colors.border,
            }}
          >
            <div>
              <p className="text-xs mb-1" style={{ color: colors.muted }}>
                阅读进度
              </p>
              <p
                className="font-bold font-serif text-lg"
                style={{ color: colors.text }}
              >
                {progressPercent}%
              </p>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: colors.muted }}>
                章节数
              </p>
              <p
                className="font-bold font-serif text-lg"
                style={{ color: colors.text }}
              >
                {book.chapterCount}
              </p>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: colors.muted }}>
                字数
              </p>
              <p
                className="font-bold font-serif text-lg"
                style={{ color: colors.text }}
              >
                {book.wordCount
                  ? `${(book.wordCount / 10000).toFixed(1)}万`
                  : "-"}
              </p>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: colors.muted }}>
                书签与笔记
              </p>
              <p
                className="font-bold font-serif text-lg"
                style={{ color: colors.text }}
              >
                {bookmarkCount ?? 0}
              </p>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: colors.muted }}>
                来源
              </p>
              <p
                className="font-bold font-serif text-lg"
                style={{ color: colors.text }}
              >
                {book.sourceType}
              </p>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: colors.muted }}>
                导入时间
              </p>
              <p
                className="font-bold font-serif text-lg"
                style={{ color: colors.text }}
              >
                {new Date(book.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          {book.sourceType === "url" && book.sourceUrl && (
            <section
              className="mt-6 rounded-[18px] border p-5"
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.38)",
                borderColor: colors.border,
              }}
              aria-labelledby="source-check-title"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2
                    id="source-check-title"
                    className="font-bold"
                    style={{ color: colors.text }}
                  >
                    公开来源检查
                  </h2>
                  <p
                    className="mt-1 text-xs leading-5"
                    style={{ color: colors.muted }}
                  >
                    只比较书名与章节数，不自动覆盖本地正文。遇到登录、付费、验证码或反爬会停止。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void checkUrlSource("manual");
                  }}
                  disabled={sourceChecking}
                  className="ui-focus-ring min-h-10 shrink-0 rounded-full border bg-white/70 px-4 text-sm font-semibold disabled:opacity-50"
                  style={{ borderColor: colors.border, color: colors.text }}
                >
                  {sourceChecking ? "检查中…" : "立即检查"}
                </button>
              </div>

              <div
                className="mt-4 flex flex-col gap-3 text-sm"
                style={{ color: colors.muted }}
              >
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={
                      (
                        book.sourceCheckPreference ??
                        createDefaultSourceCheckPreference()
                      ).enabled
                    }
                    onChange={(event) => {
                      void updateSourceCheckPreference({
                        ...(book.sourceCheckPreference ??
                          createDefaultSourceCheckPreference()),
                        enabled: event.currentTarget.checked,
                      });
                    }}
                    className="h-4 w-4 accent-[var(--ui-accent)]"
                  />
                  <span>
                    按周期检查（默认关闭，仅在打开本书详情且到期时执行）
                  </span>
                </label>
                {(
                  book.sourceCheckPreference ??
                  createDefaultSourceCheckPreference()
                ).enabled && (
                  <label className="flex items-center gap-3 pl-7">
                    <span>最短间隔</span>
                    <select
                      value={
                        (
                          book.sourceCheckPreference ??
                          createDefaultSourceCheckPreference()
                        ).intervalHours
                      }
                      onChange={(event) => {
                        void updateSourceCheckPreference({
                          enabled: true,
                          intervalHours: Number(
                            event.currentTarget.value,
                          ) as SourceCheckPreference["intervalHours"],
                        });
                      }}
                      className="rounded-full border bg-white/80 px-3 py-1.5"
                      style={{ borderColor: colors.border, color: colors.text }}
                    >
                      <option value={6}>6 小时</option>
                      <option value={12}>12 小时</option>
                      <option value={24}>24 小时</option>
                      <option value={72}>3 天</option>
                      <option value={168}>7 天</option>
                    </select>
                  </label>
                )}
                {sourceCheckMessage && (
                  <p role="status" className="leading-6">
                    {sourceCheckMessage}
                  </p>
                )}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* 底部弹出式存储空间面板 */}
      {showCacheSheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-xs animate-in fade-in duration-300">
          {/* 点击背景收起 */}
          <div
            className="absolute inset-0"
            onClick={() => setShowCacheSheet(false)}
          />

          <div className="relative w-full max-w-4xl bg-[#FAF6EE] border-t border-[#DFD1BF] rounded-t-[32px] shadow-2xl p-6 md:p-10 flex flex-col gap-6 animate-in slide-in-from-bottom duration-300">
            {/* 中式边线装饰 */}
            <div className="absolute inset-4 rounded-t-[24px] border border-[#E9DCC8]/60 pointer-events-none" />

            <div className="flex justify-between items-center relative z-10">
              <h2 className="text-xl font-bold font-serif text-[#2F2A24] flex items-center gap-2">
                📦 案头藏书本地物理存储管理
              </h2>
              <button
                onClick={() => setShowCacheSheet(false)}
                className="w-8 h-8 rounded-full bg-[#EBE3D3]/50 text-[#6F665B] flex items-center justify-center hover:bg-[#EBE3D3] transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-2 relative z-10">
              <div className="bg-[#FFFDF9] border border-[#EBE3D3] p-5 rounded-2xl flex flex-col justify-center">
                <div className="flex justify-between items-baseline">
                  <span className="text-sm font-serif text-[#3A3226]">
                    章节正文物理缓存
                  </span>
                  <span className="text-2xl font-bold font-mono text-[#5F7D52]">
                    {book.wordCount
                      ? `${(book.wordCount * 0.003).toFixed(1)} KB`
                      : "0.0 KB"}
                  </span>
                </div>
                <p className="text-[10px] text-[#9C9388] mt-3 font-serif leading-relaxed">
                  * 字数以中文 UTF-8 编码 1 字符 ≈ 3
                  字节换算数据库中正文物理体积。
                </p>
              </div>

              <div className="space-y-4">
                <button
                  onClick={handleClearCache}
                  className="w-full py-3.5 border border-[#B86B5C] text-[#B86B5C] bg-[#FFF0EC] hover:bg-[#FCE0DA] active:scale-[0.98] font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-1.5"
                >
                  🗑️ 清空章节本地正文缓存
                </button>
                <p className="text-[11px] text-[#9C9388] leading-relaxed font-serif px-1">
                  🍂
                  说明：此操作仅清除本地书阁中该书所有章节的正文缓存以释放本地空间（保留书籍元数据、目录、阅读进度以及您的全部高亮笔记手记）。再次阅读该书时会自动按需同步加载。
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 优雅宣纸毛玻璃 Toast */}
      {toastMsg && (
        <div className="fixed bottom-24 left-1/2 z-[99] -translate-x-1/2 rounded-full border border-[rgba(80,65,45,0.15)] bg-[rgba(255,252,245,0.92)] px-5 py-2.5 text-xs font-bold text-[#2F2A24] shadow-lg backdrop-blur-md physics-spring flex items-center gap-2 animate-bounce-short">
          <span>🍃</span> {toastMsg}
        </div>
      )}

      {/* 🏮 国风宣纸拟物 Custom Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        isDanger={confirmState.isDanger}
        onConfirm={confirmState.onConfirm}
        onClose={() => setConfirmState((prev) => ({ ...prev, isOpen: false }))}
      />
    </PageLayout>
  );
}
