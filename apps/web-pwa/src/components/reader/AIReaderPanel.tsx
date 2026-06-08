import React from "react";
import { strings } from "@/lib/i18n";

export interface AIReaderPanelProps {
  isAiLoading: boolean;
  aiSummary: string;
  isMobileDrawer?: boolean;
  isDark?: boolean;
  onClose?: () => void;
  aiInput?: string; // 🏮 [NEW] AI 输入框受控绑定内容
  setAiInput?: (val: string) => void; // 🏮 [NEW] 更新 AI 输入框的回调
}

export function AIReaderPanel({
  isAiLoading,
  aiSummary,
  isMobileDrawer = false,
  isDark = false,
  onClose,
  aiInput,
  setAiInput,
}: AIReaderPanelProps) {
  const [touchStart, setTouchStart] = React.useState<number | null>(null);

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

      {/* 底部聊天框容器：若是移动端则加上 pb-24 以避开大拇指悬浮胶囊 */}
      <div className={`p-4 border-t border-[rgba(80,65,45,0.12)] bg-transparent ${isMobileDrawer ? "pb-24" : "pb-[calc(1rem+env(safe-area-inset-bottom))]"}`}>
        <div
          className={`flex items-center ${bubbleBg} border border-[rgba(80,65,45,0.12)] rounded-full px-4 py-2 shadow-sm focus-within:border-[#9A6A3A] transition-colors`}
        >
          <input
            type="text"
            value={aiInput || ""}
            onChange={(e) => setAiInput?.(e.target.value)}
            placeholder={strings.reader.aiInputPlaceholder}
            className="flex-1 bg-transparent border-none outline-none text-sm py-1 text-inherit"
          />
          <button className="ml-2 text-[#9A6A3A] font-bold text-sm">
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
  const prevLoadingRef = React.useRef(false);
  const textContainerRef = React.useRef<HTMLSpanElement | null>(null);

  React.useEffect(() => {
    const wasLoading = prevLoadingRef.current;
    prevLoadingRef.current = isAiLoading;

    if (isAiLoading) {
      setIsTyping(false);
      if (textContainerRef.current) {
        textContainerRef.current.textContent = "";
      }
      return;
    }

    if (!text) {
      setIsTyping(false);
      if (textContainerRef.current) {
        textContainerRef.current.textContent = "";
      }
      return;
    }

    // 智能识别：若是刚刚结束 Loading，说明是初次 LLM 生成，启动 20ms 紧凑逐字打字打印
    if (wasLoading) {
      setIsTyping(true);
      let currentIndex = 0;
      if (textContainerRef.current) {
        textContainerRef.current.textContent = "";
      }

      const interval = setInterval(() => {
        if (currentIndex < text.length) {
          const nextChar = text.charAt(currentIndex);
          currentIndex++;
          if (textContainerRef.current) {
            textContainerRef.current.textContent += nextChar;
          }
        } else {
          clearInterval(interval);
          setIsTyping(false);
        }
      }, 20);

      return () => clearInterval(interval);
    } else {
      // 缓存瞬间直出，跳过打字动效，100% 纯净高亮
      setIsTyping(false);
      if (textContainerRef.current) {
        textContainerRef.current.textContent = text;
      }
    }
  }, [text, isAiLoading]);

  return (
    <div
      className={`${bubbleBg} border border-[rgba(80,65,45,0.12)] p-4 rounded-[16px] text-inherit leading-relaxed whitespace-pre-wrap shadow-sm transition-all duration-300 animate-ai-fade-in`}
    >
      {/* 采用空子树 JSX 结构：React Diff 协调时，由于其在虚拟 DOM 中无子级，
          即使父级/暗黑模式高频重绘，React 也绝不会覆写和擦除原生 textContent，彻底消除打字中途文字斩断闪烁 */}
      <span ref={textContainerRef} />
      {isTyping && (
        <span className="inline-block ml-1 w-1.5 h-3.5 bg-[#9A6A3A] animate-pulse align-middle" />
      )}
    </div>
  );
}

