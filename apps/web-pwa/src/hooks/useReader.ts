import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type TouchEvent,
} from "react";
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

function debounce<Args extends unknown[]>(
  func: (...args: Args) => void,
  wait: number,
) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return (...args: Args) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

function clampProgress(value: number) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

function computeOverallProgress(
  chapterIndex: number,
  chapterCount: number,
  offsetRatio = 0,
) {
  if (chapterCount <= 0) return 0;
  return clampProgress(
    ((chapterIndex + Math.max(0, Math.min(1, offsetRatio))) / chapterCount) *
      100,
  );
}

function isInteractiveTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest("button, input, a, textarea, select, [role='button']"),
    )
  );
}

function snapPaginationOffset(
  offset: number,
  pageWidth: number,
  maxOffset: number,
) {
  if (pageWidth <= 0) return Math.max(0, Math.min(maxOffset, offset));
  const snappedOffset = Math.round(offset / pageWidth) * pageWidth;
  return Math.max(0, Math.min(maxOffset, snappedOffset));
}

export function useReader(bookId: string) {
  const [chapter, setChapter] = useState<ChapterData | null>(null);
  const [engine, setEngine] = useState<ReaderEngine | null>(null);
  const [showMenu, setShowMenu] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);
  const [settings, setSettings] = useState<ReaderSettingsState>(
    DEFAULT_READER_SETTINGS,
  );
  const [readingProgress, setReadingProgress] = useState(0);
  const touchGestureRef = useRef<{ x: number; y: number } | null>(null);

  const [activePanel, setActivePanel] = useState<
    "toc" | "progress" | "ai" | "settings" | null
  >(null);
  const [toc, setToc] = useState<{ index: number; title: string }[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [activeTab, setActiveTab] = useState<"toc" | "bookmarks">("toc");
  const [aiSummary, setAiSummary] = useState<string>("");
  const [isAiLoading, setIsAiLoading] = useState(false);

  const togglePanel = useCallback(
    (panel: "toc" | "progress" | "ai" | "settings") => {
      setActivePanel((prev) => (prev === panel ? null : panel));
    },
    [],
  );

  const handleNightModeToggle = useCallback(() => {
    setSettings((prev) => {
      const nextTheme: ThemeName = prev.theme === "dark" ? "paper" : "dark";
      const newSettings = { ...prev, theme: nextTheme };
      saveReaderSettings(newSettings);
      engine?.updateSettings(newSettings);
      return newSettings;
    });
  }, [engine]);

  const getOffsetState = useCallback(() => {
    const container = contentRef.current;
    if (!container) {
      return {
        offset: window.scrollY,
        maxOffset: Math.max(
          0,
          document.documentElement.scrollHeight - window.innerHeight,
        ),
      };
    }

    if (settings.pageMode === "pagination") {
      return {
        offset: container.scrollLeft,
        maxOffset: Math.max(0, container.scrollWidth - container.clientWidth),
      };
    }

    return {
      offset: container.scrollTop,
      maxOffset: Math.max(0, container.scrollHeight - container.clientHeight),
    };
  }, [settings.pageMode]);

  const scrollToOffsetRatio = useCallback(
    (ratio: number) => {
      const safeRatio = Math.max(0, Math.min(1, ratio));
      const container = contentRef.current;
      if (!container) {
        const maxOffset = Math.max(
          0,
          document.documentElement.scrollHeight - window.innerHeight,
        );
        const offset = maxOffset * safeRatio;
        window.scrollTo({ top: offset, behavior: "smooth" });
        return offset;
      }

      if (settings.pageMode === "pagination") {
        const maxOffset = Math.max(
          0,
          container.scrollWidth - container.clientWidth,
        );
        const offset = snapPaginationOffset(
          maxOffset * safeRatio,
          container.clientWidth,
          maxOffset,
        );
        container.scrollTo({ left: offset, behavior: "smooth" });
        return offset;
      }

      const offset =
        Math.max(0, container.scrollHeight - container.clientHeight) *
        safeRatio;
      container.scrollTo({ top: offset, behavior: "smooth" });
      return offset;
    },
    [settings.pageMode],
  );

  useEffect(() => {
    if (!chapter || !bookId) return;

    const saveScrollProgress = debounce((offset: number) => {
      db.progress.put({
        bookId,
        chapterId: chapter.id,
        chapterIndex: chapter.index,
        offset,
        percentage: toc.length > 0 ? (chapter.index / toc.length) * 100 : 0,
        updatedAt: new Date().toISOString(),
      });
    }, 1000);

    const handleScroll = () => {
      const { offset, maxOffset } = getOffsetState();
      const offsetRatio = maxOffset > 0 ? offset / maxOffset : 0;
      setReadingProgress(
        computeOverallProgress(chapter.index, toc.length, offsetRatio),
      );
      if (offset > 0) saveScrollProgress(offset);
    };

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
  }, [chapter, bookId, settings.pageMode, toc.length, getOffsetState]);

  useEffect(() => {
    if (settings.pageMode !== "pagination") return;
    const container = contentRef.current;
    if (!container) return;

    const handleWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      const maxOffset = Math.max(
        0,
        container.scrollWidth - container.clientWidth,
      );
      const offset = snapPaginationOffset(
        container.scrollLeft + event.deltaY,
        container.clientWidth,
        maxOffset,
      );
      container.scrollTo({ left: offset, behavior: "smooth" });
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [chapter?.id, settings.pageMode]);

  useEffect(() => {
    if (!bookId) return;

    const chapterRepo = {
      getChapter: async (id: string, index: number) => {
        const c = await db.chapters.where({ bookId: id, index }).first();
        return c
          ? { id: c.id, index: c.index, title: c.title, content: c.content }
          : null;
      },
      getChapterCount: async (id: string) =>
        await db.chapters.where("bookId").equals(id).count(),
      getToc: async (id: string) => {
        const chapters = await db.chapters
          .where("bookId")
          .equals(id)
          .sortBy("index");
        return chapters.map((c) => ({ index: c.index, title: c.title }));
      },
    };

    const progressRepo = {
      getProgress: async (id: string) => (await db.progress.get(id)) || null,
      saveProgress: async (progress: ReadingProgress) => {
        await db.progress.put(progress);
      },
    };

    const reader = new ReaderEngine(bookId, chapterRepo, progressRepo);

    reader.load().then(async () => {
      setEngine(reader);
      const currentChapter = reader.getCurrentChapter();
      setChapter(currentChapter);
      const loadedSettings = loadReaderSettings();
      reader.updateSettings(loadedSettings);
      setSettings(loadedSettings);
      const loadedToc = await chapterRepo.getToc(bookId);
      setToc(loadedToc);
      db.bookmarks.where("bookId").equals(bookId).toArray().then(setBookmarks);

      db.progress.get(bookId).then((progress) => {
        if (
          currentChapter &&
          progress &&
          progress.chapterIndex === currentChapter.index &&
          progress.offset > 0
        ) {
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
            const container = contentRef.current;
            const offset = container
              ? loadedSettings.pageMode === "pagination"
                ? container.scrollLeft
                : container.scrollTop
              : window.scrollY;
            const maxOffset = container
              ? loadedSettings.pageMode === "pagination"
                ? Math.max(0, container.scrollWidth - container.clientWidth)
                : Math.max(0, container.scrollHeight - container.clientHeight)
              : Math.max(
                  0,
                  document.documentElement.scrollHeight - window.innerHeight,
                );
            setReadingProgress(
              computeOverallProgress(
                currentChapter.index,
                loadedToc.length,
                maxOffset > 0 ? offset / maxOffset : 0,
              ),
            );
          }, 100);
        } else if (currentChapter) {
          setReadingProgress(
            computeOverallProgress(currentChapter.index, loadedToc.length, 0),
          );
        }
      });
    });
  }, [bookId]);

  const saveCurrentProgress = useCallback(
    async (chapterData: ChapterData, offset: number) => {
      if (!bookId) return;
      await db.progress.put({
        bookId,
        chapterId: chapterData.id,
        chapterIndex: chapterData.index,
        offset,
        percentage: toc.length > 0 ? (chapterData.index / toc.length) * 100 : 0,
        updatedAt: new Date().toISOString(),
      });
    },
    [bookId, toc.length],
  );

  const jumpToChapter = useCallback(
    async (index: number) => {
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
        if (currentChapter) {
          setReadingProgress(
            computeOverallProgress(currentChapter.index, toc.length || 1, 0),
          );
          await saveCurrentProgress(currentChapter, 0);
        }
      }
    },
    [engine, saveCurrentProgress, toc.length],
  );

  const seekToProgress = useCallback(
    async (progress: number) => {
      if (!engine || !chapter || toc.length === 0) return;

      const safeProgress = clampProgress(progress);
      const scaledPosition = (safeProgress / 100) * toc.length;
      const targetChapterIndex = Math.min(
        toc.length - 1,
        Math.max(0, Math.floor(scaledPosition)),
      );
      const targetOffsetRatio =
        targetChapterIndex === toc.length - 1 && safeProgress >= 100
          ? 1
          : scaledPosition - targetChapterIndex;

      setReadingProgress(safeProgress);

      if (targetChapterIndex !== chapter.index) {
        await engine.loadChapter(targetChapterIndex);
        const targetChapter = engine.getCurrentChapter();
        setChapter(targetChapter);
        setActivePanel(null);

        setTimeout(async () => {
          const offset = scrollToOffsetRatio(targetOffsetRatio);
          if (targetChapter) await saveCurrentProgress(targetChapter, offset);
        }, 120);
        return;
      }

      const offset = scrollToOffsetRatio(targetOffsetRatio);
      await saveCurrentProgress(chapter, offset);
    },
    [chapter, engine, saveCurrentProgress, scrollToOffsetRatio, toc.length],
  );

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
        contentRef.current.scrollTo({
          left: scrollLeft + clientWidth,
          behavior: "smooth",
        });
        return;
      }
    } else if (!isPagination && contentRef.current) {
      const { scrollTop, clientHeight, scrollHeight } = contentRef.current;
      if (scrollTop + clientHeight < scrollHeight - 20) {
        contentRef.current.scrollTo({
          top: scrollTop + clientHeight * 0.8,
          behavior: "smooth",
        });
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
        contentRef.current.scrollTo({
          left: scrollLeft - clientWidth,
          behavior: "smooth",
        });
        return;
      }
    } else if (!isPagination && contentRef.current) {
      const { scrollTop, clientHeight } = contentRef.current;
      if (scrollTop > 20) {
        contentRef.current.scrollTo({
          top: scrollTop - clientHeight * 0.8,
          behavior: "smooth",
        });
        return;
      }
    }
    await handlePrev();
  }, [settings.pageMode, handlePrev]);

  const handleContentTouchStart = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      if (isInteractiveTarget(event.target) || activePanel) {
        touchGestureRef.current = null;
        return;
      }

      const touch = event.touches[0];
      if (!touch) return;
      touchGestureRef.current = { x: touch.clientX, y: touch.clientY };
    },
    [activePanel],
  );

  const handleContentTouchEnd = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      if (settings.pageMode !== "pagination" || !touchGestureRef.current)
        return;

      const start = touchGestureRef.current;
      touchGestureRef.current = null;
      const touch = event.changedTouches[0];
      if (!touch) return;

      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      if (Math.max(absX, absY) < 56) return;

      if (absX > absY * 1.15) {
        void (deltaX < 0 ? handlePageNext() : handlePagePrev());
        return;
      }

      if (absY > absX * 1.15) {
        void (deltaY < 0 ? handlePageNext() : handlePagePrev());
      }
    },
    [handlePageNext, handlePagePrev, settings.pageMode],
  );

  const addBookmark = useCallback(async () => {
    if (!chapter) return;
    let offset = 0;
    if (contentRef.current) {
      offset =
        settings.pageMode === "scroll"
          ? contentRef.current.scrollTop
          : contentRef.current.scrollLeft;
    } else {
      offset = window.scrollY;
    }

    const bookmark: Bookmark = {
      id: Date.now().toString(),
      bookId,
      chapterIndex: chapter.index,
      offset,
      contentPreview:
        document.getSelection()?.toString().slice(0, 50) ||
        document.querySelector(".reader-content")?.textContent?.slice(0, 50) ||
        "",
      createdAt: new Date().toISOString(),
    };
    await db.bookmarks.add(bookmark);
    setBookmarks((prev) => [...prev, bookmark]);
    alert(strings.reader.bookmarkAdded);
  }, [chapter, bookId, settings.pageMode]);

  const jumpToBookmark = useCallback(
    async (bookmark: Bookmark) => {
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
          if (currentChapter)
            await saveCurrentProgress(currentChapter, bookmark.offset);
        }, 100);
      }
    },
    [engine, settings.pageMode, saveCurrentProgress],
  );

  const handleSummarize = useCallback(async () => {
    if (!chapter) return;
    setIsAiLoading(true);
    setActivePanel("ai");
    setShowMenu(false);
    try {
      const response = await fetch(apiUrl("/ai/summarize"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: chapter.content,
          bookId,
          chapterIndex: chapter.index,
        }),
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

  const updateFontSize = useCallback(
    (delta: number) => {
      setSettings((prev) => {
        const newSize = Math.max(14, Math.min(36, prev.fontSize + delta));
        const newSettings = { ...prev, fontSize: newSize };
        saveReaderSettings(newSettings);
        engine?.updateSettings(newSettings);
        return newSettings;
      });
    },
    [engine],
  );

  const updateTheme = useCallback(
    (theme: ThemeName) => {
      setSettings((prev) => {
        const newSettings = { ...prev, theme };
        saveReaderSettings(newSettings);
        engine?.updateSettings(newSettings);
        return newSettings;
      });
    },
    [engine],
  );

  const updatePageMode = useCallback(
    (mode: "scroll" | "pagination") => {
      if (!chapter) return;
      let percentage = 0;
      if (contentRef.current) {
        if (settings.pageMode === "scroll") {
          percentage =
            contentRef.current.scrollTop /
            (contentRef.current.scrollHeight -
              contentRef.current.clientHeight || 1);
        } else {
          percentage =
            contentRef.current.scrollLeft /
            (contentRef.current.scrollWidth - contentRef.current.clientWidth ||
              1);
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
            contentRef.current.scrollTop =
              percentage *
              (contentRef.current.scrollHeight -
                contentRef.current.clientHeight);
          } else {
            contentRef.current.scrollLeft =
              percentage *
              (contentRef.current.scrollWidth - contentRef.current.clientWidth);
          }
        }
      }, 150);
    },
    [chapter, settings.pageMode, engine],
  );

  const currentThemeColors = THEMES[settings.theme] || THEMES.paper;
  const isPagination = settings.pageMode === "pagination";

  return {
    chapter,
    contentRef,
    handleContentTouchStart,
    handleContentTouchEnd,
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
    seekToProgress,
    readingProgress,
    currentThemeColors,
    isPagination,
  };
}
