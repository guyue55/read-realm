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
  firstPageReservedHeight?: number;
}

export interface PaginationResult {
  pages: PaginationPage[];
  totalPages: number;
}

export const PAGE_GAP = 24;

export function getPaginationSpacerWidth(
  pageCount: number,
  pageWidth: number,
): number {
  const count = Math.max(0, Math.trunc(pageCount));
  const width = Math.max(0, pageWidth);
  return count === 0 ? 0 : count * (width + PAGE_GAP) - PAGE_GAP;
}

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

function decodeTextEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_match, value: string) =>
      String.fromCodePoint(Number.parseInt(value, 10)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_match, value: string) =>
      String.fromCodePoint(Number.parseInt(value, 16)),
    )
    .replaceAll('&nbsp;', '\u00a0')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&');
}

function paragraphText(paragraphHtml: string): string {
  return decodeTextEntities(paragraphHtml.replace(/<[^>]*>/g, ''));
}

function escapeText(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function safeSliceEnd(text: string, start: number, requestedEnd: number): number {
  let end = Math.min(text.length, Math.max(start + 1, requestedEnd));
  if (end < text.length) {
    const previous = text.charCodeAt(end - 1);
    const next = text.charCodeAt(end);
    if (
      previous >= 0xD800 && previous <= 0xDBFF &&
      next >= 0xDC00 && next <= 0xDFFF
    ) {
      end -= 1;
    }
  }
  return Math.max(start + 1, end);
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
  let currentPageHeight = Math.max(0, style.firstPageReservedHeight ?? 0);

  const closeParagraphRange = (endParaIndex: number) => {
    if (endParaIndex <= pageStartIdx) return;
    const lastParagraph = paragraphs[endParaIndex - 1] || '';
    pages.push({
      startParaIndex: pageStartIdx,
      endParaIndex: endParaIndex,
      startCharOffset: 0,
      endCharOffset: paragraphText(lastParagraph).length,
    });
  };

  for (let i = 0; i < paragraphs.length; i++) {
    const paraText = paragraphs[i] || "";
    const plainText = paragraphText(paraText);
    const paraHeight = estimateParagraphHeight(
      paraText,
      style.fontSize,
      style.lineHeight,
      style.paragraphSpacing,
      charsPerLine,
    );

    if (paraHeight > effectiveHeight && plainText.length > 0) {
      const firstSliceReservedHeight = pages.length === 0 && i === 0
        ? currentPageHeight
        : 0;
      closeParagraphRange(i);
      let start = 0;
      let sliceIndex = 0;
      while (start < plainText.length) {
        const availableHeight = Math.max(
          style.fontSize * style.lineHeight,
          effectiveHeight - (sliceIndex === 0 ? firstSliceReservedHeight : 0),
        );
        const linesPerPage = Math.max(
          1,
          Math.floor((availableHeight - style.paragraphSpacing) / (style.fontSize * style.lineHeight)),
        );
        const charsPerPage = Math.max(1, linesPerPage * charsPerLine);
        const end = safeSliceEnd(plainText, start, start + charsPerPage);
        pages.push({
          startParaIndex: i,
          endParaIndex: i + 1,
          startCharOffset: start,
          endCharOffset: end,
        });
        start = end;
        sliceIndex += 1;
      }
      pageStartIdx = i + 1;
      currentPageHeight = 0;
      continue;
    }

    // 如果当前段落的加入会超出页面
    if (currentPageHeight + paraHeight > effectiveHeight && i > pageStartIdx) {
      closeParagraphRange(i);
      pageStartIdx = i;
      currentPageHeight = 0;
    }

    currentPageHeight += paraHeight;
  }

  // 闭合最后一页
  if (pageStartIdx < paragraphs.length) {
    closeParagraphRange(paragraphs.length);
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

export interface PaginationAnchor {
  paragraphIndex: number;
  characterOffset: number;
}

export function findPageIndexForAnchor(
  pages: PaginationPage[],
  anchor: PaginationAnchor,
): number {
  if (pages.length === 0) return 0;
  const paragraphIndex = Math.max(0, Math.trunc(anchor.paragraphIndex));
  const characterOffset = Math.max(0, Math.trunc(anchor.characterOffset));
  const exact = pages.findIndex((page, pageIndex) => {
    if (paragraphIndex < page.startParaIndex || paragraphIndex >= page.endParaIndex) {
      return false;
    }
    if (page.startParaIndex === page.endParaIndex - 1) {
      const isLastPage = pageIndex === pages.length - 1;
      return characterOffset >= page.startCharOffset &&
        (characterOffset < page.endCharOffset || (isLastPage && characterOffset === page.endCharOffset));
    }
    if (paragraphIndex === page.startParaIndex && characterOffset < page.startCharOffset) {
      return false;
    }
    if (paragraphIndex === page.endParaIndex - 1 && characterOffset > page.endCharOffset) {
      return false;
    }
    return true;
  });
  if (exact >= 0) return exact;
  if (paragraphIndex < pages[0]!.startParaIndex) return 0;
  return pages.length - 1;
}

export function renderPaginationPage(
  htmlContent: string,
  page: PaginationPage,
): string {
  const paragraphs = extractParagraphs(htmlContent);
  let html = '';
  for (
    let index = page.startParaIndex;
    index < page.endParaIndex && index < paragraphs.length;
    index += 1
  ) {
    const paragraph = paragraphs[index] || '';
    const text = paragraphText(paragraph);
    const start = index === page.startParaIndex ? page.startCharOffset : 0;
    const end = index === page.endParaIndex - 1
      ? Math.min(text.length, page.endCharOffset)
      : text.length;
    if (start === 0 && end === text.length) {
      html += paragraph;
    } else {
      html += `<p data-idx="${index}" data-char-start="${start}" data-char-end="${end}">${escapeText(text.slice(start, end))}</p>`;
    }
  }
  return html;
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
    return refineWithDOM(
      htmlContent,
      containerWidth,
      containerHeight,
      style,
      estimated,
    );
  }

  return estimated;
}

/**
 * DOM 微调：验证并修正估算的页面边界
 */
function refineWithDOM(
  htmlContent: string,
  containerWidth: number,
  containerHeight: number,
  style: PaginationStyle,
  estimated: PaginationResult,
): PaginationResult {
  try {
    const hasCharacterSlices = estimated.pages.some(
      (page) => page.startCharOffset > 0 ||
        (page.endParaIndex === page.startParaIndex + 1 &&
          page.endCharOffset > 0 &&
          page.endCharOffset < paragraphText(extractParagraphs(htmlContent)[page.startParaIndex] || '').length),
    );
    if (hasCharacterSlices) return estimated;

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

    // 基于真实段落高度重算，但页面容量必须来自阅读视口，而不是整篇离屏文档的自身高度。
    const effectiveHeight = containerHeight - style.paddingTop - style.paddingBottom;
    if (effectiveHeight <= 0) {
      document.body.removeChild(container);
      return estimated;
    }

    const pages: PaginationPage[] = [];
    let pageStart = 0;
    let currentPageHeight = Math.max(0, style.firstPageReservedHeight ?? 0);

    for (let i = 0; i < paragraphs.length; i++) {
      const paraEl = paragraphs[i];
      if (!paraEl) continue;
      const rect = paraEl.getBoundingClientRect();
      const paragraphHeight = rect.height + style.paragraphSpacing;
      if (currentPageHeight + paragraphHeight > effectiveHeight && i > pageStart) {
        const lastParagraph = paragraphs[i - 1];
        pages.push({
          startParaIndex: pageStart,
          endParaIndex: i,
          startCharOffset: 0,
          endCharOffset: lastParagraph?.textContent?.length ?? 0,
        });
        pageStart = i;
        currentPageHeight = 0;
      }
      currentPageHeight += paragraphHeight;
    }

    if (pageStart < paragraphs.length) {
      pages.push({
        startParaIndex: pageStart,
        endParaIndex: paragraphs.length,
        startCharOffset: 0,
        endCharOffset: paragraphs[paragraphs.length - 1]?.textContent?.length ?? 0,
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
