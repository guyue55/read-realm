'use client';

import { useEffect, useState } from 'react';
import { ReaderEngine, ChapterData } from '@reader/reader-core';
import { db } from '@reader/storage-core';
import type { ReadingProgress, Bookmark } from '@reader/shared-types';
import { THEMES } from '@/styles/themes';
import { strings } from '@/lib/i18n';

// Helper for debouncing scroll events
function debounce<T extends (...args: unknown[]) => unknown>(func: T, wait: number) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export default function ReaderPage({ params }: { params: { bookId: string } }) {
  const [chapter, setChapter] = useState<ChapterData | null>(null);
  const [engine, setEngine] = useState<ReaderEngine | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [settings, setSettings] = useState({
    fontSize: 18,
    lineHeight: 1.7,
    theme: 'paper' as 'paper' | 'sepia' | 'green' | 'dark' | 'black',
    pageMode: 'scroll' as 'scroll' | 'pagination'
  });
  const [showSettings, setShowSettings] = useState(false);
  const [toc, setToc] = useState<{index: number, title: string}[]>([]);
  const [showToc, setShowToc] = useState(false);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [activeTab, setActiveTab] = useState<'toc' | 'bookmarks'>('toc');
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiSummary, setAiSummary] = useState<string>('');
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Automatic progress saving on scroll
  useEffect(() => {
    if (!chapter || !params.bookId || settings.pageMode !== 'scroll') return;

    const handleScroll = debounce(() => {
      const offset = window.scrollY;
      if (offset > 0) {
        db.progress.put({
          bookId: params.bookId,
          chapterId: chapter.id,
          chapterIndex: chapter.index,
          offset,
          percentage: toc.length > 0 ? (chapter.index / toc.length) * 100 : 0,
          updatedAt: new Date().toISOString()
        });
      }
    }, 1000);

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [chapter, params.bookId, settings.pageMode, toc.length]);

  useEffect(() => {
    // Implement repositories using Dexie
    const chapterRepo = {
      getChapter: async (bookId: string, index: number) => {
        const c = await db.chapters.where({ bookId, index }).first();
        return c ? { id: c.id, index: c.index, title: c.title, content: c.content } : null;
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
      const currentChapter = reader.getCurrentChapter();
      setChapter(currentChapter);
      const loadedSettings = reader.getSettings();
      setSettings({
        fontSize: loadedSettings.fontSize,
        lineHeight: loadedSettings.lineHeight,
        theme: loadedSettings.theme as 'paper' | 'sepia' | 'green' | 'dark' | 'black',
        pageMode: loadedSettings.pageMode as 'scroll' | 'pagination'
      });
      chapterRepo.getToc(params.bookId).then(setToc);
      db.bookmarks.where('bookId').equals(params.bookId).toArray().then(setBookmarks);

      // Restore scroll position
      db.progress.get(params.bookId).then(progress => {
        if (currentChapter && progress && progress.chapterIndex === currentChapter.index && progress.offset > 0) {
          setTimeout(() => {
            window.scrollTo(0, progress.offset);
          }, 100);
        }
      });
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

  const addBookmark = async () => {
    if (!chapter) return;
    const offset = window.scrollY;
    const bookmark: Bookmark = {
      id: Date.now().toString(),
      bookId: params.bookId,
      chapterIndex: chapter.index,
      offset,
      contentPreview: document.getSelection()?.toString().slice(0, 50) || 
                      document.querySelector('div.whitespace-pre-wrap')?.textContent?.slice(0, 50) || '',
      createdAt: new Date().toISOString(),
    };
    await db.bookmarks.add(bookmark);
    setBookmarks([...bookmarks, bookmark]);
    alert(strings.reader.bookmarkAdded);
  };

  const jumpToBookmark = async (bookmark: Bookmark) => {
    if (engine) {
      await engine.loadChapter(bookmark.chapterIndex);
      setChapter(engine.getCurrentChapter());
      setShowToc(false);
      setShowMenu(false);
      // Wait for content to render then scroll
      setTimeout(() => {
        window.scrollTo(0, bookmark.offset);
      }, 100);
    }
  };

  const handleSummarize = async () => {
    if (!chapter) return;
    setIsAiLoading(true);
    setShowAiPanel(true);
    setShowMenu(false);
    try {
      const response = await fetch('http://localhost:3001/ai/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: chapter.content,
          bookId: params.bookId,
          chapterIndex: chapter.index
        })
      });
      const data = await response.json();
      setAiSummary(data.summary);
    } catch (error) {
      console.error('AI Summarize failed:', error);
      setAiSummary('AI 总结失败，请检查后端服务是否启动。');
    } finally {
      setIsAiLoading(false);
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

  const updatePageMode = (mode: 'scroll' | 'pagination') => {
    const newSettings = { ...settings, pageMode: mode };
    setSettings(newSettings);
    engine?.updateSettings(newSettings);
  };

  const currentThemeColors = THEMES[settings.theme as keyof typeof THEMES] || THEMES.paper;

  const isPagination = settings.pageMode === 'pagination';

  if (!chapter) return <div className="p-8 text-center text-[#2F2A24]">{strings.reader.loading}</div>;

  return (
    <main 
      className="min-h-screen relative overflow-hidden transition-colors duration-300"
      style={{ backgroundColor: currentThemeColors.bg, color: currentThemeColors.text }}
    >
      {/* Content Area */}
      <div 
        className={`max-w-[760px] mx-auto px-4 pt-12 pb-12 transition-all duration-300 ${
          isPagination ? 'h-screen overflow-x-auto overflow-y-hidden columns-1 w-screen max-w-none px-8 py-12' : 'h-auto overflow-y-auto'
        }`}
        style={{ 
          fontSize: `${settings.fontSize}px`, 
          lineHeight: settings.lineHeight,
          columnWidth: isPagination ? 'calc(100vw - 64px)' : 'auto',
          columnGap: '64px'
        }}
      >
        <h1 className="text-2xl font-bold mb-8">{chapter.title}</h1>
        {/* We use dangerouslySetInnerHTML here because EPUB chapters contain sanitized HTML */}
        <div 
          className="whitespace-pre-wrap break-words" 
          dangerouslySetInnerHTML={{ __html: chapter.content }}
        />

        {/* Navigation Buttons */}
        <div className="mt-12 mb-8 flex justify-between items-center border-t border-gray-100 pt-8 px-4">
          <button 
            onClick={handlePrev}
            className="flex-1 py-4 px-6 bg-gray-50 rounded-xl text-sm font-medium hover:bg-gray-100 active:scale-95 transition-all text-center mr-4"
          >
            {strings.reader.prevChapter}
          </button>
          <button 
            onClick={handleNext}
            className="flex-1 py-4 px-6 bg-blue-50 text-blue-600 rounded-xl text-sm font-bold hover:bg-blue-100 active:scale-95 transition-all text-center ml-4"
          >
            {strings.reader.nextChapter}
          </button>
        </div>
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
        <button onClick={() => window.location.href = '/'} className="mr-4 text-sm font-medium">{strings.reader.backToShelf}</button>
        <span className="truncate flex-1 text-sm font-bold text-center">{chapter.title}</span>
        <button onClick={handleSummarize} className="ml-4 text-sm font-medium text-purple-600">{strings.reader.aiSummary}</button>
        <button onClick={addBookmark} className="ml-4 text-sm font-medium text-blue-600">{strings.reader.bookmark}</button>
      </div>

      {/* Settings Sheet */}
      <div className={`fixed bottom-0 inset-x-0 bg-white shadow-[0_-2px_10_rgba(0,0,0,0.1)] z-30 px-6 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] transition-transform duration-300 ${showSettings ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="flex items-center justify-between mb-8">
          <span className="text-sm font-medium text-gray-500">{strings.reader.fontSize}</span>
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

        <div className="flex items-center justify-between mb-8">
          <span className="text-sm font-medium text-gray-500">{strings.reader.background}</span>
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

        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-medium text-gray-500">{strings.reader.pageMode}</span>
          <div className="flex items-center bg-gray-100 rounded-lg p-1 ml-4 flex-1">
            <button 
              onClick={() => updatePageMode('scroll')}
              className={`flex-1 h-8 flex items-center justify-center text-sm rounded-md transition-all ${settings.pageMode === 'scroll' ? 'bg-white shadow-sm font-bold text-blue-600' : 'text-gray-500'}`}
            >
              {strings.reader.scroll}
            </button>
            <button 
              onClick={() => updatePageMode('pagination')}
              className={`flex-1 h-8 flex items-center justify-center text-sm rounded-md transition-all ${settings.pageMode === 'pagination' ? 'bg-white shadow-sm font-bold text-blue-600' : 'text-gray-500'}`}
            >
              {strings.reader.pagination}
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Toolbar */}
      <div className={`fixed bottom-0 inset-x-0 h-[calc(56px+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] bg-white shadow-[0_-1px_3px_rgba(0,0,0,0.1)] z-20 flex items-center justify-around px-4 transition-transform duration-200 ${showMenu ? 'translate-y-0' : 'translate-y-full'}`}>
        <button 
          onClick={() => { setShowToc(true); setShowMenu(false); }}
          className="text-sm"
        >
          {strings.reader.toc}
        </button>
        <button className="text-sm">{strings.reader.progress}</button>
        <button onClick={handleSummarize} className="text-sm text-purple-600 font-bold">AI</button>
        <button onClick={() => { setShowSettings(true); setShowMenu(false); }} className={`text-sm ${showSettings ? 'text-blue-500 font-bold' : ''}`}>{strings.reader.settings}</button>
        <button className="text-sm">{strings.reader.nightMode}</button>
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
          <div className="border-b">
            <div className="flex p-2">
              <button 
                onClick={() => setActiveTab('toc')}
                className={`flex-1 py-2 text-sm font-bold border-b-2 transition-colors ${activeTab === 'toc' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}
              >
                {strings.reader.toc}
              </button>
              <button 
                onClick={() => setActiveTab('bookmarks')}
                className={`flex-1 py-2 text-sm font-bold border-b-2 transition-colors ${activeTab === 'bookmarks' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}
              >
                {strings.reader.bookmarks}
              </button>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'toc' ? (
              <div>
                <div className="p-4 bg-gray-50 text-xs text-gray-500 uppercase font-bold tracking-wider">
                  {strings.reader.chapterCount.replace('{count}', toc.length.toString())}
                </div>
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
            ) : (
              <div>
                <div className="p-4 bg-gray-50 text-xs text-gray-500 uppercase font-bold tracking-wider">
                  {strings.reader.bookmarkCount.replace('{count}', bookmarks.length.toString())}
                </div>
                {bookmarks.length === 0 ? (
                  <div className="p-8 text-center text-gray-400 text-sm">
                    {strings.reader.noBookmarks}
                  </div>
                ) : (
                  bookmarks.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((bookmark) => (
                    <button
                      key={bookmark.id}
                      onClick={() => jumpToBookmark(bookmark)}
                      className="w-full text-left px-4 py-4 border-b border-gray-50 hover:bg-gray-50 active:bg-gray-100"
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-sm font-bold text-gray-800 truncate flex-1 mr-2">
                          {toc[bookmark.chapterIndex]?.title || `第 ${bookmark.chapterIndex + 1} 章`}
                        </span>
                        <span className="text-[10px] text-gray-400 whitespace-nowrap">
                          {new Date(bookmark.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 line-clamp-2 italic">
                        &quot;{bookmark.contentPreview || strings.reader.noPreview}&quot;...
                      </p>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AI Panel Overlay */}
      {showAiPanel && (
        <div 
          className="fixed inset-0 z-40 bg-black/40 transition-opacity"
          onClick={() => setShowAiPanel(false)}
        />
      )}

      {/* AI Assistant Panel (Right Drawer) */}
      <div className={`fixed inset-y-0 right-0 w-[85%] max-w-md bg-white z-50 shadow-xl transition-transform duration-300 transform ${showAiPanel ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="h-full flex flex-col">
          <div className="p-4 border-b flex items-center justify-between bg-purple-50">
            <h2 className="font-bold text-purple-800 flex items-center">
              <span className="mr-2">✨</span> {strings.reader.aiAssistant}
            </h2>
            <button onClick={() => setShowAiPanel(false)} className="text-gray-400 p-1">✕</button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mb-6">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">{strings.reader.summaryTitle}</h3>
              {isAiLoading ? (
                <div className="flex flex-col items-center py-12">
                  <div className="w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin mb-4"></div>
                  <p className="text-sm text-gray-500">{strings.reader.summarizing}</p>
                </div>
              ) : (
                <div className="prose prose-sm prose-purple">
                  {aiSummary ? (
                    <div className="bg-gray-50 p-4 rounded-xl text-gray-700 leading-relaxed whitespace-pre-wrap">
                      {aiSummary}
                    </div>
                  ) : (
                    <p className="text-center py-8 text-gray-400 italic">{strings.reader.aiPrompt}</p>
                  )}
                </div>
              )}
            </div>

            <div className="mt-8 border-t pt-6">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">{strings.reader.quickQuestions}</h3>
              <div className="grid grid-cols-1 gap-2">
                <button className="text-left p-3 text-sm bg-purple-50 hover:bg-purple-100 rounded-lg text-purple-700 transition-colors">
                  解释本章的关键人物关系
                </button>
                <button className="text-left p-3 text-sm bg-purple-50 hover:bg-purple-100 rounded-lg text-purple-700 transition-colors">
                  这章有哪些重要的情节伏笔？
                </button>
              </div>
            </div>
          </div>
          
          <div className="p-4 border-t bg-gray-50">
            <div className="flex items-center bg-white border rounded-full px-4 py-2 shadow-sm focus-within:border-purple-400 transition-colors">
              <input 
                type="text" 
                placeholder={strings.reader.aiInputPlaceholder}
                className="flex-1 bg-transparent border-none outline-none text-sm py-1"
              />
              <button className="ml-2 text-purple-600 font-bold text-sm">{strings.reader.send}</button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
