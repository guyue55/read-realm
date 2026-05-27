import { useState, useEffect, useRef, useCallback } from "react";
import { ReaderEngine, type ChapterData } from "@reader/reader-core";
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

function debounce<T extends (...args: unknown[]) => unknown>(func: T, wait: number) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export function useReader(bookId: string) {
  const [chapter, setChapter] = useState<ChapterData | null>(null);
  const [engine, setEngine] = useState<ReaderEngine | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [settings, setSettings] = useState<ReaderSettingsState>(DEFAULT_READER_SETTINGS);

  const [activePanel, setActivePanel] = useState<"toc" | "progress" | "ai" | "settings" | null>(null);
  const [toc, setToc] = useState<{ index: number; title: string }[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [activeTab, setActiveTab] = useState<"toc" | "bookmarks">("toc");
  const [aiSummary, setAiSummary] = useState<string>("");
  const [isAiLoading, setIsAiLoading] = useState(false);

  const togglePanel = useCallback((panel: "toc" | "progress" | "ai" | "settings") => {
    setActivePanel((prev) => (prev === panel ? null : panel));
  }, []);

  const handleNightModeToggle = useCallback(() => {
    setSettings((prev) => {
      const nextTheme: ThemeName = prev.theme === "dark" ? "paper" : "dark";
      const newSettings = { ...prev, theme: nextTheme };
      saveReaderSettings(newSettings);
      engine?.updateSettings(newSettings);
      return newSettings;
    });
  }, [engine]);

  useEffect(() => {
    if (!chapter || !bookId) return;

    const handleScroll = debounce(() => {
      let offset = 0;
      if (settings.pageMode === "scroll") {
        offset = contentRef.current?.scrollTop || window.scrollY;
      } else if (settings.pageMode === "pagination" && contentRef.current) {
        offset = contentRef.current.scrollLeft;
      }

      if (offset > 0) {
        db.progress.put({
          bookId,
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
      if (container) container.removeEventListener("scroll", handleScroll);
      window.removeEventListener("scroll", handleScroll);
    };
  }, [chapter, bookId, settings.pageMode, toc.length]);

  useEffect(() => {
    if (!bookId) return;
    
    const chapterRepo = {
      getChapter: async (id: string, index: number) => {
        const c = await db.chapters.where({ bookId: id, index }).first();
        return c ? { id: c.id, index: c.index, title: c.title, content: c.content } : null;
      },
      getChapterCount: async (id: string) => await db.chapters.where("bookId").equals(id).count(),
      getToc: async (id: string) => {
        const chapters = await db.chapters.where("bookId").equals(id).sortBy("index");
        return chapters.map((c) => ({ index: c.index, title: c.title }));
      },
    };

    const progressRepo = {
      getProgress: async (id: string) => (await db.progress.get(id)) || null,
      saveProgress: async (progress: ReadingProgress) => { await db.progress.put(progress); },
    };

    const reader = new ReaderEngine(bookId, chapterRepo, progressRepo);

    reader.load().then(() => {
      setEngine(reader);
      const currentChapter = reader.getCurrentChapter();
      setChapter(currentChapter);
      const loadedSettings = loadReaderSettings();
      reader.updateSettings(loadedSettings);
      setSettings(loadedSettings);
      chapterRepo.getToc(bookId).then(setToc);
      db.bookmarks.where("bookId").equals(bookId).toArray().then(setBookmarks);

      db.progress.get(bookId).then((progress) => {
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
  }, [bookId]);

  const saveCurrentProgress = useCallback(async (chapterData: ChapterData, offset: number) => {
    if (!bookId) return;
    await db.progress.put({
      bookId,
      chapterId: chapterData.id,
      chapterIndex: chapterData.index,
      offset,
      percentage: toc.length > 0 ? (chapterData.index / toc.length) * 100 : 0,
      updatedAt: new Date().toISOString(),
    });
  }, [bookId, toc.length]);

  const jumpToChapter = useCallback(async (index: number) => {
    if (engine) {
      await engine.loadChapter(index);
      const currentChapter = engine.getCurrentChapter();
      setChapter(currentChapter);
      setActivePanel(null);
      setShowMenu(false);
      if (contentRef.current) {
        contentRef.current.scrollTop = 0;
        contentRef.current.scrollLeft = 0;
      } else {
        window.scrollTo(0, 0);
      }
      if (currentChapter) await saveCurrentProgress(currentChapter, 0);
    }
  }, [engine, saveCurrentProgress]);

  const handleNext = useCallback(async () => {
    if (engine && chapter && chapter.index < toc.length - 1) {
      await jumpToChapter(chapter.index + 1);
    } else {
      alert(strings.reader.endOfBook);
    }
  }, [engine, chapter, toc.length, jumpToChapter]);

  const handlePrev = useCallback(async () => {
    if (engine && chapter && chapter.index > 0) {
      await jumpToChapter(chapter.index - 1);
    } else {
      alert(strings.reader.startOfBook);
    }
  }, [engine, chapter, jumpToChapter]);

  const handlePageNext = useCallback(async () => {
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
  }, [settings.pageMode, handleNext]);

  const handlePagePrev = useCallback(async () => {
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
  }, [settings.pageMode, handlePrev]);

  const addBookmark = useCallback(async () => {
    if (!chapter) return;
    let offset = 0;
    if (contentRef.current) {
      offset = settings.pageMode === "scroll" ? contentRef.current.scrollTop : contentRef.current.scrollLeft;
    } else {
      offset = window.scrollY;
    }

    const bookmark: Bookmark = {
      id: Date.now().toString(),
      bookId,
      chapterIndex: chapter.index,
      offset,
      contentPreview: document.getSelection()?.toString().slice(0, 50) || document.querySelector(".reader-content")?.textContent?.slice(0, 50) || "",
      createdAt: new Date().toISOString(),
    };
    await db.bookmarks.add(bookmark);
    setBookmarks((prev) => [...prev, bookmark]);
    alert(strings.reader.bookmarkAdded);
  }, [chapter, bookId, settings.pageMode]);

  const jumpToBookmark = useCallback(async (bookmark: Bookmark) => {
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
        } else {
          window.scrollTo(0, bookmark.offset);
        }
        if (currentChapter) await saveCurrentProgress(currentChapter, bookmark.offset);
      }, 100);
    }
  }, [engine, settings.pageMode, saveCurrentProgress]);

  const handleSummarize = useCallback(async () => {
    if (!chapter) return;
    setIsAiLoading(true);
    setActivePanel("ai");
    setShowMenu(false);
    try {
      const response = await fetch(apiUrl("/ai/summarize"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: chapter.content, bookId, chapterIndex: chapter.index }),
      });
      const data = await response.json();
      setAiSummary(data.summary);
    } catch (error) {
      console.error("AI Summarize failed:", error);
      setAiSummary(strings.reader.aiError);
    } finally {
      setIsAiLoading(false);
    }
  }, [chapter, bookId]);

  const updateFontSize = useCallback((delta: number) => {
    setSettings((prev) => {
      const newSize = Math.max(14, Math.min(36, prev.fontSize + delta));
      const newSettings = { ...prev, fontSize: newSize };
      saveReaderSettings(newSettings);
      engine?.updateSettings(newSettings);
      return newSettings;
    });
  }, [engine]);

  const updateTheme = useCallback((theme: ThemeName) => {
    setSettings((prev) => {
      const newSettings = { ...prev, theme };
      saveReaderSettings(newSettings);
      engine?.updateSettings(newSettings);
      return newSettings;
    });
  }, [engine]);

  const updatePageMode = useCallback((mode: "scroll" | "pagination") => {
    if (!chapter) return;
    let percentage = 0;
    if (contentRef.current) {
      if (settings.pageMode === "scroll") {
        percentage = contentRef.current.scrollTop / (contentRef.current.scrollHeight - contentRef.current.clientHeight || 1);
      } else {
        percentage = contentRef.current.scrollLeft / (contentRef.current.scrollWidth - contentRef.current.clientWidth || 1);
      }
    }
    
    setSettings((prev) => {
      const newSettings = { ...prev, pageMode: mode };
      saveReaderSettings(newSettings);
      engine?.updateSettings(newSettings);
      return newSettings;
    });

    setTimeout(() => {
      if (contentRef.current) {
        if (mode === "scroll") {
          contentRef.current.scrollTop = percentage * (contentRef.current.scrollHeight - contentRef.current.clientHeight);
        } else {
          contentRef.current.scrollLeft = percentage * (contentRef.current.scrollWidth - contentRef.current.clientWidth);
        }
      }
    }, 150);
  }, [chapter, settings.pageMode, engine]);

  const currentThemeColors = THEMES[settings.theme] || THEMES.paper;
  const isPagination = settings.pageMode === "pagination";

  return {
    chapter,
    contentRef,
    settings,
    showMenu,
    setShowMenu,
    activePanel,
    setActivePanel,
    togglePanel,
    toc,
    bookmarks,
    activeTab,
    setActiveTab,
    aiSummary,
    isAiLoading,
    handleNightModeToggle,
    jumpToChapter,
    handleNext,
    handlePrev,
    handlePageNext,
    handlePagePrev,
    addBookmark,
    jumpToBookmark,
    handleSummarize,
    updateFontSize,
    updateTheme,
    updatePageMode,
    currentThemeColors,
    isPagination,
  };
}
