/**
 * @file headless-fetcher.ts
 * @description L2 headless 渲染抓取器（浏览器环境）。
 *
 * 能力：
 * - 通过本地 API 的 /imports/headless-fetch 触发无头浏览器渲染，
 *   攻克动态渲染 / Cloudflare 等静态抓取拿不到正文的页面；
 * - 后端负责 SSRF 守门、渲染超时、并发上限与浏览器内核探测；
 * - 渲染 meta（challenge/login_required）透传给上层，供升级 L3 手动协助。
 *
 * 边界：L2 是重操作（启动浏览器），仅在激进档或 L1 明确失败时启用。
 */

import { apiUrl, getShareHeaders } from "../api";
import {
  FetchError,
  type FetchOptions,
  type FetchResult,
  type UrlFetcher,
} from "./fetch-adapter";

/** headless 渲染结果 meta 类型（与后端一致） */
export type HeadlessMeta = "ok" | "challenge" | "timeout" | "login_required";

/** L2 headless 渲染抓取器 */
export class LocalHeadlessFetcher implements UrlFetcher {
  readonly level = "headless" as const;

  async fetch(url: string, options: FetchOptions = {}): Promise<FetchResult> {
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? 35_000;
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(apiUrl("/imports/headless-fetch"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getShareHeaders() },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new FetchError(
          detail || `动态渲染失败：HTTP ${response.status}`,
          "FETCH_HTTP",
          response.status,
        );
      }

      const result = (await response.json()) as {
        html: string;
        finalUrl: string;
        meta: HeadlessMeta;
      };

      // 挑战/登录 meta：转换为可路由错误，上层据此升级 L3 手动协助
      if (result.meta === "challenge" || result.meta === "login_required") {
        throw new FetchError(
          result.meta === "challenge"
            ? "页面触发人机验证，需手动打开完成验证"
            : "页面需要登录，请手动打开后继续",
          "FETCH_HTTP",
        );
      }

      return {
        html: result.html,
        finalUrl: result.finalUrl || url,
        level: this.level,
      };
    } catch (error) {
      if (error instanceof FetchError) throw error;
      if (controller.signal.aborted) {
        throw new FetchError("动态渲染超时", "FETCH_TIMEOUT");
      }
      if (error instanceof TypeError) {
        throw new FetchError("本地渲染服务不可达", "FETCH_NETWORK");
      }
      throw new FetchError(
        error instanceof Error ? error.message : "动态渲染失败",
        "FETCH_NETWORK",
      );
    } finally {
      window.clearTimeout(timeout);
    }
  }
}
