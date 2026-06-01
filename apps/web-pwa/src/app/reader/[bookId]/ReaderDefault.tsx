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
    handlePageNext,
    handlePagePrev,
    addBookmark,
    jumpToBookmark,
    handleSummarize,
    updateFontSize,
    updateTheme,
    updatePageMode,
    updateFontFamily,
    updateParagraphSpacing,
    updateLetterSpacing,
    updateLineHeight,
    seekToProgress,
    readingProgress,
    currentThemeColors,
    isPagination,
    toast,
    isFlipCooldown,
    updateAutoFlipAtBottom,
    autoFlipCountdown,
  } = useReader(bookId);

  const handleMobileReaderClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
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
    [showMenu, handlePagePrev, handlePageNext, setShowMenu, activePanel, isPagination, isFlipCooldown],
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
  const borderColor = isDark ? "rgba(255,255,255,0.1)" : "rgba(80,65,45,0.12)";

  return (
    <main className="fixed inset-0 overflow-hidden transition-colors duration-300 md:flex md:items-center md:justify-center md:bg-[#F7F1E6]">
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
        className="hidden md:flex w-full h-[calc(100vh-64px)] max-w-[1372px] rounded-[12px] border shadow-sm overflow-hidden"
        style={{
          backgroundColor: currentThemeColors.bg,
          color: currentThemeColors.text,
          borderColor: borderColor,
        }}
      >
        {/* 左侧常驻可折叠 TOC 目录栏 */}
        <div
          className={`h-full border-r transition-all duration-300 overflow-hidden ${
            activePanel === "toc" ? "w-[240px]" : "w-0 border-r-0"
          }`}
          style={{ borderColor: borderColor }}
        >
          <div className="w-[240px] h-full">
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

        {/* Reader Canvas (Flex-1) */}
        <div className="flex-1 flex flex-col min-w-0 bg-transparent relative">
          <ReaderTopBar
            title={chapter.title}
            isVisible={true}
            isDesktop={true}
            progress={readingProgress}
            currentChapterIndex={chapter.index}
            totalChapters={toc.length}
            onBack={() => router.push("/library")}
            onBookmark={addBookmark}
            onSettings={() => togglePanel("settings")}
            onToggleToc={() => togglePanel("toc")}
            onToggleAi={() => togglePanel("ai")}
            onPrevChapter={handlePrev}
            onNextChapter={handleNext}
          />
          <div
            ref={contentRef}
            className={`flex-1 relative reader-gpu-accelerated ${
              isPagination
                ? "overflow-x-auto overflow-y-hidden"
                : "overflow-y-auto overflow-x-hidden"
            } transition-all duration-300 ease-out ${
              isPositionRestored
                ? "opacity-100 blur-0 scale-100"
                : "opacity-0 blur-md scale-[0.995] pointer-events-none"
            }`}
            style={{ scrollBehavior: "smooth" }}
          >
            {isPagination ? (
              <ReaderContent
                title={chapter.title}
                content={chapter.content}
                isDark={isDark}
                isPagination={isPagination}
                buttonVariant="default"
                onPrev={handlePrev}
                onNext={handleNext}
                className="mx-auto px-6 pt-12 pb-[120px] md:px-12"
                style={{
                  maxWidth: `${readerTokens.layout.desktopContentMaxWidth}px`,
                  fontSize: `${settings.fontSize}px`,
                  lineHeight: settings.lineHeight,
                  columnWidth: "100%",
                  columnGap: "48px",
                  height: "100%",
                  "--paragraph-spacing": `${settings.paragraphSpacing ?? 16}px`,
                  "--letter-spacing": `${settings.letterSpacing ?? 0.03}em`,
                  "--reader-font-family": `var(--font-${settings.fontFamily || "kaiti"})`,
                } as React.CSSProperties}
                titleClassName="text-3xl font-bold mb-10 font-serif text-center"
                titleStyle={{ color: currentThemeColors.text }}
              />
            ) : (
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
                    onPrev={ch.index === renderedChapters[renderedChapters.length - 1].index ? handlePrev : undefined}
                    onNext={ch.index === renderedChapters[renderedChapters.length - 1].index ? handleNext : undefined}
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
            )}
          </div>
        </div>

        {/* 右侧常驻可折叠 AI 助手面板 */}
        <div
          className={`h-full border-l transition-all duration-300 overflow-hidden ${
            activePanel === "ai" ? "w-[338px]" : "w-0 border-l-0"
          }`}
          style={{ borderColor: borderColor }}
        >
          <div className="w-[338px] h-full">
            <AIReaderPanel
              isAiLoading={isAiLoading}
              aiSummary={aiSummary}
              isMobileDrawer={false}
              isDark={isDark}
              onClose={() => setActivePanel(null)}
            />
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
          className={`flex-1 relative reader-gpu-accelerated ${
            isPagination
              ? "overflow-x-auto overflow-y-hidden"
              : "overflow-y-auto overflow-x-hidden"
          } transition-all duration-300 ease-out ${
            isPositionRestored
              ? "opacity-100 blur-0"
              : "opacity-0 blur-md pointer-events-none"
          }`}
          style={{ scrollBehavior: "smooth" }}
        >
          {isPagination ? (
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
                columnWidth: "100%",
                columnGap: "48px",
                height: "100%",
                "--paragraph-spacing": `${settings.paragraphSpacing ?? 16}px`,
                "--letter-spacing": `${settings.letterSpacing ?? 0.03}em`,
                "--reader-font-family": `var(--font-${settings.fontFamily || "kaiti"})`,
              } as React.CSSProperties}
              titleClassName="text-2xl font-bold mb-8 font-serif"
            />
          ) : (
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
                  onPrev={ch.index === renderedChapters[renderedChapters.length - 1].index ? handlePrev : undefined}
                  onNext={ch.index === renderedChapters[renderedChapters.length - 1].index ? handleNext : undefined}
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
          )}
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
          onPrevChapter={handlePrev}
          onNextChapter={handleNext}
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
          className="fixed bottom-0 inset-x-0 bg-transparent z-50 physics-spring reader-gpu-accelerated rounded-t-[24px] overflow-hidden"
          style={{
            transform: activePanel === "settings" ? "translateY(0)" : "translateY(100%)"
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
        </div>

        {/* Progress Sheet */}
        <div
          className={`fixed bottom-0 inset-x-0 ${isDark ? "bg-[rgba(35,35,35,0.96)] shadow-[0_-4px_20px_rgba(0,0,0,0.5)]" : "bg-[rgba(255,252,245,0.96)] shadow-[0_-4px_20px_rgba(80,65,45,0.08)]"} z-50 px-6 pt-8 pb-[calc(2rem+env(safe-area-inset-bottom))] physics-spring reader-gpu-accelerated rounded-t-[24px]`}
          style={{
            transform: activePanel === "progress" ? "translateY(0)" : "translateY(100%)"
          }}
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
          <div className="grid grid-cols-[40px_36px_minmax(0,1fr)_36px_40px] items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                void handlePrev();
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
                void handleNext();
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
        </div>
      </div>

      {/* Shared Drawers (TOC & AI) and Backdrop for both Mobile and Desktop */}
      {(activePanel === "toc" || activePanel === "ai") && (
        <div
          className="fixed inset-0 z-40 bg-black/20 md:hidden"
          onClick={() => setActivePanel(null)}
        />
      )}

      {/* TOC Drawer (Shared) */}
      <div
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
      </div>

      {/* AI Drawer (Shared) */}
      <div
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
        />
      </div>

      {/* Desktop Settings Modal Overlay */}
      {activePanel === "settings" && (
        <div
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
        </div>
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
    </main>
  );
}
