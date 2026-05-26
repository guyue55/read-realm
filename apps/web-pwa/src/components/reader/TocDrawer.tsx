import React from "react";
import type { Bookmark } from "@reader/shared-types";
import { strings } from "@/lib/i18n";
import { QualityBadge, analyzeChapterQuality } from "@/components/QualityBadge";

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
  const containerClasses = isMobileDrawer
    ? "h-full flex flex-col"
    : "h-full flex flex-col border-r border-[rgba(80,65,45,0.12)] bg-[#F8F8F5]"; // paper bg

  return (
    <div className={containerClasses}>
      <div className="border-b border-[rgba(80,65,45,0.12)]">
        <div className="flex p-2">
          <button
            onClick={() => setActiveTab("toc")}
            className={`flex-1 py-2 text-sm font-bold border-b-2 transition-colors ${
              activeTab === "toc"
                ? "border-[#678055] text-[#678055]"
                : "border-transparent text-[#6F665B]"
            }`}
          >
            {strings.reader.toc}
          </button>
          <button
            onClick={() => setActiveTab("bookmarks")}
            className={`flex-1 py-2 text-sm font-bold border-b-2 transition-colors ${
              activeTab === "bookmarks"
                ? "border-[#678055] text-[#678055]"
                : "border-transparent text-[#6F665B]"
            }`}
          >
            {strings.reader.bookmarks}
          </button>
          {isMobileDrawer && onClose && (
             <button onClick={onClose} className="px-2 text-[#6F665B]">✕</button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === "toc" ? (
          <div>
            <div className="p-4 bg-[rgba(80,65,45,0.04)] text-xs text-[#6F665B] uppercase font-bold tracking-wider">
              {strings.reader.chapterCount.replace("{count}", toc.length.toString())}
            </div>
            {toc.map((item) => {
              const quality = item.content ? analyzeChapterQuality(item.content, item.title) : null;
              return (
                <button
                  key={item.index}
                  onClick={() => onJumpToChapter(item.index)}
                  className={`w-full text-left px-4 py-3 border-b border-[rgba(80,65,45,0.04)] flex items-center hover:bg-[rgba(80,65,45,0.04)] active:bg-[rgba(80,65,45,0.08)] ${
                    currentChapterIndex === item.index
                      ? "text-[#678055] font-bold"
                      : "text-[#2F2A24]"
                  }`}
                >
                  <span className="text-xs text-[#6F665B] w-8 inline-block opacity-70 shrink-0">
                    {item.index + 1}
                  </span>
                  <span className="flex-1 truncate text-sm mr-2">{item.title}</span>
                  {quality && (
                    <span className="shrink-0">
                      <QualityBadge issueType={quality.issueType} severity={quality.severity} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div>
            <div className="p-4 bg-[rgba(80,65,45,0.04)] text-xs text-[#6F665B] uppercase font-bold tracking-wider">
              {strings.reader.bookmarkCount.replace("{count}", bookmarks.length.toString())}
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
                    className="w-full text-left px-4 py-4 border-b border-[rgba(80,65,45,0.04)] hover:bg-[rgba(80,65,45,0.04)] active:bg-[rgba(80,65,45,0.08)]"
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-sm font-bold text-[#2F2A24] truncate flex-1 mr-2">
                        {toc[bookmark.chapterIndex]?.title ||
                          strings.reader.chapterIndexLabel.replace(
                            "{index}",
                            (bookmark.chapterIndex + 1).toString()
                          )}
                      </span>
                      <span className="text-[10px] text-[#6F665B] whitespace-nowrap">
                        {new Date(bookmark.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-xs text-[#6F665B] line-clamp-2 italic">
                      &quot;{bookmark.contentPreview || strings.reader.noPreview}&quot;...
                    </p>
                  </button>
                ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
