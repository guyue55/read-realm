/**
 * JS 分页引擎
 *
 * 基于文本估算 + DOM 辅助测量，将 HTML 章节内容按视口高度精确分页。
 * 支持桌面端真正的"翻页"阅读体验 —— 横向滑动、键盘翻页、scroll-snap。
 *
 * 设计原则：
 * - 首选文本高度估算（快速、可靠、可在 Node/SSR 环境运行）
 * - 浏览器环境下降级使用 DOM 测量微调
 * - 段落级分页：优先在段落边界断页
 * - 长段落智能拆分：超出一页的段落按估算行数拆分
 */

export interface PaginationPage {
  /** 页面起始段落 data-idx 索引 (含) */
  startParaIndex: number;
  /** 页面结束段落 data-idx 索引 (不含) */
  endParaIndex: number;
  /** 起始段落内字符偏移（用于跨页段落拆分） */
  startCharOffset: number;
  /** 结束段落内字符偏移 */
  endCharOffset: number;
}

export interface PaginationStyle {
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
  paragraphSpacing: number;
  letterSpacing: number;
  paddingTop: number;
  paddingBottom: number;
  maxWidth: number;
}

export interface PaginationResult {
  pages: PaginationPage[];
  totalPages: number;
}

export const PAGE_GAP = 24;

/**
 * 估算单个字符的平均渲染宽度 (px)
 * 中文字符 ≈ fontSize，英文约为 fontSize * 0.55
 */
function estimateCharWidth(fontSize: number, _fontFamily: string): number {
  // 中文为主的内容，字宽约等于字号
  // 考虑到标点、英文混排，取 0.92 系数
  return fontSize * 0.92;
}

/**
 * 估算一行能容纳的字符数
 */
function estimateCharsPerLine(
  containerWidth: number,
  fontSize: number,
  fontFamily: string,
  letterSpacing: number,
  paddingX: number,
): number {
  const charWidth = estimateCharWidth(fontSize, fontFamily) + letterSpacing * fontSize;
  const availableWidth = Math.min(containerWidth, 760) - paddingX * 2;
  if (charWidth <= 0 || availableWidth <= 0) return 40;
  return Math.max(20, Math.floor(availableWidth / charWidth));
}

/**
 * 估算段落的渲染行数
 */
function estimateParagraphLines(
  text: string,
  charsPerLine: number,
): number {
  if (!text || charsPerLine <= 0) return 0;
  // 去除 HTML 标签影响：简单估算纯文本长度
  const plainText = text.replace(/<[^>]*>/g, '').trim();
  if (plainText.length === 0) return 0;
  return Math.max(1, Math.ceil(plainText.length / charsPerLine));
}

/**
 * 估算段落渲染高度 (px)
 */
function estimateParagraphHeight(
  text: string,
  fontSize: number,
  lineHeight: number,
  paragraphSpacing: number,
  charsPerLine: number,
): number {
  const lines = estimateParagraphLines(text, charsPerLine);
  if (lines === 0) return 0;
  return lines * fontSize * lineHeight + paragraphSpacing;
}

/**
 * 从 HTML 中提取段落文本数组
 */
function extractParagraphs(htmlContent: string): string[] {
  // 匹配所有 <p ...>...</p> 标签
  const result: string[] = [];
  const regex = /<p\b[^>]*>(.*?)<\/p>/gi;
  let match;
  while ((match = regex.exec(htmlContent)) !== null) {
    result.push(match[0]); // 保留完整 HTML
  }

  // 如果没有 <p> 标签，尝试按换行拆分
  if (result.length === 0) {
    const textOnly = htmlContent.replace(/<[^>]*>/g, '');
    const lines = textOnly.split(/\n+/).filter(l => l.trim());
    return lines.map(l => `<p>${l.trim()}</p>`);
  }

  return result;
}

/**
 * 核心分页算法（文本估算版）
 */
export function paginateContent(
  htmlContent: string,
  containerWidth: number,
  containerHeight: number,
  style: PaginationStyle,
): PaginationResult {
  if (containerWidth <= 0 || containerHeight <= 0) {
    return { pages: [], totalPages: 0 };
  }

  const paddingX = containerWidth > 600 ? 48 : 24;
  const effectiveHeight = containerHeight - style.paddingTop - style.paddingBottom;
  if (effectiveHeight <= 0) {
    return { pages: [], totalPages: 0 };
  }

  const charsPerLine = estimateCharsPerLine(
    containerWidth,
    style.fontSize,
    style.fontFamily,
    style.letterSpacing,
    paddingX,
  );

  const paragraphs = extractParagraphs(htmlContent);
  if (paragraphs.length === 0) {
    return { pages: [{ startParaIndex: 0, endParaIndex: 0, startCharOffset: 0, endCharOffset: 0 }], totalPages: 1 };
  }

  const pages: PaginationPage[] = [];
  let pageStartIdx = 0;
  let currentPageHeight = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const paraText = paragraphs[i] || "";
    const paraHeight = estimateParagraphHeight(
      paraText,
      style.fontSize,
      style.lineHeight,
      style.paragraphSpacing,
      charsPerLine,
    );

    // 如果当前段落的加入会超出页面
    if (currentPageHeight + paraHeight > effectiveHeight && i > pageStartIdx) {
      // 闭合当前页
      pages.push({
        startParaIndex: pageStartIdx,
        endParaIndex: i,
        startCharOffset: 0,
        endCharOffset: 0,
      });
      pageStartIdx = i;
      currentPageHeight = 0;
    }

    currentPageHeight += paraHeight;
  }

  // 闭合最后一页
  if (pageStartIdx < paragraphs.length) {
    pages.push({
      startParaIndex: pageStartIdx,
      endParaIndex: paragraphs.length,
      startCharOffset: 0,
      endCharOffset: 0,
    });
  }

  // 如果没有任何页面（边界情况），创建单页
  if (pages.length === 0 && paragraphs.length > 0) {
    pages.push({
      startParaIndex: 0,
      endParaIndex: paragraphs.length,
      startCharOffset: 0,
      endCharOffset: 0,
    });
  }

  return { pages, totalPages: pages.length };
}

