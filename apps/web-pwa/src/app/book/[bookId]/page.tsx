"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "@reader/storage-core";
import type { Book } from "@reader/shared-types";
import { PageLayout } from "@/components/PageLayout";

export default function BookDetailPage({ params }: { params: { bookId: string } }) {
  const router = useRouter();
  const [book, setBook] = useState<Book | null>(null);

  useEffect(() => {
    db.books.get(params.bookId).then(b => {
      if (b) setBook(b);
      else router.push("/library");
    });
  }, [params.bookId, router]);

  if (!book) return null;

  return (
    <PageLayout title={book.title} onBack={() => router.push("/library")}>
      <div className="w-full max-w-4xl mx-auto flex flex-col md:flex-row gap-10 mt-4">
        {/* Book Cover matching PNG depth */}
        <div 
          className="w-48 md:w-64 shrink-0 mx-auto md:mx-0 aspect-[2/3] rounded-[12px] border border-[rgba(0,0,0,0.8)] shadow-[0_8px_24px_rgba(0,0,0,0.15)] relative overflow-hidden"
          style={{
            background: book.format === 'epub' 
              ? 'linear-gradient(135deg, #E9D7B6 0%, #D4BA90 40%, #8C6B45 100%)' 
              : 'linear-gradient(135deg, #2D343A 0%, #1D2224 40%, #0D0F10 100%)'
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none"></div>
          <div className="absolute inset-[6px] rounded-[6px] border border-white/20 flex flex-col items-center justify-center p-4 text-center bg-black/5">
            <span className="text-[#F3ECE0] font-bold text-xl leading-snug drop-shadow-md font-serif line-clamp-4">{book.title}</span>
          </div>
        </div>
        
        {/* Book Info Panel */}
        <div className="flex-1 flex flex-col pt-2">
          <h1 className="text-3xl md:text-4xl font-bold font-serif text-[#2F2A24] mb-3">{book.title}</h1>
          <p className="text-[#6F665B] mb-8">
            {book.author ? `作者：${book.author} · ` : ''}本地上传 · {book.format.toUpperCase()}
          </p>
          
          <div className="flex flex-wrap gap-4 mb-10">
            <button 
              onClick={() => router.push(`/reader/${book.id}`)}
              className="px-8 py-3 bg-[#678055] text-white rounded-[12px] font-bold shadow-[0_4px_12px_rgba(103,128,85,0.2)] hover:bg-[#526047] transition-colors"
            >
              继续阅读
            </button>
            <button 
              className="px-6 py-3 bg-[#EEF2E9] text-[#678055] border border-[#CDD8C5] rounded-[12px] font-bold hover:bg-[#DDEBD6] transition-colors"
            >
              缓存管理
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-6 p-6 bg-[#FFFDF8] rounded-[20px] border border-[#DED6C8] shadow-[0_8px_24px_rgba(80,65,45,0.06)]">
            <div>
              <p className="text-xs text-[#6F665B] mb-1">阅读进度</p>
              <p className="font-bold text-[#2F2A24]">0%</p>
            </div>
            <div>
              <p className="text-xs text-[#6F665B] mb-1">章节数</p>
              <p className="font-bold text-[#2F2A24]">{book.chapterCount}</p>
            </div>
            <div>
              <p className="text-xs text-[#6F665B] mb-1">字数</p>
              <p className="font-bold text-[#2F2A24]">{book.wordCount ? `${(book.wordCount / 10000).toFixed(1)}万` : '-'}</p>
            </div>
            <div>
              <p className="text-xs text-[#6F665B] mb-1">书签与笔记</p>
              <p className="font-bold text-[#2F2A24]">0</p>
            </div>
            <div>
              <p className="text-xs text-[#6F665B] mb-1">来源</p>
              <p className="font-bold text-[#2F2A24]">{book.sourceType}</p>
            </div>
            <div>
              <p className="text-xs text-[#6F665B] mb-1">导入时间</p>
              <p className="font-bold text-[#2F2A24]">{new Date(book.createdAt).toLocaleDateString()}</p>
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}