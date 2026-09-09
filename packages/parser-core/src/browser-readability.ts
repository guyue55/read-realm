/**
 * @file browser-readability.ts
 * @description 基于 Mozilla Readability 的浏览器安全正文提取入口。
 *
 * 与 ./html-parser.ts（Node/jsdom 版）区分：
 * - 本模块不创建 DOM，只接受外部传入的 Document 对象，
 *   浏览器端由调用方传入 new DOMParser().parseFromString() 的结果，
 *   Node/测试端可传入 jsdom 构造的 Document。
 * - 输出以纯文本为主（textContent），供 URL 导入的章节正文使用；
 *   不依赖 jsdom，避免把 Node 依赖带进浏览器打包产物。
 */

import { Readability } from "@mozilla/readability";

export interface BrowserExtractedArticle {
  /** 页面标题（来自 Readability 解析） */
  title: string;
  /** 净化后的正文 HTML（仅保留基础排版标签，防 XSS） */
  content: string;
  /** 纯文本正文（去除所有 HTML 标签后的可读文本） */
  textContent: string;
}

/** 允许保留的正文 HTML 标签（与 html-parser 的净化白名单保持一致） */
const ALLOWED_CONTENT_TAGS = new Set([
  "a",
  "p",
  "br",
  "div",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "span",
  "strong",
  "em",
  "b",
  "i",
  "blockquote",
  "pre",
  "code",
  "ul",
  "ol",
  "li",
]);

/** 危险标签：必须从正文中移除，防止脚本/样式/交互内容混入 */
const DANGEROUS_CONTENT_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "option",
  "link",
  "meta",
  "base",
  "svg",
  "math",
]);

/** 允许保留的属性白名单（默认不信任任何内联事件属性） */
const ALLOWED_CONTENT_ATTRS = new Set(["src", "alt", "href", "title", "class"]);

/**
 * 校验 URL 属性是否安全（仅允许站内/站外 http(s) 链接与常见资源）。
 * 用于净化正文时对 a[href]/img[src] 做白名单校验，防 javascript: 等注入。
 */
function isSafeUrlAttribute(value: string): boolean {
  const normalized = value.trim().replace(/[\u0000-\u0020]+/g, "").toLowerCase();
  if (!normalized) return true;
  if (normalized.startsWith("#") || normalized.startsWith("/")) return true;
  return (
    normalized.startsWith("http://") || normalized.startsWith("https://")
  );
}

/**
 * 对 Readability 产出的正文 HTML 做轻量净化。
 * 只保留排版标签与白名单属性；移除脚本/样式/表单/内联事件等危险内容。
 * 纯字符串处理，不依赖 DOM，可在任意环境运行。
 */
export function sanitizeExtractedHtml(rawHtml: string): string {
  // 1. 移除危险标签及其内容
  let html = rawHtml.replace(
    /<(script|style|noscript|iframe|object|embed|form|input|button|textarea|select|option|link|meta|base|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
    "",
  );

  // 2. 移除自闭合的危险标签
  html = html.replace(
    /<(script|style|iframe|object|embed|link|meta|base|svg|math)\b[^>]*\/?>/gi,
    "",
  );

  // 3. 移除所有内联事件属性与危险协议属性
  html = html
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(
      /\s(href|src)\s*=\s*("javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]+)/gi,
      "",
    );

  // 4. 仅保留白名单标签；其余标签退化为纯文本（保留内容）
  html = html.replace(/<\/?(?!\/?[A-Za-z0-9]+)[^>]*>/g, "");
  const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
  html = html.replace(tagPattern, (match, tagName: string) => {
    const lower = tagName.toLowerCase();
    if (ALLOWED_CONTENT_TAGS.has(lower)) {
      // 白名单标签：移除非白名单属性
      const attrPattern = /\s[a-zA-Z-]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/g;
      let sanitizedTag = match.replace(attrPattern, () => "");
      // 逐属性重建：仅保留白名单属性与安全 URL
      for (const attrMatch of match.matchAll(attrPattern)) {
        const fullAttr = attrMatch[0] ?? "";
        const attrRaw = attrMatch[1] ?? "";
        const attrName = (fullAttr.trim().split("=")[0] ?? "")
          .trim()
          .toLowerCase();
        if (!ALLOWED_CONTENT_ATTRS.has(attrName)) continue;
        const attrValue = attrRaw.replace(/^["']|["']$/g, "");
        if (attrName === "href" || attrName === "src") {
          if (!isSafeUrlAttribute(attrValue)) continue;
        }
        sanitizedTag = sanitizedTag + fullAttr;
      }
      return sanitizedTag;
    }
    // 非白名单标签：退化（保留内容，去掉标签）
    return "";
  });

  // 5. 清理多余空白与连续空行
  return html
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * 使用 Mozilla Readability 从已解析的 Document 中提取正文。
 *
 * @param doc 已解析的 Document（浏览器 DOMParser 或 jsdom 构造）
 * @param url 页面来源 URL（用于 Readability 解析相对链接）
 * @returns 提取结果（标题 + 净化正文 HTML + 纯文本正文）
 * @throws 当页面无法提取出有效内容块时抛出错误
 */
export function extractArticleFromDocument(
  doc: Document,
  url?: string,
): BrowserExtractedArticle {
  if (!doc || !doc.body) {
    throw new Error("HTML 文档为空，无法解析");
  }

  // 移除常见干扰节点，提高 Readability 提取准确率
  const selectorsToRemove = [
    "script",
    "style",
    "noscript",
    "iframe",
    "form",
    "header",
    "footer",
    "nav",
    ".footer",
    ".header",
    ".sidebar",
    "#sidebar",
    ".comment",
    ".ads",
    ".advertisement",
  ];
  for (const selector of selectorsToRemove) {
    doc.querySelectorAll(selector).forEach((el) => el.remove());
  }

  const reader = new Readability(doc, {
    charThreshold: 30,
  });
  const article = reader.parse();

  if (!article) {
    throw new Error("Mozilla Readability 未能在页面中提取出有效的内容块");
  }

  const content = sanitizeExtractedHtml(article.content ?? "");

  return {
    title: article.title?.trim() || "",
    content,
    textContent: (article.textContent || "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  };
}
