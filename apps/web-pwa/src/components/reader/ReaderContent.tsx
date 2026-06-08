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

    const processedContent = React.useMemo(() => {
      const hasHtmlParagraphs = /<p\b|<div\b/i.test(content);
      let idx = 0;
      if (!hasHtmlParagraphs) {
        // Raw plain text with newlines (e.g. from TXT files)
        const lines = content.split(/\r?\n/);
        return lines
          .map((line) => {
            const trimmed = line.trim();
            if (trimmed.length === 0) return "";
            return `<p data-idx="${idx++}">${trimmed}</p>`;
          })
          .filter(Boolean)
          .join("");
      } else {
        // Existing HTML paragraphs (e.g. from EPUB/HTML files)
        // Decorate existing <p> tags with data-idx attribute
        return content.replace(/<p([\s>])/gi, (_, suffix) => {
          return `<p data-idx="${idx++}"${suffix}`;
        });
      }
    }, [content]);

    if (isPagination) {
      const titleClassAttr = titleClassName ? `class="${titleClassName}"` : "";
      let titleStyleStr = "";
      if (titleStyle) {
        titleStyleStr = Object.entries(titleStyle)
          .map(([key, val]) => `${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}:${val}`)
          .join(";");
      }
      const titleStyleAttr = titleStyleStr ? `style="${titleStyleStr}"` : "";
      const titleHtml = title ? `<h1 ${titleClassAttr} ${titleStyleAttr}>${title}</h1>` : "";
      const combinedHtml = `${titleHtml}\n${processedContent}`;

      return (
        <>
          {/* 🏮 强制注入全局宿主大插图与长非折行块的安全防爆排版样式 */}
          <style dangerouslySetInnerHTML={{ __html: `
            .reader-content p, 
            .reader-content div {
              /* 允许段落在分栏间折开断行，彻底打碎浏览器因强制不折行将整块推挤下一列引发的高度坍塌 */
              break-inside: auto !important;
              page-break-inside: auto !important;
            }
            .reader-content img {
              /* 严格控制大插图的视口限额最高比例，既给图片独立占栏留有位置，又绝不撑爆列高度 */
              max-height: 70vh !important;
              object-fit: contain !important;
              display: block !important;
              margin: 16px auto !important;
              break-inside: avoid !important; /* 图片作为一个物理节点不被切半 */
            }
          `}} />
          <div
            className={`${className} reader-content whitespace-pre-wrap break-words ${
              isDark ? "theme-dark-filter" : ""
            }`}
            style={style}
            dangerouslySetInnerHTML={{ __html: combinedHtml }}
          />
        </>
      );
    }

    return (
      <div className={className} style={style}>
        {/* 🏮 强制注入全局宿主大插图与长非折行块的安全防爆排版样式 */}
        <style dangerouslySetInnerHTML={{ __html: `
          .reader-content p, 
          .reader-content div {
            /* 允许段落在分栏间折开断行，彻底打碎浏览器因强制不折行将整块推挤下一列引发的高度坍塌 */
            break-inside: auto !important;
            page-break-inside: auto !important;
          }
          .reader-content img {
            /* 严格控制大插图的视口限额最高比例，既给图片独立占栏留有位置，又绝不撑爆列高度 */
            max-height: 70vh !important;
            object-fit: contain !important;
            display: block !important;
            margin: 16px auto !important;
            break-inside: avoid !important; /* 图片作为一个物理节点不被切半 */
          }
        `}} />
        <h1 className={titleClassName} style={titleStyle}>
          {title}
        </h1>
        <div
          className={`reader-content whitespace-pre-wrap break-words ${
            isDark ? "theme-dark-filter" : ""
          }`}
          dangerouslySetInnerHTML={{ __html: processedContent }}
        />
        {onPrev && onNext && (
          <div
            className={`${containerSpacingClass} flex justify-between items-center border-t border-[rgba(80,65,45,0.12)] pt-8 relative z-10`}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPrev();
              }}
              className="px-6 py-3 bg-[rgba(80,65,45,0.04)] rounded-full text-sm hover:bg-[rgba(80,65,45,0.08)] transition-colors text-inherit"
            >
              {strings.reader.prevChapter}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onNext();
              }}
              className={nextButtonClass}
            >
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

