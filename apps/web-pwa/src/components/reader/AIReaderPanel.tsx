import React from "react";
import { strings } from "@/lib/i18n";

export interface AIReaderPanelProps {
  isAiLoading: boolean;
  aiSummary: string;
  isMobileDrawer?: boolean;
  isDark?: boolean;
  onClose?: () => void;
}

export function AIReaderPanel({
  isAiLoading,
  aiSummary,
  isMobileDrawer = false,
  isDark = false,
  onClose,
}: AIReaderPanelProps) {
  const containerClasses = isMobileDrawer
    ? "h-full flex flex-col"
    : "h-full flex flex-col bg-transparent text-inherit";

  const bubbleBg = isDark ? "bg-[rgba(0,0,0,0.2)]" : "bg-white";

  return (
    <div className={containerClasses}>
      <div className="p-4 border-b border-[rgba(80,65,45,0.12)] flex items-center justify-between bg-[rgba(80,65,45,0.04)]">
        <h2 className="font-bold text-[#9A6A3A] flex items-center">
          <span className="mr-2">✨</span> {strings.reader.aiAssistant}
        </h2>
        {isMobileDrawer && onClose && (
          <button
            onClick={onClose}
            className="text-[#6F665B] p-1 hover:text-inherit"
          >
            ✕
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-6">
          <h3 className="text-xs font-bold text-[#6F665B] uppercase tracking-wider mb-4">
            {strings.reader.summaryTitle}
          </h3>
          {isAiLoading ? (
            <div className="flex flex-col items-center py-12">
              <div className="w-8 h-8 border-4 border-[#E8E3DA] border-t-[#9A6A3A] rounded-full animate-spin mb-4"></div>
              <p className="text-sm text-[#6F665B]">
                {strings.reader.summarizing}
              </p>
            </div>
          ) : (
            <div className="text-sm">
              {aiSummary ? (
                <div
                  className={`${bubbleBg} border border-[rgba(80,65,45,0.12)] p-4 rounded-[16px] text-inherit leading-relaxed whitespace-pre-wrap shadow-sm`}
                >
                  {aiSummary}
                </div>
              ) : (
                <p className="text-center py-8 text-[#6F665B] italic">
                  {strings.reader.aiPrompt}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="mt-8 border-t border-[rgba(80,65,45,0.12)] pt-6">
          <h3 className="text-xs font-bold text-[#6F665B] uppercase tracking-wider mb-4">
            {strings.reader.quickQuestions}
          </h3>
          <div className="grid grid-cols-1 gap-2">
            <button
              className={`text-left p-3 text-sm ${bubbleBg} border border-[rgba(80,65,45,0.12)] hover:border-[#9A6A3A] rounded-lg text-inherit transition-colors shadow-sm`}
            >
              {strings.reader.questionCharacters}
            </button>
            <button
              className={`text-left p-3 text-sm ${bubbleBg} border border-[rgba(80,65,45,0.12)] hover:border-[#9A6A3A] rounded-lg text-inherit transition-colors shadow-sm`}
            >
              {strings.reader.questionPlots}
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-[rgba(80,65,45,0.12)] bg-transparent">
        <div
          className={`flex items-center ${bubbleBg} border border-[rgba(80,65,45,0.12)] rounded-full px-4 py-2 shadow-sm focus-within:border-[#9A6A3A] transition-colors`}
        >
          <input
            type="text"
            placeholder={strings.reader.aiInputPlaceholder}
            className="flex-1 bg-transparent border-none outline-none text-sm py-1 text-inherit"
          />
          <button className="ml-2 text-[#9A6A3A] font-bold text-sm">
            {strings.reader.send}
          </button>
        </div>
      </div>
    </div>
  );
}
