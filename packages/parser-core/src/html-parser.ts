/**
 * @file html-parser.ts
 * @description 基于 Mozilla Readability & JSDOM 的通用网页内容提取引擎。
 * 遵循最佳实践，确保输出内容结构化并经过 DOMPurify 安全过滤。
 */

import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import DOMPurify from "isomorphic-dompurify";

export interface ParsedWebPage {
  /**
   * 网页提取出的干净标题
   */
  title: string;
  /**
   * 经过 DOMPurify 净化后的 HTML 格式正文（保留段落、加粗等，适合阅读器高保真排版）
   */
  content: string;
  /**
   * 纯文本格式的正文
   */
  textContent: string;
  /**
   * 网页摘要或导言
   */
  excerpt: string;
}

/**
 * 使用 Mozilla Readability 算法解析任意 HTML 页面。
 *
 * @param html 原始 HTML 字符串
 * @param url 页面来源 URL (用于校正相对链接)
 * @returns 结构化解析结果
 */
export function parseWebPageWithReadability(
  html: string,
  url?: string,
): ParsedWebPage {
  if (!html || html.trim() === "") {
    throw new Error("HTML 内容为空，无法解析");
  }

  // 1. 使用 JSDOM 构建虚拟 DOM
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;

  // 2. 移除常见的无关干扰节点，提高 Readability 的提取准确率
  const selectorsToToRemove = [
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
  for (const selector of selectorsToToRemove) {
    doc.querySelectorAll(selector).forEach((el) => el.remove());
  }

  // 3. 实例化 Readability 分析器
  const reader = new Readability(doc, {
    charThreshold: 30, // 字符阈值降低，确保偏短的页面也能尽量提取
  });

  const article = reader.parse();

  if (!article) {
    throw new Error("Mozilla Readability 未能在页面中提取出有效的内容块");
  }

  // 4. 对提取的 HTML 内容进行 DOMPurify 过滤防 XSS 攻击
  // 仅允许段落、换行、基本排版和轻量级修饰标签
  const sanitizedHtml = DOMPurify.sanitize(article.content, {
    ALLOWED_TAGS: [
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
    ],
    ALLOWED_ATTR: ["class", "id"],
  });

  // 5. 格式化纯文本
  const textContent = (article.textContent || "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    title: article.title?.trim() || "无标题",
    content: sanitizedHtml,
    textContent,
    excerpt: article.excerpt?.trim() || "",
  };
}
