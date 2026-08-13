import { describe, it, expect } from 'vitest';
import {
  paginateContent,
  getCurrentPageIndex,
  getPageScrollLeft,
  getNextPageScrollLeft,
  getPrevPageScrollLeft,
  findPageIndexForAnchor,
  renderPaginationPage,
  getPaginationSpacerWidth,
  PAGE_GAP,
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

  it('splits one oversized paragraph with contiguous character anchors', () => {
    const visibleText = '长'.repeat(12_000);
    const result = paginateContent(
      `<p data-idx="0">${visibleText}</p>`,
      390,
      720,
      defaultStyle,
    );

    expect(result.totalPages).toBeGreaterThan(1);
    expect(result.pages[0]).toEqual(expect.objectContaining({
      startParaIndex: 0,
      startCharOffset: 0,
    }));
    for (let index = 1; index < result.pages.length; index += 1) {
      expect(result.pages[index]!.startParaIndex).toBe(0);
      expect(result.pages[index]!.startCharOffset).toBe(
        result.pages[index - 1]!.endCharOffset,
      );
    }
    expect(result.pages.at(-1)!.endCharOffset).toBe(visibleText.length);
  });

  it('finds the semantic anchor again after viewport repagination', () => {
    const content = `<p data-idx="0">${'甲'.repeat(8_000)}</p>`;
    const narrow = paginateContent(content, 390, 720, defaultStyle);
    const wide = paginateContent(content, 1024, 900, defaultStyle);
    const anchor = { paragraphIndex: 0, characterOffset: 4_321 };

    const narrowPage = findPageIndexForAnchor(narrow.pages, anchor);
    const widePage = findPageIndexForAnchor(wide.pages, anchor);

    expect(narrowPage).toBeGreaterThanOrEqual(0);
    expect(widePage).toBeGreaterThanOrEqual(0);
    expect(narrow.pages[narrowPage]!.startCharOffset).toBeLessThanOrEqual(anchor.characterOffset);
    expect(narrow.pages[narrowPage]!.endCharOffset).toBeGreaterThan(anchor.characterOffset);
    expect(wide.pages[widePage]!.startCharOffset).toBeLessThanOrEqual(anchor.characterOffset);
    expect(wide.pages[widePage]!.endCharOffset).toBeGreaterThan(anchor.characterOffset);
  });

  it('renders every oversized paragraph character exactly once and escapes fragments', () => {
    const visibleText = `${'文'.repeat(6_000)}<script>alert(1)</script>${'末'.repeat(4_000)}`;
    const content = `<p data-idx="0">${visibleText
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')}</p>`;
    const result = paginateContent(content, 390, 720, defaultStyle);
    const rendered = result.pages.map((page) => renderPaginationPage(content, page)).join('');
    const text = rendered
      .replace(/<[^>]*>/g, '')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&amp;', '&');

    expect(text).toBe(visibleText);
    expect(rendered).not.toContain('<script>');
  });

  it('preserves leading, trailing and entity-decoded characters in sliced paragraphs', () => {
    const visibleText = `  开头${'中'.repeat(10_000)} & < > 结尾  `;
    const encoded = visibleText
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
    const content = `<p data-idx="0">${encoded}</p>`;
    const result = paginateContent(content, 390, 720, defaultStyle);
    const rendered = result.pages.map((page) => renderPaginationPage(content, page)).join('');
    const text = rendered
      .replace(/<[^>]*>/g, '')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&amp;', '&');

    expect(text).toBe(visibleText);
  });

  it('reserves title space on the first page only', () => {
    const content = makeContent(30, 20);
    const withoutTitle = paginateContent(content, 760, 900, defaultStyle);
    const withTitle = paginateContent(content, 760, 900, {
      ...defaultStyle,
      firstPageReservedHeight: 180,
    });

    expect(withTitle.pages[0]!.endParaIndex).toBeLessThanOrEqual(
      withoutTitle.pages[0]!.endParaIndex,
    );
    expect(withTitle.pages[1]!.startParaIndex).toBe(withTitle.pages[0]!.endParaIndex);
  });

  it('uses a smaller first fragment when a title shares an oversized first paragraph page', () => {
    const content = `<p data-idx="0">${'首'.repeat(12_000)}</p>`;
    const result = paginateContent(content, 390, 720, {
      ...defaultStyle,
      firstPageReservedHeight: 180,
    });
    const firstLength = result.pages[0]!.endCharOffset - result.pages[0]!.startCharOffset;
    const secondLength = result.pages[1]!.endCharOffset - result.pages[1]!.startCharOffset;

    expect(firstLength).toBeGreaterThan(0);
    expect(firstLength).toBeLessThan(secondLength);
  });

  it('never splits an emoji surrogate pair across page fragments', () => {
    const visibleText = `开${'🙂'.repeat(6_000)}终`;
    const content = `<p data-idx="0">${visibleText}</p>`;
    const result = paginateContent(content, 390, 720, defaultStyle);
    const rendered = result.pages.map((page) => renderPaginationPage(content, page)).join('');
    const restored = rendered.replace(/<[^>]*>/g, '');

    expect(restored).toBe(visibleText);
    for (const page of result.pages.slice(0, -1)) {
      const previous = visibleText.charCodeAt(page.endCharOffset - 1);
      const next = visibleText.charCodeAt(page.endCharOffset);
      expect(previous >= 0xD800 && previous <= 0xDBFF).toBe(false);
      expect(next >= 0xDC00 && next <= 0xDFFF).toBe(false);
    }
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

describe('getPaginationSpacerWidth', () => {
  it('keeps a virtualized page at its canonical horizontal offset', () => {
    const pageWidth = 390;
    const hiddenPages = 12;
    const spacerWidth = getPaginationSpacerWidth(hiddenPages, pageWidth);

    expect(spacerWidth + PAGE_GAP).toBe(
      hiddenPages * (pageWidth + PAGE_GAP),
    );
  });

  it('does not create negative width for an empty window edge', () => {
    expect(getPaginationSpacerWidth(0, 390)).toBe(0);
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
