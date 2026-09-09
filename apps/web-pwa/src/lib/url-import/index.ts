/**
 * @file index.ts
 * @description URL 导入模块组合层。
 *
 * 职责：把抓取适配器（fetch-adapter）与解析引擎（parse）组合为
 * 对外统一的 parseUrlBookInBrowser 入口，并提供多级抓取编排。
 *
 * 设计：
 * - 解析引擎与抓取解耦；本层只做编排与错误映射；
 * - 支持多级抓取：L0 浏览器直连 → L1 本地 API → L2 headless → L3 手动，
 *   每级由不同的 UrlFetcher 实现提供。
 */

import type { ParsedBook } from "@reader/parser-core";
import {
  detectBlockedPage,
  antiScrapeToErrorCode,
} from "./anti-scrape";
import { FetchError, type UrlFetcher, retryWithBackoff } from "./fetch-adapter";
import { parseUrlBook, type ParseProgressEvent } from "./parse";

/** URL 导入错误（带稳定错误码，供导入任务状态机与用户提示映射） */
export class UrlImportError extends Error {
  constructor(
    message: string,
    readonly code: string = "URL_PARSE_FAILED",
  ) {
    super(message);
    this.name = "UrlImportError";
  }
}

/** 多级抓取路由配置 */
export interface MultiLevelFetchOptions {
  /** 按优先级排列的抓取器（L0→L3） */
  fetchers: readonly UrlFetcher[];
  /** 抓取器失败时是否尝试下一级 */
  fallthroughOnError?: boolean;
  /** 重试配置（应用于每级内部） */
  maxRetries?: number;
  /** 中止信号 */
  signal?: AbortSignal;
}

/**
 * 多级抓取：依次尝试每个抓取器，返回第一个成功的 HTML。
 * 每级失败（网络/超时/HTTP 错误）时降级到下一级；反爬识别在解析阶段做。
 */
export async function fetchWithMultiLevel(
  url: string,
  options: MultiLevelFetchOptions,
): Promise<{ html: string; finalUrl: string; level: string }> {
  const {
    fetchers,
    fallthroughOnError = true,
    maxRetries = 2,
    signal,
  } = options;
  let lastError: unknown;

  for (const fetcher of fetchers) {
    try {
      const result = await retryWithBackoff(
        () => fetcher.fetch(url, { signal }),
        { maxRetries, signal, shouldRetry: isRetryableFetchError },
      );
      // 基础反爬预检（登录/付费墙/JS 挑战提前暴露）
      const blocked = detectBlockedPage(result.html);
      if (blocked?.kind === "login_paywall") {
        throw new UrlImportError(
          "页面需要登录或付费；请手动打开后继续",
          antiScrapeToErrorCode(blocked.kind),
        );
      }
      return { html: result.html, finalUrl: result.finalUrl, level: result.level };
    } catch (error) {
      lastError = error;
      // 登录/付费墙等"明确不可升级"的错误：不继续降级，直接抛出
      if (error instanceof UrlImportError) throw error;
      if (!fallthroughOnError) throw error;
    }
  }
  if (lastError instanceof Error) throw lastError;
  throw new UrlImportError("所有抓取通道均失败", "URL_FETCH_FAILED");
}

/** 判断错误是否值得重试（网络/超时/5xx，而非业务/反爬） */
function isRetryableFetchError(error: unknown): boolean {
  if (error instanceof FetchError) {
    return (
      error.code === "FETCH_TIMEOUT" ||
      error.code === "FETCH_NETWORK" ||
      error.code === "FETCH_HTTP" ||
      error.code === "FETCH_TOO_LARGE"
    );
  }
  return false;
}

/** 兼容入口参数：与旧 url-import.ts 的 parseUrlBookInBrowser 签名一致 */
export interface ParseUrlBookInBrowserOptions {
  /** 多级抓取器（默认 L0 浏览器直连） */
  fetchers?: readonly UrlFetcher[];
  /** 进度回调（字符串消息，兼容旧调用方；内部由结构化事件转字符串） */
  onProgress?: (message: string) => void;
  /** 中止信号 */
  signal?: AbortSignal;
}

/**
 * 在浏览器中解析 URL 为 ParsedBook（兼容旧接口签名）。
 * 默认使用多级抓取（L0 直连 + L1 本地 API）；可通过 fetchers 注入更多级别。
 */
export async function parseUrlBookInBrowser(
  url: string,
  onProgress?: (message: string) => void,
): Promise<ParsedBook> {
  const { createDefaultFetchers } = await import("./browser-fetchers");
  return parseUrlBookInBrowserWithFetchers(url, {
    fetchers: createDefaultFetchers(),
    onProgress,
  });
}

/**
 * 带显式抓取器的解析入口（供编排层使用，如 url-source-client）。
 */
export async function parseUrlBookInBrowserWithFetchers(
  url: string,
  options: ParseUrlBookInBrowserOptions = {},
): Promise<ParsedBook> {
  const { fetchers, onProgress, signal } = options;
  const resolvedFetchers =
    fetchers ?? (await import("./browser-fetchers")).createDefaultFetchers();

  // 进度事件统一为结构化（旧字符串回调转发为 message）
  const emit = (event: ParseProgressEvent): void => {
    onProgress?.(event.message);
  };

  emit({ index: -1, total: 0, status: "fetching", message: "读取链接页面..." });
  const { finalUrl } = await fetchWithMultiLevel(url, {
    fetchers: resolvedFetchers,
    signal,
  });

  emit({ index: -1, total: 0, status: "parsing", message: "解析目录与章节..." });
  // 复用 parseUrlBook 的解析逻辑，传入"按 URL 获取已解析 Document"的注入函数
  const fetchDoc = async (pageUrl: string): Promise<Document> => {
    emit({ index: -1, total: 0, status: "fetching", message: `抓取 ${pageUrl}...` });
    const result = await fetchWithMultiLevel(pageUrl, {
      fetchers: resolvedFetchers,
      signal,
    });
    return new DOMParser().parseFromString(result.html, "text/html");
  };

  return parseUrlBook(finalUrl, fetchDoc, {}, { onProgress: emit });
}
