import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';
import { assertPublicUrl } from './public-url.guard';

/**
 * @file headless-fetch.service.ts
 * @description L2 headless 渲染服务：用真实浏览器执行 JS，攻克动态渲染/Cloudflare 页面。
 *
 * 设计：
 * - 通过 puppeteer-core 连接系统 Chrome（executablePath 自动探测），无需下载浏览器内核；
 * - 渲染超时保护（默认 30s）+ 并发上限（默认 2，防资源耗尽）；
 * - SSRF 守门前置（复用 assertPublicUrl），不渲染内网/本机地址；
 * - Chrome 缺失 / 渲染失败 / 挑战未过时优雅降级，返回明确的 meta 供前端升级 L3。
 */

/** 渲染超时（毫秒） */
const RENDER_TIMEOUT_MS = 30_000;
/** 页面加载后额外等待 JS 渲染的时长（毫秒） */
const SETTLE_DELAY_MS = 1_500;
/** 并发渲染上限 */
const MAX_CONCURRENT_RENDERS = 2;
/** 渲染结果大小上限（字节，10MB） */
const MAX_RENDER_BYTES = 10 * 1024 * 1024;

/** 常见 Chrome 可执行路径（macOS / Linux） */
const CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

export type HeadlessRenderMeta =
  | 'ok'
  | 'challenge'
  | 'timeout'
  | 'login_required'
  | 'no_browser';

export interface HeadlessFetchResult {
  html: string;
  finalUrl: string;
  meta: HeadlessRenderMeta;
}

@Injectable()
export class HeadlessFetchService {
  private readonly logger = new Logger(HeadlessFetchService.name);

  /** 并发计数（本进程内信号量） */
  private activeRenders = 0;

  /**
   * 渲染 URL 并返回渲染后的 HTML。
   * @throws BadRequestException 当 SSRF 拒绝或渲染失败且无降级路径时
   */
  async render(rawUrl: string): Promise<HeadlessFetchResult> {
    const url = await assertPublicUrl(rawUrl);

    // 并发上限保护
    if (this.activeRenders >= MAX_CONCURRENT_RENDERS) {
      throw new BadRequestException('渲染服务繁忙，请稍后再试');
    }

    const executablePath = this.findChrome();
    if (!executablePath) {
      // 无浏览器内核：明确降级，前端据此提示用户手动协助
      this.logger.warn('未检测到可用的 Chrome 内核，headless 渲染不可用');
      throw new BadRequestException(
        '未检测到本机浏览器内核，无法动态渲染该页面',
      );
    }

    this.activeRenders += 1;
    try {
      return await this.renderWithBrowser(url, executablePath);
    } finally {
      this.activeRenders -= 1;
    }
  }

  /** 探测系统 Chrome 可执行路径 */
  private findChrome(): string | null {
    const found = CHROME_PATHS.find((path) => existsSync(path));
    return found ?? null;
  }

  /** 用 puppeteer 渲染页面 */
  private async renderWithBrowser(
    url: string,
    executablePath: string,
  ): Promise<HeadlessFetchResult> {
    let browser: import('puppeteer-core').Browser | null = null;
    try {
      browser = await puppeteer.launch({
        executablePath,
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-extensions',
          '--window-size=1280,800',
        ],
      });
      const page = await browser.newPage();
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      );
      await page.setExtraHTTPHeaders({
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.7',
      });

      try {
        await page.goto(url, {
          waitUntil: 'networkidle2',
          timeout: RENDER_TIMEOUT_MS,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        // 导航超时/失败但页面可能已有内容：记录后仍尝试提取当前页面内容
        this.logger.warn(`headless 导航异常: ${message}`);
        if (!(error instanceof Error && /timeout|Timeout/i.test(message))) {
          throw new BadRequestException('页面渲染失败，请稍后重试');
        }
      }

      // 等待 JS 异步渲染完成（动态内容填充）
      await new Promise((resolve) => setTimeout(resolve, SETTLE_DELAY_MS));

      const finalUrl = page.url();
      const html = await page.content();

      // 判定渲染结果类型
      const meta = this.classify(html);

      if (html.length > MAX_RENDER_BYTES) {
        throw new BadRequestException('页面渲染结果超过大小上限');
      }

      return { html, finalUrl, meta };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`headless 渲染异常: ${String(error)}`);
      throw new BadRequestException('页面渲染失败，请稍后重试');
    } finally {
      if (browser) {
        await browser.close().catch(() => undefined);
      }
    }
  }

  /** 基于渲染后 HTML 分类：挑战 / 登录 / 正常 */
  private classify(html: string): HeadlessRenderMeta {
    const sample = html.slice(0, 5000).toLowerCase();
    if (
      sample.includes('cf-chl') ||
      sample.includes('challenge-platform') ||
      sample.includes('captcha') ||
      sample.includes('hcaptcha') ||
      sample.includes('turnstile')
    ) {
      return 'challenge';
    }
    if (
      sample.includes('login') ||
      sample.includes('sign in') ||
      sample.includes('请先登录') ||
      sample.includes('需要登录')
    ) {
      return 'login_required';
    }
    return 'ok';
  }
}
