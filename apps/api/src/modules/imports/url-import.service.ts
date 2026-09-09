import { BadRequestException, Injectable } from '@nestjs/common';
import { parseWebPageWithReadability } from '@reader/parser-core/html';
import {
  assertPublicUrl,
  fetchPublicHtml,
  normalizeWhitespace,
  stripHtml,
  toAbsoluteUrl,
} from './public-url.guard';

export interface ParsedChapter {
  index: number;
  title: string;
  content: string;
}

export interface ParsedBook {
  title: string;
  chapters: ParsedChapter[];
}

const MAX_CHAPTERS = 80;
const MAX_PAGES_PER_CHAPTER = 8;

const chapterTitlePattern =
  /^\s*(第\s*[零一二三四五六七八九十百千万0-9]+\s*[章回节卷]|chapter\s+\d+|番外|序章|楔子|终章)/i;
const nextPagePattern =
  /^(下一页|下页|下一頁|下頁|继续阅读|本章未完|>|›|»)\s*$/i;
const nextChapterPattern = /(下一章|下章|下一回|下一节|下一卷|next chapter)/i;

function getTagText(html: string, tag: string) {
  const match = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(
    html,
  );
  return match ? stripHtml(match[1]) : '';
}

function getTitle(html: string, url: string) {
  const h1 = getTagText(html, 'h1');
  const title = h1 || getTagText(html, 'title') || new URL(url).hostname;
  return title.replace(/[_|-].*$/, '').trim() || new URL(url).hostname;
}

function getReadableText(html: string, url?: string) {
  const candidates: string[] = [];
  const selectorPatterns = [
    /<article\b[^>]*>([\s\S]*?)<\/article>/gi,
    /<main\b[^>]*>([\s\S]*?)<\/main>/gi,
    /<[^>]+id=["'](?:content|chaptercontent)["'][^>]*>([\s\S]*?)<\/(?:div|section|article|main)>/gi,
    /<[^>]+class=["'][^"']*(?:content|chapter-content|read-content|novel-content|entry-content)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section|article|main)>/gi,
  ];

  for (const pattern of selectorPatterns) {
    for (const match of html.matchAll(pattern)) {
      candidates.push(stripHtml(match[1]));
    }
  }

  const usableCandidates = candidates.filter(
    (candidate) => candidate.length >= 40,
  );
  if (usableCandidates.length > 0) {
    return usableCandidates.sort((a, b) => b.length - a.length)[0] || '';
  }

  // 降级兜底链路：利用 @reader/parser-core 里的 Readability 算法精准提取通用博客和网页正文
  try {
    const readable = parseWebPageWithReadability(html, url);
    if (readable.textContent.length >= 40) {
      return readable.textContent;
    }
  } catch {
    // 捕获异常，防止对特定未知页面崩溃，静默降级到 stripHtml
  }

  return stripHtml(html);
}

function extractLinks(html: string, baseUrl: string) {
  const links: { title: string; url: string }[] = [];
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    const url = toAbsoluteUrl(match[1], baseUrl);
    if (!url) continue;
    links.push({ title: stripHtml(match[2]), url });
  }
  return links;
}

@Injectable()
export class UrlImportService {
  async parse(rawUrl: string): Promise<ParsedBook> {
    const url = await assertPublicUrl(rawUrl);
    const { html } = await fetchPublicHtml(url);
    const title = getTitle(html, url);
    const chapterLinks = this.getChapterLinks(html, url);

    if (chapterLinks.length >= 2) {
      const chapters: ParsedChapter[] = [];
      for (let index = 0; index < chapterLinks.length; index += 1) {
        const link = chapterLinks[index];
        const chapter = await this.parseChapterPages(link.url, link.title);
        chapters.push({ ...chapter, index });
      }
      return { title, chapters };
    }

    const chapter = await this.parseChapterPages(url, title);
    return { title, chapters: [{ ...chapter, index: 0 }] };
  }

  private getChapterLinks(html: string, baseUrl: string) {
    const baseOrigin = new URL(baseUrl).origin;
    const seen = new Set<string>();
    return extractLinks(html, baseUrl)
      .filter((link) => {
        if (!chapterTitlePattern.test(link.title) || link.title.length > 80)
          return false;
        if (new URL(link.url).origin !== baseOrigin || seen.has(link.url))
          return false;
        seen.add(link.url);
        return true;
      })
      .slice(0, MAX_CHAPTERS);
  }

  private getNextPageUrl(html: string, baseUrl: string, visited: Set<string>) {
    const baseOrigin = new URL(baseUrl).origin;
    for (const link of extractLinks(html, baseUrl)) {
      if (
        !nextPagePattern.test(link.title) ||
        nextChapterPattern.test(link.title)
      )
        continue;
      if (visited.has(link.url) || new URL(link.url).origin !== baseOrigin)
        continue;
      return link.url;
    }
    return null;
  }

  private async parseChapterPages(startUrl: string, fallbackTitle: string) {
    const visited = new Set<string>();
    const parts: string[] = [];
    let currentUrl: string | null = startUrl;
    let title = fallbackTitle;

    for (let page = 0; currentUrl && page < MAX_PAGES_PER_CHAPTER; page += 1) {
      visited.add(currentUrl);
      const { html } = await fetchPublicHtml(currentUrl);
      if (page === 0) title = getTitle(html, currentUrl) || fallbackTitle;
      const text = getReadableText(html, currentUrl);
      if (text.length >= 40) parts.push(text);
      currentUrl = this.getNextPageUrl(html, currentUrl, visited);
    }

    const content = normalizeWhitespace(parts.join('\n\n'));
    if (content.length < 40) {
      throw new BadRequestException(
        '未能识别有效正文，可能是动态渲染或反爬页面',
      );
    }
    return { title, content };
  }
}
