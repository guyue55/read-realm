import React from "react";
import { strings } from "@/lib/i18n";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import {
  ArrowLeft,
  Bookmark,
  ChevronsLeft,
  ChevronsRight,
  List,
  Settings2,
  Sparkles,
} from "lucide-react";

export interface ReaderTopBarProps {
  title: string;
  onBack: () => void;
  onBookmark: () => void;
  onSettings: () => void;
  isVisible: boolean;
  isDesktop?: boolean;
  isDark?: boolean;
  onToggleToc?: () => void;
  onToggleAi?: () => void;
  onPrevChapter?: () => void;
  onNextChapter?: () => void;
  progress?: number;
  currentChapterIndex?: number;
  totalChapters?: number;
  backgroundDisabled?: boolean;
}

export function ReaderTopBar({
  title,
  onBack,
  onBookmark,
  onSettings,
  isVisible,
  isDesktop = false,
  isDark = false,
  onToggleToc,
  onToggleAi,
  onPrevChapter,
  onNextChapter,
  progress,
  currentChapterIndex,
  totalChapters,
  backgroundDisabled = false,
}: ReaderTopBarProps) {
  const isOnline = useOnlineStatus();
  // Mobile Top Bar (Overlay)
  if (!isDesktop) {
    const bgClass = isDark
      ? "bg-[rgba(35,35,35,0.96)]"
      : "bg-[rgba(255,252,245,0.96)]";
    const borderClass = isDark
      ? "border-[rgba(255,255,255,0.1)]"
      : "border-[rgba(80,65,45,0.12)]";
    const textColor = isDark ? "text-[#CFCFCF]" : "text-[#2F2A24]";
    const iconColor = isDark ? "text-[#8F8F8F]" : "text-[#6F665B]";

    return (
      <div
        aria-hidden={!isVisible}
        data-reader-toolbar="top"
        inert={!isVisible || backgroundDisabled ? true : undefined}
        className={`fixed top-0 inset-x-0 pt-[env(safe-area-inset-top)] pb-0 min-h-[calc(3.5rem+env(safe-area-inset-top))] ${bgClass} shadow-sm z-20 flex items-center px-4 reader-panel-motion border-b ${borderClass} ${
          isVisible
            ? "translate-y-0 opacity-100 pointer-events-auto"
            : "-translate-y-full opacity-0 pointer-events-none"
        }`}
      >
        <button
          onClick={onBack}
          aria-label="返回书架"
          data-icon-only="true"
          data-reader-control
          className={`reader-control-press reader-focus-ring mr-4 min-w-11 min-h-11 flex items-center justify-center rounded-xl ${iconColor}`}
        >
          <ArrowLeft aria-hidden="true" size={20} strokeWidth={1.8} />
        </button>
        <div className="flex-1 flex flex-col items-center justify-center min-w-0 px-2">
          <span
            className={`truncate w-full text-sm font-bold text-center flex items-center justify-center gap-1.5 ${textColor}`}
          >
            <span>{title}</span>
            {!isOnline && (
              <span className="text-[9px] font-extrabold px-1.5 py-0.5 bg-[#FAF4EB]/90 border border-[#E5C9A6]/40 text-[#8C6239] rounded scale-90 select-none leading-none">
                离线
              </span>
            )}
          </span>
          {typeof progress === "number" && (
            <span className={`text-[10px] font-semibold tracking-wider opacity-60 ${textColor}`}>
              {Math.round(progress)}% · {(currentChapterIndex || 0) + 1}/{totalChapters || 1} 章
            </span>
          )}
        </div>
        <button
          onClick={onSettings}
          aria-label="阅读设置"
          data-icon-only="true"
          data-reader-control
          className={`reader-control-press reader-focus-ring ml-4 min-w-11 min-h-11 flex items-center justify-center rounded-xl ${iconColor}`}
        >
          <Settings2 aria-hidden="true" size={20} strokeWidth={1.8} />
        </button>
      </div>
    );
  }

  // Desktop Weak Toolbar (Always visible but unobtrusive)
  return (
    <div
      aria-hidden={backgroundDisabled || undefined}
      data-reader-toolbar="top"
      inert={backgroundDisabled ? true : undefined}
      className="grid grid-cols-3 items-center px-6 py-3 border-b border-[rgba(80,65,45,0.12)] bg-transparent"
    >
      <div className="flex justify-start">
        <button
          onClick={onBack}
          data-reader-control
          className="reader-control-press reader-focus-ring min-h-11 min-w-11 shrink-0 rounded-xl px-2 text-sm font-medium text-[#6F665B] hover:text-[#5F7D52] flex items-center justify-center gap-2"
        >
          <ArrowLeft aria-hidden="true" size={18} strokeWidth={1.8} />
          <span className="hidden lg:inline">返回书架</span>
        </button>
      </div>
      
      <div className="flex justify-center items-center gap-4 select-none">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPrevChapter?.();
          }}
          data-icon-only="true"
          data-reader-control
          className="reader-control-press reader-focus-ring flex shrink-0 items-center justify-center min-w-11 w-11 h-11 bg-[rgba(80,65,45,0.04)] hover:bg-[rgba(80,65,45,0.08)] rounded-full text-[#6F665B] hover:text-[#5F7D52]"
          title="上一章"
          aria-label="上一章"
        >
          <ChevronsLeft aria-hidden="true" size={18} strokeWidth={1.8} />
        </button>
        
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-bold font-serif max-w-[200px] truncate opacity-85">
            {title}
          </span>
          {typeof progress === "number" && (
            <div 
              className="flex items-center gap-1.5 backdrop-blur-md bg-[rgba(103,128,85,0.08)] border border-[#678055]/15 text-[#678055] px-2.5 py-0.5 rounded-full text-[10px] font-extrabold tracking-wide"
              title={`阅读进度: ${Math.round(progress)}%`}
            >
              <span>{Math.round(progress)}%</span>
              {typeof currentChapterIndex === "number" && typeof totalChapters === "number" && (
                <span className="opacity-60 font-normal">({currentChapterIndex + 1}/{totalChapters})</span>
              )}
            </div>
          )}
          {!isOnline && (
            <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-[#FAF4EB] border border-[#E5C9A6]/50 text-[#8C6239] uppercase tracking-wider select-none shrink-0 leading-none">
              离线
            </span>
          )}
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onNextChapter?.();
          }}
          data-icon-only="true"
          data-reader-control
          className="reader-control-press reader-focus-ring flex shrink-0 items-center justify-center min-w-11 w-11 h-11 bg-[rgba(80,65,45,0.04)] hover:bg-[rgba(80,65,45,0.08)] rounded-full text-[#6F665B] hover:text-[#5F7D52]"
          title="下一章"
          aria-label="下一章"
        >
          <ChevronsRight aria-hidden="true" size={18} strokeWidth={1.8} />
        </button>
      </div>

      <div className="flex justify-end gap-2 lg:gap-4 items-center">
        {onToggleToc && (
          <button
            onClick={onToggleToc}
            data-reader-control
            className="reader-control-press reader-focus-ring min-h-11 min-w-11 shrink-0 rounded-xl px-2 text-sm font-medium text-[#6F665B] hover:text-[#5F7D52] flex items-center justify-center gap-2"
            title="展开目录"
            aria-label="展开目录"
          >
            <List aria-hidden="true" size={18} strokeWidth={1.8} />
            <span className="hidden lg:inline">{strings.reader.toc}</span>
          </button>
        )}
        <button
          onClick={onBookmark}
          data-reader-control
          className="reader-control-press reader-focus-ring min-h-11 min-w-11 shrink-0 rounded-xl px-2 text-sm font-medium text-[#678055] hover:text-[#5F7D52] flex items-center justify-center gap-2"
          title="添加书签"
          aria-label="添加书签"
        >
          <Bookmark aria-hidden="true" size={18} strokeWidth={1.8} />
          <span className="hidden lg:inline">{strings.reader.bookmark}</span>
        </button>
        {onToggleAi && (
          <button
            onClick={onToggleAi}
            data-reader-control
            className="reader-control-press reader-focus-ring min-h-11 min-w-11 shrink-0 rounded-xl px-2 text-sm font-medium text-[#9A6A3A] hover:text-[#B37B46] flex items-center justify-center gap-2"
            title="伴读"
            aria-label="伴读"
          >
            <Sparkles aria-hidden="true" size={18} strokeWidth={1.8} />
            <span className="hidden lg:inline">{strings.reader.aiSummary}</span>
          </button>
        )}
        <button
          onClick={onSettings}
          aria-label="阅读设置"
          data-reader-control
          className="reader-control-press reader-focus-ring min-h-11 min-w-11 shrink-0 rounded-xl px-2 text-sm font-medium text-[#6F665B] hover:text-[#5F7D52] flex items-center justify-center gap-2"
          title="阅读设置"
        >
          <Settings2 aria-hidden="true" size={18} strokeWidth={1.8} />
          <span className="hidden lg:inline">设置</span>
        </button>
      </div>
    </div>
  );
}
