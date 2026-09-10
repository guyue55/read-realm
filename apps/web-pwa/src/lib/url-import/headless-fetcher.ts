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
import { UrlImportError } from "./errors";

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

      // 挑战/登录 meta：抛 UrlImportError 使编排层直接透传并触发 L3 手动协助
      // （区别于普通 FetchError——后者会继续降级到其他 fetcher 造成无效等待）
      if (result.meta === "challenge" || result.meta === "login_required") {
        throw new UrlImportError(
          result.meta === "challenge"
            ? "页面触发人机验证，需手动打开完成验证"
            : "页面需要登录，请手动打开后继续",
          result.meta === "challenge"
            ? "URL_DYNAMIC_RENDER_REQUIRED"
            : "SOURCE_LOGIN_PAYWALL_REQUIRED",
        );
      }

      return {
        html: result.html,
        finalUrl: result.finalUrl || url,
        level: this.level,
      };
    } catch (error) {
      // UrlImportError 是编排层语义错误（登录/验证码→L3 手动协助），原样透传不包装
      if (error instanceof FetchError || error instanceof UrlImportError) throw error;
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
