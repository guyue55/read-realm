import React from "react";
import { THEMES, type ThemeName } from "@/styles/themes";
import { strings } from "@/lib/i18n";
import type { ReaderSettingsState } from "@/lib/reader-settings";

export interface SettingsSheetProps {
  settings: ReaderSettingsState;
  updateFontSize: (delta: number) => void;
  updateTheme: (theme: ThemeName) => void;
  updatePageMode: (mode: "scroll" | "pagination") => void;
  isMobileSheet?: boolean;
  onClose?: () => void;
}

export function SettingsSheet({
  settings,
  updateFontSize,
  updateTheme,
  updatePageMode,
  isMobileSheet = false,
  onClose,
}: SettingsSheetProps) {
  const containerClasses = isMobileSheet
    ? "h-full bg-white flex flex-col"
    : "bg-white rounded-[24px] shadow-lg border border-[rgba(80,65,45,0.12)] p-6 max-w-sm w-full";

  return (
    <div className={containerClasses}>
      {isMobileSheet && (
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-bold text-[#2F2A24]">{strings.reader.settings}</h3>
          {onClose && (
            <button onClick={onClose} className="text-[#6F665B] p-1">✕</button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-[#6F665B]">
            {strings.reader.fontSize}
          </span>
          <div className="flex items-center bg-[#F8F8F5] rounded-lg p-1 border border-[rgba(80,65,45,0.08)]">
            <button
              onClick={() => updateFontSize(-2)}
              className="w-12 h-8 flex items-center justify-center text-xl font-bold text-[#2F2A24] hover:bg-[#E8E3DA] rounded transition-colors"
            >
              A-
            </button>
            <span className="w-12 text-center font-bold text-[#2F2A24]">
              {settings.fontSize}
            </span>
            <button
              onClick={() => updateFontSize(2)}
              className="w-12 h-8 flex items-center justify-center text-xl font-bold text-[#2F2A24] hover:bg-[#E8E3DA] rounded transition-colors"
            >
              A+
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-[#6F665B]">
            {strings.reader.background}
          </span>
          <div className="flex flex-1 justify-end gap-3 ml-4">
            {Object.entries(THEMES).map(([name, colors]) => (
              <button
                key={name}
                onClick={() => updateTheme(name as ThemeName)}
                className={`w-8 h-8 rounded-full border-2 transition-all ${
                  settings.theme === name
                    ? "border-[#678055] scale-110"
                    : "border-[rgba(80,65,45,0.12)] hover:scale-105"
                }`}
                style={{ backgroundColor: colors.bg }}
                title={strings.reader.themeNames[name as ThemeName]}
                aria-label={strings.reader.themeNames[name as ThemeName]}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-[#6F665B]">
            {strings.reader.pageMode}
          </span>
          <div className="flex items-center bg-[#F8F8F5] rounded-lg p-1 ml-4 flex-1 border border-[rgba(80,65,45,0.08)]">
            <button
              onClick={() => updatePageMode("scroll")}
              className={`flex-1 h-8 flex items-center justify-center text-sm rounded-md transition-all ${
                settings.pageMode === "scroll"
                  ? "bg-white shadow-sm font-bold text-[#678055]"
                  : "text-[#6F665B] hover:bg-[#E8E3DA]"
              }`}
            >
              {strings.reader.scroll}
            </button>
            <button
              onClick={() => updatePageMode("pagination")}
              className={`flex-1 h-8 flex items-center justify-center text-sm rounded-md transition-all ${
                settings.pageMode === "pagination"
                  ? "bg-white shadow-sm font-bold text-[#678055]"
                  : "text-[#6F665B] hover:bg-[#E8E3DA]"
              }`}
            >
              {strings.reader.pagination}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
