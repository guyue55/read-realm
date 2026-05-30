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

export const ReaderContent = memo(
  function ReaderContent({
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

    const containerSpacingClass =
      buttonVariant === "simple" ? "mt-12" : "mt-16";

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
          <div
            className={`${containerSpacingClass} flex justify-between items-center border-t border-[rgba(80,65,45,0.12)] pt-8 relative z-10`}
          >
            <button
              onClick={onPrev}
              className="px-6 py-3 bg-[rgba(80,65,45,0.04)] rounded-full text-sm hover:bg-[rgba(80,65,45,0.08)] transition-colors text-inherit"
            >
              {strings.reader.prevChapter}
            </button>
            <button onClick={onNext} className={nextButtonClass}>
              {strings.reader.nextChapter}
            </button>
          </div>
        )}
      </div>
    );
  },
  (prevProps, nextProps) => {
    // 1. 比对核心、决定内容本质物理渲染的普通属性
    if (
      prevProps.title !== nextProps.title ||
      prevProps.content !== nextProps.content ||
      prevProps.isDark !== nextProps.isDark ||
      prevProps.isPagination !== nextProps.isPagination ||
      prevProps.buttonVariant !== nextProps.buttonVariant ||
      prevProps.className !== nextProps.className ||
      prevProps.titleClassName !== nextProps.titleClassName
    ) {
      return false; // 有关键显示属性变化，刷新
    }

    // 2. 比对 CSS Style 中的真实排版变量，忽略匿名对象带来的引用变化
    const prevStyle = prevProps.style || {};
    const nextStyle = nextProps.style || {};

    const styleKeys = [
      "fontSize",
      "lineHeight",
      "columnWidth",
      "columnGap",
      "height",
      "--paragraph-spacing",
      "--letter-spacing",
      "--reader-font-family",
    ];

    for (const key of styleKeys) {
      if (
        prevStyle[key as keyof typeof prevStyle] !==
        nextStyle[key as keyof typeof nextStyle]
      ) {
        return false; // 有排版参数物理滑动，刷新
      }
    }

    // 3. 比对 Title Style 的关键变量
    const prevTitleStyle = prevProps.titleStyle || {};
    const nextTitleStyle = nextProps.titleStyle || {};
    if (prevTitleStyle.color !== nextTitleStyle.color) {
      return false; // 标题颜色发生变化（如日夜模式），刷新
    }

    // 4. 其余属性（如匿名的 onPrev/onNext 按钮事件、重新计算但无本质变动的 style 对象等）引用不同，一律跳过 diff 重绘！
    return true; // 掐断无谓重绘，极速直达
  }
);

ReaderContent.displayName = "ReaderContent";

