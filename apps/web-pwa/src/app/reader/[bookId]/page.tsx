"use client";

import { useEffect, useState, useRef } from "react";
import { ReaderEngine, ChapterData } from "@reader/reader-core";
import { db } from "@reader/storage-core";
import type { ReadingProgress, Bookmark } from "@reader/shared-types";
import { THEMES, type ThemeName } from "@/styles/themes";
import { apiUrl } from "@/lib/api";
import { strings } from "@/lib/i18n";
import {
  DEFAULT_READER_SETTINGS,
  loadReaderSettings,
  saveReaderSettings,
  type ReaderSettingsState,
} from "@/lib/reader-settings";
import { TocDrawer } from "@/components/reader/TocDrawer";
import { AIReaderPanel } from "@/components/reader/AIReaderPanel";
import { SettingsSheet } from "@/components/reader/SettingsSheet";
import { ReaderTopBar } from "@/components/reader/ReaderTopBar";
import { ReaderBottomBar } from "@/components/reader/ReaderBottomBar";

function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number,
) {
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
  const contentRef = useRef<HTMLDivElement>(null);
  const [settings, setSettings] = useState<ReaderSettingsState>(DEFAULT_READER_SETTINGS);
  
  // Mobile Overlay States
  const [activePanel, setActivePanel] = useState<"toc" | "progress" | "ai" | "settings" | null>(null);
  
  // Data States
  const [toc, setToc] = useState<{ index: number; title: string }[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [activeTab, setActiveTab] = useState<"toc" | "bookmarks">("toc");
  const [aiSummary, setAiSummary] = useState<string>("");
  const [isAiLoading, setIsAiLoading] = useState(false);

  const togglePanel = (panel: "toc" | "progress" | "ai" | "settings") => {
    setActivePanel(activePanel === panel ? null : panel);
  };

  const handleNightModeToggle = () => {
    const nextTheme = settings.theme === "dark" ? "paper" : "dark";
    updateTheme(nextTheme);
  };

  useEffect(() => {
    if (!chapter || !params.bookId) return;

    const handleScroll = debounce(() => {
      let offset = 0;
      if (settings.pageMode === "scroll") {
        // Desktop or Mobile scroll
        offset = contentRef.current?.scrollTop || window.scrollY;
      } else if (settings.pageMode === "pagination" && contentRef.current) {
        offset = contentRef.current.scrollLeft;
      }

      if (offset > 0) {
        db.progress.put({
          bookId: params.bookId,
          chapterId: chapter.id,
          chapterIndex: chapter.index,
          offset,
          percentage: toc.length > 0 ? (chapter.index / toc.length) * 100 : 0,
          updatedAt: new Date().toISOString(),
        });
      }
    }, 1000);

    const container = contentRef.current;
    if (container) {
      container.addEventListener("scroll", handleScroll);
    } else if (settings.pageMode === "scroll") {
       window.addEventListener("scroll", handleScroll);
    }

    return () => {
      if (container) {
        container.removeEventListener("scroll", handleScroll);
      }
      window.removeEventListener("scroll", handleScroll);
    };
  }, [chapter, params.bookId, settings.pageMode, toc.length]);

  useEffect(() => {
    const chapterRepo = {
      getChapter: async (bookId: string, index: number) => {
        const c = await db.chapters.where({ bookId, index }).first();
        return c ? { id: c.id, index: c.index, title: c.title, content: c.content } : null;
      },
      getChapterCount: async (bookId: string) => await db.chapters.where("bookId").equals(bookId).count(),
      getToc: async (bookId: string) => {
        const chapters = await db.chapters.where("bookId").equals(bookId).sortBy("index");
        return chapters.map((c) => ({ index: c.index, title: c.title }));
      },
    };

    const progressRepo = {
      getProgress: async (bookId: string) => (await db.progress.get(bookId)) || null,
      saveProgress: async (progress: ReadingProgress) => { await db.progress.put(progress); },
    };

    const reader = new ReaderEngine(params.bookId, chapterRepo, progressRepo);

    reader.load().then(() => {
      setEngine(reader);
      const currentChapter = reader.getCurrentChapter();
      setChapter(currentChapter);
      const loadedSettings = loadReaderSettings();
      reader.updateSettings(loadedSettings);
      setSettings(loadedSettings);
      chapterRepo.getToc(params.bookId).then(setToc);
      db.bookmarks.where("bookId").equals(params.bookId).toArray().then(setBookmarks);

      db.progress.get(params.bookId).then((progress) => {
        if (currentChapter && progress && progress.chapterIndex === currentChapter.index && progress.offset > 0) {
          setTimeout(() => {
            if (contentRef.current) {
                if (loadedSettings.pageMode === "scroll") {
                    contentRef.current.scrollTop = progress.offset;
                } else {
                    contentRef.current.scrollLeft = progress.offset;
                }
            } else {
                window.scrollTo(0, progress.offset);
            }
          }, 100);
        }
      });
    });
  }, [params.bookId]);

  const saveCurrentProgress = async (chapterData: ChapterData, offset: number) => {
    if (!params.bookId) return;
    await db.progress.put({
      bookId: params.bookId,
      chapterId: chapterData.id,
      chapterIndex: chapterData.index,
      offset,
      percentage: toc.length > 0 ? (chapterData.index / toc.length) * 100 : 0,
      updatedAt: new Date().toISOString(),
    });
  };

  const jumpToChapter = async (index: number) => {
    if (engine) {
      await engine.loadChapter(index);
      const currentChapter = engine.getCurrentChapter();
      setChapter(currentChapter);
      setActivePanel(null);
      setShowMenu(false);
      if (contentRef.current) {
          contentRef.current.scrollTop = 0;
          contentRef.current.scrollLeft = 0;
      }
      if (currentChapter) await saveCurrentProgress(currentChapter, 0);
    }
  };

  const handleNext = async () => {
      if (engine && chapter && chapter.index < toc.length - 1) {
          await jumpToChapter(chapter.index + 1);
      } else {
          alert(strings.reader.endOfBook);
      }
  };
  
  const handlePrev = async () => {
      if (engine && chapter && chapter.index > 0) {
          await jumpToChapter(chapter.index - 1);
      } else {
          alert(strings.reader.startOfBook);
      }
  };

  const handlePageNext = async () => {
    const isPagination = settings.pageMode === "pagination";
    if (isPagination && contentRef.current) {
      const { scrollLeft, clientWidth, scrollWidth } = contentRef.current;
      if (Math.ceil(scrollLeft + clientWidth) < scrollWidth - 20) {
        contentRef.current.scrollTo({ left: scrollLeft + clientWidth, behavior: "smooth" });
        return;
      }
    } else if (!isPagination && contentRef.current) {
      const { scrollTop, clientHeight, scrollHeight } = contentRef.current;
      if (scrollTop + clientHeight < scrollHeight - 20) {
        contentRef.current.scrollTo({ top: scrollTop + clientHeight * 0.8, behavior: "smooth" });
        return;
      }
    }
    await handleNext();
  };

  const handlePagePrev = async () => {
    const isPagination = settings.pageMode === "pagination";
    if (isPagination && contentRef.current) {
      const { scrollLeft, clientWidth } = contentRef.current;
      if (scrollLeft > 20) {
        contentRef.current.scrollTo({ left: scrollLeft - clientWidth, behavior: "smooth" });
        return;
      }
    } else if (!isPagination && contentRef.current) {
      const { scrollTop, clientHeight } = contentRef.current;
      if (scrollTop > 20) {
        contentRef.current.scrollTo({ top: scrollTop - clientHeight * 0.8, behavior: "smooth" });
        return;
      }
    }
    await handlePrev();
  };

  const addBookmark = async () => {
    if (!chapter) return;
    let offset = 0;
    if (contentRef.current) {
        offset = settings.pageMode === "scroll" ? contentRef.current.scrollTop : contentRef.current.scrollLeft;
    }

    const bookmark: Bookmark = {
      id: Date.now().toString(),
      bookId: params.bookId,
      chapterIndex: chapter.index,
      offset,
      contentPreview: document.getSelection()?.toString().slice(0, 50) || document.querySelector(".reader-content")?.textContent?.slice(0, 50) || "",
      createdAt: new Date().toISOString(),
    };
    await db.bookmarks.add(bookmark);
    setBookmarks([...bookmarks, bookmark]);
    alert(strings.reader.bookmarkAdded);
  };

  const jumpToBookmark = async (bookmark: Bookmark) => {
    if (engine) {
      await engine.loadChapter(bookmark.chapterIndex);
      const currentChapter = engine.getCurrentChapter();
      setChapter(currentChapter);
      setActivePanel(null);
      setShowMenu(false);
      setTimeout(async () => {
        if (contentRef.current) {
            if (settings.pageMode === "scroll") {
                contentRef.current.scrollTop = bookmark.offset;
            } else {
                contentRef.current.scrollLeft = bookmark.offset;
            }
        }
        if (currentChapter) await saveCurrentProgress(currentChapter, bookmark.offset);
      }, 100);
    }
  };

  const handleSummarize = async () => {
    if (!chapter) return;
    setIsAiLoading(true);
    setActivePanel("ai");
    setShowMenu(false);
    try {
      const response = await fetch(apiUrl("/ai/summarize"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: chapter.content, bookId: params.bookId, chapterIndex: chapter.index }),
      });
      const data = await response.json();
      setAiSummary(data.summary);
    } catch (error) {
      console.error("AI Summarize failed:", error);
      setAiSummary(strings.reader.aiError);
    } finally {
      setIsAiLoading(false);
    }
  };

  const updateFontSize = (delta: number) => {
    const newSize = Math.max(14, Math.min(36, settings.fontSize + delta));
    const newSettings = { ...settings, fontSize: newSize };
    setSettings(newSettings);
    saveReaderSettings(newSettings);
    engine?.updateSettings(newSettings);
  };

  const updateTheme = (theme: ThemeName) => {
    const newSettings = { ...settings, theme };
    setSettings(newSettings);
    saveReaderSettings(newSettings);
    engine?.updateSettings(newSettings);
  };

  const updatePageMode = (mode: "scroll" | "pagination") => {
    if (!chapter) return;
    let percentage = 0;
    if (contentRef.current) {
        if (settings.pageMode === "scroll") {
            percentage = contentRef.current.scrollTop / (contentRef.current.scrollHeight - contentRef.current.clientHeight || 1);
        } else {
            percentage = contentRef.current.scrollLeft / (contentRef.current.scrollWidth - contentRef.current.clientWidth || 1);
        }
    }
    const newSettings = { ...settings, pageMode: mode };
    setSettings(newSettings);
    saveReaderSettings(newSettings);
    engine?.updateSettings(newSettings);

    setTimeout(() => {
      if (contentRef.current) {
          if (mode === "scroll") {
              contentRef.current.scrollTop = percentage * (contentRef.current.scrollHeight - contentRef.current.clientHeight);
          } else {
              contentRef.current.scrollLeft = percentage * (contentRef.current.scrollWidth - contentRef.current.clientWidth);
          }
      }
    }, 150);
  };

  if (!chapter) return <div className="flex h-screen items-center justify-center text-[#2F2A24]">{strings.reader.loading}</div>;

  const currentThemeColors = THEMES[settings.theme] || THEMES.paper;
  const isPagination = settings.pageMode === "pagination";

  return (
    <main
      className="fixed inset-0 overflow-hidden transition-colors duration-300 xl:grid xl:grid-cols-[240px_minmax(0,1fr)_338px] xl:max-w-[1280px] xl:mx-auto"
      style={{ backgroundColor: currentThemeColors.bg, color: currentThemeColors.text }}
    >
      {/* Desktop TOC Sidebar (Hidden on Mobile) */}
      <div className="hidden xl:block h-full">
        <TocDrawer
            toc={toc} bookmarks={bookmarks} currentChapterIndex={chapter.index}
            activeTab={activeTab} setActiveTab={setActiveTab}
            onJumpToChapter={jumpToChapter} onJumpToBookmark={jumpToBookmark}
        />
      </div>

      {/* Main Reading Area (Center Column on Desktop) */}
      <div className="relative h-full flex flex-col w-full bg-inherit">
        {/* Desktop Top Toolbar */}
        <div className="hidden xl:block">
            <ReaderTopBar
                title={chapter.title} isVisible={true} isDesktop={true}
                onBack={() => window.location.href = "/"}
                onSummarize={handleSummarize} onBookmark={addBookmark} onSettings={() => setActivePanel("settings")}
            />
        </div>

        {/* Mobile Top Toolbar Overlay */}
        <div className="xl:hidden">
            <ReaderTopBar
                title={chapter.title} isVisible={showMenu} isDesktop={false}
                onBack={() => window.location.href = "/"}
                onSummarize={handleSummarize} onBookmark={addBookmark} onSettings={() => togglePanel("settings")}
            />
        </div>

        {/* Scrollable / Paginable Content Canvas */}
        <div
          ref={contentRef}
          className={`flex-1 relative ${
            isPagination
              ? "overflow-x-auto overflow-y-hidden"
              : "overflow-y-auto overflow-x-hidden"
          } transition-all duration-300`}
          style={{ scrollBehavior: "smooth" }}
        >
          <div
            className={`max-w-[820px] mx-auto px-6 pt-12 pb-[120px] xl:px-12`}
            style={{
                fontSize: `${settings.fontSize}px`,
                lineHeight: settings.lineHeight,
                columnWidth: isPagination ? "calc(100vw - 48px)" : "auto",
                columnGap: "48px",
                height: isPagination ? "100%" : "auto"
            }}
          >
            <h1 className="text-2xl font-bold mb-8">{chapter.title}</h1>
            <div
              className="reader-content whitespace-pre-wrap break-words [&_p]:break-inside-avoid [&_p]:mb-4"
              dangerouslySetInnerHTML={{ __html: chapter.content }}
            />
            {/* Nav Buttons (Scroll mode end) */}
            {!isPagination && (
                <div className="mt-12 flex justify-between items-center border-t border-[rgba(80,65,45,0.12)] pt-8 relative z-10">
                    <button onClick={handlePrev} className="px-6 py-3 bg-[rgba(80,65,45,0.04)] rounded-full text-sm hover:bg-[rgba(80,65,45,0.08)] transition-colors">{strings.reader.prevChapter}</button>
                    <button onClick={handleNext} className="px-6 py-3 bg-[#EEF2E9] text-[#678055] font-bold rounded-full text-sm hover:bg-[#DDEBD6] transition-colors">{strings.reader.nextChapter}</button>
                </div>
            )}
          </div>
        </div>

        {/* Mobile Tap Zones */}
        <div className="absolute inset-0 z-10 flex pointer-events-none xl:hidden">
          <div className="w-1/4 h-full pointer-events-auto" onClick={handlePagePrev} />
          <div className="w-2/4 h-full pointer-events-auto" onClick={() => { setShowMenu(!showMenu); setActivePanel(null); }} />
          <div className="w-1/4 h-full pointer-events-auto" onClick={handlePageNext} />
        </div>

        {/* Mobile Bottom Bar Overlay */}
        <div className="xl:hidden">
            <ReaderBottomBar
                isVisible={showMenu} activePanel={activePanel}
                onToggleToc={() => togglePanel("toc")}
                onToggleProgress={() => togglePanel("progress")}
                onToggleAi={() => handleSummarize()}
                onToggleSettings={() => togglePanel("settings")}
                onToggleNightMode={handleNightModeToggle}
            />
        </div>
      </div>

      {/* Desktop AI Sidebar (Right Column) */}
      <div className="hidden xl:block h-full">
         <AIReaderPanel isAiLoading={isAiLoading} aiSummary={aiSummary} isMobileDrawer={false} />
      </div>

      {/* Mobile Drawers & Overlays (Hidden on Desktop) */}
      <div className="xl:hidden">
          {/* Backdrop */}
          {activePanel && (
            <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setActivePanel(null)} />
          )}

          {/* TOC Drawer */}
          <div className={`fixed inset-y-0 left-0 w-4/5 max-w-sm bg-white z-50 shadow-xl transition-transform duration-300 ${activePanel === "toc" ? "translate-x-0" : "-translate-x-full"}`}>
            <TocDrawer toc={toc} bookmarks={bookmarks} currentChapterIndex={chapter.index} activeTab={activeTab} setActiveTab={setActiveTab} onJumpToChapter={jumpToChapter} onJumpToBookmark={jumpToBookmark} isMobileDrawer={true} onClose={() => setActivePanel(null)} />
          </div>

          {/* AI Drawer */}
          <div className={`fixed inset-y-0 right-0 w-[85%] max-w-md bg-white z-50 shadow-xl transition-transform duration-300 ${activePanel === "ai" ? "translate-x-0" : "translate-x-full"}`}>
            <AIReaderPanel isAiLoading={isAiLoading} aiSummary={aiSummary} isMobileDrawer={true} onClose={() => setActivePanel(null)} />
          </div>

          {/* Settings Sheet */}
          <div className={`fixed bottom-0 inset-x-0 bg-white z-50 transition-transform duration-300 rounded-t-[24px] overflow-hidden ${activePanel === "settings" ? "translate-y-0" : "translate-y-full"}`}>
            <SettingsSheet settings={settings} updateFontSize={updateFontSize} updateTheme={updateTheme} updatePageMode={updatePageMode} isMobileSheet={true} onClose={() => setActivePanel(null)} />
          </div>

          {/* Progress Sheet */}
          <div className={`fixed bottom-0 inset-x-0 bg-[rgba(255,252,245,0.96)] z-50 px-6 pt-8 pb-[calc(2rem+env(safe-area-inset-bottom))] transition-transform duration-300 shadow-[0_-4px_20px_rgba(80,65,45,0.08)] rounded-t-[24px] ${activePanel === "progress" ? "translate-y-0" : "translate-y-full"}`}>
             <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-[#2F2A24]">阅读进度</h3>
                <button onClick={() => setActivePanel(null)} className="text-[#6F665B] p-1">✕</button>
             </div>
             <div className="w-full bg-[rgba(80,65,45,0.08)] h-2 rounded-full mb-4">
               <div className="bg-[#678055] h-2 rounded-full" style={{ width: `${((chapter?.index || 0) / (toc.length || 1)) * 100}%` }} />
             </div>
             <div className="flex justify-between text-sm text-[#6F665B]">
               <span>{chapter?.title}</span>
               <span>{(chapter?.index || 0) + 1} / {toc.length} 章</span>
             </div>
          </div>
      </div>
      
      {/* Desktop Settings Modal Overlay */}
      {activePanel === "settings" && (
         <div className="hidden xl:flex fixed inset-0 z-50 bg-black/20 items-center justify-center" onClick={() => setActivePanel(null)}>
             <div onClick={e => e.stopPropagation()}>
                <SettingsSheet settings={settings} updateFontSize={updateFontSize} updateTheme={updateTheme} updatePageMode={updatePageMode} isMobileSheet={false} />
             </div>
         </div>
      )}
    </main>
  );
}