import { describe, it, expect } from 'vitest';
import {
  paginateContent,
  getCurrentPageIndex,
  getPageScrollLeft,
  getNextPageScrollLeft,
  getPrevPageScrollLeft,
  type PaginationStyle,
} from './pagination-engine';

const defaultStyle: PaginationStyle = {
  fontSize: 18,
  lineHeight: 1.7,
  fontFamily: 'serif',
  paragraphSpacing: 16,
  letterSpacing: 0.03,
  paddingTop: 48,
  paddingBottom: 120,
  maxWidth: 760,
};

function makeContent(paragraphCount: number, wordsPerParagraph = 30): string {
  const lines: string[] = [];
  for (let i = 0; i < paragraphCount; i++) {
    const words = Array.from({ length: wordsPerParagraph }, (_, j) => `词语${j}`).join('');
    lines.push(`<p data-idx="${i}">段落${i}：${words}</p>`);
  }
  return lines.join('\n');
}

describe('paginateContent', () => {
  it('returns empty pages for zero dimensions', () => {
    const result = paginateContent('<p>test</p>', 0, 0, defaultStyle);
    expect(result.pages).toHaveLength(0);
    expect(result.totalPages).toBe(0);
  });

  it('returns single page for short content', () => {
    const content = makeContent(3, 10);
    const result = paginateContent(content, 760, 900, defaultStyle);
    expect(result.totalPages).toBe(1);
    expect(result.pages[0]!.startParaIndex).toBe(0);
  });

  it('splits content across multiple pages for long content', () => {
    const content = makeContent(80, 50);
    const result = paginateContent(content, 760, 900, defaultStyle);
    // 80 paragraphs of 50 words each should span multiple pages in 900px height
    expect(result.totalPages).toBeGreaterThan(1);
  });

  it('handles empty content', () => {
    const result = paginateContent('', 760, 900, defaultStyle);
    expect(result.totalPages).toBeGreaterThanOrEqual(0);
  });

  it('each page has valid non-decreasing ranges', () => {
    const content = makeContent(100, 30);
    const result = paginateContent(content, 760, 900, defaultStyle);

    for (const page of result.pages) {
      expect(page.startParaIndex).toBeLessThanOrEqual(page.endParaIndex);
    }

    if (result.pages.length > 0) {
      expect(result.pages[0]!.startParaIndex).toBe(0);
    }

    // Pages should be contiguous
    for (let i = 1; i < result.pages.length; i++) {
      expect(result.pages[i]!.startParaIndex).toBe(result.pages[i - 1]!.endParaIndex);
    }
  });

  it('scales with viewport height', () => {
    const content = makeContent(40, 30);
    const tall = paginateContent(content, 760, 2000, defaultStyle);
    const short = paginateContent(content, 760, 400, defaultStyle);
    // Short viewport should have more pages
    expect(short.totalPages).toBeGreaterThanOrEqual(tall.totalPages);
  });

  it('handles HTML content without <p> tags', () => {
    const content = '第一行文字内容\n第二行文字内容\n第三行文字内容';
    const result = paginateContent(content, 760, 900, defaultStyle);
    expect(result.totalPages).toBeGreaterThanOrEqual(1);
  });

  it('works in non-browser environment (no document)', () => {
    const content = makeContent(10, 20);
    const result = paginateContent(content, 760, 900, defaultStyle);
    expect(result.totalPages).toBeGreaterThanOrEqual(1);
  });
});

describe('getCurrentPageIndex', () => {
  it('returns 0 at scrollLeft 0', () => {
    expect(getCurrentPageIndex(0, 760, 5)).toBe(0);
  });

  it('returns correct page for given scroll position', () => {
    const pageWidth = 760;
    const firstPageEnd = pageWidth + 24; // PAGE_GAP
    expect(getCurrentPageIndex(firstPageEnd, pageWidth, 5)).toBe(1);
  });

  it('clamps to last page', () => {
    expect(getCurrentPageIndex(99999, 760, 3)).toBe(2);
  });
});

describe('getPageScrollLeft', () => {
  it('returns 0 for page 0', () => {
    expect(getPageScrollLeft(0, 760)).toBe(0);
  });

  it('accounts for page gap', () => {
    const pageWidth = 760;
    expect(getPageScrollLeft(1, pageWidth)).toBe(pageWidth + 24);
  });
});

describe('getNextPageScrollLeft', () => {
  it('does not exceed last page', () => {
    const lastPagePos = getPageScrollLeft(2, 760);
    const result = getNextPageScrollLeft(lastPagePos, 760, 3);
    expect(result).toBe(lastPagePos);
  });

  it('advances to next page', () => {
    const result = getNextPageScrollLeft(0, 760, 5);
    expect(result).toBe(760 + 24);
  });
});

describe('getPrevPageScrollLeft', () => {
  it('returns 0 at first page', () => {
    expect(getPrevPageScrollLeft(0, 760)).toBe(0);
  });

  it('goes to previous page', () => {
    const pageWidth = 760;
    const result = getPrevPageScrollLeft(pageWidth + 24, pageWidth);
    expect(result).toBe(0);
  });
});
