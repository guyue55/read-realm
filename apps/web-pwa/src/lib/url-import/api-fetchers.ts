/**
 * @file api-fetchers.ts
 * @description L1 本地 API 静态抓取器（浏览器环境）。
 *
 * 能力：
 * - 通过本地 NestJS API 的 /imports/proxy/fetch 做静态抓取，
 *   由服务端解决浏览器 CORS/UA 限制；
 * - 携带分享令牌头（与既有 API 调用一致）；
 * - 后端负责 SSRF 守门、重定向链、大小上限、节流与反爬检测。
 */

import { apiUrl, getShareHeaders } from "../api";
import {
  FetchError,
  type FetchOptions,
  type FetchResult,
  type UrlFetcher,
} from "./fetch-adapter";

/** 本地 API 静态抓取器（L1） */
export class LocalApiStaticFetcher implements UrlFetcher {
  readonly level = "api" as const;

  async fetch(url: string, options: FetchOptions = {}): Promise<FetchResult> {
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? 15_000;
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(apiUrl("/imports/proxy/fetch"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getShareHeaders() },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        let message = detail;
        try {
          const parsed = JSON.parse(detail) as { message?: string | string[] };
          message = Array.isArray(parsed.message)
            ? parsed.message.join("，")
            : parsed.message || detail;
        } catch {
          message = detail;
        }
        if (response.status === 429) {
          throw new FetchError(message || "抓取过于频繁", "FETCH_HTTP", 429);
        }
        throw new FetchError(
          message || `抓取失败：HTTP ${response.status}`,
          "FETCH_HTTP",
          response.status,
        );
      }

      const result = (await response.json()) as {
        html: string;
        finalUrl: string;
      };
      return {
        html: result.html,
        finalUrl: result.finalUrl || url,
        level: this.level,
      };
    } catch (error) {
      if (error instanceof FetchError) throw error;
      if (controller.signal.aborted) {
        throw new FetchError("本地服务请求超时", "FETCH_TIMEOUT");
      }
      if (error instanceof TypeError) {
        throw new FetchError(
          "本地服务不可达，请确认已启动本机 API",
          "FETCH_NETWORK",
        );
      }
      throw new FetchError(
        error instanceof Error ? error.message : "本地服务请求失败",
        "FETCH_NETWORK",
      );
    } finally {
      window.clearTimeout(timeout);
    }
  }
}
