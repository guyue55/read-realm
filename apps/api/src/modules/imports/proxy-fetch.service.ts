import { BadRequestException, Injectable } from '@nestjs/common';
import {
  assertPublicUrl,
  fetchPublicHtml,
  type PublicFetchResult,
} from './public-url.guard';

/**
 * @file proxy-fetch.service.ts
 * @description L1 静态抓取网络桥服务。
 *
 * 职责：仅做"URL → HTML"的静态抓取，不参与任何解析（解析由前端完成）。
 * 在 fetchPublicHtml（SSRF 守门 + 重定向 + 大小上限 + 反爬检测）之上，增加：
 * - 服务级节流：防止高频导入触发目标站风控或拖垮本机；
 * - 重试退避：网络抖动/5xx 时自动重试。
 */

/** 节流窗口（毫秒）：1 分钟 */
const RATE_WINDOW_MS = 60_000;
/** 每窗口最大抓取次数 */
const MAX_REQUESTS_PER_WINDOW = 30;
/** 重试最大次数（不含首次） */
const MAX_RETRIES = 2;
/** 重试基础延迟（毫秒） */
const RETRY_BASE_DELAY_MS = 400;

/** 可重试的 HTTP 状态码（临时性错误） */
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

@Injectable()
export class ProxyFetchService {
  /** 节流状态：窗口起点与已用次数 */
  private windowStart = Date.now();
  private requestCount = 0;

  /**
   * 静态抓取 URL，返回 HTML 与最终 URL。
   * 带节流与重试退避；失败抛 BadRequestException。
   */
  async fetchHtml(rawUrl: string): Promise<PublicFetchResult> {
    const url = await assertPublicUrl(rawUrl);

    // 服务级节流：超出窗口配额直接拒绝（前端会退避后重试）
    if (!this.tryAcquire()) {
      throw new BadRequestException('抓取过于频繁，请稍后再试');
    }

    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        return await fetchPublicHtml(url);
      } catch (error) {
        lastError = error;
        // 仅对可重试的 HTTP 状态重试；SSRF/参数类错误直接抛出
        if (error instanceof BadRequestException) {
          const status = this.extractStatus(error);
          if (status === null || !RETRYABLE_STATUS.has(status)) throw error;
        }
        if (attempt < MAX_RETRIES) {
          const delay = RETRY_BASE_DELAY_MS * 2 ** attempt;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    if (lastError instanceof BadRequestException) throw lastError;
    throw new BadRequestException('页面请求失败或超时，请稍后重试');
  }

  /** 从 BadRequestException 中提取 HTTP 状态码（消息格式 "HTTP xxx"） */
  private extractStatus(error: BadRequestException): number | null {
    const match = /HTTP\s+(\d{3})/.exec(error.message);
    return match ? Number(match[1]) : null;
  }

  /** 滑动窗口节流：窗口内未超配额返回 true */
  private tryAcquire(): boolean {
    const now = Date.now();
    if (now - this.windowStart >= RATE_WINDOW_MS) {
      this.windowStart = now;
      this.requestCount = 0;
    }
    if (this.requestCount >= MAX_REQUESTS_PER_WINDOW) return false;
    this.requestCount += 1;
    return true;
  }
}
