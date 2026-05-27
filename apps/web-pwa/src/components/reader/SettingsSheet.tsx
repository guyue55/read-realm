import React from "react";
import { THEMES, type ThemeName } from "@/styles/themes";
import { strings } from "@/lib/i18n";
import type { ReaderSettingsState } from "@/lib/reader-settings";

export interface SettingsSheetProps {
  settings: ReaderSettingsState;
  updateFontSize: (delta: number) => void;
  updateTheme: (theme: ThemeName) => void;
  updatePageMode: (mode: "scroll" | "pagination") => void;
  updateUiMode?: (mode: "default" | "simple") => void;
  isMobileSheet?: boolean;
  onClose?: () => void;
}

export function SettingsSheet({
  settings,
  updateFontSize,
  updateTheme,
  updatePageMode,
  updateUiMode,
  isMobileSheet = false,
  onClose,
}: SettingsSheetProps) {
  const isDark = settings.theme === 'dark';
  const bgClass = isDark ? "bg-[#232323] text-[#CFCFCF]" : "bg-white text-[#2F2A24]";
  const inputBgClass = isDark ? "bg-[#1E1E1E]" : "bg-[#F8F8F5]";
  const activeBtnBg = isDark ? "bg-[#333333]" : "bg-white";
  const textColor = isDark ? "text-[#CFCFCF]" : "text-[#2F2A24]";
  const mutedText = isDark ? "text-[#8F8F8F]" : "text-[#6F665B]";

  const containerClasses = isMobileSheet
    ? `h-full flex flex-col ${bgClass}`
    : `${bgClass} rounded-[24px] shadow-lg border border-[rgba(80,65,45,0.12)] p-6 max-w-sm w-full`;

  return (
    <div className={containerClasses}>
      {isMobileSheet && (
        <div className={`flex justify-between items-center mb-6 p-6 pb-0 ${bgClass}`}>
          <h3 className={`font-bold ${textColor}`}>{strings.reader.settings}</h3>
          {onClose && (
            <button onClick={onClose} className={`${mutedText} p-1`}>✕</button>
          )}
        </div>
      )}

      <div className={`flex flex-col gap-6 ${isMobileSheet ? 'px-6' : ''}`}>
        {updateUiMode && (
          <div className="flex items-center justify-between pb-4 border-b border-[rgba(80,65,45,0.08)]">
            <span className={`text-sm font-medium ${mutedText}`}>
              UI 主题
            </span>
            <div className={`flex items-center ${inputBgClass} rounded-lg p-1 ml-4 flex-1 border border-[rgba(80,65,45,0.08)]`}>
              <button
                onClick={() => updateUiMode("default")}
                className={`flex-1 h-8 flex items-center justify-center text-sm rounded-md transition-all ${
                  settings.uiMode === "default"
                    ? `${activeBtnBg} shadow-sm font-bold text-[#678055]`
                    : `${mutedText} hover:bg-[rgba(80,65,45,0.05)]`
                }`}
              >
                默认 (丰富)
              </button>
              <button
                onClick={() => updateUiMode("simple")}
                className={`flex-1 h-8 flex items-center justify-center text-sm rounded-md transition-all ${
                  settings.uiMode === "simple"
                    ? `${activeBtnBg} shadow-sm font-bold text-[#678055]`
                    : `${mutedText} hover:bg-[rgba(80,65,45,0.05)]`
                }`}
              >
                简洁
              </button>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className={`text-sm font-medium ${mutedText}`}>
            {strings.reader.fontSize}
          </span>
          <div className={`flex items-center ${inputBgClass} rounded-lg p-1 border border-[rgba(80,65,45,0.08)]`}>
            <button
              onClick={() => updateFontSize(-2)}
              className={`w-12 h-8 flex items-center justify-center text-xl font-bold ${textColor} hover:bg-[rgba(80,65,45,0.05)] rounded transition-colors`}
            >
              A-
            </button>
            <span className={`w-12 text-center font-bold ${textColor}`}>
              {settings.fontSize}
            </span>
            <button
              onClick={() => updateFontSize(2)}
              className={`w-12 h-8 flex items-center justify-center text-xl font-bold ${textColor} hover:bg-[rgba(80,65,45,0.05)] rounded transition-colors`}
            >
              A+
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className={`text-sm font-medium ${mutedText}`}>
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
          <span className={`text-sm font-medium ${mutedText}`}>
            {strings.reader.pageMode}
          </span>
          <div className={`flex items-center ${inputBgClass} rounded-lg p-1 ml-4 flex-1 border border-[rgba(80,65,45,0.08)]`}>
            <button
              onClick={() => updatePageMode("scroll")}
              className={`flex-1 h-8 flex items-center justify-center text-sm rounded-md transition-all ${
                settings.pageMode === "scroll"
                  ? `${activeBtnBg} shadow-sm font-bold text-[#678055]`
                  : `${mutedText} hover:bg-[rgba(80,65,45,0.05)]`
              }`}
            >
              {strings.reader.scroll}
            </button>
            <button
              onClick={() => updatePageMode("pagination")}
              className={`flex-1 h-8 flex items-center justify-center text-sm rounded-md transition-all ${
                settings.pageMode === "pagination"
                  ? `${activeBtnBg} shadow-sm font-bold text-[#678055]`
                  : `${mutedText} hover:bg-[rgba(80,65,45,0.05)]`
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
