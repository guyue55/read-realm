import React from "react";
import { strings } from "@/lib/i18n";

export interface ReaderBottomBarProps {
  onToggleToc: () => void;
  onToggleProgress: () => void;
  onToggleAi: () => void;
  onToggleSettings: () => void;
  onToggleNightMode: () => void;
  isVisible: boolean;
  activePanel?: "toc" | "progress" | "ai" | "settings" | null;
  isDark?: boolean;
}

export function ReaderBottomBar({
  onToggleToc,
  onToggleProgress,
  onToggleAi,
  onToggleSettings,
  onToggleNightMode,
  isVisible,
  activePanel,
  isDark = false,
}: ReaderBottomBarProps) {
  const bgClass = isDark ? "bg-[rgba(35,35,35,0.96)]" : "bg-[rgba(255,252,245,0.96)]";
  const borderClass = isDark ? "border-[rgba(255,255,255,0.1)]" : "border-[rgba(80,65,45,0.12)]";
  const shadowClass = isDark ? "shadow-[0_-2px_10px_rgba(0,0,0,0.5)]" : "shadow-[0_-2px_10px_rgba(80,65,45,0.05)]";
  
  const iconColor = isDark ? "text-[#8F8F8F]" : "text-[#6F665B]";
  const activeColor = isDark ? "text-[#D8D2C6]" : "text-[#678055]";
  const aiColor = isDark ? "text-[#D2A66A]" : "text-[#9A6A3A]";

  return (
    <div
      className={`fixed bottom-0 inset-x-0 h-[calc(60px+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] ${bgClass} border-t ${borderClass} z-20 flex items-center justify-around px-4 transition-transform duration-200 pointer-events-auto ${shadowClass} ${
        isVisible ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <button
        onClick={onToggleToc}
        className={`text-sm flex flex-col items-center gap-1 active:scale-95 transition-transform ${
          activePanel === "toc" ? `${activeColor} font-bold` : iconColor
        }`}
      >
        <span>☰</span>
        <span className="text-[10px]">{strings.reader.toc}</span>
      </button>
      <button
        onClick={onToggleProgress}
        className={`text-sm flex flex-col items-center gap-1 active:scale-95 transition-transform ${
          activePanel === "progress" ? `${activeColor} font-bold` : iconColor
        }`}
      >
        <span>◤</span>
        <span className="text-[10px]">{strings.reader.progress}</span>
      </button>
      <button
        onClick={onToggleAi}
        className={`text-sm flex flex-col items-center gap-1 active:scale-95 transition-transform ${
          activePanel === "ai" ? `${aiColor} font-bold` : iconColor
        }`}
      >
        <span>✨</span>
        <span className="text-[10px]">AI</span>
      </button>
      <button
        onClick={onToggleSettings}
        className={`text-sm flex flex-col items-center gap-1 active:scale-95 transition-transform ${
          activePanel === "settings" ? `${activeColor} font-bold` : iconColor
        }`}
      >
        <span>⚙</span>
        <span className="text-[10px]">{strings.reader.settings}</span>
      </button>
      <button
        onClick={onToggleNightMode}
        className={`text-sm flex flex-col items-center gap-1 active:scale-95 transition-transform ${iconColor}`}
      >
        <span>☾</span>
        <span className="text-[10px]">{strings.reader.nightMode}</span>
      </button>
    </div>
  );
}
