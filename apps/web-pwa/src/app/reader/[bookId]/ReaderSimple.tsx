"use client";

import { strings } from "@/lib/i18n";
import { TocDrawer } from "@/components/reader/TocDrawer";
import { AIReaderPanel } from "@/components/reader/AIReaderPanel";
import { SettingsSheet } from "@/components/reader/SettingsSheet";
import { ReaderTopBar } from "@/components/reader/ReaderTopBar";
import { ReaderBottomBar } from "@/components/reader/ReaderBottomBar";
import { ReaderContent } from "@/components/reader/ReaderContent";
import { useReader } from "@/hooks/useReader";
import { useVirtualRouter } from "@/lib/route-store";
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
  const router = useVirtualRouter();
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
    updateAutoFlipAtBottom,
    autoFlipCountdown,
  } = useReader(bookId);

  const handleReaderClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (isInteractiveReaderTarget(event.target) || activePanel) return;

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
    [showMenu, handlePagePrev, handlePageNext, setShowMenu, activePanel, isPagination],
  );

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
              progress={readingProgress}
              currentChapterIndex={chapter.index}
              totalChapters={toc.length}
              onBack={() => router.push("/library")}
              onBookmark={addBookmark}
              onSettings={() => togglePanel("settings")}
              onPrevChapter={handlePrevChapterActive}
              onNextChapter={handleNextChapterActive}
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
              ? "overflow-x-auto overflow-y-hidden h-full flex flex-col"
              : "overflow-y-auto overflow-x-hidden"
          } transition-all duration-300 transition-opacity duration-200 ease-out ${
            isPositionRestored ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
          style={{ scrollBehavior: "smooth" }}
        >
          {isPagination ? (
            <ReaderContent
              title={chapter.title}
              content={chapter.content}
              isDark={isDark}
              isPagination={isPagination}
              buttonVariant="simple"
              onPrev={handlePrev}
              onNext={handleNext}
              className="max-w-[760px] mx-auto px-6 pt-16 pb-[120px]"
              style={{
                fontSize: `${settings.fontSize}px`,
                lineHeight: settings.lineHeight,
                columnWidth: "calc(100vw - 48px)",
                columnGap: "48px",
                height: "100%",
                "--paragraph-spacing": `${settings.paragraphSpacing ?? 16}px`,
                "--letter-spacing": `${settings.letterSpacing ?? 0.03}em`,
                "--reader-font-family": `var(--font-${settings.fontFamily || "kaiti"})`,
              } as React.CSSProperties}
              titleClassName="text-2xl font-bold mb-8"
            />
          ) : (
            renderedChapters.map((ch) => (
              <div
                key={ch.id}
                className="chapter-container max-w-[760px] mx-auto px-6 pt-16 pb-[60px] border-b border-[rgba(80,65,45,0.08)] last:border-b-0"
                data-chapter-index={ch.index}
              >
                <ReaderContent
                  title={ch.title}
                  content={ch.content}
                  isDark={isDark}
                  isPagination={isPagination}
                  buttonVariant="simple"
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
                  titleClassName="text-2xl font-bold mb-8"
                />
              </div>
            ))
          )}
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
              onPrevChapter={handlePrevChapterActive}
              onNextChapter={handleNextChapterActive}
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
          className={`fixed inset-y-0 left-0 w-[280px] max-w-[72vw] ${isDark ? "bg-[#232323]" : "bg-white"} z-50 shadow-xl physics-spring`}
          style={{
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
        </div>

        {/* AI Drawer */}
        <div
          className={`fixed inset-y-0 right-0 w-[280px] max-w-[72vw] ${isDark ? "bg-[#232323]" : "bg-white"} z-50 shadow-xl physics-spring`}
          style={{
            transform: activePanel === "ai" ? "translateX(0)" : "translateX(100%)"
          }}
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
            updateFontFamily={updateFontFamily}
            updateAutoFlipAtBottom={updateAutoFlipAtBottom}
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
            <span className="truncate mr-4">{chapter?.title}</span>
            <span className="shrink-0">
              {Math.round(readingProgress)}% · {(chapter?.index || 0) + 1} /{" "}
              {toc.length} 章
            </span>
          </div>
        </div>
      </div>

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
    </main>
  );
}
