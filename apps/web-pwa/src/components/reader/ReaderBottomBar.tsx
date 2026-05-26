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
}

export function ReaderBottomBar({
  onToggleToc,
  onToggleProgress,
  onToggleAi,
  onToggleSettings,
  onToggleNightMode,
  isVisible,
  activePanel,
}: ReaderBottomBarProps) {
  return (
    <div
      className={`fixed bottom-0 inset-x-0 h-[calc(60px+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] bg-[rgba(255,252,245,0.96)] border-t border-[rgba(80,65,45,0.12)] z-20 flex items-center justify-around px-4 transition-transform duration-200 pointer-events-auto shadow-[0_-2px_10px_rgba(80,65,45,0.05)] ${
        isVisible ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <button
        onClick={onToggleToc}
        className={`text-sm flex flex-col items-center gap-1 active:scale-95 transition-transform ${
          activePanel === "toc" ? "text-[#678055] font-bold" : "text-[#6F665B]"
        }`}
      >
        <span>☰</span>
        <span className="text-[10px]">{strings.reader.toc}</span>
      </button>
      <button
        onClick={onToggleProgress}
        className={`text-sm flex flex-col items-center gap-1 active:scale-95 transition-transform ${
          activePanel === "progress" ? "text-[#678055] font-bold" : "text-[#6F665B]"
        }`}
      >
        <span>◤</span>
        <span className="text-[10px]">{strings.reader.progress}</span>
      </button>
      <button
        onClick={onToggleAi}
        className={`text-sm flex flex-col items-center gap-1 active:scale-95 transition-transform ${
          activePanel === "ai" ? "text-[#9A6A3A] font-bold" : "text-[#6F665B]"
        }`}
      >
        <span>✨</span>
        <span className="text-[10px]">AI</span>
      </button>
      <button
        onClick={onToggleSettings}
        className={`text-sm flex flex-col items-center gap-1 active:scale-95 transition-transform ${
          activePanel === "settings" ? "text-[#678055] font-bold" : "text-[#6F665B]"
        }`}
      >
        <span>⚙</span>
        <span className="text-[10px]">{strings.reader.settings}</span>
      </button>
      <button
        onClick={onToggleNightMode}
        className="text-sm flex flex-col items-center gap-1 active:scale-95 transition-transform text-[#6F665B]"
      >
        <span>☾</span>
        <span className="text-[10px]">{strings.reader.nightMode}</span>
      </button>
    </div>
  );
}
