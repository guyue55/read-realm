"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@reader/storage-core";
import type { Book } from "@reader/shared-types";
import { PageLayout } from "@/components/PageLayout";
import { BookCover } from "@/components/BookCover";
import { extractColorsFromTitle } from "@/lib/color-extraction";
import { SkeletonLoader } from "@/components/SkeletonLoader";

export default function BookDetailPage({
  params,
}: {
  params: { bookId: string };
}) {
  const router = useRouter();
  const [book, setBook] = useState<Book | null>(null);
  const [showCacheSheet, setShowCacheSheet] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

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
    [params.bookId]
  );

  // 2. 实时查询本地书签和笔记的总数
  const bookmarkCount = useLiveQuery(
    () => db.bookmarks.where("bookId").equals(params.bookId).count(),
    [params.bookId]
  );

  // Toast 自动消退
  useEffect(() => {
    if (toastMsg) {
      const timer = setTimeout(() => setToastMsg(""), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMsg]);

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
  const progressPercent = progress && book.chapterCount > 0
    ? Math.max(
        0,
        Math.min(
          100,
          Math.round(
            progress.percentage ||
              ((progress.chapterIndex + 1) / book.chapterCount) * 100
          )
        )
      )
    : 0;

  // 清除本地缓存核心处理
  const handleClearCache = async () => {
    if (
      !confirm(
        `确定要清空「${book.title}」的本地正文缓存吗？\n（将保留阅读进度和您的全部笔记，重新开始阅读时会自动按需同步加载）`
      )
    )
      return;
    try {
      await db.chapters.where("bookId").equals(book.id).delete();
      setToastMsg("🍃 本地章节正文缓存已成功清空，本地存储资源已释放。");
      setShowCacheSheet(false);
    } catch (e) {
      console.error("清空章节正文缓存发生故障:", e);
      setToastMsg("💡 本地存储繁忙，清理缓存失败。");
    }
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
            {book.author ? `作者：${book.author} · ` : ""}本地上传 ·{" "}
            {book.format.toUpperCase()}
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
            <button
              onClick={() => setShowCacheSheet(true)}
              className="px-6 py-3 border rounded-[12px] font-bold hover:bg-white/20 active:scale-95 transition-all"
              style={{
                borderColor: colors.border,
                color: colors.text,
              }}
            >
              缓存管理
            </button>
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
              <p className="font-bold font-serif text-lg" style={{ color: colors.text }}>
                {progressPercent}%
              </p>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: colors.muted }}>
                章节数
              </p>
              <p className="font-bold font-serif text-lg" style={{ color: colors.text }}>
                {book.chapterCount}
              </p>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: colors.muted }}>
                字数
              </p>
              <p className="font-bold font-serif text-lg" style={{ color: colors.text }}>
                {book.wordCount
                  ? `${(book.wordCount / 10000).toFixed(1)}万`
                  : "-"}
              </p>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: colors.muted }}>
                书签与笔记
              </p>
              <p className="font-bold font-serif text-lg" style={{ color: colors.text }}>
                {bookmarkCount ?? 0}
              </p>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: colors.muted }}>
                来源
              </p>
              <p className="font-bold font-serif text-lg" style={{ color: colors.text }}>
                {book.sourceType}
              </p>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: colors.muted }}>
                导入时间
              </p>
              <p className="font-bold font-serif text-lg" style={{ color: colors.text }}>
                {new Date(book.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 缓存管理抽屉 (CacheSheet) - 中式暖泥宣纸风格 */}
      {showCacheSheet && (
        <div
          className="fixed inset-0 z-40 bg-black/25 backdrop-blur-xs animate-in fade-in duration-300"
          onClick={() => setShowCacheSheet(false)}
        />
      )}
      <div
        className={`fixed bottom-0 inset-x-0 bg-[#FFFDF9] z-50 px-6 pt-8 pb-[calc(2rem+env(safe-area-inset-bottom))] border-t border-[#E9DCC8] rounded-t-[24px] shadow-[0_-12px_40px_rgba(80,65,45,0.08)] physics-spring md:max-w-md md:left-auto md:right-6 md:bottom-6 md:rounded-[24px] md:border ${
          showCacheSheet ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-bold font-serif text-[#2F2A24] text-lg">
            本地缓存管理
          </h3>
          <button
            onClick={() => setShowCacheSheet(false)}
            className="text-[#6F665B] hover:text-[#2F2A24] p-1 font-bold text-base"
          >
            ✕
          </button>
        </div>
        <div className="space-y-6">
          <div className="bg-[rgba(80,65,45,0.03)] p-5 rounded-20 border border-[rgba(80,65,45,0.06)]">
            <p className="text-xs text-[#6F665B] mb-2 font-serif">
              本地数据库估算占用空间
            </p>
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
              * 字数以中文 UTF-8 编码 1 字符 ≈ 3 字节换算数据库中正文物理体积。
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
              🍂 说明：此操作仅清除 IndexedDB 中该书所有章节的正文缓存以释放本地空间（保留书籍元数据、目录、阅读进度以及您的全部高亮笔记手记）。再次阅读该书时会自动按需同步加载。
            </p>
          </div>
        </div>
      </div>

      {/* 优雅宣纸毛玻璃 Toast */}
      {toastMsg && (
        <div className="fixed bottom-24 left-1/2 z-[99] -translate-x-1/2 rounded-full border border-[rgba(80,65,45,0.15)] bg-[rgba(255,252,245,0.92)] px-5 py-2.5 text-xs font-bold text-[#2F2A24] shadow-lg backdrop-blur-md physics-spring flex items-center gap-2 animate-bounce-short">
          <span>🍃</span> {toastMsg}
        </div>
      )}
    </PageLayout>
  );
}
