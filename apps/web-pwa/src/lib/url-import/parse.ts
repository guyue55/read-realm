/**
 * @file parse.ts
 * @description URL 导入的解析引擎（纯函数，DOM 依赖可注入，可单测）。
 *
 * 设计要点：
 * - parseHtmlInBrowser 接收 HTML 字符串，通过注入的 deps.parseHtml 得到 Document；
 *   浏览器默认用原生 DOMParser，测试注入轻量 stub，避免 web-pwa 引入 jsdom。
 * - 正文提取优先用浏览器 Readability（@reader/parser-core/browser-readability），
 *   失败时降级到启发式 innerText 提取。
 * - 章节链接识别 / "下一页"分页 / 反爬识别均为纯逻辑，与网络完全解耦。
 */

import type { ParsedBook, ParsedChapter } from "@reader/parser-core";
import { extractArticleFromDocument } from "@reader/parser-core/browser-readability";

/** 解析引擎可注入的依赖（默认使用浏览器全局对象） */
export interface ParseDeps {
  /** 把 HTML 字符串解析为 Document（浏览器：DOMParser；测试：stub）。缺省时用全局 DOMParser */
  parseHtml?: (html: string) => Document;
  /** 从 Document 提取正文纯文本（默认：浏览器 Readability + 启发式降级） */
  extractText?: (doc: Document) => string;
  /** 是否可用（浏览器：typeof document !== "undefined"） */
  isBrowser?: () => boolean;
}

const MAX_CHAPTERS = 80;
const MAX_PAGES_PER_CHAPTER = 8;

/** 章节链接标题识别（与后端保持一致） */
const chapterTitlePattern =
  /^\s*(第\s*[零一二三四五六七八九十百千万0-9]+\s*[章回节卷]|chapter\s+\d+|番外|序章|楔子|终章)/i;
/** "下一页"分页链接识别 */
const nextPagePattern =
  /^(下一页|下页|下一頁|下頁|继续阅读|本章未完|>|›|»)\s*$/i;
/** "下一章"识别（避免把"下一章"当成"下一页"） */
const nextChapterPattern = /(下一章|下章|下一回|下一节|下一卷|next chapter)/i;

