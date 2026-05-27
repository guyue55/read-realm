import React from "react";
import { strings } from "@/lib/i18n";

export interface ReaderTopBarProps {
  title: string;
  onBack: () => void;
  onSummarize: () => void;
  onBookmark: () => void;
  onSettings: () => void;
  isVisible: boolean;
  isDesktop?: boolean;
  isDark?: boolean;
}

export function ReaderTopBar({
  title,
  onBack,
  onSummarize,
  onBookmark,
  onSettings,
  isVisible,
  isDesktop = false,
  isDark = false,
}: ReaderTopBarProps) {
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
        className={`fixed top-0 inset-x-0 h-14 ${bgClass} shadow-sm z-20 flex items-center px-4 transition-all duration-200 border-b ${borderClass} ${
          isVisible
            ? "translate-y-0 opacity-100 pointer-events-auto"
            : "-translate-y-full opacity-0 pointer-events-none"
        }`}
      >
        <button
          onClick={onBack}
          className={`mr-4 text-sm font-medium ${iconColor} active:scale-95`}
        >
          ←
        </button>
        <span
          className={`truncate flex-1 text-sm font-bold text-center ${textColor}`}
        >
          {title}
        </span>
        <button
          onClick={onSettings}
          className={`ml-4 text-sm font-medium ${iconColor} active:scale-95`}
        >
          ⚙
        </button>
      </div>
    );
  }

  // Desktop Weak Toolbar (Always visible but unobtrusive)
  return (
    <div className="flex items-center justify-between px-6 py-3 border-b border-[rgba(80,65,45,0.12)] bg-transparent">
      <button
        onClick={onBack}
        className="text-sm font-medium text-[#6F665B] hover:text-inherit"
      >
        ← 返回书架
      </button>
      <div className="flex gap-4">
        <button
          onClick={onSummarize}
          className="text-sm font-medium text-[#9A6A3A] hover:opacity-80"
        >
          ✨ {strings.reader.aiSummary}
        </button>
        <button
          onClick={onBookmark}
          className="text-sm font-medium text-[#678055] hover:opacity-80"
        >
          + {strings.reader.bookmark}
        </button>
      </div>
    </div>
  );
}
