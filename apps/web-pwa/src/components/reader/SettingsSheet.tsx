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
  updateFontFamily?: (fontFamily: "kaiti" | "songti" | "heiti") => void;
  updateParagraphSpacing?: (spacing: number) => void;
  updateLetterSpacing?: (spacing: number) => void;
  updateLineHeight?: (height: number) => void;
  updateAutoFlipAtBottom?: (enabled: boolean) => void;
  isMobileSheet?: boolean;
  onClose?: () => void;
}

export function SettingsSheet({
  settings,
  updateFontSize,
  updateTheme,
  updatePageMode,
  updateUiMode,
  updateFontFamily,
  updateParagraphSpacing,
  updateLetterSpacing,
  updateLineHeight,
  updateAutoFlipAtBottom,
  isMobileSheet = false,
  onClose,
}: SettingsSheetProps) {
  const isDark = settings.theme === "dark";
  const bgClass = isDark
    ? "bg-[#232323] text-[#CFCFCF]"
    : "bg-white text-[#2F2A24]";
  const inputBgClass = isDark ? "bg-[#1E1E1E]" : "bg-[#F8F8F5]";
  const activeBtnBg = isDark ? "bg-[#333333]" : "bg-white";
  const textColor = isDark ? "text-[#CFCFCF]" : "text-[#2F2A24]";
  const mutedText = isDark ? "text-[#8F8F8F]" : "text-[#6F665B]";

  const containerClasses = isMobileSheet
    ? `flex flex-col pb-[calc(2rem+env(safe-area-inset-bottom))] ${bgClass}`
    : `${bgClass} rounded-[24px] shadow-lg border border-[rgba(80,65,45,0.12)] p-6 max-w-sm w-full`;

  return (
    <div className={containerClasses}>
      {isMobileSheet && (
        <div
          className={`flex justify-between items-center mb-6 p-6 pb-0 ${bgClass}`}
        >
          <h3 className={`font-bold ${textColor}`}>
            {strings.reader.settings}
          </h3>
          {onClose && (
            <button onClick={onClose} className={`${mutedText} p-1`}>
              ✕
            </button>
          )}
        </div>
      )}

      <div className={`flex flex-col gap-6 ${isMobileSheet ? "px-6" : ""}`}>
        {updateUiMode && (
          <div className="flex items-center justify-between pb-4 border-b border-[rgba(80,65,45,0.08)]">
            <span className={`text-sm font-medium ${mutedText}`}>UI 主题</span>
            <div
              className={`flex items-center ${inputBgClass} rounded-lg p-1 ml-4 flex-1 border border-[rgba(80,65,45,0.08)]`}
            >
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
          <div
            className={`flex items-center ${inputBgClass} rounded-lg p-1 border border-[rgba(80,65,45,0.08)]`}
          >
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

        {updateFontFamily && (
          <div className="flex items-center justify-between">
            <span className={`text-sm font-medium ${mutedText}`}>
              字体
            </span>
            <div
              className={`flex items-center ${inputBgClass} rounded-lg p-1 ml-4 flex-1 border border-[rgba(80,65,45,0.08)]`}
            >
              {[
                { key: "kaiti", name: "楷体" },
                { key: "songti", name: "宋体" },
                { key: "heiti", name: "黑体" },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() =>
                    updateFontFamily(f.key as "kaiti" | "songti" | "heiti")
                  }
                  className={`flex-1 h-8 flex items-center justify-center text-sm rounded-md transition-all ${
                    settings.fontFamily === f.key
                      ? `${activeBtnBg} shadow-sm font-bold text-[#678055]`
                      : `${mutedText} hover:bg-[rgba(80,65,45,0.05)]`
                  }`}
                  style={{ fontFamily: `var(--font-${f.key})` }}
                >
                  {f.name}
                </button>
              ))}
            </div>
          </div>
        )}

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
          <div
            className={`flex items-center ${inputBgClass} rounded-lg p-1 ml-4 flex-1 border border-[rgba(80,65,45,0.08)]`}
          >
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

        {/* 精细排版 Slider 控制组 */}
        {updateLineHeight && (
          <div className="flex flex-col gap-1 pb-1">
            <div className="flex items-center justify-between text-sm font-medium">
              <span className={mutedText}>行间距</span>
              <span className={`${textColor} font-bold text-xs`}>{settings.lineHeight.toFixed(1)} 倍</span>
            </div>
            <input
              aria-label="行间距"
              type="range"
              min={1.4}
              max={2.2}
              step={0.1}
              value={settings.lineHeight}
              onChange={(e) => updateLineHeight(Number(e.target.value))}
              className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-[#678055] ${isDark ? "bg-white/10" : "bg-[rgba(80,65,45,0.12)]"}`}
            />
          </div>
        )}

        {updateParagraphSpacing && (
          <div className="flex flex-col gap-1 pb-1">
            <div className="flex items-center justify-between text-sm font-medium">
              <span className={mutedText}>段落间距</span>
              <span className={`${textColor} font-bold text-xs`}>{settings.paragraphSpacing} px</span>
            </div>
            <input
              aria-label="段落间距"
              type="range"
              min={0}
              max={32}
              step={4}
              value={settings.paragraphSpacing}
              onChange={(e) => updateParagraphSpacing(Number(e.target.value))}
              className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-[#678055] ${isDark ? "bg-white/10" : "bg-[rgba(80,65,45,0.12)]"}`}
            />
          </div>
        )}

        {updateLetterSpacing && (
          <div className="flex flex-col gap-1 pb-1">
            <div className="flex items-center justify-between text-sm font-medium">
              <span className={mutedText}>字间距</span>
              <span className={`${textColor} font-bold text-xs`}>{settings.letterSpacing.toFixed(2)} em</span>
            </div>
            <input
              aria-label="字间距"
              type="range"
              min={-0.02}
              max={0.15}
              step={0.01}
              value={settings.letterSpacing}
              onChange={(e) => updateLetterSpacing(Number(e.target.value))}
              className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-[#678055] ${isDark ? "bg-white/10" : "bg-[rgba(80,65,45,0.12)]"}`}
            />
          </div>
        )}

        {/* 触底自动切章 Switch */}
        {settings.pageMode === "scroll" && updateAutoFlipAtBottom && (
          <div className="flex items-center justify-between pt-4 border-t border-[rgba(80,65,45,0.08)]">
            <span className={`text-sm font-medium ${mutedText}`}>触底自动切章</span>
            <button
              onClick={() => updateAutoFlipAtBottom(!settings.autoFlipAtBottom)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
                settings.autoFlipAtBottom ? "bg-[#678055]" : "bg-gray-300 dark:bg-zinc-700"
              }`}
              role="switch"
              aria-checked={settings.autoFlipAtBottom}
              aria-label="触底自动切章"
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.autoFlipAtBottom ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
