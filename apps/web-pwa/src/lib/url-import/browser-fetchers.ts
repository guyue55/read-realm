/**
 * @file browser-fetchers.ts
 * @description L0 浏览器直连抓取器（浏览器环境专用）。
 *
 * 能力：
 * - 原生 fetch + AbortController 超时；
 * - 基础请求头（Accept / Accept-Language；UA 由浏览器管理，无法自定义）；
 * - 反爬正文预检（登录/付费墙/JS 挑战提前识别）；
 * - 响应大小上限保护。
 *
 * 边界：浏览器 fetch 受 CORS 限制；UA 不可自定义。这些由 L1/L2 抓取器补齐。
 */

import { FetchError, type FetchOptions, type FetchResult, type UrlFetcher } from "./fetch-adapter";
import { detectBlockedPage, isUsableContent, antiScrapeToErrorCode } from "./anti-scrape";
import { LocalApiStaticFetcher } from "./api-fetchers";
import { LocalHeadlessFetcher } from "./headless-fetcher";
import { resolveFetchTier, createDefaultUrlFetchPreference } from "../url-source-policy";

/** 默认请求超时（毫秒） */
const DEFAULT_TIMEOUT_MS = 12_000;
/** 默认响应大小上限（字节，5MB） */
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

/**
 * L0 浏览器直连抓取器。
 * 仅在浏览器环境使用（依赖 window.fetch / DOMParser / window.setTimeout）。
 */
export class BrowserDirectFetcher implements UrlFetcher {
  readonly level = "browser" as const;

  async fetch(url: string, options: FetchOptions = {}): Promise<FetchResult> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      let response: Response;
      try {
        response = await fetch(url, {
          signal: controller.signal,
          credentials: "omit",
          referrerPolicy: "no-referrer",
          redirect: options.followRedirects === false ? "manual" : "follow",
          headers: {
            accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "accept-language": "zh-CN,zh;q=0.9,en;q=0.7",
          },
        });
      } catch (error) {
        if (controller.signal.aborted) {
          throw new FetchError("请求超时", "FETCH_TIMEOUT");
        }
        if (error instanceof TypeError && /fetch|network|cors|load/i.test(error.message)) {
          throw new FetchError(
            "浏览器直连受 CORS 或网络限制，请尝试本地服务抓取",
            "FETCH_CORS",
          );
        }
        throw new FetchError(
          error instanceof Error ? error.message : "网络请求失败",
          "FETCH_NETWORK",
        );
      }

      if (!response.ok) {
        throw new FetchError(
          `页面请求失败：HTTP ${response.status}`,
          "FETCH_HTTP",
          response.status,
        );
      }

      // 响应大小上限保护
      const contentLength = Number(response.headers.get("content-length") || "0");
      if (contentLength > maxBytes) {
        throw new FetchError("页面响应超过大小上限", "FETCH_TOO_LARGE");
      }

      const html = await response.text();
      if (html.length > maxBytes) {
        throw new FetchError("页面响应超过大小上限", "FETCH_TOO_LARGE");
      }

      // 反爬预检：识别登录/付费墙/JS 挑战（在解析前尽早暴露，避免无效抓取）
      const blocked = detectBlockedPage(html);
      if (blocked) {
        // 对 HTML 做纯文本粗提取后再次判定（HTML 里的 meta/script 可能干扰）
        const plainText = html
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/[ \t]+/g, " ")
          .slice(0, 3000);
        const reBlocked = detectBlockedPage(plainText);
        if (reBlocked?.kind === "login_paywall") {
          throw new FetchError(
            "页面需要登录或付费；请手动打开后继续",
            "FETCH_HTTP",
          );
        }
      }

      const finalUrl = response.url || url;
      const usable = isUsableContent(
        html
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<[^>]+>/g, " "),
      );
      if (!usable) {
        // 无正文内容：交给上层解析阶段判定（可能动态渲染）
      }

      return { html, finalUrl, level: this.level };
    } finally {
      window.clearTimeout(timeout);
    }
  }
}

/**
 * 默认抓取器列表（多级，与档位联动）：
 * - L0 BrowserDirectFetcher：浏览器直连（CORS 通畅时最快）
 * - L1 LocalApiStaticFetcher：本地 API 静态抓取（解决 CORS/UA，默认主通道）
 * - L2 LocalHeadlessFetcher：仅激进档启用（重操作，攻克 JS/Cloudflare）
 * 档位 → 级别/并发由 url-source-policy.resolveFetchTier 纯函数决定（可测）。
 */
export function createDefaultFetchers(options: {
  /** 激进档：启用 L2 headless 渲染（默认关闭，重操作） */
  aggressive?: boolean;
} = {}): readonly UrlFetcher[] {
  const route = resolveFetchTier(
    options.aggressive
      ? { ...createDefaultUrlFetchPreference(), tier: "aggressive" }
      : createDefaultUrlFetchPreference(),
  );
  const fetchers: UrlFetcher[] = [];
  for (const level of route.levels) {
    if (level === "browser") fetchers.push(new BrowserDirectFetcher());
    if (level === "api") fetchers.push(new LocalApiStaticFetcher());
    if (level === "headless") fetchers.push(new LocalHeadlessFetcher());
  }
  return fetchers;
}

export { antiScrapeToErrorCode };
