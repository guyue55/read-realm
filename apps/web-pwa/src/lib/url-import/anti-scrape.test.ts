import { describe, it, expect } from "vitest";
import {
  detectBlockedPage,
  isJsChallengePage,
  isLoginOrPaywallPage,
  normalizeRedirect,
  antiScrapeToErrorCode,
  isUsableContent,
} from "./anti-scrape";

describe("anti-scrape 识别层", () => {
  it("识别登录/付费墙页面", () => {
    const html =
      "<html><body>本书为VIP章节，请登录后阅读。请先登录查看完整内容。</body></html>";
    const result = detectBlockedPage(html);
    expect(result?.kind).toBe("login_paywall");
    expect(isLoginOrPaywallPage(html)).toBe(true);
    expect(antiScrapeToErrorCode("login_paywall")).toBe(
      "SOURCE_LOGIN_PAYWALL_REQUIRED",
    );
  });

  it("识别 Cloudflare / JS 挑战页面", () => {
    const html =
      '<html><body><div id="cf-chl-container">Checking your browser before accessing...</div></body></html>';
    const result = detectBlockedPage(html);
    expect(result?.kind).toBe("js_challenge");
    expect(isJsChallengePage(html)).toBe(true);
    expect(antiScrapeToErrorCode("js_challenge")).toBe(
      "URL_DYNAMIC_RENDER_REQUIRED",
    );
  });

  it("识别访问频繁/风控页面", () => {
    const html = "<html><body>访问过于频繁，请稍后再试。验证码已发送。</body></html>";
    const result = detectBlockedPage(html);
    expect(result?.kind).toBe("blocked");
    expect(antiScrapeToErrorCode("blocked")).toBe("SOURCE_RATE_LIMITED");
  });

  it("识别动态渲染提示页面", () => {
    const html = "<html><body>请开启 JavaScript 查看内容。</body></html>";
    const result = detectBlockedPage(html);
    expect(result?.kind).toBe("dynamic_render");
  });

  it("正常页面不误判", () => {
    const html = "<html><body><article><h1>第一章</h1><p>正文内容足够长...</p></article></body></html>";
    expect(detectBlockedPage(html)).toBeNull();
  });

  it("normalizeRedirect 只允许 http/https 同协议跳转", () => {
    expect(normalizeRedirect("/next/2", "https://a.example/ch/1")).toBe(
      "https://a.example/next/2",
    );
    expect(normalizeRedirect("javascript:alert(1)", "https://a.example/")).toBeNull();
    expect(normalizeRedirect("#top", "https://a.example/")).toBeNull();
    expect(normalizeRedirect("ftp://x", "https://a.example/")).toBeNull();
  });

  it("isUsableContent 按长度阈值判定", () => {
    expect(isUsableContent("短")).toBe(false);
    expect(isUsableContent("x".repeat(50))).toBe(true);
  });
});
