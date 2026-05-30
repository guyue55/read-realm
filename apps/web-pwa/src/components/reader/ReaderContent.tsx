import React, { memo } from "react";
import { strings } from "@/lib/i18n";

export interface ReaderContentProps {
  title: string;
  content: string;
  className?: string;
  style?: React.CSSProperties;
  titleClassName?: string;
  titleStyle?: React.CSSProperties;
  isDark?: boolean;
  isPagination?: boolean;
  buttonVariant?: "default" | "simple";
  onPrev?: () => void;
  onNext?: () => void;
}

export const ReaderContent = memo(function ReaderContent({
  title,
  content,
  className,
  style,
  titleClassName,
  titleStyle,
  isDark = false,
  isPagination = false,
  buttonVariant = "default",
  onPrev,
  onNext,
}: ReaderContentProps) {
  const nextButtonClass =
    buttonVariant === "simple"
      ? "px-6 py-3 border border-[#678055] text-[#678055] font-bold rounded-full text-sm hover:bg-[rgba(103,128,85,0.04)] transition-colors"
      : "px-6 py-3 bg-[#EEF2E9] text-[#678055] font-bold rounded-full text-sm hover:bg-[#DDEBD6] transition-colors";

  const containerSpacingClass = buttonVariant === "simple" ? "mt-12" : "mt-16";

  return (
    <div className={className} style={style}>
      <h1 className={titleClassName} style={titleStyle}>
        {title}
      </h1>
      <div
        className={`reader-content whitespace-pre-wrap break-words [&_p]:break-inside-avoid ${
          isDark ? "theme-dark-filter" : ""
        }`}
        dangerouslySetInnerHTML={{ __html: content }}
      />
      {!isPagination && onPrev && onNext && (
        <div className={`${containerSpacingClass} flex justify-between items-center border-t border-[rgba(80,65,45,0.12)] pt-8 relative z-10`}>
          <button
            onClick={onPrev}
            className="px-6 py-3 bg-[rgba(80,65,45,0.04)] rounded-full text-sm hover:bg-[rgba(80,65,45,0.08)] transition-colors text-inherit"
          >
            {strings.reader.prevChapter}
          </button>
          <button
            onClick={onNext}
            className={nextButtonClass}
          >
            {strings.reader.nextChapter}
          </button>
        </div>
      )}
    </div>
  );
});

ReaderContent.displayName = "ReaderContent";
