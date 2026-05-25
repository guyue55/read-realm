'use client';

import { useEffect, useState } from 'react';
import { ReaderEngine, ChapterData } from '@reader/reader-core';
import { db } from '@reader/storage-core';
import type { ReadingProgress } from '@reader/shared-types';

export default function ReaderPage({ params }: { params: { bookId: string } }) {
  const [chapter, setChapter] = useState<ChapterData | null>(null);
  const [engine, setEngine] = useState<ReaderEngine | null>(null);
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    // Implement repositories using Dexie
    const chapterRepo = {
      getChapter: async (bookId: string, index: number) => {
        const c = await db.chapters.where({ bookId, index }).first();
        return c ? { index: c.index, title: c.title, content: c.content } : null;
      },
      getChapterCount: async (bookId: string) => {
        return await db.chapters.where('bookId').equals(bookId).count();
      }
    };

    const progressRepo = {
      getProgress: async (bookId: string) => {
        return (await db.progress.get(bookId)) || null;
      },
      saveProgress: async (progress: ReadingProgress) => {
        await db.progress.put(progress);
      }
    };

    const reader = new ReaderEngine(params.bookId, chapterRepo, progressRepo);
    
    reader.load().then(() => {
      setEngine(reader);
      setChapter(reader.getCurrentChapter());
    });
  }, [params.bookId]);

  const handleNext = async () => {
    if (engine && await engine.nextChapter()) {
      setChapter(engine.getCurrentChapter());
      window.scrollTo(0, 0);
    }
  };

  const handlePrev = async () => {
    if (engine && await engine.previousChapter()) {
      setChapter(engine.getCurrentChapter());
      window.scrollTo(0, 0);
    }
  };

  const handleMiddleTap = () => {
    setShowMenu(!showMenu);
  };

  if (!chapter) return <div className="p-8 text-center text-[#2F2A24]">Loading chapter...</div>;

  return (
    <main className="min-h-screen bg-[#F8F8F5] text-[#2F2A24] relative overflow-hidden">
      {/* Content Area */}
      <div className="max-w-[760px] mx-auto px-4 pt-12 pb-12 h-screen overflow-y-auto">
        <h1 className="text-2xl font-bold mb-8">{chapter.title}</h1>
        {/* We use dangerouslySetInnerHTML here because EPUB chapters contain sanitized HTML */}
        <div 
          className="text-lg leading-[1.7] whitespace-pre-wrap break-words" 
          dangerouslySetInnerHTML={{ __html: chapter.content }}
        />
      </div>

      {/* Tap Zones Overlay */}
      <div className="fixed inset-0 z-10 flex">
        <div className="w-1/4 h-full" onClick={handlePrev} />
        <div className="w-2/4 h-full" onClick={handleMiddleTap} />
        <div className="w-1/4 h-full" onClick={handleNext} />
      </div>

      {/* Top Toolbar */}
      <div className={`fixed top-0 inset-x-0 h-12 bg-white shadow-sm z-20 flex items-center px-4 transition-transform duration-200 ${showMenu ? 'translate-y-0' : '-translate-y-full'}`}>
        <button onClick={() => window.location.href = '/'} className="mr-4 text-sm font-medium">← 返回书架</button>
        <span className="truncate flex-1 text-sm font-bold text-center">{chapter.title}</span>
        <div className="w-12"></div> {/* Spacer to center title */}
      </div>

      {/* Bottom Toolbar */}
      <div className={`fixed bottom-0 inset-x-0 h-[calc(56px+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] bg-white shadow-[0_-1px_3px_rgba(0,0,0,0.1)] z-20 flex items-center justify-around px-4 transition-transform duration-200 ${showMenu ? 'translate-y-0' : 'translate-y-full'}`}>
        <button className="text-sm">目录</button>
        <button className="text-sm">进度</button>
        <button className="text-sm">设置</button>
        <button className="text-sm">夜间</button>
      </div>
    </main>
  );
}
