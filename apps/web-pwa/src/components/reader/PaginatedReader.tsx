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
  // 🏮 关键：ref 始终挂载在同一个外层容器上，避免 ResizeObserver 丢失
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

  // 分页计算
  const { pages, totalPages } = useMemo(() => {
    if (containerWidth <= 0 || containerHeight <= 0 || !content) {
      return { pages: [] as PaginationPage[], totalPages: 0 };
    }

    const fullHtml = `<h1 style="font-size:${fontSize * 1.67}px;font-weight:bold;margin-bottom:40px;text-align:center;">${title}</h1>${content}`;
    return paginateContentAdaptive(fullHtml, containerWidth, containerHeight, style);
  }, [content, title, containerWidth, containerHeight, style, fontSize]);

  // 提取段落到页面的映射
  const pageContent = useMemo(() => {
    if (pages.length === 0 || !content) return [];

    const paraRegex = /<p\b[^>]*>.*?<\/p>/gi;
    const allMatches: string[] = [];
    let match;
    while ((match = paraRegex.exec(content)) !== null) {
      allMatches.push(match[0]);
    }

    return pages.map((page) => {
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

  // 🏮 监听外层容器尺寸（ref 始终稳定，不会在渲染间切换）
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;

    const updateSize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) {
        setContainerWidth(w);
        setContainerHeight(h);
        setMeasured(true);
      }
    };

    // 立即测量一次
    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  // 监听滚动事件更新当前页
  const handleScroll = useCallback(() => {
    const container = scrollRef.current;
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

  // 初始化滚动位置
  useEffect(() => {
    if (scrollRef.current && initialPage > 0 && containerWidth > 0) {
      const targetLeft = initialPage * (containerWidth + PAGE_GAP);
      scrollRef.current.scrollLeft = targetLeft;
    }
  }, [initialPage, containerWidth]);

  const pageWidth = containerWidth;

  return (
    <div ref={outerRef} className="flex-1 flex flex-col relative">
      {/* Loading overlay: 用 visibility 而非条件渲染，保持 ref 稳定 */}
      {!measured && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-inherit">
          <p className="text-sm opacity-50">正在计算分页...</p>
        </div>
      )}

      {/* 页面容器：横向滚动 + scroll-snap */}
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

      {/* 页码指示器 */}
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
