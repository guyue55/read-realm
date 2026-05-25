'use client';

import { useEffect, useState } from 'react';
import { ReaderEngine, ChapterData } from '@reader/reader-core';
import { db } from '@reader/storage-core';
import type { ReadingProgress } from '@reader/shared-types';
import { THEMES } from '@/styles/themes';

export default function ReaderPage({ params }: { params: { bookId: string } }) {
  const [chapter, setChapter] = useState<ChapterData | null>(null);
  const [engine, setEngine] = useState<ReaderEngine | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [settings, setSettings] = useState({
    fontSize: 18,
    lineHeight: 1.7,
    theme: 'paper' as 'paper' | 'sepia' | 'green' | 'dark' | 'black'
  });
  const [showSettings, setShowSettings] = useState(false);
  const [toc, setToc] = useState<{index: number, title: string}[]>([]);
  const [showToc, setShowToc] = useState(false);

  useEffect(() => {
    // Implement repositories using Dexie
    const chapterRepo = {
      getChapter: async (bookId: string, index: number) => {
        const c = await db.chapters.where({ bookId, index }).first();
        return c ? { index: c.index, title: c.title, content: c.content } : null;
      },
      getChapterCount: async (bookId: string) => {
        return await db.chapters.where('bookId').equals(bookId).count();
      },
      getToc: async (bookId: string) => {
        const chapters = await db.chapters
          .where('bookId')
          .equals(bookId)
          .sortBy('index');
        return chapters.map(c => ({ index: c.index, title: c.title }));
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
      const loadedSettings = reader.getSettings();
      setSettings({
        fontSize: loadedSettings.fontSize,
        lineHeight: loadedSettings.lineHeight,
        theme: loadedSettings.theme as 'paper' | 'sepia' | 'green' | 'dark' | 'black'
      });
      chapterRepo.getToc(params.bookId).then(setToc);
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

  const jumpToChapter = async (index: number) => {
    if (engine) {
      await engine.loadChapter(index);
      setChapter(engine.getCurrentChapter());
      setShowToc(false);
      setShowMenu(false);
      window.scrollTo(0, 0);
    }
  };

  const handleMiddleTap = () => {
    setShowMenu(!showMenu);
    if (showSettings) setShowSettings(false);
  };

  const updateFontSize = (delta: number) => {
    const newSize = Math.max(14, Math.min(36, settings.fontSize + delta));
    const newSettings = { ...settings, fontSize: newSize };
    setSettings(newSettings);
    engine?.updateSettings(newSettings);
  };

  const updateTheme = (theme: keyof typeof THEMES) => {
    const newSettings = { ...settings, theme: theme as 'paper' | 'sepia' | 'green' | 'dark' | 'black' };
    setSettings(newSettings);
    engine?.updateSettings(newSettings);
  };

  const currentThemeColors = THEMES[settings.theme as keyof typeof THEMES] || THEMES.paper;

  if (!chapter) return <div className="p-8 text-center text-[#2F2A24]">Loading chapter...</div>;

  return (
    <main 
      className="min-h-screen relative overflow-hidden transition-colors duration-300"
      style={{ backgroundColor: currentThemeColors.bg, color: currentThemeColors.text }}
    >
      {/* Content Area */}
      <div 
        className="max-w-[760px] mx-auto px-4 pt-12 pb-12 h-screen overflow-y-auto"
        style={{ fontSize: `${settings.fontSize}px`, lineHeight: settings.lineHeight }}
      >
        <h1 className="text-2xl font-bold mb-8">{chapter.title}</h1>
        {/* We use dangerouslySetInnerHTML here because EPUB chapters contain sanitized HTML */}
        <div 
          className="whitespace-pre-wrap break-words" 
          dangerouslySetInnerHTML={{ __html: chapter.content }}
        />
      </div>

      {/* Tap Zones Overlay */}
      <div className="fixed inset-0 z-10 flex">
        <div className="w-1/4 h-full" onClick={handlePrev} />
        <div className="w-2/4 h-full" onClick={handleMiddleTap} />
        <div className="w-1/4 h-full" onClick={handleNext} />
      </div>

      {/* Settings Backdrop */}
      {showSettings && (
        <div 
          className="fixed inset-0 z-20 bg-black/20" 
          onClick={() => setShowSettings(false)}
        />
      )}

      {/* Top Toolbar */}
      <div className={`fixed top-0 inset-x-0 h-12 bg-white shadow-sm z-20 flex items-center px-4 transition-transform duration-200 ${showMenu ? 'translate-y-0' : '-translate-y-full'}`}>
        <button onClick={() => window.location.href = '/'} className="mr-4 text-sm font-medium">← 返回书架</button>
        <span className="truncate flex-1 text-sm font-bold text-center">{chapter.title}</span>
        <div className="w-12"></div> {/* Spacer to center title */}
      </div>

      {/* Settings Sheet */}
      <div className={`fixed bottom-0 inset-x-0 bg-white shadow-[0_-2px_10px_rgba(0,0,0,0.1)] z-30 px-6 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] transition-transform duration-300 ${showSettings ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="flex items-center justify-between mb-8">
          <span className="text-sm font-medium text-gray-500">字号</span>
          <div className="flex items-center bg-gray-100 rounded-lg p-1">
            <button 
              onClick={() => updateFontSize(-2)}
              className="w-12 h-8 flex items-center justify-center text-xl font-bold"
            >
              A-
            </button>
            <span className="w-12 text-center font-bold">{settings.fontSize}</span>
            <button 
              onClick={() => updateFontSize(2)}
              className="w-12 h-8 flex items-center justify-center text-xl font-bold"
            >
              A+
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-medium text-gray-500">背景</span>
          <div className="flex flex-1 justify-around ml-4">
            {Object.entries(THEMES).map(([name, colors]) => (
              <button
                key={name}
                onClick={() => updateTheme(name as keyof typeof THEMES)}
                className={`w-10 h-10 rounded-full border-2 transition-all ${settings.theme === name ? 'border-blue-500 scale-110' : 'border-transparent'}`}
                style={{ backgroundColor: colors.bg }}
                title={name}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Toolbar */}
      <div className={`fixed bottom-0 inset-x-0 h-[calc(56px+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] bg-white shadow-[0_-1px_3px_rgba(0,0,0,0.1)] z-20 flex items-center justify-around px-4 transition-transform duration-200 ${showMenu ? 'translate-y-0' : '-translate-y-full'}`}>
        <button 
          onClick={() => { setShowToc(true); setShowMenu(false); }}
          className="text-sm"
        >
          目录
        </button>
        <button className="text-sm">进度</button>
        <button onClick={() => { setShowSettings(true); setShowMenu(false); }} className={`text-sm ${showSettings ? 'text-blue-500 font-bold' : ''}`}>设置</button>
        <button className="text-sm">夜间</button>
      </div>

      {/* ToC Drawer Overlay */}
      {showToc && (
        <div 
          className="fixed inset-0 z-40 bg-black/40 transition-opacity"
          onClick={() => setShowToc(false)}
        />
      )}

      {/* ToC Drawer */}
      <div className={`fixed inset-y-0 left-0 w-4/5 max-w-sm bg-white z-50 shadow-xl transition-transform duration-300 transform ${showToc ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-full flex flex-col">
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="text-lg font-bold">目录</h2>
            <span className="text-xs text-gray-500">{toc.length} 章节</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {toc.map((item) => (
              <button
                key={item.index}
                onClick={() => jumpToChapter(item.index)}
                className={`w-full text-left px-4 py-3 border-b border-gray-50 flex items-center hover:bg-gray-50 active:bg-gray-100 ${chapter.index === item.index ? 'text-blue-600 font-bold' : 'text-gray-700'}`}
              >
                <span className="text-xs text-gray-400 w-8 inline-block">{item.index + 1}</span>
                <span className="flex-1 truncate text-sm">{item.title}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
