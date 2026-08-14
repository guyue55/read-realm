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
  onClose,
}: TocDrawerProps) {
  const [touchStart, setTouchStart] = React.useState<number | null>(null);

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

      <div className="border-b border-[rgba(80,65,45,0.12)] pt-[env(safe-area-inset-top)]">
        <div className="flex p-2">
          <button
            onClick={() => setActiveTab("toc")}
            data-reader-control
            className={`reader-control-press reader-focus-ring flex-1 min-h-11 px-2 text-sm font-bold border-b-2 ${
              activeTab === "toc"
                ? "border-[#678055] text-[#678055]"
                : "border-transparent text-[#6F665B]"
            }`}
          >
            {strings.reader.toc}
          </button>
          <button
            onClick={() => setActiveTab("bookmarks")}
            data-reader-control
            className={`reader-control-press reader-focus-ring flex-1 min-h-11 px-2 text-sm font-bold border-b-2 ${
              activeTab === "bookmarks"
                ? "border-[#678055] text-[#678055]"
                : "border-transparent text-[#6F665B]"
            }`}
          >
            {strings.reader.bookmarks}
          </button>
          {isMobileDrawer && onClose && (
            <button
              aria-label="关闭目录"
              onClick={onClose}
              data-icon-only="true"
              data-reader-control
              className="reader-control-press reader-focus-ring flex h-11 w-11 items-center justify-center rounded-xl text-[#6F665B]"
            >
              <X aria-hidden="true" size={20} strokeWidth={1.8} />
            </button>
          )}
        </div>
      </div>

      {/* 滚动容器：若是移动端抽屉则留出 pb-24 以避开大拇指悬浮胶囊 */}
      <div className={`flex-1 overflow-y-auto ${isMobileDrawer ? "pb-24" : "pb-[env(safe-area-inset-bottom)]"}`}>
        {activeTab === "toc" ? (
          <div>
            <div className="p-4 bg-[rgba(80,65,45,0.04)] text-xs text-[#6F665B] uppercase font-bold tracking-wider">
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
                  className={`reader-control-press reader-focus-ring min-h-11 w-full text-left px-4 py-3 border-b border-[rgba(80,65,45,0.04)] flex items-center hover:bg-[rgba(80,65,45,0.04)] active:bg-[rgba(80,65,45,0.08)] ${
                    currentChapterIndex === item.index
                      ? "text-[#678055] font-bold"
                      : "text-inherit"
                  }`}
                >
                  <span className="text-xs text-[#6F665B] w-8 inline-block opacity-70 shrink-0">
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
            <div className="p-4 bg-[rgba(80,65,45,0.04)] text-xs text-[#6F665B] uppercase font-bold tracking-wider">
              {strings.reader.bookmarkCount.replace(
                "{count}",
                bookmarks.length.toString(),
              )}
            </div>
            {bookmarks.length === 0 ? (
              <div className="p-8 text-center text-[#6F665B] text-sm">
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
                    className="reader-control-press reader-focus-ring min-h-11 w-full text-left px-4 py-4 border-b border-[rgba(80,65,45,0.04)] hover:bg-[rgba(80,65,45,0.04)] active:bg-[rgba(80,65,45,0.08)]"
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-sm font-bold text-inherit truncate flex-1 mr-2">
                        {toc[bookmark.chapterIndex]?.title ||
                          strings.reader.chapterIndexLabel.replace(
                            "{index}",
                            (bookmark.chapterIndex + 1).toString(),
                          )}
                      </span>
                      <span className="text-[10px] text-[#6F665B] whitespace-nowrap">
                        {new Date(bookmark.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-xs text-[#6F665B] line-clamp-2 italic">
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
            className="reader-control-press reader-focus-ring flex min-h-11 items-center gap-2 px-5 rounded-full text-xs font-bold backdrop-blur-md border border-[rgba(80,65,45,0.15)] bg-[rgba(255,252,245,0.92)] text-[#2F2A24] dark:border-[rgba(255,255,255,0.12)] dark:bg-[rgba(45,45,45,0.92)] dark:text-[#CFCFCF] shadow-[0_8px_24px_rgba(0,0,0,0.16)]"
          >
            <X aria-hidden="true" size={18} strokeWidth={1.8} /> 收起目录
          </button>
        </div>
      )}
    </div>
  );
}
