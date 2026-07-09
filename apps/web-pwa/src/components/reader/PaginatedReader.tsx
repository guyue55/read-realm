'use client';

import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  paginateContentAdaptive,
  getCurrentPageIndex,
  getNextPageScrollLeft,
  getPrevPageScrollLeft,
  type PaginationPage,
  type PaginationStyle,
  PAGE_GAP,
} from '@reader/reader-core';
import { readerTokens } from '@reader/shared-types';
import { buildReaderHtml, escapeReaderHtmlText } from '@/lib/reader-html';

export interface PaginatedReaderProps {
  title: string;
  content: string;
  isDark: boolean;
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
  paragraphSpacing: number;
  letterSpacing: number;
  onPageChange?: (pageIndex: number, totalPages: number) => void;
  initialPage?: number;
}

/** 暴露给父组件的翻页操作接口 */
export interface PaginatedReaderHandle {
  /** 翻到下一页，返回是否成功 */
  nextPage: () => boolean;
  /** 翻到上一页，返回是否成功 */
  prevPage: () => boolean;
  /** 获取当前滚动的 DOM 容器（给 useReader 的 wheel/touch handler 用） */
  getScrollContainer: () => HTMLDivElement | null;
}

export const PaginatedReader = React.forwardRef<PaginatedReaderHandle, PaginatedReaderProps>(
  function PaginatedReader({
    title,
    content,
    isDark,
    fontSize,
    lineHeight,
    fontFamily,
    paragraphSpacing,
    letterSpacing,
    onPageChange,
    initialPage = 0,
  }, ref) {
    const outerRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(0);
    const [containerHeight, setContainerHeight] = useState(0);
    const [currentPage, setCurrentPage] = useState(initialPage);
    const [measured, setMeasured] = useState(false);

    const paddingTop = 48;
    const paddingBottom = 120;

    const style: PaginationStyle = useMemo(() => ({
      fontSize,
      lineHeight,
      fontFamily: `var(--font-${fontFamily || 'kaiti'})`,
      paragraphSpacing,
      letterSpacing,
      paddingTop,
      paddingBottom,
      maxWidth: readerTokens.layout.desktopContentMaxWidth,
    }), [fontSize, lineHeight, fontFamily, paragraphSpacing, letterSpacing]);

    const safeBody = useMemo(() => buildReaderHtml(content), [content]);
    const safeTitle = useMemo(() => escapeReaderHtmlText(title), [title]);
    const titleHtml = useMemo(
      () => `<h1 style="font-size:${fontSize * 1.67}px;font-weight:bold;margin-bottom:40px;text-align:center;color:inherit;">${safeTitle}</h1>`,
      [fontSize, safeTitle],
    );

    const { pages, totalPages } = useMemo(() => {
      if (containerWidth <= 0 || containerHeight <= 0 || !content) {
        return { pages: [] as PaginationPage[], totalPages: 0 };
      }
      // 🏮 先把 TXT/HTML 段落归一化为带 data-idx 的安全 HTML，避免 TXT 中的 <>& 字符被当作真实标签注入分栏视图。
      const fullHtml = `${titleHtml}${safeBody}`;
      return paginateContentAdaptive(fullHtml, containerWidth, containerHeight, style);
    }, [content, containerWidth, containerHeight, style, titleHtml, safeBody]);

    const pageContent = useMemo(() => {
      if (pages.length === 0 || !content) return [];

      // 与 paginateContentAdaptive 内部 extractParagraphs 保持一致的段落提取逻辑，
      // 支持 raw text（无 <p> 标签）和 HTML 段落两种格式。
      const fullHtml = `${titleHtml}${safeBody}`;
      let allParagraphs: string[] = [];
      const paraRegex = /<p\b[^>]*>(.*?)<\/p>/gi;
      let match;
      while ((match = paraRegex.exec(fullHtml)) !== null) {
        allParagraphs.push(match[0]);
      }
      const isRawText = allParagraphs.length === 0;
      if (isRawText) {
        // raw text: 按换行拆分并包裹 <p> 标签。
        // extractParagraphs 会将 <h1> 标签剥离后标题文本与第一段合并为一行，
        // 因此 allParagraphs[0] 已包含标题。此处保持索引与分页引擎一致。
        const textOnly = fullHtml.replace(/<[^>]*>/g, '');
        const lines = textOnly.split(/\n+/).filter(l => l.trim());
        allParagraphs = lines.map(l => `<p>${l.trim()}</p>`);
      }

      return pages.map((page) => {
        let html = '';
        // HTML 内容：标题通过 <h1> 单独渲染（标题不在 allParagraphs 中）
        // raw text：标题已包含在 allParagraphs[0] 中，不重复渲染 <h1>
        if (page.startParaIndex === 0 && !isRawText) {
          html += titleHtml;
        }
        for (let i = page.startParaIndex; i < page.endParaIndex && i < allParagraphs.length; i++) {
          html += allParagraphs[i];
        }
        return html;
      });
    }, [pages, content, titleHtml, safeBody]);

    // 🏮 暴露翻页操作给父组件
    useImperativeHandle(ref, () => ({
      nextPage: () => {
        const container = scrollRef.current;
        if (!container || containerWidth <= 0 || totalPages <= 1) return false;
        const current = getCurrentPageIndex(container.scrollLeft, containerWidth, totalPages);
        if (current >= totalPages - 1) return false;
        const next = getNextPageScrollLeft(container.scrollLeft, containerWidth, totalPages);
        container.scrollTo({ left: next, behavior: 'smooth' });
        return true;
      },
      prevPage: () => {
        const container = scrollRef.current;
        if (!container || containerWidth <= 0) return false;
        const current = getCurrentPageIndex(container.scrollLeft, containerWidth, Number.MAX_SAFE_INTEGER);
        if (current <= 0) return false;
        const prev = getPrevPageScrollLeft(container.scrollLeft, containerWidth);
        container.scrollTo({ left: prev, behavior: 'smooth' });
        return true;
      },
      getScrollContainer: () => scrollRef.current,
    }), [containerWidth, totalPages]);

    useEffect(() => {
      const el = outerRef.current;
      if (!el) return;

      let timeout: ReturnType<typeof setTimeout> | null = null;

      const updateSize = () => {
        const w = el.clientWidth;
        const h = el.clientHeight;
        if (w > 0 && h > 0) {
          setContainerWidth(w);
          setContainerHeight(h);
          setMeasured(true);
          if (timeout) { clearTimeout(timeout); timeout = null; }
        }
      };

      updateSize();

      // 兜底：如果 ResizeObserver 在 500ms 内未触发有效尺寸，强制再次尝试
      timeout = setTimeout(() => {
        const w = el.clientWidth;
        const h = el.clientHeight;
        if (w > 0 && h > 0) {
          setContainerWidth(w);
          setContainerHeight(h);
          setMeasured(true);
        }
      }, 500);

      const observer = new ResizeObserver(updateSize);
      observer.observe(el);

      return () => {
        observer.disconnect();
        if (timeout) clearTimeout(timeout);
      };
    }, []);

    const handleScroll = useCallback(() => {
      const container = scrollRef.current;
      if (!container || containerWidth <= 0) return;

      const pageIdx = getCurrentPageIndex(container.scrollLeft, containerWidth, totalPages);
      if (pageIdx !== currentPage) {
        setCurrentPage(pageIdx);
        onPageChange?.(pageIdx, totalPages);
      }
    }, [containerWidth, totalPages, currentPage, onPageChange]);

    // 🏮 键盘翻页：检查焦点不在输入元素中才触发
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        // 如果焦点在输入框、文本区域或可编辑元素中，不拦截方向键
        const activeTag = (document.activeElement?.tagName || '').toLowerCase();
        const isEditable =
          activeTag === 'input' ||
          activeTag === 'textarea' ||
          activeTag === 'select' ||
          document.activeElement?.getAttribute('contenteditable') === 'true';

        if (isEditable) return;

        const container = scrollRef.current;
        if (!container || containerWidth <= 0) return;

        if (e.key === 'ArrowRight' || e.key === 'PageDown') {
          e.preventDefault();
          const next = getNextPageScrollLeft(container.scrollLeft, containerWidth, totalPages);
          container.scrollTo({ left: next, behavior: 'smooth' });
        } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
          e.preventDefault();
          const prev = getPrevPageScrollLeft(container.scrollLeft, containerWidth);
          container.scrollTo({ left: prev, behavior: 'smooth' });
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [containerWidth, totalPages]);

    useEffect(() => {
      if (scrollRef.current && initialPage > 0 && containerWidth > 0) {
        const targetLeft = initialPage * (containerWidth + PAGE_GAP);
        scrollRef.current.scrollLeft = targetLeft;
      }
    }, [initialPage, containerWidth]);

    const pageWidth = containerWidth;

    return (
      <div ref={outerRef} className="absolute inset-0 flex flex-col">
        {!measured && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-inherit">
            <p className="text-sm opacity-50">正在计算分页...</p>
          </div>
        )}

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-x-auto overflow-y-hidden"
          style={{
            scrollSnapType: 'x mandatory',
            scrollBehavior: 'smooth',
            WebkitOverflowScrolling: 'touch',
            visibility: measured ? 'visible' : 'hidden',
          }}
        >
          <div className="flex h-full" style={{ gap: `${PAGE_GAP}px` }}>
            {pageContent.map((html, idx) => (
              <div
                key={idx}
                className="flex-shrink-0 h-full overflow-y-auto"
                style={{
                  width: `${pageWidth}px`,
                  scrollSnapAlign: 'start',
                }}
              >
                <div
                  className={`reader-content mx-auto h-full whitespace-pre-wrap break-words ${
                    isDark ? 'theme-dark-filter' : ''
                  }`}
                  style={{
                    maxWidth: `${readerTokens.layout.desktopContentMaxWidth}px`,
                    fontSize: `${fontSize}px`,
                    lineHeight,
                    fontFamily: `var(--font-${fontFamily || 'kaiti'})`,
                    letterSpacing: `${letterSpacing}em`,
                    padding: `${paddingTop}px ${containerWidth > 600 ? 48 : 24}px ${paddingBottom}px`,
                  }}
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              </div>
            ))}
          </div>
        </div>

        {totalPages > 1 && measured && (
          <div
            className={`absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-semibold backdrop-blur-sm ${
              isDark
                ? 'bg-white/10 text-white/70'
                : 'bg-black/5 text-black/50'
            }`}
          >
            {currentPage + 1} / {totalPages}
          </div>
        )}
      </div>
    );
  }
);
