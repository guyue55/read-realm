import React from "react";
import type { Bookmark } from "@reader/shared-types";
import { strings } from "@/lib/i18n";
import { QualityBadge, analyzeChapterQuality } from "@/components/QualityBadge";
import { X } from "lucide-react";

export interface TocDrawerProps {
  toc: { index: number; title: string; content?: string }[];
  bookmarks: Bookmark[];
  currentChapterIndex: number;
  activeTab: "toc" | "bookmarks";
  setActiveTab: (tab: "toc" | "bookmarks") => void;
  onJumpToChapter: (index: number) => void;
  onJumpToBookmark: (bookmark: Bookmark) => void;
  isMobileDrawer?: boolean;
  /** 阅读主题是否为深色（驱动目录 chrome 的对比色，避免依赖 OS 暗色） */
  isDark?: boolean;
  onClose?: () => void;
}

export function TocDrawer({
  toc,
  bookmarks,
  currentChapterIndex,
  activeTab,
  setActiveTab,
  onJumpToChapter,
  onJumpToBookmark,
  isMobileDrawer = false,
  isDark = false,
  onClose,
}: TocDrawerProps) {
  const [touchStart, setTouchStart] = React.useState<number | null>(null);

  // 目录 chrome 配色：深色主题下用亮色系保证对比度（WCAG AA ≥ 4.5:1）。
  // 注意：必须使用完整字面量类名（Tailwind JIT 只扫描源文件静态类）。
  const accentText = isDark ? "text-[#83A370]" : "text-[#678055]";
  const accentBorder = isDark ? "border-[#83A370]" : "border-[#678055]";
  const mutedText = isDark ? "text-[#A89F8F]" : "text-[#6F665B]";
  const hairlineBorder = isDark
    ? "border-[rgba(255,255,255,0.12)]"
    : "border-[rgba(80,65,45,0.12)]";
  const rowDivider = isDark
    ? "border-[rgba(255,255,255,0.05)]"
    : "border-[rgba(80,65,45,0.04)]";
  const rowHover = isDark
    ? "hover:bg-[rgba(255,255,255,0.06)] active:bg-[rgba(255,255,255,0.1)]"
    : "hover:bg-[rgba(80,65,45,0.04)] active:bg-[rgba(80,65,45,0.08)]";
  const groupBg = isDark
    ? "bg-[rgba(255,255,255,0.05)]"
    : "bg-[rgba(80,65,45,0.04)]";
  const chipClasses = isDark
    ? "border-[rgba(255,255,255,0.12)] bg-[rgba(45,45,45,0.92)] text-[#CFCFCF]"
    : "border-[rgba(80,65,45,0.15)] bg-[rgba(255,252,245,0.92)] text-[#2F2A24]";

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isMobileDrawer) return;
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isMobileDrawer || touchStart === null) return;
    const currentX = e.targetTouches[0].clientX;
    const diffX = touchStart - currentX;
    // Slide left to hide TOC
    if (diffX > 40) {
      onClose?.();
      setTouchStart(null);
    }
  };

  const containerClasses = isMobileDrawer
    ? "h-full flex flex-col relative select-none"
    : "h-full flex flex-col bg-transparent relative"; // inherit bg from parent

  return (
    <div
      className={containerClasses}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
    >
      <div
        className={`border-b ${hairlineBorder} pt-[env(safe-area-inset-top)]`}
      >
        <div className="flex p-2">
          <button
            onClick={() => setActiveTab("toc")}
            data-reader-control
            className={`reader-control-press reader-focus-ring flex-1 min-h-11 px-2 text-sm font-bold border-b-2 ${
              activeTab === "toc"
                ? `${accentText} ${accentBorder}`
                : `border-transparent ${mutedText}`
            }`}
          >
            {strings.reader.toc}
          </button>
          <button
            onClick={() => setActiveTab("bookmarks")}
            data-reader-control
            className={`reader-control-press reader-focus-ring flex-1 min-h-11 px-2 text-sm font-bold border-b-2 ${
              activeTab === "bookmarks"
                ? `${accentText} ${accentBorder}`
                : `border-transparent ${mutedText}`
            }`}
          >
            {strings.reader.bookmarks}
          </button>
          {onClose && (
            <button
              aria-label="关闭目录"
              onClick={onClose}
              data-icon-only="true"
              data-reader-control
              className={`reader-control-press reader-focus-ring flex h-11 w-11 items-center justify-center rounded-xl ${mutedText}`}
            >
              <X aria-hidden="true" size={20} strokeWidth={1.8} />
            </button>
          )}
        </div>
      </div>

      {/* 滚动容器：若是移动端抽屉则留出 pb-24 以避开大拇指悬浮胶囊 */}
      <div
        className={`flex-1 overflow-y-auto ${isMobileDrawer ? "pb-24" : "pb-[env(safe-area-inset-bottom)]"}`}
      >
        {activeTab === "toc" ? (
          <div>
            <div
              className={`p-4 ${groupBg} text-xs ${mutedText} uppercase font-bold tracking-wider`}
            >
              {strings.reader.chapterCount.replace(
                "{count}",
                toc.length.toString(),
              )}
            </div>
            {toc.map((item) => {
              const quality = item.content
                ? analyzeChapterQuality(item.content, item.title)
                : null;
              return (
                <button
                  key={item.index}
                  onClick={() => onJumpToChapter(item.index)}
                  data-reader-control
                  className={`reader-control-press reader-focus-ring min-h-11 w-full text-left px-4 py-3 border-b ${rowDivider} flex items-center ${rowHover} ${
                    currentChapterIndex === item.index
                      ? `${accentText} font-bold`
                      : "text-inherit"
                  }`}
                >
                  <span
                    className={`text-xs ${mutedText} w-8 inline-block opacity-70 shrink-0`}
                  >
                    {item.index + 1}
                  </span>
                  <span className="flex-1 truncate text-sm mr-2">
                    {item.title}
                  </span>
                  {quality && (
                    <span className="shrink-0">
                      <QualityBadge
                        issueType={quality.issueType}
                        severity={quality.severity}
                      />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div>
            <div
              className={`p-4 ${groupBg} text-xs ${mutedText} uppercase font-bold tracking-wider`}
            >
              {strings.reader.bookmarkCount.replace(
                "{count}",
                bookmarks.length.toString(),
              )}
            </div>
            {bookmarks.length === 0 ? (
              <div className={`p-8 text-center ${mutedText} text-sm`}>
                {strings.reader.noBookmarks}
              </div>
            ) : (
              bookmarks
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .map((bookmark) => (
                  <button
                    key={bookmark.id}
                    onClick={() => onJumpToBookmark(bookmark)}
                    data-reader-control
                    className={`reader-control-press reader-focus-ring min-h-11 w-full text-left px-4 py-4 border-b ${rowDivider} ${rowHover}`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-sm font-bold text-inherit truncate flex-1 mr-2">
                        {toc[bookmark.chapterIndex]?.title ||
                          strings.reader.chapterIndexLabel.replace(
                            "{index}",
                            (bookmark.chapterIndex + 1).toString(),
                          )}
                      </span>
                      <span
                        className={`text-[10px] ${mutedText} whitespace-nowrap`}
                      >
                        {new Date(bookmark.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className={`text-xs ${mutedText} line-clamp-2 italic`}>
                      &quot;
                      {bookmark.contentPreview || strings.reader.noPreview}
                      &quot;...
                    </p>
                  </button>
                ))
            )}
          </div>
        )}
      </div>

      {/* 大拇指黄金触控悬浮一键收纳胶囊 */}
      {isMobileDrawer && onClose && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
          <button
            aria-label="收起目录"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            data-reader-control
            className={`reader-control-press reader-focus-ring flex min-h-11 items-center gap-2 px-5 rounded-full text-xs font-bold backdrop-blur-md border ${chipClasses} shadow-[0_8px_24px_rgba(0,0,0,0.16)]`}
          >
            <X aria-hidden="true" size={18} strokeWidth={1.8} /> 收起目录
          </button>
        </div>
      )}
    </div>
  );
}
