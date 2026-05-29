"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
              <p className="text-xs mb-1" style={{ color: colors.muted }}>阅读进度</p>
              <p className="font-bold font-serif" style={{ color: colors.text }}>0%</p>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: colors.muted }}>章节数</p>
              <p className="font-bold font-serif" style={{ color: colors.text }}>{book.chapterCount}</p>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: colors.muted }}>字数</p>
              <p className="font-bold font-serif" style={{ color: colors.text }}>
                {book.wordCount
                  ? `${(book.wordCount / 10000).toFixed(1)}万`
                  : "-"}
              </p>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: colors.muted }}>书签与笔记</p>
              <p className="font-bold font-serif" style={{ color: colors.text }}>0</p>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: colors.muted }}>来源</p>
              <p className="font-bold font-serif" style={{ color: colors.text }}>{book.sourceType}</p>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: colors.muted }}>导入时间</p>
              <p className="font-bold font-serif" style={{ color: colors.text }}>
                {new Date(book.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