/** 规范化空白：NBSP→空格、多空格→单空格、3+ 换行→2 换行 */
export function normalizeWhitespace(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 相对 URL → 绝对 URL（仅 http/https） */
export function toAbsoluteUrl(
  href: string | null,
  baseUrl: string,
): string | null {
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

/** 页面标题提取：h1 > title > hostname */
export function getDocumentTitle(doc: Document, url: string): string {
  const h1 = doc.querySelector("h1")?.textContent?.trim();
  const title =
    h1 ||
    doc.querySelector("title")?.textContent?.trim() ||
    new URL(url).hostname;
  return title.replace(/[_|-].*$/, "").trim() || new URL(url).hostname;
}

/** 启发式正文提取候选选择器（Readability 失败时的降级路径） */
const FALLBACK_CONTENT_SELECTORS = [
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

/** 浏览器默认正文提取：优先 Readability，失败降级启发式 */
function createDefaultExtractText(): (doc: Document) => string {
  return (doc: Document) => {
    let text = "";
    try {
      text = extractArticleFromDocument(doc).textContent;
    } catch {
      // Readability 提取失败（页面结构异常）→ 走启发式降级
      text = heuristicExtractText(doc);
    }
    if (text.length < 40) {
      text = heuristicExtractText(doc);
    }
    return normalizeWhitespace(text);
  };
}

/** 兼容浏览器与 jsdom 的节点文本读取：innerText 优先，缺失时降级 textContent */
function nodeText(node: HTMLElement): string {
  const inner = (node as HTMLElement & { innerText?: string }).innerText;
  if (inner) return inner;
  return node.textContent || "";
}

/** 启发式正文提取（不依赖 Readability） */
export function heuristicExtractText(doc: Document): string {
  const contentCandidates = FALLBACK_CONTENT_SELECTORS.flatMap((selector) =>
    Array.from(doc.querySelectorAll<HTMLElement>(selector)),
  ).filter(
    (candidate) => normalizeWhitespace(nodeText(candidate)).length >= 40,
  );

  const candidates =
    contentCandidates.length > 0
      ? contentCandidates
      : doc.body
        ? [doc.body]
        : [];
  const best = candidates.reduce<HTMLElement | null>((current, candidate) => {
    const currentLength = current
      ? normalizeWhitespace(nodeText(current)).length
      : -1;
    const candidateLength = normalizeWhitespace(nodeText(candidate)).length;
    return candidateLength > currentLength ? candidate : current;
  }, null);

  if (!best) return "";
  const clone = best.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll(
      "script, style, noscript, iframe, nav, header, footer, form, button, aside",
    )
    .forEach((node) => node.remove());
  return normalizeWhitespace(nodeText(clone));
}

/** 章节链接提取（同源、去重、限 80 章） */
export function getChapterLinks(
  doc: Document,
  baseUrl: string,
): { title: string; url: string }[] {
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

/** 下一页链接提取（同源、去重、排除"下一章"） */
export function getNextPageUrl(
  doc: Document,
  baseUrl: string,
  visited: Set<string>,
): string | null {
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

/**
 * 解析单章多分页内容（"下一页"分页抓取，最多 8 页）。
 * 纯逻辑：接收"按 URL 获取已解析 Document"的注入函数，便于测试。
 */
export async function parseChapterPages(
  startUrl: string,
  fallbackTitle: string,
  fetchDoc: (url: string) => Promise<Document>,
  deps: ParseDeps,
): Promise<Omit<ParsedChapter, "index">> {
  const visited = new Set<string>();
  const parts: string[] = [];
  let title = fallbackTitle;
  let currentUrl: string | null = startUrl;
  const extractText = deps.extractText ?? createDefaultExtractText();

  for (let page = 0; currentUrl && page < MAX_PAGES_PER_CHAPTER; page += 1) {
    visited.add(currentUrl);
    const doc = await fetchDoc(currentUrl);
    title =
      page === 0 ? getDocumentTitle(doc, currentUrl) || fallbackTitle : title;
    const text = extractText(doc);
    if (text.length >= 40) parts.push(text);
    currentUrl = getNextPageUrl(doc, currentUrl, visited);
  }

  const content = normalizeWhitespace(parts.join("\n\n"));
  if (content.length < 40) {
    throw new Error("未能识别有效正文，可能是动态渲染或反爬页面");
  }
  return { title, content };
}

/**
 * 解析整个 URL 为 ParsedBook（章节目录 + 逐章正文）。
 *
 * @param url 页面 URL
 * @param fetchDoc 按 URL 获取已解析 Document 的注入函数（由抓取适配器提供）
 * @param deps 解析依赖（可注入，默认浏览器全局）
 * @param options 并发与进度配置
 */
export interface ParseUrlBookOptions {
  /** 章节并发抓取数（默认 5；1 表示串行） */
  concurrency?: number;
  /** 结构化进度回调（index/total/status/message） */
  onProgress?: (event: ParseProgressEvent) => void;
}

/** 结构化解析进度事件 */
export interface ParseProgressEvent {
  /** 章节序号（-1 表示整书级阶段） */
  index: number;
  /** 总章节数 */
  total: number;
  /** 状态：queued / fetching / parsing / ok / failed */
  status: "queued" | "fetching" | "parsing" | "ok" | "failed";
  /** 人类可读消息（兼容旧字符串进度） */
  message: string;
}

export async function parseUrlBook(
  url: string,
  fetchDoc: (url: string) => Promise<Document>,
  deps: ParseDeps = {},
  options: ParseUrlBookOptions = {},
): Promise<ParsedBook> {
  const { concurrency = 5, onProgress } = options;
  const normalizedUrl = new URL(url).toString();
  const doc = await fetchDoc(normalizedUrl);
  const title = getDocumentTitle(doc, normalizedUrl);
  const chapterLinks = getChapterLinks(doc, normalizedUrl);

  if (chapterLinks.length >= 2) {
    const { createConcurrencyPool } = await import("./fetch-adapter");
    const total = chapterLinks.length;

    onProgress?.({
      index: -1,
      total,
      status: "queued",
      message: `发现 ${total} 章，开始并发抓取...`,
    });

    const chapters: ParsedChapter[] = [];
    // 并发抓取章节；单章失败不阻断整体（失败项置 null，由上层决定重试策略）
    const results = await createConcurrencyPool(
      chapterLinks,
      async (link, index) => {
        onProgress?.({
          index,
          total,
          status: "fetching",
          message: `抓取第 ${index + 1}/${total} 章：${link.title}`,
        });
        try {
          const chapter = await parseChapterPages(
            link.url,
            link.title,
            fetchDoc,
            deps,
          );
          onProgress?.({
            index,
            total,
            status: "ok",
            message: `第 ${index + 1}/${total} 章解析完成`,
          });
          return { ...chapter, index } as ParsedChapter;
        } catch (error) {
          onProgress?.({
            index,
            total,
            status: "failed",
            message: `第 ${index + 1}/${total} 章解析失败：${
              error instanceof Error ? error.message : "未知错误"
            }`,
          });
          return null;
        }
      },
      concurrency,
    );

    // 收集成功章节（按 index 排序，保证顺序稳定）
    for (const result of results) {
      if (result) chapters.push(result);
    }
    if (chapters.length === 0) {
      throw new Error("未能识别有效正文，可能是动态渲染或反爬页面");
    }
    return { title, chapters };
  }

  const chapter = await parseChapterPages(normalizedUrl, title, fetchDoc, deps);
  return {
    title,
    chapters: [{ ...chapter, index: 0 }],
  };
}

/**
 * 解析单个 HTML 页面为正文文本（供 L3 手动协助等场景直接使用）。
 * 纯函数：输入 HTML 字符串，输出正文文本。
 */
export function parseHtmlInBrowser(
  html: string,
  deps: ParseDeps = {},
): { title: string; text: string } {
  const parseHtml =
    deps.parseHtml ?? ((h: string) => new DOMParser().parseFromString(h, "text/html"));
  const doc = parseHtml(html);
  const title = getDocumentTitle(doc, "https://local.invalid");
  const extractText = deps.extractText ?? createDefaultExtractText();
  const text = extractText(doc);
  return { title, text };
}
