'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  /** 初始页码 */
  initialPage?: number;
}

export function PaginatedReader({
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
}: PaginatedReaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [currentPage, setCurrentPage] = useState(initialPage);

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

  // 分页计算
  const { pages, totalPages } = useMemo(() => {
    if (containerWidth <= 0 || containerHeight <= 0 || !content) {
      return { pages: [] as PaginationPage[], totalPages: 0 };
    }

    // 构建完整 HTML（含标题）
    const fullHtml = `<h1 style="font-size:${fontSize * 1.67}px;font-weight:bold;margin-bottom:40px;text-align:center;">${title}</h1>${content}`;

    return paginateContentAdaptive(fullHtml, containerWidth, containerHeight, style);
  }, [content, title, containerWidth, containerHeight, style, fontSize]);

  // 提取段落到页面的映射
  const pageContent = useMemo(() => {
    if (pages.length === 0 || !content) return [];

    // 从原始内容提取段落
    const paraRegex = /<p\b[^>]*>.*?<\/p>/gi;
    const allMatches: string[] = [];
    let match;
    while ((match = paraRegex.exec(content)) !== null) {
      allMatches.push(match[0]);
    }

    return pages.map((page) => {
      // 包含标题
      let html = '';
      if (page.startParaIndex === 0) {
        html += `<h1 style="font-size:${fontSize * 1.67}px;font-weight:bold;margin-bottom:40px;text-align:center;color:inherit;">${title}</h1>`;
      }
      for (let i = page.startParaIndex; i < page.endParaIndex && i < allMatches.length; i++) {
        html += allMatches[i];
      }
      return html;
    });
  }, [pages, content, title, fontSize]);

  // 监听容器尺寸
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      setContainerWidth(container.clientWidth);
      setContainerHeight(container.clientHeight);
    };

    updateSize();

    const observer = new ResizeObserver(() => {
      updateSize();
    });
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  // 监听滚动事件更新当前页
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container || containerWidth <= 0) return;

    const pageIdx = getCurrentPageIndex(container.scrollLeft, containerWidth, totalPages);
    if (pageIdx !== currentPage) {
      setCurrentPage(pageIdx);
      onPageChange?.(pageIdx, totalPages);
    }
  }, [containerWidth, totalPages, currentPage, onPageChange]);

  // 键盘翻页
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const container = containerRef.current;
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

  // 初始化滚动位置
  useEffect(() => {
    if (containerRef.current && initialPage > 0 && containerWidth > 0) {
      const targetLeft = initialPage * (containerWidth + PAGE_GAP);
      containerRef.current.scrollLeft = targetLeft;
    }
  }, [initialPage, containerWidth]);

  if (totalPages === 0) {
    return (
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center"
      >
        <p className="text-sm opacity-50">正在计算分页...</p>
      </div>
    );
  }

  const pageWidth = containerWidth;

  return (
    <div className="flex-1 flex flex-col relative">
      {/* 页面容器：横向滚动 + scroll-snap */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-x-auto overflow-y-hidden"
        style={{
          scrollSnapType: 'x mandatory',
          scrollBehavior: 'smooth',
          WebkitOverflowScrolling: 'touch',
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

      {/* 页码指示器 */}
      {totalPages > 1 && (
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
