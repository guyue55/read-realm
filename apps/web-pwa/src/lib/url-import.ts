import type { ParsedBook, ParsedChapter } from "@reader/parser-core";

const MAX_CHAPTERS = 80;
const MAX_PAGES_PER_CHAPTER = 8;
const REQUEST_TIMEOUT_MS = 12000;

const chapterTitlePattern =
  /^\s*(第\s*[零一二三四五六七八九十百千万0-9]+\s*[章回节卷]|chapter\s+\d+|番外|序章|楔子|终章)/i;
const nextPagePattern =
  /^(下一页|下页|下一頁|下頁|继续阅读|本章未完|>|›|»)\s*$/i;
const nextChapterPattern = /(下一章|下章|下一回|下一节|下一卷|next chapter)/i;
const blockedPagePattern =
  /(验证码|访问过于频繁|安全验证|人机验证|请开启javascript|enable javascript|checking your browser|just a moment|cloudflare|access denied|forbidden)/i;

export class UrlImportError extends Error {
  constructor(
    message: string,
    readonly code = "URL_PARSE_FAILED",
  ) {
    super(message);
    this.name = "UrlImportError";
  }
}

function normalizeWhitespace(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function toAbsoluteUrl(href: string | null, baseUrl: string) {
  if (!href || href.startsWith("javascript:") || href.startsWith("#"))
    return null;
  try {
    const url = new URL(href, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function assertUsablePage(text: string) {
  if (blockedPagePattern.test(text.slice(0, 3000))) {
    throw new UrlImportError(
      "页面疑似触发反爬或需要验证码，已切换到后端兜底。",
      "SOURCE_RATE_LIMITED",
    );
  }
}

async function fetchDocument(url: string) {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok)
      throw new UrlImportError(`页面请求失败：HTTP ${response.status}`);
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const text = normalizeWhitespace(doc.body?.innerText || "");
    assertUsablePage(text);
    return doc;
  } finally {
    window.clearTimeout(timeout);
  }
}

function getDocumentTitle(doc: Document, url: string) {
  const h1 = doc.querySelector("h1")?.textContent?.trim();
  const title =
    h1 ||
    doc.querySelector("title")?.textContent?.trim() ||
    new URL(url).hostname;
  return title.replace(/[_|-].*$/, "").trim() || new URL(url).hostname;
}

function getReadableText(doc: Document) {
  const selectors = [
    "article",
    "main",
    "#content",
    "#chaptercontent",
    ".content",
    ".chapter-content",
    ".read-content",
    ".novel-content",
    ".entry-content",
  ];

  const contentCandidates = selectors
    .flatMap((selector) =>
      Array.from(doc.querySelectorAll<HTMLElement>(selector)),
    )
    .filter(
      (candidate) =>
        normalizeWhitespace(candidate.innerText || "").length >= 40,
    );

  const candidates =
    contentCandidates.length > 0
      ? contentCandidates
      : doc.body
        ? [doc.body]
        : [];
  const best = candidates.reduce<HTMLElement | null>((current, candidate) => {
    const currentLength = normalizeWhitespace(current?.innerText || "").length;
    const candidateLength = normalizeWhitespace(
      candidate.innerText || "",
    ).length;
    return candidateLength > currentLength ? candidate : current;
  }, null);

  if (!best) return "";
  const clone = best.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll(
      "script, style, noscript, iframe, nav, header, footer, form, button, aside",
    )
    .forEach((node) => node.remove());

  return normalizeWhitespace(clone.innerText || clone.textContent || "");
}

function getChapterLinks(doc: Document, baseUrl: string) {
  const baseOrigin = new URL(baseUrl).origin;
  const seen = new Set<string>();
  const links: { title: string; url: string }[] = [];

  doc.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((anchor) => {
    const title = normalizeWhitespace(anchor.textContent || "");
    if (!chapterTitlePattern.test(title) || title.length > 80) return;
    const url = toAbsoluteUrl(anchor.getAttribute("href"), baseUrl);
    if (!url || new URL(url).origin !== baseOrigin || seen.has(url)) return;
    seen.add(url);
    links.push({ title, url });
  });

  return links.slice(0, MAX_CHAPTERS);
}

function getNextPageUrl(doc: Document, baseUrl: string, visited: Set<string>) {
  const baseOrigin = new URL(baseUrl).origin;
  for (const anchor of Array.from(
    doc.querySelectorAll<HTMLAnchorElement>("a[href]"),
  )) {
    const label = normalizeWhitespace(
      anchor.textContent || anchor.getAttribute("aria-label") || "",
    );
    if (!nextPagePattern.test(label) || nextChapterPattern.test(label))
      continue;
    const url = toAbsoluteUrl(anchor.getAttribute("href"), baseUrl);
    if (!url || visited.has(url)) continue;
    const next = new URL(url);
    if (next.origin !== baseOrigin) continue;
    return url;
  }
  return null;
}

async function parseChapterPages(
  startUrl: string,
  fallbackTitle: string,
): Promise<Omit<ParsedChapter, "index">> {
  const visited = new Set<string>();
  const parts: string[] = [];
  let title = fallbackTitle;
  let currentUrl: string | null = startUrl;

  for (let page = 0; currentUrl && page < MAX_PAGES_PER_CHAPTER; page += 1) {
    visited.add(currentUrl);
    const doc = await fetchDocument(currentUrl);
    title =
      page === 0 ? getDocumentTitle(doc, currentUrl) || fallbackTitle : title;
    const text = getReadableText(doc);
    if (text.length >= 40) parts.push(text);
    currentUrl = getNextPageUrl(doc, currentUrl, visited);
  }

  const content = normalizeWhitespace(parts.join("\n\n"));
  if (content.length < 40) {
    throw new UrlImportError(
      "未能识别有效正文，可能是动态渲染或反爬页面。",
      "URL_DYNAMIC_RENDER_REQUIRED",
    );
  }

  return { title, content };
}

export async function parseUrlBookInBrowser(
  url: string,
  onProgress?: (message: string) => void,
): Promise<ParsedBook> {
  const normalizedUrl = new URL(url).toString();
  onProgress?.("读取链接页面...");
  const doc = await fetchDocument(normalizedUrl);
  const title = getDocumentTitle(doc, normalizedUrl);
  const chapterLinks = getChapterLinks(doc, normalizedUrl);

  if (chapterLinks.length >= 2) {
    const chapters: ParsedChapter[] = [];
    for (let index = 0; index < chapterLinks.length; index += 1) {
      const link = chapterLinks[index];
      onProgress?.(`解析章节 ${index + 1} / ${chapterLinks.length}`);
      const chapter = await parseChapterPages(link.url, link.title);
      chapters.push({ ...chapter, index });
    }
    return { title, chapters };
  }

  onProgress?.("解析正文和分页...");
  const chapter = await parseChapterPages(normalizedUrl, title);
  return {
    title,
    chapters: [{ ...chapter, index: 0 }],
  };
}
