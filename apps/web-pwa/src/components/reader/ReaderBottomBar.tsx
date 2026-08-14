import React, { useState, useEffect, useRef } from "react";
import { strings } from "@/lib/i18n";
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Gauge,
  List,
  Moon,
  Settings2,
  Sparkles,
  Sun,
  type LucideIcon,
} from "lucide-react";

export interface ReaderBottomBarProps {
  onToggleToc: () => void;
  onToggleProgress: () => void;
  onToggleAi: () => void;
  onToggleSettings: () => void;
  onToggleNightMode: () => void;
  onBookmark: () => void;
  onPagePrev: () => void;
  onPageNext: () => void;
  onSeekProgress: (progress: number) => void;
  isVisible: boolean;
  activePanel?: "toc" | "progress" | "ai" | "settings" | null;
  isDark?: boolean;
  progress?: number;
  onPrevChapter?: () => void;
  onNextChapter?: () => void;
  backgroundDisabled?: boolean;
}

export function ReaderBottomBar({
  onToggleToc,
  onToggleProgress,
  onToggleAi,
  onToggleSettings,
  onToggleNightMode,
  onBookmark,
  onPagePrev,
  onPageNext,
  onSeekProgress,
  isVisible,
  activePanel,
  isDark = false,
  progress = 0,
  onPrevChapter,
  onNextChapter,
  backgroundDisabled = false,
}: ReaderBottomBarProps) {
  const safeProgress = Math.max(0, Math.min(100, progress));

  const [tempProgress, setTempProgress] = useState(safeProgress);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    if (!isDraggingRef.current) {
      setTempProgress(safeProgress);
    }
  }, [safeProgress]);
  const shellClass = isDark
    ? "border-[rgba(255,255,255,0.12)] bg-[rgba(35,35,35,0.96)] text-[#CFCFCF] shadow-[0_18px_60px_rgba(0,0,0,0.38)]"
    : "border-[rgba(80,65,45,0.12)] bg-[rgba(255,252,245,0.96)] text-[#2F2A24] shadow-[0_18px_60px_rgba(47,42,36,0.18)]";
  const mutedClass = isDark ? "text-[#9D978D]" : "text-[#6F665B]";
  const activeClass = isDark
    ? "bg-[rgba(216,210,198,0.1)] text-[#D8D2C6]"
    : "bg-[#EEF2E9] text-[#5F7D52]";

  const actions: Array<{
    label: string;
    icon: LucideIcon;
    active: boolean;
    onClick: () => void;
  }> = [
    {
      label: strings.reader.toc,
      icon: List,
      active: activePanel === "toc",
      onClick: onToggleToc,
    },
    {
      label: strings.reader.bookmark,
      icon: Bookmark,
      active: false,
      onClick: onBookmark,
    },
    {
      label: strings.reader.progress,
      icon: Gauge,
      active: activePanel === "progress",
      onClick: onToggleProgress,
    },
    {
      label: "伴读",
      icon: Sparkles,
      active: activePanel === "ai",
      onClick: onToggleAi,
    },
    {
      label: strings.reader.settings,
      icon: Settings2,
      active: activePanel === "settings",
      onClick: onToggleSettings,
    },
    {
      label: strings.reader.nightMode,
      icon: isDark ? Sun : Moon,
      active: false,
      onClick: onToggleNightMode,
    },
  ];

  return (
    <div
      aria-hidden={!isVisible}
      data-reader-toolbar="bottom"
      inert={!isVisible || backgroundDisabled ? true : undefined}
      style={{ willChange: "transform" }}
      className={`fixed inset-x-3 bottom-[calc(12px+env(safe-area-inset-bottom))] z-20 rounded-[22px] border px-4 pb-4 pt-3 backdrop-blur-xl reader-panel-motion sm:inset-x-auto sm:left-1/2 sm:w-[560px] sm:-translate-x-1/2 ${shellClass} ${
        isVisible
          ? "translate-y-0 opacity-100 pointer-events-auto"
          : "translate-y-6 opacity-0 pointer-events-none"
      }`}
    >
      <div className="mb-3 grid grid-cols-[44px_44px_minmax(0,1fr)_44px_44px_42px] items-center gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPrevChapter?.();
          }}
          data-icon-only="true"
          data-reader-control
          className={`reader-control-press reader-focus-ring flex h-11 w-11 items-center justify-center rounded-full ${mutedClass} hover:bg-[rgba(80,65,45,0.08)] hover:text-[#5F7D52]`}
          title="上一章"
          aria-label="上一章"
        >
          <ChevronsLeft aria-hidden="true" size={19} strokeWidth={1.8} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPagePrev();
          }}
          data-icon-only="true"
          data-reader-control
          className={`reader-control-press reader-focus-ring flex h-11 w-11 items-center justify-center rounded-full ${mutedClass} hover:bg-[rgba(80,65,45,0.06)]`}
          aria-label="上一页"
        >
          <ChevronLeft aria-hidden="true" size={20} strokeWidth={1.8} />
        </button>
        <input
          aria-label="拖动阅读进度"
          data-reader-control
          type="range"
          min={0}
          max={100}
          step={0.1}
          value={tempProgress}
          onChange={(event) => {
            isDraggingRef.current = true;
            setTempProgress(Number(event.target.value));
          }}
          onMouseUp={() => {
            isDraggingRef.current = false;
            onSeekProgress(tempProgress);
          }}
          onTouchEnd={() => {
            isDraggingRef.current = false;
            onSeekProgress(tempProgress);
          }}
          onKeyUp={(event) => {
            if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(event.key)) {
              isDraggingRef.current = false;
              onSeekProgress(tempProgress);
            }
          }}
          className="reader-range reader-focus-ring h-11 w-full accent-[#5F7D52]"
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPageNext();
          }}
          data-icon-only="true"
          data-reader-control
          className={`reader-control-press reader-focus-ring flex h-11 w-11 items-center justify-center rounded-full ${mutedClass} hover:bg-[rgba(80,65,45,0.06)]`}
          aria-label="下一页"
        >
          <ChevronRight aria-hidden="true" size={20} strokeWidth={1.8} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNextChapter?.();
          }}
          data-icon-only="true"
          data-reader-control
          className={`reader-control-press reader-focus-ring flex h-11 w-11 items-center justify-center rounded-full ${mutedClass} hover:bg-[rgba(80,65,45,0.08)] hover:text-[#5F7D52]`}
          title="下一章"
          aria-label="下一章"
        >
          <ChevronsRight aria-hidden="true" size={19} strokeWidth={1.8} />
        </button>
        <span className={`text-right text-xs font-semibold ${mutedClass}`}>
          {Math.round(tempProgress)}%
        </span>
      </div>

      <div className="grid grid-cols-6 gap-2">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
          <button
            key={action.label}
            onClick={action.onClick}
            aria-pressed={action.active}
            data-reader-control
            className={`reader-control-press reader-focus-ring flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-[14px] text-[11px] font-semibold ${
              action.active
                ? activeClass
                : `${mutedClass} hover:bg-[rgba(80,65,45,0.05)]`
            }`}
          >
            <span className="flex h-5 min-w-5 items-center justify-center text-sm font-bold">
              <Icon aria-hidden="true" size={19} strokeWidth={1.8} />
            </span>
            <span className="max-w-full truncate">{action.label}</span>
          </button>
          );
        })}
      </div>
    </div>
  );
}
