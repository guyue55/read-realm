import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  type TouchEvent,
} from "react";
import {
  ReaderEngine,
  ReaderSession,
  getChapterOffsetRatio,
  getChapterRelativeOffset,
  getScrollChapterWindow,
  compensateScrollOffset,
  getSnappedPaginationOffset,
  getNextPageScrollLeft,
  getPrevPageScrollLeft,
  PAGE_GAP,
  type ChapterData,
} from "@reader/reader-core";
import {
  Dexie,
  createProgressSaveCoordinator,
  db,
  type ProgressSaveCoordinator,
  type ProgressSaveStatus,
} from "@reader/storage-core";
import {
  AI_READING_INTENTS,
  generateAiSigKeyAsync,
  createId,
  type AIReadingIntent,
  type ReadingProgress,
  type Bookmark,
  type Book,
  type LibraryFolder,
} from "@reader/shared-types";
import { GestureRecognizer } from "@reader/gesture-core";
import { THEMES, type ThemeName } from "@/styles/themes";
import { apiUrl, getShareHeaders } from "@/lib/api";
import { getAIConfigHeaders } from "@/lib/ai-config";
import { strings } from "@/lib/i18n";
import {
  loadReaderSettings,
  queueReaderSettingsSave,
  type ReaderSettingsState,
} from "@/lib/reader-settings";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformChapterData(data: any, bookId: string): any {
  if (!data) return null;
  const index = data.index !== undefined ? data.index : (data.chapterIndex !== undefined ? data.chapterIndex : 0);
  const title = data.title || data.name || `第 ${index + 1} 章`;
  const content = data.content || data.body || data.text || "";
  const id = data.id ? data.id.split("#")[0] : `${bookId}-${index}`;
  return {
    id,
    bookId,
    index,
    title,
    content,
  };
}

/**
 * 沿相对路径向下探寻获取 FileSystemFileHandle 句柄，支持多级目录，严格拦截逃逸
 */
async function getFileHandleByRelativePath(
  rootHandle: FileSystemDirectoryHandle,
  relativePath: string
): Promise<FileSystemFileHandle> {
  const parts = relativePath.split("/").filter(Boolean);
  let current: FileSystemDirectoryHandle = rootHandle;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (part === ".." || part === ".") {
      throw new Error("PATH_TRAVERSAL_FORBIDDEN");
    }
    current = await current.getDirectoryHandle(part);
  }
  const last = parts[parts.length - 1];
  if (last === ".." || last === ".") {
    throw new Error("PATH_TRAVERSAL_FORBIDDEN");
  }
  return await current.getFileHandle(last);
}

/**
 * 带有数据库反查并自动更新功能的 getFileHandle 包装器，100% 物理层平滑自愈
 */
async function getFileHandleWithHealing(
  rootHandle: FileSystemDirectoryHandle,
  relativePath: string,
  bookId: string,
  type: "file" | "multi_file_chapter" = "file",
  chapterIndex?: number
): Promise<FileSystemFileHandle> {
  try {
    return await getFileHandleByRelativePath(rootHandle, relativePath);
  } catch (err) {
    console.warn(`[Self Healing] 路径失联 (${relativePath})，正在尝试通过本地索引执行冷自愈...`, err);
    const indexedFile = await db.indexedNovelFiles.where("bookId").equals(bookId).first();
    if (indexedFile) {
      if (type === "file") {
        if (indexedFile.relativePath !== relativePath) {
          console.log(`[Self Healing] 成功反查到最新物理相对路径: ${indexedFile.relativePath}，执行元数据自愈覆盖。`);
          await db.books.update(bookId, {
            "contentLocator.relativePath": indexedFile.relativePath
          });
          return await getFileHandleByRelativePath(rootHandle, indexedFile.relativePath);
        }
      } else if (type === "multi_file_chapter" && typeof chapterIndex === "number") {
        const book = await db.books.get(bookId);
        if (book && book.multiFileBook) {
          const fileName = relativePath.split("/").pop();
          if (fileName) {
            const potentialFile = await db.indexedNovelFiles
              .where("sourceId")
              .equals(indexedFile.sourceId)
              .filter(f => f.name === fileName)
              .first();
            if (potentialFile && potentialFile.relativePath !== relativePath) {
              console.log(`[Self Healing] 多文件章节 [${fileName}] 成功反查到最新路径: ${potentialFile.relativePath}`);
              const updatedChapterFiles = book.multiFileBook.chapterFiles.map(cf => {
                if (cf.index === chapterIndex) {
                  return { ...cf, relativePath: potentialFile.relativePath };
                }
                return cf;
              });
              await db.books.update(bookId, {
                "multiFileBook.chapterFiles": updatedChapterFiles
              });
              return await getFileHandleByRelativePath(rootHandle, potentialFile.relativePath);
            }
          }
        }
      }
    }
    throw err;
  }
}

/**
 * 针对流式大文本进行 TextDecoder 自适应字符集解密
 */
async function decodeBlobAsync(
  blob: Blob,
  preferredEncoding: "utf-8" | "gb18030" | "big5" | "unknown" = "utf-8"
): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const encoding = preferredEncoding === "unknown" ? "gb18030" : preferredEncoding;
  const decoder = new TextDecoder(encoding);
  return decoder.decode(buffer);
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

function getReaderPaginationStep(container: HTMLDivElement): number {
  // 新分页引擎：页宽 = 容器宽度 + 页间间隔
  const readerContentEl = container.querySelector(".reader-content") as HTMLElement | null;
  if (readerContentEl) {
    return container.clientWidth + PAGE_GAP;
  }
  // 回退：无 .reader-content 时使用容器宽度
  return container.clientWidth + PAGE_GAP;
}

function getRenderedChapterElement(
  container: HTMLDivElement | null,
  chapterIndex: number,
): HTMLElement | null {
  if (!container) return null;
  return container.querySelector(
    `.chapter-container[data-chapter-index="${chapterIndex}"]`,
  );
}

function getScrollChapterMetrics(
  container: HTMLDivElement | null,
  chapterIndex: number,
) {
  const chapterElement = getRenderedChapterElement(container, chapterIndex);
  if (!container || !chapterElement) {
    return { relativeOffset: 0, maxOffset: 0, remaining: Number.POSITIVE_INFINITY };
  }

  const relativeOffset = getChapterRelativeOffset(
    container.scrollTop,
    chapterElement.offsetTop,
  );
  const maxOffset = Math.max(0, chapterElement.scrollHeight - container.clientHeight);
  const chapterBottom = chapterElement.offsetTop + chapterElement.offsetHeight;
  const viewportBottom = container.scrollTop + container.clientHeight;

  return {
    relativeOffset,
    maxOffset,
    remaining: chapterBottom - viewportBottom,
  };
}

/**
 * 极客级自适应布局稳定判定滚动定位器 (Layout Settle Restorer)
 * 监听 scroll 容器的 scrollHeight 和 scrollWidth，仅在尺寸连续 3 帧完全静止稳定时，
 * 执行高精度 scrollTop / scrollLeft 还原与最终 readingProgress 换算。
 * 杜绝传统 setTimeout 带来的进度恢复漂移、闪跳或被物理裁剪。
 */
