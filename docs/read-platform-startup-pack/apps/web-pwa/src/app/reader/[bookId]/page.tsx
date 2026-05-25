'use client';

import { useEffect, useState } from 'react';
import { ReaderEngine, ChapterData } from '@reader/reader-core';
import { db } from '@reader/storage-core';
import type { ReadingProgress } from '@reader/shared-types';

export default function ReaderPage({ params }: { params: { bookId: string } }) {
  const [chapter, setChapter] = useState<ChapterData | null>(null);
  const [engine, setEngine] = useState<ReaderEngine | null>(null);

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

  if (!chapter) return <div className="p-8 text-center text-[#2F2A24]">Loading chapter...</div>;

  return (
    <main className="min-h-screen bg-[#F8F8F5] text-[#2F2A24]">
      <div className="max-w-[760px] mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-8">{chapter.title}</h1>
        <div className="text-lg leading-[1.7] whitespace-pre-wrap">
          {chapter.content}
        </div>
        
        <div className="flex justify-between mt-12 pt-8 border-t border-[#E8E3DA]">
          <button onClick={handlePrev} className="px-4 py-2 bg-[#E8E3DA] rounded hover:bg-[#DDEBD6]">
            上一章 (Previous)
          </button>
          <button onClick={handleNext} className="px-4 py-2 bg-[#E8E3DA] rounded hover:bg-[#DDEBD6]">
            下一章 (Next)
          </button>
        </div>
      </div>
    </main>
  );
}
