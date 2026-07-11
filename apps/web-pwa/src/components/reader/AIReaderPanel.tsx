import React from "react";
import { strings } from "@/lib/i18n";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export interface AIReaderPanelProps {
  isAiLoading: boolean;
  aiSummary: string;
  isMobileDrawer?: boolean;
  isDark?: boolean;
  onClose?: () => void;
  aiInput?: string;
  setAiInput?: (val: string) => void;
  onClearSession?: () => void | Promise<void>;
  /** AI 问答回调：用户输入问题后触发 */
  onAsk?: (question: string) => void;
}

export function AIReaderPanel({
  isAiLoading,
  aiSummary,
  isMobileDrawer = false,
  isDark = false,
  onClose,
  aiInput,
  setAiInput,
  onClearSession,
  onAsk,
}: AIReaderPanelProps) {
  const [touchStart, setTouchStart] = React.useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isMobileDrawer) return;
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isMobileDrawer || touchStart === null) return;
    const currentX = e.targetTouches[0].clientX;
    const diffX = currentX - touchStart;
    // Slide right to hide AI panel
    if (diffX > 40) {
      onClose?.();
      setTouchStart(null);
    }
  };

  const containerClasses = isMobileDrawer
    ? "h-full flex flex-col relative select-none"
    : "h-full flex flex-col bg-transparent text-inherit relative";

  const bubbleBg = isDark ? "bg-[rgba(0,0,0,0.2)]" : "bg-white";

  return (
    <div
      className={containerClasses}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
    >

      <div className="p-4 border-b border-[rgba(80,65,45,0.12)] flex items-center justify-between bg-[rgba(80,65,45,0.04)] pt-[calc(1rem+env(safe-area-inset-top))]">
        <h2 className="font-bold text-[#9A6A3A] flex items-center">
          <span className="mr-2">✨</span> {strings.reader.aiAssistant}
        </h2>
        <div className="flex items-center gap-2">
          {onClearSession && aiSummary && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setConfirmOpen(true);
              }}
              title="拂尘扫尘"
              className="text-[#6F665B] hover:text-[#9A6A3A] transition-all flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-[rgba(80,65,45,0.12)] hover:border-[#9A6A3A] hover:rotate-6 active:scale-95 bg-[rgba(80,65,45,0.02)]"
            >
              <span className="text-sm">🧹</span>
              <span className="hidden sm:inline">拂尘</span>
            </button>
          )}
          {isMobileDrawer && onClose && (
            <button
              onClick={onClose}
              className="text-[#6F665B] p-1 hover:text-inherit"
            >
              ✕
            </button>
          )}
        </div>
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
                <SummaryContent
                  text={aiSummary}
                  isAiLoading={isAiLoading}
                  bubbleBg={bubbleBg}
                />
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
              onClick={() => onAsk?.(strings.reader.questionCharacters)}
              className={`text-left p-3 text-sm ${bubbleBg} border border-[rgba(80,65,45,0.12)] hover:border-[#9A6A3A] rounded-lg text-inherit transition-colors shadow-sm`}
            >
              {strings.reader.questionCharacters}
            </button>
            <button
              onClick={() => onAsk?.(strings.reader.questionPlots)}
              className={`text-left p-3 text-sm ${bubbleBg} border border-[rgba(80,65,45,0.12)] hover:border-[#9A6A3A] rounded-lg text-inherit transition-colors shadow-sm`}
            >
              {strings.reader.questionPlots}
            </button>
          </div>
        </div>
      </div>

      {/* 底部聊天框容器：若是移动端则加上 pb-24 以避开大拇指悬浮胶囊 */}
      <div className={`p-4 border-t border-[rgba(80,65,45,0.12)] bg-transparent ${isMobileDrawer ? "pb-24" : "pb-[calc(1rem+env(safe-area-inset-bottom))]"}`}>
        <div
          className={`flex items-center ${bubbleBg} border border-[rgba(80,65,45,0.12)] rounded-full px-4 py-2 shadow-sm focus-within:border-[#9A6A3A] transition-colors`}
        >
          <input
            type="text"
            value={aiInput || ""}
            onChange={(e) => setAiInput?.(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && aiInput?.trim()) {
                onAsk?.(aiInput.trim());
                setAiInput?.("");
              }
            }}
            placeholder={strings.reader.aiInputPlaceholder}
            className="flex-1 bg-transparent border-none outline-none text-sm py-1 text-inherit"
          />
          <button
            onClick={() => {
              if (aiInput?.trim()) {
                onAsk?.(aiInput.trim());
                setAiInput?.("");
              }
            }}
            className="ml-2 text-[#9A6A3A] font-bold text-sm hover:opacity-80 active:scale-95 transition-all"
          >
            {strings.reader.send}
          </button>
        </div>
      </div>

      {/* 大拇指黄金触控悬浮一键收纳胶囊 */}
      {isMobileDrawer && onClose && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-full text-xs font-bold backdrop-blur-md transition-all active:scale-95 border border-[rgba(80,65,45,0.15)] bg-[rgba(255,252,245,0.92)] text-[#2F2A24] dark:border-[rgba(255,255,255,0.12)] dark:bg-[rgba(45,45,45,0.92)] dark:text-[#CFCFCF] shadow-[0_8px_24px_rgba(0,0,0,0.16)] hover:opacity-100"
          >
            ✕ 收起助手
          </button>
        </div>
      )}

      {/* 🧹 国风朱砂红拂尘确认弹窗 */}
      <ConfirmDialog
        isOpen={confirmOpen}
        title="拂尘扫尘"
        message="书案落尘，是否拂去本章 AI 伴读会话？&#10;此去不可撤销，下一次研读该章将重新问询伴读。"
        confirmText="扫除"
        cancelText="作罢"
        isDanger={true}
        onConfirm={async () => {
          setConfirmOpen(false);
          if (onClearSession) {
            await onClearSession();
          }
        }}
        onCancel={() => setConfirmOpen(false)}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  );
}

interface SummaryContentProps {
  text: string;
  isAiLoading: boolean;
  bubbleBg: string;
}

function SummaryContent({ text, isAiLoading, bubbleBg }: SummaryContentProps) {
  const [isTyping, setIsTyping] = React.useState(false);
  const [displayedText, setDisplayedText] = React.useState("");

  React.useEffect(() => {
    if (isAiLoading) {
      setIsTyping(false);
      setDisplayedText("");
      return;
    }

    if (!text) {
      setIsTyping(false);
      setDisplayedText("");
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setIsTyping(false);
      setDisplayedText(text);
      return;
    }

    setIsTyping(true);
    setDisplayedText("");
    let currentIndex = 0;
    const interval = window.setInterval(() => {
      currentIndex = Math.min(text.length, currentIndex + 4);
      setDisplayedText(text.slice(0, currentIndex));
      if (currentIndex >= text.length) {
        window.clearInterval(interval);
        setIsTyping(false);
      }
    }, 20);

    return () => window.clearInterval(interval);
  }, [text, isAiLoading]);

  return (
    <div
      className={`${bubbleBg} border border-[rgba(80,65,45,0.12)] p-4 rounded-[16px] text-inherit leading-relaxed whitespace-pre-wrap shadow-sm transition-all duration-300 animate-ai-fade-in`}
    >
      <span>{displayedText}</span>
      {isTyping && (
        <span className="inline-block ml-1 w-1.5 h-3.5 bg-[#9A6A3A] animate-pulse align-middle" />
      )}
    </div>
  );
}