function restoreScrollPositionStable(
  containerSource: HTMLDivElement | React.MutableRefObject<HTMLDivElement | null> | null,
  targetOffset: number,
  pageMode: "scroll" | "pagination",
  onSettled: (offset: number, maxOffset: number) => void,
  paragraphIndex?: number,
  characterOffset?: number,
  chapterIndex?: number,
) {
  const resolveContainer = () => (
    containerSource && "current" in containerSource
      ? containerSource.current
      : containerSource
  );
  if (!containerSource) {
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
    const container = resolveContainer();
    if (!container?.isConnected) {
      if (attempts >= maxAttempts) {
        onSettled(targetOffset, 0);
      } else {
        rafId = requestAnimationFrame(check);
      }
      return;
    }
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
      let offsetApplied = false;
      let semanticTarget: Element | null = null;
      if (typeof paragraphIndex === "number" && paragraphIndex >= 0) {
        const chapterRoot = typeof chapterIndex === "number"
          ? getRenderedChapterElement(container, chapterIndex)
          : container;
        const targetEl = chapterRoot?.querySelector(
          `p[data-idx="${paragraphIndex}"]`,
        );
        if (targetEl) {
          const previousScrollBehavior = container.style.scrollBehavior;
          try {
            // Semantic restoration is an internal correction. Never inherit the
            // reader's smooth-scroll preference here: scrollIntoView({auto}) can
            // still animate when CSS declares smooth and report an intermediate
            // paragraph as the restored position.
            container.style.scrollBehavior = "auto";
            if (pageMode === "scroll") {
              const targetRect = targetEl.getBoundingClientRect();
              const containerRect = container.getBoundingClientRect();
              container.scrollTop += targetRect.top - containerRect.top;
              if (characterOffset && characterOffset > 0 && targetEl.firstChild) {
                const range = document.createRange();
                const node = targetEl.firstChild;
                const safeOffset = Math.min(characterOffset, node.textContent?.length || 0);
                range.setStart(node, safeOffset);
                const charRect = range.getBoundingClientRect();
                const settledContainerRect = container.getBoundingClientRect();
                container.scrollTop += (charRect.top - settledContainerRect.top);
              }
            } else {
              targetEl.scrollIntoView({ block: "nearest", inline: "start", behavior: "auto" });
              // 重新吸附分页位置
              const maxOffset = Math.max(0, container.scrollWidth - container.clientWidth);
              container.scrollLeft = getSnappedPaginationOffset(
                container.scrollLeft,
                getReaderPaginationStep(container),
                maxOffset,
              );
            }
            offsetApplied = true;
            semanticTarget = targetEl;
          } catch (err) {
            console.error("Precise offset positioning failed, falling back:", err);
          } finally {
            container.style.scrollBehavior = previousScrollBehavior;
          }
        }
      }

      if (!offsetApplied) {
        if (pageMode === "scroll") {
          container.scrollTop = targetOffset;
        } else {
          container.scrollLeft = targetOffset;
        }
      }

      if (pageMode === "scroll" && semanticTarget) {
        let anchorStableFrames = 0;
        let anchorAttempts = 0;
        const stabilizeSemanticAnchor = () => {
          anchorAttempts += 1;
          const containerRect = container.getBoundingClientRect();
          const desiredLine = containerRect.top
            + Math.min(120, Math.max(24, containerRect.height * 0.12));
          let anchorTop = semanticTarget?.getBoundingClientRect().top ?? desiredLine;
          if (characterOffset && characterOffset > 0 && semanticTarget.firstChild) {
            const range = document.createRange();
            const node = semanticTarget.firstChild;
            const safeOffset = Math.min(characterOffset, node.textContent?.length || 0);
            range.setStart(node, safeOffset);
            anchorTop = range.getBoundingClientRect().top;
          }
          const delta = anchorTop - desiredLine;
          if (Math.abs(delta) <= 1) {
            anchorStableFrames += 1;
          } else {
            anchorStableFrames = 0;
            const previousScrollBehavior = container.style.scrollBehavior;
            container.style.scrollBehavior = "auto";
            container.scrollTop += delta;
            container.style.scrollBehavior = previousScrollBehavior;
          }
          if (anchorStableFrames >= 3 || anchorAttempts >= 30) {
            const finalOffset = container.scrollTop;
            const maxOffset = Math.max(
              0,
              container.scrollHeight - container.clientHeight,
            );
            onSettled(finalOffset, maxOffset);
            return;
          }
          rafId = requestAnimationFrame(stabilizeSemanticAnchor);
        };
        rafId = requestAnimationFrame(stabilizeSemanticAnchor);
        return;
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
  containerRef: React.MutableRefObject<HTMLDivElement | null>,
  ratio: number,
  pageMode: "scroll" | "pagination",
  onSettled: (offset: number, maxOffset: number) => void,
) {
  const initialContainer = containerRef.current;
  if (!initialContainer) {
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
    // 动态读取 containerRef，支持 Page Mode 切换时的 contentRef 重定向
    const container = containerRef.current;
    if (!container) {
      // 容器已卸载，尽早退出
      onSettled(0, 0);
      return;
    }
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
        container.scrollLeft = getSnappedPaginationOffset(
          targetOffset,
          getReaderPaginationStep(container),
          maxOffset,
        );
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

/**
 * 递归安全地向上反解查找书籍的物理来源 sourceId
 */
async function findPhysicalSourceId(book: Book): Promise<string | null> {
  if (book.contentLocator?.sourceId) {
    return book.contentLocator.sourceId;
  }
  
  let currentFolderId = book.sourceFolderId;
  if (!currentFolderId) return null;

  try {
    // 1. 如果 sourceFolderId 直接是物理来源 ID
    const directSource = await db.librarySources.get(currentFolderId);
    if (directSource) {
      return currentFolderId;
    }

    // 2. 否则，递归向上寻根 logical folders
    while (currentFolderId) {
      const folder: LibraryFolder | undefined = await db.libraryFolders.get(currentFolderId);
      if (!folder) break;
      if (folder.sourceId) {
        return folder.sourceId;
      }
      currentFolderId = folder.parentId;
    }
  } catch (err) {
    console.error("findPhysicalSourceId 递归解算物理来源时发生异常:", err);
  }

  return null;
}

/**
 * 针对首读"not_parsed"的本地TXT小说进行高可用自愈解析，将整本全量切章并存入db.chapters
 */
async function autoParseAndCacheTxtBook(book: Book): Promise<void> {
  const locator = book.contentLocator;
  if (!locator) {
    throw new Error("Missing content locator for local book.");
  }
  const sourceId = await findPhysicalSourceId(book);
  if (!sourceId) {
    throw new Error("Missing physical source reference.");
  }
  const source = await db.librarySources.get(sourceId);
  if (!source) {
    throw new Error("Physical library source not found in database.");
  }
  const handle = (source as unknown as { directoryHandle?: FileSystemDirectoryHandle }).directoryHandle;
  if (!handle) {
    throw new Error("Missing native directory handle reference.");
  }

  // 校验或申请权限
  const perm = await (handle as unknown as { queryPermission(options?: { mode: "read" | "readwrite" }): Promise<PermissionState> }).queryPermission({ mode: "read" });
  if (perm !== "granted") {
    // 自动更新书籍的状态为需要授权
    await db.books.update(book.id, { sourceAvailability: "permission_required" });
    throw new Error("PERMISSION_REQUIRED");
  }

  // 获取文件
  let fileHandle: FileSystemFileHandle;
  try {
    fileHandle = await getFileHandleByRelativePath(handle, locator.relativePath);
  } catch (err) {
    console.warn(`[Self Healing] 路径失联，正在尝试通过本地索引执行冷自愈...`, err);
    // 尝试从 indexedNovelFiles 反查最新的相对路径
    const indexedFile = await db.indexedNovelFiles.where("bookId").equals(book.id).first();
    if (indexedFile && indexedFile.relativePath !== locator.relativePath) {
      console.log(`[Self Healing] 成功反查到最新物理相对路径: ${indexedFile.relativePath}，执行元数据自愈覆盖。`);
      await db.books.update(book.id, {
        "contentLocator.relativePath": indexedFile.relativePath
      });
      // 重新使用自愈后的相对路径载入句柄
      fileHandle = await getFileHandleByRelativePath(handle, indexedFile.relativePath);
    } else {
      throw err;
    }
  }
  const file = await fileHandle.getFile();
  const buffer = await file.arrayBuffer();


  // 运行解算 (动态导入隔离 jsdom 对 SSR 构建造成的影响)
  const { parseTxtBook } = await import("@reader/parser-core");
  const parsedBook = parseTxtBook(book.title + ".txt", buffer);
  if (!parsedBook || parsedBook.chapters.length === 0) {
    throw new Error("Zero chapters parsed or parsing engine failed.");
  }

  // 存入 db.chapters
  const now = new Date().toISOString();
  const chaptersToSave = parsedBook.chapters.map((ch, index) => ({
    id: createId(),
    bookId: book.id,
    index,
    title: ch.title || `第 ${index + 1} 章`,
    content: ch.content,
    wordCount: ch.content.length,
    createdAt: now,
    updatedAt: now,
  }));

  // 事务写入，安全保障
  await db.transaction("rw", [db.books, db.chapters], async () => {
    await db.chapters.bulkPut(chaptersToSave);
    await db.books.update(book.id, {
      parseStatus: "parsed",
      toc: parsedBook.chapters.map(ch => ({ index: ch.index, title: ch.title })),
      chapterCount: parsedBook.chapters.length,
      cacheStatus: "chapters_full",
      sourceAvailability: "full_cached"
    });
  });

  console.log(`[Self Healing] Successfully auto-parsed & cached local book: ${book.title}`);
}

export function useReader(bookId: string) {
  const [book, setBook] = useState<Book | null>(null);
  const [chapter, setChapter] = useState<ChapterData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renderedChapters, setRenderedChapters] = useState<ChapterData[]>([]);
  const renderedChaptersRef = useRef<ChapterData[]>([]);
  const [isPositionRestored, setIsPositionRestoredState] = useState(false);
  const isPositionRestoredRef = useRef(false);
  const setIsPositionRestored = useCallback((val: boolean) => {
    isPositionRestoredRef.current = val;
    setIsPositionRestoredState(val);
  }, []);
  const [engine, setEngine] = useState<ReaderEngine | null>(null);
  const readerSessionRef = useRef<ReaderSession | null>(null);
  const [showMenu, setShowMenu] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);
  const [settings, setSettings] = useState<ReaderSettingsState>(() =>
    loadReaderSettings(),
  );
  const settingsRef = useRef<ReaderSettingsState>(settings);
  const [readingProgress, setReadingProgress] = useState(0);
  const [paginationAnchor, setPaginationAnchor] = useState<{
    chapterIndex: number;
    paragraphIndex: number;
    characterOffset: number;
  } | null>(null);

  const [autoFlipCountdown, setAutoFlipCountdown] = useState<number | null>(null);
  const autoFlipTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const handleNextRef = useRef<((targetIndex?: number) => Promise<void>) | null>(null);
  const autoFlipTargetIndexRef = useRef<number | null>(null);
  const scrollWindowGenerationRef = useRef(0);
  const scrollWindowRequestRef = useRef<{ generation: number; signature: string } | null>(null);
  const scrollWindowReflowRef = useRef(false);
  const scrollWindowReflowTargetRef = useRef<number | null>(null);
  const pendingScrollLayoutAnchorRef = useRef<{
    chapterIndex: number;
    chapterOffsetTop: number;
    scrollTop: number;
  } | null>(null);
  // 无感切章标志：跳过 hide/show 过渡动画，直接定位到章首
  const seamlessChapterSwitchRef = useRef(false);
  const pendingScrollRestoreRef = useRef<{
    offset?: number;
    ratio?: number;
    paragraphIndex?: number;
    characterOffset?: number;
    flashElement?: boolean;
    contentPreview?: string;
    onSettled?: (finalOffset: number, maxOffset: number) => void | Promise<void>;
  } | null>(null);
  const semanticLayoutAnchorRef = useRef<{
    chapterIndex: number;
    paragraphIndex: number;
    characterOffset: number;
  } | null>(null);
  const latestSemanticAnchorRef = useRef<{
    chapterIndex: number;
    paragraphIndex: number;
    characterOffset: number;
  } | null>(null);
  const panelSemanticAnchorRef = useRef<{
    chapterIndex: number;
    paragraphIndex: number;
    characterOffset: number;
  } | null>(null);

  renderedChaptersRef.current = renderedChapters;

  const replaceRenderedChapter = useCallback((nextChapter: ChapterData) => {
    scrollWindowGenerationRef.current += 1;
    scrollWindowRequestRef.current = null;
    pendingScrollLayoutAnchorRef.current = null;
    scrollWindowReflowRef.current = false;
    scrollWindowReflowTargetRef.current = null;
    renderedChaptersRef.current = [nextChapter];
    latestSemanticAnchorRef.current = {
      chapterIndex: nextChapter.index,
      paragraphIndex: 0,
      characterOffset: 0,
    };
    setRenderedChapters([nextChapter]);
  }, []);

  useLayoutEffect(() => {
    const pending = pendingScrollLayoutAnchorRef.current;
    if (!pending || settingsRef.current.pageMode !== "scroll") {
      scrollWindowReflowRef.current = false;
      scrollWindowReflowTargetRef.current = null;
      return;
    }
    pendingScrollLayoutAnchorRef.current = null;
    const container = contentRef.current;
    const anchorElement = getRenderedChapterElement(container, pending.chapterIndex);
    if (!container || !anchorElement) {
      scrollWindowReflowRef.current = false;
      scrollWindowReflowTargetRef.current = null;
      return;
    }
    const targetScrollTop = compensateScrollOffset(
      pending.scrollTop,
      pending.chapterOffsetTop,
      anchorElement.offsetTop,
    );
    const previousScrollBehavior = container.style.scrollBehavior;
    container.style.scrollBehavior = "auto";
    scrollWindowReflowTargetRef.current = targetScrollTop;
    container.scrollTop = targetScrollTop;
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        container.style.scrollBehavior = previousScrollBehavior;
        scrollWindowReflowRef.current = false;
        scrollWindowReflowTargetRef.current = null;
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame) cancelAnimationFrame(secondFrame);
      container.style.scrollBehavior = previousScrollBehavior;
    };
  }, [renderedChapters]);

  const clearAutoFlipTimer = useCallback(() => {
    if (autoFlipTimerRef.current) {
      clearInterval(autoFlipTimerRef.current);
      autoFlipTimerRef.current = null;
    }
    autoFlipTargetIndexRef.current = null;
    setAutoFlipCountdown(null);
  }, []);

  const startAutoFlipTimer = useCallback((targetIndex?: number) => {
    if (autoFlipTimerRef.current) return;
    autoFlipTargetIndexRef.current =
      typeof targetIndex === "number" ? targetIndex : null;
    let remaining = 3;
    setAutoFlipCountdown(remaining);
    autoFlipTimerRef.current = setInterval(() => {
      remaining = Math.max(0, parseFloat((remaining - 0.05).toFixed(1)));
      setAutoFlipCountdown(remaining);
      if (remaining <= 0) {
        if (autoFlipTimerRef.current) {
          clearInterval(autoFlipTimerRef.current);
          autoFlipTimerRef.current = null;
        }
        setAutoFlipCountdown(null);
        triggerHapticFeedback(12);
        if (handleNextRef.current) {
          void handleNextRef.current(autoFlipTargetIndexRef.current ?? undefined);
        }
      }
    }, 50);
  }, []);
  const throttledSetReadingProgressRef = useRef(
    throttle((progress: number) => {
      setReadingProgress(progress);
    }, 150),
  );
  const touchGestureRef = useRef<{ x: number; y: number } | null>(null);
  const recognizerRef = useRef(new GestureRecognizer());
  const touchTimeRef = useRef<number>(0);
  const lastFlipTimeRef = useRef<number>(0);

  const isFlipCooldown = useCallback(() => {
    return Date.now() - lastFlipTimeRef.current < 250;
  }, []);

  const [toast, setToast] = useState<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activePanel, setActivePanel] = useState<
    "toc" | "progress" | "ai" | "settings" | null
  >(null);
  const [toc, setToc] = useState<{ index: number; title: string }[]>([]);
  const [progressSaveStatus, setProgressSaveStatus] =
    useState<ProgressSaveStatus>({ state: "idle" });
  const progressSaveCoordinatorRef = useRef<ProgressSaveCoordinator | null>(null);

  const ensureScrollChapterWindow = useCallback(async (activeChapterIndex: number) => {
    if (!engine || settingsRef.current.pageMode !== "scroll" || toc.length === 0) return;
    const desiredIndices = getScrollChapterWindow(activeChapterIndex, toc.length);
    const signature = desiredIndices.join(",");
    const currentIndices = renderedChaptersRef.current.map((item) => item.index);
    if (
      currentIndices.length === desiredIndices.length &&
      currentIndices.every((index, offset) => index === desiredIndices[offset])
    ) return;
    if (scrollWindowRequestRef.current?.signature === signature) return;

    const generation = scrollWindowGenerationRef.current + 1;
    scrollWindowGenerationRef.current = generation;
    scrollWindowRequestRef.current = { generation, signature };
    const existing = new Map(
      renderedChaptersRef.current.map((item) => [item.index, item]),
    );
    let loaded: Array<ChapterData | null>;
    try {
      loaded = await Promise.all(
        desiredIndices.map(async (index) => existing.get(index) ?? engine.getChapter(index)),
      );
    } catch (error) {
      if (scrollWindowRequestRef.current?.generation === generation) {
        scrollWindowRequestRef.current = null;
      }
      console.warn("Adjacent chapter window preload failed", error);
      return;
    }
    if (
      scrollWindowGenerationRef.current !== generation ||
      scrollWindowRequestRef.current?.generation !== generation ||
      !readerSessionRef.current?.belongsTo(bookId)
    ) return;
    const next = loaded
      .filter((item): item is ChapterData => Boolean(item))
      .sort((left, right) => left.index - right.index);
    if (!next.some((item) => item.index === activeChapterIndex)) return;

    const container = contentRef.current;
    const anchorElement = getRenderedChapterElement(container, activeChapterIndex);
    if (container && anchorElement) {
      scrollWindowReflowRef.current = true;
      pendingScrollLayoutAnchorRef.current = {
        chapterIndex: activeChapterIndex,
        chapterOffsetTop: anchorElement.offsetTop,
        scrollTop: container.scrollTop,
      };
    }
    renderedChaptersRef.current = next;
    setRenderedChapters(next);
    scrollWindowRequestRef.current = null;
  }, [bookId, engine, toc.length]);

  const showToast = useCallback((msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
    }, 2500);
  }, []);

  const persistSettings = useCallback(
    (nextSettings: ReaderSettingsState) => {
      engine?.updateSettings(nextSettings);
      const session = readerSessionRef.current;
      if (!session) {
        void queueReaderSettingsSave(nextSettings).catch((err) => {
          console.error("Failed to persist reader settings:", err);
          showToast("阅读设置保存失败，请重试");
        });
        return;
      }
      void session.updateSettings(nextSettings).catch((err) => {
        console.error("Failed to persist reader settings:", err);
        showToast("阅读设置保存失败，请重试");
      });
    },
    [engine, showToast],
  );

  const applySettings = useCallback(
    (patch: Partial<ReaderSettingsState>) => {
      const nextSettings = { ...settingsRef.current, ...patch };
      settingsRef.current = nextSettings;
      setSettings(nextSettings);
      persistSettings(nextSettings);
    },
    [persistSettings],
  );

  if (!progressSaveCoordinatorRef.current) {
    progressSaveCoordinatorRef.current = createProgressSaveCoordinator({
      persist: async (progress) => {
        await db.transaction("rw", [db.progress, db.books], async () => {
          await db.progress.put(progress);
          const updatedBooks = await db.books.update(progress.bookId, {
            lastReadAt: progress.updatedAt,
          });
          if (updatedBooks === 0) {
            throw new Error("READING_PROGRESS_BOOK_NOT_FOUND");
          }
        });
      },
      onStatusChange: (status) => {
        setProgressSaveStatus(status);
        if (status.state === "failed") {
          console.error("Failed to persist reading progress:", status.error);
        }
      },
    });
  }
  const progressSaveCoordinator = progressSaveCoordinatorRef.current;

  const buildReadingProgress = useCallback(
    (
      chapterData: ChapterData,
      offset: number,
      paragraphIndex?: number,
      characterOffset?: number,
      offsetRatio = 0,
    ): ReadingProgress => ({
      bookId,
      chapterId: chapterData.id,
      chapterIndex: chapterData.index,
      offset,
      paragraphIndex,
      characterOffset,
      percentage: computeOverallProgress(
        chapterData.index,
        toc.length,
        offsetRatio,
      ),
      updatedAt: new Date().toISOString(),
    }),
    [bookId, toc.length],
  );
  const retryProgressSave = useCallback(async () => {
    try {
      await progressSaveCoordinator.retry();
    } catch {
      // 失败状态由协调器保留，界面继续提供重试入口。
    }
  }, [progressSaveCoordinator]);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  // 极客级自适应布局声明式定位调停器 (Declarative Layout Settle Restorer)
  // 监听 React 重绘 commit 完成之后，在新 DOM 框架上开启尺寸微秒帧探测与高精度咬合，咬合后优雅淡现。
  useEffect(() => {
    if (chapter && pendingScrollRestoreRef.current) {
      const pending = pendingScrollRestoreRef.current;
      const container = contentRef.current;

      // 无感切章：跳过 hide/show 过渡，直接定位
      if (seamlessChapterSwitchRef.current) {
        // 防御性重置：确保标志不会泄漏到后续非切章触发的 effect
        seamlessChapterSwitchRef.current = false;
        if (pendingScrollRestoreRef.current === pending) {
          pendingScrollRestoreRef.current = null;
        }
        // 立即设置滚动位置，不等稳定帧
        if (container) {
          if (settings.pageMode === "scroll") {
            container.scrollTop = pending.offset ?? 0;
          } else {
            container.scrollLeft = pending.offset ?? 0;
          }
        }
        setIsPositionRestored(true);
        if (pending.onSettled) {
          const finalOffset = pending.offset ?? 0;
          const maxOffset = settings.pageMode === "scroll"
            ? Math.max(0, (container?.scrollHeight || 0) - (container?.clientHeight || 0))
            : Math.max(0, (container?.scrollWidth || 0) - (container?.clientWidth || 0));
          void pending.onSettled(finalOffset, maxOffset);
        }
        return;
      }

      const onSettleCallback = async (finalOffset: number, maxOffset: number) => {
        if (pendingScrollRestoreRef.current === pending) {
          pendingScrollRestoreRef.current = null;
        }
        if (container && pending.flashElement) {
          const chapterRoot = getRenderedChapterElement(container, chapter.index) ?? container;
          let targetEl: Element | null = null;
          if (typeof pending.paragraphIndex === "number" && pending.paragraphIndex >= 0) {
            targetEl = chapterRoot.querySelector(
              `p[data-idx="${pending.paragraphIndex}"]`,
            ) ?? null;
          }

          if (!targetEl && pending.contentPreview) {
            const paragraphs = chapterRoot.querySelectorAll(".reader-content p, .reader-content");
            const previewText = pending.contentPreview.trim();
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
            if (typeof pending.paragraphIndex !== "number") {
              targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
            }
            targetEl.classList.remove("ink-highlight-flash");
            void (targetEl as HTMLElement).offsetWidth; // 触发重绘
            targetEl.classList.add("ink-highlight-flash");
            setTimeout(() => {
              targetEl?.classList.remove("ink-highlight-flash");
            }, 3200);
          } else {
            if (settings.pageMode === "scroll") {
              container.scrollTop = pending.offset ?? 0;
            } else {
              container.scrollLeft = pending.offset ?? 0;
            }
          }
        }

        setIsPositionRestored(true); // 精准咬合稳定后，正文高雅淡现
        if (pending.onSettled) {
          await pending.onSettled(finalOffset, maxOffset);
        }
      };

      if (typeof pending.ratio === "number") {
        const cleanup = restoreScrollByRatioStable(
          contentRef,
          pending.ratio,
          settings.pageMode,
          onSettleCallback
        );
        return cleanup;
      } else {
        const targetOffset = pending.offset ?? 0;
        const cleanup = restoreScrollPositionStable(
          contentRef,
          targetOffset,
          settings.pageMode,
          onSettleCallback,
          pending.paragraphIndex,
          pending.characterOffset,
          chapter.index,
        );
        return cleanup;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    chapter?.id,
    renderedChapters,
    settings.pageMode,
    settings.fontSize,
    settings.fontFamily,
    settings.paragraphSpacing,
    settings.letterSpacing,
    settings.lineHeight,
  ]);

  useEffect(() => {
    if (
      !chapter ||
      settings.pageMode !== "scroll" ||
      !isPositionRestored
    ) return;
    void ensureScrollChapterWindow(chapter.index);
  }, [chapter, ensureScrollChapterWindow, isPositionRestored, settings.pageMode]);

  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const bookmarksRef = useRef<Bookmark[]>([]);
  const [activeTab, setActiveTab] = useState<"toc" | "bookmarks">("toc");
  const [aiSummary, setAiSummary] = useState<string>("");
  const [isAiLoading, setIsAiLoading] = useState(false);

  const appendBookmarkToSession = useCallback((bookmark: Bookmark) => {
    const nextBookmarks = [...bookmarksRef.current, bookmark];
    bookmarksRef.current = nextBookmarks;
    setBookmarks(nextBookmarks);
    readerSessionRef.current?.replaceBookmarks(nextBookmarks);
  }, []);

  const handleNightModeToggle = useCallback(() => {
    const nextTheme: ThemeName = settingsRef.current.theme === "dark" ? "paper" : "dark";
    applySettings({ theme: nextTheme });
  }, [applySettings]);

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

  const getPrecisePosition = useCallback(() => {
    const container = contentRef.current;
    if (!container) return { paragraphIndex: 0, characterOffset: 0 };

    const rect = container.getBoundingClientRect();
    // Resolve from reader-owned geometry instead of elementFromPoint. Overlaid settings,
    // progress and note surfaces may cover the reading line while the semantic anchor
    // still belongs to the unchanged paragraph underneath.
    const readingLine = rect.top + Math.min(120, Math.max(12, rect.height * 0.12));
    const paragraphs = Array.from(container.querySelectorAll("p[data-idx]"));
    let targetP: Element | null = null;
    let paragraphIndex = 0;
    let characterOffset = 0;

    for (const paragraph of paragraphs) {
      const paragraphRect = paragraph.getBoundingClientRect();
      const intersectsHorizontally = paragraphRect.right > rect.left && paragraphRect.left < rect.right;
      if (intersectsHorizontally && paragraphRect.bottom > readingLine) {
        targetP = paragraph;
        break;
      }
    }

    if (targetP) {
      paragraphIndex = parseInt(targetP.getAttribute("data-idx") || "0", 10);
      const pRect = targetP.getBoundingClientRect();
      const text = targetP.textContent || "";
      const fragmentStart = Number.parseInt(
        targetP.getAttribute("data-char-start") || "0",
        10,
      );
      characterOffset = Number.isFinite(fragmentStart) ? fragmentStart : 0;
      
      const isScroll = settings.pageMode === "scroll";
      if (isScroll) {
        const dY = readingLine - pRect.top;
        if (dY > 0 && pRect.height > 0) {
          const ratio = dY / pRect.height;
          characterOffset += Math.floor(ratio * text.length);
        }
      } else {
        const dX = rect.left - pRect.left;
        if (dX > 0 && pRect.width > 0) {
          const ratio = dX / pRect.width;
          characterOffset += Math.floor(ratio * text.length);
        }
      }
    }
    return { paragraphIndex, characterOffset };
  }, [settings.pageMode]);

  const togglePanel = useCallback(
    (panel: "toc" | "progress" | "ai" | "settings") => {
      if (activePanel === panel) {
        panelSemanticAnchorRef.current = null;
        setActivePanel(null);
        return;
      }
      if (chapter) {
        panelSemanticAnchorRef.current = {
          chapterIndex: chapter.index,
          ...getPrecisePosition(),
        };
      }
      setActivePanel(panel);
    },
    [activePanel, chapter, getPrecisePosition],
  );

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
        const offset = Math.round(safeRatio * maxOffset / (container.clientWidth + PAGE_GAP)) * (container.clientWidth + PAGE_GAP);
        container.scrollTo({ left: Math.min(offset, maxOffset), behavior: "smooth" });
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
    if (!chapter || !bookId || settings.pageMode === "pagination") return;

    const handleScroll = () => {
      if (!isPositionRestoredRef.current) return;
      // Reader-owned overlays may trigger layout/scroll events while covering the
      // reading line. They are configuration interactions, not reading progress.
      if (activePanel) return;
      if (scrollWindowReflowRef.current) {
        const target = scrollWindowReflowTargetRef.current;
        // DOM commit 到 layout effect 之间尚未建立补偿目标，这段只能是内部重排事件。
        if (target === null) return;
        if (Math.abs((contentRef.current?.scrollTop ?? target) - target) <= 1) {
          return;
        }
        scrollWindowReflowRef.current = false;
        scrollWindowReflowTargetRef.current = null;
      }
      const { offset, maxOffset } = getOffsetState();
      
      let currentActiveChapter = chapter;
      let activeChapterOffset = offset;
      let activeChapterMaxOffset = maxOffset;
      let activeChapterRemaining = maxOffset - offset;
      
      if (settings.pageMode === "scroll" && contentRef.current) {
        const containers = contentRef.current.querySelectorAll(".chapter-container");
        const containerRect = contentRef.current.getBoundingClientRect();
        const activeLineY = containerRect.top + Math.min(120, Math.max(24, containerRect.height * 0.22));
        let activeIdx = -1;
        for (let i = 0; i < containers.length; i++) {
          const rect = containers[i].getBoundingClientRect();
          // 第一个底端越过阅读视线锚点的章节，就是读者目前视线所在的章节。
          if (rect.bottom > activeLineY) {
            const idxStr = containers[i].getAttribute("data-chapter-index");
            if (idxStr !== null) {
              activeIdx = parseInt(idxStr, 10);
            }
            break;
          }
        }
        
        if (activeIdx !== -1 && chapter && activeIdx !== chapter.index) {
          const targetCh = renderedChapters.find((ch) => ch.index === activeIdx);
          if (targetCh) {
            currentActiveChapter = targetCh;
            engine?.hydrateChapter(targetCh);
            setChapter(targetCh);
          }
        }

        if (currentActiveChapter) {
          const metrics = getScrollChapterMetrics(
            contentRef.current,
            currentActiveChapter.index,
          );
          activeChapterOffset = metrics.relativeOffset;
          activeChapterMaxOffset = metrics.maxOffset;
          activeChapterRemaining = metrics.remaining;
        }
      }

      const offsetRatio =
        settings.pageMode === "scroll" && contentRef.current
          ? getChapterOffsetRatio(
              activeChapterOffset,
              activeChapterMaxOffset + contentRef.current.clientHeight,
              contentRef.current.clientHeight,
            )
          : maxOffset > 0 ? offset / maxOffset : 0;
      const activeChapterIndex = currentActiveChapter ? currentActiveChapter.index : (chapter?.index || 0);
      const overallProgress = computeOverallProgress(activeChapterIndex, toc.length, offsetRatio);
      throttledSetReadingProgressRef.current(overallProgress);
      const activeSession = readerSessionRef.current;
      const semanticProgress = currentActiveChapter &&
        toc.length > 0 &&
        activeSession?.belongsTo(bookId)
        ? activeSession.trackPosition(
            currentActiveChapter,
            {
              offset: activeChapterOffset,
              ...getPrecisePosition(),
              offsetRatio,
            },
            toc.length,
          )
        : null;
      if (semanticProgress) {
        latestSemanticAnchorRef.current = {
          chapterIndex: semanticProgress.chapterIndex,
          paragraphIndex: semanticProgress.paragraphIndex ?? 0,
          characterOffset: semanticProgress.characterOffset ?? 0,
        };
      }

      // 触底自动切章逻辑监控
      if (settings.pageMode === "scroll" && settings.autoFlipAtBottom && activeChapterIndex < toc.length - 1) {
        if (activeChapterRemaining <= 5) {
          // 触发阈值：剩余 ≤ 5px 时才认为真正触底
          if (!autoFlipTimerRef.current) {
            startAutoFlipTimer(activeChapterIndex + 1);
          }
        } else if (activeChapterRemaining > 40) {
          // 往上滚动超过 40px，立刻撤销并清除倒计时
          if (autoFlipTimerRef.current) {
            clearAutoFlipTimer();
          }
        }
      }

      void ensureScrollChapterWindow(activeChapterIndex);

      if (currentActiveChapter) {
        progressSaveCoordinator.schedule(
          semanticProgress ?? buildReadingProgress(
            currentActiveChapter,
            activeChapterOffset,
            undefined,
            undefined,
            offsetRatio,
          ),
        );
      }
    };

    const container = contentRef.current;
    if (container) {
      const releaseReflowForUserInput = () => {
        scrollWindowReflowRef.current = false;
        scrollWindowReflowTargetRef.current = null;
      };
      container.addEventListener("scroll", handleScroll);
      container.addEventListener("wheel", releaseReflowForUserInput, { passive: true });
      container.addEventListener("touchstart", releaseReflowForUserInput, { passive: true });
      container.addEventListener("pointerdown", releaseReflowForUserInput, { passive: true });
      return () => {
        clearAutoFlipTimer();
        container.removeEventListener("scroll", handleScroll);
        container.removeEventListener("wheel", releaseReflowForUserInput);
        container.removeEventListener("touchstart", releaseReflowForUserInput);
        container.removeEventListener("pointerdown", releaseReflowForUserInput);
      };
    } else if (settings.pageMode === "scroll") {
      window.addEventListener("scroll", handleScroll);
    }

    return () => {
      clearAutoFlipTimer();
      window.removeEventListener("scroll", handleScroll);
    };
  }, [
    chapter,
    renderedChapters,
    bookId,
    settings.pageMode,
    settings.autoFlipAtBottom,
    toc.length,
    getOffsetState,
    getPrecisePosition,
    startAutoFlipTimer,
    clearAutoFlipTimer,
    isPositionRestored,
    progressSaveCoordinator,
    buildReadingProgress,
    ensureScrollChapterWindow,
    engine,
    activePanel,
  ]);

  // 组件退出时立即发起剩余进度的持久化，不会提前清除失败值。
  useEffect(() => {
    return () => {
      void progressSaveCoordinator.flush().catch(() => undefined);
    };
  }, [progressSaveCoordinator]);

  // 页面隐藏或卸载时同样立即发起刷盘。
  useEffect(() => {
    const forceFlushProgress = () => {
      void progressSaveCoordinator.flush().catch(() => undefined);
    };
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") {
        forceFlushProgress();
      }
    };

    window.addEventListener("pagehide", forceFlushProgress);
    window.addEventListener("beforeunload", forceFlushProgress);
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => {
      window.removeEventListener("pagehide", forceFlushProgress);
      window.removeEventListener("beforeunload", forceFlushProgress);
      document.removeEventListener("visibilitychange", flushWhenHidden);
    };
  }, [progressSaveCoordinator]);

  useEffect(() => {
    if (settings.pageMode !== "pagination") return;
    const container = contentRef.current;
    if (!container) return;

    const handleWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      // 新分页引擎：鼠标滚轮上下 = 翻页
      if (event.deltaY > 0) {
        const next = getNextPageScrollLeft(
          container.scrollLeft,
          container.clientWidth,
          999,
        );
        container.scrollTo({ left: next, behavior: "smooth" });
      } else if (event.deltaY < 0) {
        const prev = getPrevPageScrollLeft(container.scrollLeft, container.clientWidth);
        container.scrollTo({ left: prev, behavior: "smooth" });
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [chapter?.id, settings.pageMode, isPositionRestored]);

  useEffect(() => {
    if (!bookId) return;
    let active = true;

    const chapterRepo = {
      getChapter: async (id: string, index: number) => {
        let c: { id: string; index: number; title: string; content: string } | null = null;
        try {
          const found = await db.chapters.where("[bookId+index]").equals([id, index]).first();
          if (found) {
            c = found;
          }
        } catch (dbErr) {
          console.error("本地数据库章节检索异常:", dbErr);
        }

        // 针对本地书籍外壳 (BookShell) 的按需懒加载截取机制 (ContentLocator 路由)
        if (!c) {
          try {
            const book = await db.books.get(id);
            if (book && (book.sourceType === "folder_index" || book.sourceType === "folder_multi_file_book")) {
              const locator = book.contentLocator;
              const sourceId = await findPhysicalSourceId(book);
              if (sourceId) {
                const source = await db.librarySources.get(sourceId);
                const handle = (source as unknown as { directoryHandle?: FileSystemDirectoryHandle })?.directoryHandle;
                if (source && handle) {
                  const perm = await (handle as unknown as { queryPermission(options?: { mode: "read" | "readwrite" }): Promise<PermissionState> }).queryPermission({ mode: "read" });
                  if (perm !== "granted") {
                    await db.books.update(id, { sourceAvailability: "permission_required" });
                    console.warn(`[Lazy Loader] 物理目录 ${source.name} 权限已过期，需重新授权`);
                  } else {
                    if (book.sourceType === "folder_multi_file_book" && book.multiFileBook) {
                      const chFile = book.multiFileBook.chapterFiles.find(cf => cf.index === index);
                      if (chFile) {
                        const fileHandle = await getFileHandleWithHealing(handle, chFile.relativePath, id, "multi_file_chapter", index);
                        const file = await fileHandle.getFile();
                        const content = await decodeBlobAsync(file, "gb18030");
                        
                        const newCh = {
                          id: createId(),
                          bookId: id,
                          index,
                          title: chFile.title,
                          content,
                        };
                        await db.chapters.put(newCh);
                        c = newCh;
                      }
                    } else if (book.sourceType === "folder_index" && locator) {
                      const idxRecord = await db.txtChapterIndices
                        .where("[bookId+index]")
                        .equals([id, index])
                        .first();
                      
                      if (idxRecord) {
                        const fileHandle = await getFileHandleWithHealing(handle, locator.relativePath, id, "file");
                        const file = await fileHandle.getFile();
                        const slicedBlob = file.slice(idxRecord.startOffset, idxRecord.endOffset);
                        const content = await decodeBlobAsync(slicedBlob, idxRecord.encoding);
                        
                        const newCh = {
                          id: createId(),
                          bookId: id,
                          index,
                          title: idxRecord.title,
                          content,
                        };
                        await db.chapters.put(newCh);
                        c = newCh;
                      }
                    }
                  }
                }
              }
            }
          } catch (localErr) {
            console.error("[Reader Lazy Loader] 本地外壳按需解算失败:", localErr);
          }
        }

        if (!c && typeof window !== "undefined" && navigator.onLine) {
          try {
            const headers = getShareHeaders();
            const res = await fetch(apiUrl(`/books/${id}/chapters/${index}`), {
              headers,
            });
            if (res.ok) {
              const remoteChapter = await res.json();
              const transformed = transformChapterData(remoteChapter, id);
              if (transformed && transformed.content !== undefined) {
                await db.chapters.put(transformed);
                c = transformed;
              }
            } else if (res.status === 401 || res.status === 403) {
              console.error(`[Reader] 云端鉴权失败 (HTTP ${res.status})，请检查分享令牌是否已配置。`);
            } else {
              console.error(`[Reader] 云端章节拉取失败: HTTP ${res.status}`);
            }
          } catch (err) {
            console.error("[Reader] 按需懒加载章节网络异常:", err);
          }
        }
        return c
          ? { id: c.id, index: c.index, title: c.title, content: c.content }
          : null;
      },
      getChapterCount: async (id: string) =>
        (await chapterRepo.getToc(id)).length,
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
        await progressSaveCoordinator.saveNow(progress);
      },
    };

    const sessionRepo = {
      getProgress: progressRepo.getProgress,
      saveProgress: progressRepo.saveProgress,
      getSettings: async () => loadReaderSettings(),
      saveSettings: async (nextSettings: ReaderSettingsState) => {
        await queueReaderSettingsSave(nextSettings);
      },
      getBookmarks: async (id: string) =>
        await db.bookmarks.where("bookId").equals(id).toArray(),
    };

    const reader = new ReaderEngine(bookId, chapterRepo, progressRepo);
    const readerSession = new ReaderSession(bookId, chapterRepo, sessionRepo);
    readerSessionRef.current = null;
    setError(null); // 每次挂载前置重置错情

    db.books.get(bookId).then(async (b) => {
      if (!active) return;
      if (!b) {
        throw new Error(strings.reader?.bookNotFound || "书籍不存在或已被物理移除");
      }

      // 🏮 核心自愈防线：校验书籍的所属书箧是否在数据库中真实存在，若已在外部解散或物理删除，自动清洗此脏数据，持久化自愈。
      if (b.sourceFolderId) {
        try {
          const folderExists = await db.libraryFolders.get(b.sourceFolderId);
          if (!folderExists) {
            console.warn(`[useReader] 发现幽灵书箧元数据! 书籍《${b.title}》归属的文件夹 ID [${b.sourceFolderId}] 实际不存在。自动擦除此脏属性并写回持久化数据库自愈。`);
            b.sourceFolderId = undefined;
            await db.books.update(bookId, { sourceFolderId: undefined });
          }
        } catch (err) {
          console.error("[useReader] 校验书籍所属书箧合法性时发生异常:", err);
        }
      }

      if (!active) return;
      setBook(b);

      // 安全网：若 parseStatus 标记为已解析但本地章节为空（同步后数据不一致），重置并重新解析
      if (b.parseStatus !== "not_parsed" && b.sourceType === "folder_index") {
        const chapterCount = await db.chapters.where("bookId").equals(bookId).count();
        if (chapterCount === 0) {
          console.warn("[useReader] 检测到 parseStatus 与实际章节数不一致，重置为 not_parsed 并尝试重新解析。");
          await db.books.update(bookId, { parseStatus: "not_parsed" });
          b.parseStatus = "not_parsed";
        }
      }
      if (b.parseStatus === "not_parsed" && b.sourceType === "folder_index") {
        try {
          await autoParseAndCacheTxtBook(b);
          if (!active) return;
          // 重新读取一次，以便后续载入到正确的 TOC 结构
          const updatedB = await db.books.get(bookId);
          if (!active) return;
          if (updatedB) {
            b = updatedB;
            setBook(updatedB);
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          if (errMsg === "PERMISSION_REQUIRED") {
            throw new Error("物理起封授权缺失，请返回书房重新授权唤醒本卷。");
          }
          throw err;
        }
      }

      const sessionSnapshot = await readerSession.load();
      if (!active) return;
      reader.hydrateChapter(sessionSnapshot.chapter);
      reader.updateSettings(sessionSnapshot.settings);
      readerSessionRef.current = readerSession;
      setEngine(reader);
      const currentChapter = reader.getCurrentChapter();
      
      if (!currentChapter) {
        const chaptersInDb = await db.chapters.where("bookId").equals(bookId).count();
        if (chaptersInDb === 0) {
          // 检查此书是否为云端同步书（sourceType === "upload" 且本地无章节）
          if ((b.sourceType === "upload" || b.sourceType === "folder_index" || b.sourceType === "folder_multi_file_book") && typeof navigator !== "undefined" && navigator.onLine) {
            throw new Error("此书为云端藏书，请先在书阁中点击「拉取」下载章节内容，或确认网络连接正常后重试。");
          }
          throw new Error(strings.reader?.noChapters || "此藏书尚无章节内容或加载失败，请返回书阁拉取章节。");
        }
        throw new Error(strings.reader?.noChapters || "此藏书尚无章节内容或加载失败");
      }

      setChapter(currentChapter);
      replaceRenderedChapter(currentChapter);

      const loadedSettings = sessionSnapshot.settings;
      settingsRef.current = loadedSettings;
      setSettings(loadedSettings);
      const loadedToc = await chapterRepo.getToc(bookId);
      setToc(loadedToc);
      bookmarksRef.current = sessionSnapshot.bookmarks;
      setBookmarks(sessionSnapshot.bookmarks);

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
          if (!active) return;
          const targetedChapter = reader.getCurrentChapter();
          
          if (!targetedChapter) {
            throw new Error(strings.reader?.loadChapterFailed || "跳转目标章节加载失败");
          }

          setChapter(targetedChapter);
          replaceRenderedChapter(targetedChapter);

          if (urlBookmarkId) {
            const bookmark = await db.bookmarks.get(urlBookmarkId);
            if (bookmark) {
              const container = contentRef.current;
              restoreScrollPositionStable(
                container,
                bookmark.offset,
                loadedSettings.pageMode,
                (finalOffset, maxOffset) => {
                  if (container) {
                    const chapterRoot = getRenderedChapterElement(
                      container,
                      targetedChapter.index,
                    ) ?? container;
                    let targetEl: Element | null = null;
                    if (typeof bookmark.paragraphIndex === "number" && bookmark.paragraphIndex >= 0) {
                      targetEl = chapterRoot.querySelector(
                        `p[data-idx="${bookmark.paragraphIndex}"]`,
                      );
                    }

                    if (!targetEl && bookmark.contentPreview) {
                      const paragraphs = chapterRoot.querySelectorAll(".reader-content p, .reader-content");
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
                      if (typeof bookmark.paragraphIndex !== "number") {
                        targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
                      }
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
                },
                bookmark.paragraphIndex,
                bookmark.characterOffset,
                targetedChapter.index,
              );
              return;
            }
          }

          setReadingProgress(
            computeOverallProgress(targetedChapter.index, loadedToc.length, 0)
          );
          setIsPositionRestored(true); // 无需滚动还原，直接淡入
          return;
        }
      }

      const progress = sessionSnapshot.progress;
      setPaginationAnchor({
        chapterIndex: currentChapter.index,
        paragraphIndex: progress.paragraphIndex ?? 0,
        characterOffset: progress.characterOffset ?? 0,
      });
      if (loadedSettings.pageMode === "pagination") {
        setReadingProgress(progress.percentage);
        setIsPositionRestored(true);
        return;
      }
      if (
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
          },
          progress.paragraphIndex,
          progress.characterOffset,
          currentChapter.index,
        );
      } else {
        setReadingProgress(
          computeOverallProgress(currentChapter.index, loadedToc.length, 0),
        );
        setIsPositionRestored(true); // 新书直接淡入
      }
    }).catch((err: unknown) => {
      if (!active) return;
      console.error("「自愈阁」深度俘获展卷初始化异常:", err);
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(errMsg || "加载藏书与章节失败，请重新展卷或检查网络");
    });
    return () => {
      active = false;
      if (readerSessionRef.current === readerSession) {
        readerSessionRef.current = null;
      }
    };
  }, [bookId, progressSaveCoordinator, replaceRenderedChapter, setIsPositionRestored]);

  const saveCurrentProgress = useCallback(
    async (chapterData: ChapterData, offset: number, paragraphIndex?: number, characterOffset?: number) => {
      if (!bookId) return;
      setPaginationAnchor({
        chapterIndex: chapterData.index,
        paragraphIndex: paragraphIndex ?? 0,
        characterOffset: characterOffset ?? 0,
      });
      const session = readerSessionRef.current;
      if (session?.belongsTo(bookId)) {
        const container = contentRef.current;
        const chapterMetrics = settings.pageMode === "scroll" && container
          ? getScrollChapterMetrics(container, chapterData.index)
          : null;
        const maxOffset = chapterMetrics?.maxOffset ?? getOffsetState().maxOffset;
        await session.savePosition(chapterData, {
          offset,
          paragraphIndex,
          characterOffset,
          offsetRatio: maxOffset > 0 ? offset / maxOffset : 0,
        });
        return;
      }
      await progressSaveCoordinator.saveNow(
        buildReadingProgress(chapterData, offset, paragraphIndex, characterOffset),
      );
    },
    [bookId, buildReadingProgress, getOffsetState, progressSaveCoordinator, settings.pageMode],
  );

  const savePaginationAnchor = useCallback(
    (
      anchor: { paragraphIndex: number; characterOffset: number },
      pageIndex: number,
      totalPages: number,
    ) => {
      if (!chapter || toc.length === 0) return;
      const session = readerSessionRef.current;
      if (!session?.belongsTo(bookId)) return;
      setPaginationAnchor((current) => {
        if (
          current?.chapterIndex === chapter.index &&
          current.paragraphIndex === anchor.paragraphIndex &&
          current.characterOffset === anchor.characterOffset
        ) {
          return current;
        }
        return { chapterIndex: chapter.index, ...anchor };
      });
      latestSemanticAnchorRef.current = { chapterIndex: chapter.index, ...anchor };
      const semanticProgress = session.trackPosition(
        chapter,
        {
          offset: Math.max(0, pageIndex),
          paragraphIndex: anchor.paragraphIndex,
          characterOffset: anchor.characterOffset,
          offsetRatio: totalPages > 0 ? pageIndex / totalPages : 0,
        },
        toc.length,
      );
      void progressSaveCoordinator.saveNow(semanticProgress).catch(() => {
        // 协调器保留失败状态并由现有重试入口处理。
      });
    },
    [bookId, chapter, progressSaveCoordinator, toc.length],
  );

  const jumpToChapter = useCallback(
    async (index: number) => {
      if (engine) {
        clearAutoFlipTimer();
        // 切章不隐藏内容，由 scroll-restore effect 无感定位到章首
        try {
          await engine.loadChapter(index);
          const currentChapter = engine.getCurrentChapter();

          // 0. 无感切章标志：跳过 hide/show 过渡动画
          seamlessChapterSwitchRef.current = true;

          // 1. 写入定位调停（offset: 0 表示章首）
          pendingScrollRestoreRef.current = {
            offset: 0,
            onSettled: async () => {
              if (currentChapter) {
                setReadingProgress(
                  computeOverallProgress(currentChapter.index, toc.length || 1, 0),
                );
                await saveCurrentProgress(currentChapter, 0);
              }
              // 切章完成后重置标志
              seamlessChapterSwitchRef.current = false;
            }
          };

          // 2. 立即设置容器滚动位置到顶部，避免先看到旧位置再跳转
          const container = contentRef.current;
          if (container) {
            if (settings.pageMode === "scroll") {
              container.scrollTop = 0;
            } else {
              container.scrollLeft = 0;
            }
          }

          // 3. 更新状态，触发 React 重绘与 Effect 定位
          setChapter(currentChapter);
          if (currentChapter) {
            replaceRenderedChapter(currentChapter);
          }
          setActivePanel(null);
          setShowMenu(false);
        } catch (error) {
          console.error("jumpToChapter 失败:", error);
          seamlessChapterSwitchRef.current = false;
          setIsPositionRestored(true); // 强行恢复显示，防止页面白屏
          showToast(strings.reader?.loadChapterFailed || "加载新章节失败，请检查网络");
        }
      }
    },
    [engine, saveCurrentProgress, toc.length, clearAutoFlipTimer, setIsPositionRestored, showToast, settings.pageMode, replaceRenderedChapter],
  );

  const seekToProgress = useCallback(
    async (progress: number) => {
      if (!engine || !chapter || toc.length === 0) return;

      clearAutoFlipTimer();
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
        // 跨章定位：使用无感切换，避免闪烁
        seamlessChapterSwitchRef.current = true;
        try {
          await engine.loadChapter(targetChapterIndex);
          const targetChapter = engine.getCurrentChapter();

          // 1. 写入定位调停（按比例跳转）
          pendingScrollRestoreRef.current = {
            ratio: targetOffsetRatio,
            onSettled: async (finalOffset) => {
              const { paragraphIndex, characterOffset } = getPrecisePosition();
              if (targetChapter) {
                await saveCurrentProgress(targetChapter, finalOffset, paragraphIndex, characterOffset);
              }
              seamlessChapterSwitchRef.current = false;
            }
          };

          // 2. 更新状态
          setChapter(targetChapter);
          if (targetChapter) {
            replaceRenderedChapter(targetChapter);
          }
          setActivePanel(null);
        } catch (error) {
          console.error("seekToProgress 跨章加载失败:", error);
          seamlessChapterSwitchRef.current = false;
          setIsPositionRestored(true); // 强行恢复显示，防止页面白屏
          showToast(strings.reader?.loadChapterFailed || "加载新章节失败，请检查网络");
        }
        return;
      }

      // 同章内跨页跳跃：平滑滚动，不隐藏内容
      scrollToOffsetRatio(targetOffsetRatio);
      const { paragraphIndex, characterOffset } = getPrecisePosition();
      await saveCurrentProgress(chapter, 0, paragraphIndex, characterOffset);
    },
    [chapter, engine, saveCurrentProgress, scrollToOffsetRatio, toc.length, getPrecisePosition, clearAutoFlipTimer, setIsPositionRestored, showToast, replaceRenderedChapter],
  );

  const handleNext = useCallback(async (targetIndex?: number) => {
    if (!engine || !chapter) return;
    const nextIndex =
      typeof targetIndex === "number"
        ? targetIndex
        : autoFlipTargetIndexRef.current ?? chapter.index + 1;
    if (nextIndex < toc.length) {
      clearAutoFlipTimer();
      await jumpToChapter(nextIndex);
    } else {
      showToast(strings.reader.endOfBook);
    }
  }, [engine, chapter, toc.length, jumpToChapter, showToast, clearAutoFlipTimer]);

  // 同步 handleNext 引用，消除定时器的循环依赖
  handleNextRef.current = handleNext;

  const handlePrev = useCallback(async () => {
    if (engine && chapter && chapter.index > 0) {
      await jumpToChapter(chapter.index - 1);
    } else {
      showToast(strings.reader.startOfBook);
    }
  }, [engine, chapter, jumpToChapter, showToast]);

  // handlePrevChapterActive 与 handlePrev 语义相同，直接复用避免重复代码
  const handlePrevChapterActive = handlePrev;

  const handleNextChapterActive = useCallback(async () => {
    if (engine && chapter && chapter.index < toc.length - 1) {
      await jumpToChapter(chapter.index + 1);
    } else {
      showToast(strings.reader.endOfBook);
    }
  }, [engine, chapter, jumpToChapter, toc.length, showToast]);


  const handlePageNext = useCallback(async () => {
    lastFlipTimeRef.current = Date.now();
    triggerHapticFeedback(12); // 微颤物理触感
    const isPagination = settings.pageMode === "pagination";
    if (isPagination && contentRef.current) {
      const container = contentRef.current;
      const { scrollLeft, clientWidth, scrollWidth } = container;
      const maxScrollLeft = Math.max(0, scrollWidth - clientWidth);

      if (scrollLeft < maxScrollLeft - 10) {
        const nextLeft = getNextPageScrollLeft(
          scrollLeft,
          clientWidth,
          999, // totalPages unknown here, clamped internally
        );
        container.scrollTo({ left: nextLeft, behavior: "smooth" });
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
    lastFlipTimeRef.current = Date.now();
    triggerHapticFeedback(12); // 微颤物理触感
    const isPagination = settings.pageMode === "pagination";
    if (isPagination && contentRef.current) {
      const container = contentRef.current;
      const { scrollLeft, clientWidth } = container;

      if (scrollLeft > 10) {
        const prevLeft = getPrevPageScrollLeft(scrollLeft, clientWidth);
        container.scrollTo({ left: prevLeft, behavior: "smooth" });
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


  const hasActiveSelection = useCallback(() => {
    if (typeof window === "undefined") return false;
    const selection = window.getSelection();
    return selection && selection.toString().trim().length > 0;
  }, []);

  const handleContentTouchStart = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      if (isInteractiveTarget(event.target) || activePanel || hasActiveSelection()) {
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
    [activePanel, hasActiveSelection],
  );

  const handleContentTouchEnd = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      const start = touchGestureRef.current;
      touchGestureRef.current = null;
      const touch = event.changedTouches[0];
      if (!touch || !start) return;

      const end = { x: touch.clientX, y: touch.clientY };
      const deltaX = end.x - start.x;

      // 🏮 核心调停加固：长按划词选区存在，但横向大位移滑动超出 70px
      const selection = typeof window !== "undefined" ? window.getSelection() : null;
      const hasActiveSel = selection && !selection.isCollapsed;

      if (hasActiveSel && Math.abs(deltaX) > 70) {
        // 1. 强力清除系统 Selection 划词句柄，把触摸聚焦归还给翻页容器
        selection?.removeAllRanges();

        // 2. 调停翻页：强制按横向划动方向推进物理页面，防止容器由于吸附缺失被卡死在两个分页正中央（半页坍塌）
        if (settings.pageMode === "pagination") {
          event.preventDefault();
          const isNext = deltaX < 0;
          if (isNext) {
            void handlePageNext();
          } else {
            void handlePagePrev();
          }
        }
        return;
      }

      // 如果有活跃选区，但不是大位移划动，则保留划词高亮，静默跳过翻页
      if (hasActiveSel) {
        return;
      }

      const duration = Date.now() - touchTimeRef.current;

      if (settings.pageMode === "pagination") {
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
      } else if (settings.pageMode === "scroll") {
        const { offset, maxOffset } = getOffsetState();
        const deltaY = start.y - end.y;

        // 向上滑动拉取（即手指向上划，将页面卷上去，看下一页/下一章）且已触底
        if (deltaY > 50 && maxOffset - offset <= 20) {
          event.preventDefault();
          void handleNext();
        }
        // 向下滑动拉取（即手向下划，将页面拉下来，看上一页/上一章）且已触顶
        else if (deltaY < -50 && offset <= 20) {
          event.preventDefault();
          void handlePrev();
        }
      }
    },
    [
      handlePageNext,
      handlePagePrev,
      handleNext,
      handlePrev,
      getOffsetState,
      settings.pageMode,
    ],
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

    const { paragraphIndex, characterOffset } = getPrecisePosition();

    const bookmark: Bookmark = {
      id: Date.now().toString(),
      bookId,
      chapterIndex: chapter.index,
      offset,
      paragraphIndex,
      characterOffset,
      contentPreview:
        document.getSelection()?.toString().slice(0, 50) ||
        document.querySelector(".reader-content")?.textContent?.slice(0, 50) ||
        "",
      createdAt: new Date().toISOString(),
    };
    await db.bookmarks.add(bookmark);
    appendBookmarkToSession(bookmark);
    triggerHapticFeedback(15); // 书签落盘震动反馈
    showToast(strings.reader.bookmarkAdded);
  }, [appendBookmarkToSession, chapter, bookId, settings.pageMode, showToast, getPrecisePosition]);

  /**
   * 🏮 [NEW] 记录用户手写读书笔记并与高亮书签同构绑定
   * 锁定原生段落与字偏移，保存当前选区引文和用户的 note 文本。
   */
  const addBookmarkWithNote = useCallback(
    async (noteText: string, contentOverride?: string) => {
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

      const { paragraphIndex, characterOffset } = getPrecisePosition();

      // 获取当前选中的引文，如果有覆盖值则使用覆盖值（防止异步清除导致丢失）
      const selectionText = contentOverride || document.getSelection()?.toString().trim();
      const contentPreview =
        selectionText ||
        document.querySelector(".reader-content")?.textContent?.slice(0, 50) ||
        "";

      const bookmark: Bookmark = {
        id: Date.now().toString(),
        bookId,
        chapterIndex: chapter.index,
        offset,
        paragraphIndex,
        characterOffset,
        contentPreview: contentPreview.slice(0, 300), // 最多记录 300 字引文
        note: noteText.trim(), // 🏮 保存用户批注心得
        createdAt: new Date().toISOString(),
      };

      await db.bookmarks.add(bookmark);
      appendBookmarkToSession(bookmark);
      triggerHapticFeedback(15); // 书签笔记落盘震动反馈
      
      // 清除选区，释放 UI 焦点
      window.getSelection()?.removeAllRanges();
      showToast(strings.reader.bookmarkAdded); // 提示印刻成功
    },
    [appendBookmarkToSession, chapter, bookId, settings.pageMode, showToast, getPrecisePosition]
  );

  const jumpToBookmark = useCallback(
    async (bookmark: Bookmark) => {
      if (engine) {
        setIsPositionRestored(false);
        await engine.loadChapter(bookmark.chapterIndex);
        const currentChapter = engine.getCurrentChapter();

        if (currentChapter && settingsRef.current.pageMode === "pagination") {
          const anchor = {
            chapterIndex: currentChapter.index,
            paragraphIndex: bookmark.paragraphIndex ?? 0,
            characterOffset: bookmark.characterOffset ?? 0,
          };
          // Pagination restores by semantic page, not by the stale pixel offset from
          // another mounted chapter. Keep the exact bookmark anchor authoritative
          // until the user turns a page; otherwise the page-start scroll event can
          // overwrite it during the chapter remount.
          pendingScrollRestoreRef.current = null;
          setChapter(currentChapter);
          replaceRenderedChapter(currentChapter);
          latestSemanticAnchorRef.current = anchor;
          setPaginationAnchor(anchor);
          await saveCurrentProgress(
            currentChapter,
            bookmark.offset,
            anchor.paragraphIndex,
            anchor.characterOffset,
          );
          setReadingProgress(
            computeOverallProgress(currentChapter.index, toc.length || 1, 0),
          );
          setIsPositionRestored(true);
          setActivePanel(null);
          setShowMenu(false);
          return;
        }

        // 1. 写入定位调停
        pendingScrollRestoreRef.current = {
          offset: bookmark.offset,
          paragraphIndex: bookmark.paragraphIndex,
          characterOffset: bookmark.characterOffset,
          contentPreview: bookmark.contentPreview,
          flashElement: true,
          onSettled: async (finalOffset, maxOffset) => {
            if (currentChapter) {
              await saveCurrentProgress(currentChapter, finalOffset, bookmark.paragraphIndex, bookmark.characterOffset);
              const offsetRatio = maxOffset > 0 ? finalOffset / maxOffset : 0;
              setReadingProgress(
                computeOverallProgress(currentChapter.index, toc.length || 1, offsetRatio)
              );
            }
          }
        };

        // 2. 更新状态
        setChapter(currentChapter);
        if (currentChapter) {
          replaceRenderedChapter(currentChapter);
        }
        setActivePanel(null);
        setShowMenu(false);
      }
    },
    [engine, saveCurrentProgress, toc.length, setIsPositionRestored, replaceRenderedChapter],
  );

  const rollbackProgress = useCallback(
    async () => {
      if (!bookId || !engine) return;
      const key = `reader-progress-rollback-${bookId}`;
      let list: {
        chapterId: string;
        chapterIndex: number;
        offset?: number;
        paragraphIndex?: number;
        characterOffset?: number;
        percentage?: number;
      }[] = [];
      try {
        list = JSON.parse(localStorage.getItem(key) || "[]");
      } catch {}

      if (list.length === 0) {
        showToast(strings.sync.progressRollbackEmpty);
        return;
      }

      const rollbackItem = list[list.length - 1];

      await progressSaveCoordinator.saveNow({
        bookId,
        chapterId: rollbackItem.chapterId,
        chapterIndex: rollbackItem.chapterIndex,
        offset: rollbackItem.offset || 0,
        paragraphIndex: rollbackItem.paragraphIndex || 0,
        characterOffset: rollbackItem.characterOffset || 0,
        percentage: rollbackItem.percentage || 0,
        updatedAt: new Date().toISOString(),
      });

      clearAutoFlipTimer();
      setIsPositionRestored(false);
      await engine.loadChapter(rollbackItem.chapterIndex);
      const currentChapter = engine.getCurrentChapter();
      if (!currentChapter) {
        setIsPositionRestored(true);
        showToast(strings.reader?.loadChapterFailed || "加载历史章节失败");
        return;
      }
      setChapter(currentChapter);
      replaceRenderedChapter(currentChapter);
      setShowMenu(false);

      const container = contentRef.current;
      restoreScrollPositionStable(
        container,
        rollbackItem.offset || 0,
        settings.pageMode,
        async (finalOffset, maxOffset) => {
          if (container) {
            const chapterRoot = getRenderedChapterElement(
              container,
              rollbackItem.chapterIndex,
            ) ?? container;
            let targetEl: Element | null = null;
            if (typeof rollbackItem.paragraphIndex === "number" && rollbackItem.paragraphIndex >= 0) {
              targetEl = chapterRoot.querySelector(
                `p[data-idx="${rollbackItem.paragraphIndex}"]`,
              );
            }
            if (targetEl) {
              targetEl.classList.remove("ink-highlight-flash");
              void (targetEl as HTMLElement).offsetWidth;
              targetEl.classList.add("ink-highlight-flash");
              setTimeout(() => {
                targetEl?.classList.remove("ink-highlight-flash");
              }, 3200);
            } else {
              if (settings.pageMode === "scroll") {
                container.scrollTo({ top: rollbackItem.offset || 0, behavior: "smooth" });
              } else {
                container.scrollTo({ left: rollbackItem.offset || 0, behavior: "smooth" });
              }
            }
          } else {
            window.scrollTo({ top: rollbackItem.offset || 0, behavior: "smooth" });
          }

          if (currentChapter) {
            const offsetRatio = maxOffset > 0 ? finalOffset / maxOffset : 0;
            setReadingProgress(
              computeOverallProgress(currentChapter.index, toc.length || 1, offsetRatio)
            );
          }
        },
        rollbackItem.paragraphIndex,
        rollbackItem.characterOffset,
        rollbackItem.chapterIndex,
      );

      let successMsg = strings.sync.progressRollbackSuccess;
      if (successMsg.includes("{chapter}")) {
        successMsg = successMsg.replace("{chapter}", String(rollbackItem.chapterIndex + 1));
      }
      showToast(successMsg);
    },
    [bookId, engine, settings.pageMode, toc.length, clearAutoFlipTimer, showToast, setIsPositionRestored, progressSaveCoordinator, replaceRenderedChapter],
  );

  const handleSummarize = useCallback(async (intent: AIReadingIntent = "summary") => {
    if (!chapter) return;
    setIsAiLoading(true);
    setActivePanel("ai");
    setShowMenu(false);

    try {
      // 1. 纯前端异步高稳定性 SHA-256 运算器
      const computeSha256Async = async (rawText: string): Promise<string> => {
        const encoder = new TextEncoder();
        const dataBytes = encoder.encode(rawText);
        const cryptoObj = typeof window !== "undefined"
          ? (window.crypto || (window as unknown as { msCrypto?: Crypto }).msCrypto)
          : (typeof globalThis !== "undefined" ? (globalThis as unknown as { crypto?: Crypto }).crypto : null);

        if (!cryptoObj || !cryptoObj.subtle) {
          return "legacy-fallback-hash";
        }
        const hashBuffer = await cryptoObj.subtle.digest("SHA-256", dataBytes);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
      };

      const sourceHash = await computeSha256Async(chapter.content);
      const model = "gpt-3.5-turbo";
      const promptVersion = `reader-ai-v3:${intent}`;

      // 2. 跨端计算与后端 100% 物理对称的 HMAC 强哈希主键 (AISigKey)
      const aiSigKey = await generateAiSigKeyAsync(sourceHash, model, promptVersion, bookId);
      console.log(`[AI-Reader] 🛡️ 正在进行 PWA 侧 L1 级本地 IndexedDB 缓存检索. Key: ${aiSigKey}`);

      // 3. 拦截器 L1：优先在前端离线 aiViews 数据库中寻找
      const cached = await db.aiViews.get(aiSigKey);
      if (cached) {
        console.log(`[AI-Reader] 🎉 命中 PWA 侧 L1 本地缓存！5ms 闪电无网直出。`);
        setAiSummary(cached.summary);
        setIsAiLoading(false);
        return;
      }

      console.log(`[AI-Reader] 🚨 L1 缓存未命中，开始唤醒 L2/L3 后端服务穿透...`);

      // 4. 穿透：调用 NestJS 后端 L2 SQLite (及大模型 L3)
      const response = await fetch(apiUrl("/ai/analyze"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getShareHeaders(),
          ...(await getAIConfigHeaders()),
        },
        body: JSON.stringify({
          text: chapter.content,
          bookId,
          chapterIndex: chapter.index,
          intent,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }

      const data = await response.json();
      const generatedSummary = data.summary;

      // 5. 将刚生成的高质量大模型摘要同步、原子化地落库到前端 L1 IndexedDB 备用
      const aiViewItem = {
        id: aiSigKey,
        bookId,
        chapterIndex: chapter.index,
        sourceHash,
        summary: generatedSummary,
        model,
        promptVersion,
        createdAt: new Date().toISOString(),
      };

      await db.aiViews.put(aiViewItem);
      console.log(`[AI-Reader] ✨ 已将最新生成的 AI 章节摘要归档至本地 L1 IndexedDB 库。Key: ${aiSigKey}`);

      setAiSummary(generatedSummary);
    } catch (error) {
      console.error("AI Summarize failed:", error);
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setAiSummary(strings.network.offlineAiHint);
      } else {
        setAiSummary(strings.reader.aiError);
      }
    } finally {
      setIsAiLoading(false);
    }
  }, [chapter, bookId]);


  const handleAsk = useCallback(async (question: string) => {
    if (!chapter || !question.trim()) return;
    setIsAiLoading(true);
    setActivePanel("ai");

    try {
      const response = await fetch(apiUrl("/ai/chat"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getShareHeaders(),
          ...(await getAIConfigHeaders()),
        },
        body: JSON.stringify({
          bookId,
          chapterIndex: chapter.index,
          question: question.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 500 && (errorData.message || "").includes("AI_NOT_CONFIGURED")) {
          setAiSummary(strings.reader.aiNotConfigured || "AI 服务未配置。请在设置中配置你的 API 密钥，或联系管理员配置服务端 AI。");
        } else {
          throw new Error(`Server responded with ${response.status}`);
        }
        return;
      }

      const data = await response.json();
      // 格式化回答为可读的对话式摘要
      const formattedAnswer = `💬 **${question.trim()}**

${data.answer || "未能生成回答。"}`;
      setAiSummary(formattedAnswer);
    } catch (error) {
      console.error("AI Chat failed:", error);
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setAiSummary(strings.network.offlineAiHint);
      } else {
        setAiSummary(strings.reader.aiError);
      }
    } finally {
      setIsAiLoading(false);
    }
  }, [chapter, bookId]);

  const clearAiSession = useCallback(async () => {
    if (!chapter) return;
    try {
      const computeSha256Async = async (rawText: string): Promise<string> => {
        const encoder = new TextEncoder();
        const dataBytes = encoder.encode(rawText);
        const cryptoObj = typeof window !== "undefined"
          ? (window.crypto || (window as unknown as { msCrypto?: Crypto }).msCrypto)
          : (typeof globalThis !== "undefined" ? (globalThis as unknown as { crypto?: Crypto }).crypto : null);

        if (!cryptoObj || !cryptoObj.subtle) {
          return "legacy-fallback-hash";
        }
        const hashBuffer = await cryptoObj.subtle.digest("SHA-256", dataBytes);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
      };

      const sourceHash = await computeSha256Async(chapter.content);
      const model = "gpt-3.5-turbo";
      const aiSigKeys = await Promise.all(
        AI_READING_INTENTS.map((intent) =>
          generateAiSigKeyAsync(
            sourceHash,
            model,
            `reader-ai-v3:${intent}`,
            bookId,
          ),
        ),
      );

      await db.aiViews.bulkDelete(aiSigKeys);

      setAiSummary("");
      showToast("🧹 伴读拂尘，已清空本章会话缓存。");
    } catch (error) {
      console.error("[AI-Reader] 清空伴读会话发生故障:", error);
      showToast("💡 存储繁忙，清空伴读失败。");
    }
  }, [chapter, bookId, showToast]);


  const prepareSemanticLayoutRestore = useCallback(
    (targetMode: "scroll" | "pagination") => {
      if (!chapter) return;
      const retained = semanticLayoutAnchorRef.current;
      const panelAnchor = panelSemanticAnchorRef.current;
      const latest = latestSemanticAnchorRef.current;
      const anchor = retained ?? panelAnchor ?? latest ?? {
        chapterIndex: chapter.index,
        ...getPrecisePosition(),
      };
      if (anchor.chapterIndex !== chapter.index) {
        const anchoredChapter = renderedChaptersRef.current.find(
          (candidate) => candidate.index === anchor.chapterIndex,
        );
        if (anchoredChapter) {
          engine?.hydrateChapter(anchoredChapter);
          setChapter(anchoredChapter);
        }
      }
      if (targetMode === "pagination") {
        // PaginatedReader owns semantic page restoration. A second parent-level
        // scrollIntoView would emit a page-start anchor and overwrite the exact
        // character selected before the mode change.
        pendingScrollRestoreRef.current = null;
        semanticLayoutAnchorRef.current = null;
        setPaginationAnchor(anchor);
        setIsPositionRestored(true);
        return;
      }
      semanticLayoutAnchorRef.current = anchor;
      pendingScrollRestoreRef.current = {
        offset: 0,
        paragraphIndex: anchor.paragraphIndex,
        characterOffset: anchor.characterOffset,
        onSettled: () => {
          if (semanticLayoutAnchorRef.current === anchor) {
            semanticLayoutAnchorRef.current = null;
          }
        },
      };
      setIsPositionRestored(false);
    },
    [chapter, engine, getPrecisePosition, setIsPositionRestored],
  );

  const updateFontSize = useCallback(
    (delta: number) => {
      if (settings.pageMode === "scroll") {
        prepareSemanticLayoutRestore("scroll");
      }

      const newSize = Math.max(
        14,
        Math.min(36, settingsRef.current.fontSize + delta),
      );
      applySettings({ fontSize: newSize });

    },
    [applySettings, prepareSemanticLayoutRestore, settings.pageMode],
  );

  const updateTheme = useCallback(
    (theme: ThemeName) => {
      applySettings({ theme });
    },
    [applySettings],
  );

  const updateFontFamily = useCallback(
    (fontFamily: "kaiti" | "songti" | "heiti") => {
      if (settings.pageMode === "scroll") {
        prepareSemanticLayoutRestore("scroll");
      }

      applySettings({ fontFamily });

    },
    [applySettings, prepareSemanticLayoutRestore, settings.pageMode],
  );

  const updatePageMode = useCallback(
    (mode: "scroll" | "pagination") => {
      if (!chapter) return;
      if (mode === settings.pageMode) return;
      prepareSemanticLayoutRestore(mode);

      applySettings({ pageMode: mode });
    },
    [applySettings, chapter, prepareSemanticLayoutRestore, settings.pageMode],
  );

  const updateParagraphSpacing = useCallback(
    (spacing: number) => {
      if (settings.pageMode === "scroll") {
        prepareSemanticLayoutRestore("scroll");
      }

      applySettings({ paragraphSpacing: spacing });

    },
    [applySettings, prepareSemanticLayoutRestore, settings.pageMode],
  );

  const updateLetterSpacing = useCallback(
    (spacing: number) => {
      if (settings.pageMode === "scroll") {
        prepareSemanticLayoutRestore("scroll");
      }

      applySettings({ letterSpacing: spacing });

    },
    [applySettings, prepareSemanticLayoutRestore, settings.pageMode],
  );

  const updateLineHeight = useCallback(
    (height: number) => {
      if (settings.pageMode === "scroll") {
        prepareSemanticLayoutRestore("scroll");
      }

      applySettings({ lineHeight: height });

    },
    [applySettings, prepareSemanticLayoutRestore, settings.pageMode],
  );

  const updateAutoFlipAtBottom = useCallback(
    (enabled: boolean) => {
      applySettings({ autoFlipAtBottom: enabled });
      if (!enabled) {
        clearAutoFlipTimer();
      }
    },
    [applySettings, clearAutoFlipTimer],
  );

  const regrantPermission = useCallback(async () => {
    try {
      const book = await db.books.get(bookId);
      if (!book) return false;
      const sourceId = await findPhysicalSourceId(book);
      if (!sourceId) return false;
      const source = await db.librarySources.get(sourceId);
      if (!source) return false;
      const handle = (source as unknown as { directoryHandle?: FileSystemDirectoryHandle }).directoryHandle;
      if (handle) {
        const res = await (handle as unknown as { requestPermission(options?: { mode: "read" | "readwrite" }): Promise<PermissionState> }).requestPermission({ mode: "read" });
        if (res === "granted") {
          await db.books.update(bookId, { sourceAvailability: "source_available" });
          setError(null);
          return true;
        }
      }
    } catch (err) {
      console.error("regrantPermission 唤醒权限失败:", err);
    }
    return false;
  }, [bookId]);

  const currentThemeColors = THEMES[settings.theme] || THEMES.paper;
  const isPagination = settings.pageMode === "pagination";

  return {
    chapter,
    renderedChapters,
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
    handlePrevChapterActive,
    handleNextChapterActive,
    handlePageNext,
    handlePagePrev,
    addBookmark,
    addBookmarkWithNote,
    jumpToBookmark,
    handleSummarize,
    handleAsk,
    clearAiSession,
    updateFontSize,
    updateTheme,
    updatePageMode,
    updateFontFamily,
    updateParagraphSpacing,
    updateLetterSpacing,
    updateLineHeight,
    seekToProgress,
    readingProgress,
    paginationAnchor,
    savePaginationAnchor,
    currentThemeColors,
    isPagination,
    toast,
    progressSaveStatus,
    retryProgressSave,
    isFlipCooldown,
    updateAutoFlipAtBottom,
    autoFlipCountdown,
    rollbackProgress,
    showToast,
    error,
    cacheEntireBook: async (onProg?: (p: number) => void) => {
      await cacheEntireBook(bookId, onProg);
    },
    regrantPermission,
    book,
    sourceFolderId: book?.sourceFolderId,
  };
}

/**
 * 🍃 原子化全量离线缓存整本书
 * 从 ContentLocator 或 MultiFileBook 递归批量读取并塞满 db.chapters，变更 cacheStatus = 'chapters_full'
 */
export async function cacheEntireBook(
  bookId: string,
  onProgress?: (progress: number) => void
): Promise<void> {
  const book = await db.books.get(bookId);
  if (!book) throw new Error("书籍不存在");

  if (book.sourceType !== "folder_index" && book.sourceType !== "folder_multi_file_book") {
    throw new Error("此书不支持本地缓存");
  }

  const locator = book.contentLocator;
  const sourceId = await findPhysicalSourceId(book);
  if (!sourceId) throw new Error("未找到物理来源标识");

  const source = await db.librarySources.get(sourceId);
  if (!source) throw new Error("未找到对应的物理来源");

  const handle = (source as unknown as { directoryHandle?: FileSystemDirectoryHandle }).directoryHandle;
  if (!handle) throw new Error("物理句柄已丢失，请重新授权");

  const perm = await (handle as unknown as { queryPermission(options?: { mode: "read" | "readwrite" }): Promise<PermissionState> }).queryPermission({ mode: "read" });
  if (perm !== "granted") {
    throw new Error("PERMISSION_REQUIRED");
  }

  if (book.sourceType === "folder_multi_file_book" && book.multiFileBook) {
    const chapterFiles = book.multiFileBook.chapterFiles;
    const total = chapterFiles.length;
    for (let i = 0; i < total; i++) {
      const chFile = chapterFiles[i];
      const exists = await db.chapters.where("[bookId+index]").equals([bookId, chFile.index]).first();
      if (!exists) {
        const fileHandle = await getFileHandleWithHealing(handle, chFile.relativePath, bookId, "multi_file_chapter", chFile.index);
        const file = await fileHandle.getFile();
        const content = await decodeBlobAsync(file, "gb18030");
        await db.chapters.put({
          id: createId(),
          bookId,
          index: chFile.index,
          title: chFile.title,
          content,
        });
      }
      onProgress?.(Math.round(((i + 1) / total) * 100));
    }
  } else if (book.sourceType === "folder_index" && locator) {
    const indices = await db.txtChapterIndices.where("bookId").equals(bookId).toArray();
    indices.sort((a, b) => a.index - b.index);
    const total = indices.length;
    if (total === 0) throw new Error("未生成章节索引目录");

    const fileHandle = await getFileHandleWithHealing(handle, locator.relativePath, bookId, "file");
    const file = await fileHandle.getFile();

    for (let i = 0; i < total; i++) {
      const idxRecord = indices[i];
      const exists = await db.chapters.where("[bookId+index]").equals([bookId, idxRecord.index]).first();
      if (!exists) {
        const slicedBlob = file.slice(idxRecord.startOffset, idxRecord.endOffset);
        const content = await decodeBlobAsync(slicedBlob, idxRecord.encoding);
        await db.chapters.put({
          id: createId(),
          bookId,
          index: idxRecord.index,
          title: idxRecord.title,
          content,
        });
      }
      onProgress?.(Math.round(((i + 1) / total) * 100));
    }
  }

  await db.books.update(bookId, {
    cacheStatus: "chapters_full",
    sourceAvailability: "full_cached",
  });
}
