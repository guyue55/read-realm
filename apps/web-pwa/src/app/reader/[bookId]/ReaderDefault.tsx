"use client";

import { strings } from "@/lib/i18n";
import { TocDrawer } from "@/components/reader/TocDrawer";
import { AIReaderPanel } from "@/components/reader/AIReaderPanel";
import { SettingsSheet } from "@/components/reader/SettingsSheet";
import { ReaderTopBar } from "@/components/reader/ReaderTopBar";
import { ReaderBottomBar } from "@/components/reader/ReaderBottomBar";
import { ReaderContent } from "@/components/reader/ReaderContent";
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
    updateFontFamily,
    seekToProgress,
    readingProgress,
    currentThemeColors,
    isPagination,
    toast,
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
  const borderColor = isDark ? "rgba(255,255,255,0.1)" : "rgba(80,65,45,0.12)";

  return (
    <main className="fixed inset-0 overflow-hidden transition-colors duration-300 xl:flex xl:items-center xl:justify-center xl:bg-[#F7F1E6]">
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
        {/* TOC 侧边栏现已采用响应式左侧悬浮 Drawer 交互 */}

        {/* Reader Canvas (Flex-1) */}
        <div className="flex-1 flex flex-col min-w-0 bg-transparent relative">
          <ReaderTopBar
            title={chapter.title}
            isVisible={true}
            isDesktop={true}
            onBack={() => router.push("/library")}
            onBookmark={addBookmark}
            onSettings={() => togglePanel("settings")}
            onToggleToc={() => togglePanel("toc")}
            onToggleAi={() => togglePanel("ai")}
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
            <ReaderContent
              title={chapter.title}
              content={chapter.content}
              isDark={isDark}
              isPagination={isPagination}
              buttonVariant="default"
              onPrev={handlePrev}
              onNext={handleNext}
              className="mx-auto px-6 pt-12 pb-[120px] xl:px-12"
              style={{
                maxWidth: `${readerTokens.layout.desktopContentMaxWidth}px`,
                fontSize: `${settings.fontSize}px`,
                lineHeight: settings.lineHeight,
                columnWidth: isPagination ? "calc(100vw - 48px)" : "auto",
                columnGap: "48px",
                height: isPagination ? "100%" : "auto",
                "--paragraph-spacing": `${settings.paragraphSpacing ?? 16}px`,
                "--letter-spacing": `${settings.letterSpacing ?? 0.03}em`,
                "--reader-font-family": `var(--font-${settings.fontFamily || "kaiti"})`,
              } as React.CSSProperties}
              titleClassName="text-3xl font-bold mb-10 font-serif text-center"
              titleStyle={{ color: currentThemeColors.text }}
            />
          </div>
        </div>

        {/* AI 助手面板现已采用响应式右侧悬浮 Drawer 交互 */}
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
          <ReaderContent
            title={chapter.title}
            content={chapter.content}
            isDark={isDark}
            isPagination={isPagination}
            buttonVariant="default"
            onPrev={handlePrev}
            onNext={handleNext}
            className="mx-auto px-6 pt-12 pb-[120px]"
            style={{
              maxWidth: `${readerTokens.layout.tabletContentMaxWidth}px`,
              fontSize: `${settings.fontSize}px`,
              lineHeight: settings.lineHeight,
              columnWidth: isPagination ? "calc(100vw - 48px)" : "auto",
              columnGap: "48px",
              height: isPagination ? "100%" : "auto",
              "--paragraph-spacing": `${settings.paragraphSpacing ?? 16}px`,
              "--letter-spacing": `${settings.letterSpacing ?? 0.03}em`,
              "--reader-font-family": `var(--font-${settings.fontFamily || "kaiti"})`,
            } as React.CSSProperties}
            titleClassName="text-2xl font-bold mb-8 font-serif"
          />
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

        {/* Mobile Settings/Progress Backdrop */}
        {(activePanel === "settings" || activePanel === "progress") && (
          <div
            className="fixed inset-0 z-40 bg-black/20"
            onClick={() => setActivePanel(null)}
          />
        )}

        {/* Settings Sheet */}
        <div
          className={`fixed bottom-0 inset-x-0 bg-transparent z-50 physics-spring rounded-t-[24px] overflow-hidden ${activePanel === "settings" ? "translate-y-0" : "translate-y-full"}`}
        >
          <SettingsSheet
            settings={settings}
            updateFontSize={updateFontSize}
            updateTheme={updateTheme}
            updatePageMode={updatePageMode}
            updateFontFamily={updateFontFamily}
            isMobileSheet={true}
            onClose={() => setActivePanel(null)}
          />
        </div>

        {/* Progress Sheet */}
        <div
          className={`fixed bottom-0 inset-x-0 ${isDark ? "bg-[rgba(35,35,35,0.96)] shadow-[0_-4px_20px_rgba(0,0,0,0.5)]" : "bg-[rgba(255,252,245,0.96)] shadow-[0_-4px_20px_rgba(80,65,45,0.08)]"} z-50 px-6 pt-8 pb-[calc(2rem+env(safe-area-inset-bottom))] physics-spring rounded-t-[24px] ${activePanel === "progress" ? "translate-y-0" : "translate-y-full"}`}
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

      {/* Shared Drawers (TOC & AI) and Backdrop for both Mobile and Desktop */}
      {(activePanel === "toc" || activePanel === "ai") && (
        <div
          className="fixed inset-0 z-40 bg-black/20"
          onClick={() => setActivePanel(null)}
        />
      )}

      {/* TOC Drawer (Shared) */}
      <div
        className={`fixed inset-y-0 left-0 w-4/5 max-w-sm bg-[var(--theme-bg)] z-50 shadow-xl physics-spring ${
          activePanel === "toc" ? "translate-x-0" : "-translate-x-full"
        }`}
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

      {/* AI Drawer (Shared) */}
      <div
        className={`fixed inset-y-0 right-0 w-[85%] max-w-md bg-[var(--theme-bg)] z-50 shadow-xl physics-spring ${
          activePanel === "ai" ? "translate-x-0" : "translate-x-full"
        }`}
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
              updateFontFamily={updateFontFamily}
              isMobileSheet={false}
            />
          </div>
        </div>
      )}
    </main>
  );
}
