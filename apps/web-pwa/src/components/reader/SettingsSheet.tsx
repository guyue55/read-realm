import React from "react";
import { THEMES, type ThemeName } from "@/styles/themes";
import { strings } from "@/lib/i18n";
import type { ReaderSettingsState } from "@/lib/reader-settings";
import { X } from "lucide-react";

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
    ? "bg-[#232323]/92 backdrop-blur-md text-[#CFCFCF]"
    : "bg-white/92 backdrop-blur-md text-[#2F2A24]";
  const inputBgClass = isDark ? "bg-[#1E1E1E]" : "bg-[#F8F8F5]";
  const activeBtnBg = isDark ? "bg-[#333333]" : "bg-white";
  const textColor = isDark ? "text-[#CFCFCF]" : "text-[#2F2A24]";
  const mutedText = isDark ? "text-[#8F8F8F]" : "text-[#6F665B]";

  const containerClasses = isMobileSheet
    ? `flex flex-col pb-[calc(1.2rem+env(safe-area-inset-bottom))] ${bgClass} max-h-[60vh] overflow-y-auto rounded-[24px] shadow-2xl`
    : `${bgClass} rounded-[24px] shadow-lg border border-[rgba(80,65,45,0.12)] p-6 max-w-sm w-full`;

  return (
    <div className={containerClasses}>
      {isMobileSheet && (
        <div
          className={`flex justify-between items-center mb-4 p-4 pb-0 ${bgClass}`}
        >
          <h3 className={`font-bold ${textColor}`}>
            {strings.reader.settings}
          </h3>
          {onClose && (
            <button
              aria-label="关闭阅读设置"
              onClick={onClose}
              data-icon-only="true"
              data-reader-control
              className={`reader-control-press reader-focus-ring ${mutedText} flex h-11 w-11 items-center justify-center rounded-xl`}
            >
              <X aria-hidden="true" size={20} strokeWidth={1.8} />
            </button>
          )}
        </div>
      )}

      <div className={`flex flex-col gap-4 ${isMobileSheet ? "px-4 pb-4" : ""}`}>
        {updateUiMode && (
          <div className="flex items-center justify-between pb-4 border-b border-[rgba(80,65,45,0.08)]">
            <span className={`text-sm font-medium ${mutedText}`}>{strings.reader.uiModeLabel}</span>
            <div
              className={`flex items-center ${inputBgClass} rounded-lg p-1 ml-4 flex-1 border border-[rgba(80,65,45,0.08)]`}
            >
              <button
                onClick={() => updateUiMode("default")}
                aria-pressed={settings.uiMode === "default"}
                data-reader-control
                className={`reader-control-press reader-focus-ring flex-1 min-h-11 flex items-center justify-center text-sm rounded-[10px] ${
                  settings.uiMode === "default"
                    ? `${activeBtnBg} shadow-sm font-bold text-[#678055]`
                    : `${mutedText} hover:bg-[rgba(80,65,45,0.05)]`
                }`}
              >
                {strings.reader.uiModeDefault}
              </button>
              <button
                onClick={() => updateUiMode("simple")}
                aria-pressed={settings.uiMode === "simple"}
                data-reader-control
                className={`reader-control-press reader-focus-ring flex-1 min-h-11 flex items-center justify-center text-sm rounded-[10px] ${
                  settings.uiMode === "simple"
                    ? `${activeBtnBg} shadow-sm font-bold text-[#678055]`
                    : `${mutedText} hover:bg-[rgba(80,65,45,0.05)]`
                }`}
              >
                {strings.reader.uiModeSimple}
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
              aria-label="减小字号"
              data-reader-control
              className={`reader-control-press reader-focus-ring w-12 min-h-11 flex items-center justify-center text-xl font-bold ${textColor} hover:bg-[rgba(80,65,45,0.05)] rounded-[10px]`}
            >
              A-
            </button>
            <span className={`w-12 text-center font-bold ${textColor}`}>
              {settings.fontSize}
            </span>
            <button
              onClick={() => updateFontSize(2)}
              aria-label="增大字号"
              data-reader-control
              className={`reader-control-press reader-focus-ring w-12 min-h-11 flex items-center justify-center text-xl font-bold ${textColor} hover:bg-[rgba(80,65,45,0.05)] rounded-[10px]`}
            >
              A+
            </button>
          </div>
        </div>

        {updateFontFamily && (
          <div className="flex items-center justify-between">
            <span className={`text-sm font-medium ${mutedText}`}>
              {strings.reader.fontFamilyLabel}
            </span>
            <div
              className={`flex items-center ${inputBgClass} rounded-lg p-1 ml-4 flex-1 border border-[rgba(80,65,45,0.08)]`}
            >
              {[
                { key: "kaiti", name: strings.reader.fontFamilyKaiti },
                { key: "songti", name: strings.reader.fontFamilySongti },
                { key: "heiti", name: strings.reader.fontFamilyHeiti },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() =>
                    updateFontFamily(f.key as "kaiti" | "songti" | "heiti")
                  }
                  aria-pressed={settings.fontFamily === f.key}
                  data-reader-control
                  className={`reader-control-press reader-focus-ring flex-1 min-h-11 flex items-center justify-center text-sm rounded-[10px] ${
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
                data-reader-control
                className={`reader-control-press reader-focus-ring flex h-11 w-11 items-center justify-center rounded-full ${
                  settings.theme === name
                    ? "bg-[#678055]/10"
                    : "hover:bg-[rgba(80,65,45,0.05)]"
                }`}
                title={strings.reader.themeNames[name as ThemeName]}
                aria-label={strings.reader.themeNames[name as ThemeName]}
              >
                <span
                  aria-hidden="true"
                  className={`h-8 w-8 rounded-full border-2 ${
                    settings.theme === name
                      ? "border-[#678055]"
                      : "border-[rgba(80,65,45,0.12)]"
                  }`}
                  style={{ backgroundColor: colors.bg }}
                />
              </button>
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
              aria-pressed={settings.pageMode === "scroll"}
              data-reader-control
              className={`reader-control-press reader-focus-ring flex-1 min-h-11 flex items-center justify-center text-sm rounded-[10px] ${
                settings.pageMode === "scroll"
                  ? `${activeBtnBg} shadow-sm font-bold text-[#678055]`
                  : `${mutedText} hover:bg-[rgba(80,65,45,0.05)]`
              }`}
            >
              {strings.reader.scroll}
            </button>
            <button
              onClick={() => updatePageMode("pagination")}
              aria-pressed={settings.pageMode === "pagination"}
              data-reader-control
              className={`reader-control-press reader-focus-ring flex-1 min-h-11 flex items-center justify-center text-sm rounded-[10px] ${
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
              <span className={mutedText}>{strings.reader.lineHeightLabel}</span>
              <span className={`${textColor} font-bold text-xs`}>{settings.lineHeight.toFixed(1)} 倍</span>
            </div>
            <input
              aria-label={strings.reader.lineHeightLabel}
              data-reader-control
              type="range"
              min={1.4}
              max={2.2}
              step={0.1}
              value={settings.lineHeight}
              onChange={(e) => updateLineHeight(Number(e.target.value))}
              className={`reader-range reader-focus-ring w-full h-11 cursor-pointer accent-[#678055] ${isDark ? "reader-range-dark" : ""}`}
            />
          </div>
        )}

        {updateParagraphSpacing && (
          <div className="flex flex-col gap-1 pb-1">
            <div className="flex items-center justify-between text-sm font-medium">
              <span className={mutedText}>{strings.reader.paragraphSpacingLabel}</span>
              <span className={`${textColor} font-bold text-xs`}>{settings.paragraphSpacing} px</span>
            </div>
            <input
              aria-label={strings.reader.paragraphSpacingLabel}
              data-reader-control
              type="range"
              min={0}
              max={32}
              step={4}
              value={settings.paragraphSpacing}
              onChange={(e) => updateParagraphSpacing(Number(e.target.value))}
              className={`reader-range reader-focus-ring w-full h-11 cursor-pointer accent-[#678055] ${isDark ? "reader-range-dark" : ""}`}
            />
          </div>
        )}

        {updateLetterSpacing && (
          <div className="flex flex-col gap-1 pb-1">
            <div className="flex items-center justify-between text-sm font-medium">
              <span className={mutedText}>{strings.reader.letterSpacingLabel}</span>
              <span className={`${textColor} font-bold text-xs`}>{settings.letterSpacing.toFixed(2)} em</span>
            </div>
            <input
              aria-label={strings.reader.letterSpacingLabel}
              data-reader-control
              type="range"
              min={-0.02}
              max={0.15}
              step={0.01}
              value={settings.letterSpacing}
              onChange={(e) => updateLetterSpacing(Number(e.target.value))}
              className={`reader-range reader-focus-ring w-full h-11 cursor-pointer accent-[#678055] ${isDark ? "reader-range-dark" : ""}`}
            />
          </div>
        )}

        {/* 触底自动切章 Switch */}
        {settings.pageMode === "scroll" && updateAutoFlipAtBottom && (
          <div className="flex items-center justify-between pt-4 border-t border-[rgba(80,65,45,0.08)]">
            <span className={`text-sm font-medium ${mutedText}`}>{strings.reader.autoFlipAtBottomLabel}</span>
            <button
              onClick={() => updateAutoFlipAtBottom(!settings.autoFlipAtBottom)}
              data-reader-control
              className="reader-control-press reader-focus-ring inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
              role="switch"
              aria-checked={settings.autoFlipAtBottom}
              aria-label={strings.reader.autoFlipAtBottomLabel}
            >
              <span className={`relative inline-flex h-6 w-11 items-center rounded-full ${
                settings.autoFlipAtBottom ? "bg-[#678055]" : "bg-gray-300 dark:bg-zinc-700"
              }`}>
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                    settings.autoFlipAtBottom ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
