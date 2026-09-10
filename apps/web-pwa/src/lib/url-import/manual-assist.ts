/**
 * @file manual-assist.ts
 * @description L3 手动协助通道：登录/验证码/反爬页面的用户引导。
 *
 * 设计原则（不绕过、只引导）：
 * - 本系统不自动填验证码、不绕登录；但当用户本人有权访问该页面时，
 *   引导用户在新窗口打开完成登录/验证，再把可见的 HTML 粘贴回来继续导入；
 * - 这保证了「用户能看到就能导入」的体验闭环，同时守住边界。
 */

import type { ParsedBook } from "@reader/parser-core";
import { parseHtmlInBrowser } from "./parse";
import { UrlImportError } from "./errors";

/** 需要手动协助的错误码集合（登录/付费墙/动态渲染/验证码） */
export const MANUAL_ASSIST_ERROR_CODES = new Set([
  "SOURCE_LOGIN_PAYWALL_REQUIRED",
  "URL_DYNAMIC_RENDER_REQUIRED",
  "SOURCE_RATE_LIMITED",
]);

/** 判定错误是否需要手动协助 */
export function isManualAssistError(error: unknown): boolean {
  if (error instanceof UrlImportError) {
    return MANUAL_ASSIST_ERROR_CODES.has(error.code);
  }
  return false;
}

/** 手动协助引导文案（按错误码差异化） */
export function manualAssistHint(code: string): string {
  switch (code) {
    case "SOURCE_LOGIN_PAYWALL_REQUIRED":
      return "该页面需要登录或付费阅读。请在浏览器新窗口打开链接，完成登录后回到这里粘贴页面内容继续导入。";
    case "URL_DYNAMIC_RENDER_REQUIRED":
      return "该页面由 JavaScript 动态渲染。请在新窗口打开链接（内容可见即可），把渲染后的页面内容粘贴回来继续导入。";
    case "SOURCE_RATE_LIMITED":
      return "目标站点触发了访问频率限制。请稍候片刻，或在新窗口打开后粘贴页面内容继续导入。";
    default:
      return "请在浏览器新窗口打开链接，确认内容可见后粘贴回来继续导入。";
  }
}

/**
 * 从用户粘贴的 HTML 解析为单章书（标题 + 正文）。
 * 手动协助的核心入口：用户粘贴可见内容 → 提取正文。
 */
export function parsePastedHtmlToChapter(
  html: string,
  fallbackTitle?: string,
): { title: string; content: string } {
  const parsed = parseHtmlInBrowser(html);
  return {
    title: parsed.title || fallbackTitle || "手动粘贴章节",
    content: parsed.text,
  };
}

/**
 * 组装手动协助导入结果：单章书。
 * 上层（导入页）拿到后走与正常导入相同的持久化流程。
 */
export function buildManualAssistBook(chapter: {
  title: string;
  content: string;
}): ParsedBook {
  return {
    title: chapter.title,
    chapters: [{ index: 0, title: chapter.title, content: chapter.content }],
  };
}
