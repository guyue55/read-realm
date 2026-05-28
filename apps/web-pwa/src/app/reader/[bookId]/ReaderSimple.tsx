"use client";

import { strings } from "@/lib/i18n";
import { TocDrawer } from "@/components/reader/TocDrawer";
import { AIReaderPanel } from "@/components/reader/AIReaderPanel";
import { SettingsSheet } from "@/components/reader/SettingsSheet";
import { ReaderTopBar } from "@/components/reader/ReaderTopBar";
import { ReaderBottomBar } from "@/components/reader/ReaderBottomBar";
import { useReader } from "@/hooks/useReader";
import { useCallback, type MouseEvent } from "react";
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

export function ReaderSimple({ bookId }: { bookId: string }) {
  const {
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
    toast,
  } = useReader(bookId);

  const handleReaderClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (isInteractiveReaderTarget(event.target) || activePanel) return;

      const bounds = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const width = bounds.width;

      // 使用手势核心识别点击行为
      const action = recognizer.getTapAction(x, width);

      // 1. 如果菜单尚未显示
      if (!showMenu) {
        if (action === "prev") {
          void handlePagePrev();
        } else if (action === "next") {
          void handlePageNext();
        } else {
          // 点击中间区域，唤醒菜单
          setShowMenu(true);
        }
        return;
      }

      // 2. 如果菜单已经显示
      if (action === "prev") {
        void handlePagePrev();
        return;
      }

      if (action === "next") {
        void handlePageNext();
        return;
      }

      // 点击中间区域，隐藏菜单
      setShowMenu(false);
    },
    [showMenu, handlePagePrev, handlePageNext, setShowMenu, activePanel],
  );

  if (!chapter)
    return (
      <div className="flex h-screen items-center justify-center text-[#2F2A24]">
        {strings.reader.loading}
      </div>
    );

  const isDark = settings.theme === "dark";

  return (
    <main
      className="fixed inset-0 overflow-hidden transition-colors duration-300"
      style={{
        backgroundColor: currentThemeColors.bg,
        color: currentThemeColors.text,
      }}
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

      <div className="relative h-full flex flex-col w-full bg-inherit">
        {/* Top Toolbar Overlay - used for all screen sizes in simple mode */}
        <div className="absolute inset-x-0 top-0 z-20 pointer-events-none">
          <div className="pointer-events-auto">
            <ReaderTopBar
              title={chapter.title}
              isVisible={showMenu}
              isDesktop={false}
              isDark={isDark}
              onBack={() => (window.location.href = "/")}
              onBookmark={addBookmark}
              onSettings={() => togglePanel("settings")}
            />
          </div>
        </div>

        {/* Scrollable / Paginable Content Canvas */}
        <div
          ref={contentRef}
          onClick={handleReaderClick}
          onTouchStart={handleContentTouchStart}
          onTouchEnd={handleContentTouchEnd}
          className={`flex-1 relative ${
            isPagination
              ? "overflow-x-auto overflow-y-hidden"
              : "overflow-y-auto overflow-x-hidden"
          } transition-all duration-300`}
          style={{ scrollBehavior: "smooth" }}
        >
          <div
            className={`max-w-[760px] mx-auto px-6 pt-16 pb-[120px]`}
            style={{
              fontSize: `${settings.fontSize}px`,
              lineHeight: settings.lineHeight,
              columnWidth: isPagination ? "calc(100vw - 48px)" : "auto",
              columnGap: "48px",
              height: isPagination ? "100%" : "auto",
            }}
          >
            <h1 className="text-2xl font-bold mb-8">{chapter.title}</h1>
            <div
              className={`reader-content whitespace-pre-wrap break-words [&_p]:break-inside-avoid [&_p]:mb-4 ${
                isDark ? "theme-dark-filter" : ""
              }`}
              dangerouslySetInnerHTML={{ __html: chapter.content }}
            />
            {/* Nav Buttons (Scroll mode end) */}
            {!isPagination && (
              <div className="mt-12 flex justify-between items-center border-t border-[rgba(80,65,45,0.12)] pt-8 relative z-10">
                <button
                  onClick={handlePrev}
                  className="px-6 py-3 bg-[rgba(80,65,45,0.04)] rounded-full text-sm hover:bg-[rgba(80,65,45,0.08)] transition-colors text-inherit"
                >
                  {strings.reader.prevChapter}
                </button>
                <button
                  onClick={handleNext}
                  className="px-6 py-3 border border-[#678055] text-[#678055] font-bold rounded-full text-sm hover:bg-[rgba(103,128,85,0.04)] transition-colors"
                >
                  {strings.reader.nextChapter}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Bar Overlay - universal for simple mode */}
        <div className="absolute inset-x-0 bottom-0 z-20 pointer-events-none">
          <div className="pointer-events-auto">
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
              onPagePrev={handlePagePrev}
              onPageNext={handlePageNext}
              onSeekProgress={seekToProgress}
            />
          </div>
        </div>
      </div>

      {/* Drawers & Overlays */}
      <div>
        {/* Backdrop */}
        {activePanel && (
          <div
            className="fixed inset-0 z-40 bg-black/20"
            onClick={() => setActivePanel(null)}
          />
        )}

        {/* TOC Drawer */}
        <div
          className={`fixed inset-y-0 left-0 w-[300px] max-w-[85vw] ${isDark ? "bg-[#232323]" : "bg-white"} z-50 shadow-xl physics-spring ${activePanel === "toc" ? "translate-x-0" : "-translate-x-full"}`}
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
        </div>

        {/* AI Drawer */}
        <div
          className={`fixed inset-y-0 right-0 w-[340px] max-w-[85vw] ${isDark ? "bg-[#232323]" : "bg-white"} z-50 shadow-xl physics-spring ${activePanel === "ai" ? "translate-x-0" : "translate-x-full"}`}
        >
          <AIReaderPanel
            isAiLoading={isAiLoading}
            aiSummary={aiSummary}
            isMobileDrawer={true}
            isDark={isDark}
            onClose={() => setActivePanel(null)}
          />
        </div>

        {/* Settings Sheet */}
        <div
          className={`fixed bottom-0 inset-x-0 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[400px] sm:bottom-8 bg-transparent z-50 physics-spring rounded-t-[24px] sm:rounded-[24px] overflow-hidden sm:shadow-2xl ${activePanel === "settings" ? "translate-y-0 sm:scale-100" : "translate-y-full sm:scale-95 sm:opacity-0"}`}
        >
          <SettingsSheet
            settings={settings}
            updateFontSize={updateFontSize}
            updateTheme={updateTheme}
            updatePageMode={updatePageMode}
            isMobileSheet={true}
            onClose={() => setActivePanel(null)}
          />
        </div>

        {/* Progress Sheet */}
        <div
          className={`fixed bottom-0 inset-x-0 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[400px] sm:bottom-8 ${isDark ? "bg-[rgba(35,35,35,0.96)] shadow-2xl" : "bg-[rgba(255,252,245,0.96)] sm:bg-white sm:shadow-2xl shadow-[0_-4px_20px_rgba(80,65,45,0.08)]"} z-50 px-6 pt-8 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:pb-8 physics-spring rounded-t-[24px] sm:rounded-[24px] ${activePanel === "progress" ? "translate-y-0 sm:scale-100" : "translate-y-full sm:scale-95 sm:opacity-0"}`}
        >
          <div className="flex justify-between items-center mb-6">
            <h3
              className={`font-bold ${isDark ? "text-[#CFCFCF]" : "text-[#2F2A24]"}`}
            >
              阅读进度
            </h3>
            <button
              onClick={() => setActivePanel(null)}
              className={`${isDark ? "text-[#8F8F8F] hover:bg-white/10" : "text-[#6F665B] hover:bg-gray-100"} p-1 rounded-full`}
            >
              ✕
            </button>
          </div>
          <div className="grid grid-cols-[36px_minmax(0,1fr)_36px] items-center gap-3">
            <button
              onClick={handlePagePrev}
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
              onClick={handlePageNext}
              className={`${isDark ? "text-[#CFCFCF] hover:bg-white/10" : "text-[#2F2A24] hover:bg-[#F4ECD8]"} h-9 rounded-full text-xl`}
            >
              ›
            </button>
          </div>
          <div
            className={`flex justify-between text-sm ${isDark ? "text-[#8F8F8F]" : "text-[#6F665B]"}`}
          >
            <span className="truncate mr-4">{chapter?.title}</span>
            <span className="shrink-0">
              {Math.round(readingProgress)}% · {(chapter?.index || 0) + 1} /{" "}
              {toc.length} 章
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
