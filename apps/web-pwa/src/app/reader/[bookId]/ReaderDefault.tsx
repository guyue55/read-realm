"use client";

import { strings } from "@/lib/i18n";
import { TocDrawer } from "@/components/reader/TocDrawer";
import { AIReaderPanel } from "@/components/reader/AIReaderPanel";
import { SettingsSheet } from "@/components/reader/SettingsSheet";
import { ReaderTopBar } from "@/components/reader/ReaderTopBar";
import { ReaderBottomBar } from "@/components/reader/ReaderBottomBar";
import { useReader } from "@/hooks/useReader";
import { readerTokens } from "@reader/shared-types";
import { useRouter } from "next/navigation";
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

export function ReaderDefault({ bookId }: { bookId: string }) {
  const router = useRouter();
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
  } = useReader(bookId);

  const handleMobileReaderClick = useCallback(
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
  const overlay1 = isDark ? "rgba(255,255,255,0.02)" : "rgba(80,65,45,0.02)"; // Sidebar & AI
  const overlay2 = isDark ? "rgba(255,255,255,0.05)" : "rgba(80,65,45,0.06)"; // TOC
  const borderColor = isDark ? "rgba(255,255,255,0.1)" : "rgba(80,65,45,0.12)";
  const brandColor = isDark ? "#D8D2C6" : "#526047";

  return (
    <main className="fixed inset-0 overflow-hidden transition-colors duration-300 xl:flex xl:items-center xl:justify-center xl:bg-[#F7F1E6]">
      {/* 
        Desktop Workspace Container 
        Matching SVG Max-width ~1372px (92 + 240 + 700 + 338 = 1370)
      */}
      <div
        className="hidden xl:flex w-full h-[calc(100vh-64px)] max-w-[1372px] rounded-[12px] border shadow-sm overflow-hidden"
        style={{
          backgroundColor: currentThemeColors.bg,
          color: currentThemeColors.text,
          borderColor: borderColor,
        }}
      >
        {/* Sidebar Nav (92px) */}
        <div
          className="w-[92px] shrink-0 flex flex-col items-center py-8"
          style={{
            backgroundColor: overlay1,
            borderRight: `1px solid ${borderColor}`,
          }}
        >
          <h1
            className="text-xl font-bold mb-8 font-serif"
            style={{ color: brandColor }}
          >
            墨问
          </h1>
          <nav className="flex flex-col gap-6 items-center flex-1 w-full">
            <div
              onClick={() => router.push("/library")}
              className="flex flex-col items-center gap-1 w-16 py-2 rounded-lg cursor-pointer hover:bg-[rgba(80,65,45,0.04)]"
            >
              <div className="w-2 h-2 rounded-full bg-[#678055] opacity-0 hover:opacity-100 transition-opacity"></div>
              <span
                className="text-[10px] font-medium"
                style={{ color: brandColor }}
              >
                书架
              </span>
            </div>
            <div
              onClick={() => router.push("/search")}
              className="flex flex-col items-center gap-1 w-16 py-2 rounded-lg cursor-pointer hover:bg-[rgba(80,65,45,0.04)]"
            >
              <div className="w-2 h-2 rounded-full bg-[#678055] opacity-0 hover:opacity-100 transition-opacity"></div>
              <span
                className="text-[10px] font-medium"
                style={{ color: brandColor }}
              >
                发现
              </span>
            </div>
            <div
              onClick={() => router.push("/import")}
              className="flex flex-col items-center gap-1 w-16 py-2 rounded-lg cursor-pointer hover:bg-[rgba(80,65,45,0.04)]"
            >
              <div className="w-2 h-2 rounded-full bg-[#678055] opacity-0 hover:opacity-100 transition-opacity"></div>
              <span
                className="text-[10px] font-medium"
                style={{ color: brandColor }}
              >
                导入
              </span>
            </div>
            <div
              onClick={() => setActivePanel("settings")}
              className="flex flex-col items-center gap-1 w-16 py-2 rounded-lg cursor-pointer bg-[#E7EDE0]"
            >
              <div className="w-2 h-2 rounded-full bg-[#678055]"></div>
              <span
                className="text-[10px] font-medium"
                style={{ color: brandColor }}
              >
                设置
              </span>
            </div>
          </nav>
        </div>

        {/* TOC Drawer (240px per tokens) */}
        <div
          className="w-[240px] shrink-0 flex flex-col"
          style={{
            backgroundColor: overlay2,
            borderRight: `1px solid ${borderColor}`,
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
          />
        </div>

        {/* Reader Canvas (Flex-1) */}
        <div className="flex-1 flex flex-col min-w-0 bg-transparent relative">
          <ReaderTopBar
            title={chapter.title}
            isVisible={true}
            isDesktop={true}
            onBack={() => router.push("/library")}
            onSummarize={handleSummarize}
            onBookmark={addBookmark}
            onSettings={() => setActivePanel("settings")}
          />
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
              className="mx-auto px-6 pt-12 pb-[120px] xl:px-12"
              style={{
                maxWidth: `${readerTokens.layout.desktopContentMaxWidth}px`,
                fontSize: `${settings.fontSize}px`,
                lineHeight: settings.lineHeight,
                columnWidth: isPagination ? "calc(100vw - 48px)" : "auto",
                columnGap: "48px",
                height: isPagination ? "100%" : "auto",
              }}
            >
              <h1
                className="text-3xl font-bold mb-10 font-serif text-center"
                style={{ color: currentThemeColors.text }}
              >
                {chapter.title}
              </h1>
              <div
                className="reader-content whitespace-pre-wrap break-words [&_p]:break-inside-avoid [&_p]:mb-4"
                dangerouslySetInnerHTML={{ __html: chapter.content }}
              />
              {!isPagination && (
                <div className="mt-16 flex justify-between items-center border-t border-[rgba(80,65,45,0.12)] pt-8 relative z-10">
                  <button
                    onClick={handlePrev}
                    className="px-6 py-3 bg-[rgba(80,65,45,0.04)] rounded-full text-sm hover:bg-[rgba(80,65,45,0.08)] transition-colors text-inherit"
                  >
                    {strings.reader.prevChapter}
                  </button>
                  <button
                    onClick={handleNext}
                    className="px-6 py-3 bg-[#EEF2E9] text-[#678055] font-bold rounded-full text-sm hover:bg-[#DDEBD6] transition-colors"
                  >
                    {strings.reader.nextChapter}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* AI Panel (338px per tokens) */}
        <div
          className="w-[338px] shrink-0 flex flex-col"
          style={{
            backgroundColor: overlay1,
            borderLeft: `1px solid ${borderColor}`,
          }}
        >
          <AIReaderPanel
            isAiLoading={isAiLoading}
            aiSummary={aiSummary}
            isMobileDrawer={false}
            isDark={isDark}
          />
        </div>
      </div>

      {/* 
        Mobile View Container (xl:hidden) 
      */}
      <div
        className="xl:hidden absolute inset-0 flex flex-col w-full h-full"
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
          onBack={() => router.push("/library")}
          onSummarize={handleSummarize}
          onBookmark={addBookmark}
          onSettings={() => togglePanel("settings")}
        />

        {/* Scrollable / Paginable Content Canvas */}
        <div
          ref={contentRef}
          onClick={handleMobileReaderClick}
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
            className="mx-auto px-6 pt-12 pb-[120px]"
            style={{
              maxWidth: `${readerTokens.layout.tabletContentMaxWidth}px`,
              fontSize: `${settings.fontSize}px`,
              lineHeight: settings.lineHeight,
              columnWidth: isPagination ? "calc(100vw - 48px)" : "auto",
              columnGap: "48px",
              height: isPagination ? "100%" : "auto",
            }}
          >
            <h1 className="text-2xl font-bold mb-8 font-serif">
              {chapter.title}
            </h1>
            <div
              className="reader-content whitespace-pre-wrap break-words [&_p]:break-inside-avoid [&_p]:mb-4"
              dangerouslySetInnerHTML={{ __html: chapter.content }}
            />
            {/* Nav Buttons */}
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
                  className="px-6 py-3 bg-[#EEF2E9] text-[#678055] font-bold rounded-full text-sm hover:bg-[#DDEBD6] transition-colors"
                >
                  {strings.reader.nextChapter}
                </button>
              </div>
            )}
          </div>
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
          onPagePrev={handlePagePrev}
          onPageNext={handlePageNext}
          onSeekProgress={seekToProgress}
        />

        {/* Mobile Drawers & Overlays */}
        {activePanel && (
          <div
            className="fixed inset-0 z-40 bg-black/20"
            onClick={() => setActivePanel(null)}
          />
        )}

        {/* TOC Drawer */}
        <div
          className={`fixed inset-y-0 left-0 w-4/5 max-w-sm bg-[var(--theme-bg)] z-50 shadow-xl transition-transform duration-300 ${activePanel === "toc" ? "translate-x-0" : "-translate-x-full"}`}
          style={{ backgroundColor: currentThemeColors.bg }}
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
          className={`fixed inset-y-0 right-0 w-[85%] max-w-md bg-[var(--theme-bg)] z-50 shadow-xl transition-transform duration-300 ${activePanel === "ai" ? "translate-x-0" : "translate-x-full"}`}
          style={{ backgroundColor: currentThemeColors.bg }}
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
          className={`fixed bottom-0 inset-x-0 bg-transparent z-50 transition-transform duration-300 rounded-t-[24px] overflow-hidden ${activePanel === "settings" ? "translate-y-0" : "translate-y-full"}`}
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
          className={`fixed bottom-0 inset-x-0 ${isDark ? "bg-[rgba(35,35,35,0.96)] shadow-[0_-4px_20px_rgba(0,0,0,0.5)]" : "bg-[rgba(255,252,245,0.96)] shadow-[0_-4px_20px_rgba(80,65,45,0.08)]"} z-50 px-6 pt-8 pb-[calc(2rem+env(safe-area-inset-bottom))] transition-transform duration-300 rounded-t-[24px] ${activePanel === "progress" ? "translate-y-0" : "translate-y-full"}`}
        >
          <div className="flex justify-between items-center mb-6">
            <h3
              className={`font-bold ${isDark ? "text-[#CFCFCF]" : "text-[#2F2A24]"}`}
            >
              阅读进度
            </h3>
            <button
              onClick={() => setActivePanel(null)}
              className={`${isDark ? "text-[#8F8F8F]" : "text-[#6F665B]"} p-1`}
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
            <span>{chapter?.title}</span>
            <span>
              {Math.round(readingProgress)}% · {(chapter?.index || 0) + 1} /{" "}
              {toc.length} 章
            </span>
          </div>
        </div>
      </div>

      {/* Desktop Settings Modal Overlay */}
      {activePanel === "settings" && (
        <div
          className="hidden xl:flex fixed inset-0 z-50 bg-black/20 items-center justify-center"
          onClick={() => setActivePanel(null)}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <SettingsSheet
              settings={settings}
              updateFontSize={updateFontSize}
              updateTheme={updateTheme}
              updatePageMode={updatePageMode}
              isMobileSheet={false}
            />
          </div>
        </div>
      )}
    </main>
  );
}
