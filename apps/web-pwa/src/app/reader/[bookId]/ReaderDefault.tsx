"use client";

import { strings } from "@/lib/i18n";
import { TocDrawer } from "@/components/reader/TocDrawer";
import { AIReaderPanel } from "@/components/reader/AIReaderPanel";
import { PaginatedReader, type PaginatedReaderHandle } from "@/components/reader/PaginatedReader";
import { SettingsSheet } from "@/components/reader/SettingsSheet";
import { ReaderTopBar } from "@/components/reader/ReaderTopBar";
import { ReaderBottomBar } from "@/components/reader/ReaderBottomBar";
import { ReaderContent } from "@/components/reader/ReaderContent";
import { ReaderDialogSurface } from "@/components/reader/ReaderDialogSurface";
import { useReader } from "@/hooks/useReader";
import { readerTokens } from "@reader/shared-types";
import { useVirtualRouter } from "@/lib/route-store";
import { useCallback, useEffect, useRef, useState, type MouseEvent, type TouchEvent } from "react";
import { GestureRecognizer } from "@reader/gesture-core";

function isInteractiveReaderTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest("button, input, a, textarea, select, [role='button']"),
    )
  );
}

const recognizer = new GestureRecognizer();

export function ReaderDefault({ bookId }: { bookId: string }) {
  const router = useVirtualRouter();
  const mainRef = useRef<HTMLDivElement>(null);
  const paginatedReaderRef = useRef<PaginatedReaderHandle>(null);
  const {
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
    addBookmark,
    jumpToBookmark,
    handleSummarize,
    handleAsk,
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
    addBookmarkWithNote,
    showToast,
    clearAiSession,
    error,
    regrantPermission,
    sourceFolderId,
  } = useReader(bookId);

  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);
  const [selectedText, setSelectedText] = useState("");
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [userNoteText, setUserNoteText] = useState("");
  const [isDesktopViewport, setIsDesktopViewport] = useState<boolean | null>(null);
  const paginationTouchRef = useRef<{ x: number; y: number; time: number } | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const syncViewport = () => setIsDesktopViewport(media.matches);
    syncViewport();
    media.addEventListener("change", syncViewport);
    return () => media.removeEventListener("change", syncViewport);
  }, []);

  // 🏮 分页模式下将 contentRef 指向 PaginatedReader 内部的 scroll 容器
  useEffect(() => {
    if (isPagination) {
      const scrollContainer = paginatedReaderRef.current?.getScrollContainer();
      if (scrollContainer) {
        (contentRef as React.MutableRefObject<HTMLDivElement | null>).current = scrollContainer;
      }
    }
  }, [isPagination, contentRef, chapter?.id, isDesktopViewport]);

  const getActivePaginatedReader = useCallback(() => {
    return paginatedReaderRef.current;
  }, []);

  const handleVisiblePageNext = useCallback(async () => {
    if (isPagination && getActivePaginatedReader()?.nextPage()) return;
    await handleNext();
  }, [getActivePaginatedReader, handleNext, isPagination]);

  const handleVisiblePagePrev = useCallback(async () => {
    if (isPagination && getActivePaginatedReader()?.prevPage()) return;
    await handlePrev();
  }, [getActivePaginatedReader, handlePrev, isPagination]);

  const handleVisibleTouchStart = useCallback((event: TouchEvent<HTMLDivElement>) => {
    if (!isPagination) {
      handleContentTouchStart(event);
      return;
    }
    if (isInteractiveReaderTarget(event.target) || activePanel) return;
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) return;
    const touch = event.touches[0];
    if (!touch || touch.clientX < 30 || touch.clientX > window.innerWidth - 30) {
      paginationTouchRef.current = null;
      return;
    }
    paginationTouchRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    };
  }, [activePanel, handleContentTouchStart, isPagination]);

  const handleVisibleTouchEnd = useCallback((event: TouchEvent<HTMLDivElement>) => {
    if (!isPagination) {
      handleContentTouchEnd(event);
      return;
    }
    const start = paginationTouchRef.current;
    paginationTouchRef.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) return;
    const selection = window.getSelection();
    const deltaX = touch.clientX - start.x;
    if (selection && !selection.isCollapsed) {
      if (Math.abs(deltaX) <= 70) return;
      selection.removeAllRanges();
    }
    const action = recognizer.getSwipeAction(
      { x: start.x, y: start.y },
      { x: touch.clientX, y: touch.clientY },
      Date.now() - start.time,
    );
    if (action === "swipeLeft" || action === "swipeUp") {
      event.preventDefault();
      void handleVisiblePageNext();
    } else if (action === "swipeRight" || action === "swipeDown") {
      event.preventDefault();
      void handleVisiblePagePrev();
    }
  }, [handleContentTouchEnd, handleVisiblePageNext, handleVisiblePagePrev, isPagination]);

  const [aiInput, setAiInput] = useState(""); // 🏮 联动 AI 伴读的输入框内容
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;

    const handleResize = () => {
      const vv = window.visualViewport;
      if (!vv) return;
      const height = window.innerHeight - vv.height;
      setKeyboardHeight(height > 60 ? height : 0);
    };

    const vv = window.visualViewport;
    vv.addEventListener("resize", handleResize);
    vv.addEventListener("scroll", handleResize);

    return () => {
      vv.removeEventListener("resize", handleResize);
      vv.removeEventListener("scroll", handleResize);
    };
  }, []);

  const handleMouseOrTouchUp = useCallback((e: { target: EventTarget | null }) => {
    // 排除点在气泡或弹窗内部的点击，防止点气泡按钮时选区被清空
    if (e.target instanceof Element && (e.target.closest(".selection-popover") || e.target.closest(".note-dialog"))) {
      return;
    }
    
    setTimeout(() => {
      const selection = window.getSelection();
      if (selection && selection.toString().trim().length > 0) {
        const text = selection.toString().trim();
        setSelectedText(text);
        
        try {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          setSelectionRect(rect);
        } catch (err) {
          console.warn("无法捕获选区位置:", err);
        }
      } else {
        // 清空
        setSelectionRect(null);
        setSelectedText("");
      }
    }, 50); // 稍微延迟，等待系统 Selection 更新
  }, []);

  // 监听全局划词选区事件
  useEffect(() => {
    document.addEventListener("mouseup", handleMouseOrTouchUp);
    document.addEventListener("touchend", handleMouseOrTouchUp);
    return () => {
      document.removeEventListener("mouseup", handleMouseOrTouchUp);
      document.removeEventListener("touchend", handleMouseOrTouchUp);
    };
  }, [handleMouseOrTouchUp]);

  const setActiveContentRef = useCallback(
    (node: HTMLDivElement | null, target: "desktop" | "mobile") => {
      if (!node || typeof window === "undefined") return;
      const isDesktop = window.matchMedia("(min-width: 768px)").matches;
      if ((target === "desktop" && isDesktop) || (target === "mobile" && !isDesktop)) {
        (contentRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }
    },
    [contentRef],
  );

  useEffect(() => {
    const updateActiveRef = () => {
      if (!mainRef.current) return;
      const isDesktop = window.matchMedia("(min-width: 768px)").matches;
      const selector = `[data-reader-content-canvas="${isDesktop ? "desktop" : "mobile"}"]`;
      const container = mainRef.current.querySelector(selector) as HTMLDivElement | null;
      if (container) {
        (contentRef as React.MutableRefObject<HTMLDivElement | null>).current = container;
      }
    };

    updateActiveRef();
    window.addEventListener("resize", updateActiveRef);
    return () => window.removeEventListener("resize", updateActiveRef);
  }, [contentRef, isPagination]);

  const handleMobileReaderClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      // 🏮 [FIX] 拦截划词状态下的点击误触翻页，仅清空选区并关闭气泡
      if (selectionRect) {
        window.getSelection()?.removeAllRanges();
        setSelectionRect(null);
        return;
      }

      // 1. 如果点击的是交互式目标（例如按钮），则立即直接放行，不触发翻页或唤出菜单
      if (isInteractiveReaderTarget(event.target)) return;

      // 2. 防抖冷却锁拦截非交互式点击（屏幕背景的翻页动作等），杜绝 Ghost Click 鬼点击
      if (isFlipCooldown()) {
        event.preventDefault();
        return;
      }

      if (activePanel) return;

      const bounds = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const width = bounds.width;

      // 使用手势核心识别点击行为
      const action = recognizer.getTapAction(x, width);

      // 在流式滚动模式（非 pagination）下，排除由于滑动触控松开引发的左右点击翻页，以防止 Ghost Click 暴跳
      if (!isPagination) {
        if (action === "menu") {
          setShowMenu((prev) => !prev);
        } else {
          // 在滚动模式下，点击左右非中间区域：若菜单已开启则关闭，若菜单未开启则忽略不处理，彻底降噪
          if (showMenu) {
            setShowMenu(false);
          }
        }
        return;
      }

      // 1. 如果菜单尚未显示
      if (!showMenu) {
        if (action === "prev") {
          void handleVisiblePagePrev();
        } else if (action === "next") {
          void handleVisiblePageNext();
        } else {
          // 点击中间区域，唤醒菜单
          setShowMenu(true);
        }
        return;
      }

      // 2. 如果菜单已经显示
      if (action === "prev") {
        void handleVisiblePagePrev();
        return;
      }

      if (action === "next") {
        void handleVisiblePageNext();
        return;
      }

      // 点击中间区域，隐藏菜单
      setShowMenu(false);
    },
    [showMenu, handleVisiblePagePrev, handleVisiblePageNext, setShowMenu, activePanel, isPagination, isFlipCooldown, selectionRect],
  );

  if (error) {
    const bg = currentThemeColors?.bg || "#F8F8F5";
    const text = currentThemeColors?.text || "#2F2A24";
    const isDark = settings.theme === "dark";
    return (
      <div
        className="flex h-screen items-center justify-center transition-colors duration-300 relative overflow-hidden"
        style={{ backgroundColor: bg, color: text }}
      >
        <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[radial-gradient(#2f2a24_1px,transparent_1px)] [background-size:16px_1px]" />
        
        <div 
          className="relative max-w-md w-[90%] p-8 rounded-2xl border backdrop-blur-xl shadow-2xl transition-all duration-500 transform hover:scale-[1.01] flex flex-col items-center text-center animate-in fade-in zoom-in duration-300"
          style={{
            backgroundColor: isDark ? "rgba(40, 40, 40, 0.85)" : "rgba(255, 252, 245, 0.85)",
            borderColor: isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(80, 65, 45, 0.15)",
            boxShadow: isDark 
              ? "0 20px 40px rgba(0, 0, 0, 0.4), inset 0 0 0 1px rgba(255,255,255,0.05)" 
              : "0 20px 40px rgba(80, 65, 45, 0.08), inset 0 0 0 1px rgba(255,255,255,0.6)"
          }}
        >
          <div 
            className="w-16 h-16 rounded-full flex items-center justify-center mb-6 border-2 border-dashed relative animate-spin-slow"
            style={{
              borderColor: isDark ? "#c84c3c" : "#b23e2d",
              color: isDark ? "#e06c5c" : "#b23e2d",
              backgroundColor: isDark ? "rgba(200, 76, 60, 0.05)" : "rgba(178, 62, 45, 0.03)",
            }}
          >
            <span className="font-serif text-2xl font-bold">🏮</span>
          </div>

          <h2 className="text-xl font-serif font-bold mb-3 tracking-wider">
            {strings.shelf.title}
          </h2>

          <p className="text-sm opacity-85 mb-8 leading-relaxed font-serif max-w-[280px]">
            {error}
          </p>

          <div className="flex flex-col sm:flex-row gap-3 w-full justify-center">
            <button
              onClick={() => router.push(sourceFolderId ? `/library?folderId=${sourceFolderId}` : "/library")}
              className="px-6 py-2.5 rounded-full text-xs font-serif font-semibold tracking-widest transition-all duration-300 border shadow-sm hover:opacity-90 active:scale-95"
              style={{
                backgroundColor: isDark ? "#3a3a3a" : "#fdfbf7",
                borderColor: isDark ? "rgba(255,255,255,0.15)" : "rgba(80, 65, 45, 0.25)",
                color: isDark ? "#E5E5E5" : "#2F2A24",
              }}
            >
              {strings.settings?.backToShelf || "返回书架"}
            </button>
            {error && (error.includes("权限") || error.includes("授权") || error.includes("PERMISSION_REQUIRED")) ? (
              <button
                onClick={async () => {
                  const granted = await regrantPermission();
                  if (granted) {
                    window.location.reload();
                  }
                }}
                className="px-6 py-2.5 rounded-full text-xs font-serif font-semibold tracking-widest transition-all duration-300 shadow-md text-white hover:opacity-95 active:scale-95"
                style={{
                  backgroundColor: isDark ? "#678055" : "#4e623e",
                }}
              >
                🔌 唤醒物理授权
              </button>
            ) : (
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-2.5 rounded-full text-xs font-serif font-semibold tracking-widest transition-all duration-300 shadow-md text-white hover:opacity-95 active:scale-95"
                style={{
                  backgroundColor: isDark ? "#c84c3c" : "#b23e2d",
                }}
              >
                重新展卷
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!chapter) {
    const bg = currentThemeColors?.bg || "#F8F8F5";
    const text = currentThemeColors?.text || "#2F2A24";
    return (
      <div
        className="flex h-screen items-center justify-center transition-colors duration-300 animate-pulse-short"
        style={{ backgroundColor: bg, color: text }}
      >
        <span className="text-sm font-semibold tracking-widest">{strings.reader.loading}</span>
      </div>
    );
  }

  const isDark = settings.theme === "dark";
  const borderColor = isDark ? "rgba(255,255,255,0.1)" : "rgba(80,65,45,0.12)";

  return (
    <main
      ref={mainRef}
      className="fixed inset-0 overflow-hidden transition-colors duration-300 md:flex md:items-center md:justify-center md:bg-[#F7F1E6]"
    >
      {/* 优雅非阻塞 Toast 消息层 */}
      {toast && (
        <div
          className="fixed top-24 left-1/2 -translate-x-1/2 z-[99] px-6 py-3 rounded-full text-xs font-semibold shadow-[0_8px_30px_rgb(0,0,0,0.12)] border backdrop-blur-md physics-spring animate-in fade-in slide-in-from-top-4"
          style={{
            backgroundColor: isDark ? "rgba(45, 45, 45, 0.85)" : "rgba(255, 252, 245, 0.85)",
            color: isDark ? "#E5E5E5" : "#2F2A24",
            borderColor: isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(80, 65, 45, 0.15)",
          }}
        >
          {toast}
        </div>
      )}

      <span className="sr-only" role="status" aria-live="polite">
        {progressSaveStatus.state === "pending"
          ? "正在保存阅读进度"
          : progressSaveStatus.state === "saved"
            ? "阅读进度已保存"
            : ""}
      </span>

      {progressSaveStatus.state === "failed" && (
        <div
          role="alert"
          className="fixed top-4 left-1/2 z-[100] flex min-h-11 -translate-x-1/2 items-center gap-3 rounded-xl border px-4 py-2 text-xs font-semibold shadow-lg"
          style={{
            backgroundColor: isDark ? "rgba(54, 35, 32, 0.96)" : "rgba(255, 247, 242, 0.96)",
            color: isDark ? "#FFD8CC" : "#8B2E20",
            borderColor: isDark ? "rgba(255, 155, 130, 0.35)" : "rgba(178, 62, 45, 0.24)",
          }}
        >
          <span>阅读进度尚未保存，请保持页面开启</span>
          <button
            type="button"
            onClick={() => void retryProgressSave()}
            className="min-h-11 rounded-lg border px-3 font-bold"
            style={{ borderColor: "currentColor" }}
          >
            重试
          </button>
        </div>
      )}

      {/* 
        Desktop Workspace Container 
        Matching SVG Max-width ~1372px (92 + 240 + 700 + 338 = 1370)
      */}
      <div
        className="hidden md:flex w-full h-[calc(100vh-64px)] max-w-[1372px] rounded-[12px] border shadow-sm overflow-hidden relative"
        style={{
          backgroundColor: currentThemeColors.bg,
          color: currentThemeColors.text,
          borderColor: borderColor,
        }}
      >
        {/* Reader Canvas (Flex-1) */}
        <div className="flex-1 flex flex-col min-w-0 bg-transparent relative h-full">
          <ReaderTopBar
            title={chapter.title}
            isVisible={true}
            isDesktop={true}
            progress={readingProgress}
            currentChapterIndex={chapter.index}
            totalChapters={toc.length}
            onBack={() => router.push(sourceFolderId ? `/library?folderId=${sourceFolderId}` : "/library")}
            onBookmark={addBookmark}
            onSettings={() => togglePanel("settings")}
            onToggleToc={() => togglePanel("toc")}
            onToggleAi={() => {
              togglePanel("ai");
              handleSummarize();
            }}
            onPrevChapter={handlePrevChapterActive}
            onNextChapter={handleNextChapterActive}
            backgroundDisabled={Boolean(activePanel)}
          />
          <div
            ref={(node) => setActiveContentRef(node, "desktop")}
            data-reader-content-canvas="desktop"
            inert={activePanel ? true : undefined}
            tabIndex={-1}
            onClick={handleMobileReaderClick}
            className={`flex-1 relative reader-gpu-accelerated ${
              isPagination
                ? "overflow-hidden"
                : "overflow-y-auto overflow-x-hidden"
            } transition-all duration-300 ease-out ${
              isPagination || isPositionRestored
                ? "opacity-100 blur-0 scale-100"
                : "opacity-0 blur-md scale-[0.995] pointer-events-none"
            }`}
            style={{
              scrollBehavior: isPagination ? "auto" : "smooth",
              overflowAnchor: isPagination ? "auto" : "none",
            }}
          >
            {/* 🏮 高级常驻侧栏展示时，点击 Canvas 内容区域自动优雅折叠收起遮罩 */}
            {activePanel && (activePanel === "toc" || activePanel === "ai") && (
              <div 
                className="absolute inset-0 z-30 bg-black/5 dark:bg-black/20 backdrop-blur-[0.5px] transition-opacity cursor-pointer"
                onClick={() => setActivePanel(null)}
              />
            )}

            {/* 🏮 左侧绝对定位磨砂 TOC 面板，完美规避 Canvas 多栏排版重绘与抖动 */}
            <div
              className={`absolute left-0 top-0 bottom-0 z-40 border-r transition-all duration-300 overflow-hidden bg-[rgba(255,252,245,0.92)] dark:bg-[rgba(30,30,30,0.92)] backdrop-blur-md ${
                activePanel === "toc" ? "w-[260px] translate-x-0 opacity-100" : "w-0 -translate-x-full opacity-0 border-r-0"
              }`}
              style={{ borderColor: borderColor }}
            >
              <div className="w-[260px] h-full">
                <TocDrawer
                  toc={toc}
                  bookmarks={bookmarks}
                  currentChapterIndex={chapter.index}
                  activeTab={activeTab}
                  setActiveTab={setActiveTab}
                  onJumpToChapter={jumpToChapter}
                  onJumpToBookmark={jumpToBookmark}
                  isMobileDrawer={false}
                  onClose={() => setActivePanel(null)}
                />
              </div>
            </div>

            {/* 🏮 右侧绝对定位磨砂 AI 伴读面板，完美规避 Canvas 多栏排版重绘与抖动 */}
            <div
              className={`absolute right-0 top-0 bottom-0 z-40 border-l transition-all duration-300 overflow-hidden bg-[rgba(255,252,245,0.92)] dark:bg-[rgba(30,30,30,0.92)] backdrop-blur-md ${
                activePanel === "ai" ? "w-[340px] translate-x-0 opacity-100" : "w-0 translate-x-full opacity-0 border-l-0"
              }`}
              style={{ borderColor: borderColor }}
            >
              <div className="w-[340px] h-full">
                <AIReaderPanel
                  isAiLoading={isAiLoading}
                  aiSummary={aiSummary}
                  isMobileDrawer={false}
                  isDark={isDark}
                  onClose={() => setActivePanel(null)}
                  aiInput={aiInput}
                  setAiInput={setAiInput}
                  onAsk={handleAsk}
                  onIntent={handleSummarize}
                  onClearSession={async () => {
                    await clearAiSession();
                    setAiInput("");
                  }}
                />
              </div>
            </div>

            {isPagination ? (
              isDesktopViewport === true ? (
                <PaginatedReader
                  key={`desktop-${chapter.id}`}
                  ref={paginatedReaderRef}
                  title={chapter.title}
                  content={chapter.content}
                  isDark={isDark}
                  fontSize={settings.fontSize}
                  lineHeight={settings.lineHeight}
                  fontFamily={settings.fontFamily || "kaiti"}
                  paragraphSpacing={settings.paragraphSpacing ?? 16}
                  letterSpacing={settings.letterSpacing ?? 0.03}
                  initialAnchor={paginationAnchor?.chapterIndex === chapter.index ? paginationAnchor : undefined}
                  onAnchorChange={savePaginationAnchor}
                  onBoundaryNext={handleNext}
                  onBoundaryPrev={handlePrev}
                />
              ) : null
            ) : isDesktopViewport === true ? (
              renderedChapters.map((ch) => (
                <div
                  key={ch.id}
                  className="chapter-container mx-auto px-6 pt-12 pb-[60px] md:px-12 border-b border-[rgba(80,65,45,0.08)] last:border-b-0"
                  data-chapter-index={ch.index}
                  style={{
                    maxWidth: `${readerTokens.layout.desktopContentMaxWidth}px`,
                  }}
                >
                  <ReaderContent
                    title={ch.title}
                    content={ch.content}
                    isDark={isDark}
                    isPagination={isPagination}
                    buttonVariant="default"
                    onPrev={undefined}
                    onNext={undefined}
                    style={{
                      fontSize: `${settings.fontSize}px`,
                      lineHeight: settings.lineHeight,
                      columnWidth: "auto",
                      columnGap: "48px",
                      height: "auto",
                      "--paragraph-spacing": `${settings.paragraphSpacing ?? 16}px`,
                      "--letter-spacing": `${settings.letterSpacing ?? 0.03}em`,
                      "--reader-font-family": `var(--font-${settings.fontFamily || "kaiti"})`,
                    } as React.CSSProperties}
                    titleClassName="text-3xl font-bold mb-10 font-serif text-center"
                    titleStyle={{ color: currentThemeColors.text }}
                  />
                </div>
              ))
            ) : null}
          </div>
        </div>
      </div>

      {/* 
        Mobile View Container (md:hidden) 
      */}
      <div
        className="md:hidden absolute inset-0 flex flex-col w-full h-full"
        style={{
          backgroundColor: currentThemeColors.bg,
          color: currentThemeColors.text,
        }}
      >
        {/* Mobile Top Toolbar Overlay */}
        <ReaderTopBar
          title={chapter.title}
          isVisible={showMenu}
          isDesktop={false}
          isDark={isDark}
          progress={readingProgress}
          currentChapterIndex={chapter.index}
          totalChapters={toc.length}
          onBack={() => router.push(sourceFolderId ? `/library?folderId=${sourceFolderId}` : "/library")}
          onBookmark={addBookmark}
          onSettings={() => togglePanel("settings")}
          backgroundDisabled={Boolean(activePanel)}
        />

        {/* Scrollable / Paginable Content Canvas */}
        <div
          ref={(node) => setActiveContentRef(node, "mobile")}
          data-reader-content-canvas="mobile"
          inert={activePanel ? true : undefined}
          tabIndex={-1}
          onClick={handleMobileReaderClick}
          onTouchStart={handleVisibleTouchStart}
          onTouchEnd={handleVisibleTouchEnd}
          className={`flex-1 relative reader-gpu-accelerated ${
            isPagination
              ? "overflow-y-auto overflow-x-hidden"
              : "overflow-y-auto overflow-x-hidden"
          } transition-all duration-300 ease-out ${
            isPositionRestored
              ? "opacity-100 blur-0"
              : "opacity-0 blur-md pointer-events-none"
          }`}
          style={{
            scrollBehavior: "smooth",
            overflowAnchor: isPagination ? "auto" : "none",
          }}
        >
          {isPagination ? (
            isDesktopViewport === false ? (
              <PaginatedReader
                key={`mobile-${chapter.id}`}
                ref={paginatedReaderRef}
                title={chapter.title}
                content={chapter.content}
                isDark={isDark}
                fontSize={settings.fontSize}
                lineHeight={settings.lineHeight}
                fontFamily={settings.fontFamily || "kaiti"}
                paragraphSpacing={settings.paragraphSpacing ?? 16}
                letterSpacing={settings.letterSpacing ?? 0.03}
                initialAnchor={paginationAnchor?.chapterIndex === chapter.index ? paginationAnchor : undefined}
                onAnchorChange={savePaginationAnchor}
                onBoundaryNext={handleNext}
                onBoundaryPrev={handlePrev}
              />
            ) : null
          ) : isDesktopViewport === false ? (
            renderedChapters.map((ch) => (
              <div
                key={ch.id}
                className="chapter-container mx-auto px-6 pt-12 pb-[60px] border-b border-[rgba(80,65,45,0.08)] last:border-b-0"
                data-chapter-index={ch.index}
                style={{
                  maxWidth: `${readerTokens.layout.tabletContentMaxWidth}px`,
                }}
              >
                <ReaderContent
                  title={ch.title}
                  content={ch.content}
                  isDark={isDark}
                  isPagination={isPagination}
                  buttonVariant="default"
                  onPrev={undefined}
                  onNext={undefined}
                  style={{
                    fontSize: `${settings.fontSize}px`,
                    lineHeight: settings.lineHeight,
                    columnWidth: "auto",
                    columnGap: "48px",
                    height: "auto",
                    "--paragraph-spacing": `${settings.paragraphSpacing ?? 16}px`,
                    "--letter-spacing": `${settings.letterSpacing ?? 0.03}em`,
                    "--reader-font-family": `var(--font-${settings.fontFamily || "kaiti"})`,
                  } as React.CSSProperties}
                  titleClassName="text-2xl font-bold mb-8 font-serif"
                />
              </div>
            ))
          ) : null}
        </div>

        {/* Mobile Bottom Bar Overlay */}
        <ReaderBottomBar
          isVisible={showMenu}
          activePanel={activePanel}
          isDark={isDark}
          progress={readingProgress}
          onToggleToc={() => togglePanel("toc")}
          onToggleProgress={() => togglePanel("progress")}
          onToggleAi={() => handleSummarize()}
          onToggleSettings={() => togglePanel("settings")}
          onToggleNightMode={handleNightModeToggle}
          onBookmark={addBookmark}
          onPagePrev={handleVisiblePagePrev}
          onPageNext={handleVisiblePageNext}
          onSeekProgress={seekToProgress}
          onPrevChapter={handlePrevChapterActive}
          onNextChapter={handleNextChapterActive}
          backgroundDisabled={Boolean(activePanel)}
        />

        {/* Mobile Settings/Progress Backdrop */}
        {(activePanel === "settings" || activePanel === "progress") && (
          <div
            className="fixed inset-0 z-40 bg-black/20"
            onClick={() => setActivePanel(null)}
          />
        )}

        {/* Settings Sheet */}
        <ReaderDialogSurface
          open={activePanel === "settings" && isDesktopViewport === false}
          label="阅读设置"
          onClose={() => setActivePanel(null)}
          fallbackFocus={() => contentRef.current}
          className="fixed bottom-3 inset-x-3 bg-transparent z-50 physics-spring reader-gpu-accelerated rounded-[24px] overflow-hidden mb-safe shadow-2xl"
          style={{
            transform: activePanel === "settings" ? "translateY(0)" : "translateY(calc(100% + 24px))"
          }}
        >
          <SettingsSheet
            settings={settings}
            updateFontSize={updateFontSize}
            updateTheme={updateTheme}
            updatePageMode={updatePageMode}
            updateFontFamily={updateFontFamily}
            updateParagraphSpacing={updateParagraphSpacing}
            updateLetterSpacing={updateLetterSpacing}
            updateLineHeight={updateLineHeight}
            updateAutoFlipAtBottom={updateAutoFlipAtBottom}
            isMobileSheet={true}
            onClose={() => setActivePanel(null)}
          />
        </ReaderDialogSurface>

        {/* Progress Sheet */}
        <ReaderDialogSurface
          open={activePanel === "progress" && isDesktopViewport === false}
          label="阅读进度"
          onClose={() => setActivePanel(null)}
          fallbackFocus={() => contentRef.current}
          className={`fixed bottom-3 inset-x-3 ${isDark ? "bg-[rgba(35,35,35,0.92)] text-[#CFCFCF]" : "bg-[rgba(255,255,255,0.92)] text-[#2F2A24]"} backdrop-blur-md z-50 px-5 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl physics-spring reader-gpu-accelerated rounded-[24px] mb-safe max-h-[60vh] overflow-y-auto`}
          style={{
            transform: activePanel === "progress" ? "translateY(0)" : "translateY(calc(100% + 24px))"
          }}
        >
          <div className="flex justify-between items-center mb-4">
            <h3
              className={`font-bold ${isDark ? "text-[#CFCFCF]" : "text-[#2F2A24]"}`}
            >
              阅读进度
            </h3>
            <button
              aria-label="关闭阅读进度"
              onClick={() => setActivePanel(null)}
              className={`${isDark ? "text-[#8F8F8F] hover:bg-white/10" : "text-[#6F665B] hover:bg-black/5"} p-1 rounded-full`}
            >
              ✕
            </button>
          </div>
          <div className="grid grid-cols-[40px_36px_minmax(0,1fr)_36px_40px] items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                void handlePrevChapterActive();
              }}
              title="上一章"
              aria-label="上一章"
              className={`${isDark ? "text-[#CFCFCF] hover:bg-white/10" : "text-[#2F2A24] hover:bg-[#F4ECD8]"} h-9 rounded-full text-xs font-bold transition-all active:scale-90`}
            >
              ⏮
            </button>
            <button
              onClick={handleVisiblePagePrev}
              className={`${isDark ? "text-[#CFCFCF] hover:bg-white/10" : "text-[#2F2A24] hover:bg-[#F4ECD8]"} h-9 rounded-full text-xl`}
            >
              ‹
            </button>
            <input
              aria-label="拖动阅读进度"
              type="range"
              min={0}
              max={100}
              step={0.1}
              value={readingProgress}
              onChange={(event) =>
                seekToProgress(Number(event.currentTarget.value))
              }
              className="w-full accent-[#678055]"
            />
            <button
              onClick={handleVisiblePageNext}
              className={`${isDark ? "text-[#CFCFCF] hover:bg-white/10" : "text-[#2F2A24] hover:bg-[#F4ECD8]"} h-9 rounded-full text-xl`}
            >
              ›
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                void handleNextChapterActive();
              }}
              title="下一章"
              aria-label="下一章"
              className={`${isDark ? "text-[#CFCFCF] hover:bg-white/10" : "text-[#2F2A24] hover:bg-[#F4ECD8]"} h-9 rounded-full text-xs font-bold transition-all active:scale-90`}
            >
              ⏭
            </button>
          </div>
          <div
            className={`flex justify-between text-sm ${isDark ? "text-[#8F8F8F]" : "text-[#6F665B]"}`}
          >
            <span>{chapter?.title}</span>
            <span>
              {Math.round(readingProgress)}% · {(chapter?.index || 0) + 1} /{" "}
              {toc.length} 章
            </span>
          </div>
          <div className="mt-6 flex justify-center">
            <button
              onClick={() => {
                void rollbackProgress();
              }}
              className={`w-full py-2.5 rounded-full text-xs font-semibold tracking-wider transition-all active:scale-[0.98] border ${
                isDark
                  ? "bg-[#678055]/20 hover:bg-[#678055]/30 border-[#678055]/40 text-[#EEF2E9]"
                  : "bg-[#678055] hover:bg-[#556b46] border-[#678055] text-white shadow-[0_4px_12px_rgba(103,128,85,0.2)]"
              }`}
            >
              {strings.sync.progressRollbackBtn}
            </button>
          </div>
        </ReaderDialogSurface>
      </div>

      {/* Shared Drawers (TOC & AI) and Backdrop for both Mobile and Desktop */}
      {(activePanel === "toc" || activePanel === "ai") && (
        <div
          className="fixed inset-0 z-40 bg-black/20 md:hidden"
          onClick={() => setActivePanel(null)}
        />
      )}

      {/* TOC Drawer (Shared) */}
      <ReaderDialogSurface
        open={activePanel === "toc" && isDesktopViewport === false}
        label="阅读目录"
        onClose={() => setActivePanel(null)}
        fallbackFocus={() => contentRef.current}
        className="fixed inset-y-0 left-0 w-[280px] max-w-[72vw] bg-[var(--theme-bg)] z-50 shadow-xl physics-spring reader-gpu-accelerated md:hidden"
        style={{
          backgroundColor: currentThemeColors.bg,
          transform: activePanel === "toc" ? "translateX(0)" : "translateX(-100%)"
        }}
      >
        <TocDrawer
          toc={toc}
          bookmarks={bookmarks}
          currentChapterIndex={chapter.index}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onJumpToChapter={jumpToChapter}
          onJumpToBookmark={jumpToBookmark}
          isMobileDrawer={true}
          onClose={() => setActivePanel(null)}
        />
      </ReaderDialogSurface>

      {/* AI Drawer (Shared) */}
      <ReaderDialogSurface
        open={activePanel === "ai" && isDesktopViewport === false}
        label="伴读"
        onClose={() => setActivePanel(null)}
        fallbackFocus={() => contentRef.current}
        className="fixed inset-y-0 right-0 w-[280px] max-w-[72vw] bg-[var(--theme-bg)] z-50 shadow-xl physics-spring reader-gpu-accelerated md:hidden"
        style={{
          backgroundColor: currentThemeColors.bg,
          transform: activePanel === "ai" ? "translateX(0)" : "translateX(100%)"
        }}
      >
        <AIReaderPanel
          isAiLoading={isAiLoading}
          aiSummary={aiSummary}
          isMobileDrawer={true}
          isDark={isDark}
          onClose={() => setActivePanel(null)}
          aiInput={aiInput}
          setAiInput={setAiInput}
          onAsk={handleAsk}
          onIntent={handleSummarize}
          onClearSession={async () => {
            await clearAiSession();
            setAiInput("");
          }}
        />
      </ReaderDialogSurface>

      {/* Desktop Settings Modal Overlay */}
      {activePanel === "settings" && (
        <ReaderDialogSurface
          open={isDesktopViewport === true}
          label="阅读设置"
          onClose={() => setActivePanel(null)}
          fallbackFocus={() => contentRef.current}
          className="hidden md:flex fixed inset-0 z-50 bg-black/20 items-center justify-center"
          onClick={() => setActivePanel(null)}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <SettingsSheet
              settings={settings}
              updateFontSize={updateFontSize}
              updateTheme={updateTheme}
              updatePageMode={updatePageMode}
              updateFontFamily={updateFontFamily}
              updateParagraphSpacing={updateParagraphSpacing}
              updateLetterSpacing={updateLetterSpacing}
              updateLineHeight={updateLineHeight}
              updateAutoFlipAtBottom={updateAutoFlipAtBottom}
              isMobileSheet={false}
            />
          </div>
        </ReaderDialogSurface>
      )}

      {/* 磨砂玻璃自适应自动换章倒计时胶囊 */}
      {autoFlipCountdown !== null && (
        <div className="fixed bottom-32 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in zoom-in-95 duration-200">
          <button
            onClick={() => handleNext()}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-full text-xs font-bold border backdrop-blur-md transition-all active:scale-95 border-[#678055]/30 bg-[rgba(238,242,233,0.92)] text-[#678055] dark:border-[#EEF2E9]/20 dark:bg-[rgba(45,45,45,0.92)] dark:text-[#EEF2E9] shadow-[0_8px_30px_rgba(103,128,85,0.15)]"
          >
            ✨ {autoFlipCountdown.toFixed(1)}s 后自动切到下一章... [立即跳转]
          </button>
        </div>
      )}

      {/* 极奢国风毛玻璃划词气泡 (SelectionPopover) */}
      {selectionRect && !showNoteDialog && (
        <div
          className="selection-popover fixed z-40 bg-[rgba(255,252,245,0.92)] dark:bg-[rgba(30,30,30,0.92)] backdrop-blur-md border border-[rgba(80,65,45,0.15)] dark:border-[rgba(255,255,255,0.12)] rounded-full shadow-[0_10px_32px_rgba(80,65,45,0.12)] px-4 py-1.5 flex items-center gap-3.5 transition-all duration-300 animate-in fade-in zoom-in-95"
          style={{
            // 🏮 [FIX] 修复 fixed 元素在页面滚动时漂移的问题，并增加顶部空间不足时的自适应底部避让
            top: `${selectionRect.top - 54 < 12 ? selectionRect.bottom + 12 : selectionRect.top - 54}px`,
            left: `${selectionRect.left + selectionRect.width / 2}px`,
            transform: "translateX(-50%)",
          }}
        >
          <button
            onClick={() => setShowNoteDialog(true)}
            className="text-xs font-semibold font-serif text-[#2F2A24] dark:text-[#E5E5E5] hover:text-[#9A6A3A] dark:hover:text-[#D2A66A] transition-colors py-1 flex items-center gap-1.5 active:scale-95"
          >
            ✍️ 记笔记
          </button>
          <span className="w-[1px] h-3.5 bg-[rgba(80,65,45,0.12)] dark:bg-[rgba(255,255,255,0.12)]" />
          <button
            onClick={() => {
              // AI 伴读强连通
              setAiInput((prev) => prev ? `${prev}\n对于这段话：“${selectedText}”` : `我想请问关于这段话：“${selectedText}”的看法。`);
              setActivePanel("ai");
              // 清除
              window.getSelection()?.removeAllRanges();
              setSelectionRect(null);
            }}
            className="text-xs font-semibold font-serif text-[#2F2A24] dark:text-[#E5E5E5] hover:text-[#9A6A3A] dark:hover:text-[#D2A66A] transition-colors py-1 flex items-center gap-1.5 active:scale-95"
          >
            ✨ AI伴读
          </button>
          <span className="w-[1px] h-3.5 bg-[rgba(80,65,45,0.12)] dark:bg-[rgba(255,255,255,0.12)]" />
          <button
            onClick={() => {
              navigator.clipboard.writeText(selectedText);
              showToast("引文已成功复制至剪贴板");
              window.getSelection()?.removeAllRanges();
              setSelectionRect(null);
            }}
            className="text-xs font-semibold font-serif text-[#2F2A24] dark:text-[#E5E5E5] hover:text-[#9A6A3A] dark:hover:text-[#D2A66A] transition-colors py-1 flex items-center gap-1.5 active:scale-95"
          >
            📖 复制
          </button>
        </div>
      )}

      {/* 文人落墨·写笔记宣纸小弹窗 (NoteDialog) */}
      {showNoteDialog && (
        <div 
          className="fixed inset-0 z-50 flex sm:items-center sm:justify-center items-end justify-center bg-black/30 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => {
            setShowNoteDialog(false);
            setUserNoteText("");
            window.getSelection()?.removeAllRanges();
            setSelectionRect(null);
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="note-dialog relative w-full max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:rounded-t-[24px] max-sm:rounded-b-none max-sm:pb-[calc(1.75rem+env(safe-area-inset-bottom))] max-w-md bg-[#FAF6EE] dark:bg-[#25231F] rounded-[24px] border border-[#DFD1BF] dark:border-[#4A4238] shadow-2xl p-7 flex flex-col gap-5 animate-in max-sm:slide-in-from-bottom sm:zoom-in-95 duration-300"
            style={{
              transform: keyboardHeight > 0 ? `translateY(-${keyboardHeight}px)` : undefined,
              transition: "transform 0.15s ease-out"
            }}
          >
            <div className="absolute inset-3.5 max-sm:inset-3 rounded-[18px] max-sm:rounded-t-[18px] max-sm:rounded-b-none border border-[#E9DCC8]/60 dark:border-[#5C5346]/40 pointer-events-none" />
            
            <h3 className="text-lg font-bold font-serif text-[#2F2A24] dark:text-[#E9DCC8] flex items-center gap-2 relative z-10">
              ✍️ 文人落墨 · 记录读书笔记
            </h3>
            
            <div className="bg-[#FFFDF9] dark:bg-[#1C1B19] border border-[#EBE3D3] dark:border-[#3D372E] rounded-[16px] p-4 relative z-10 max-h-[100px] overflow-y-auto">
              <span className="text-[10px] text-[#A69B88] dark:text-[#807667] font-serif block mb-1 uppercase tracking-wider">所选引文</span>
              <p className="text-xs font-serif text-[#5C5446] dark:text-[#BDB19F] italic leading-relaxed pl-3.5 border-l-2 border-[#D5C2B1] dark:border-[#6B5A49]">
                “{selectedText}”
              </p>
            </div>
            
            <textarea
              value={userNoteText}
              onChange={(e) => setUserNoteText(e.target.value)}
              placeholder="在此写下您的所思、所想、所悟，落墨留痕..."
              rows={4}
              className="w-full bg-[#FFFDF9] dark:bg-[#1C1B19] border border-[#EBE3D3] dark:border-[#3D372E] rounded-[16px] p-4 text-sm font-serif text-[#3A2D22] dark:text-[#E2D5C5] focus:border-[#678055] dark:focus:border-[#83A370] focus:outline-none transition-colors relative z-10 resize-none placeholder-[#A89F8F]"
            />
            
            <div className="flex gap-3 justify-end relative z-10">
              <button
                onClick={() => {
                  setShowNoteDialog(false);
                  setUserNoteText("");
                  window.getSelection()?.removeAllRanges();
                  setSelectionRect(null);
                }}
                className="px-5 py-2.5 bg-[rgba(80,65,45,0.04)] dark:bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(80,65,45,0.08)] dark:hover:bg-[rgba(255,255,255,0.08)] border border-[rgba(80,65,45,0.08)] dark:border-[rgba(255,255,255,0.08)] text-[#6F665B] dark:text-[#A89F8F] text-sm font-semibold rounded-full transition-colors font-serif"
              >
                作罢
              </button>
              <button
                onClick={async () => {
                  if (!userNoteText.trim()) {
                    showToast("请输入您的笔记内容");
                    return;
                  }
                  await addBookmarkWithNote(userNoteText, selectedText);
                  setShowNoteDialog(false);
                  setUserNoteText("");
                  setSelectionRect(null);
                }}
                className="px-6 py-2.5 bg-[#678055] dark:bg-[#4E623E] hover:bg-[#4B633C] dark:hover:bg-[#3C4E2E] text-white text-sm font-semibold rounded-full shadow-md transition-colors font-serif"
              >
                落墨保存
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
