/**
 * @file anti-scrape.ts
 * @description URL 导入的反爬/页面识别层（纯函数，无 DOM 依赖，可单测）。
 *
 * 职责：对抓取到的页面（HTML 或纯文本）做分类判定——
 *   - 反爬/风控页（验证码、限流、人机验证、付费墙、登录墙）
 *   - JS 挑战页（Cloudflare / "checking your browser" 等）
 *   - 登录/付费墙页（需要用户手动协助）
 *   - 重定向白名单校验
 *
 * 这些判定全部基于字符串/正则，不依赖浏览器环境，可在 Node 单测。
 */

/**
 * 常见反爬/风控/拦截页特征。
 * 与后端 url-import.service.ts 的 blockedPagePattern 保持一致，并做保守扩展。
 */
const blockedPagePattern =
  /(验证码|访问过于频繁|安全验证|人机验证|访问异常|请求过于频繁|您的请求过于频繁|登录后(?:阅读|查看)|会员专享|付费阅读|订阅后|vip章节|请先登录|需要登录|请开启\s*javascript|enable javascript|checking your browser|just a moment|access denied|forbidden|sign in to continue|log in to continue|paywall|subscribe to read|内容审核中|页面不存在|404 not found)/i;

/**
 * JS 挑战页特征（Cloudflare 等）。
 * 这类页面静态 HTML 拿不到正文，需要 headless 渲染或手动协助。
 */
const jsChallengePattern =
  /(cf-chl|challenge-platform|cloudflare|__cf_chl|checking your browser|just a moment|enable javascript and cookies|请开启javascript|captcha|turnstile|hcaptcha|recaptcha)/i;

/**
 * 登录/付费墙页特征。
 * 识别后应引导用户手动完成，而非静默绕过。
 */
const loginOrPaywallPattern =
  /(登录后(?:阅读|查看)|请先登录|需要登录|会员专享|付费阅读|订阅后|vip章节|sign in|log in|login required|paywall|subscribe to read|购买章节|需购买)/i;

/** 动态渲染提示特征：页面提示开启 JS 才能看到内容（非挑战，而是纯 JS 渲染） */
const dynamicRenderPattern =
  /(请开启\s*javascript|enable javascript|页面加载中|loading\.\.\.|内容由js渲染|动态加载|异步加载)/i;

/**
 * 判定页面是否为反爬/风控拦截页。
 *
 * @param text 页面纯文本（通常取前 N 字符即可）
 * @returns 命中时返回分类码，否则返回 null
 */
export function detectBlockedPage(text: string): {
  kind: "blocked" | "js_challenge" | "login_paywall" | "dynamic_render";
  matched: string;
} | null {
  const sample = text.slice(0, 3000);
  // 动态渲染提示（"请开启 JS"纯渲染提示）优先于反爬判定：
  // 这类页面不是反爬拦截，而是内容由 JS 渲染，应走 headless 升级而非放弃。
  if (
    dynamicRenderPattern.test(sample) &&
    !loginOrPaywallPattern.test(sample) &&
    !jsChallengePattern.test(sample)
  ) {
    return {
      kind: "dynamic_render",
      matched: sample.match(dynamicRenderPattern)?.[0] ?? "",
    };
  }
  if (loginOrPaywallPattern.test(sample)) {
    return { kind: "login_paywall", matched: sample.match(loginOrPaywallPattern)?.[0] ?? "" };
  }
  if (jsChallengePattern.test(sample)) {
    return { kind: "js_challenge", matched: sample.match(jsChallengePattern)?.[0] ?? "" };
  }
  if (blockedPagePattern.test(sample)) {
    return { kind: "blocked", matched: sample.match(blockedPagePattern)?.[0] ?? "" };
  }
  return null;
}

/**
 * 判定页面是否为 JS 挑战页（Cloudflare 等）。
 * 便捷包装，供上层直接判断是否需要 headless 升级。
 */
export function isJsChallengePage(text: string): boolean {
  return detectBlockedPage(text)?.kind === "js_challenge";
}

/**
 * 判定页面是否为登录/付费墙页。
 * 便捷包装，供上层触发"手动协助"流程。
 */
export function isLoginOrPaywallPage(text: string): boolean {
  return detectBlockedPage(text)?.kind === "login_paywall";
}

/**
 * 校验跳转目标 URL 是否允许跟随。
 * 仅允许 http/https；禁止 javascript:、data: 等危险协议。
 *
 * @param href 原始 href（可能是相对路径）
 * @param baseUrl 当前页面 URL（用于解析相对路径）
 * @returns 合法绝对 URL 字符串；非法返回 null
 */
export function normalizeRedirect(href: string, baseUrl: string): string | null {
  if (!href || href.startsWith("javascript:") || href.startsWith("#"))
    return null;
  try {
    const url = new URL(href, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * 判定页面正文是否"可用"（长度阈值）。
 * 低于阈值视为未提取到有效正文。
 */
export function isUsableContent(text: string, minLength = 40): boolean {
  return text.length >= minLength;
}

/**
 * 反爬错误码，供上层编排层映射为用户可读提示。
 */
export type AntiScrapeKind =
  | "blocked"
  | "js_challenge"
  | "login_paywall"
  | "dynamic_render";

/**
 * 将识别结果映射为稳定的错误码（用于导入任务状态机与用户提示）。
 */
export function antiScrapeToErrorCode(kind: AntiScrapeKind): string {
  switch (kind) {
    case "blocked":
      return "SOURCE_RATE_LIMITED";
    case "js_challenge":
      return "URL_DYNAMIC_RENDER_REQUIRED";
    case "login_paywall":
      return "SOURCE_LOGIN_PAYWALL_REQUIRED";
    case "dynamic_render":
      return "URL_DYNAMIC_RENDER_REQUIRED";
    default:
      return "URL_PARSE_FAILED";
  }
}
