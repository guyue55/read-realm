"use client";

import { useEffect, useState } from "react";
import { db } from "@reader/storage-core";
import { useRouter } from "next/navigation";
import type { Bookmark } from "@reader/shared-types";
import { PageLayout } from "@/components/PageLayout";
import { EmptyState } from "@/components/EmptyState";

export default function NotesPage() {
  const router = useRouter();
  const [bookmarks, setBookmarks] = useState<(Bookmark & { bookTitle?: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNotes = async () => {
      const allBookmarks = await db.bookmarks.toArray();
      const allBooks = await db.books.toArray();
      const bookMap = new Map(allBooks.map(b => [b.id, b.title]));
      
      const enriched = allBookmarks.map(b => ({
        ...b,
        bookTitle: bookMap.get(b.bookId) || "未知书籍"
      })).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      setBookmarks(enriched);
      setLoading(false);
    };
    fetchNotes();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除这条笔记吗？")) return;
    await db.bookmarks.delete(id);
    setBookmarks(prev => prev.filter(b => b.id !== id));
  };

  return (
    <PageLayout title="笔记与书签" onBack={() => router.push("/library")}>
      <div className="w-full max-w-5xl mx-auto flex flex-col gap-6 mt-4">
        {loading ? (
          <div className="flex items-center justify-center p-20">
            <div className="animate-spin text-[#678055] text-4xl font-light">↻</div>
          </div>
        ) : bookmarks.length === 0 ? (
           <EmptyState 
              title="暂无笔记" 
              description="在阅读时长按或选中文字即可添加书签与笔记"
              actionLabel="去阅读"
              onAction={() => router.push("/library")}
           />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {bookmarks.map((bookmark) => (
              <div key={bookmark.id} className="bg-[#FFFDF8] p-6 rounded-[20px] shadow-[0_4px_16px_rgba(80,65,45,0.06)] border border-[rgba(80,65,45,0.08)] flex flex-col hover:shadow-[0_8px_24px_rgba(80,65,45,0.12)] transition-shadow">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex flex-col">
                     <span className="text-sm font-bold text-[#2F2A24] font-serif">{bookmark.bookTitle}</span>
                     <span className="text-xs text-[#6F665B] mt-1">第 {bookmark.chapterIndex + 1} 章</span>
                  </div>
                  <button 
                    onClick={() => handleDelete(bookmark.id)}
                    className="w-8 h-8 rounded-full bg-[#FFF0EC] text-[#DCA79A] flex items-center justify-center hover:bg-[#FCE0DA] transition-colors shadow-sm"
                  >
                    ✕
                  </button>
                </div>
                
                <div className="flex-1 bg-[#F4ECD8] p-4 rounded-[12px] border border-[#E4D9C9] relative mb-6">
                  <div className="absolute top-4 left-4 text-4xl text-[#DED6C8] font-serif leading-none opacity-50 select-none pointer-events-none">&quot;</div>
                  <p className="text-[#3A2D22] text-sm leading-relaxed relative z-10 italic pl-6 pr-2">
                    {bookmark.contentPreview || "（无内容预览）"}
                  </p>
                </div>
                
                <div className="flex justify-between items-center mt-auto border-t border-[rgba(80,65,45,0.08)] pt-4">
                  <span className="text-xs text-[#8B8277]">
                    {new Date(bookmark.createdAt).toLocaleDateString()}
                  </span>
                  <button 
                    onClick={() => router.push(`/reader/${bookmark.bookId}`)}
                    className="text-[#678055] text-sm font-bold hover:underline"
                  >
                    跳转到原文 →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageLayout>
  );
}