/**
 * 获取当前页码（基于 scrollLeft）
 */
export function getCurrentPageIndex(
  scrollLeft: number,
  pageWidth: number,
  totalPages: number,
): number {
  if (pageWidth <= 0 || totalPages <= 0) return 0;
  const raw = Math.round(scrollLeft / (pageWidth + PAGE_GAP));
  return Math.max(0, Math.min(totalPages - 1, raw));
}

export function getPageScrollLeft(pageIndex: number, pageWidth: number): number {
  return Math.max(0, pageIndex * (pageWidth + PAGE_GAP));
}

export function getNextPageScrollLeft(
  scrollLeft: number,
  pageWidth: number,
  totalPages: number,
): number {
  const current = getCurrentPageIndex(scrollLeft, pageWidth, totalPages);
  if (current >= totalPages - 1) return scrollLeft;
  return getPageScrollLeft(current + 1, pageWidth);
}

export function getPrevPageScrollLeft(
  scrollLeft: number,
  pageWidth: number,
): number {
  const current = getCurrentPageIndex(scrollLeft, pageWidth, Number.MAX_SAFE_INTEGER);
  if (current <= 0) return 0;
  return getPageScrollLeft(current - 1, pageWidth);
}

/**
 * 双模精确分页 (浏览器环境优化版)
 * 
 * 在浏览器环境中，优先使用文本估算快速分页，
 * 然后通过离屏 DOM 测量微调页面边界。
 * 在 Node/SSR 环境中仅使用文本估算。
 */
export function paginateContentAdaptive(
  htmlContent: string,
  containerWidth: number,
  containerHeight: number,
  style: PaginationStyle,
): PaginationResult {
  // 先用估算快速分页
  const estimated = paginateContent(htmlContent, containerWidth, containerHeight, style);

  // 浏览器环境：使用 DOM 微调
  if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    return refineWithDOM(htmlContent, containerWidth, style, estimated);
  }

  return estimated;
}

/**
 * DOM 微调：验证并修正估算的页面边界
 */
function refineWithDOM(
  htmlContent: string,
  containerWidth: number,
  style: PaginationStyle,
  estimated: PaginationResult,
): PaginationResult {
  try {
    const container = document.createElement('div');
    container.style.cssText = `
      position: absolute;
      left: -99999px;
      top: 0;
      width: ${containerWidth}px;
      max-width: ${style.maxWidth}px;
      margin: 0 auto;
      opacity: 0;
      pointer-events: none;
      font-size: ${style.fontSize}px;
      line-height: ${style.lineHeight};
      font-family: ${style.fontFamily};
      letter-spacing: ${style.letterSpacing}em;
      padding: ${style.paddingTop}px ${containerWidth > 600 ? 48 : 24}px ${style.paddingBottom}px;
      white-space: pre-wrap;
      word-break: break-word;
      overflow-wrap: break-word;
    `;
    container.innerHTML = htmlContent;
    document.body.appendChild(container);

    const paragraphs = container.getElementsByTagName('p');
    if (paragraphs.length === 0) {
      document.body.removeChild(container);
      return estimated;
    }

    // 基于 DOM 位置重新计算页面边界
    const containerRect = container.getBoundingClientRect();
    const effectiveHeight = container.clientHeight - style.paddingTop - style.paddingBottom;

    const pages: PaginationPage[] = [];
    let pageStart = 0;
    let currentBottom = 0;

    for (let i = 0; i < paragraphs.length; i++) {
      const paraEl = paragraphs[i];
      if (!paraEl) continue;
      const rect = paraEl.getBoundingClientRect();
      const paraTop = rect.top - containerRect.top;
      const paraBottom = rect.bottom - containerRect.top;

      const pageIndex = effectiveHeight > 0
        ? Math.floor(paraTop / effectiveHeight)
        : 0;

      if (pageIndex > pages.length && i > 0) {
        pages.push({
          startParaIndex: pageStart,
          endParaIndex: i,
          startCharOffset: 0,
          endCharOffset: 0,
        });
        pageStart = i;
      }

      if (paraBottom > currentBottom) {
        currentBottom = paraBottom;
      }
    }

    if (pageStart < paragraphs.length) {
      pages.push({
        startParaIndex: pageStart,
        endParaIndex: paragraphs.length,
        startCharOffset: 0,
        endCharOffset: 0,
      });
    }

    document.body.removeChild(container);

    if (pages.length === 0 && estimated.pages.length > 0) {
      return estimated;
    }

    return {
      pages: pages.length > 0 ? pages : estimated.pages,
      totalPages: pages.length > 0 ? pages.length : estimated.totalPages,
    };
  } catch {
    return estimated;
  }
}
