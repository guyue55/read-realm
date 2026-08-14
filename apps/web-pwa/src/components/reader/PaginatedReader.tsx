'use client';

import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  paginateContentAdaptive,
  getCurrentPageIndex,
  getPageScrollLeft,
  findPageIndexForAnchor,
  getPaginationSpacerWidth,
  renderPaginationPage,
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
  onAnchorChange?: (
    anchor: { paragraphIndex: number; characterOffset: number },
    pageIndex: number,
    totalPages: number,
  ) => void;
  onBoundaryNext?: () => void | Promise<void>;
  onBoundaryPrev?: () => void | Promise<void>;
  initialPage?: number;
  initialAnchor?: {
    paragraphIndex: number;
    characterOffset: number;
  };
  reservedTop?: number;
  reservedBottom?: number;
  pageIndicatorInset?: number;
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
    onAnchorChange,
    onBoundaryNext,
    onBoundaryPrev,
    initialPage = 0,
    initialAnchor,
    reservedTop = 48,
    reservedBottom = 120,
    pageIndicatorInset = 16,
  }, ref) {
    const outerRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(0);
    const [containerHeight, setContainerHeight] = useState(0);
    const [currentPage, setCurrentPage] = useState(initialPage);
    const activeAnchorRef = useRef(initialAnchor ?? null);
    const lastReportedAnchorRef = useRef<string | null>(null);
    const anchorRestoredRef = useRef(false);
    const suppressScrollReportRef = useRef(false);
    const restoreTargetLeftRef = useRef(0);
    const handleScrollRef = useRef<() => void>(() => undefined);
    const [measured, setMeasured] = useState(false);

    const paddingTop = reservedTop;
    const paddingBottom = reservedBottom;

    const style: PaginationStyle = useMemo(() => ({
      fontSize,
      lineHeight,
      fontFamily: `var(--font-${fontFamily || 'kaiti'})`,
      paragraphSpacing,
      letterSpacing,
      paddingTop,
      paddingBottom,
      maxWidth: readerTokens.layout.desktopContentMaxWidth,
      firstPageReservedHeight: fontSize * 1.67 * lineHeight + 40,
    }), [fontSize, lineHeight, fontFamily, paragraphSpacing, letterSpacing, paddingTop, paddingBottom]);

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
      return pages.map((page, index) =>
        `${index === 0 ? titleHtml : ''}${renderPaginationPage(safeBody, page)}`,
      );
    }, [pages, content, titleHtml, safeBody]);

    // 🏮 暴露翻页操作给父组件
    useImperativeHandle(ref, () => ({
      nextPage: () => {
        const container = scrollRef.current;
        if (!container || containerWidth <= 0 || totalPages <= 1) return false;
        const current = currentPage;
        if (current >= totalPages - 1) return false;
        const next = getPageScrollLeft(current + 1, containerWidth);
        container.scrollTo({ left: next, behavior: 'smooth' });
        return true;
      },
      prevPage: () => {
        const container = scrollRef.current;
        if (!container || containerWidth <= 0) return false;
        const current = currentPage;
        if (current <= 0) return false;
        const prev = getPageScrollLeft(current - 1, containerWidth);
        container.scrollTo({ left: prev, behavior: 'smooth' });
        return true;
      },
      getScrollContainer: () => scrollRef.current,
    }), [containerWidth, currentPage, totalPages]);

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
      if (!anchorRestoredRef.current) return;
      if (suppressScrollReportRef.current) {
        if (Math.abs(container.scrollLeft - restoreTargetLeftRef.current) <= 1) return;
        suppressScrollReportRef.current = false;
      }
      const page = pages[pageIdx];
      if (page) {
        const anchor = {
          paragraphIndex: page.startParaIndex,
          characterOffset: page.startCharOffset,
        };
        activeAnchorRef.current = anchor;
        const fingerprint = `${pageIdx}:${anchor.paragraphIndex}:${anchor.characterOffset}:${totalPages}`;
        if (lastReportedAnchorRef.current !== fingerprint) {
          lastReportedAnchorRef.current = fingerprint;
          onAnchorChange?.(anchor, pageIdx, totalPages);
        }
      }
      if (pageIdx !== currentPage) {
        setCurrentPage(pageIdx);
        onPageChange?.(pageIdx, totalPages);
      }
    }, [containerWidth, totalPages, currentPage, onPageChange, onAnchorChange, pages]);
    handleScrollRef.current = handleScroll;

    // 键盘翻页只在正文交互层生效，不穿透到已打开的模态面板后方。
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {

        if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;

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
          const current = currentPage;
          if (current >= totalPages - 1) {
            void onBoundaryNext?.();
            return;
          }
          const next = getPageScrollLeft(current + 1, containerWidth);
          container.scrollTo({ left: next, behavior: 'smooth' });
        } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
          e.preventDefault();
          const current = currentPage;
          if (current <= 0) {
            void onBoundaryPrev?.();
            return;
          }
          const prev = getPageScrollLeft(current - 1, containerWidth);
          container.scrollTo({ left: prev, behavior: 'smooth' });
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [containerWidth, currentPage, totalPages, onBoundaryNext, onBoundaryPrev]);

    useEffect(() => {
      const container = scrollRef.current;
      if (
        !container ||
        containerWidth <= 0 ||
        pages.length === 0 ||
        !initialAnchor
      ) return;
      const anchor = initialAnchor ?? activeAnchorRef.current;
      const targetPage = anchor
        ? findPageIndexForAnchor(pages, anchor)
        : Math.max(0, Math.min(pages.length - 1, initialPage));
      const targetLeft = targetPage * (containerWidth + PAGE_GAP);
      anchorRestoredRef.current = false;
      suppressScrollReportRef.current = true;
      restoreTargetLeftRef.current = targetLeft;
      const previousScrollBehavior = container.style.scrollBehavior;
      // 恢复必须是原子定位；若沿用 smooth，中间帧会被误认为用户回到前一页。
      container.style.scrollBehavior = 'auto';
      container.scrollLeft = targetLeft;
      setCurrentPage(targetPage);
      const page = pages[targetPage];
      if (page) {
        const pageStartAnchor = {
          paragraphIndex: page.startParaIndex,
          characterOffset: page.startCharOffset,
        };
        const preservedAnchor = anchor ?? pageStartAnchor;
        activeAnchorRef.current = preservedAnchor;
        lastReportedAnchorRef.current = `${targetPage}:${pageStartAnchor.paragraphIndex}:${pageStartAnchor.characterOffset}:${totalPages}`;
      }
      anchorRestoredRef.current = true;
      onPageChange?.(targetPage, totalPages);
      const firstFrame = requestAnimationFrame(() => {
        container.style.scrollBehavior = previousScrollBehavior;
        suppressScrollReportRef.current = false;
        const currentLeft = scrollRef.current?.scrollLeft ?? targetLeft;
        if (Math.abs(currentLeft - targetLeft) > 1) {
          handleScrollRef.current();
        }
      });
      return () => {
        cancelAnimationFrame(firstFrame);
        container.style.scrollBehavior = previousScrollBehavior;
      };
    }, [initialAnchor, initialPage, containerWidth, pages, totalPages, onPageChange]);

    const pageWidth = containerWidth;
    const anchorPage = initialAnchor
      ? findPageIndexForAnchor(pages, initialAnchor)
      : -1;
    const windowStart = Math.max(0, currentPage - 1);
    const windowEnd = Math.min(totalPages, currentPage + 2);
    const visiblePages = pageContent.slice(windowStart, windowEnd);

    return (
      <div
        ref={outerRef}
        className="absolute inset-0 flex flex-col"
        data-current-page={currentPage}
        data-anchor-page={anchorPage}
        data-anchor-paragraph={initialAnchor?.paragraphIndex ?? -1}
        data-anchor-character={initialAnchor?.characterOffset ?? -1}
        data-anchor-restored={anchorRestoredRef.current ? "true" : "false"}
      >
        {!measured && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-inherit">
            <p className="text-sm opacity-50">正在计算分页...</p>
          </div>
        )}

        <div
          ref={scrollRef}
          data-pagination-scroll
          tabIndex={-1}
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
            {windowStart > 0 && (
              <div
                aria-hidden="true"
                className="h-full flex-shrink-0"
                style={{ width: `${getPaginationSpacerWidth(windowStart, pageWidth)}px` }}
              />
            )}
            {visiblePages.map((html, offset) => {
              const pageIndex = windowStart + offset;
              const page = pages[pageIndex];
              return (
              <div
                key={pageIndex}
                data-page-index={pageIndex}
                data-start-paragraph={page?.startParaIndex}
                data-start-character={page?.startCharOffset}
                data-end-character={page?.endCharOffset}
                className="flex-shrink-0 h-full overflow-hidden"
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
              );
            })}
            {windowEnd < totalPages && (
              <div
                aria-hidden="true"
                className="h-full flex-shrink-0"
                style={{ width: `${getPaginationSpacerWidth(totalPages - windowEnd, pageWidth)}px` }}
              />
            )}
          </div>
        </div>

        {totalPages > 1 && measured && (
          <div
            data-page-indicator
            className={`absolute left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-semibold backdrop-blur-sm ${
              isDark
                ? 'bg-white/10 text-white/70'
                : 'bg-black/5 text-black/50'
            }`}
            style={{ bottom: `${pageIndicatorInset}px` }}
          >
            {currentPage + 1} / {totalPages}
          </div>
        )}
      </div>
    );
  }
);
