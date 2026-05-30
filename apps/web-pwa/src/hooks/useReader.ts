import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type TouchEvent,
} from "react";
import { ReaderEngine, type ChapterData } from "@reader/reader-core";
import { Dexie, db } from "@reader/storage-core";
import type { ReadingProgress, Bookmark } from "@reader/shared-types";
import { GestureRecognizer } from "@reader/gesture-core";
import { THEMES, type ThemeName } from "@/styles/themes";
import { apiUrl } from "@/lib/api";
import { strings } from "@/lib/i18n";
import {
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

function throttle<Args extends unknown[]>(
  func: (...args: Args) => void,
  limit: number,
) {
  let lastFunc: ReturnType<typeof setTimeout> | null = null;
  let lastRan: number = 0;
  return (...args: Args) => {
    const now = Date.now();
    if (!lastRan) {
      func(...args);
      lastRan = now;
    } else {
      if (lastFunc) clearTimeout(lastFunc);
      const remaining = limit - (now - lastRan);
      if (remaining <= 0) {
        func(...args);
        lastRan = now;
      } else {
        lastFunc = setTimeout(() => {
          func(...args);
          lastRan = Date.now();
          lastFunc = null;
        }, remaining);
      }
    }
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

/**
 * 极客级自适应布局稳定判定滚动定位器 (Layout Settle Restorer)
 * 监听 scroll 容器的 scrollHeight 和 scrollWidth，仅在尺寸连续 3 帧完全静止稳定时，
 * 执行高精度 scrollTop / scrollLeft 还原与最终 readingProgress 换算。
 * 杜绝传统 setTimeout 带来的进度恢复漂移、闪跳或被物理裁剪。
 */
function restoreScrollPositionStable(
  container: HTMLDivElement | null,
  targetOffset: number,
  pageMode: "scroll" | "pagination",
  onSettled: (offset: number, maxOffset: number) => void,
) {
  if (!container) {
    onSettled(targetOffset, 0);
    return () => {};
  }

  let lastHeight = 0;
  let lastWidth = 0;
  let stableFrames = 0;
  let rafId = 0;
  let attempts = 0;
  const maxAttempts = 120; // 最多检测 120 帧 (约 2 秒)，防止无限循环

  const check = () => {
    attempts++;
    const currentHeight = container.scrollHeight;
    const currentWidth = container.scrollWidth;

    if (
      currentHeight > 0 &&
      currentWidth > 0 &&
      currentHeight === lastHeight &&
      currentWidth === lastWidth
    ) {
      stableFrames++;
    } else {
      stableFrames = 0;
      lastHeight = currentHeight;
      lastWidth = currentWidth;
    }

    if (stableFrames >= 3 || attempts >= maxAttempts) {
      // 布局已彻底静止，安全执行精准物理定位
      if (pageMode === "scroll") {
        container.scrollTop = targetOffset;
      } else {
        container.scrollLeft = targetOffset;
      }

      // 获取最终确切的物理偏置
      const finalOffset = pageMode === "scroll" ? container.scrollTop : container.scrollLeft;
      const maxOffset = pageMode === "scroll"
        ? Math.max(0, container.scrollHeight - container.clientHeight)
        : Math.max(0, container.scrollWidth - container.clientWidth);

      onSettled(finalOffset, maxOffset);
    } else {
      rafId = requestAnimationFrame(check);
    }
  };

  rafId = requestAnimationFrame(check);
  return () => {
    if (rafId) cancelAnimationFrame(rafId);
  };
}

/**
 * 极客级自适应比例布局稳定定位器 (Layout Ratio Settle Restorer)
 * 循环监听容器的 scrollHeight 和 scrollWidth，当布局连续 3 帧完全静止稳定时，
 * 根据传入的百分比 ratio，精准写入 scrollTop / scrollLeft。
 * 能够完美解决调整字号、字体、pageMode 切换等导致的行位置漂移。
 */
function restoreScrollByRatioStable(
  container: HTMLDivElement | null,
  ratio: number,
  pageMode: "scroll" | "pagination",
  onSettled: (offset: number, maxOffset: number) => void,
) {
  if (!container) {
    onSettled(0, 0);
    return () => {};
  }

  let lastHeight = 0;
  let lastWidth = 0;
  let stableFrames = 0;
  let rafId = 0;
  let attempts = 0;
  const maxAttempts = 120;

  const check = () => {
    attempts++;
    const currentHeight = container.scrollHeight;
    const currentWidth = container.scrollWidth;

    if (
      currentHeight > 0 &&
      currentWidth > 0 &&
      currentHeight === lastHeight &&
      currentWidth === lastWidth
    ) {
      stableFrames++;
    } else {
      stableFrames = 0;
      lastHeight = currentHeight;
      lastWidth = currentWidth;
    }

    if (stableFrames >= 3 || attempts >= maxAttempts) {
      const maxOffset = pageMode === "scroll"
        ? Math.max(0, container.scrollHeight - container.clientHeight)
        : Math.max(0, container.scrollWidth - container.clientWidth);

      const targetOffset = ratio * maxOffset;

      if (pageMode === "scroll") {
        container.scrollTop = targetOffset;
      } else {
        container.scrollLeft = targetOffset;
      }

      onSettled(targetOffset, maxOffset);
    } else {
      rafId = requestAnimationFrame(check);
    }
  };

  rafId = requestAnimationFrame(check);
  return () => {
    if (rafId) cancelAnimationFrame(rafId);
  };
}

/**
 * 极简高雅微震动反馈 (Tactile Haptic Feedback)
 * 物理轻敲：利用 Web Vibration API 派发极微弱物理轻颤，提升阅读拟物质感。
 */
function triggerHapticFeedback(ms = 12) {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    try {
      navigator.vibrate(ms);
    } catch {
      // 忽略安全策略可能拦截的异常
    }
  }
}

export function useReader(bookId: string) {
  const [chapter, setChapter] = useState<ChapterData | null>(null);
  const [isPositionRestored, setIsPositionRestored] = useState(false);
  const [engine, setEngine] = useState<ReaderEngine | null>(null);
  const [showMenu, setShowMenu] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);
  const [settings, setSettings] = useState<ReaderSettingsState>(() =>
    loadReaderSettings(),
  );
  const [readingProgress, setReadingProgress] = useState(0);
  const throttledSetReadingProgressRef = useRef(
    throttle((progress: number) => {
      setReadingProgress(progress);
    }, 150),
  );
  const touchGestureRef = useRef<{ x: number; y: number } | null>(null);
  const recognizerRef = useRef(new GestureRecognizer());
  const touchTimeRef = useRef<number>(0);

  const [toast, setToast] = useState<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingProgressRef = useRef<{
    bookId: string;
    chapterId: string;
    chapterIndex: number;
    offset: number;
  } | null>(null);

  const showToast = useCallback((msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
    }, 2500);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

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
      const nowIso = new Date().toISOString();
      db.progress.put({
        bookId,
        chapterId: chapter.id,
        chapterIndex: chapter.index,
        offset,
        percentage: toc.length > 0 ? (chapter.index / toc.length) * 100 : 0,
        updatedAt: nowIso,
      }).then(() => {
        void db.books.update(bookId, { lastReadAt: nowIso }).catch((err) => {
          console.error("Failed to update lastReadAt on scroll progress save:", err);
        });
        if (
          pendingProgressRef.current &&
          pendingProgressRef.current.offset === offset &&
          pendingProgressRef.current.chapterId === chapter.id
        ) {
          pendingProgressRef.current = null;
        }
      }).catch((err) => {
        console.error("Failed to auto-save scroll progress:", err);
      });
    }, 1000);

    const handleScroll = () => {
      const { offset, maxOffset } = getOffsetState();
      const offsetRatio = maxOffset > 0 ? offset / maxOffset : 0;
      const overallProgress = computeOverallProgress(chapter.index, toc.length, offsetRatio);
      throttledSetReadingProgressRef.current(overallProgress);
      if (offset > 0) {
        pendingProgressRef.current = {
          bookId,
          chapterId: chapter.id,
          chapterIndex: chapter.index,
          offset,
        };
        saveScrollProgress(offset);
      }
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

  // 强落盘保障机制 (一)：处理 Hook/组件 卸载时的进度刷盘
  useEffect(() => {
    return () => {
      if (pendingProgressRef.current) {
        const { bookId: pid, chapterId, chapterIndex, offset } = pendingProgressRef.current;
        pendingProgressRef.current = null;
        const nowIso = new Date().toISOString();
        void db.progress.put({
          bookId: pid,
          chapterId,
          chapterIndex,
          offset,
          percentage: toc.length > 0 ? (chapterIndex / toc.length) * 100 : 0,
          updatedAt: nowIso,
        }).then(() => {
          void db.books.update(pid, { lastReadAt: nowIso }).catch((err) => {
            console.error("Failed to update lastReadAt on Hook unmount:", err);
          });
        }).catch((err) => {
          console.error("Failed to force save reader progress on Hook unmount:", err);
        });
      }
    };
  }, [toc.length]);

  // 强落盘保障机制 (二)：处理页面隐藏 (pagehide)、即将卸载 (beforeunload) 时的进度刷盘
  useEffect(() => {
    const forceFlushProgress = () => {
      if (pendingProgressRef.current) {
        const { bookId: pid, chapterId, chapterIndex, offset } = pendingProgressRef.current;
        pendingProgressRef.current = null;
        const nowIso = new Date().toISOString();
        void db.progress.put({
          bookId: pid,
          chapterId,
          chapterIndex,
          offset,
          percentage: toc.length > 0 ? (chapterIndex / toc.length) * 100 : 0,
          updatedAt: nowIso,
        }).then(() => {
          void db.books.update(pid, { lastReadAt: nowIso }).catch((err) => {
            console.error("Failed to update lastReadAt on page exit:", err);
          });
        }).catch((err) => {
          console.error("Failed to force save reader progress on page exit:", err);
        });
      }
    };

    window.addEventListener("pagehide", forceFlushProgress);
    window.addEventListener("beforeunload", forceFlushProgress);
    return () => {
      window.removeEventListener("pagehide", forceFlushProgress);
      window.removeEventListener("beforeunload", forceFlushProgress);
    };
  }, [toc.length]);

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
        const book = await db.books.get(id);
        if (book?.toc && book.toc.length > 0) {
          return book.toc;
        }

        // 向前兼容老书籍 fallback 方案：整表检索 chapters（避免老书目录丢失）
        const list: { index: number; title: string }[] = [];
        await db.chapters
          .where("[bookId+index]")
          .between([id, Dexie.minKey], [id, Dexie.maxKey])
          .each((c) => {
            list.push({ index: c.index, title: c.title });
          });
        return list;
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

      // 触发 lastReadAt 同步，将书阁的最近阅读智能置顶并打通排序
      void db.books.update(bookId, { lastReadAt: new Date().toISOString() }).catch((err) => {
        console.error("Failed to update lastReadAt on load:", err);
      });

      // 拦截 URL 中的 chapter 和 bookmarkId 参数进行空降定位
      const searchParams = new URLSearchParams(window.location.search);
      const urlChapter = searchParams.get("chapter");
      const urlBookmarkId = searchParams.get("bookmarkId");

      if (urlChapter !== null) {
        const targetChapterIndex = parseInt(urlChapter, 10);
        if (!isNaN(targetChapterIndex) && targetChapterIndex >= 0 && targetChapterIndex < loadedToc.length) {
          await reader.loadChapter(targetChapterIndex);
          const targetedChapter = reader.getCurrentChapter();
          setChapter(targetedChapter);

          if (urlBookmarkId && targetedChapter) {
            const bookmark = await db.bookmarks.get(urlBookmarkId);
            if (bookmark) {
              const container = contentRef.current;
              restoreScrollPositionStable(
                container,
                bookmark.offset,
                loadedSettings.pageMode,
                (finalOffset, maxOffset) => {
                  if (container) {
                    const paragraphs = container.querySelectorAll(".reader-content p, .reader-content");
                    let targetEl: Element | null = null;
                    
                    if (bookmark.contentPreview) {
                      const previewText = bookmark.contentPreview.trim();
                      for (let i = 0; i < paragraphs.length; i++) {
                        const p = paragraphs[i];
                        const pText = p.textContent || "";
                        if (pText.includes(previewText) || previewText.includes(pText.trim())) {
                          targetEl = p;
                          break;
                        }
                      }
                    }

                    if (targetEl) {
                      targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
                      targetEl.classList.remove("ink-highlight-flash");
                      void (targetEl as HTMLElement).offsetWidth; // 触发重绘
                      targetEl.classList.add("ink-highlight-flash");
                      setTimeout(() => {
                        targetEl?.classList.remove("ink-highlight-flash");
                      }, 3200);
                    } else {
                      if (loadedSettings.pageMode === "scroll") {
                        container.scrollTop = bookmark.offset;
                      } else {
                        container.scrollLeft = bookmark.offset;
                      }
                    }
                  } else {
                    window.scrollTo(0, bookmark.offset);
                  }
                  
                  const offsetRatio = maxOffset > 0 ? finalOffset / maxOffset : 0;
                  setReadingProgress(
                    computeOverallProgress(targetedChapter.index, loadedToc.length, offsetRatio)
                  );
                  setIsPositionRestored(true); // 定位咬合完成，安全淡入
                }
              );
              return;
            }
          }

          if (targetedChapter) {
            setReadingProgress(
              computeOverallProgress(targetedChapter.index, loadedToc.length, 0)
            );
            setIsPositionRestored(true); // 无需滚动还原，直接淡入
          }
          return;
        }
      }

      db.progress.get(bookId).then((progress) => {
        if (
          currentChapter &&
          progress &&
          progress.chapterIndex === currentChapter.index &&
          progress.offset > 0
        ) {
          const container = contentRef.current;
          restoreScrollPositionStable(
            container,
            progress.offset,
            loadedSettings.pageMode,
            (finalOffset, maxOffset) => {
              const offsetRatio = maxOffset > 0 ? finalOffset / maxOffset : 0;
              setReadingProgress(
                computeOverallProgress(
                  currentChapter.index,
                  loadedToc.length,
                  offsetRatio,
                ),
              );
              setIsPositionRestored(true); // 定位咬合完成，安全淡入
            }
          );
        } else if (currentChapter) {
          setReadingProgress(
            computeOverallProgress(currentChapter.index, loadedToc.length, 0),
          );
          setIsPositionRestored(true); // 新书直接淡入
        }
      });
    });
  }, [bookId]);

  const saveCurrentProgress = useCallback(
    async (chapterData: ChapterData, offset: number) => {
      if (!bookId) return;
      const nowIso = new Date().toISOString();
      await db.progress.put({
        bookId,
        chapterId: chapterData.id,
        chapterIndex: chapterData.index,
        offset,
        percentage: toc.length > 0 ? (chapterData.index / toc.length) * 100 : 0,
        updatedAt: nowIso,
      });
      await db.books.update(bookId, { lastReadAt: nowIso }).catch((err) => {
        console.error("Failed to update lastReadAt on saveCurrentProgress:", err);
      });
    },
    [bookId, toc.length],
  );

  const jumpToChapter = useCallback(
    async (index: number) => {
      if (engine) {
        setIsPositionRestored(false); // 切章瞬间前置隐藏，阻止渲染突变
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
        setIsPositionRestored(true); // 物理排版重置完毕后，一帧内优雅淡现
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
        setIsPositionRestored(false); // 跨章时暂时隐藏正文
        await engine.loadChapter(targetChapterIndex);
        const targetChapter = engine.getCurrentChapter();
        setChapter(targetChapter);
        setActivePanel(null);

        const container = contentRef.current;
        restoreScrollByRatioStable(
          container,
          targetOffsetRatio,
          settings.pageMode,
          async (finalOffset) => {
            if (targetChapter) await saveCurrentProgress(targetChapter, finalOffset);
            setIsPositionRestored(true); // 物理位置自适应稳定后优雅复现
          }
        );
        return;
      }

      setIsPositionRestored(false); // 同章内跨页跳跃也应用优雅淡入，避免硬跳眼球疲劳
      const offset = scrollToOffsetRatio(targetOffsetRatio);
      await saveCurrentProgress(chapter, offset);
      setIsPositionRestored(true); // 瞬间淡出后淡入还原
    },
    [chapter, engine, saveCurrentProgress, scrollToOffsetRatio, toc.length, settings.pageMode],
  );

  const handleNext = useCallback(async () => {
    if (engine && chapter && chapter.index < toc.length - 1) {
      await jumpToChapter(chapter.index + 1);
    } else {
      showToast(strings.reader.endOfBook);
    }
  }, [engine, chapter, toc.length, jumpToChapter, showToast]);

  const handlePrev = useCallback(async () => {
    if (engine && chapter && chapter.index > 0) {
      await jumpToChapter(chapter.index - 1);
    } else {
      showToast(strings.reader.startOfBook);
    }
  }, [engine, chapter, jumpToChapter, showToast]);

  const handlePageNext = useCallback(async () => {
    triggerHapticFeedback(12); // 微颤物理触感
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
    triggerHapticFeedback(12); // 微颤物理触感
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

      // 物理屏蔽：边缘滑动返回手势防护锁 (Edge-Swipe Protection)
      // 若起点处于屏幕两侧 30px 的超敏感缓冲区内，则不记录手势、不触发翻页，交由系统手势（如返回书阁）处理
      if (touch.clientX < 30 || touch.clientX > window.innerWidth - 30) {
        touchGestureRef.current = null;
        return;
      }

      touchGestureRef.current = { x: touch.clientX, y: touch.clientY };
      touchTimeRef.current = Date.now();
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

      const end = { x: touch.clientX, y: touch.clientY };
      const duration = Date.now() - touchTimeRef.current;

      const swipeAction = recognizerRef.current.getSwipeAction(start, end, duration);

      if (swipeAction === "swipeLeft" || swipeAction === "swipeUp") {
        // 阻止移动端滑动释放后的延迟 click (Ghost Click)，防止重复翻页或唤醒菜单
        event.preventDefault();
        void handlePageNext();
      } else if (swipeAction === "swipeRight" || swipeAction === "swipeDown") {
        // 阻止移动端滑动释放后的延迟 click (Ghost Click)，防止重复翻页或唤醒菜单
        event.preventDefault();
        void handlePagePrev();
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
    triggerHapticFeedback(15); // 书签落盘震动反馈
    showToast(strings.reader.bookmarkAdded);
  }, [chapter, bookId, settings.pageMode, showToast]);

  const jumpToBookmark = useCallback(
    async (bookmark: Bookmark) => {
      if (engine) {
        await engine.loadChapter(bookmark.chapterIndex);
        const currentChapter = engine.getCurrentChapter();
        setChapter(currentChapter);
        setActivePanel(null);
        setShowMenu(false);

        const container = contentRef.current;
        restoreScrollPositionStable(
          container,
          bookmark.offset,
          settings.pageMode,
          async (finalOffset, maxOffset) => {
            if (container) {
              const paragraphs = container.querySelectorAll(".reader-content p, .reader-content");
              let targetEl: Element | null = null;
              
              if (bookmark.contentPreview) {
                const previewText = bookmark.contentPreview.trim();
                for (let i = 0; i < paragraphs.length; i++) {
                  const p = paragraphs[i];
                  const pText = p.textContent || "";
                  if (pText.includes(previewText) || previewText.includes(pText.trim())) {
                    targetEl = p;
                    break;
                  }
                }
              }

              if (targetEl) {
                targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
                targetEl.classList.remove("ink-highlight-flash");
                void (targetEl as HTMLElement).offsetWidth; // trigger reflow
                targetEl.classList.add("ink-highlight-flash");
                setTimeout(() => {
                  targetEl?.classList.remove("ink-highlight-flash");
                }, 3200);
              } else {
                if (settings.pageMode === "scroll") {
                  container.scrollTo({ top: bookmark.offset, behavior: "smooth" });
                } else {
                  container.scrollTo({ left: bookmark.offset, behavior: "smooth" });
                }
              }
            } else {
              window.scrollTo({ top: bookmark.offset, behavior: "smooth" });
            }

            if (currentChapter) {
              await saveCurrentProgress(currentChapter, finalOffset);
              const offsetRatio = maxOffset > 0 ? finalOffset / maxOffset : 0;
              setReadingProgress(
                computeOverallProgress(currentChapter.index, toc.length || 1, offsetRatio)
              );
            }
          }
        );
      }
    },
    [engine, settings.pageMode, saveCurrentProgress, toc.length],
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
      const container = contentRef.current;
      let percentage = 0;
      if (container) {
        if (settings.pageMode === "scroll") {
          percentage = container.scrollTop / (container.scrollHeight - container.clientHeight || 1);
        } else {
          percentage = container.scrollLeft / (container.scrollWidth - container.clientWidth || 1);
        }
      }

      setSettings((prev) => {
        const newSize = Math.max(14, Math.min(36, prev.fontSize + delta));
        const newSettings = { ...prev, fontSize: newSize };
        saveReaderSettings(newSettings);
        engine?.updateSettings(newSettings);
        return newSettings;
      });

      if (container) {
        restoreScrollByRatioStable(
          container,
          percentage,
          settings.pageMode,
          () => {}
        );
      }
    },
    [engine, settings.pageMode],
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

  const updateFontFamily = useCallback(
    (fontFamily: "kaiti" | "songti" | "heiti") => {
      const container = contentRef.current;
      let percentage = 0;
      if (container) {
        if (settings.pageMode === "scroll") {
          percentage = container.scrollTop / (container.scrollHeight - container.clientHeight || 1);
        } else {
          percentage = container.scrollLeft / (container.scrollWidth - container.clientWidth || 1);
        }
      }

      setSettings((prev) => {
        const newSettings = { ...prev, fontFamily };
        saveReaderSettings(newSettings);
        engine?.updateSettings(newSettings);
        return newSettings;
      });

      if (container) {
        restoreScrollByRatioStable(
          container,
          percentage,
          settings.pageMode,
          () => {}
        );
      }
    },
    [engine, settings.pageMode],
  );

  const updatePageMode = useCallback(
    (mode: "scroll" | "pagination") => {
      if (!chapter) return;
      let percentage = 0;
      const container = contentRef.current;
      if (container) {
        if (settings.pageMode === "scroll") {
          percentage =
            container.scrollTop /
            (container.scrollHeight - container.clientHeight || 1);
        } else {
          percentage =
            container.scrollLeft /
            (container.scrollWidth - container.clientWidth || 1);
        }
      }

      setSettings((prev) => {
        const newSettings = { ...prev, pageMode: mode };
        saveReaderSettings(newSettings);
        engine?.updateSettings(newSettings);
        return newSettings;
      });

      if (container) {
        restoreScrollByRatioStable(
          container,
          percentage,
          mode,
          () => {}
        );
      }
    },
    [chapter, settings.pageMode, engine],
  );

  const currentThemeColors = THEMES[settings.theme] || THEMES.paper;
  const isPagination = settings.pageMode === "pagination";

  return {
    chapter,
    isPositionRestored,
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
    updateFontFamily,
    seekToProgress,
    readingProgress,
    currentThemeColors,
    isPagination,
    toast,
  };
}
